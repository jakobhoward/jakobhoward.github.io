

(function () {
  'use strict';
  var LEAVE_MS = 300;
  var KEY_STEP = 10;
  var TURN_MS = 150;

  var TURN_ON = 55;
  var TURN_OFF = 45;

  var INK_BACK = 3;
  var debugLog = window.WalkthroughShared.debugLog;

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function bind(layer) {
    var section = layer.closest('.campaign-walkthrough-section');
    if (!section) return;
    var stop = Number(layer.getAttribute('data-ba-stop')) || 0;
    var card = section.querySelectorAll('.walkthrough-annotation')[stop] || null;
    var grip = layer.querySelector('.wt-ba-grip');
    var video = layer.parentNode.querySelector('video');

    var cut = layer.classList.contains('wt-ba--plate') ? layer.nextElementSibling : null;
    var marks = layer.querySelector('.wt-ba-new');
    var pos = 0;
    var raf = 0;
    var active = false;
    var heldAt = null;
    var heldInk = false;
    var comparing = false;
    var strokes = [];
    var noteLabel = layer.getAttribute('data-ba-label');
    var note = card && layer.getAttribute('data-ba-annotation');
    var turned = false;
    var turnTimer = 0;
    var saved = null;
    var peak = 0;
    var inked = false;
    if (note) card.classList.add('has-ba-note');
    if (cut) {
      ['--ba-x', '--ba-y', '--ba-w', '--ba-h'].forEach(function (v) {
        cut.style.setProperty(v, layer.style.getPropertyValue(v));
      });
    }

    function compare(on) {
      if (on === comparing) return;
      comparing = on;
      if (cut) cut.classList.toggle('wt-ba-cut', on);
      if (video && !cut && on) {
        video.setAttribute('data-ba-hold', '');
        video.pause();
        video.load();
      } else if (video && !cut) {
        video.removeAttribute('data-ba-hold');
        var r = video.getBoundingClientRect();
        if (r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
          var played = video.play();
          if (played && played.catch) played.catch(function () {});
        }
      }

      if (on) strokes = Array.prototype.slice.call(section.querySelectorAll('.walkthrough-underline.revealed'));
      for (var i = 0; i < strokes.length; i++) {
        strokes[i].style.transition = on ? 'opacity 0.15s ease' : '';
        strokes[i].style.opacity = on ? '0' : '';
      }
      if (!on) strokes = [];
      debugLog('walkthrough-before-after', 'compare', stop, on);
    }

    function turn(on) {
      if (!note || on === turned) return;
      turned = on;
      clearTimeout(turnTimer);
      card.classList.add('is-ba-turning');
      turnTimer = setTimeout(function () {
        var label = card.querySelector('.walkthrough-annotation-label');
        var text = card.querySelector('.walkthrough-annotation-text');
        if (on && !saved && label && text) {
          saved = { label: label.innerHTML, text: text.innerHTML };
          label.textContent = noteLabel;
          text.textContent = note;
        } else if (!on && saved) {
          label.innerHTML = saved.label;
          text.innerHTML = saved.text;
          saved = null;
        }
        card.classList.toggle('is-ba-before', !!saved);
        card.classList.remove('is-ba-turning');
      }, TURN_MS);
    }

    function ink(on) {
      if (!marks || on === inked) return;
      inked = on;
      layer.classList.toggle('is-inked', on);
    }

    function paint(p) {
      pos = Math.max(0, Math.min(100, p));
      layer.style.setProperty('--ba-pos', pos.toFixed(2));
      if (cut) cut.style.setProperty('--ba-pos', pos.toFixed(2));
      if (grip) grip.setAttribute('aria-valuenow', String(Math.round(pos)));
      compare(pos > 0);
      if (pos >= TURN_ON) turn(true);
      else if (pos <= TURN_OFF) turn(false);
    }

    function steer(p) {
      peak = Math.max(peak, pos);
      if (p < peak - INK_BACK) ink(true);
      paint(p);
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
      if (heldInk) ink(true);
      debugLog('walkthrough-before-after', 'arrive', stop);
    }

    function leave() {
      active = false;
      layer.classList.remove('is-active');
      cancel();
      ink(false);
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
        peak = pos;
        function move(ev) { steer((ev.clientX - box.left) / box.width * 100); }
        function up() {
          ink(false);
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
        peak = pos;
        steer(pos + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP));
      });
      grip.addEventListener('keyup', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ink(false);
      });
    }

    layer.walkthroughBeforeAfterHold = function (p, withInk) {
      heldAt = p;
      heldInk = !!withInk;
      if (active) { cancel(); paint(p); ink(heldInk); }
    };
  }

  function init() {
    var layers = document.querySelectorAll('.wt-ba');
    for (var i = 0; i < layers.length; i++) bind(layers[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
