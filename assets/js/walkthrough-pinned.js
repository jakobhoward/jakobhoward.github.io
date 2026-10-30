

(function() {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before walkthrough-pinned.js');
  }
  var WS = window.WalkthroughShared;
  var clamp = WS.clamp, easeOutCubic = WS.easeOutCubic, trapEase = WS.trapEase;

  var stableViewportH = WS.stableViewportH;
  var SLIDE_EASE = WS.SLIDE_EASE, SLIDE_RUNWAY = WS.SLIDE_RUNWAY;

  if (!window.WalkthroughGeometry) {
    throw new Error('walkthrough-geometry.js must load before walkthrough-pinned.js');
  }
  var WG = window.WalkthroughGeometry;

  if (!window.SpotlightPinned || !window.ConnectorLines) {
    throw new Error('motion/spotlight-pinned.js and motion/connector-lines.js must load before walkthrough-pinned.js');
  }

  if (!window.CalloutGraph) {
    throw new Error('motion/callout-graph.js must load before walkthrough-pinned.js');
  }

  if (!window.KeyboardNavPinned) {
    throw new Error('motion/keyboard-nav-pinned.js must load before walkthrough-pinned.js');
  }

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
    var spotSvg = section.querySelector('.walkthrough-spot-svg');

    var spotlight = window.SpotlightPinned.create({
      svg: spotSvg,
      targetViewportRect: targetViewportRect,
      callouts: function() { return callouts; },
      activeFocus: function() { return activeFocus; },
      revealedCount: function() { return revealedCount; },
      hopReleased: function() { return hopReleased; },
      boxOwner: boxOwner
    });
    var updateSpotlight = spotlight.update, clearSpotState = spotlight.clear;
    var snapSpotState = spotlight.snap;
    var connectors = window.ConnectorLines.create({
      layoutEl: layoutEl, phoneFrame: phoneFrame, phoneScreen: phoneScreen,
      linesSvg: linesSvg, spotSvg: spotSvg, spotVbW: spotlight.VB_W,
      targetViewportRect: targetViewportRect,
      updateSpotlight: updateSpotlight,
      callouts: function() { return callouts; },
      activeFocus: function() { return activeFocus; },
      revealedCount: function() { return revealedCount; },
      swapReleased: function() { return swapReleased; },
      exitReleased: function() { return exitReleased; },
      destroyed: function() { return destroyed; },
      screenRadius: function() { return screenRadius; },
      bloomClipRect: function() { return bloomClipRect; },
      boxOwner: boxOwner
    });
    var updateLines = connectors.update, startLineSettle = connectors.settle;

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

    function buildCallouts() {
      var graph = window.CalloutGraph.build({
        linesSvg: linesSvg, bloomClipId: bloomClipId,
        annotations: annotations, focusEls: focusEls,
        focusRegion: focusRegion, regionUnionRect: regionUnionRect
      });
      callouts = graph.callouts;
      bloomClipRect = graph.clipRect;
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

      var liveOwner = count > 0 ? boxOwner(focusIdx, count - 1) : -1;
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

        var owns = boxOwner(focusIdx, j) === j;
        var boxDrawn = owns && drawn;
        var boxCurrent = owns && revealed && j === liveOwner && !swapReleased && !exitReleased;
        if (c.bloomUpEl)   { c.bloomUpEl.classList.toggle('revealed', boxDrawn);   c.bloomUpEl.classList.toggle('current', boxCurrent); }
        if (c.bloomDownEl) { c.bloomDownEl.classList.toggle('revealed', boxDrawn); c.bloomDownEl.classList.toggle('current', boxCurrent); }

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
        '<span class="wt-scroll-hint-sub">Highlights of the page, annotated as you go</span>';
      annotationSlot.appendChild(scrollHint);
    }

    function setScrollHint(show) {
      if (!scrollHint || show === scrollHintVisible) return;
      scrollHintVisible = show;
      scrollHint.classList.toggle('visible', show);
    }

    var skipBtn = section.querySelector('.wt-ctl-skip');

    var skipDone = false;
    function setSkipDone(done) {
      if (!skipBtn || skipDone === done) return;
      skipDone = done;
      skipBtn.classList.toggle('is-done', done);
    }

    var annotationsCol = section.querySelector('.campaign-walkthrough-annotations');
    var keys = window.KeyboardNavPinned.create({
      section: section, runway: runway, annotationsCol: annotationsCol,
      focusLabels: focusLabels,
      focusSubWindows: focusSubWindows, focusRevealAts: focusRevealAts,
      segScrollY: segScrollY, findSegment: findSegment,
      numFocuses: function() { return numFocuses; },
      activeFocus: function() { return activeFocus; },
      segments: function() { return segments; },
      totalVh: function() { return totalVh; },
      callouts: function() { return callouts; },
      destroyed: function() { return destroyed; }
    });
    var announceFocus = keys.announce;

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
      calloutBoxCache = {};
      heldBoxCache = {};
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

        var r = tg.kind === 'dom'
          ? WS.contentRect(tg.el, WS.CONTENT_KEEP_PX)
          : tg.imgEl.getBoundingClientRect();
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

    var entryPanVh = entryVh;

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

    var FRAME_PAD_PINNED = 24, EXIT_PAD = 16;

    var ZOOM_RAMP = 0.15;

    var ZOOM_SWAP_VH = 16;

    var SWAP_LEAD_VH = 8;

    var entryPanOptIn = section.hasAttribute('data-entry-pan');

    var waypointCache = [];
    var subWindowCache = [];

    var zoomSpecCache = [];

    var calloutWindowCache = {};
    var calloutZoomCache = {};
    var calloutBoxCache = {};
    var heldBoxCache = {};
    var numFocuses = focusPositions.length;

    var segments = [];
    var totalVh = 0;

    function buildSegments() {
      segments = [];

      panRateVh = 90 * visibleH / PAN_REF_SCREEN;
      var cum = 0;

      entryPanVh = entryPanOptIn
        ? Math.max(entryVh, WG.transitRunwayVh({
            baseD: Math.max(0, focusBasePos(0)), hopD: 0,
            visibleH: visibleH, panRateVh: panRateVh, transitVh: transitVh,
            taper: transitTaper
          }))
        : entryVh;
      var entryTotalVh = entryPanVh + (entryPanOptIn ? ENTRY_HOLD_VH : 0);
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

    var sizedRunwayPx = 0;
    function sizeRunway() {
      runway.style.height = 'calc(' + (totalVh + 100) + ' * var(--vh))';
      sizedRunwayPx = runway.offsetHeight;
    }
    sizeRunway();

    function segScrollY(seg, frac) {
      var sectionDocTop = section.getBoundingClientRect().top + window.pageYOffset;
      var vhPoint = seg.startVh + seg.vh * clamp(frac, 0, 1);

      return sectionDocTop + (vhPoint / totalVh) *
        Math.max(1, runway.offsetHeight - stableViewportH());
    }

    var JUMP_LAND_ENTRY_FRAC = 0.35;
    section.walkthroughRevealScrollY = function() {
      return segScrollY(segments[0], JUMP_LAND_ENTRY_FRAC);
    };

    section.focusWalkthrough = function() {
      if (annotationsCol) annotationsCol.focus({ preventScroll: true });
    };

    var drawnPlace = null;
    function timelineInSync(runwayPx) {
      return Math.abs(runwayPx - sizedRunwayPx) <= 1;
    }
    function readPlace() {
      var totalPx = runway.offsetHeight;
      if (!timelineInSync(totalPx)) return drawnPlace;
      var scrolled = -section.getBoundingClientRect().top;
      if (scrolled < 0 || scrolled > totalPx) return null;
      return placeAtVh(clamp(scrolled / Math.max(1, totalPx - stableViewportH()), 0, 1) * totalVh);
    }
    function placeAtVh(scrolledVh) {
      var seg = findSegment(scrolledVh);
      return placeOf(seg, seg.vh > 0 ? clamp((scrolledVh - seg.startVh) / seg.vh, 0, 1) : 0);
    }
    function placeOf(seg, frac) {
      return { s: segments.indexOf(seg), type: seg.type, stop: seg.focusIdx, frac: frac };
    }
    function placeScrollY(place) {
      return segScrollY(segments[Math.min(place.s, segments.length - 1)], place.frac);
    }

    var restoring = false;
    var unanchor = WS.viewport.anchor({
      read: function() { var p = readPlace(); restoring = p !== null; return p; },
      scrollY: placeScrollY,
      settled: function() { restoring = false; update(); }
    });

    section.walkthroughPlace = readPlace;

    var dwell = window.ElasticDwell.create({
      section: section, viewport: WS.viewport, vpH: stableViewportH,
      note: function(text) {
        var m = window.debug && window.debug.metrics('scroll-hud');
        if (m) m.note(text);
      },
      place: readPlace, scrollY: placeScrollY,
      windows: function(i) { var sw = focusSubWindows(i); return { bounds: sw.bounds, shares: sw.panShares }; },
      holdSeg: function(i) {
        for (var s = 0; s < segments.length; s++) {
          if (segments[s].type === 'hold' && segments[s].focusIdx === i) return s;
        }
        return -1;
      },
      still: function(i, k) {
        var wp = focusWaypoints(i)[k];
        return !!wp && wp.b === wp.a && !focusCalloutZoom(i) && !focusZoomSpec(i);
      }
    });

    function remeasure() {

      if (destroyed) return;
      measurePositions();

      invalidateTargetRectCache();
      buildSegments();
      sizeRunway();

      snapSpotState();

      if (!restoring) update();
    }

    var contentObserver = null;
    function settleRemeasure() { WS.viewport.settle(remeasure); }
    if ('ResizeObserver' in window) {
      contentObserver = new ResizeObserver(settleRemeasure);
      contentObserver.observe(content);
    }

    var scheduleUpdate = WS.rafThrottle(update);
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

      scheduleUpdate();
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
      keys.clearTarget();

      keys.setRail(-1);

      keys.resetAnnounced();
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
      if (!(callouts[i] && callouts[i][k])) return (calloutWindowCache[key] = null);
      var texts = annotations[i]
        ? annotations[i].querySelectorAll('.walkthrough-callout-text') : [];
      var authored = texts[k] ? WS.normalizeRegion(texts[k], false, 'data-zoom-') : null;
      if (authored && authored.w) return (calloutWindowCache[key] = authored);
      return calloutBox(i, k);
    }

    function heldBox(i, k) {
      if (k <= 0) return false;
      var key = i + ':' + k;
      if (heldBoxCache[key] !== undefined) return heldBoxCache[key];
      var a = calloutBox(i, k - 1), b = calloutBox(i, k), fp = focusPositions[i];
      if (!a || !b || !fp) return false;
      return (heldBoxCache[key] = WS.sameBox(a, b, fp.width, fp.rawHeight) &&
        (!focusCalloutZoom(i) || WS.sameSpec(calloutZoomSpec(i, k - 1), calloutZoomSpec(i, k))));
    }

    function boxOwner(i, k) {
      while (k > 0 && heldBox(i, k)) k--;
      return k;
    }

    function calloutBox(i, k) {
      var key = i + ':' + k;
      var v = calloutBoxCache[key];
      if (v !== undefined) return v;
      var entry = callouts[i] && callouts[i][k];
      if (!entry) return (calloutBoxCache[key] = null);
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
      if (!(R > L && B > T)) return (calloutBoxCache[key] = null);
      v = {
        x: clamp((L - br.left) / br.width, 0, 1),
        y: clamp((T - br.top) / br.height, 0, 1),
        w: clamp((R - L) / br.width, 0.001, 1),
        h: clamp((B - T) / br.height, 0.001, 1),
        xEnd: null
      };
      calloutBoxCache[key] = v;
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
        parkY: focusWaypoints(i)[Math.min(k, focusWaypoints(i).length - 1)].a,
        inPlace: true
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

        parkY: focusWaypoints(i)[0].a,
        inPlace: true
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
            calloutContentSpan(i, k), prev, visibleH, FRAME_PAD_PINNED, maxPhoneScroll());
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
        for (var hk = 0; hk < ws.length; hk++) {
          hopMin.push(hk > 0 && !heldBox(i, hk) ? ZOOM_SWAP_VH + SWAP_LEAD_VH : 0);
        }
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
        innerH: stableViewportH(),
        frameW: screenWidth,

        slidePx: (ws[0] && ws[0].b === ws[0].a) ? focusSlideRendered(i) : 0,

        slidePxK: slideK,
        travSlowPagePerPx: TRAV_SLOW_PAGE_PER_PX,
        framePad: FRAME_PAD_PINNED,
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

      if (destroyed) return;
      var sectionRect = section.getBoundingClientRect();
      var scrolled = -sectionRect.top;
      var totalPx = runway.offsetHeight;

      var inSync = timelineInSync(totalPx);

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
        if (inSync) drawnPlace = null;
        dwell.tick(null, scrolled);
        return;
      }

      var progress = clamp(scrolled / Math.max(1, totalPx - stableViewportH()), 0, 1);
      var scrolledVh = progress * totalVh;
      var seg = findSegment(scrolledVh);
      var segProgress = (scrolledVh - seg.startVh) / seg.vh;
      if (inSync) drawnPlace = placeAtVh(scrolledVh);

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

          var holdFrac = ENTRY_HOLD_VH / (ENTRY_HOLD_VH + entryPanVh);
          var panQ = clamp((segProgress - holdFrac) / (1 - holdFrac), 0, 1);
          var firstPos = focusBasePos(0);
          var entryQ = panEase(panQ, firstPos);
          targetScrollY = firstPos * entryQ;
          targetPanX = focusPanX(0) * entryQ;
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

        var inSwap = calloutZoomHere && wIdx > 0 && wLocal < share && !heldBox(i, wIdx);
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
              var framed = botView <= visibleH - FRAME_PAD_PINNED ||
                           (visFrac >= 0.72 && topView <= visibleH * 0.45);
              var tooTall = spanH > (visibleH - 2 * FRAME_PAD_PINNED);
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

        var sk = zoomSpecLive.scale - 1;
        if (sk > 1e-3) {
          var pivotY = (zoomSpecLive.scale * zoomSpecLive.scrollY - targetScrollY) / sk;
          zy = pivotY - (pivotY - targetScrollY) / zs;
        } else {
          zy = targetScrollY + (zoomSpecLive.scrollY - targetScrollY) * zoomEnv;
        }
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

        if (activeFocus === keys.target() &&
            seg.type === 'hold' && seg.focusIdx === keys.target()) {
          keys.clearTarget();
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

      dwell.tick(placeOf(seg, segProgress), scrolled);

      var railFocus = activeFocus;
      if (railFocus < 0 && seg.type === 'transit') railFocus = seg.from;

      if (railFocus < 0 && seg.type === 'hold') railFocus = seg.focusIdx - 1;

      if (railFocus < 0 && seg.type === 'exit') railFocus = numFocuses - 1;
      if (railFocus >= 0) keys.setRail(railFocus);

      if (seg.type === 'entry') keys.setRail(-1);

      WS.publishStop(section, railFocus, numFocuses,
        seg.type === 'entry' ? 'entry' : seg.type === 'exit' ? 'exit' : 'tour');
    }

    function onScroll() { scheduleUpdate(); }
    window.addEventListener('scroll', onScroll, { passive: true });

    function onUserScrollGesture() {
      keys.clearTarget();
    }
    window.addEventListener('wheel', onUserScrollGesture, { passive: true });
    window.addEventListener('touchstart', onUserScrollGesture, { passive: true });

    window.addEventListener('load', settleRemeasure);

    var lazyVideos = content.querySelectorAll('.wt-lazy-video');
    var videoObserver = WS.observeVideos(lazyVideos, phoneScreen);
    var syncLazyVideos = WS.videoRectSync(lazyVideos, phoneScreen);

    function destroy() {
      destroyed = true;
      keys.destroy();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onUserScrollGesture);
      window.removeEventListener('touchstart', onUserScrollGesture);
      window.removeEventListener('load', settleRemeasure);
      unanchor();
      dwell.destroy();
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
      delete section.walkthroughPlace;
    }

    update();

    return { destroy: destroy, handleResize: remeasure };
  }

  window.WalkthroughPinned = { setup: setupPinnedWalkthrough };
})();
