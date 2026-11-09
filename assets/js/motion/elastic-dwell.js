

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ElasticDwell = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var DEFAULTS = {
    TRIM_MS: 800,
    KEEP_VH: 0.15,
    CATCH_V: 1200,
    BACK_VH: 0.25,
    REACH: 1,
    GLIDE_MS: 600,
    CALM_V: 1800,
    CALM_OFF_V: 900,
    LAND_FRAC: 0.25
  };
  var SPAN_MS = 48;

  function velocityTracker() {
    var pts = [], v = 0;
    return {
      sample: function (y, t) {
        pts.push([y, t]);
        while (pts.length > 2 && t - pts[1][1] >= SPAN_MS) pts.shift();
        var dt = t - pts[0][1];
        if (dt > 0) v = (y - pts[0][0]) / dt * 1000;
        return v;
      },
      value: function () { return v; },
      reset: function () { pts = []; v = 0; }
    };
  }

  function windowAt(sw, frac) {
    var n = sw.bounds.length - 1, k = n - 1;
    for (var w = 0; w < n; w++) if (frac < sw.bounds[w + 1]) { k = w; break; }
    return windowOf(sw, k);
  }
  function windowOf(sw, k) {
    var b0 = sw.bounds[k], b1 = sw.bounds[k + 1];
    return { k: k, b0: b0, b1: b1, panDone: b0 + (sw.shares[k] || 0) * (b1 - b0) };
  }

  function trimTarget(place, win, still, keepFrac, dir) {
    if (!place || place.type !== 'hold' || !still) return null;
    if (place.frac < win.panDone) return null;
    if (dir < 0) {
      var back = win.panDone + keepFrac;
      return back < place.frac - 1e-4 ? back : null;
    }
    var target = win.b1 - keepFrac;
    return target > place.frac + 1e-4 ? target : null;
  }

  function beatsAround(beats, place) {
    var above = null, below = null;
    for (var n = 0; n < beats.length; n++) {
      var b = beats[n];
      if (b.s === place.s && place.frac >= b.panDone && place.frac < b.b1) return { on: b };
      if (b.s < place.s || (b.s === place.s && b.b1 <= place.frac)) above = b;
      else if (!below) below = b;
    }
    return { above: above, below: below };
  }

  function landFrac(win, landQ, fromBelow) {
    var d = win.b1 - win.panDone;
    return fromBelow ? win.b1 - landQ * d : Math.min(0.98, win.panDone + landQ * d);
  }

  function catchTarget(around, dir, y, yOf, backPx, reachPx) {
    if (!around || around.on) return null;
    var reach = reachPx == null ? Infinity : reachPx;
    var ahead = dir > 0 ? around.below : around.above;
    var behind = dir > 0 ? around.above : around.below;
    var a = ahead && { beat: ahead, y: yOf(ahead, dir < 0) };
    var b = behind && { beat: behind, y: yOf(behind, dir > 0) };
    if (a && Math.abs(a.y - y) > reach) a = null;
    if (b && Math.abs(b.y - y) <= Math.min(backPx, reach) && (!a || Math.abs(b.y - y) < Math.abs(a.y - y))) return b;
    return a || null;
  }

  function create(ctx) {

    var K = Object.assign({}, DEFAULTS);
    try {
      var over = typeof localStorage !== 'undefined' && localStorage.getItem('dwellKnobs');
      if (over) Object.assign(K, JSON.parse(over));
    } catch (e) {   }
    var section = ctx.section, viewport = ctx.viewport;
    var vel = velocityTracker();
    var peak = 0;
    var origin = null;
    var dir = 1;
    var touched = false;
    var fast = false;
    var trimTimer = 0, glideRaf = 0, offRest = null;
    var reduce = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)');

    function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
    function winOf(place) { return windowAt(ctx.windows(place.stop), place.frac); }

    function tick(place, scrolledPx) {
      if (!touched || !viewport.armed() || glideRaf) return;
      var v = vel.sample(scrolledPx, now());
      if (v) dir = v > 0 ? 1 : -1;
      if (Math.abs(v) > Math.abs(peak)) peak = v;
      calm(fast ? Math.abs(v) >= K.CALM_OFF_V : Math.abs(v) >= K.CALM_V);
    }

    function calm(next) {
      if (next === fast) return;
      fast = next;
      section.classList.toggle('wt-fast', fast);
    }

    function onInput(e) {
      if (e && e.type === 'touchstart') touched = true;
      peak = 0;
      origin = window.scrollY;
      if (glideRaf) { window.cancelAnimationFrame(glideRaf); glideRaf = 0; }
    }

    function beats() {
      var out = [];
      for (var i = 0, s; (s = ctx.holdSeg(i)) >= 0; i++) {
        var sw = ctx.windows(i);
        for (var k = 0; k < sw.bounds.length - 1; k++) {
          var w = windowOf(sw, k);
          out.push({ i: i, k: k, s: s, panDone: w.panDone, b1: w.b1 });
        }
      }
      return out;
    }

    function glide(y, done) {
      var y0 = window.scrollY, dy = y - y0, t0 = -1;
      var ms = Math.min(K.GLIDE_MS, 280 + Math.abs(dy) * 0.4);
      var ease = window.WalkthroughShared.smoothStep;
      function frame() {
        var tn = now();
        if (t0 < 0) t0 = tn;
        var t = Math.min(1, (tn - t0) / ms);
        viewport.write(y0 + dy * ease(t));
        if (t < 1) { glideRaf = window.requestAnimationFrame(frame); return; }
        glideRaf = 0;
        vel.reset();
        origin = window.scrollY;
        done();
      }
      glideRaf = window.requestAnimationFrame(frame);
    }

    function onRest() {
      if (glideRaf || !touched) return;

      vel.reset();
      calm(false);
      var fling = peak; peak = 0;

      var y = window.scrollY;
      var travel = origin == null ? Infinity : Math.abs(y - origin);
      origin = y;
      var place = ctx.place();
      if (!place) return;
      if (!(reduce && reduce.matches) && Math.abs(fling) >= K.CATCH_V &&
          (place.type === 'hold' || place.type === 'transit')) {
        var around = beatsAround(beats(), place), sign = fling > 0 ? 1 : -1;
        var yOf = function (b, fromBelow) {
          return ctx.scrollY({ s: b.s, frac: landFrac(b, K.LAND_FRAC, fromBelow) });
        };
        var backPx = K.BACK_VH * ctx.vpH();
        var to = catchTarget(around, sign, y, yOf, backPx, K.REACH * travel);
        if (!to && catchTarget(around, sign, y, yOf, backPx)) {
          ctx.note('catch: held, the next beat is past the gesture\'s ' + Math.round(travel) + 'px');
        }
        if (to && Math.abs(to.y - y) >= 1) {
          ctx.note('catch: ' + Math.round(to.y - y) + 'px to stop ' + to.beat.i + '.' + to.beat.k +
            ' (fling ' + Math.round(fling) + ' px/s)');
          glide(to.y, armTrim);
          return;
        }
      }
      armTrim();
    }

    function armTrim() {
      clearTimeout(trimTimer);
      var place = ctx.place();
      var at = place ? { s: place.s, frac: place.frac } : null;
      if (!at) return;
      trimTimer = setTimeout(function () {

        if (viewport.moving()) { ctx.note('trim: still moving'); return; }
        var cur = ctx.place();
        if (!cur || cur.s !== at.s || Math.abs(cur.frac - at.frac) > 1e-3) { ctx.note('trim: moved'); return; }
        if (cur.type !== 'hold') return;
        var w = winOf(cur);
        var holdPx = ctx.scrollY({ s: cur.s, frac: 1 }) - ctx.scrollY({ s: cur.s, frac: 0 });
        var keep = holdPx > 0 ? (K.KEEP_VH * ctx.vpH()) / holdPx : 0;
        var plain = ctx.still(cur.stop, w.k);
        var target = trimTarget(cur, w, plain, keep, dir);
        if (target == null) {
          if (cur.frac < w.panDone) ctx.note('trim: stop ' + cur.stop + '.' + w.k + ' still arriving');
          else if (!plain) ctx.note('trim: stop ' + cur.stop + '.' + w.k + ' is not plain');
          else ctx.note('trim: stop ' + cur.stop + '.' + w.k + ' has < KEEP_VH left');
          return;
        }
        var y = ctx.scrollY({ s: cur.s, frac: target }), dy = Math.round(y - window.scrollY);
        if (Math.abs(dy) < 1) return;
        ctx.note('trim: ' + (dy > 0 ? '+' + dy + 'px past' : dy + 'px back on') + ' stop ' + cur.stop + '.' + w.k);
        viewport.write(y);
        origin = y;
      }, K.TRIM_MS);
    }

    var INPUTS = ['touchstart', 'wheel', 'keydown'], inputOpts = { passive: true, capture: true };
    offRest = viewport.onRest(onRest);
    INPUTS.forEach(function (type) { window.addEventListener(type, onInput, inputOpts); });

    function destroy() {
      clearTimeout(trimTimer);
      if (glideRaf) window.cancelAnimationFrame(glideRaf);
      glideRaf = 0;
      if (offRest) offRest();
      INPUTS.forEach(function (type) { window.removeEventListener(type, onInput, inputOpts); });
      calm(false);
    }

    return { tick: tick, destroy: destroy, knobs: K };
  }

  return {
    create: create, DEFAULTS: DEFAULTS,
    velocityTracker: velocityTracker, windowAt: windowAt, trimTarget: trimTarget,
    beatsAround: beatsAround, landFrac: landFrac, catchTarget: catchTarget
  };
});
