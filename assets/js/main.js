

(function() {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before main.js');
  }
  var WS = window.WalkthroughShared;
  var easeOutCubic = WS.easeOutCubic, clamp = WS.clamp, debounce = WS.debounce;
  var smoothStep = WS.smoothStep, stableViewportH = WS.stableViewportH;

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function(link) {
      link.addEventListener('click', function(e) {
        var target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        e.preventDefault();

        var scrollBehavior = reducedMotion ? 'auto' : 'smooth';
        if (typeof target.walkthroughRevealScrollY === 'function') {
          window.scrollTo({ top: target.walkthroughRevealScrollY(), behavior: scrollBehavior });

          if (typeof target.focusWalkthrough === 'function') target.focusWalkthrough();
        } else {
          target.scrollIntoView({ behavior: scrollBehavior });
        }
      });
    });
  }

  function buildScrollReveals() {
    if (reducedMotion) return null;
    var items = [];

    function add(selector, opts) {
      document.querySelectorAll(selector).forEach(function(el, i) {
        items.push({
          el: el,
          y: opts.y !== undefined ? opts.y : 40,
          scale: opts.scale || 1,
          trigger: (opts.trigger || 0.70) - (opts.stagger || 0) * i,
          done: false
        });
        el.style.willChange = 'opacity, transform';
      });
    }

    add('.approach-chapter', { y: 45, trigger: 0.75, stagger: 0.02 });

    add('.collaborator-card', { y: 30, trigger: 0.72, stagger: 0.04 });

    if (!items.length) return null;

    return function() {
      var vh = window.innerHeight;
      items.forEach(function(item) {
        if (item.done) return;
        var rect = item.el.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var t = clamp((vh * item.trigger - center) / (vh * 0.22) + 1, 0, 1);
        var e = easeOutCubic(t);

        item.el.style.opacity = e;
        var tf = '';
        if (item.y) tf += 'translateY(' + ((1 - e) * item.y) + 'px)';
        if (item.scale !== 1) tf += ' scale(' + (item.scale + (1 - item.scale) * e) + ')';
        item.el.style.transform = tf || 'none';

        if (t >= 1) { item.done = true; item.el.style.willChange = 'auto'; }
      });
    };
  }

  function initScrollytelling() {
    var hero = document.querySelector('.hero-scrolly');
    if (!hero) return;

    var s1Overlay = hero.querySelector('[data-scene="1"] .scrolly-overlay');
    var content = hero.querySelector('.scrolly-content');
    if (!content) return;

    var metricsFloor = hero.querySelector('.hero-metrics-floor');
    var heroContainer = hero.querySelector('[data-step="hero"] > .container');
    var contextStep = hero.querySelector('[data-step="context"]');
    var bg = hero.querySelector('[data-scene="1"] .scrolly-bg');
    var pinSpacer = hero.querySelector('.scrolly-pin-spacer');
    var fallbackHeroImage = !metricsFloor ? hero.querySelector('.scrolly-hero-image') : null;

    var updateHeroScrub = null;
    (function setupHeroScrub() {
      var v = hero.querySelector('.scrolly-bg-video[data-hero-scrub]');
      if (!v || reducedMotion) return;

      var runVh = parseFloat(v.getAttribute('data-hero-scrub')) || 1;
      var dur = 0, wantT = -1, seekBusy = false, primed = false;

      function applySeek() {
        if (seekBusy || wantT < 0 || !dur) return;
        if (Math.abs(v.currentTime - wantT) < 0.02) return;
        seekBusy = true;
        try { v.currentTime = wantT; } catch (e) { seekBusy = false; }
      }
      v.addEventListener('seeked', function() { seekBusy = false; applySeek(); });

      function ready() {
        if (dur) return;
        dur = v.duration || 0;
        if (!dur) return;

        if (!primed) {
          primed = true;
          var p = v.play();
          if (p && p.then) {
            p.then(function() { v.pause(); if (wantT < 0) v.currentTime = 0; })
             .catch(function() {   });
          } else { v.pause(); }
        }
        applySeek();
      }
      if (v.readyState >= 1) ready();
      v.addEventListener('loadedmetadata', ready);

      updateHeroScrub = function(s, vh) {
        if (!dur) return;
        var p = clamp(s / (vh * runVh), 0, 1);

        wantT = p * (dur - 0.02);
        applySeek();
      };
    })();

    var EXIT = contextStep
      ? { runwayVh: 0.40, leadVh: 0.45 }
      : { runwayVh: 0.55, leadVh: 0.00 };
    if (!contextStep && !reducedMotion) hero.classList.add('hero-scrolly--no-context');

    if (!contextStep && !reducedMotion && !metricsFloor) {
      hero.classList.add('hero-scrolly--no-floor');
    }
    var exitFadeEl = contextStep;

    var bottomFade = hero.querySelector('.scrolly-bottom-fade');
    var scene = hero.querySelector('.scrolly-scene[data-scene="1"]');
    var bgBlend = null;
    if (scene && bottomFade && !reducedMotion) {
      bgBlend = document.createElement('div');
      bgBlend.className = 'scrolly-bg-blend';
      bgBlend.setAttribute('aria-hidden', 'true');
      scene.appendChild(bgBlend);
    }

    var fadeTop = 0;
    var fadeH = 1;

    var fallbackImageRevealed = false;

    var spacerEnd = 0;

    function exitStartAt(vh) {
      return spacerEnd - vh * EXIT.leadVh - vh * EXIT.runwayVh;
    }
    var keyResults = (metricsFloor && !reducedMotion && window.KeyResults)
      ? window.KeyResults.create({
        hero: hero, content: content, floor: metricsFloor,
        exit: { startAt: exitStartAt, runwayVh: EXIT.runwayVh, end: function() { return spacerEnd; } }
      })
      : null;

    function measure() {
      var cr = content.getBoundingClientRect();
      if (keyResults) keyResults.measure(cr);
      if (pinSpacer) {
        spacerEnd = (pinSpacer.getBoundingClientRect().top - cr.top) + pinSpacer.offsetHeight;
      }
      if (bottomFade) {

        fadeTop = bottomFade.getBoundingClientRect().top - cr.top;
        fadeH = Math.max(bottomFade.offsetHeight, 1);
      }
      if (keyResults) keyResults.measureFloor();
    }
    measure();

    var updateReveals = buildScrollReveals();

    function update() {

      var vh = stableViewportH();
      var cr = content.getBoundingClientRect();
      var scrolled = -cr.top;
      var s = Math.max(scrolled, 0);

      var overlayVal = clamp(s / (vh * 0.6), 0, 0.5);

      if (heroContainer && !reducedMotion) {
        var titleLen = keyResults
          ? clamp(keyResults.pinStartAt(vh), vh * 0.3, vh * 0.45)
          : vh * 0.45;
        heroContainer.style.opacity = 1 - clamp(s / titleLen, 0, 1);
      }

      if (keyResults) {
        var krOverlay = keyResults.update(s, scrolled, vh);
        if (krOverlay !== null) overlayVal = krOverlay;
      }

      if (s1Overlay) {
        s1Overlay.style.opacity = overlayVal;
      }

      if (bgBlend) {
        var bt = clamp((s + vh - fadeTop) / fadeH, 0, 1);
        bgBlend.style.opacity = smoothStep(bt);
      }

      if (exitFadeEl && spacerEnd > 0 && !reducedMotion) {
        var exitFadeStart = spacerEnd - vh * 0.6;
        var exitFadeLen = vh * 0.35;
        if (s >= vh * 0.8 && s < exitFadeStart) {
          exitFadeEl.style.opacity = '0';
        } else if (s >= exitFadeStart && s < exitFadeStart + exitFadeLen) {
          exitFadeEl.style.opacity = clamp((s - exitFadeStart) / exitFadeLen, 0, 1);
        } else {
          exitFadeEl.style.opacity = '';
        }
      }

      if (fallbackHeroImage && !fallbackImageRevealed && !reducedMotion) {
        var hir = fallbackHeroImage.getBoundingClientRect();
        if (hir.top <= vh * 0.8) {
          fallbackImageRevealed = true;
          fallbackHeroImage.classList.add('visible');
        }
      }

      if (bg && !reducedMotion) {
        var zoomStart = vh * 0.45;
        var zoomProgress = clamp((s - zoomStart) / 3000, 0, 1);
        bg.style.transform = 'scale(' + (1 + zoomProgress * 0.07) + ')';
      }

      if (updateHeroScrub) updateHeroScrub(s, vh);

      if (updateReveals) updateReveals();
    }

    var scheduleUpdate = WS.rafThrottle(update);

    window.addEventListener('scroll', scheduleUpdate, { passive: true });

    function remeasure() { measure(); scheduleUpdate(); }
    window.addEventListener('load', remeasure);
    if (window.ResizeObserver) {
      new ResizeObserver(debounce(remeasure, 100)).observe(content);
    }
    WS.viewport.onChange(remeasure);

    update();
  }

  var WT_MODE_PINNED = 'pinned';
  var WT_MODE_STATIC = 'static';

  var WT_MODE_SYNCED = 'synced';
  var WT_MODE_INTERLEAVED = 'interleaved';

  var debugLog = WS.debugLog;

  function initCampaignWalkthrough() {

    var sections = document.querySelectorAll('.campaign-walkthrough-section');
    for (var si = 0; si < sections.length; si++) initWalkthroughModes(sections[si], si);

    if (sections.length) {
      document.dispatchEvent(new CustomEvent('walkthrough:measured'));
    }
  }

  function initWalkthroughModes(section, actIdx) {
    if (!section) return;
    if (!section.querySelector('.wt-phone-scroll')) return;

    var stopless = !section.querySelectorAll('.walkthrough-annotation').length;

    var isDesktopCapture = section.hasAttribute('data-wt-desktop-capture');
    var staticMaxWidth = isDesktopCapture ? WS.TABLET_MAX : WS.PHONE_MAX;

    var SYNCED_MIN_HEIGHT = 520;
    var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var coarseMq = window.matchMedia('(pointer: coarse)');
    var currentMode = null;
    var instance = null;

    var mobileApi = window.WalkthroughMobile || null;

    var pinnedApi = window.WalkthroughPinned || null;

    var staticApi = window.WalkthroughStatic || null;

    var MODES = {};
    MODES[WT_MODE_PINNED] = {
      cls: WS.MODE_CLASSES[WT_MODE_PINNED], layoutCls: null,
      setup: function() { return pinnedApi && pinnedApi.setup(section, actIdx); }
    };
    MODES[WT_MODE_STATIC] = {
      cls: WS.MODE_CLASSES[WT_MODE_STATIC], layoutCls: 'layout-static',
      setup: function() { return staticApi ? staticApi.setup(section) : null; }
    };
    MODES[WT_MODE_SYNCED] = {
      cls: WS.MODE_CLASSES[WT_MODE_SYNCED], layoutCls: mobileApi ? 'layout-synced' : null,
      setup: function() { return mobileApi && mobileApi.setupSynced(section, actIdx); }
    };
    MODES[WT_MODE_INTERLEAVED] = {
      cls: WS.MODE_CLASSES[WT_MODE_INTERLEAVED], layoutCls: mobileApi ? 'layout-interleaved' : null,
      setup: function() { return mobileApi && mobileApi.setupInterleaved(section, actIdx); }
    };
    var MODE_KEYS = Object.keys(MODES);

    function layoutOverride() {
      var b = document.body.classList;
      for (var i = 0; i < MODE_KEYS.length; i++) {
        var m = MODES[MODE_KEYS[i]];
        if (m.layoutCls && b.contains(m.layoutCls)) return MODE_KEYS[i];
      }
      return null;
    }

    function chooseMode() {
      if (stopless) return WT_MODE_STATIC;
      var override = layoutOverride();
      if (override) return override;

      var mobileEligible = mobileApi && window.innerWidth <= WS.PHONE_MAX;
      if (reduceMq.matches) {

        return mobileEligible ? WT_MODE_INTERLEAVED : WT_MODE_STATIC;
      }

      if (mobileEligible) {

        return stableViewportH() >= SYNCED_MIN_HEIGHT
          ? WT_MODE_SYNCED : WT_MODE_INTERLEAVED;
      }

      if (coarseMq.matches &&
          Math.min(window.innerWidth, stableViewportH()) <= staticMaxWidth) {

        if (isDesktopCapture && mobileApi &&
            stableViewportH() >= SYNCED_MIN_HEIGHT) {
          return WT_MODE_SYNCED;
        }
        return WT_MODE_STATIC;
      }
      if (window.innerWidth <= staticMaxWidth) return WT_MODE_STATIC;
      return WT_MODE_PINNED;
    }

    function setModeClasses(mode) {
      for (var i = 0; i < MODE_KEYS.length; i++) {
        var cls = MODES[MODE_KEYS[i]].cls;
        if (cls) section.classList.toggle(cls, MODE_KEYS[i] === mode);
      }
    }

    function applyMode(mode) {
      if (mode === currentMode) return;
      debugLog('walkthrough-mode', 'act ' + actIdx + ': ' + (currentMode || '(init)') + ' -> ' + mode);
      if (instance) { instance.destroy(); instance = null; }

      setModeClasses(mode);
      instance = MODES[mode].setup();

      if (mode !== WT_MODE_STATIC && !instance) {
        debugLog('walkthrough-mode', 'act ' + actIdx + ': ' + mode + ' unavailable, falling back to static');
        mode = WT_MODE_STATIC;
        setModeClasses(mode);
        instance = MODES[mode].setup();
      }
      currentMode = mode;
    }

    applyMode(chooseMode());

    WS.viewport.onChange(function() {
      var mode = chooseMode();
      if (mode !== currentMode) applyMode(mode);
      else if (instance) instance.handleResize();
    });

    if (typeof reduceMq.addEventListener === 'function') {
      reduceMq.addEventListener('change', function() { applyMode(chooseMode()); });
    }
  }

  function initOffscreenVideoPause() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting && !entry.target.paused) entry.target.pause();
      });
    }, { threshold: 0.2 });
    document.addEventListener('play', function(e) {
      var v = e.target;
      if (v && v.classList && v.classList.contains('wt-pause-offscreen')) io.observe(v);
    }, true);
  }

  function initHeroVideoPlate() {
    function arm(v) {
      if (!v || v.controls) return false;
      v.controls = true;
      var p = v.play();
      if (p && p.catch) p.catch(function() {});
      return true;
    }
    document.addEventListener('click', function(e) {
      var v = e.target && e.target.closest ? e.target.closest('video.igg-hero-video') : null;
      if (v) arm(v);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var v = e.target;
      if (v && v.tagName === 'VIDEO' && v.classList.contains('igg-hero-video') && arm(v)) e.preventDefault();
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initSmoothScroll();
    initScrollytelling();
    initCampaignWalkthrough();
    initOffscreenVideoPause();
    initHeroVideoPlate();
  });
})();
