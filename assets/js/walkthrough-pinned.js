

(function() {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before walkthrough-pinned.js');
  }
  var WS = window.WalkthroughShared;
  var debugLog = WS.debugLog;
  var clamp = WS.clamp, easeOutCubic = WS.easeOutCubic, trapEase = WS.trapEase;
  var SLIDE_EASE = WS.SLIDE_EASE, SLIDE_RUNWAY = WS.SLIDE_RUNWAY;

  if (!window.WalkthroughGeometry) {
    throw new Error('walkthrough-geometry.js must load before walkthrough-pinned.js');
  }
  var WG = window.WalkthroughGeometry;

  function setupPinnedWalkthrough(section, actIdx) {
    if (!section) return null;

    var runway = section.querySelector('.campaign-walkthrough-runway');
    var sticky = section.querySelector('.campaign-walkthrough-sticky');
    var content = section.querySelector('.wt-phone-scroll');
    var annotations = section.querySelectorAll('.walkthrough-annotation');
    var phoneFrame = section.querySelector('.wt-phone');
    var phoneScreen = section.querySelector('.wt-phone-screen');
    var layoutEl = section.querySelector('.campaign-walkthrough-layout');
    var linesSvg = section.querySelector('.walkthrough-lines');

    var bloomClipId = 'wt-bloom-clip-' + (actIdx || 0);
    var bloomClipRect = null;

    var BEZEL_REACH_PX = 7;
    var spotSvg = section.querySelector('.walkthrough-spot-svg');
    var spotLeadEl = spotSvg ? spotSvg.querySelector('.wt-spot-blob--lead') : null;
    var spotTrailEl = spotSvg ? spotSvg.querySelector('.wt-spot-blob--trail') : null;
    var spotBridgeEl = spotSvg ? spotSvg.querySelector('.wt-spot-blob--bridge') : null;
    var spotGooBlur = spotSvg ? spotSvg.querySelector('feGaussianBlur') : null;

    var spotLastFocusIdx = -1;
    var spotLastSubIdx = -1;
    var spotLastBounds = null;
    var spotLastTrailBounds = null;

    var morphRafId = null;

    var morphTarget = null;
    var morphStartedAt = 0;

    var SPOT_SPRING_OMEGA = 12.4;
    var SPOT_SPRING_ZETA = 0.68;
    var SPOT_TRAIL_LAG_MS = 90;
    var SPOT_MORPH_CAP_MS = 800;
    var SPOT_NECK_BREAK_RATIO = 2.2;
    var SPOT_BRIDGE_MAX_THICKNESS = 72;
    var SPOT_GOO_BLUR_IDLE = 0.1;
    var SPOT_GOO_BLUR_PEAK_FULL = 12;
    var SPOT_GOO_BLUR_PEAK_LITE = 6;
    var SPOT_BLUR_WINDOW_MS = 560;
    var SPOT_POUR_DELAY_MS = 220;

    var SPOT_POUR_SEED = 0;

    var spotReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var SPOT_GOO_BLUR_PEAK =
      (window.matchMedia('(pointer: coarse)').matches ||
       (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4))
        ? SPOT_GOO_BLUR_PEAK_LITE
        : SPOT_GOO_BLUR_PEAK_FULL;

    if (!content || !annotations.length) return null;

    if (phoneScreen) phoneScreen.scrollTop = 0;

    var parkedFocusables = [];
    content.querySelectorAll('a[href], button, video[controls], iframe, [tabindex]:not([tabindex="-1"])')
      .forEach(function(el) {
        parkedFocusables.push({ el: el, tabindex: el.getAttribute('tabindex') });
        el.setAttribute('tabindex', '-1');
      });

    var annotationFocusables = [];
    annotations.forEach(function(ann, i) {
      var list = [];
      ann.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')
        .forEach(function(el) {
          list.push({ el: el, tabindex: el.getAttribute('tabindex') });
          el.setAttribute('tabindex', '-1');
        });
      annotationFocusables[i] = list;
    });
    function setAnnotationTabAccess(focusIdx) {
      for (var i = 0; i < annotationFocusables.length; i++) {
        var restore = i === focusIdx;
        for (var j = 0; j < annotationFocusables[i].length; j++) {
          var f = annotationFocusables[i][j];
          if (!restore) f.el.setAttribute('tabindex', '-1');
          else if (f.tabindex === null) f.el.removeAttribute('tabindex');
          else f.el.setAttribute('tabindex', f.tabindex);
        }
      }
    }

    var fadeCover = null;
    var entranceContainer = null;
    var bgLayer = section.querySelector('.walkthrough-bg');
    if (bgLayer && sticky) {
      fadeCover = document.createElement('div');
      fadeCover.className = 'walkthrough-fade-cover';
      bgLayer.parentNode.insertBefore(fadeCover, bgLayer.nextSibling);
      entranceContainer = sticky.querySelector('.container');
    }

    var focusEls = WS.resolveFocusEls(content, annotations);
    var focusPositions = [];

    var callouts = [];

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function createSvg(tag, attrs) {
      var el = document.createElementNS(SVG_NS, tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    function buildCallouts() {
      if (linesSvg) {
        while (linesSvg.firstChild) linesSvg.removeChild(linesSvg.firstChild);
      }
      callouts = [];
      bloomClipRect = null;
      if (linesSvg) {
        var clipDefs = createSvg('defs', {});
        var clipEl = createSvg('clipPath', { id: bloomClipId, clipPathUnits: 'userSpaceOnUse' });
        bloomClipRect = createSvg('rect', { x: 0, y: 0, width: 0, height: 0 });
        clipEl.appendChild(bloomClipRect);
        clipDefs.appendChild(clipEl);
        linesSvg.appendChild(clipDefs);
      }

      for (var i = 0; i < focusEls.length; i++) {
        var focusEl = focusEls[i];
        var annEl = annotations[i];
        var calloutTexts = annEl ? annEl.querySelectorAll('.walkthrough-callout-text') : [];
        var entries = [];

        if (calloutTexts.length === 0) {

          var singleAnnText = annEl ? annEl.querySelector('.walkthrough-annotation-text') : null;
          var reg = focusRegion(i);
          entries.push(reg ? {

            annTextEl: singleAnnText,
            outlineEl: null,

            targets: [regionUnionRect(focusEl, reg)],
            noLine: true
          } : {
            annTextEl: singleAnnText,
            outlineEl: focusEl,
            targets: [{ kind: 'dom', el: focusEl }],
            noLine: true
          });
        } else {
          for (var j = 0; j < calloutTexts.length; j++) {
            var p = calloutTexts[j];
            var ref = p.getAttribute('data-callout-ref');

            var anchorSpans = annEl.querySelectorAll('.walkthrough-callout-anchor[data-callout-ref="' + ref + '"]');

            var entry = { annTextEl: p, outlineEl: null, targets: [], continuesPrev: p.getAttribute('data-continues') === 'true' };

            if (anchorSpans.length === 0) {

              var domEl = focusEl.querySelector('[data-callout="' + ref + '"]');
              if (domEl) {
                entry.outlineEl = domEl;
                entry.targets.push({ kind: 'dom', el: domEl });
              } else {

                entry.outlineEl = focusEl;
                entry.targets.push({ kind: 'dom', el: focusEl });
              }
            } else {

              for (var s = 0; s < anchorSpans.length; s++) {
                var span = anchorSpans[s];
                var imgName = span.getAttribute('data-anchor-image');
                var imgEl = imgName ? focusEl.querySelector('[data-callout-image="' + imgName + '"]') : null;
                if (!imgEl) continue;
                entry.targets.push({
                  kind: 'rect',
                  imgEl: imgEl,
                  fx: parseFloat(span.getAttribute('data-anchor-x')) || 0,
                  fy: parseFloat(span.getAttribute('data-anchor-y')) || 0,
                  fw: parseFloat(span.getAttribute('data-anchor-w')) || 0,
                  fh: parseFloat(span.getAttribute('data-anchor-h')) || 0,

                  underline: span.getAttribute('data-anchor-underline') === 'true'
                });
              }
              if (entry.targets.length === 0) continue;
            }

            entries.push(entry);
          }
        }

        for (var k = 0; k < entries.length; k++) {
          if (!entries[k].targets.length) continue;
          if (!entries[k].noLine) {
            var path = createSvg('path', {
              'class': 'walkthrough-line',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.75',
              pathLength: '1'
            });
            var dotA = createSvg('circle', { 'class': 'walkthrough-dot walkthrough-dot--annotation', r: '3.5', fill: 'currentColor' });
            if (linesSvg) {
              linesSvg.appendChild(path);
              linesSvg.appendChild(dotA);
            }
            entries[k].lineEl = path;
            entries[k].dotAEl = dotA;
          }

          var bloomClass = 'walkthrough-bloom' + (entries[k].noLine ? ' walkthrough-bloom--noline' : '');
          var bloomUp = createSvg('path', {
            'class': bloomClass,
            fill: 'none',
            pathLength: '1',
            'clip-path': 'url(#' + bloomClipId + ')'
          });
          var bloomDown = createSvg('path', {
            'class': bloomClass,
            fill: 'none',
            pathLength: '1',
            'clip-path': 'url(#' + bloomClipId + ')'
          });
          if (linesSvg) {
            linesSvg.appendChild(bloomUp);
            linesSvg.appendChild(bloomDown);
          }
          entries[k].bloomUpEl = bloomUp;
          entries[k].bloomDownEl = bloomDown;
          entries[k].dotPEls = [];
          entries[k].underlineEls = [];
          for (var t = 0; t < entries[k].targets.length; t++) {
            if (entries[k].targets[t].underline) {

              var ul = createSvg('path', {
                'class': 'walkthrough-underline',
                fill: 'none',
                pathLength: '1',
                'clip-path': 'url(#' + bloomClipId + ')'
              });
              if (linesSvg) linesSvg.appendChild(ul);
              entries[k].underlineEls.push(ul);
              entries[k].dotPEls.push(null);
              continue;
            }
            entries[k].underlineEls.push(null);
            if (!entries[k].noLine) {
              var dotP = createSvg('circle', { 'class': 'walkthrough-dot walkthrough-dot--phone', r: '3.5', fill: 'currentColor' });
              if (linesSvg) linesSvg.appendChild(dotP);
              entries[k].dotPEls.push(dotP);
            } else {
              entries[k].dotPEls.push(null);
            }
          }
        }

        callouts.push(entries);
      }
    }

    function forEachCalloutInFocus(focusIdx, fn) {
      var entries = callouts[focusIdx];
      if (!entries) return;
      for (var j = 0; j < entries.length; j++) fn(entries[j], j);
    }

    function setRevealedCount(focusIdx, count) {

      if (count > 0) startLineSettle(750);

      var entries = callouts[focusIdx] || [];
      var emphasizedFrom = count - 1;
      while (emphasizedFrom > 0 && entries[emphasizedFrom] && entries[emphasizedFrom].continuesPrev) {
        emphasizedFrom--;
      }
      forEachCalloutInFocus(focusIdx, function(c, j) {
        var revealed = j < count;

        var current = revealed && j === count - 1 && !swapReleased && !exitReleased;

        var drawn = revealed && !exitReleased;

        var emphasized = revealed && j >= emphasizedFrom && !hopReleased;
        if (c.annTextEl) {
          c.annTextEl.classList.toggle('revealed', revealed);
          c.annTextEl.classList.toggle('emphasized', emphasized);

          if (current) c.annTextEl.setAttribute('aria-current', 'true');
          else c.annTextEl.removeAttribute('aria-current');
        }
        if (c.lineEl) {
          c.lineEl.classList.toggle('revealed', drawn);
          c.lineEl.classList.toggle('current', current);
        }
        if (c.dotAEl) {
          c.dotAEl.classList.toggle('revealed', drawn);
          c.dotAEl.classList.toggle('current', current);
        }
        if (c.dotPEls) {
          for (var d = 0; d < c.dotPEls.length; d++) {
            if (!c.dotPEls[d]) continue;
            c.dotPEls[d].classList.toggle('revealed', drawn);
            c.dotPEls[d].classList.toggle('current', current);
          }
        }
        if (c.underlineEls) {
          for (var u = 0; u < c.underlineEls.length; u++) {
            if (!c.underlineEls[u]) continue;
            c.underlineEls[u].classList.toggle('revealed', drawn);
            c.underlineEls[u].classList.toggle('current', current);
          }
        }

        if (c.bloomUpEl)   { c.bloomUpEl.classList.toggle('revealed', drawn);   c.bloomUpEl.classList.toggle('current', current); }
        if (c.bloomDownEl) { c.bloomDownEl.classList.toggle('revealed', drawn); c.bloomDownEl.classList.toggle('current', current); }

        if (c.outlineEl) c.outlineEl.classList.toggle('wt-callout-lit', current);
      });
    }

    function clearRevealsInFocus(focusIdx) {
      setRevealedCount(focusIdx, 0);
    }

    var focusZoom = parseFloat(section.getAttribute('data-focus-zoom')) || 1.0;

    var transitTaper = section.getAttribute('data-transit-taper') !== 'off';

    var screenWidth = (phoneScreen && phoneScreen.offsetWidth) || 492;
    var screenHeight = (phoneScreen && phoneScreen.offsetHeight) || 1016;
    var visibleW = screenWidth / focusZoom;
    var visibleH = screenHeight / focusZoom;
    var contentWidth = content.offsetWidth || screenWidth;
    var contentHeight = content.scrollHeight;

    var screenRadius = 0;

    function measurePositions() {
      focusPositions = [];
      var els = Array.prototype.slice.call(focusEls);
      els.forEach(function(el, i) {

        var reg = focusRegion(i);
        var top = reg ? el.offsetTop + reg.y * el.offsetHeight : el.offsetTop;
        var height = reg ? reg.h * el.offsetHeight : el.offsetHeight;
        focusPositions.push({
          target: el.getAttribute('data-focus'),
          top: top,
          height: height,
          left: el.offsetLeft,
          width: el.offsetWidth,

          rawTop: el.offsetTop,
          rawHeight: el.offsetHeight
        });
      });
      screenWidth = (phoneScreen && phoneScreen.offsetWidth) || 492;
      screenHeight = (phoneScreen && phoneScreen.offsetHeight) || 1016;
      visibleW = screenWidth / focusZoom;
      visibleH = screenHeight / focusZoom;
      contentWidth = content.offsetWidth || screenWidth;
      contentHeight = content.scrollHeight;
      screenRadius = phoneScreen ? parseFloat(getComputedStyle(phoneScreen).borderTopLeftRadius) || 0 : 0;
    }

    measurePositions();
    if (!focusPositions.length) return null;

    buildCallouts();

    var focusLabels = [];
    annotations.forEach(function(ann, i) {
      var labelEl = ann.querySelector('.walkthrough-annotation-label');
      focusLabels[i] = labelEl ? labelEl.textContent.trim() : 'Section ' + (i + 1);
    });

    var annotationSlot = section.querySelector('.walkthrough-annotation-slot');

    var scrollHint = null;
    var scrollHintVisible = true;
    if (annotationSlot) {
      scrollHint = document.createElement('div');
      scrollHint.className = 'walkthrough-scroll-hint visible';
      scrollHint.setAttribute('aria-hidden', 'true');
      scrollHint.innerHTML =

        '<span class="wt-scroll-hint-cue">' +
          '<svg class="wt-scroll-hint-mouse" viewBox="0 0 24 38" width="24" height="38">' +
            '<rect x="1.5" y="1.5" width="21" height="35" rx="10.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<circle class="wt-scroll-hint-dot" cx="12" cy="10" r="2.5" fill="currentColor"/>' +
          '</svg>' +

          '<span class="wt-scroll-hint-keys">' +
            '<kbd class="wt-hint-key">&#8592;</kbd>' +
            '<kbd class="wt-hint-key">&#8594;</kbd>' +
            '<span class="wt-hint-keys-label">step the tour</span>' +
          '</span>' +
        '</span>' +
        '<span class="wt-scroll-hint-title">Scroll to explore</span>' +
        '<span class="wt-scroll-hint-sub">Highlights of the campaign page, annotated as you go</span>';
      annotationSlot.appendChild(scrollHint);
    }

    function setScrollHint(show) {
      if (!scrollHint || show === scrollHintVisible) return;
      scrollHintVisible = show;
      scrollHint.classList.toggle('visible', show);
    }

    var skipBtn = section.querySelector('.wt-ctl-skip');

    var SKIP_FLAG_MS = 2000;
    var skipFlagTimer = null;

    var skipDone = false;
    function setSkipDone(done) {
      if (!skipBtn || skipDone === done) return;
      skipDone = done;
      skipBtn.classList.toggle('is-done', done);
    }
    function flagSkip() {
      if (!skipBtn || skipDone) return;

      if (!skipBtn.classList.contains('is-flagged')) skipBtn.classList.add('is-flagged');
      clearTimeout(skipFlagTimer);
      skipFlagTimer = setTimeout(function() {
        if (skipBtn) skipBtn.classList.remove('is-flagged');
      }, SKIP_FLAG_MS);
    }

    var annotationsCol = section.querySelector('.campaign-walkthrough-annotations');
    var headingTitleEl = section.querySelector('.walkthrough-heading-title');
    var liveRegion = null;
    var lastAnnouncedFocus = -1;
    var lastRailFocus = -1;
    var keyNavTarget = -1;
    var keyNavSub = -1;

    function stepTarget(delta) {
      if (keyNavTarget >= 0) {

        var t = clamp(keyNavTarget + delta, 0, numFocuses - 1);
        return t === keyNavTarget ? -1 : t;
      }
      if (activeFocus < 0 && delta < 0) {

        return lastRailFocus;
      }
      var base = activeFocus >= 0 ? activeFocus : lastRailFocus;
      var target = clamp(base + delta, 0, numFocuses - 1);

      if (target === base) return -1;
      return target;
    }

    function calloutScrollY(focusIdx, subIdx) {
      for (var s2 = 0; s2 < segments.length; s2++) {
        var sg = segments[s2];
        if (sg.type === 'hold' && sg.focusIdx === focusIdx) {
          var sw = focusSubWindows(focusIdx);
          var k = clamp(subIdx, 0, sw.bounds.length - 2);
          var span = sw.bounds[k + 1] - sw.bounds[k];
          var share = sw.panShares[k] || 0;
          var tailK = sw.tailShares[k] || 0;

          var holdQ = sw.bounds[k] + (share + 0.25 * (1 - share - tailK)) * span;
          var ov = focusRevealAts(focusIdx)[k];
          if (isFinite(ov)) holdQ = Math.max(holdQ, Math.min(0.98, ov + 0.02));
          return segScrollY(sg, Math.min(1, holdQ));
        }
      }
      return section.getBoundingClientRect().top + window.pageYOffset;
    }

    function navigateToFocus(target) {
      keyNavTarget = target;
      keyNavSub = 0;
      window.scrollTo({ top: calloutScrollY(target, 0), behavior: 'smooth' });
      watchKeyNav();
    }

    section.walkthroughBeatNav = function(delta, fromY) {
      var f, s;
      if (keyNavTarget >= 0) {
        f = keyNavTarget;
        s = keyNavSub + delta;
      } else {
        var scrolled2 = (typeof fromY === 'number' && isFinite(fromY))
          ? fromY - (section.getBoundingClientRect().top + window.pageYOffset)
          : -section.getBoundingClientRect().top;
        var totalPx2 = runway.offsetHeight;
        if (scrolled2 < 0 || scrolled2 > totalPx2) return false;
        var prog2 = clamp(scrolled2 / Math.max(1, totalPx2 - window.innerHeight), 0, 1);
        var sg2 = findSegment(prog2 * totalVh);
        var sp2 = (prog2 * totalVh - sg2.startVh) / sg2.vh;
        if (sg2.type === 'entry') {
          if (delta < 0) return false;
          f = 0; s = 0;
        } else if (sg2.type === 'exit') {
          if (delta > 0) return false;
          f = numFocuses - 1;
          s = ((callouts[f] && callouts[f].length) || 1) - 1;
        } else if (sg2.type === 'transit') {
          if (delta > 0) { f = sg2.to; s = 0; }
          else { f = sg2.from; s = ((callouts[sg2.from] && callouts[sg2.from].length) || 1) - 1; }
        } else {
          var holdQCur = sp2;
          var swCur = focusSubWindows(sg2.focusIdx);
          var sCur = swCur.bounds.length - 2;
          for (var sj = 0; sj < swCur.bounds.length - 1; sj++) {
            if (holdQCur < swCur.bounds[sj + 1]) { sCur = sj; break; }
          }
          f = sg2.focusIdx;
          s = sCur + delta;
        }
      }

      if (f >= 0 && f < numFocuses) {
        var nHere = (callouts[f] && callouts[f].length) || 1;
        if (s >= nHere) { f += 1; s = 0; }
        else if (s < 0) {
          f -= 1;
          if (f >= 0) s = ((callouts[f] && callouts[f].length) || 1) - 1;
        }
      }
      if (f < 0 || f >= numFocuses) return false;
      keyNavTarget = f;
      keyNavSub = s;
      window.scrollTo({ top: calloutScrollY(f, s), behavior: 'smooth' });
      watchKeyNav();
      return true;
    };

    var keyNavWatchRaf = null;
    function watchKeyNav() {
      if (keyNavWatchRaf) cancelAnimationFrame(keyNavWatchRaf);
      var lastY = window.scrollY;
      var stillSince = performance.now();
      function tick(now) {
        keyNavWatchRaf = null;
        if (destroyed || keyNavTarget < 0) return;
        var y = window.scrollY;
        if (y !== lastY) { lastY = y; stillSince = now; }
        else if (now - stillSince > 350) { keyNavTarget = -1; keyNavSub = -1; return; }
        keyNavWatchRaf = requestAnimationFrame(tick);
      }
      keyNavWatchRaf = requestAnimationFrame(tick);
    }

    function onAnnotationKeydown(e) {

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      var delta = 0;
      if (e.key === 'ArrowRight') delta = 1;
      else if (e.key === 'ArrowLeft') delta = -1;
      else return;
      e.preventDefault();
      section.walkthroughBeatNav(delta);
    }

    section.walkthroughStopNav = function(delta) {
      var target = stepTarget(delta);
      if (target < 0) return false;
      navigateToFocus(target);
      return true;
    };

    section.walkthroughGoToStop = function(i) {
      navigateToFocus(clamp(i, 0, numFocuses - 1));
    };

    if (annotationsCol) {
      annotationsCol.setAttribute('role', 'region');
      annotationsCol.setAttribute('aria-label',
        (headingTitleEl ? headingTitleEl.textContent.trim() : 'Campaign walkthrough') + ' annotations');
      annotationsCol.setAttribute('tabindex', '0');
      annotationsCol.addEventListener('keydown', onAnnotationKeydown);
    }

    if (annotationsCol) {

      liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.style.position = 'absolute';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.overflow = 'hidden';
      liveRegion.style.clipPath = 'inset(50%)';
      liveRegion.style.whiteSpace = 'nowrap';
      annotationsCol.appendChild(liveRegion);
    }

    function announceFocus(focusIdx) {
      if (!liveRegion || focusIdx < 0 || focusIdx === lastAnnouncedFocus) return;
      lastAnnouncedFocus = focusIdx;

      var entries = callouts[focusIdx];
      var body = (entries && entries[0] && entries[0].annTextEl)
        ? entries[0].annTextEl.textContent.trim() : '';
      liveRegion.textContent = body
        ? (focusLabels[focusIdx] + '. ' + body)
        : focusLabels[focusIdx];
    }

    var targetRectCache = {};
    var currentPhonePanX = 0;

    var currentZoom = 1;

    function invalidateTargetRectCache() {
      targetRectCache = {};
      calloutSpanCache = {};
      waypointCache = [];
      subWindowCache = [];
      zoomSpecCache = [];
      calloutWindowCache = {};
      calloutZoomCache = {};
      for (var i = 0; i < callouts.length; i++) {
        for (var j = 0; j < callouts[i].length; j++) callouts[i][j].lineH = undefined;
      }
    }

    var calloutSpanCache = {};
    function calloutContentSpan(focusIdx, entryIdx) {
      var key = focusIdx + ':' + entryIdx;
      var v = calloutSpanCache[key];
      if (v !== undefined) return v;
      var entry = callouts[focusIdx] && callouts[focusIdx][entryIdx];
      if (!entry || !entry.targets || !entry.targets.length) {
        return (calloutSpanCache[key] = null);
      }
      var cr = content.getBoundingClientRect();
      if (!cr.height) return null;
      var z = (focusZoom * currentZoom) || 1;
      var top = Infinity, bottom = -Infinity;
      for (var t = 0; t < entry.targets.length; t++) {
        var tg = entry.targets[t];
        var el = tg.kind === 'dom' ? tg.el : tg.imgEl;
        if (!el) continue;
        var r = el.getBoundingClientRect();
        var ct = (r.top - cr.top) / z;
        var ch = r.height / z;
        if (tg.kind !== 'dom') { ct += (tg.fy || 0) * ch; ch = (tg.fh || 0) * ch; }
        if (ct < top) top = ct;
        if (ct + ch > bottom) bottom = ct + ch;
      }
      v = (bottom > top) ? { top: top, bottom: bottom } : null;
      calloutSpanCache[key] = v;
      return v;
    }

    function targetViewportRect(focusIdx, entryIdx, targetIdx, tg, phoneScreenRect) {
      var z = focusZoom * currentZoom;
      var key = focusIdx + ':' + entryIdx + ':' + targetIdx;
      var lr = targetRectCache[key];
      if (!lr) {
        var r = (tg.kind === 'dom' ? tg.el : tg.imgEl).getBoundingClientRect();
        lr = targetRectCache[key] = {
          l: (r.left - phoneScreenRect.left) / z + currentPhonePanX,
          t: (r.top - phoneScreenRect.top) / z + currentPhoneScrollY,
          w: r.width / z,
          h: r.height / z
        };
      }
      var left = phoneScreenRect.left + (lr.l - currentPhonePanX) * z;
      var top = phoneScreenRect.top + (lr.t - currentPhoneScrollY) * z;
      var w = lr.w * z;
      var h = lr.h * z;
      return { left: left, top: top, width: w, height: h, right: left + w, bottom: top + h };
    }

    var entryVh = 30;

    var ENTRY_HOLD_VH = 30;

    var DWELL_VH = 48;

    var TAIL_DWELL_VH = 20;

    var HEAD_DWELL_VH = 7;

    var EXIT_BUFFER_VH = 20;

    var TRAV_RUNWAY_CAP_VH = 240;

    var PAN_REF_SCREEN = (spotSvg && spotSvg.viewBox && spotSvg.viewBox.baseVal &&
      spotSvg.viewBox.baseVal.height) || 1016;
    var panRateVh = 90;
    var transitVh = 12;

    var EXIT_MIN_VH = 10;

    var TRAV_SLOW_PAGE_PER_PX = 3.2;

    var SLIDE_SLOW_VH = 1.2;

    var FRAME_PAD = 24, EXIT_PAD = 16;

    var ZOOM_RAMP = 0.15;

    var ZOOM_SWAP_VH = 16;

    var SWAP_LEAD_VH = 8;

    var entryPanOptIn = section.hasAttribute('data-entry-pan');

    var waypointCache = [];
    var subWindowCache = [];

    var zoomSpecCache = [];

    var calloutWindowCache = {};
    var calloutZoomCache = {};
    var numFocuses = focusPositions.length;

    var segments = [];
    var totalVh = 0;

    function buildSegments() {
      segments = [];

      panRateVh = 90 * visibleH / PAN_REF_SCREEN;
      var cum = 0;
      var entryTotalVh = entryVh + (entryPanOptIn ? ENTRY_HOLD_VH : 0);
      segments.push({ type: 'entry', startVh: cum, vh: entryTotalVh });
      cum += entryTotalVh;
      for (var i = 0; i < numFocuses; i++) {
        var n = (callouts[i] && callouts[i].length) || 1;

        var holdVh = focusSubWindows(i).totalVh;
        segments.push({
          type: 'hold', focusIdx: i, subStepCount: n, startVh: cum, vh: holdVh
        });
        cum += holdVh;
        if (i < numFocuses - 1) {

          var toA = focusWaypoints(i + 1)[0].a;
          var baseD = Math.max(0, focusBasePos(i + 1) - focusHoldEnd(i));
          var hopD = Math.max(0, toA - Math.max(focusBasePos(i + 1), focusHoldEnd(i)));
          var tVh = WG.transitRunwayVh({
            baseD: baseD, hopD: hopD,
            visibleH: visibleH, panRateVh: panRateVh, transitVh: transitVh,
            taper: transitTaper
          });
          segments.push({ type: 'transit', from: i, to: i + 1, startVh: cum, vh: tVh });
          cum += tVh;
        }
      }

      var lastI = numFocuses - 1;
      var exitDist = Math.max(0, maxPhoneScroll() - focusHoldEnd(lastI));
      var exitSegVh = WG.exitRunwayVh({
        exitDist: exitDist, visibleH: visibleH,
        panRateVh: panRateVh, exitMinVh: EXIT_MIN_VH,
        taper: transitTaper
      });
      segments.push({ type: 'exit', startVh: cum, vh: exitSegVh });
      cum += exitSegVh;
      totalVh = cum;
    }

    buildSegments();

    runway.style.height = (totalVh + 100) + 'vh';

    function segScrollY(seg, frac) {
      var sectionDocTop = section.getBoundingClientRect().top + window.pageYOffset;
      var vhPoint = seg.startVh + seg.vh * clamp(frac, 0, 1);

      return sectionDocTop + (vhPoint / totalVh) *
        Math.max(1, runway.offsetHeight - window.innerHeight);
    }

    var JUMP_LAND_ENTRY_FRAC = 0.35;
    section.walkthroughRevealScrollY = function() {
      return segScrollY(segments[0], JUMP_LAND_ENTRY_FRAC);
    };

    section.focusWalkthrough = function() {
      if (annotationsCol) annotationsCol.focus({ preventScroll: true });
    };

    function remeasure() {
      measurePositions();

      invalidateTargetRectCache();
      buildSegments();
      runway.style.height = (totalVh + 100) + 'vh';

      clearSpotState();
      update();
    }

    var contentObserver = null;
    if ('ResizeObserver' in window) {
      contentObserver = new ResizeObserver(remeasure);
      contentObserver.observe(content);
    }

    var ticking = false;
    var destroyed = false;
    var activeFocus = -1;
    var revealedCount = 0;
    var pendingReveal = false;

    var hopReleased = false;

    var swapReleased = false;

    var exitReleased = false;
    var currentPhoneScrollY = 0;

    var REVEAL_STAGGER_MS = 100;
    var revealTarget = 0;
    var revealTimerId = null;
    var lastRevealStepAt = -Infinity;

    function cancelRevealQueue() {
      if (revealTimerId) { clearTimeout(revealTimerId); revealTimerId = null; }
    }

    function pumpReveal() {
      if (revealTimerId || activeFocus < 0 || revealedCount >= revealTarget) return;
      var wait = Math.max(0, REVEAL_STAGGER_MS - (performance.now() - lastRevealStepAt));
      if (wait > 0) {
        revealTimerId = setTimeout(function() {
          revealTimerId = null;
          pumpReveal();
        }, wait);
        return;
      }
      revealedCount++;
      lastRevealStepAt = performance.now();
      setRevealedCount(activeFocus, revealedCount);

      if (!ticking) { ticking = true; requestAnimationFrame(update); }
      pumpReveal();
    }

    function resetFocusState() {
      cancelRevealQueue();
      revealTarget = 0;
      if (activeFocus >= 0) clearRevealsInFocus(activeFocus);
      annotations.forEach(function(ann) {
        ann.classList.remove('active', 'exiting');
      });
      activeFocus = -1;
      revealedCount = 0;
      pendingReveal = false;
      hopReleased = false;
      swapReleased = false;
      exitReleased = false;

      currentZoom = 1;
      keyNavTarget = -1;
      keyNavSub = -1;

      lastRailFocus = -1;

      lastAnnouncedFocus = -1;
      if (spotSvg) spotSvg.classList.remove('visible');
      clearSpotState();
    }

    function findSegment(scrolledVh) {
      for (var s = 0; s < segments.length; s++) {
        if (scrolledVh < segments[s].startVh + segments[s].vh) return segments[s];
      }
      return segments[segments.length - 1];
    }

    function focusOffsetFrac(i) {
      var ann = annotations[i];
      var v = ann ? parseFloat(ann.getAttribute('data-hold-offset')) : NaN;
      return isNaN(v) ? 0.15 : v;
    }

    function focusRegion(i) {
      return WS.normalizeRegion(annotations[i]);
    }

    function focusZoomChained(i) {
      if (i <= 0 || i >= numFocuses) return false;
      var ann = annotations[i];
      if (!ann || ann.getAttribute('data-zoom-chain') !== 'true') return false;
      var prev = focusZoomSpecEdge(i - 1, 'out');
      var cur = focusZoomSpecEdge(i, 'in');
      return !!(prev && cur &&
        Math.abs(prev.scale - cur.scale) < 0.01 &&
        Math.abs(prev.scrollY - cur.scrollY) < 2);
    }

    function focusCalloutZoom(i) {
      var ann = annotations[i];
      return !!(ann && ann.getAttribute('data-callout-zoom') === 'true');
    }

    function calloutWindow(i, k) {
      var key = i + ':' + k;
      var v = calloutWindowCache[key];
      if (v !== undefined) return v;
      var entry = callouts[i] && callouts[i][k];
      if (!entry) return (calloutWindowCache[key] = null);
      var texts = annotations[i]
        ? annotations[i].querySelectorAll('.walkthrough-callout-text') : [];
      var authored = texts[k] ? WS.normalizeRegion(texts[k], false, 'data-zoom-') : null;
      if (authored && authored.w) return (calloutWindowCache[key] = authored);
      var focusEl = focusEls[i];
      var br = focusEl ? focusEl.getBoundingClientRect() : null;
      if (!br || !br.width || !br.height) return null;
      var L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
      for (var t = 0; t < entry.targets.length; t++) {
        var tg = entry.targets[t];
        if (tg.underline) continue;
        var el = tg.kind === 'dom' ? tg.el : tg.imgEl;
        if (!el) continue;
        var r = el.getBoundingClientRect();
        var l = r.left, tp = r.top, rr = r.right, bb = r.bottom;
        if (tg.kind !== 'dom') {
          l = r.left + (tg.fx || 0) * r.width;
          tp = r.top + (tg.fy || 0) * r.height;
          rr = l + (tg.fw || 0) * r.width;
          bb = tp + (tg.fh || 0) * r.height;
        }
        if (l < L) L = l;
        if (tp < T) T = tp;
        if (rr > R) R = rr;
        if (bb > B) B = bb;
      }
      if (!(R > L && B > T)) return (calloutWindowCache[key] = null);
      v = {
        x: clamp((L - br.left) / br.width, 0, 1),
        y: clamp((T - br.top) / br.height, 0, 1),
        w: clamp((R - L) / br.width, 0.001, 1),
        h: clamp((B - T) / br.height, 0.001, 1),
        xEnd: null
      };
      calloutWindowCache[key] = v;
      return v;
    }

    var ZOOM_SWAP_MIN = 1.02;
    function calloutZoomSpec(i, k) {
      var key = i + ':' + k;
      if (calloutZoomCache[key] !== undefined) return calloutZoomCache[key];
      if (!focusCalloutZoom(i)) return (calloutZoomCache[key] = null);
      var win = calloutWindow(i, k);
      var fp = focusPositions[i];
      if (!win || !fp) return null;

      var spec = WS.zoomFit({
        regX: win.x, regXEnd: win.xEnd, regW: win.w,
        blockLeft: fp.left, blockTop: fp.rawTop + win.y * fp.rawHeight,
        blockWidth: fp.width, blockHeight: win.h * fp.rawHeight,
        frameW: screenWidth, frameH: screenHeight,
        contentW: contentWidth, contentH: contentHeight,
        maxScale: 1.6,
        parkY: focusWaypoints(i)[Math.min(k, focusWaypoints(i).length - 1)].a
      });
      if (spec.scale < ZOOM_SWAP_MIN) spec = null;
      calloutZoomCache[key] = spec;
      return spec;
    }

    function focusZoomSpecEdge(i, edge) {
      if (i < 0 || i >= numFocuses) return null;
      if (!focusCalloutZoom(i)) return focusZoomSpec(i);
      var n = (callouts[i] && callouts[i].length) || 1;
      return calloutZoomSpec(i, edge === 'in' ? 0 : n - 1);
    }

    function slidEnd(s) {
      return s.panXEnd === s.panX ? s
        : { scale: s.scale, panX: s.panXEnd, panXEnd: s.panXEnd, scrollY: s.scrollY };
    }

    function lerpZoomSpec(a, b, t) {
      return {
        scale: a.scale + (b.scale - a.scale) * t,
        panX: a.panX + (b.panX - a.panX) * t,
        panXEnd: a.panXEnd + (b.panXEnd - a.panXEnd) * t,
        scrollY: a.scrollY + (b.scrollY - a.scrollY) * t
      };
    }

    function regionUnionRect(focusEl, reg) {
      var f = WS.regionSpotFrac(reg);
      return { kind: 'rect', imgEl: focusEl, fx: f.fx, fy: f.fy, fw: f.fw, fh: f.fh };
    }

    function focusSlideRendered(i) {
      var spec = focusZoomSpec(i);
      if (!spec) return 0;
      return Math.abs(spec.panXEnd - spec.panX) * spec.scale;
    }

    function focusHoldScale(i) {
      var ann = annotations[i];
      var v = ann ? parseFloat(ann.getAttribute('data-hold-scale')) : NaN;
      return (isFinite(v) && v > 0) ? v : 1;
    }

    var revealAtCache = [];
    function focusRevealAts(i) {
      if (revealAtCache[i]) return revealAtCache[i];
      var n = (callouts[i] && callouts[i].length) || 1;
      var texts = annotations[i]
        ? annotations[i].querySelectorAll('.walkthrough-callout-text') : [];
      var ths = [];
      for (var k = 0; k < n; k++) {
        var v = texts[k] ? parseFloat(texts[k].getAttribute('data-reveal-at')) : NaN;

        ths.push((isFinite(v) && v >= 0 && v < 1) ? v : NaN);
      }
      revealAtCache[i] = ths;
      return ths;
    }

    function focusBasePos(i) {

      return clamp(focusPositions[i].top - visibleH * focusOffsetFrac(i), 0, maxPhoneScroll());
    }

    function maxPhoneScroll() {
      return Math.max(0, contentHeight - visibleH);
    }

    function focusPanDistance(i) {
      var fromPos = focusBasePos(i);
      var blockBottomScroll = focusPositions[i].top + focusPositions[i].height - visibleH;
      var panTo = Math.min(Math.max(0, blockBottomScroll), maxPhoneScroll());
      return Math.max(0, panTo - fromPos);
    }

    function focusPanX(i) {
      if (focusZoom <= 1.0) return 0;
      var focusCenterX = focusPositions[i].left + focusPositions[i].width / 2;
      var targetX = focusCenterX - visibleW / 2;
      var maxX = Math.max(0, contentWidth - visibleW);
      return Math.max(0, Math.min(targetX, maxX));
    }

    function focusZoomSpec(i) {
      if (zoomSpecCache[i] !== undefined) return zoomSpecCache[i];
      var reg = focusRegion(i);
      var fp = focusPositions[i];
      if (!reg || !reg.w || !fp) return (zoomSpecCache[i] = null);

      return (zoomSpecCache[i] = WS.zoomFit({
        regX: reg.x, regXEnd: reg.xEnd, regW: reg.w,
        blockLeft: fp.left, blockTop: fp.top,
        blockWidth: fp.width, blockHeight: fp.height,
        frameW: screenWidth, frameH: screenHeight,
        contentW: contentWidth, contentH: contentHeight,
        maxScale: 1.6,

        parkY: focusWaypoints(i)[0].a
      }));
    }

    function focusWaypoints(i) {
      if (!waypointCache[i]) buildWaypointChains();
      return waypointCache[i];
    }

    function buildWaypointChains() {
      var all = [];
      for (var i = 0; i < numFocuses; i++) {
        var n = (callouts[i] && callouts[i].length) || 0;
        var fromPos = focusBasePos(i);
        var ws = [];
        var prev = fromPos;
        for (var k = 0; k < n; k++) {
          var wp = WG.waypointPair(
            calloutContentSpan(i, k), prev, visibleH, FRAME_PAD, maxPhoneScroll());
          ws.push(wp);
          prev = wp.b;
        }

        if (!ws.length) {
          var legacyB = Math.min(fromPos + focusPanDistance(i), maxPhoneScroll());
          ws.push(legacyB - fromPos > visibleH * 0.8
            ? { a: legacyB, b: legacyB }
            : { a: fromPos, b: legacyB });
        }
        all.push(ws);
      }
      WG.chainSeams(all);
      for (var c = 0; c < all.length; c++) waypointCache[c] = all[c];
    }

    function focusHoldEnd(i) {
      var ws = focusWaypoints(i);
      return ws[ws.length - 1].b;
    }

    function holdPanOrigin(i) {
      return (i === 0 && entryPanOptIn) ? focusBasePos(0) : focusWaypoints(i)[0].a;
    }

    function focusSubWindows(i) {
      if (subWindowCache[i]) return subWindowCache[i];
      var ws = focusWaypoints(i);

      var hopMin = null;
      if (focusCalloutZoom(i)) {
        hopMin = [];
        for (var hk = 0; hk < ws.length; hk++) hopMin.push(hk > 0 ? ZOOM_SWAP_VH + SWAP_LEAD_VH : 0);
      }
      var slideK = null;
      if (hopMin) {
        slideK = [];
        for (var sk = 0; sk < ws.length; sk++) {
          var cs = ws[sk].b === ws[sk].a ? calloutZoomSpec(i, sk) : null;
          slideK.push(cs ? Math.abs(cs.panXEnd - cs.panX) * cs.scale : 0);
        }
      }
      var sw = WG.subWindows({
        waypoints: ws,
        origin: holdPanOrigin(i),
        hopMinVh: hopMin,
        dwellVh: DWELL_VH * focusHoldScale(i),
        headDwellVh: HEAD_DWELL_VH * focusHoldScale(i),
        tailDwellVh: TAIL_DWELL_VH * focusHoldScale(i),
        exitBufferVh: EXIT_BUFFER_VH * focusHoldScale(i),
        travRunwayCapVh: TRAV_RUNWAY_CAP_VH,
        panRateVh: panRateVh,
        visibleH: visibleH,
        innerH: window.innerHeight,
        frameW: screenWidth,

        slidePx: (ws[0] && ws[0].b === ws[0].a) ? focusSlideRendered(i) : 0,

        slidePxK: slideK,
        travSlowPagePerPx: TRAV_SLOW_PAGE_PER_PX,
        framePad: FRAME_PAD,
        slideSlowVh: SLIDE_SLOW_VH,
        zoomRamp: ZOOM_RAMP,
        slideRunway: SLIDE_RUNWAY
      });
      subWindowCache[i] = sw;
      return sw;
    }

    function panEase(t, movePx) {
      return WG.panEase(t, movePx, visibleH);
    }

    function update() {

      if (destroyed) { ticking = false; return; }
      var sectionRect = section.getBoundingClientRect();
      var scrolled = -sectionRect.top;
      var totalPx = runway.offsetHeight;

      if (fadeCover && entranceContainer) {
        var winH = window.innerHeight;
        var topInView = sectionRect.top;
        var riseT = easeOutCubic(clamp((winH * 0.6 - topInView) / (winH * 0.6), 0, 1));
        entranceContainer.style.opacity = riseT;
        entranceContainer.style.transform = 'translateY(' + ((1 - riseT) * 48) + 'px)';

        var coverT = clamp((winH * 0.45 - topInView) / (winH * 0.6), 0, 1);
        fadeCover.style.opacity = 1 - coverT;

        fadeCover.style.visibility = coverT >= 1 ? 'hidden' : '';
      }

      if (scrolled < 0 || scrolled > totalPx) {

        if (activeFocus >= 0) resetFocusState();

        setFlickListener(false);
        flickBailedOut = false;
        flickCommits.length = 0;

        if (scrolled < 0) WS.publishStop(section, -1, numFocuses, 'entry');
        else WS.publishStop(section, numFocuses - 1, numFocuses, 'exit');

        if (scrolled < 0 && !entryPanOptIn) {
          var park0 = holdPanOrigin(0);
          var parkX0 = focusPanX(0);

          if (currentPhoneScrollY !== park0 || currentPhonePanX !== parkX0 || currentZoom !== 1) {
            currentPhoneScrollY = park0;
            currentPhonePanX = parkX0;
            currentZoom = 1;
            if (focusZoom !== 1) {
              content.style.transformOrigin = '0 0';
              content.style.transform = 'scale(' + focusZoom + ') translate(' + (-parkX0) + 'px, ' + (-park0) + 'px)';
            } else {
              content.style.transform = 'translateY(' + (-park0) + 'px)';
            }
          }
        }
        ticking = false;
        return;
      }

      setFlickListener(true);

      var progress = clamp(scrolled / Math.max(1, totalPx - window.innerHeight), 0, 1);
      var scrolledVh = progress * totalVh;
      var seg = findSegment(scrolledVh);
      var segProgress = (scrolledVh - seg.startVh) / seg.vh;

      var targetScrollY = currentPhoneScrollY;
      var targetPanX = 0;
      var newActiveFocus = -1;
      var newRevealedCount = 0;
      var newHopReleased = false;
      var newSwapReleased = false;
      var newExitReleased = false;

      var zoomEnv = 0;
      var zoomSpecLive = null;

      var zoomDwellQ = 0;
      var zs, zx, zy;

      if (seg.type === 'entry') {
        if (entryPanOptIn) {

          var holdFrac = ENTRY_HOLD_VH / (ENTRY_HOLD_VH + entryVh);
          var panQ = clamp((segProgress - holdFrac) / (1 - holdFrac), 0, 1);
          var firstPos = focusBasePos(0);
          targetScrollY = firstPos * easeOutCubic(panQ);
          targetPanX = focusPanX(0) * easeOutCubic(panQ);
        } else {

          targetScrollY = holdPanOrigin(0);
          targetPanX = focusPanX(0);
        }

      } else if (seg.type === 'hold') {
        var i = seg.focusIdx;
        var n = seg.subStepCount;
        var fromPos = holdPanOrigin(i);

        var holdQ = segProgress;

        var ws = focusWaypoints(i);
        var sw = focusSubWindows(i);
        var nw = ws.length;
        var wIdx = nw - 1;
        for (var wj = 0; wj < nw; wj++) {
          if (holdQ < sw.bounds[wj + 1]) { wIdx = wj; break; }
        }
        var wSpan = Math.max(1e-6, sw.bounds[wIdx + 1] - sw.bounds[wIdx]);
        var wLocal = clamp((holdQ - sw.bounds[wIdx]) / wSpan, 0, 1);
        var wFrom = wIdx === 0 ? fromPos : ws[wIdx - 1].b;
        var wp = ws[wIdx];
        var share = sw.panShares[wIdx] || 0;
        var calloutZoomHere = focusCalloutZoom(i);

        var inSwap = calloutZoomHere && wIdx > 0 && wLocal < share;
        var specPrev = inSwap ? calloutZoomSpec(i, wIdx - 1) : null;
        var specHere = inSwap ? calloutZoomSpec(i, wIdx) : null;
        var swapZooms = !!(specPrev || specHere);

        var swapQ = 0;
        if (inSwap) {
          var hopVhLive = share * (sw.bounds[wIdx + 1] - sw.bounds[wIdx]) * sw.totalVh;
          var leadQ = swapZooms ? Math.min(0.5, SWAP_LEAD_VH / Math.max(1e-6, hopVhLive)) : 0;
          swapQ = clamp((wLocal / share - leadQ) / Math.max(1e-6, 1 - leadQ), 0, 1);
        }
        if (wLocal < share) {
          var pq = inSwap ? swapQ : wLocal / share;
          targetScrollY = wFrom + (wp.a - wFrom) * panEase(pq, wp.a - wFrom);
        } else {

          var head = sw.headShares[wIdx] || 0;
          var tail = sw.tailShares[wIdx] || 0;
          var dq = clamp((wLocal - share - head) /
            Math.max(1e-6, 1 - share - head - tail), 0, 1);
          targetScrollY = wp.a + (wp.b - wp.a) * dq;
        }
        targetPanX = focusPanX(i);

        var swapping = false;
        if (inSwap) {
          var sq = easeOutCubic(swapQ);
          swapping = true;

          if (specPrev && specHere) { zoomSpecLive = lerpZoomSpec(slidEnd(specPrev), specHere, sq); zoomEnv = 1; }
          else if (specPrev) { zoomSpecLive = slidEnd(specPrev); zoomEnv = 1 - sq; }
          else if (specHere) { zoomSpecLive = specHere; zoomEnv = sq; }
        } else if (calloutZoomHere) {
          zoomSpecLive = calloutZoomSpec(i, wIdx);
        } else if (wp.b === wp.a) {
          zoomSpecLive = focusZoomSpec(i);
        }

        var restAfterZoomOut = false;
        if (zoomSpecLive && !swapping) {
          var dwellSpan = Math.max(1e-6, 1 - share - (sw.tailShares[wIdx] || 0));
          var zq = clamp((wLocal - share) / dwellSpan, 0, 1);

          var chainIn = wIdx === 0 && focusZoomChained(i);
          var chainOut = wIdx === nw - 1 && focusZoomChained(i + 1);

          var rampIn = !calloutZoomHere || wIdx === 0;
          var rampOut = !calloutZoomHere || wIdx === nw - 1;
          zoomEnv = (rampIn && zq < ZOOM_RAMP) ? (chainIn ? 1 : easeOutCubic(zq / ZOOM_RAMP))
                  : (rampOut && zq > 1 - ZOOM_RAMP) ? (chainOut ? 1 : easeOutCubic((1 - zq) / ZOOM_RAMP))
                  : 1;
          restAfterZoomOut = rampOut && !chainOut && zq >= 1;

          newExitReleased = calloutZoomHere && rampOut && !chainOut && zq > 1 - ZOOM_RAMP;

          zoomDwellQ = clamp((zq - ZOOM_RAMP - SLIDE_RUNWAY) /
            Math.max(1e-6, 1 - 2 * (ZOOM_RAMP + SLIDE_RUNWAY)), 0, 1);
        }

        newHopReleased = (wLocal < share && (wp.a - wFrom) > visibleH * 0.35) ||
                         (zoomEnv > 0 && zoomEnv < 1) || swapping || restAfterZoomOut;

        newSwapReleased = swapping && swapZooms;

        var ths = focusRevealAts(i);
        newRevealedCount = 0;
        for (var kk = 0; kk < n; kk++) {
          var b0 = sw.bounds[kk] || 0;
          var b1 = sw.bounds[kk + 1] || 1;
          var panDone = b0 + (sw.panShares[kk] || 0) * (b1 - b0);
          var ov = ths[kk];
          var due = holdQ >= (isFinite(ov) ? ov : panDone);
          var span = calloutContentSpan(i, kk);
          var show;
          if (!span) {
            show = due;
          } else {
            var topView = span.top - targetScrollY;
            var leaving = topView <= EXIT_PAD;
            if (isFinite(ov) && ov < panDone) {
              var botView = span.bottom - targetScrollY;
              var spanH = span.bottom - span.top;
              var visFrac = Math.max(0, Math.min(botView, visibleH) - Math.max(topView, 0)) / spanH;
              var framed = botView <= visibleH - FRAME_PAD ||
                           (visFrac >= 0.72 && topView <= visibleH * 0.45);
              var tooTall = spanH > (visibleH - 2 * FRAME_PAD);
              show = (due && (framed || tooTall || holdQ >= panDone)) || leaving;
            } else {
              show = due || leaving;
            }
          }
          if (show) newRevealedCount = kk + 1;
        }

        newActiveFocus = newRevealedCount > 0 ? i : -1;

      } else if (seg.type === 'transit') {
        var from = seg.from, to = seg.to;

        var toPos2 = focusWaypoints(to)[0].a;

        var adjustedFrom = focusHoldEnd(from);
        var t = panEase(segProgress, toPos2 - adjustedFrom);
        targetScrollY = adjustedFrom + (toPos2 - adjustedFrom) * t;

        var fromPanX = focusPanX(from);
        var toPanX = focusPanX(to);
        targetPanX = fromPanX + (toPanX - fromPanX) * t;

        if (focusZoomChained(to)) {
          var sf = focusZoomSpecEdge(from, 'out');
          var st = focusZoomSpecEdge(to, 'in');
          var snapX = sf.panXEnd + (st.panX - sf.panXEnd) * t;
          zoomSpecLive = {
            scale: st.scale, panX: snapX, panXEnd: snapX,
            scrollY: sf.scrollY + (st.scrollY - sf.scrollY) * t
          };
          zoomEnv = 1;
          zoomDwellQ = 0;
        }

        newActiveFocus = -1;
        newRevealedCount = 0;

      } else if (seg.type === 'exit') {
        var lastIdx = numFocuses - 1;

        var lastEnd = focusHoldEnd(lastIdx);
        var endPos = maxPhoneScroll();
        var tExit = easeOutCubic(segProgress);
        targetScrollY = lastEnd + (endPos - lastEnd) * tExit;

        var lastPanX = focusPanX(lastIdx);
        targetPanX = lastPanX * (1 - easeOutCubic(segProgress));

        newActiveFocus = -1;
        newRevealedCount = 0;
      }

      setScrollHint(seg.type === 'entry');

      setSkipDone(seg.type === 'exit');

      zs = 1; zx = targetPanX; zy = targetScrollY;
      if (zoomSpecLive && zoomEnv > 0) {
        zs = 1 + (zoomSpecLive.scale - 1) * zoomEnv;

        var panXAim = zoomSpecLive.panX
          + (zoomSpecLive.panXEnd - zoomSpecLive.panX) * trapEase(zoomDwellQ, SLIDE_EASE);
        zx = targetPanX + (panXAim - targetPanX) * zoomEnv;
        zy = targetScrollY + (zoomSpecLive.scrollY - targetScrollY) * zoomEnv;
      }
      currentPhoneScrollY = zy;
      currentPhonePanX = zx;
      currentZoom = zs;
      var eff = focusZoom * zs;
      if (eff !== 1) {
        content.style.transformOrigin = '0 0';
        content.style.transform = 'scale(' + eff + ') translate(' + (-zx) + 'px, ' + (-zy) + 'px)';
      } else {
        content.style.transform = 'translateY(' + (-zy) + 'px)';
      }
      syncLazyVideos();

      if (newActiveFocus !== activeFocus) {

        if (activeFocus >= 0) clearRevealsInFocus(activeFocus);

        annotations.forEach(function(ann, i) {
          if (i === newActiveFocus) {
            ann.classList.remove('exiting');
            ann.classList.add('active');
          } else if (i === activeFocus) {
            ann.classList.remove('active');
            ann.classList.add('exiting');
          } else {
            ann.classList.remove('active', 'exiting');
          }
        });

        activeFocus = newActiveFocus;
        setAnnotationTabAccess(newActiveFocus);
        pendingReveal = true;
        announceFocus(newActiveFocus);
        if (newActiveFocus >= 0) startLineSettle(750);

        if (activeFocus === keyNavTarget &&
            seg.type === 'hold' && seg.focusIdx === keyNavTarget) {
          keyNavTarget = -1;
          keyNavSub = -1;
        }
      }

      if (pendingReveal || newRevealedCount !== revealTarget) {
        revealTarget = newRevealedCount;
        cancelRevealQueue();
        if (activeFocus < 0) {
          revealedCount = revealTarget;
        } else if (pendingReveal) {
          revealedCount = 0;
          setRevealedCount(activeFocus, 0);
          pumpReveal();
        } else if (revealTarget <= revealedCount) {
          setRevealedCount(activeFocus, revealTarget);
          revealedCount = revealTarget;
        } else {
          pumpReveal();
        }
        pendingReveal = false;
      }

      if (newHopReleased !== hopReleased || newSwapReleased !== swapReleased ||
          newExitReleased !== exitReleased) {
        hopReleased = newHopReleased;
        swapReleased = newSwapReleased;
        exitReleased = newExitReleased;
        if (activeFocus >= 0) setRevealedCount(activeFocus, revealedCount);
      }

      var phoneScreenRect = phoneScreen ? phoneScreen.getBoundingClientRect() : null;
      if (linesSvg && phoneFrame && phoneScreenRect && activeFocus >= 0) {
        updateLines(phoneScreenRect);
      }
      if (spotSvg && phoneScreenRect) updateSpotlight(phoneScreenRect);

      var railFocus = activeFocus;
      if (railFocus < 0 && seg.type === 'transit') railFocus = seg.from;

      if (railFocus < 0 && seg.type === 'hold') railFocus = seg.focusIdx - 1;

      if (railFocus < 0 && seg.type === 'exit') railFocus = numFocuses - 1;
      if (railFocus >= 0) lastRailFocus = railFocus;

      if (seg.type === 'entry') lastRailFocus = -1;

      WS.publishStop(section, railFocus, numFocuses,
        seg.type === 'entry' ? 'entry' : seg.type === 'exit' ? 'exit' : 'tour');

      ticking = false;
    }

    function clipSpotBounds(b) {
      var right = b.x + b.w, bottom = b.y + b.h;
      var x = Math.max(0, b.x);
      var y = Math.max(0, b.y);
      return { x: x, y: y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
    }

    function applySpotBounds(el, b, cache) {
      if (!el) return false;
      var c = clipSpotBounds(b);
      var EPS = 0.5;
      var changed = false;
      if (!cache || Math.abs(cache.x - c.x) > EPS) { el.style.x = c.x + 'px'; changed = true; }
      if (!cache || Math.abs(cache.y - c.y) > EPS) { el.style.y = c.y + 'px'; changed = true; }
      if (!cache || Math.abs(cache.w - c.w) > EPS) { el.style.width  = c.w + 'px'; changed = true; }
      if (!cache || Math.abs(cache.h - c.h) > EPS) { el.style.height = c.h + 'px'; changed = true; }
      return changed;
    }

    function applyBoth(bounds) {
      var leadChanged  = applySpotBounds(spotLeadEl,  bounds, spotLastBounds);
      var trailChanged = applySpotBounds(spotTrailEl, bounds, spotLastBounds);
      if (leadChanged || trailChanged) {
        spotLastBounds = clipSpotBounds(bounds);
        spotLastTrailBounds = spotLastBounds;
      }
    }

    function applyLeadTrail(leadB, trailB) {
      applySpotBounds(spotLeadEl,  leadB,  null);
      applySpotBounds(spotTrailEl, trailB, null);
      spotLastBounds      = clipSpotBounds(leadB);
      spotLastTrailBounds = clipSpotBounds(trailB);
    }

    function neckThickness(leadB, trailB, dist) {
      if (dist < 0.5) return 0;
      var body = Math.min(leadB.w, leadB.h, trailB.w, trailB.h);
      if (!(body > 0)) return 0;
      var t = 1 - dist / (body * SPOT_NECK_BREAK_RATIO);
      if (t <= 0) return 0;

      return Math.min(SPOT_BRIDGE_MAX_THICKNESS, body) * Math.pow(t, 1.5) * Math.min(1, dist / 6);
    }

    function applyBridgeLine(leadB, trailB) {
      if (!spotBridgeEl) return;
      var lcx = leadB.x  + leadB.w  / 2;
      var lcy = leadB.y  + leadB.h  / 2;
      var tcx = trailB.x + trailB.w / 2;
      var tcy = trailB.y + trailB.h / 2;
      var dx = lcx - tcx;
      var dy = lcy - tcy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      spotBridgeEl.setAttribute('x1', lcx);
      spotBridgeEl.setAttribute('y1', lcy);
      spotBridgeEl.setAttribute('x2', tcx);
      spotBridgeEl.setAttribute('y2', tcy);
      spotBridgeEl.setAttribute('stroke-width', neckThickness(leadB, trailB, dist));
    }

    function lerpBounds(a, b, t) {
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        w: a.w + (b.w - a.w) * t,
        h: a.h + (b.h - a.h) * t
      };
    }

    function pourSeed(b) {
      var s = SPOT_POUR_SEED;
      var cx = clamp(b.x + b.w, s / 2, SPOT_VB_W - s / 2);
      var cy = clamp(b.y + b.h / 2, s / 2, SPOT_VB_H - s / 2);
      return { x: cx - s / 2, y: cy - s / 2, w: s, h: s };
    }

    function setGooBlur(value) {
      if (spotGooBlur) spotGooBlur.setAttribute('stdDeviation', value);

      if (spotSvg) spotSvg.classList.toggle('is-blurring', value > SPOT_GOO_BLUR_IDLE);
    }

    function cancelMorph() {
      if (morphRafId) { cancelAnimationFrame(morphRafId); morphRafId = null; }
      morphTarget = null;

      setGooBlur(SPOT_GOO_BLUR_IDLE);
    }

    function clearSpotState() {
      spotLastFocusIdx = -1;
      spotLastSubIdx = -1;
      spotLastBounds = null;
      spotLastTrailBounds = null;
      cancelMorph();
    }

    function startMorph(oldLead, oldTrail, newB, holdMs, pour) {
      cancelMorph();
      morphTarget = newB;
      morphStartedAt = performance.now();
      var startTime = morphStartedAt;
      holdMs = holdMs || 0;
      function step(now) {
        var ms = now - startTime - holdMs;

        var tgt = morphTarget || newB;
        if (ms >= SPOT_MORPH_CAP_MS) {

          applyLeadTrail(tgt, tgt);
          applyBridgeLine(tgt, tgt);
          setGooBlur(SPOT_GOO_BLUR_IDLE);
          morphRafId = null;
          morphTarget = null;
          return;
        }
        var leadT  = WS.springStep(ms / 1000, SPOT_SPRING_OMEGA, SPOT_SPRING_ZETA);
        var trailT = pour ? leadT
          : WS.springStep((ms - SPOT_TRAIL_LAG_MS) / 1000, SPOT_SPRING_OMEGA, SPOT_SPRING_ZETA);
        var leadB  = lerpBounds(oldLead,  tgt, leadT);
        var trailB = lerpBounds(oldTrail, tgt, trailT);
        applyLeadTrail(leadB, trailB);
        applyBridgeLine(leadB, trailB);

        var p = clamp(ms / SPOT_BLUR_WINDOW_MS, 0, 1);
        setGooBlur(SPOT_GOO_BLUR_IDLE + (SPOT_GOO_BLUR_PEAK - SPOT_GOO_BLUR_IDLE) * Math.sin(Math.PI * p));
        morphRafId = requestAnimationFrame(step);
      }
      morphRafId = requestAnimationFrame(step);
    }

    var spotVb = spotSvg && spotSvg.viewBox && spotSvg.viewBox.baseVal;
    var SPOT_VB_W = (spotVb && spotVb.width) || 492;
    var SPOT_VB_H = (spotVb && spotVb.height) || 1016;

    function computeSpotBounds(focusIdx, entryIdx, entry, phoneScreenRect) {

      var pad = 5;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var t = 0; t < entry.targets.length; t++) {
        var tg = entry.targets[t];

        if (tg.underline) continue;
        var base = targetViewportRect(focusIdx, entryIdx, t, tg, phoneScreenRect);
        var l, top, r, b;
        if (tg.kind === 'dom') {
          l = base.left; top = base.top; r = base.right; b = base.bottom;
        } else {

          l   = base.left + base.width  * tg.fx;
          top = base.top  + base.height * tg.fy;
          r   = base.left + base.width  * (tg.fx + tg.fw);
          b   = base.top  + base.height * (tg.fy + tg.fh);
        }
        if (l   < minX) minX = l;
        if (top < minY) minY = top;
        if (r   > maxX) maxX = r;
        if (b   > maxY) maxY = b;
      }
      if (minX === Infinity) return null;

      if (phoneScreenRect.width <= 0 || phoneScreenRect.height <= 0) return null;
      var sx = SPOT_VB_W / phoneScreenRect.width;
      var sy = SPOT_VB_H / phoneScreenRect.height;
      return {
        x: (minX - phoneScreenRect.left) * sx - pad,
        y: (minY - phoneScreenRect.top)  * sy - pad,
        w: (maxX - minX) * sx + pad * 2,
        h: (maxY - minY) * sy + pad * 2
      };
    }

    function updateSpotlight(phoneScreenRect) {

      if (activeFocus < 0 || revealedCount <= 0 || hopReleased) {
        if (spotLastFocusIdx !== -1 || spotLastSubIdx !== -1) {
          debugLog('walkthrough-spot', 'hide (inactive)');
        }
        spotSvg.classList.remove('visible');
        clearSpotState();
        return;
      }

      var entries = callouts[activeFocus];
      var subIdx = Math.min(revealedCount - 1, entries.length - 1);
      var entry = entries[subIdx];
      if (!entry) {
        spotSvg.classList.remove('visible');
        clearSpotState();
        return;
      }

      var bounds = computeSpotBounds(activeFocus, subIdx, entry, phoneScreenRect);
      if (!bounds) {
        spotSvg.classList.remove('visible');
        clearSpotState();
        return;
      }

      var isFirstReveal = (spotLastFocusIdx === -1 || !spotLastBounds);
      var isSubStepChange = (activeFocus === spotLastFocusIdx && subIdx !== spotLastSubIdx);

      if (isFirstReveal && spotReducedMotion) {
        cancelMorph();
        applyBoth(bounds);
        applyBridgeLine(bounds, bounds);
        debugLog('walkthrough-spot', 'first reveal (reduced motion: snap)', { focus: activeFocus, sub: subIdx, bounds: bounds });
      } else if (isFirstReveal) {

        var seed = pourSeed(bounds);
        applyBoth(seed);
        applyBridgeLine(seed, seed);
        debugLog('walkthrough-spot', 'first reveal (pour)', { focus: activeFocus, sub: subIdx, bounds: bounds, seed: seed });
        startMorph(seed, seed, { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
          entry.noLine ? 0 : SPOT_POUR_DELAY_MS, true);
      } else if (isSubStepChange && spotReducedMotion) {
        cancelMorph();
        applyBoth(bounds);
        applyBridgeLine(bounds, bounds);
      } else if (isSubStepChange) {

        var oldLead  = { x: spotLastBounds.x, y: spotLastBounds.y, w: spotLastBounds.w, h: spotLastBounds.h };
        var oldTrail = spotLastTrailBounds
          ? { x: spotLastTrailBounds.x, y: spotLastTrailBounds.y, w: spotLastTrailBounds.w, h: spotLastTrailBounds.h }
          : oldLead;
        var newB = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
        debugLog('walkthrough-spot', 'morph', {
          from: { focus: spotLastFocusIdx, sub: spotLastSubIdx, lead: oldLead, trail: oldTrail },
          to:   { focus: activeFocus,      sub: subIdx,         bounds: newB }
        });
        startMorph(oldLead, oldTrail, newB);
      } else if (morphRafId) {

        morphTarget = bounds;

        if (performance.now() - morphStartedAt > (SPOT_MORPH_CAP_MS + SPOT_POUR_DELAY_MS) * 2) {
          debugLog('walkthrough-spot', 'morph overdue — forcing settle');
          cancelMorph();
          applyBoth(bounds);
          applyBridgeLine(bounds, bounds);
        }
      } else {

        applyBoth(bounds);
        applyBridgeLine(bounds, bounds);
      }

      spotSvg.classList.add('visible');
      spotLastFocusIdx = activeFocus;
      spotLastSubIdx = subIdx;
    }

    function computeTargetPoint(target, baseRect, layoutRect, phoneTop, phoneBottom, phoneScreenRect) {

      var phoneLeft = phoneScreenRect
        ? phoneScreenRect.left - layoutRect.left - (BEZEL_REACH_PX - 1.5)
        : -Infinity;
      var phoneRight = phoneScreenRect
        ? phoneScreenRect.left - layoutRect.left + phoneScreenRect.width + (BEZEL_REACH_PX - 1.5)
        : Infinity;
      if (target.kind === 'dom') {

        return {
          x: Math.max(phoneLeft, Math.min(baseRect.right - layoutRect.left + 5, phoneRight)),
          y: Math.max(phoneTop, Math.min(baseRect.top - layoutRect.top + baseRect.height / 2, phoneBottom))
        };
      }

      var padCss = (phoneScreenRect && phoneScreenRect.width > 0)
        ? 5 * phoneScreenRect.width / SPOT_VB_W
        : 5;
      return {
        x: Math.max(phoneLeft, Math.min(baseRect.left - layoutRect.left + baseRect.width * (target.fx + target.fw) + padCss, phoneRight)),
        y: Math.max(phoneTop, Math.min(baseRect.top - layoutRect.top + baseRect.height * (target.fy + target.fh / 2), phoneBottom))
      };
    }

    function computeEntryBoxBoundsCss(focusIdx, entryIdx, entry, layoutRect, phoneScreenRect) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var t = 0; t < entry.targets.length; t++) {
        var tg = entry.targets[t], l, top, r, b;
        if (tg.underline) continue;
        var base = targetViewportRect(focusIdx, entryIdx, t, tg, phoneScreenRect);
        if (tg.kind === 'dom') {
          l = base.left; top = base.top; r = base.right; b = base.bottom;
        } else {
          l   = base.left + base.width  * tg.fx;
          top = base.top  + base.height * tg.fy;
          r   = base.left + base.width  * (tg.fx + tg.fw);
          b   = base.top  + base.height * (tg.fy + tg.fh);
        }
        if (l   < minX) minX = l;
        if (top < minY) minY = top;
        if (r   > maxX) maxX = r;
        if (b   > maxY) maxY = b;
      }
      if (minX === Infinity) return null;
      var pad = entry.outlineEl
        ? 5
        : ((phoneScreenRect && phoneScreenRect.width > 0) ? 5 * phoneScreenRect.width / SPOT_VB_W : 5);
      return {
        x: minX - layoutRect.left - pad,
        y: minY - layoutRect.top  - pad,
        w: (maxX - minX) + 2 * pad,
        h: (maxY - minY) + 2 * pad
      };
    }

    function clampBloomBox(b, layoutRect, phoneScreenRect) {
      if (!b || !phoneScreenRect || !(phoneScreenRect.width > 0)) return b;
      var hs = 1.5;
      var cutL = phoneScreenRect.left - layoutRect.left - BEZEL_REACH_PX + hs;
      var cutT = phoneScreenRect.top  - layoutRect.top  + hs;
      var cutR = cutL + phoneScreenRect.width + 2 * BEZEL_REACH_PX - 2 * hs;
      var cutB = cutT + phoneScreenRect.height - 2 * hs;
      var x0 = Math.max(b.x, cutL), x1 = Math.min(b.x + b.w, cutR);

      var v = WS.outlineSpan(b.y, b.y + b.h, cutT, cutB,
        WS.BOX_EDGE_SNAP_PX, WS.BOX_EDGE_RUNOFF_PX);
      return { x: x0, y: v.y0, w: Math.max(0, x1 - x0), h: Math.max(0, v.y1 - v.y0) };
    }

    function buildBloomPath(b, r, direction) {
      if (!b) return '';
      var rc = Math.min(r, b.w / 2, b.h / 2);
      var sx = b.x + b.w, sy = b.y + b.h / 2;
      var ex = b.x,       ey = b.y + b.h / 2;
      if (direction === 'down') {
        return 'M' + sx + ',' + sy +
               ' L' + sx + ',' + (b.y + b.h - rc) +
               ' A' + rc + ',' + rc + ' 0 0 1 ' + (b.x + b.w - rc) + ',' + (b.y + b.h) +
               ' L' + (b.x + rc) + ',' + (b.y + b.h) +
               ' A' + rc + ',' + rc + ' 0 0 1 ' + b.x + ',' + (b.y + b.h - rc) +
               ' L' + ex + ',' + ey;
      }
      return 'M' + sx + ',' + sy +
             ' L' + sx + ',' + (b.y + rc) +
             ' A' + rc + ',' + rc + ' 0 0 0 ' + (b.x + b.w - rc) + ',' + b.y +
             ' L' + (b.x + rc) + ',' + b.y +
             ' A' + rc + ',' + rc + ' 0 0 0 ' + b.x + ',' + (b.y + rc) +
             ' L' + ex + ',' + ey;
    }

    function updateLines(phoneScreenRect) {
      if (!layoutEl || !phoneFrame || !phoneScreen) return;
      if (activeFocus < 0) return;
      var layoutRect = layoutEl.getBoundingClientRect();
      if (!phoneScreenRect) phoneScreenRect = phoneScreen.getBoundingClientRect();
      var phoneTop = phoneScreenRect.top - layoutRect.top;
      var phoneBottom = phoneTop + phoneScreenRect.height;

      var writes = [];
      var put = function(el, attr, v) { writes.push(el, attr, v); };
      var toDraw = [];

      if (bloomClipRect) {

        put(bloomClipRect, 'x', phoneScreenRect.left - layoutRect.left - BEZEL_REACH_PX);
        put(bloomClipRect, 'y', phoneTop);
        put(bloomClipRect, 'width', phoneScreenRect.width + 2 * BEZEL_REACH_PX);
        put(bloomClipRect, 'height', phoneScreenRect.height);
        put(bloomClipRect, 'rx', screenRadius);
      }

      var focusList = [activeFocus];
      for (var k = 0; k < focusList.length; k++) {
        var i = focusList[k];
        var entries = callouts[i];
        if (!entries) continue;

        var boxes = [];
        for (var j = 0; j < entries.length; j++) {
          var c = entries[j];
          if (!c.targets.length) continue;

          if (c.lineEl && c.annTextEl) {

            var annRect = c.annTextEl.getBoundingClientRect();
            if (c.lineH === undefined) {
              c.lineH = parseFloat(getComputedStyle(c.annTextEl).lineHeight) || 24;
            }
            var ax = annRect.left - layoutRect.left - 10;
            var ay = annRect.top - layoutRect.top + c.lineH / 2;

            var pts = [];
            var maxX = -Infinity;
            for (var t = 0; t < c.targets.length; t++) {
              if (c.targets[t].underline) { pts.push(null); continue; }
              var baseRect = targetViewportRect(i, j, t, c.targets[t], phoneScreenRect);
              var pt = computeTargetPoint(c.targets[t], baseRect, layoutRect, phoneTop, phoneBottom, phoneScreenRect);
              pts.push(pt);
              if (pt.x > maxX) maxX = pt.x;
            }

            var jx = Math.min(Math.max(maxX + 12, ax - 24), ax - 12);

            var d = 'M' + ax + ',' + ay + ' L' + jx + ',' + ay;

            for (var b = 0; b < pts.length; b++) {
              if (!pts[b]) continue;
              d += ' M' + jx + ',' + ay + ' L' + jx + ',' + pts[b].y + ' L' + pts[b].x + ',' + pts[b].y;
            }

            put(c.lineEl, 'd', d);
            put(c.dotAEl, 'cx', ax);
            put(c.dotAEl, 'cy', ay);
            for (var dp = 0; dp < pts.length; dp++) {
              if (pts[dp] && c.dotPEls[dp]) {
                put(c.dotPEls[dp], 'cx', pts[dp].x);
                put(c.dotPEls[dp], 'cy', pts[dp].y);
              }
            }
          }

          if (c.underlineEls) {
            for (var uu = 0; uu < c.underlineEls.length; uu++) {
              if (!c.underlineEls[uu]) continue;
              var utg = c.targets[uu];
              var ubase = targetViewportRect(i, j, uu, utg, phoneScreenRect);
              var ux1 = ubase.left - layoutRect.left + ubase.width * utg.fx;
              var ux2 = ux1 + ubase.width * utg.fw;
              var uy = ubase.top - layoutRect.top + ubase.height * (utg.fy + utg.fh);
              put(c.underlineEls[uu], 'd', 'M' + ux1 + ',' + uy + ' L' + ux2 + ',' + uy);
            }
          }

          if (c.bloomUpEl && c.bloomDownEl) {
            boxes[j] = clampBloomBox(
              computeEntryBoxBoundsCss(i, j, c, layoutRect, phoneScreenRect),
              layoutRect, phoneScreenRect);
          }
        }
        toDraw.push(entries, boxes);
      }
      for (var w = 0; w < writes.length; w += 3) writes[w].setAttribute(writes[w + 1], writes[w + 2]);
      for (var dw = 0; dw < toDraw.length; dw += 2) drawBlooms(toDraw[dw], toDraw[dw + 1]);
    }

    function drawBlooms(entries, boxes) {
      var live = (swapReleased || exitReleased) ? -1 : revealedCount - 1;
      var placed = live >= 0 && boxes[live] ? [boxes[live]] : [];
      for (var j = entries.length - 1; j >= 0; j--) {
        var c = entries[j];
        if (!c.bloomUpEl || !c.bloomDownEl) continue;
        var b = boxes[j];
        var occluded = false;
        if (b && j !== live && j < revealedCount) {
          for (var p = 0; p < placed.length && b; p++) b = WS.ghostOutline(b, placed[p]);
          if (b) placed.push(b);
          else occluded = true;
        }
        if (b) {
          c.bloomUpEl.setAttribute('d',   buildBloomPath(b, 8, 'up'));
          c.bloomDownEl.setAttribute('d', buildBloomPath(b, 8, 'down'));
        }
        c.bloomUpEl.classList.toggle('is-occluded', occluded);
        c.bloomDownEl.classList.toggle('is-occluded', occluded);
      }
    }

    var lineSettleRaf = null;
    var lineSettleUntil = 0;
    function startLineSettle(ms) {
      lineSettleUntil = Math.max(lineSettleUntil, performance.now() + ms);
      if (lineSettleRaf) return;
      function settleTick(now) {
        lineSettleRaf = null;
        if (destroyed) return;
        var rect = phoneScreen ? phoneScreen.getBoundingClientRect() : null;
        if (linesSvg && phoneFrame && rect && activeFocus >= 0) updateLines(rect);
        if (spotSvg && rect) updateSpotlight(rect);
        if (now < lineSettleUntil) lineSettleRaf = requestAnimationFrame(settleTick);
      }
      lineSettleRaf = requestAnimationFrame(settleTick);
    }

    function onScroll() {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    function onUserScrollGesture() {

      if (flickSwallowing) return;
      keyNavTarget = -1; keyNavSub = -1;
    }
    window.addEventListener('wheel', onUserScrollGesture, { passive: true });
    window.addEventListener('touchstart', onUserScrollGesture, { passive: true });

    var FLICK_PX = 260;
    var FLICK_WIN_MS = 140;
    var SWALLOW_QUIET_MS = 160;
    var SWALLOW_MAX_MS = 2600;
    var REENGAGE_RATIO = 0.9;
    var REENGAGE_AFTER_MS = 300;
    var BAILOUT_N = 3;
    var BAILOUT_MS = 2500;
    var flickAccum = 0, flickWinStart = 0, flickDir = 0, flickAnchorY = 0;
    var flickSwallowing = false, flickQuietTimer = null, flickHardTimer = null;
    var flickSwallowStart = 0, flickTailPeak = 0;
    var flickBailedOut = false, flickCommits = [];
    var flickAttached = false;

    function flickPinnedHere() {
      var r = section.getBoundingClientRect();
      return r.top <= 1 && r.bottom >= window.innerHeight - 1;
    }

    function endFlickSwallow() {
      if (flickSwallowing) debugLog('walkthrough-flick', 'swallow end');
      flickSwallowing = false;
      flickAccum = 0;
      clearTimeout(flickQuietTimer); flickQuietTimer = null;
      clearTimeout(flickHardTimer); flickHardTimer = null;
    }

    function onFlickWheel(e) {
      if (destroyed || flickBailedOut || !flickPinnedHere()) return;

      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      var px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (!px) return;
      var now = performance.now();
      var mag = Math.abs(px);

      if (flickSwallowing) {

        if (now - flickSwallowStart > REENGAGE_AFTER_MS &&
            mag >= flickTailPeak * REENGAGE_RATIO) {
          debugLog('walkthrough-flick', 're-engaged mid-swallow', { px: Math.round(mag) });
          endFlickSwallow();
        } else {

          if (mag > flickTailPeak) flickTailPeak = mag;
          e.preventDefault();
          clearTimeout(flickQuietTimer);
          flickQuietTimer = setTimeout(endFlickSwallow, SWALLOW_QUIET_MS);
          return;
        }
      }

      var dir = px > 0 ? 1 : -1;
      if (now - flickWinStart > FLICK_WIN_MS || dir !== flickDir) {

        flickWinStart = now; flickAccum = 0; flickDir = dir;
        flickAnchorY = window.pageYOffset;
      }
      flickAccum += mag;

      if (flickAccum < FLICK_PX) return;

      if (!section.walkthroughBeatNav(dir, flickAnchorY)) {
        debugLog('walkthrough-flick', 'passthrough at end', { dir: dir });
        return;
      }

      e.preventDefault();
      flickSwallowing = true;
      flickSwallowStart = now;
      flickTailPeak = mag;
      clearTimeout(flickQuietTimer); flickQuietTimer = setTimeout(endFlickSwallow, SWALLOW_QUIET_MS);
      clearTimeout(flickHardTimer); flickHardTimer = setTimeout(endFlickSwallow, SWALLOW_MAX_MS);
      flagSkip();

      flickCommits.push(now);
      while (flickCommits.length && now - flickCommits[0] > BAILOUT_MS) flickCommits.shift();
      if (flickCommits.length >= BAILOUT_N) {
        flickBailedOut = true;
        debugLog('walkthrough-flick', 'bailout — interception off for this visit');
      }
      debugLog('walkthrough-flick', 'commit', { dir: dir, px: Math.round(flickAccum) });
    }

    function setFlickListener(on) {
      if (on === flickAttached) return;
      flickAttached = on;
      if (on) {
        window.addEventListener('wheel', onFlickWheel, { passive: false });
      } else {
        window.removeEventListener('wheel', onFlickWheel, { passive: false });
        endFlickSwallow();
      }
    }

    window.addEventListener('load', remeasure);

    var videoObserver = null;
    var lazyVideos = content.querySelectorAll('.wt-lazy-video');
    if (lazyVideos.length && 'IntersectionObserver' in window) {
      videoObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {

            var p = entry.target.play();
            if (p && p.catch) p.catch(function() {});
          } else {
            entry.target.pause();
          }
        });
      }, { root: phoneScreen, threshold: 0.1 });
      lazyVideos.forEach(function(v) { videoObserver.observe(v); });
    }

    var lastVideoSync = 0;
    function syncLazyVideos() {
      if (!lazyVideos.length) return;
      var now = Date.now();
      if (now - lastVideoSync < 250) return;
      lastVideoSync = now;
      var sr = phoneScreen.getBoundingClientRect();
      Array.prototype.forEach.call(lazyVideos, function(v) {
        var r = v.getBoundingClientRect();
        var vis = r.height > 0 && r.bottom > sr.top && r.top < sr.bottom;
        if (vis && v.paused) {
          var p = v.play();
          if (p && p.catch) p.catch(function() {});
        } else if (!vis && !v.paused) {
          v.pause();
        }
      });
    }

    function destroy() {
      destroyed = true;
      if (keyNavWatchRaf) { cancelAnimationFrame(keyNavWatchRaf); keyNavWatchRaf = null; }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onUserScrollGesture);
      window.removeEventListener('touchstart', onUserScrollGesture);

      setFlickListener(false);
      flickBailedOut = false;
      flickCommits.length = 0;
      clearTimeout(skipFlagTimer); skipFlagTimer = null;
      if (skipBtn) skipBtn.classList.remove('is-flagged');
      window.removeEventListener('load', remeasure);
      if (contentObserver) contentObserver.disconnect();
      if (videoObserver) videoObserver.disconnect();

      Array.prototype.forEach.call(lazyVideos, function(v) { v.pause(); });
      resetFocusState();

      for (var i = 0; i < callouts.length; i++) clearRevealsInFocus(i);
      if (linesSvg) {
        while (linesSvg.firstChild) linesSvg.removeChild(linesSvg.firstChild);
      }
      if (scrollHint && scrollHint.parentNode) scrollHint.parentNode.removeChild(scrollHint);

      if (skipBtn) skipBtn.classList.remove('is-done');
      if (annotationsCol) {
        annotationsCol.removeEventListener('keydown', onAnnotationKeydown);
        annotationsCol.removeAttribute('tabindex');
        annotationsCol.removeAttribute('role');
        annotationsCol.removeAttribute('aria-label');
      }
      if (liveRegion && liveRegion.parentNode) liveRegion.parentNode.removeChild(liveRegion);
      if (fadeCover && fadeCover.parentNode) fadeCover.parentNode.removeChild(fadeCover);
      if (entranceContainer) {
        entranceContainer.style.opacity = '';
        entranceContainer.style.transform = '';
      }
      parkedFocusables.forEach(function(p) {
        if (p.tabindex === null) p.el.removeAttribute('tabindex');
        else p.el.setAttribute('tabindex', p.tabindex);
      });
      annotationFocusables.forEach(function(list) {
        list.forEach(function(f) {
          if (f.tabindex === null) f.el.removeAttribute('tabindex');
          else f.el.setAttribute('tabindex', f.tabindex);
        });
      });
      content.style.transform = '';
      content.style.transformOrigin = '';
      runway.style.height = '';
      delete section.walkthroughRevealScrollY;
      delete section.focusWalkthrough;

      delete section.walkthroughBeatNav;
      delete section.walkthroughStopNav;
      delete section.walkthroughGoToStop;
      delete section.walkthroughStopState;
    }

    update();

    return { destroy: destroy, handleResize: remeasure };
  }

  window.WalkthroughPinned = { setup: setupPinnedWalkthrough };
})();
