

(function () {
  'use strict';

  function create(ctx) {
    var WS = window.WalkthroughShared;
    var clamp = WS.clamp, smoothStep = WS.smoothStep;
    var hero = ctx.hero, content = ctx.content, metricsFloor = ctx.floor, exit = ctx.exit;
    if (!metricsFloor) return null;
    var metricsHeroImage = metricsFloor.querySelector('.scrolly-hero-image');
    var heroImageRevealed = false;

    var metricsOffset = 0;

    var metricValues = metricsFloor ? metricsFloor.querySelectorAll('.metric-value') : [];
    var metricLabels = metricsFloor ? metricsFloor.querySelectorAll('.metric-label') : [];

    var metricOriginals = metricsFloor ? metricsFloor.querySelectorAll('.metric-original') : [];
    var metricsHeading = metricsFloor ? metricsFloor.querySelector('.metrics-heading') : null;
    var metricsAttribution = metricsFloor ? metricsFloor.querySelector('.metrics-attribution') : null;

    var attributionType = (metricsAttribution && window.AttributionTypewriter)
      ? window.AttributionTypewriter(metricsAttribution)
      : null;
    var metricsHeadGroup = metricsFloor ? metricsFloor.querySelector('.metrics-heading-group') : null;
    var metricsGrid = metricsFloor ? metricsFloor.querySelector('.metrics-grid') : null;

    var isTri = !!(metricsGrid && metricsGrid.children.length >= 3);
    var is3up = document.body.classList.contains('hero-metrics-3up');

    var P = null;
    function deriveProfile() {
      var wasTriMobile = P && P.triMobile;
      var cs = getComputedStyle(hero);
      var mobile = cs.getPropertyValue('--hero-mobile').trim() === '1';
      var triMobile = isTri && mobile;
      var hiddenHeadingRest = is3up && mobile;
      P = {
        triMobile: triMobile,

        gridScaleK: triMobile ? (0.14 / 0.28) : 1,
        hiddenHeadingRest: hiddenHeadingRest,
        headingFloorOpacity: hiddenHeadingRest ? 0
          : hero.classList.contains('hero-scrolly--scrim-boost') ? 0.85 : 0.5,

        headScaleCap: triMobile ? 1.08 : Infinity
      };

      var entrances = window.KeyResultsEntrance || {};
      P.entrance = entrances[cs.getPropertyValue('--hero-entrance').trim()] || entrances.scrubbed;
      if (!P.entrance) throw new Error('KeyResults: no entrance loaded (motion/key-results-entrance-*.js must precede key-results.js)');
      if (wasTriMobile && !P.triMobile) {

        gridShift = 0;
        metricsFloor.style.removeProperty('--hero-grid-shift');
      }
    }
    deriveProfile();

    var metricsSpacer = null;
    var metricsTrack = null;
    var metricsPin = null;
    var metricsAtRest = true;
    var trackH = -1;
    var floorMarginB = 0;
    var restTop = 0;
    metricsSpacer = document.createElement('div');
    metricsSpacer.style.height = metricsFloor.offsetHeight + 'px';
    metricsFloor.parentNode.insertBefore(metricsSpacer, metricsFloor);
    metricsTrack = document.createElement('div');
    metricsTrack.className = 'hero-metrics-track';
    metricsTrack.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:2;pointer-events:none';
    content.appendChild(metricsTrack);
    metricsPin = document.createElement('div');
    metricsPin.className = 'hero-metrics-pin';
    metricsPin.style.position = 'sticky';
    metricsTrack.appendChild(metricsPin);

    var metricsClip = document.createElement('div');
    metricsClip.className = 'hero-metrics-clip';
    metricsClip.style.overflowX = 'clip';
    metricsPin.appendChild(metricsClip);
    metricsClip.appendChild(metricsFloor);
    metricsFloor.style.pointerEvents = 'auto';

    function measure(cr) {
      deriveProfile();

      var flowSource = metricsSpacer || metricsFloor;
      metricsOffset = flowSource ? (flowSource.getBoundingClientRect().top - cr.top) : 0;
      if (metricsPin) {

        metricsPin.style.marginTop = metricsOffset + 'px';
      }
    }

    function measureFloor() {
      if (metricsSpacer && metricsAtRest) {

        floorMarginB = parseFloat(getComputedStyle(metricsFloor).marginBottom) || 0;
        metricsSpacer.style.height = metricsFloor.offsetHeight + 'px';
        metricsSpacer.style.marginBottom = floorMarginB + 'px';
      }

      var rs = getComputedStyle(document.documentElement);
      chromeFloor = (parseFloat(rs.getPropertyValue('--header-height')) || 64) +
                    (parseFloat(rs.getPropertyValue('--hud-bar-height')) || 44) + 12;
      priceGridCap();

      var vhNow = WS.stableViewportH();
      var restFloorH = parseFloat(metricsSpacer.style.height) || metricsFloor.offsetHeight;
      restTop = P.entrance.restTop(entranceGeometry(vhNow, centeredTopFor(vhNow, restFloorH)));
      metricsPin.style.top = restTop + 'px';
      if (metricsAtRest && is3up && metricsGrid && metricsHeadGroup) {

        var restOff = metricsGrid.offsetTop;
        metricsGrid.style.marginTop = '0px';
        metricsHeadGroup.style.marginBottom = SEAM_PIN + 'px';
        revealTravel = P.triMobile ? metricsGrid.offsetTop - restOff : 0;
        metricsGrid.style.marginTop = '';
        metricsHeadGroup.style.marginBottom = '';
      }
    }
    var chromeFloor = 120;
    var gridScaleCap = Infinity;

    function priceGridCap() {
      gridScaleCap = Infinity;
      if (!metricsGrid || !metricsGrid.offsetWidth) return;
      var gr = metricsGrid.getBoundingClientRect();
      var gc = gr.left + gr.width / 2;
      var reach = 0;
      var run = document.createRange();
      var walk = document.createTreeWalker(metricsGrid, NodeFilter.SHOW_TEXT);
      for (var tn = walk.nextNode(); tn; tn = walk.nextNode()) {
        run.selectNodeContents(tn);
        var tr = run.getBoundingClientRect();
        if (tr.width) reach = Math.max(reach, gc - tr.left, tr.right - gc);
      }
      reach *= metricsGrid.offsetWidth / gr.width;
      if (reach > 0) gridScaleCap = Math.max(1, (window.innerWidth / 2 - 12) / (reach * FLOOR_CEIL));
    }

    document.addEventListener('hero-odometer:settled', priceGridCap);

    var SEAM_PIN = 22;

    var gridShift = 0;
    var revealTravel = 0;

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

    function centeredTopFor(vh, floorH) {
      return Math.max((vh - floorH) / 2, chromeFloor);
    }

    function entranceGeometry(vh, centeredTop) {
      return {
        vh: vh, slotTop: metricsOffset, centeredTop: centeredTop,
        gridScaleK: P.gridScaleK, hiddenHeadingRest: P.hiddenHeadingRest
      };
    }

    function floorHeight() { return metricsFloor.offsetHeight + gridShift; }

    function pinStartAt(vh) {
      return P.entrance.pinStart(entranceGeometry(vh, centeredTopFor(vh, floorHeight())));
    }

    var HEAD_CEIL = 1.14;
    var FLOOR_CEIL = 1.05;

    function update(s, scrolled, vh) {
      var overlay = null;

      var imgGap = is3up ? 80 : 48;
      var boxH = metricsFloor.offsetHeight;
      var floorH = floorHeight();
      var centeredTop = centeredTopFor(vh, floorH);
      var imgH = metricsHeroImage ? (metricsHeroImage.offsetHeight || 220) : 0;
      var raisedTop = metricsHeroImage
        ? Math.max((vh - (floorH + imgGap + imgH)) / 2, chromeFloor)
        : centeredTop;

      var g = entranceGeometry(vh, centeredTop);
      var pinStart = P.entrance.pinStart(g);
      var gridCeil = 1 + 0.28 * P.gridScaleK;

      var metricsOpacity = 0.85;
      var headingOpacity = 0;
      var metricsScale = 1;
      var metricsGridScale = 1;
      var metricsHeadScale = 1;
      var floorOpacity = 1;

      var nextTrackH = Math.round((exit.end() > 0 ? exit.startAt(vh) : 0) + restTop + boxH + floorMarginB);
      if (nextTrackH !== trackH) {
        trackH = nextTrackH;
        metricsTrack.style.height = trackH + 'px';
      }

      if (scrolled <= 0) {
        if (!metricsAtRest) {
          metricsFloor.style.transform = '';
          metricsFloor.style.opacity = '';
          metricsFloor.style.visibility = '';
          if (metricsGrid) metricsGrid.style.transform = '';
          if (metricsHeadGroup) metricsHeadGroup.style.transform = '';
          gridShift = 0;
          metricsFloor.style.removeProperty('--hero-grid-shift');
          metricsAtRest = true;
        }

        if (attributionType) attributionType.reset();

      } else {
        metricsAtRest = false;

        var metricsTop;
        if (s < pinStart) {

          var ent = P.entrance.at(s, g);
          metricsTop = ent.top;
          metricsOpacity = ent.opacity;
          metricsGridScale = ent.gridScale;
          metricsHeadScale = ent.headScale;
          headingOpacity = ent.headingOpacity;

          if (heroImageRevealed && metricsHeroImage) {
            heroImageRevealed = false;
            metricsHeroImage.classList.remove('visible');
          }

          if (attributionType) attributionType.reset();

      } else if (exit.end() > 0 && s < exit.end()) {

        var exitRunway = vh * exit.runwayVh;
        var exitStart = exit.startAt(vh);
        var pinLen = exitStart - pinStart;
        var pinProgress = clamp((s - pinStart) / Math.max(pinLen, 1), 0, 1);

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

        overlay = 0.5 + clamp(pinProgress / 0.5, 0, 1) * 0.5;

        var handoff = P.entrance.at(pinStart, g);
        var grown = clamp(pinProgress / 0.45, 0, 1);
        metricsScale = 1 + pinProgress * (FLOOR_CEIL - 1);
        metricsGridScale = handoff.gridScale + (gridCeil - handoff.gridScale) * grown;
        metricsHeadScale = handoff.headScale + (HEAD_CEIL - handoff.headScale) * grown;

        if (s < exitStart) {

          var rise = smoothStep(clamp((pinProgress - 0.26) / 0.20, 0, 1));
          metricsTop = centeredTop + (raisedTop - centeredTop) * rise;
        } else {

          metricsTop = raisedTop;
          metricsScale = FLOOR_CEIL;
          floorOpacity = 1 - clamp((s - exitStart) / exitRunway, 0, 1);
        }

      } else {

        metricsTop = raisedTop;
        metricsOpacity = 1;
        headingOpacity = 1;
        if (attributionType) attributionType.finish();
        overlay = 1;
        metricsScale = FLOOR_CEIL;
        metricsGridScale = gridCeil;
        metricsHeadScale = HEAD_CEIL;
        floorOpacity = 0;
      }

        var wrapperTop = Math.max(metricsOffset - s, restTop);

        var shift = (is3up && P.triMobile) ? revealTravel * clamp(headingOpacity, 0, 1) : 0;
        if (shift !== gridShift) {
          gridShift = shift;
          if (shift) metricsFloor.style.setProperty('--hero-grid-shift', shift + 'px');
          else metricsFloor.style.removeProperty('--hero-grid-shift');
        }

        var floorY = metricsTop - wrapperTop - (metricsScale - 1) * shift / 2;
        metricsFloor.style.transform = 'translateY(' + floorY + 'px)' +
          (metricsScale !== 1 ? ' scale(' + metricsScale + ')' : '');
        metricsFloor.style.opacity = floorOpacity;

        metricsFloor.style.visibility = floorOpacity <= 0 ? 'hidden' : '';

        metricsHeadScale = Math.min(metricsHeadScale, P.headScaleCap);

        if (metricsGrid) {
          metricsGrid.style.transform = (shift ? 'translateY(' + shift + 'px) ' : '') +
            'scale(' + Math.min(metricsGridScale, gridScaleCap) + ')';
        }
        if (metricsHeadGroup) metricsHeadGroup.style.transform = 'scale(' + metricsHeadScale + ')';
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
      return overlay;
    }

    return { measure: measure, measureFloor: measureFloor, update: update, pinStartAt: pinStartAt };
  }

  window.KeyResults = { create: create };
})();
