

(function (root, factory) {
  var node = typeof module !== 'undefined' && module.exports;
  var dep = node ? require('./elastic-dwell.js') : root.ElasticDwell;
  if (!dep) throw new Error('elastic-dwell.js must load before motion/storyboard-catch.js');
  var api = factory(dep);
  if (node) module.exports = api;
  if (root) root.StoryboardCatch = api;
})(typeof window !== 'undefined' ? window : null, function (ED) {
  'use strict';

  var DEFAULTS = {
    SB_CATCH_V: 1200,
    SB_TAU: 0.6,
    SB_KEEP_VH: 0.15,
    SB_MAX_VH: 4
  };
  var BASE_VH = 2;
  var BURST_MS = 300;

  function holdRange(g) {
    return { pinStart: g.top - g.chrome, release: g.top + g.height - g.stageH - g.chrome };
  }

  function catchHeight(g, y, v, K) {
    if (!(v >= K.SB_CATCH_V)) return null;
    var end = y + v * K.SB_TAU;
    var need = Math.min(end + g.stageH + g.chrome - g.top, g.base + K.SB_MAX_VH * g.small);
    return need > g.height ? need : null;
  }

  function restHeight(g, y, keepPx) {
    var r = holdRange(g);
    if (y < r.pinStart) return { height: g.base, anchored: false };
    if (y <= r.release) return { height: Math.max(g.base, y + g.small + keepPx - g.top), anchored: false };
    return { height: g.base, anchored: true };
  }

  function create(ctx) {
    var K = Object.assign({}, DEFAULTS);
    try {
      var over = typeof localStorage !== 'undefined' && localStorage.getItem('dwellKnobs');
      if (over) Object.assign(K, JSON.parse(over));
    } catch (e) {   }
    var runway = ctx.runway, stage = ctx.stage, viewport = ctx.viewport;
    var vel = ED.velocityTracker();
    var touched = false;
    var fingers = 0;
    var yAtTouch = 0;
    var active = false;
    var caughtAt = -Infinity;

    function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

    function geometry() {
      var small = viewport.small();
      return {
        top: runway.getBoundingClientRect().top + window.scrollY,
        height: runway.offsetHeight,
        stageH: stage.offsetHeight,
        chrome: parseFloat(window.getComputedStyle(stage).top) || 0,
        small: small,
        base: BASE_VH * small
      };
    }

    function onTouch(e) {
      fingers = e.touches ? e.touches.length : 0;
      if (e.type !== 'touchstart') return;
      touched = true;
      yAtTouch = window.scrollY;
      vel.reset();
      trim(', touched');
    }

    function shrinkToBase() {
      if (!active) return;
      var was = runway.offsetHeight;
      runway.style.height = '';
      active = false;
      ctx.note('sb trim: runway ' + Math.round(was) + ' → ' + Math.round(runway.offsetHeight) + 'px (anchored, past the hold)');
    }

    function onScroll() {
      if (!touched || !viewport.armed()) return;
      var t = now(), y = window.scrollY, v = vel.sample(y, t);
      if (active && y > holdRange(geometry()).release) { viewport.settle(shrinkToBase); return; }
      if (fingers > 0 || v < K.SB_CATCH_V || !ctx.pinned()) return;
      if (active && t - caughtAt >= BURST_MS) return;
      var g = geometry(), r = holdRange(g);
      if (yAtTouch >= r.pinStart || y > r.release) return;
      var h = catchHeight(g, y, v, K);
      if (h == null) return;
      runway.style.height = Math.round(h) + 'px';
      if (!active) caughtAt = t;
      active = true;
      ctx.note('sb catch: runway ' + Math.round(g.height) + ' → ' + Math.round(h) + 'px (fling ' + Math.round(v) + ' px/s)');
    }

    function trim(edge) {
      if (!active) return;
      var g = geometry(), y = window.scrollY, r = holdRange(g);
      if (y > r.release) { viewport.settle(shrinkToBase); return; }
      var t = restHeight(g, y, K.SB_KEEP_VH * g.small);
      if (Math.abs(t.height - g.height) < 1) return;
      ctx.note('sb trim: runway ' + Math.round(g.height) + ' → ' + Math.round(t.height) + 'px' +
        (y < r.pinStart ? ' (above the hold' : ' (on the hold') + edge + ')');
      if (t.height <= g.base + 0.5) { runway.style.height = ''; active = false; }
      else runway.style.height = Math.round(t.height) + 'px';
    }

    function onRest() { trim(''); yAtTouch = window.scrollY; }

    function onChange() {
      if (!active) return;
      runway.style.height = '';
      active = false;
    }

    var TOUCH = ['touchstart', 'touchend', 'touchcancel'], opts = { passive: true, capture: true };
    TOUCH.forEach(function (type) { window.addEventListener(type, onTouch, opts); });
    window.addEventListener('scroll', onScroll, { passive: true });
    var offRest = viewport.onRest(onRest), offChange = viewport.onChange(onChange);

    function destroy() {
      TOUCH.forEach(function (type) { window.removeEventListener(type, onTouch, opts); });
      window.removeEventListener('scroll', onScroll);
      if (offRest) offRest();
      if (offChange) offChange();
      if (active) { runway.style.height = ''; active = false; }
    }

    return { destroy: destroy, knobs: K };
  }

  return { create: create, DEFAULTS: DEFAULTS, BASE_VH: BASE_VH,
    holdRange: holdRange, catchHeight: catchHeight, restHeight: restHeight };
});
