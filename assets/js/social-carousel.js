

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

  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.social-post-image').forEach(function(stage) {
      var video = stage.querySelector('video');
      var cue = stage.querySelector('.adu-play');
      if (!video || !cue) return;
      video.controls = false;
      cue.hidden = false;
      function start() {
        if (video.controls) return;
        cue.hidden = true;
        video.controls = true;
        video.focus({ preventScroll: true });
        var p = video.play();
        if (p && p.catch) p.catch(function() {});
      }
      cue.addEventListener('click', start);

      video.addEventListener('click', function(e) {
        if (video.controls) return;
        e.preventDefault();
        start();
      });
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

    grid.classList.add('social-grid--deck');
    grid.setAttribute('role', 'region');
    grid.setAttribute('aria-roledescription', 'carousel');
    grid.setAttribute('aria-label', heading ? heading.textContent.trim() : 'Social posts');

    grid.tabIndex = -1;

    var nav = document.createElement('div');
    nav.className = 'social-carousel-nav';
    var prev = arrowButton('prev', 'Previous post');
    var dotRow = document.createElement('div');
    dotRow.className = 'social-carousel-dots';
    var next = arrowButton('next', 'Next post');
    nav.appendChild(prev);
    nav.appendChild(dotRow);
    nav.appendChild(next);
    grid.parentNode.insertBefore(nav, grid);

    function arrowButton(dir, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'social-carousel-arrow social-carousel-arrow--' + dir;
      b.setAttribute('aria-label', label);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARROW[dir] + '"/></svg>';
      return b;
    }

    var dots = cards.map(function(c, i) {
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'social-carousel-dot';
      d.setAttribute('aria-label', 'Post ' + (i + 1) + ' of ' + N);
      d.addEventListener('click', function() { show(i); });
      dotRow.appendChild(d);
      return d;
    });

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

    var shown = -1;

    function show(k) {
      k = Math.max(0, Math.min(N - 1, k));
      if (k === shown) return;
      var out = cards[shown];

      if (videos[shown] && !videos[shown].paused) videos[shown].pause();
      if (out) out.classList.remove('is-current');
      cards[k].classList.add('is-current');
      dots.forEach(function(d, i) {
        if (i === k) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
      prev.setAttribute('aria-disabled', String(k === 0));
      next.setAttribute('aria-disabled', String(k === N - 1));
      [k - 1, k + 1].forEach(function(n) { if (cardImgs[n]) cardImgs[n].loading = 'eager'; });

      if (out && out.contains(document.activeElement)) grid.focus({ preventScroll: true });
      shown = k;

      if (backdropOn) showBackdrop(backdropSrc[k]);
    }

    prev.addEventListener('click', function() { show(shown - 1); });
    next.addEventListener('click', function() { show(shown + 1); });
    show(0);

    grid.socialDeckShow = show;

    window.WalkthroughShared.viewport.onChange(function() {
      readBackdropOn();
      if (backdropOn) showBackdrop(backdropSrc[shown]);
    });

    section.addEventListener('keydown', function(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target.closest('video') || getComputedStyle(nav).display === 'none') return;
      e.preventDefault();
      show(shown + (e.key === 'ArrowRight' ? 1 : -1));
    });

    var SWIPE_PX = 40, QUIET_MS = 180, REARM_MS = 250;
    var deckOn = false;
    function readDeckOn() { deckOn = getComputedStyle(nav).display !== 'none'; }
    readDeckOn();
    window.WalkthroughShared.viewport.onChange(readDeckOn);

    var swipeSum = 0, latched = false, lastMag = 0, steppedAt = 0, quiet = 0;
    section.addEventListener('wheel', function(e) {
      if (!deckOn || e.ctrlKey) return;
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? grid.clientWidth : 1;
      var dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      e.preventDefault();
      var mag = Math.abs(dx), now = e.timeStamp;
      clearTimeout(quiet);
      quiet = setTimeout(function() { latched = false; swipeSum = 0; lastMag = 0; }, QUIET_MS);
      if (latched && now - steppedAt > REARM_MS && mag > lastMag * 1.6 + 4) {
        latched = false;
        swipeSum = 0;
      }
      lastMag = mag;
      if (latched) return;

      if (swipeSum && (swipeSum > 0) !== (dx > 0)) swipeSum = 0;
      swipeSum += dx;
      if (Math.abs(swipeSum) < SWIPE_PX) return;
      latched = true;
      steppedAt = now;
      show(shown + (swipeSum > 0 ? 1 : -1));
      swipeSum = 0;
    }, { passive: false });
  });
})();
