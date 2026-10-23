

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    var K = window.SocialSiftKernel;
    var grid = document.querySelector('.social-embeds-section .social-grid');
    if (!K || !grid) return;
    var cards = Array.from(grid.querySelectorAll('.social-embed--extracted'));
    var N = cards.length;
    if (N < 2) return;
    var videos = cards.map(function(c) { return c.querySelector('.social-post-image video'); });

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
    grid.parentNode.insertBefore(row, grid.nextSibling);

    var centred = -1, pitch = 0;

    function measure() {
      pitch = parseFloat(getComputedStyle(cards[0]).width) + (parseFloat(getComputedStyle(grid).columnGap) || 0);
    }

    function paint() {
      if (!pitch) measure();
      var p = grid.scrollLeft > 0 && pitch > 0 ? Math.min(N - 1, grid.scrollLeft / pitch) : 0;

      fills.forEach(function(f, j) {
        var s = Math.round(K.fill(j, p + 1, N) * 1000) / 1000;
        if (f.s !== s) { f.s = s; f.el.style.transform = 'scaleX(' + s + ')'; }
      });
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

    if (!('IntersectionObserver' in window) ||
        !document.documentElement.classList.contains('js-motion') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var peeked = false;
    function endPeek(e) {
      if (e.animationName !== 'social-swipe-peek') return;
      grid.classList.remove('is-peeking');
      grid.removeEventListener('animationend', endPeek);
      grid.removeEventListener('animationcancel', endPeek);
    }
    var peekIO = new IntersectionObserver(function(entries) {
      if (peeked || !entries[entries.length - 1].isIntersecting) return;
      peeked = true;
      peekIO.disconnect();
      if (grid.scrollLeft > 2 || getComputedStyle(grid).overflowX !== 'auto') return;
      grid.addEventListener('animationend', endPeek);
      grid.addEventListener('animationcancel', endPeek);
      grid.classList.add('is-peeking');
    }, { threshold: 0.6 });
    peekIO.observe(grid);
  });
})();
