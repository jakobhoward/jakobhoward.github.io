

(function() {
  'use strict';

  var FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)');

  var INTENT_MS = 100;
  var DURATION_MS = 400;

  var amounts = document.querySelectorAll('.project-card .overlay-amount[data-count-to]');
  if (!amounts.length) return;

  var stops = [];
  var byCard = new WeakMap();

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fmt(n) {
    return n.toLocaleString('en-US');
  }

  function buildRail(el, prefix, finalStr, suffix) {
    el.textContent = '';
    el.appendChild(document.createTextNode(prefix));
    var cells = [];
    for (var i = 0; i < finalStr.length; i++) {
      var ch = finalStr.charAt(i);
      var cell = document.createElement('span');
      if (ch >= '0' && ch <= '9') {
        cell.style.display = 'inline-block';
        cell.style.width = '1ch';
        cell.style.textAlign = 'center';
      }
      cell.textContent = ch;
      cell.style.visibility = 'hidden';
      el.appendChild(cell);
      cells.push(cell);
    }
    if (suffix) el.appendChild(document.createTextNode(suffix));
    return cells;
  }

  function paint(cells, str) {
    var offset = cells.length - str.length;
    for (var i = 0; i < cells.length; i++) {
      if (i < offset) {
        cells[i].style.visibility = 'hidden';
      } else {
        var ch = str.charAt(i - offset);
        if (cells[i].textContent !== ch) cells[i].textContent = ch;
        cells[i].style.visibility = 'visible';
      }
    }
  }

  function arm(el) {
    var card = el.closest('.project-card');
    var target = parseInt(el.getAttribute('data-count-to'), 10);
    var raw = el.textContent;
    var digitAt = raw.search(/\d/);
    var lastDigitAt = -1;
    for (var i = raw.length - 1; i >= 0; i--) {
      if (raw.charAt(i) >= '0' && raw.charAt(i) <= '9') { lastDigitAt = i; break; }
    }
    if (!card || !isFinite(target) || digitAt === -1 || lastDigitAt < digitAt) return;
    var prefix = raw.slice(0, digitAt);
    var suffix = raw.slice(lastDigitAt + 1);

    var counted = false;
    var intentTimer = null;
    var rafId = null;

    function snapFinal() {
      el.textContent = prefix + fmt(target) + suffix;
    }

    function stop() {
      if (intentTimer) { clearTimeout(intentTimer); intentTimer = null; }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        snapFinal();
      }
    }

    function start() {
      intentTimer = null;
      var grid = card.closest('.projects-grid');
      if (grid && grid.hasAttribute('data-flip-active')) return;
      counted = true;
      var cells = buildRail(el, prefix, fmt(target), suffix);
      var t0 = null;
      rafId = requestAnimationFrame(function frame(now) {
        if (t0 === null) t0 = now;
        var t = Math.min((now - t0) / DURATION_MS, 1);
        var eased = 1 - Math.pow(1 - t, 4);
        if (t < 1) {
          paint(cells, fmt(Math.round(target * eased)));
          rafId = requestAnimationFrame(frame);
        } else {
          rafId = null;
          snapFinal();
        }
      });
    }

    card.addEventListener('mouseenter', function() {
        if (!FINE_POINTER.matches || counted || intentTimer || reducedMotion()) return;
        var grid = card.closest('.projects-grid');
        if (grid && grid.hasAttribute('data-flip-active')) return;
        intentTimer = setTimeout(start, INTENT_MS);
      });
    card.addEventListener('mouseleave', stop);
    stops.push(stop);

    byCard.set(card, function() {
      if (counted || rafId !== null || reducedMotion()) return;
      start();
    });
  }

  Array.prototype.forEach.call(amounts, arm);

  window.cardMetricCount = {
    countCard: function(card) {
      var run = card && byCard.get(card);
      if (run) run();
    }
  };

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) stops.forEach(function(stop) { stop(); });
  });
})();
