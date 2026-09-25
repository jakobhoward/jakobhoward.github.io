

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before hero-odometer.js');
  }
  var WS = window.WalkthroughShared;
  var ease = WS.easeOutCubic;
  var debugLog = WS.debugLog;

  function initHeroOdometer() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var els = document.querySelectorAll('.hero-metrics-floor .metric-value');
    if (!els.length) return;

    var DUR = 600;
    var STEP = 280;

    var runners = [];
    Array.prototype.forEach.call(els, function(el) {
      var m = el.textContent.match(/^(\D*)([\d,]+)(\D*)$/);
      if (!m) return;
      var target = parseInt(m[2].replace(/,/g, ''), 10);
      if (!isFinite(target) || target <= 0) return;

      el.style.fontVariantNumeric = 'tabular-nums';
      var r = el.getBoundingClientRect();
      el.textContent = m[1] + '0' + m[3];
      runners.push({ el: el, prefix: m[1], suffix: m[3], target: target, top: r.top, left: r.left });
    });

    runners.sort(function(a, b) {
      if (Math.abs(a.top - b.top) > 24) return a.top - b.top;
      return a.left - b.left;
    });

    var t0 = null;
    function tick(now) {
      if (t0 === null) t0 = now;
      var pending = 0;
      runners.forEach(function(r, i) {
        if (r.done) return;
        var t = (now - t0 - i * STEP) / DUR;
        if (t < 0) { pending++; return; }
        if (t >= 1) {
          r.el.textContent = r.prefix + r.target.toLocaleString('en-US') + r.suffix;
          r.el.style.fontVariantNumeric = '';
          r.done = true;
          debugLog('hero-odometer', 'settled', r.prefix + r.target.toLocaleString('en-US') + r.suffix);
          return;
        }
        pending++;
        r.el.textContent = r.prefix + Math.round(r.target * ease(t)).toLocaleString('en-US') + r.suffix;
      });
      if (pending > 0) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroOdometer);
  } else {
    initHeroOdometer();
  }
})();
