

(function () {
  'use strict';

  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var figures = document.querySelectorAll('[data-xp-count]');
  if (!figures.length) return;

  var DURATION = 900;

  function parse(raw) {
    var m = String(raw).match(/^([^\d.-]*)([\d.,]+)(.*)$/);
    if (!m) return null;
    var value = parseFloat(m[2].replace(/,/g, ''));
    if (isNaN(value)) return null;
    return {
      prefix: m[1],
      value: value,
      decimals: (m[2].split('.')[1] || '').length,
      suffix: m[3]
    };
  }

  function format(parts, n) {
    var body = parts.decimals
      ? n.toFixed(parts.decimals)
      : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.prefix + body + parts.suffix;
  }

  function animate(el, parts) {
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DURATION);

      el.textContent = format(parts, parts.value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = format(parts, parts.value);
    }
    requestAnimationFrame(step);
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      animate(entry.target, parse(entry.target.getAttribute('data-xp-count')));
    });
  }, { threshold: 0.4 });

  Array.prototype.forEach.call(figures, function (el) {
    var parts = parse(el.getAttribute('data-xp-count'));
    if (!parts) return;

    if (el.getBoundingClientRect().top <= window.innerHeight) return;
    el.textContent = format(parts, 0);
    observer.observe(el);
  });
}());
