

(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.social-post-time[data-date]').forEach(function(el) {
      var at = new Date(el.dataset.date).getTime();

      if (!isFinite(at)) return;
      var weeks = Math.floor((Date.now() - at) / 604800000);

      el.textContent = weeks < 52 ? weeks + 'w'
        : weeks < 104 ? Math.floor(weeks / 4.345) + 'mo'
        : Math.floor(weeks / 52.18) + 'y';
    });
  });

  var ARROW = {
    prev: 'M14.5 5.5 L8 12 L14.5 18.5',
    next: 'M9.5 5.5 L16 12 L9.5 18.5'
  };

  document.addEventListener('DOMContentLoaded', function() {
    var section = document.querySelector('.social-embeds-section');
    var grid = section && section.querySelector('.social-grid');
    if (!grid) return;
    var cards = Array.from(grid.querySelectorAll('.social-embed--extracted'));
    var N = cards.length;
    if (N < 2) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var videos = cards.map(function(c) { return c.querySelector('.social-post-image video'); });
    var heading = section.querySelector('h2');

    grid.classList.add('social-grid--nav');
    grid.setAttribute('role', 'region');
    grid.setAttribute('aria-roledescription', 'carousel');
    grid.setAttribute('aria-label', heading ? heading.textContent.trim() : 'Social posts');

    var nav = document.createElement('div');
    nav.className = 'social-carousel-nav';
    var prev = arrowButton('prev', 'Previous posts');
    var dotRow = document.createElement('div');
    dotRow.className = 'social-carousel-dots';
    var next = arrowButton('next', 'Next posts');
    nav.appendChild(prev);
    nav.appendChild(dotRow);
    nav.appendChild(next);
    grid.parentNode.appendChild(nav);

    function arrowButton(dir, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'social-carousel-arrow social-carousel-arrow--' + dir;
      b.setAttribute('aria-label', label);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARROW[dir] + '"/></svg>';
      return b;
    }

    var backdrop = document.createElement('div');
    backdrop.className = 'social-morph-bgs';
    backdrop.setAttribute('aria-hidden', 'true');
    var layers = [0, 1].map(function() {
      var el = document.createElement('div');
      el.className = 'social-morph-bg';
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      el.appendChild(img);
      backdrop.appendChild(el);
      return { el: el, img: img };
    });
    var veil = document.createElement('div');
    veil.className = 'social-morph-veil';
    backdrop.appendChild(veil);
    section.insertBefore(backdrop, section.firstChild);

    var cardImgs = cards.map(function(c) { return c.querySelector('.social-post-image img'); });
    var backdropSrc = cards.map(function(c, i) {
      for (var j = i; j >= 0; j--) if (cardImgs[j]) return cardImgs[j].src;
      for (j = i + 1; j < N; j++) if (cardImgs[j]) return cardImgs[j].src;
      return '';
    });

    var front = layers[0], fading = false, wanted = '';

    var backdropOn = false;
    function readBackdropOn() { backdropOn = getComputedStyle(backdrop).display !== 'none'; }
    readBackdropOn();

    function showBackdrop(src) {
      wanted = src;
      if (fading || !src || src === front.img.src) return;

      if (!front.img.src) {
        front.img.src = src;
        front.el.classList.add('is-shown');
        return;
      }
      var back = front === layers[0] ? layers[1] : layers[0];
      var over = false, timer = 0;
      fading = true;
      back.img.src = src;
      function done() {
        if (over) return;
        over = true;
        clearTimeout(timer);
        back.el.removeEventListener('transitionend', done);
        fading = false;
        front.el.classList.remove('is-shown');
        back.el.classList.remove('is-incoming');
        front = back;
        if (wanted !== front.img.src) showBackdrop(wanted);
      }

      back.img.decode().catch(function() {}).then(function() {
        back.el.classList.add('is-incoming', 'is-shown');
        if (reduce) return done();
        back.el.addEventListener('transitionend', done);
        timer = setTimeout(done, 1200);
      });
    }

    var per = 3, pitch = 0, starts = [], dots = [], shown = -1;

    function measure() {
      per = parseInt(getComputedStyle(grid).getPropertyValue('--per-view'), 10) || 3;
      pitch = parseFloat(getComputedStyle(cards[0]).width) + (parseFloat(getComputedStyle(grid).columnGap) || 0);
      starts = [];
      for (var i = 0; i < N - per; i += per) starts.push(i);
      starts.push(Math.max(0, N - per));
      if (dots.length !== starts.length) buildDots();

      nav.hidden = starts.length < 2;
      grid.classList.toggle('social-grid--fits', nav.hidden);
      shown = -1;
    }

    function buildDots() {
      dotRow.textContent = '';
      dots = starts.map(function(s, v) {
        var d = document.createElement('button');
        d.type = 'button';
        d.className = 'social-carousel-dot';
        d.addEventListener('click', function() { goTo(starts[v]); });
        dotRow.appendChild(d);
        return d;
      });
    }

    function at() {
      return pitch > 0 ? grid.scrollLeft / pitch : 0;
    }

    function goTo(card) {
      grid.scrollTo({ left: card * pitch, behavior: reduce ? 'auto' : 'smooth' });
    }

    function current() {
      if (grid.scrollLeft >= grid.scrollWidth - grid.clientWidth - 2) return starts.length - 1;
      var x = at(), best = 0;
      starts.forEach(function(s, v) { if (Math.abs(s - x) < Math.abs(starts[best] - x)) best = v; });
      return best;
    }

    function step(dir) {
      var x = at();
      var to = dir > 0
        ? starts.filter(function(s) { return s > x + 0.5; })[0]
        : starts.filter(function(s) { return s < x - 0.5; }).pop();
      if (to !== undefined) goTo(to);
    }

    prev.addEventListener('click', function() { step(-1); });
    next.addEventListener('click', function() { step(1); });

    function sync() {
      if (!pitch) measure();
      var v = current();
      if (v !== shown) {
        shown = v;
        dots.forEach(function(d, i) {
          var from = starts[i] + 1, to = Math.min(N, starts[i] + per);
          d.setAttribute('aria-label', 'Posts ' + from + '–' + to + ' of ' + N);
          if (i === v) d.setAttribute('aria-current', 'true');
          else d.removeAttribute('aria-current');
        });

        if (backdropOn) showBackdrop(backdropSrc[starts[v]]);
      }
      var x = at();
      prev.setAttribute('aria-disabled', String(x < 0.5));
      next.setAttribute('aria-disabled', String(grid.scrollLeft >= grid.scrollWidth - grid.clientWidth - 2));

      var first = Math.floor(x + 0.5), last = first + per - 1;
      videos.forEach(function(vid, i) { if (vid && (i < first || i > last) && !vid.paused) vid.pause(); });
    }

    var queue = window.WalkthroughShared.rafThrottle(sync);
    grid.addEventListener('scroll', queue, { passive: true });

    window.WalkthroughShared.viewport.onChange(function() { readBackdropOn(); pitch = 0; queue(); });
    sync();

    section.addEventListener('keydown', function(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target.closest('video') || nav.hidden || getComputedStyle(nav).display === 'none') return;
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    });
  });
})();
