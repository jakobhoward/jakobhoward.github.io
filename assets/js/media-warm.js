

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MediaWarm = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MAX_INFLIGHT = 2;
  var IDLE_MS = 1200;

  function allowed(nav, matchMedia) {
    var c = nav && nav.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return false;
    if (typeof matchMedia === 'function') {
      var mq = matchMedia('(prefers-reduced-data: reduce)');
      if (mq && mq.matches) return false;
    }
    return true;
  }

  function nearest(items, eye) {
    var best = -1, bestD = Infinity;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var d = it.bottom < eye ? eye - it.bottom : it.top > eye ? it.top - eye : 0;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function fetched(img) { return !!(img.complete && img.naturalWidth > 0); }

  function create(ctx) {
    var queue = Array.prototype.slice.call(ctx.images());
    var inflight = 0, offRest = null, done = false;

    function settled() { inflight--; pump(); }

    function promote(img, dist) {
      inflight++;
      img.loading = 'eager';
      ctx.log('eager', Math.round(dist) + 'px from the eye line, in flight', inflight, img.currentSrc || img.src);
      var p = typeof img.decode === 'function' ? img.decode() : null;
      if (p && typeof p.then === 'function') p.then(settled, settled);
      else {
        var once = function () {
          img.removeEventListener('load', once);
          img.removeEventListener('error', once);
          settled();
        };
        img.addEventListener('load', once);
        img.addEventListener('error', once);
      }
    }

    function pump() {
      if (done) return;
      while (inflight < MAX_INFLIGHT && queue.length) {
        if (ctx.moving() || ctx.hidden()) { ctx.log('paused', queue.length, 'left'); return; }
        var eye = ctx.eye(), rects = [], live = [];
        for (var i = 0; i < queue.length; i++) {
          var img = queue[i];
          if (fetched(img)) continue;
          var r = img.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          live.push(img);
          rects.push({ top: r.top, bottom: r.bottom });
        }
        queue = live;
        if (!queue.length) break;
        var k = nearest(rects, eye);
        var next = queue.splice(k, 1)[0], rect = rects[k];
        promote(next, rect.bottom < eye ? eye - rect.bottom : rect.top > eye ? rect.top - eye : 0);
      }
      if (!queue.length && !inflight) destroy();
    }

    function destroy() {
      if (done) return;
      done = true;
      if (offRest) offRest();
      ctx.log('done');
    }

    offRest = ctx.onRest(pump);
    return {
      pump: pump,
      pending: function () { return queue.length + inflight; },
      destroy: destroy
    };
  }

  function mount() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var WS = window.WalkthroughShared;
    if (!WS || !allowed(navigator, window.matchMedia)) return;
    var log = function () {
      var args = Array.prototype.slice.call(arguments);
      WS.debugLog.apply(null, ['media-warm'].concat(args));
    };
    var warm = null;

    function start() {
      var vp = WS.viewport;
      warm = create({
        images: function () { return document.querySelectorAll('img[loading="lazy"]'); },
        eye: function () { return window.innerHeight / 2; },
        moving: function () { return typeof vp.moving === 'function' && vp.moving(); },
        hidden: function () { return document.visibilityState === 'hidden'; },
        onRest: function (fn) { return vp.onRest(fn); },
        log: log
      });
      document.addEventListener('visibilitychange', warm.pump);
      log('start', warm.pending(), 'lazy images');
      warm.pump();
    }

    function idle() {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: IDLE_MS * 2 });
      else setTimeout(start, IDLE_MS);
    }

    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle);
  }
  mount();

  return { create: create, allowed: allowed, nearest: nearest, MAX_INFLIGHT: MAX_INFLIGHT };
});
