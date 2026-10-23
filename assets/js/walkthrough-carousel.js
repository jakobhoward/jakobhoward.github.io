

(function () {
  'use strict';
  var DWELL_MS = 4500;
  var SWIPE_FRAC = 0.12;
  var SWIPE_MIN_PX = 24;
  var WHEEL_STEP_PX = 40;
  var WHEEL_QUIET_MS = 200;

  var VISIBLE = 0.3;
  var debugLog = window.WalkthroughShared.debugLog;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function bind(root) {
    var block = root.parentNode;
    var strip = root.querySelector('.igg-carousel-strip');
    var fade = root.classList.contains('igg-carousel--fade');
    var frames = strip.children;
    var count = Number(root.getAttribute('data-slides')) || (fade ? frames.length : frames.length - 1);
    var states = block.querySelectorAll('.igg-carousel-state img');
    var navs = block.querySelectorAll('.igg-carousel-nav');
    var dwell = Number(root.getAttribute('data-carousel-dwell')) || DWELL_MS;
    var autoplay = root.getAttribute('data-autoplay') !== 'off';
    var swipe = root.getAttribute('data-swipe') !== 'off';
    var index = 0;
    var timer = 0;
    var visible = false;

    function current() { return ((index % count) + count) % count; }

    function paint(animate) {
      root.classList.toggle('is-moving', !!animate && !reduced);
      if (fade) {
        for (var f = 0; f < frames.length; f++) frames[f].classList.toggle('is-current', f === current());
      } else {
        root.style.setProperty('--car-i', index);
      }
      var k = current();
      for (var s = 0; s < states.length; s++) states[s].style.transform = 'translateY(' + (-100 * k / count) + '%)';
      for (var b = 0; b < navs.length; b++) {
        if (navs[b].hasAttribute('data-hide-on-first')) navs[b].hidden = k === 0;
        if (navs[b].hasAttribute('data-hide-on-last')) navs[b].hidden = k === count - 1;
        if (navs[b].hasAttribute('data-goto')) navs[b].setAttribute('aria-pressed', String(Number(navs[b].getAttribute('data-goto')) === k));
      }
    }

    function settle(i) {
      index = i;
      paint(false);
      void strip.offsetWidth;
    }

    function go(delta) {
      if (!fade) {
        if (index >= count) settle(index - count);
        if (delta < 0 && index === 0) settle(count);
      }
      index = fade ? (index + delta + count) % count : index + delta;
      paint(true);
      debugLog('walkthrough-carousel', 'slide', current() + 1, 'of', count);
    }

    strip.addEventListener('transitionend', function (e) {
      if (e.target !== strip || fade || index < count) return;
      settle(0);
    });

    function stop() { if (timer) { clearInterval(timer); timer = 0; } }
    function run() {
      var go_ = autoplay && visible && !document.hidden && !reduced;
      if (go_ && !timer) timer = setInterval(function () { go(1); }, dwell);
      if (!go_) stop();
    }
    function byHand(delta) { stop(); go(delta); run(); }

    for (var n = 0; n < navs.length; n++) {
      navs[n].addEventListener('click', function (e) {
        e.preventDefault();
        if (this.hasAttribute('data-goto')) {
          var delta = Number(this.getAttribute('data-goto')) - current();
          if (delta) byHand(delta);
        } else {
          byHand(Number(this.getAttribute('data-step')) < 0 ? -1 : 1);
        }
      });
    }

    var drag = null;
    root.addEventListener('pointerdown', function (e) {
      if (!swipe || e.pointerType === 'mouse' || e.button !== 0 || drag) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, live: false,
        scale: root.getBoundingClientRect().width / (root.offsetWidth || 1) };
    });
    root.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.live) {
        if (Math.abs(dx) < 6) return;
        if (Math.abs(e.clientY - drag.y) > Math.abs(dx)) { drag = null; return; }
        drag.live = true;
        stop();
        if (!fade && index >= count) settle(index - count);
        root.classList.add('is-dragging');
        try { root.setPointerCapture(e.pointerId); } catch (err) {   }
      }
      drag.dx = dx;
      if (!fade) root.style.setProperty('--car-drag', (dx / drag.scale) + 'px');
    });
    function release(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      drag = null;
      if (!d.live) return;
      root.classList.remove('is-dragging');
      root.style.removeProperty('--car-drag');
      var far = Math.abs(d.dx) > Math.max(SWIPE_MIN_PX, SWIPE_FRAC * root.getBoundingClientRect().width);
      if (far && e.type === 'pointerup') byHand(d.dx < 0 ? 1 : -1);
      else { paint(true); run(); }
    }
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);

    root.addEventListener('dragstart', function (e) { e.preventDefault(); });

    var train = null;
    root.addEventListener('wheel', function (e) {
      if (!swipe || e.ctrlKey) return;
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientWidth : 1;
      var dx = e.deltaX * unit;
      var dy = e.deltaY * unit;
      if (train && e.timeStamp - train.last > WHEEL_QUIET_MS) train = null;
      if (!train) {
        if (Math.abs(dx) <= Math.abs(dy)) return;
        train = { sum: 0, done: false, last: 0 };
      }
      train.last = e.timeStamp;
      e.preventDefault();
      if (train.done) return;
      train.sum += dx;
      if (Math.abs(train.sum) >= WHEEL_STEP_PX) {
        train.done = true;
        byHand(train.sum > 0 ? 1 : -1);
      }
    }, { passive: false });

    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        var now = e.isIntersecting && e.intersectionRatio >= VISIBLE;
        if (now && !visible && !drag) { stop(); settle(0); }
        visible = now;
        run();
      }, { threshold: VISIBLE }).observe(root);
    }
    document.addEventListener('visibilitychange', run);
    root.classList.add('is-live');
    paint(false);
  }

  function init() {
    var roots = document.querySelectorAll('.igg-carousel');
    for (var i = 0; i < roots.length; i++) bind(roots[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
