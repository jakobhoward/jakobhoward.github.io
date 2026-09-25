

(function () {
  'use strict';

  var RATE = 0.22;
  var REF_DT = 16.67;
  var READ_LINE = 0.45;
  var EPS = 0.0002;
  var END_SLACK = 120;

  var doc = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var runways = [];

  var heldByEl = new WeakMap();
  var shownByEl = new WeakMap();

  function scan() {
    runways = [];
    var els = doc.querySelectorAll('[data-draw-runway]');
    Array.prototype.forEach.call(els, function (el) {
      var paths = el.querySelectorAll('path[data-draw]');
      if (!paths.length) return;
      var runway = {
        el: el,
        completeAtBottom: el.hasAttribute('data-draw-complete-at-bottom'),
        top: 0,
        span: 1,
        active: false,
        paths: []
      };
      Array.prototype.forEach.call(paths, function (p) {
        var win = (p.getAttribute('data-draw-window') || '0 1').trim().split(/\s+/);
        var a = parseFloat(win[0]) || 0;
        var b = parseFloat(win[1]);
        if (!isFinite(b)) b = 1;
        if (!p.getAttribute('pathLength')) p.setAttribute('pathLength', '1');
        if (!p.getAttribute('stroke-dasharray')) p.setAttribute('stroke-dasharray', '1 1');
        if (!heldByEl.has(p)) {
          heldByEl.set(p, 0);
          shownByEl.set(p, 0);
          p.setAttribute('stroke-dashoffset', '1');
          p.style.opacity = '0';
        }
        runway.paths.push({ el: p, a: a, b: b });
      });
      runways.push(runway);
    });
    measure();
    if (reduced.matches) settleAll();
    else kick();
  }

  function measure() {
    var sy = window.scrollY;
    runways.forEach(function (r) {
      var rect = r.el.getBoundingClientRect();
      r.active = rect.width > 0 && rect.height > 0;
      r.top = rect.top + sy;
      r.span = Math.max(1, rect.height);
    });
  }

  function settleAll() {
    running = false;
    runways.forEach(function (r) {
      r.paths.forEach(function (p) {
        heldByEl.set(p.el, 1);
        shownByEl.set(p.el, 1);
        p.el.setAttribute('stroke-dashoffset', '0');
        p.el.style.opacity = '1';
      });
    });
  }

  function render(p, s) {
    shownByEl.set(p.el, s);
    p.el.setAttribute('stroke-dashoffset', String(1 - s));
    p.el.style.opacity = s > 0.001 ? '1' : '0';
  }

  var running = false;
  var lastT = 0;

  function frame(now) {
    var dt = Math.min(100, now - lastT);
    lastT = now;
    var factor = 1 - Math.pow(1 - RATE, dt / REF_DT);
    var line = window.scrollY + window.innerHeight * READ_LINE;
    var atBottom = window.scrollY + window.innerHeight >=
      doc.documentElement.scrollHeight - END_SLACK;
    var converged = true;

    runways.forEach(function (r) {
      if (!r.active) return;
      var raw = (line - r.top) / r.span;
      if (r.completeAtBottom && atBottom) raw = 1;
      r.paths.forEach(function (p) {
        var span = p.b - p.a;
        var w = span > 0 ? (raw - p.a) / span : (raw >= p.a ? 1 : 0);
        w = Math.min(1, Math.max(0, w));
        var held = heldByEl.get(p.el);
        if (w > held) { held = w; heldByEl.set(p.el, held); }
        var s = shownByEl.get(p.el);
        if (s === held) return;
        s += (held - s) * factor;
        if (Math.abs(held - s) < EPS) s = held;
        else converged = false;
        render(p, s);
      });
    });

    if (converged) running = false;
    else requestAnimationFrame(frame);
  }

  function kick() {
    if (running || reduced.matches) return;
    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  var lastPageHeight = 0;

  function onScroll() {
    var h = doc.documentElement.scrollHeight;
    if (h !== lastPageHeight) { lastPageHeight = h; measure(); }
    kick();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); kick(); });
  window.addEventListener('load', function () { measure(); kick(); });
  if (reduced.addEventListener) {
    reduced.addEventListener('change', function () {
      if (reduced.matches) settleAll();
    });
  }

  window.PathDraw = { refresh: scan };
  scan();
}());
