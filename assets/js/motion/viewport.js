

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) root.StableViewport = api.start(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var REST_MS = 200;

  var KNOWN_RESIZER = /FxiOS\//;

  function nextHeights(cur, v, toolbarDevice) {
    var unitsMoved = v.l !== cur.seenL || v.s !== cur.seenS;

    if (v.w !== cur.w || (unitsMoved && !toolbarDevice)) {
      return { w: v.w, l: v.l, s: v.s, pin: false };
    }

    if (unitsMoved) {
      return { w: cur.w, l: Math.max(cur.l, v.l), s: Math.min(cur.s, v.s), pin: true };
    }

    return null;
  }

  function start(win) {
    var doc = win.document, rootEl = doc.documentElement;
    var coarse = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);

    function toolbarDevice() {
      if (KNOWN_RESIZER.test(win.navigator.userAgent)) return true;
      if (!coarse) return false;
      var sw = win.screen && win.screen.width;
      return !(sw > 0 && win.innerWidth < sw - 1);
    }

    function probe(unit) {
      var el = doc.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100' + unit +
        ';visibility:hidden;pointer-events:none;';
      (doc.body || rootEl).appendChild(el);
      return el;
    }
    var lvhProbe = probe('lvh'), svhProbe = probe('svh');
    function live() {
      var ih = win.innerHeight;
      return { w: win.innerWidth, l: lvhProbe.offsetHeight || ih, s: svhProbe.offsetHeight || ih };
    }

    var first = live();
    var cur = { w: first.w, l: first.l, s: first.s, seenL: first.l, seenS: first.s };
    var pinned = false, pending = null;

    function memoKey() { return 'stable-vh:' + win.screen.width + 'x' + win.screen.height + ':' + cur.w; }
    function recall() {
      try { return parseFloat(win.localStorage.getItem(memoKey())) || 0; } catch (e) { return 0; }
    }
    function remember() {
      if (cur.l <= recall()) return;
      try { win.localStorage.setItem(memoKey(), String(cur.l)); } catch (e) {   }
    }

    function writeVars() {
      rootEl.style.setProperty('--vh', (cur.l / 100) + 'px');
      rootEl.style.setProperty('--svh', (cur.s / 100) + 'px');
    }
    function pin() {
      if (pinned) return;
      pinned = true;
      var known = recall();
      if (known > cur.l && known <= win.screen.height) cur.l = known;
      writeVars();
    }
    if (KNOWN_RESIZER.test(win.navigator.userAgent)) pin();

    var realInput = false, touches = 0, lastMove = -Infinity, restTimer = 0;
    var queue = [], changeFns = [], afterFns = [], providers = [], restFns = [];
    var quietUntil = 0;
    var wrote = false;
    function now() { return win.performance ? win.performance.now() : Date.now(); }
    function moving() { return realInput && (touches > 0 || now() - lastMove < REST_MS); }
    function armRest() {
      clearTimeout(restTimer);
      restTimer = setTimeout(function () { if (moving()) armRest(); else flush(true); }, REST_MS);
    }
    function onMove() {
      if (now() < quietUntil) return;
      lastMove = now();
      if (queue.length || pending || restFns.length) armRest();
    }
    function trusted(e) { if (e.isTrusted) { realInput = true; wrote = false; } }
    function onTouch(e) { if (e.type === 'touchstart') trusted(e); touches = e.touches.length; onMove(); }
    var cap = { passive: true, capture: true };
    win.addEventListener('touchstart', onTouch, cap);
    win.addEventListener('touchend', onTouch, cap);
    win.addEventListener('touchcancel', onTouch, cap);
    win.addEventListener('wheel', function (e) { trusted(e); onMove(); }, cap);
    win.addEventListener('keydown', trusted, true);
    win.addEventListener('scroll', onMove, { passive: true });

    win.addEventListener('scrollend', function () {
      if (wrote) { wrote = false; return; }
      if (touches === 0 && (queue.length || pending || restFns.length)) { lastMove = -Infinity; flush(true); }
    });

    function captureAnchor() {
      var a = null;
      var main = doc.querySelector('main') || doc.body;
      var mid = win.innerHeight / 2, kids = main.children;
      for (var i = 0; i < kids.length; i++) {
        var r = kids[i].getBoundingClientRect();
        if (r.height > 0 && r.top <= mid && r.bottom > mid) {
          a = { el: kids[i], frac: (mid - r.top) / r.height, mid: mid };
          break;
        }
      }
      for (var p = 0; p < providers.length; p++) {
        var place = providers[p].read();
        if (place != null) {
          a = a || {};
          a.provider = providers[p]; a.place = place;
          break;
        }
      }
      return a;
    }
    function restoreAnchor(a) {
      if (!a) return;
      var dy;
      if (a.provider && providers.indexOf(a.provider) !== -1) {
        dy = a.provider.scrollY(a.place) - win.scrollY;
      } else if (a.el && a.el.isConnected) {
        var r = a.el.getBoundingClientRect();
        dy = (r.top + a.frac * r.height) - a.mid;
      } else return;
      if (isFinite(dy) && Math.abs(dy) >= 0.5) write(win.scrollY + dy);
      if (a.provider && a.provider.settled && providers.indexOf(a.provider) !== -1) a.provider.settled();
    }

    function write(y) {
      var prev = rootEl.style.scrollBehavior;
      rootEl.style.scrollBehavior = 'auto';
      quietUntil = now() + 50;
      wrote = true;
      win.scrollTo(win.scrollX, y);
      rootEl.style.scrollBehavior = prev;
    }

    function flush(edge) {
      clearTimeout(restTimer);
      if (pending || queue.length) {
        var anchor = realInput ? captureAnchor() : null, changed = !!pending;
        if (pending) {
          cur.w = pending.w; cur.l = pending.l; cur.s = pending.s;
          pending = null;
          if (pinned) { writeVars(); remember(); }
          changeFns.slice().forEach(function (fn) { fn(); });
        }
        var run = queue; queue = [];
        run.forEach(function (fn) { fn(); });
        restoreAnchor(anchor);

        if (changed) afterFns.slice().forEach(function (fn) { fn(); });
      }
      if (edge && realInput) restFns.slice().forEach(function (fn) { fn(); });
    }

    function onResize() {
      var v = live();
      var next = nextHeights(cur, v, toolbarDevice());
      cur.seenL = v.l; cur.seenS = v.s;
      if (!next) return;
      if (next.pin) pin();
      if (next.w === cur.w && next.l === cur.l && next.s === cur.s) { pending = null; return; }
      pending = next;

      armRest();
    }
    win.addEventListener('resize', onResize);
    if (win.visualViewport) win.visualViewport.addEventListener('resize', onResize);

    return {
      large: function () { return cur.l; },
      small: function () { return cur.s; },
      moving: moving,
      write: write,
      settle: function (fn) {
        if (!realInput) { fn(); return; }
        if (queue.indexOf(fn) === -1) queue.push(fn);
        if (moving()) armRest(); else flush();
      },
      anchor: function (provider) {
        providers.push(provider);
        return function () {
          var i = providers.indexOf(provider);
          if (i !== -1) providers.splice(i, 1);
        };
      },
      onChange: function (fn) {
        changeFns.push(fn);
        return function () {
          var i = changeFns.indexOf(fn);
          if (i !== -1) changeFns.splice(i, 1);
        };
      },
      afterChange: function (fn) {
        afterFns.push(fn);
        return function () {
          var i = afterFns.indexOf(fn);
          if (i !== -1) afterFns.splice(i, 1);
        };
      },
      armed: function () { return realInput; },
      onRest: function (fn) {
        restFns.push(fn);
        return function () {
          var i = restFns.indexOf(fn);
          if (i !== -1) restFns.splice(i, 1);
        };
      }
    };
  }

  return { nextHeights: nextHeights, start: start, REST_MS: REST_MS };
});
