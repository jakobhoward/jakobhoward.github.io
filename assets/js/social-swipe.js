

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var grid = document.querySelector('.social-embeds-section .social-grid');
    if (!grid) return;
    var cards = Array.from(grid.querySelectorAll('.social-embed--extracted'));
    var N = cards.length;
    if (N < 2) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var videos = cards.map(function(c) { return c.querySelector('.social-post-image video'); });

    var nav = document.createElement('div');
    nav.className = 'social-swipe-nav';
    var row = document.createElement('div');
    row.className = 'social-swipe-progress';
    row.setAttribute('aria-hidden', 'true');
    var fills = cards.map(function() {
      var seg = document.createElement('span');
      seg.className = 'social-swipe-seg';
      var fill = document.createElement('span');
      fill.className = 'social-swipe-fill';
      seg.appendChild(fill);
      row.appendChild(seg);
      return { el: fill, s: -1 };
    });
    var prev = stepButton('prev', 'Previous post');
    var next = stepButton('next', 'Next post');
    nav.appendChild(prev);
    nav.appendChild(row);
    nav.appendChild(next);
    grid.parentNode.insertBefore(nav, grid.nextSibling);

    function stepButton(dir, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'social-carousel-arrow social-swipe-arrow';
      b.setAttribute('aria-label', label);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
        (dir === 'prev' ? 'M14.5 5.5 L8 12 L14.5 18.5' : 'M9.5 5.5 L16 12 L9.5 18.5') + '"/></svg>';
      return b;
    }

    var centred = -1, pitch = 0;

    function fill(j, q) {
      var k = Math.max(0, Math.min(N - 1, Math.floor(q + 1e-4)));
      var f = Math.max(0, Math.min(1, q - k));
      return j < k ? 1 : j === k ? f : 0;
    }

    function measure() {
      pitch = parseFloat(getComputedStyle(cards[0]).width) + (parseFloat(getComputedStyle(grid).columnGap) || 0);
    }

    function paint() {
      if (!pitch) measure();
      var p = grid.scrollLeft > 0 && pitch > 0 ? Math.min(N - 1, grid.scrollLeft / pitch) : 0;
      fills.forEach(function(f, j) {
        var s = Math.round(fill(j, p + 1) * 1000) / 1000;
        if (f.s !== s) { f.s = s; f.el.style.transform = 'scaleX(' + s + ')'; }
      });
      prev.setAttribute('aria-disabled', String(p < 0.5));
      next.setAttribute('aria-disabled', String(p > N - 1.5));
      var now = Math.round(p);
      if (now !== centred) {
        centred = now;
        videos.forEach(function(v, i) { if (v && i !== now && !v.paused) v.pause(); });
      }
    }

    var queue = window.WalkthroughShared.rafThrottle(paint);

    grid.addEventListener('scroll', queue, { passive: true });

    window.WalkthroughShared.viewport.onChange(function() { pitch = 0; queue(); });
    paint();

    function step(dir) {
      if (!pitch) measure();
      var to = Math.max(0, Math.min(N - 1, Math.round(grid.scrollLeft / pitch) + dir));
      grid.scrollTo({ left: to * pitch, behavior: reduce ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function() { step(-1); });
    next.addEventListener('click', function() { step(1); });
  });
})();
