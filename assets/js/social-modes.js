

(function() {
  'use strict';

  var K = window.SocialSiftKernel;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  var PHONE_MAX = 768;
  if (reducedMotion || window.innerWidth <= PHONE_MAX || !K) return;

  var SEG_VH = 60;
  var SETTLE_MS = 100;
  var PIN_SLOP = 2;
  var NEAR_PX = 200;
  var VEIL = 0.135;

  document.addEventListener('DOMContentLoaded', function() {
    var section = document.querySelector('.social-embeds-section');
    if (!section) return;
    var cards = Array.from(section.querySelectorAll('.social-embed--extracted'));

    if (cards.length < 2) return;
    var grid = section.querySelector('.social-grid');
    if (grid) init(section, cards, grid);
  });

  function snapLog(msg, data) {
    if (window.debug && window.debug.flag('social-snap')) window.debug.log('social-snap', msg, data || '');
  }

  function jumpTo(y) {
    var html = document.documentElement, prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    html.style.scrollBehavior = prev;
  }

  function init(section, cards, grid) {
    var N = cards.length;
    var suspended = false;
    var spring = { p: 0, v: 0 };
    var pin = null;
    var sizes = [];
    var ws = [], hs = [];
    var shadowBox = -1;
    var shown = -1;
    var lastScrollY = window.scrollY, lastDir = 1;
    var looping = false, lastFrame = 0, settleTimer = null;
    var written = cards.map(function() { return {}; });

    section.classList.add('social-mode--stack', 'social-mode--thumbs');
    var container = section.querySelector('.container');
    var sticky = document.createElement('div');
    sticky.className = 'social-sticky';
    section.insertBefore(sticky, container);
    sticky.appendChild(container);
    section.style.height = 'calc(' + (100 + N * SEG_VH) + ' * var(--vh))';

    var backdrop = document.createElement('div');
    backdrop.className = 'social-morph-bgs';
    var layers = [0, 1].map(function() {
      var el = document.createElement('div');
      el.className = 'social-morph-bg';
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      el.appendChild(img);
      backdrop.appendChild(el);
      return { el: el, img: img, card: -1, opacity: -1 };
    });
    var veil = document.createElement('div');
    veil.className = 'social-morph-veil';
    backdrop.appendChild(veil);
    sticky.insertBefore(backdrop, sticky.firstChild);

    var cardImgs = cards.map(function(c) { return c.querySelector('.social-post-image img'); });
    var videos = cards.map(function(c) { return c.querySelector('.social-post-image video'); });

    var backdropSrc = cards.map(function(c, i) {
      for (var j = i; j >= 0; j--) if (cardImgs[j]) return cardImgs[j].src;
      for (j = i + 1; j < N; j++) if (cardImgs[j]) return cardImgs[j].src;
      return '';
    });

    var shadow = document.createElement('div');
    shadow.className = 'social-lift-shadow';
    shadow.setAttribute('aria-hidden', 'true');
    grid.insertBefore(shadow, grid.firstChild);

    var strip = document.createElement('div');
    strip.className = 'social-thumb-strip';
    var bars = [];
    var thumbs = cards.map(function(card, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'social-thumb';
      btn.setAttribute('aria-label', 'Post ' + (i + 1) + ' of ' + N);
      if (cardImgs[i]) {
        var thumbImg = document.createElement('img');
        thumbImg.alt = '';
        thumbImg.loading = 'lazy';
        thumbImg.decoding = 'async';
        thumbImg.src = cardImgs[i].src;
        btn.appendChild(thumbImg);
      } else {

        var cap = card.querySelector('.social-post-caption p');
        var thumbTxt = document.createElement('span');
        thumbTxt.className = 'social-thumb-text';
        thumbTxt.textContent = cap ? cap.textContent.trim().slice(0, 44) : '';
        btn.appendChild(thumbTxt);
      }
      var bar = document.createElement('span');
      bar.className = 'social-thumb-progress';
      btn.appendChild(bar);
      bars.push({ el: bar, s: -1 });
      btn.addEventListener('click', function() { goTo(i); });
      strip.appendChild(btn);
      return btn;
    });

    strip.style.setProperty('--thumb-count', String(N));
    sticky.appendChild(strip);

    function place() {
      cards.forEach(function(c) {
        c.style.position = 'absolute';
        c.style.willChange = 'transform, opacity';
      });
    }

    function measure() {
      cards.forEach(function(c) { c.style.height = ''; });

      var gridW = grid.clientWidth;
      sizes = cards.map(function(c) {
        var cs = getComputedStyle(c);
        return { w: parseFloat(cs.width), h: Math.ceil(parseFloat(cs.height)) };
      });
      ws = sizes.map(function(s) { return s.w; });
      hs = sizes.map(function(s) { return s.h; });
      var deckH = Math.max.apply(null, hs);
      grid.style.height = deckH + 'px';
      cards.forEach(function(c, i) {
        var s = sizes[i];
        s.left = (gridW - s.w) / 2;
        s.top = (deckH - s.h) / 2;
        c.style.left = s.left + 'px';
        c.style.top = s.top + 'px';
        c.style.height = s.h + 'px';
      });
      shadowBox = -1;
    }

    place();
    measure();

    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(function() {
        if (suspended) return;
        measure();
        render();
      });
    }

    function sectionRect() { return section.getBoundingClientRect(); }

    function runwayPx() {
      var WS = window.WalkthroughShared;
      return section.offsetHeight - (WS ? WS.stableViewportH() : window.innerHeight);
    }

    function scrollProgress() {
      var runway = runwayPx();
      if (runway <= 0) return 0;
      return Math.max(0, Math.min(1, -sectionRect().top / runway)) * N;
    }

    function target() { return pin ? pin.p : scrollProgress(); }

    function farAway() {
      var r = sectionRect();
      return r.bottom < -NEAR_PX || r.top > window.innerHeight + NEAR_PX;
    }

    function setLayer(layer, card, opacity) {
      if (layer.card !== card) {
        layer.card = card;
        var src = backdropSrc[card];
        if (src && layer.img.src !== src) layer.img.src = src;
      }
      if (layer.opacity !== opacity) {
        layer.opacity = opacity;
        layer.el.style.opacity = String(opacity);
      }
    }

    function renderBackdrop(p) {
      var a = K.ambient(p, N);
      var from = a.k, to = Math.min(a.k + 1, N - 1);

      var cur = layers[0].card === from ? layers[0] : layers[1].card === from ? layers[1]
        : layers[0].card === to ? layers[1] : layers[0];
      var next = cur === layers[0] ? layers[1] : layers[0];
      var mix = Math.round(a.mix * 1000) / 1000;
      setLayer(cur, from, from === to ? 1 : 1 - mix);
      setLayer(next, from === to ? next.card : to, from === to ? 0 : mix);
      var dim = Math.round(VEIL * (1 - a.glow) * 1000) / 1000;
      if (lastDim !== dim) { lastDim = dim; veil.style.opacity = String(dim); }
    }

    var lastRecoil = null, lastShadow = null, lastDim = null;

    function fitShadow(i) {
      if (shadowBox === i) return;
      shadowBox = i;
      var s = sizes[i];
      shadow.style.left = s.left + 'px';
      shadow.style.top = s.top + 'px';
      shadow.style.width = s.w + 'px';
      shadow.style.height = s.h + 'px';
    }

    function render() {
      var p = spring.p;
      var swing = null, swingAt = -1;
      for (var i = 0; i < N; i++) {
        var q = K.pose(i, p, N, ws, hs);
        var c = written[i], el = cards[i];
        var t = K.transformOf(q);
        if (c.t !== t) { c.t = t; el.style.transform = t; }
        var o = Math.round(q.opacity * 1000) / 1000;
        if (c.o !== o) { c.o = o; el.style.opacity = String(o); }
        if (c.z !== q.z) { c.z = q.z; el.style.zIndex = String(q.z); }
        var m = K.mediaTransformOf(q, i);
        if (c.m !== m) {
          c.m = m;

          el.classList.toggle('is-sifting', m !== '');
          if (cardImgs[i]) cardImgs[i].style.transform = m;
          if (videos[i]) videos[i].style.transform = m;
        }
        if (q.lift > 0) { swing = q; swingAt = i; }
      }

      if (swing) fitShadow(swingAt);
      var lift = swing ? Math.round(swing.lift * 1000) / 1000 : 0;
      var sh = swing ? K.shadowTransformOf(swing) : '';
      var shKey = sh + '|' + (swing ? swing.z : 0) + '|' + lift;
      if (shKey !== lastShadow) {
        lastShadow = shKey;
        shadow.style.transform = sh;
        shadow.style.zIndex = String(swing ? swing.z : 0);
        shadow.style.opacity = String(lift);
      }

      var tilt = Math.round(K.recoil(p, N) * 1000) / 1000;
      if (tilt !== lastRecoil) {
        lastRecoil = tilt;
        grid.style.transform = tilt ? 'rotate(' + tilt + 'deg)' : '';
      }

      renderBackdrop(p);

      for (var j = 0; j < N; j++) {
        var s = Math.round(K.fill(j, p, N) * 1000) / 1000;
        if (bars[j].s !== s) { bars[j].s = s; bars[j].el.style.transform = 'scaleX(' + s + ')'; }
      }

      var now = K.displayed(p, N);
      if (now !== shown) setShown(now);
    }

    function setShown(i) {
      thumbs.forEach(function(t, j) {
        var on = j === i;
        t.classList.toggle('active', on);
        if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
        if (!on) t.style.transform = '';
      });

      cards.forEach(function(c, j) { c.style.pointerEvents = j === i ? 'auto' : 'none'; });

      if (shown !== -1 && thumbs[i]) {
        var bounce = thumbs[i];
        bounce.style.transform = 'scale(1.2)';
        setTimeout(function() { if (bounce.classList.contains('active')) bounce.style.transform = ''; }, 200);
      }
      shown = i;
      syncVideos();
    }

    function frame(now) {
      if (suspended) { looping = false; return; }
      var dt = lastFrame ? (now - lastFrame) / 1000 : 1 / 60;
      lastFrame = now;
      var settled;
      if (farAway()) {
        spring.p = target();
        spring.v = 0;
        settled = true;
      } else {

        settled = K.springStep(spring, target(), dt, pin ? K.OMEGA_SETTLE : K.OMEGA_TRACK);
      }
      render();
      if (settled) { looping = false; lastFrame = 0; return; }
      requestAnimationFrame(frame);
    }

    function kick() {
      if (looping || suspended) return;
      looping = true;
      lastFrame = 0;
      requestAnimationFrame(frame);
    }

    window.addEventListener('scroll', function() {
      if (suspended) return;
      setFlick(pinnedHere(), true);
      var y = window.scrollY;

      if (y !== lastScrollY) { lastDir = y > lastScrollY ? 1 : -1; lastScrollY = y; }
      if (pin && Math.abs(y - pin.y) > PIN_SLOP) pin = null;
      clearTimeout(settleTimer);

      if (farAway()) { if (spring.p !== target()) kick(); return; }
      kick();
      settleTimer = setTimeout(settle, SETTLE_MS);
    }, { passive: true });

    function settle() {
      if (suspended || pin || farAway()) return;
      var to = K.settleTarget(scrollProgress(), N, lastDir);
      if (to === null) return;
      snapLog('settle', { to: to, dir: lastDir });
      goTo(to);
    }

    function goTo(i) {
      i = Math.max(0, Math.min(N - 1, i));
      var top = window.scrollY + sectionRect().top;
      jumpTo(top + i / N * runwayPx());
      lastScrollY = window.scrollY;
      pin = { p: i, y: lastScrollY };
      kick();
    }

    function pinnedHere() {
      var r = sectionRect();
      return r.top <= 1 && r.bottom >= window.innerHeight - 1;
    }

    document.addEventListener('keydown', function(e) {
      if (suspended || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      var delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!delta || !pinnedHere()) return;
      var t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      var to = K.stepTarget(target(), N, delta);
      if (to === null) return;
      e.preventDefault();
      goTo(to);
    });

    var focusSeat = -1;
    section.addEventListener('focusin', function(e) {
      if (suspended) return;
      var card = e.target.closest && e.target.closest('.social-embed--extracted');
      var i = cards.indexOf(card);
      if (i < 0) return;
      var queued = focusSeat >= 0;
      focusSeat = i;
      if (queued) return;
      requestAnimationFrame(function() {
        var to = focusSeat;
        focusSeat = -1;
        if (!suspended && !(pin && pin.p === to)) goTo(to);
      });
    });

    var flick = window.WheelFlick ? window.WheelFlick.create() : null;
    var flickOn = false, flickFrom = 0;

    function setFlick(on, moving) {
      if (!flick || on === flickOn) return;
      flickOn = on;
      if (on) {
        flick.attach(performance.now(), moving);
        window.addEventListener('wheel', onWheel, { passive: false });
      } else {
        window.removeEventListener('wheel', onWheel, { passive: false });
        flick.reset();
      }
    }

    function notched(e) {
      if (e.deltaMode !== 0) return true;
      var legacy = e.wheelDeltaY;
      return !!legacy && legacy % 120 === 0 && Math.abs(legacy + 3 * e.deltaY) > 1;
    }

    function captionScrolls(t, px) {
      var cap = t && t.closest ? t.closest('.social-post-caption') : null;
      if (!cap || cap.scrollHeight - cap.clientHeight < 2) return false;
      return px > 0 ? cap.scrollTop + cap.clientHeight < cap.scrollHeight - 1 : cap.scrollTop > 0;
    }

    function onWheel(e) {
      if (suspended || e.defaultPrevented || !pinnedHere()) return;

      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      var px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (captionScrolls(e.target, px)) return;
      var now = performance.now();
      var r = flick.feed(px, now, notched(e));

      if (r.fresh) flickFrom = target();
      if (r.act === 'swallow') { e.preventDefault(); return; }
      if (r.act !== 'flick') return;

      var to = r.arrival ? K.arriveTarget(flickFrom, N, r.dir) : K.stepTarget(flickFrom, N, r.dir);
      if (to === null) return;
      e.preventDefault();
      flick.commit(now);
      snapLog('flick', { to: to, dir: r.dir, arrival: r.arrival });
      goTo(to);
    }

    var sectionVisible = false;
    videos.forEach(function(v) { if (v) v.muted = true; });

    function syncVideos() {
      videos.forEach(function(v, i) {
        if (!v) return;
        if (i === shown && sectionVisible && !suspended) {
          if (v.paused) {
            var pr = v.play();
            if (pr && pr.catch) pr.catch(function() {});
          }
        } else if (!v.paused) {
          v.pause();
        }
      });
    }

    if (videos.some(Boolean) && 'IntersectionObserver' in window) {
      new IntersectionObserver(function(entries) {
        sectionVisible = entries[0].isIntersecting;
        syncVideos();
      }, { threshold: 0.3 }).observe(sticky);
    }

    function suspend() {
      setFlick(false);
      suspended = true;
      pin = null;
      clearTimeout(settleTimer);
      section.classList.remove('social-mode--stack', 'social-mode--thumbs');
      section.style.height = '';
      sticky.style.position = 'static';
      sticky.style.height = 'auto';
      sticky.style.overflow = 'visible';
      sticky.style.display = 'block';
      backdrop.style.display = 'none';
      strip.style.display = 'none';
      shadow.style.display = 'none';
      grid.style.height = '';
      grid.style.transform = '';
      lastRecoil = null;
      lastShadow = null;
      cards.forEach(function(c, i) {
        ['position', 'left', 'right', 'top', 'zIndex', 'transform', 'opacity',
          'pointerEvents', 'height', 'willChange'].forEach(function(prop) { c.style[prop] = ''; });
        c.classList.remove('is-sifting');
        written[i] = {};
        if (cardImgs[i]) cardImgs[i].style.transform = '';
        if (videos[i]) { videos[i].style.transform = ''; if (!videos[i].paused) videos[i].pause(); }
      });
    }

    function resume() {
      suspended = false;
      section.classList.add('social-mode--stack', 'social-mode--thumbs');
      section.style.height = 'calc(' + (100 + N * SEG_VH) + ' * var(--vh))';
      ['position', 'height', 'overflow', 'display'].forEach(function(prop) { sticky.style[prop] = ''; });
      backdrop.style.display = '';
      strip.style.display = '';
      shadow.style.display = '';
      place();
      measure();
      spring.p = target();
      spring.v = 0;
      shown = -1;
      render();

      settle();
      setFlick(pinnedHere(), false);
    }

    window.WalkthroughShared.viewport.afterChange(function() {
      if (window.innerWidth <= PHONE_MAX) { if (!suspended) suspend(); return; }
      if (suspended) { resume(); return; }

      var keep = pin ? pin.p : null;
      pin = null;
      measure();
      if (keep !== null) goTo(keep);
      spring.p = target();
      spring.v = 0;
      render();
      if (keep === null) settle();
      setFlick(pinnedHere(), false);
    });

    spring.p = target();
    render();
    setFlick(pinnedHere(), false);
  }
})();
