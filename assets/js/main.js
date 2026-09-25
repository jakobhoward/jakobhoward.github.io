

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
    var metricsHeroImage = metricsFloor ? metricsFloor.querySelector('.scrolly-hero-image') : null;
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
      ? { runwayVh: 0.40, leadVh: 0.45, rise: 1.5 }
      : { runwayVh: 0.55, leadVh: 0.00, rise: 1.8 };
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
    var heroImageRevealed = false;

    var metricsOffset = 0;
    var spacerEnd = 0;

    var metricValues = metricsFloor ? metricsFloor.querySelectorAll('.metric-value') : [];
    var metricLabels = metricsFloor ? metricsFloor.querySelectorAll('.metric-label') : [];

    var metricOriginals = metricsFloor ? metricsFloor.querySelectorAll('.metric-original') : [];
    var metricsHeading = metricsFloor ? metricsFloor.querySelector('.metrics-heading') : null;
    var metricsAttribution = metricsFloor ? metricsFloor.querySelector('.metrics-attribution') : null;

    var attributionType = (metricsAttribution && !reducedMotion && window.AttributionTypewriter)
      ? window.AttributionTypewriter(metricsAttribution)
      : null;
    var metricsHeadGroup = metricsFloor ? metricsFloor.querySelector('.metrics-heading-group') : null;
    var metricsGrid = metricsFloor ? metricsFloor.querySelector('.metrics-grid') : null;

    var isTri = !!(metricsGrid && metricsGrid.children.length >= 3);
    var is3up = document.body.classList.contains('hero-metrics-3up');

    var P = null;
    function deriveProfile() {
      var wasTriMobile = P && P.triMobile;
      var mobile = getComputedStyle(hero).getPropertyValue('--hero-mobile').trim() === '1';
      var triMobile = isTri && mobile;
      var hiddenHeadingRest = is3up && mobile;
      P = {
        triMobile: triMobile,

        gridScaleK: triMobile ? (0.14 / 0.28) : 1,
        hiddenHeadingRest: hiddenHeadingRest,
        headingFloorOpacity: hiddenHeadingRest ? 0
          : hero.classList.contains('hero-scrolly--scrim-boost') ? 0.85 : 0.5,

        headScaleCap: triMobile ? 1.08 : Infinity,
        gridReclaim: 48,
        seamRest: 4
      };
      if (hiddenHeadingRest && metricsGrid && metricsHeadGroup) {

        P.gridReclaim = parseFloat(getComputedStyle(metricsGrid).getPropertyValue('--hero-grid-reclaim')) || 48;
        P.seamRest = parseFloat(getComputedStyle(metricsHeadGroup).getPropertyValue('--hero-seam-rest')) || 4;
      }
      if (wasTriMobile && !P.triMobile) {

        if (metricsGrid) metricsGrid.style.marginTop = '';
        if (metricsHeadGroup) metricsHeadGroup.style.marginBottom = '';
      }
    }
    deriveProfile();
    var metricsSpacer = null;
    var metricsIsFixed = false;
    if (metricsFloor && !reducedMotion) {
      metricsSpacer = document.createElement('div');
      metricsSpacer.style.height = metricsFloor.getBoundingClientRect().height + 'px';
      metricsSpacer.style.display = 'none';
      metricsFloor.parentNode.insertBefore(metricsSpacer, metricsFloor);
    }

    function measure() {
      deriveProfile();
      var cr = content.getBoundingClientRect();

      var flowSource = (metricsIsFixed && metricsSpacer) ? metricsSpacer : metricsFloor;
      metricsOffset = flowSource ? (flowSource.getBoundingClientRect().top - cr.top) : 0;
      if (pinSpacer) {
        spacerEnd = (pinSpacer.getBoundingClientRect().top - cr.top) + pinSpacer.offsetHeight;
      }
      if (bottomFade) {

        fadeTop = bottomFade.getBoundingClientRect().top - cr.top;
        fadeH = Math.max(bottomFade.offsetHeight, 1);
      }
      if (metricsSpacer && !metricsIsFixed) {
        metricsSpacer.style.height = metricsFloor.getBoundingClientRect().height + 'px';
      }

      var rs = getComputedStyle(document.documentElement);
      chromeFloor = (parseFloat(rs.getPropertyValue('--header-height')) || 64) +
                    (parseFloat(rs.getPropertyValue('--hud-bar-height')) || 44) + 12;

      gridScaleCap = Infinity;
      if (metricsGrid && metricsGrid.offsetWidth && metricsGrid.children.length) {
        var gc = metricsGrid.offsetWidth / 2;
        var reach = 0;
        for (var mi = 0; mi < metricsGrid.children.length; mi++) {
          var mc = metricsGrid.children[mi];
          reach = Math.max(reach, gc - mc.offsetLeft, mc.offsetLeft + mc.offsetWidth - gc);
        }
        if (reach > 0) gridScaleCap = Math.max(1, (window.innerWidth / 2 - 12) / reach);
      }
    }
    var chromeFloor = 120;
    var gridScaleCap = Infinity;
    measure();

    var SEAM_PIN = 22;

    var pairMetricEls = { values: [], labels: [], originals: [] };
    if (is3up && metricsGrid && metricsGrid.children.length >= 3) {
      [metricsGrid.children[0], metricsGrid.children[1]].forEach(function (m) {
        var v = m.querySelector('.metric-value');
        var l = m.querySelector('.metric-label');
        var o = m.querySelector('.metric-original');
        if (v) pairMetricEls.values.push(v);
        if (l) pairMetricEls.labels.push(l);
        if (o) pairMetricEls.originals.push(o);
      });
    }

    function pairOpacity(o) { return Math.max(0, 1 - (1 - o) * 2.7); }

    var updateReveals = buildScrollReveals();

    function update() {
      var vh = window.innerHeight;
      var cr = content.getBoundingClientRect();
      var scrolled = -cr.top;
      var s = Math.max(scrolled, 0);

      var overlayVal = clamp(s / (vh * 0.6), 0, 0.5);

      var imgGap = is3up ? 80 : 48;
      var centeredTop = chromeFloor;
      var raisedTop = chromeFloor;
      if (metricsFloor) {
        var floorH = metricsFloor.offsetHeight;
        centeredTop = Math.max((vh - floorH) / 2, chromeFloor);
        var imgH = metricsHeroImage ? (metricsHeroImage.offsetHeight || 220) : 0;
        raisedTop = metricsHeroImage
          ? Math.max((vh - (floorH + imgGap + imgH)) / 2, chromeFloor)
          : centeredTop;
      }

      if (heroContainer && !reducedMotion) {
        var titleProgress = clamp(s / (vh * 0.45), 0, 1);
        heroContainer.style.transform = 'translateY(-' + (s * 0.7) + 'px)';
        heroContainer.style.opacity = 1 - titleProgress;
      }

      if (metricsFloor && !reducedMotion) {
        var metricsOpacity = 0.85;
        var headingOpacity = 0;
        var metricsTransform = '';
        var metricsGridScale = 1;
        var metricsHeadScale = 1;
        var floorOpacity = 1;

        if (scrolled <= 0) {

          if (metricsIsFixed) {
            metricsFloor.style.position = '';
            metricsFloor.style.top = '';
            metricsFloor.style.left = '';
            metricsFloor.style.width = '';
            metricsFloor.style.zIndex = '';
            metricsFloor.style.transform = '';
            metricsFloor.style.opacity = '';
            metricsFloor.style.visibility = '';
            if (metricsGrid) { metricsGrid.style.transform = ''; metricsGrid.style.marginTop = ''; }
            if (metricsHeadGroup) { metricsHeadGroup.style.transform = ''; metricsHeadGroup.style.marginBottom = ''; }
            metricsSpacer.style.display = 'none';
            metricsIsFixed = false;
          }

          if (attributionType) attributionType.reset();

        } else {

          if (!metricsIsFixed) {
            var rect = metricsFloor.getBoundingClientRect();
            metricsSpacer.style.display = '';
            metricsFloor.style.position = 'fixed';
            metricsFloor.style.left = '0';
            metricsFloor.style.width = '100%';
            metricsFloor.style.zIndex = '2';
            metricsFloor.style.top = rect.top + 'px';
            metricsIsFixed = true;
          }

          var DRIFT_END = vh * 0.28;
          var PIN_START = vh * 0.5;
          var A_DRIFT = 0.32;

          var metricsTop;
          if (s < DRIFT_END) {

          metricsTop = metricsOffset - s * A_DRIFT;
          var aProgress = clamp(s / DRIFT_END, 0, 1);
          metricsOpacity = 0.85 + aProgress * 0.05;
          metricsGridScale = 1 + aProgress * 0.06 * P.gridScaleK;
          metricsHeadScale = 1 + aProgress * 0.03;

          if (heroImageRevealed && metricsHeroImage) {
            heroImageRevealed = false;
            metricsHeroImage.classList.remove('visible');
          }

          if (attributionType) attributionType.reset();

        } else if (s < PIN_START) {

          var phaseAEndTop = metricsOffset - DRIFT_END * A_DRIFT;
          var bProgress = (s - DRIFT_END) / (PIN_START - DRIFT_END);
          var ease = smoothStep(bProgress);
          metricsTop = phaseAEndTop + (centeredTop - phaseAEndTop) * ease;

          metricsOpacity = 0.9 + ease * 0.1;

          headingOpacity = P.hiddenHeadingRest ? clamp((ease - 0.65) / 0.35, 0, 1) * 0.5 : 0;

          metricsGridScale = 1 + (0.06 + ease * 0.06) * P.gridScaleK;
          metricsHeadScale = 1.03 + ease * 0.03;

          if (heroImageRevealed && metricsHeroImage) {
            heroImageRevealed = false;
            metricsHeroImage.classList.remove('visible');
          }
          if (attributionType) attributionType.reset();

        } else if (spacerEnd > 0 && s < spacerEnd) {

          var exitRunway = vh * EXIT.runwayVh;
          var exitEndLead = vh * EXIT.leadVh;
          var exitStart = spacerEnd - exitEndLead - exitRunway;
          var pinLen = exitStart - PIN_START;
          var pinProgress = clamp((s - PIN_START) / Math.max(pinLen, 1), 0, 1);

          metricsOpacity = 1;

          headingOpacity = P.hiddenHeadingRest

            ? Math.min(1, 0.5 + pinProgress / 0.08)
            : clamp((pinProgress - 0.05) / 0.12, 0, 1);

          if (attributionType) {
            if (pinProgress >= 0.50) attributionType.start();
            else attributionType.reset();
          }

          if (metricsHeroImage) {
            if (pinProgress >= 0.50 && !heroImageRevealed) {
              heroImageRevealed = true;
              metricsHeroImage.classList.add('visible');
            } else if (pinProgress < 0.50 && heroImageRevealed) {
              heroImageRevealed = false;
              metricsHeroImage.classList.remove('visible');
            }
          }

          overlayVal = 0.5 + clamp(pinProgress / 0.5, 0, 1) * 0.5;

          metricsTransform = 'scale(' + (1 + pinProgress * 0.05) + ')';
          metricsGridScale = 1 + (0.12 + clamp(pinProgress / 0.45, 0, 1) * 0.16) * P.gridScaleK;
          metricsHeadScale = 1.06 + clamp(pinProgress / 0.45, 0, 1) * 0.08;

          if (s < exitStart) {

            var rise = smoothStep(clamp((pinProgress - 0.26) / 0.20, 0, 1));
            metricsTop = centeredTop + (raisedTop - centeredTop) * rise;
          } else {

            metricsTop = raisedTop - (s - exitStart) * EXIT.rise;
            metricsTransform = 'scale(1.05)';
            floorOpacity = 1 - clamp((s - exitStart) / exitRunway, 0, 1);
          }

        } else {

          metricsTop = raisedTop - (vh * EXIT.runwayVh + vh * EXIT.leadVh) * EXIT.rise - (s - spacerEnd);
          metricsOpacity = 1;
          headingOpacity = 1;
          if (attributionType) attributionType.finish();
          overlayVal = 1;
          metricsTransform = 'scale(1.05)';
          metricsGridScale = 1 + 0.28 * P.gridScaleK;
          metricsHeadScale = 1.14;
          floorOpacity = 0;
        }

          metricsFloor.style.top = metricsTop + 'px';
          metricsFloor.style.transform = metricsTransform;
          metricsFloor.style.opacity = floorOpacity;

          metricsFloor.style.visibility = floorOpacity <= 0 ? 'hidden' : '';

          metricsHeadScale = Math.min(metricsHeadScale, P.headScaleCap);

          if (metricsGrid) metricsGrid.style.transform = 'scale(' + Math.min(metricsGridScale, gridScaleCap) + ')';
          if (metricsHeadGroup) metricsHeadGroup.style.transform = 'scale(' + metricsHeadScale + ')';

          if (is3up && P.triMobile) {
            var reveal = clamp(headingOpacity, 0, 1);
            if (metricsGrid) metricsGrid.style.marginTop = (-P.gridReclaim * (1 - reveal)) + 'px';
            if (metricsHeadGroup) metricsHeadGroup.style.marginBottom = (P.seamRest + (SEAM_PIN - P.seamRest) * reveal) + 'px';
          }
        }

        metricValues.forEach(function(el) {
          var dim = P.triMobile && pairMetricEls.values.indexOf(el) !== -1;
          el.style.opacity = dim ? pairOpacity(metricsOpacity) : metricsOpacity;
        });
        metricLabels.forEach(function(el) {
          var dim = P.triMobile && pairMetricEls.labels.indexOf(el) !== -1;
          var o = dim ? pairOpacity(metricsOpacity) : metricsOpacity;
          el.style.color = 'rgba(255, 255, 255, ' + Math.min(1, 0.2 + o * 0.8) + ')';
        });

        metricOriginals.forEach(function(el) {
          var dim = P.triMobile && pairMetricEls.originals.indexOf(el) !== -1;
          var o = dim ? pairOpacity(metricsOpacity) : metricsOpacity;
          el.style.color = 'rgba(255, 255, 255, ' + Math.min(1, 0.2 + o * 0.8) * 0.75 + ')';
        });

        var headingOn = Math.max(headingOpacity, P.headingFloorOpacity);
        if (metricsHeading) {
          metricsHeading.style.color = 'rgba(255, 255, 255, ' + headingOn + ')';
        }
        if (metricsAttribution) {

          metricsAttribution.style.color = 'rgba(255, 255, 255, ' + Math.min(1, headingOn * 1.7) + ')';
        }
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

    window.addEventListener('load', function() { measure(); scheduleUpdate(); });
    if (window.ResizeObserver) {
      new ResizeObserver(debounce(function() { measure(); scheduleUpdate(); }, 100)).observe(content);
    }

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
    var staticMaxWidth = isDesktopCapture ? 1024 : 768;

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
      cls: null, layoutCls: null,
      setup: function() { return pinnedApi && pinnedApi.setup(section, actIdx); }
    };
    MODES[WT_MODE_STATIC] = {
      cls: 'is-static', layoutCls: 'layout-static',
      setup: function() { return staticApi ? staticApi.setup(section) : null; }
    };
    MODES[WT_MODE_SYNCED] = {
      cls: 'is-synced', layoutCls: mobileApi ? 'layout-synced' : null,
      setup: function() { return mobileApi && mobileApi.setupSynced(section, actIdx); }
    };
    MODES[WT_MODE_INTERLEAVED] = {
      cls: 'is-interleaved', layoutCls: mobileApi ? 'layout-interleaved' : null,
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

      var mobileEligible = mobileApi && window.innerWidth <= 768;
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

    window.addEventListener('resize', debounce(function() {
      var mode = chooseMode();
      if (mode !== currentMode) applyMode(mode);
      else if (instance) instance.handleResize();
    }, 200));

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
