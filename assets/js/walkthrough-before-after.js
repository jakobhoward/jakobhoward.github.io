

(function () {
  'use strict';
  var LEAVE_MS = 300;
  var KEY_STEP = 10;
  var debugLog = window.WalkthroughShared.debugLog;

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function bind(layer) {
    var section = layer.closest('.campaign-walkthrough-section');
    if (!section) return;
    var stop = Number(layer.getAttribute('data-ba-stop')) || 0;
    var card = section.querySelectorAll('.walkthrough-annotation')[stop] || null;
    var grip = layer.querySelector('.wt-ba-grip');
    var pos = 0;
    var raf = 0;
    var active = false;
    var heldAt = null;

    function paint(p) {
      pos = Math.max(0, Math.min(100, p));
      layer.style.setProperty('--ba-pos', pos.toFixed(2));
      if (grip) grip.setAttribute('aria-valuenow', String(Math.round(pos)));
    }

    function cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function touch() {
      layer.classList.add('is-touched');
    }

    function tween(to, ms, then) {
      var from = pos;
      var t0 = 0;
      function step(now) {
        if (!t0) t0 = now;
        var t = Math.min(1, (now - t0) / ms);
        paint(from + (to - from) * easeInOutCubic(t));
        if (t < 1) raf = requestAnimationFrame(step);
        else { raf = 0; if (then) then(); }
      }
      raf = requestAnimationFrame(step);
    }

    function arrive() {
      active = true;
      layer.classList.add('is-active');
      cancel();
      paint(heldAt !== null ? heldAt : 0);
      debugLog('walkthrough-before-after', 'arrive', stop);
    }

    function leave() {
      active = false;
      layer.classList.remove('is-active');
      cancel();
      tween(0, LEAVE_MS);
    }

    function sync() {
      var s = section.walkthroughStopState || {};
      var on = s.index === stop && s.phase === 'tour' && (!card || card.classList.contains('active'));
      if (on && !active) arrive();
      else if (!on && active) leave();
    }
    section.addEventListener('walkthrough:stop', sync);
    if (card) new MutationObserver(sync).observe(card, { attributes: true, attributeFilter: ['class'] });

    if (grip) {
      grip.addEventListener('pointerdown', function (e) {
        if (!active) return;
        cancel();
        touch();
        grip.setPointerCapture(e.pointerId);
        var box = grip.parentNode.parentNode.getBoundingClientRect();
        function move(ev) { paint((ev.clientX - box.left) / box.width * 100); }
        function up() {
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', up);
          grip.removeEventListener('pointercancel', up);
        }
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', up);
        grip.addEventListener('pointercancel', up);
      });
      grip.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        e.stopPropagation();
        cancel();
        touch();
        paint(pos + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP));
      });
    }

    layer.walkthroughBeforeAfterHold = function (p) {
      heldAt = p;
      if (active) { cancel(); paint(p); }
    };
  }

  function init() {
    var layers = document.querySelectorAll('.wt-ba');
    for (var i = 0; i < layers.length; i++) bind(layers[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
