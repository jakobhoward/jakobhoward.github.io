

(function() {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before walkthrough-mobile.js');
  }
  var WS = window.WalkthroughShared;
  var debugLog = WS.debugLog;
  var clamp = WS.clamp, easeOutCubic = WS.easeOutCubic;
  var smoothStep = WS.smoothStep, trapEase = WS.trapEase;
  var debounce = WS.debounce;
  var stableViewportH = WS.stableViewportH;
  var SLIDE_RUNWAY = WS.SLIDE_RUNWAY;

  if (!window.WalkthroughGeometry) {
    throw new Error('walkthrough-geometry.js must load before walkthrough-mobile.js');
  }
  var waypointPair = window.WalkthroughGeometry.waypointPair;
  var chainSeams = window.WalkthroughGeometry.chainSeams;

  var subWindowsSynced = window.WalkthroughGeometry.subWindowsSynced;

  if (!window.SpotlightSynced) {
    throw new Error('motion/spotlight-synced.js must load before walkthrough-mobile.js');
  }

  if (!window.WalkthroughInterleaved) {
    throw new Error('motion/walkthrough-interleaved.js must load before walkthrough-mobile.js');
  }

  if (!window.KeyboardNavSynced) {
    throw new Error('motion/keyboard-nav-synced.js must load before walkthrough-mobile.js');
  }

  function addressText(section) {
    var authored = section.getAttribute('data-wt-address');
    if (authored) return authored;
    var link = section.querySelector('.walkthrough-live-link');
    if (link && link.getAttribute('href')) {
      try {
        var u = new URL(link.href);
        var path = u.pathname.replace(/\/+$/, '');
        return u.hostname.replace(/^www\./, '') + (path ? path : '') + '/…';
      } catch (e) {   }
    }
    var h = section.querySelector('.walkthrough-heading-title');
    var t = h ? h.textContent.toLowerCase() : '';
    if (t.indexOf('indiegogo') !== -1) return 'indiegogo.com/projects/…';
    if (t.indexOf('kickstarter') !== -1) return 'kickstarter.com/projects/…';
    return 'campaign page';
  }

  function buildChrome(address, withProgress) {
    var el = document.createElement('div');
    el.className = 'wt-mchrome';
    el.setAttribute('aria-hidden', 'true');
    var dots = document.createElement('span');
    dots.className = 'wt-mchrome-dots';
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement('i'));
    el.appendChild(dots);
    var addr = document.createElement('span');
    addr.className = 'wt-mchrome-address';
    addr.textContent = address;
    el.appendChild(addr);
    var fill = null;
    if (withProgress) {
      var track = document.createElement('span');
      track.className = 'wt-mchrome-progress';
      fill = document.createElement('span');
      fill.className = 'wt-mchrome-progress-fill';
      track.appendChild(fill);
      el.appendChild(track);
    }
    return { el: el, fill: fill };
  }

  var readRegion = function(ann) { return WS.normalizeRegion(ann, true); };

  function setupSynced(section, actIdx) {
    var runway = section.querySelector('.campaign-walkthrough-runway');
    var sticky = section.querySelector('.campaign-walkthrough-sticky');
    var layoutEl = section.querySelector('.campaign-walkthrough-layout');
    var phoneCol = section.querySelector('.campaign-walkthrough-phone');
    var phoneScreen = section.querySelector('.wt-phone-screen');
    var content = section.querySelector('.wt-phone-scroll');
    var annotationsCol = section.querySelector('.campaign-walkthrough-annotations');
    var annotationSlot = section.querySelector('.walkthrough-annotation-slot');
    var annotations = section.querySelectorAll('.walkthrough-annotation');
    if (!runway || !sticky || !layoutEl || !phoneCol || !phoneScreen || !content ||
        !annotationsCol || !annotationSlot || !annotations.length) return null;
    var focusEls = WS.resolveFocusEls(content, annotations);
    if (!focusEls.length) return null;

    debugLog('walkthrough-mobile', 'act ' + actIdx + ': synced setup');

    var zoomEnabled = section.hasAttribute('data-wt-desktop-capture');
    var WIDE = zoomEnabled
      ? (parseFloat(getComputedStyle(content).getPropertyValue('--wt-wide')) || 1)
      : 1;
    function toP(v) { return zoomEnabled ? v / WIDE : v; }

    var appliedZ = 1;

    var zsCache = [];

    var cwCache = {};
    var czCache = {};
    var cbCache = {};
    var hbCache = {};
    var slCache = {};

    var panelRatio = (stableViewportH() > 0 && phoneScreen.clientHeight > 0)
      ? phoneScreen.clientHeight / stableViewportH() : 0.52;

    phoneScreen.scrollTop = 0;

    if (zoomEnabled) phoneScreen.scrollLeft = 0;

    var parkedFocusables = [];
    content.querySelectorAll('a[href], button, video[controls], iframe, [tabindex]:not([tabindex="-1"])')
      .forEach(function(el) {
        parkedFocusables.push({ el: el, tabindex: el.getAttribute('tabindex') });
        el.setAttribute('tabindex', '-1');
      });

    var heading = annotationsCol.querySelector('.walkthrough-heading');
    var headingParent = null, headingNext = null;
    if (heading) {
      headingParent = heading.parentNode;
      headingNext = heading.nextSibling;
      layoutEl.insertBefore(heading, phoneCol);
    }

    var controlBar = annotationsCol.querySelector('.walkthrough-progress');
    var controlBarParent = null, controlBarNext = null;
    if (controlBar) {
      controlBarParent = controlBar.parentNode;
      controlBarNext = controlBar.nextSibling;
      layoutEl.insertBefore(controlBar, annotationsCol);
    }

    var chrome = buildChrome(addressText(section), true);
    phoneCol.insertBefore(chrome.el, phoneCol.firstChild);

    var cueEl = document.createElement('div');
    cueEl.className = 'wt-mdock-cue';
    cueEl.setAttribute('aria-hidden', 'true');
    cueEl.innerHTML =
      '<svg class="wt-mdock-cue-chevrons" viewBox="0 0 24 20" width="22" height="18">' +
        '<path d="M4 3l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M4 11l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<span class="wt-mdock-cue-title">Scroll to explore</span>' +
      '<span class="wt-mdock-cue-sub">Highlights of the page, annotated as you go</span>';
    annotationsCol.appendChild(cueEl);

    var lastAtEntry = null, lastBigHeading = null;
    function setEntryState(atEntry, bigHeading) {
      if (atEntry !== lastAtEntry) {
        lastAtEntry = atEntry;
        cueEl.classList.toggle('visible', atEntry);
      }
      if (bigHeading !== lastBigHeading) {
        lastBigHeading = bigHeading;
        if (heading) heading.classList.toggle('is-condensed', !bigHeading);

        section.classList.toggle('is-condensed', !bigHeading);
      }
    }

    var lastStop = -1;
    var keys = window.KeyboardNavSynced.create({
      section: section, annotations: annotations, annotationsCol: annotationsCol,
      holdScrollY: holdScrollY, holdLandFrac: holdLandFrac,
      lastActive: function() { return lastActive; },
      lastStop: function() { return lastStop; },
      destroyed: function() { return destroyed; }
    });
    var stopNav = keys.stopNav, goToStop = keys.goToStop;

    var stepRows = [];
    annotations.forEach(function(ann, i) {
      var n = ann.querySelectorAll('.walkthrough-callout-text').length;
      if (n < 2) { stepRows[i] = null; return; }
      var row = document.createElement('span');
      row.className = 'wt-mdock-steps';
      row.setAttribute('aria-hidden', 'true');
      for (var k = 0; k < n; k++) row.appendChild(document.createElement('i'));
      var label = ann.querySelector('.walkthrough-annotation-label');
      if (label && label.nextSibling) ann.insertBefore(row, label.nextSibling);
      else ann.appendChild(row);
      stepRows[i] = row;
    });

    var spot = window.SpotlightSynced.create({
      section: section, phoneScreen: phoneScreen, annotations: annotations,
      focusEls: focusEls, readRegion: readRegion, zoomEnabled: zoomEnabled
    });
    var spotTargets = spot.targets, setSpot = spot.set;

    var HOLD_PER_SUB = 0.55;
    var TAIL_DWELL = 0.34;

    var HEAD_DWELL = 0.08;

    var EXIT_BUFFER = 0.24;

    var TRAV_RUN_CAP = 2.4;

    var TRANSIT_MIN = 0.2;
    var ENTRY_LEN = 0.3;

    var EXIT_LEN = 0.25;

    var ENTRY_LEN_DEFER = 0.72;
    var ENTRY_CONDENSE = 0.26;
    var ENTRY_RISE_AT = 0.55;
    var PAN_RATE = 1.15;
    var TRAV_SLOW = 3.2;

    var SLIDE_SLOW_VH = 1.2;

    var SLIDE_EASE = WS.SLIDE_EASE;

    var SLIDE_TAIL = 0.14;
    var TRANSIT_RATE = 0.7;
    var DOCK_REVEAL_RATE = 1.1;
    var REVEAL_SPAN = 0.8;
    var FRAME_PAD_SYNCED = 12;

    var ZOOM_RISE = 0.42;

    var vpH = 0, panelH = 0, contentH = 0, maxScroll = 0;

    var panelW = 0, panelHFit = 0;
    var positions = [];
    var overflows = [];
    var segments = [];
    var entryDefers = false;
    var total = 0;

    var spanCache = {};
    var wpCache = [];
    var swCache = [];

    var entryPanOptIn = section.hasAttribute('data-entry-pan');

    function offsetFrac(i) {
      var ann = annotations[i];
      var v = ann ? parseFloat(ann.getAttribute('data-hold-offset')) : NaN;
      return isNaN(v) ? 0.12 : v;
    }

    function subCount(i) {
      var ann = annotations[i];
      if (!ann) return 1;
      return Math.max(1, ann.querySelectorAll('.walkthrough-callout-text').length || 1);
    }

    function basePos(i) {
      return clamp(positions[i].top - panelH * offsetFrac(i), 0, maxScroll);
    }

    function panDist(i) {
      var blockBottom = positions[i].top + positions[i].height - panelH;
      return Math.max(0, clamp(blockBottom, 0, maxScroll) - basePos(i));
    }

    function calloutSpan(i, k) {
      var key = i + ':' + k;
      var v = spanCache[key];
      if (v !== undefined) return v;
      var subs = spotTargets[i];
      var list = subs && subs[Math.min(k, (subs.length || 1) - 1)];
      if (!list || !list.length) return (spanCache[key] = null);
      var cr = content.getBoundingClientRect();
      if (!cr.height) return null;
      var D = zoomEnabled ? (WIDE * appliedZ) : 1;
      var top = Infinity, bottom = -Infinity;
      for (var n = 0; n < list.length; n++) {
        var t = list[n];
        var el = t.img || t.el;
        if (!el) continue;
        var r = el.getBoundingClientRect();
        var ct = (r.top - cr.top) / D;
        var ch = r.height / D;

        if (t.img || t.frac) { ct += (t.fy || 0) * ch; ch = (t.fh || 0) * ch; }
        if (ct < top) top = ct;
        if (ct + ch > bottom) bottom = ct + ch;
      }
      v = (bottom > top) ? { top: top, bottom: bottom } : null;
      spanCache[key] = v;
      return v;
    }

    function waypoints(i) {
      if (wpCache[i]) return wpCache[i];
      var all = [];
      for (var f = 0; f < positions.length; f++) all.push(focusChain(f));
      chainSeams(all);
      for (var c = 0; c < all.length; c++) wpCache[c] = all[c];
      return wpCache[i];
    }

    function focusChain(i) {
      var n = subCount(i);
      var fromPos = basePos(i);
      var ws = [];
      var prev = fromPos;
      for (var k = 0; k < n; k++) {
        var pair = waypointPair(calloutSpan(i, k), prev, panelH, FRAME_PAD_SYNCED, maxScroll);
        ws.push(pair);
        prev = pair.b;
      }

      if (!ws.length) {
        var legacyB = clamp(fromPos + panDist(i), fromPos, maxScroll);
        ws.push(legacyB - fromPos > panelH * 0.8
          ? { a: legacyB, b: legacyB }
          : { a: fromPos, b: legacyB });
      }
      return ws;
    }

    function chainEnd(i) {
      var ws = waypoints(i);
      return ws[ws.length - 1].b;
    }

    function holdOrigin(i) {
      return (i === 0 && entryPanOptIn) ? basePos(0) : waypoints(i)[0].a;
    }

    function focusZoomSpec(i) {
      if (zsCache[i] !== undefined) return zsCache[i];
      var reg = zoomEnabled ? readRegion(annotations[i]) : null;
      var fp = positions[i];
      if (!reg || !reg.w || !fp) return (zsCache[i] = null);

      var fit = WS.zoomFit({
        regX: reg.x, regXEnd: reg.xEnd, regW: reg.w,
        blockLeft: fp.left, blockTop: fp.top,
        blockWidth: fp.width, blockHeight: fp.height,
        frameW: panelW, frameH: panelHFit,
        contentW: panelW, contentH: contentH,
        maxScale: WIDE,
        parkY: waypoints(i)[0].a
      });
      return (zsCache[i] = {
        u: fit.scale, panX: fit.panX, scrollY: fit.scrollY,

        panXEnd: fit.panXEnd
      });
    }

    var ZOOM_MIN_U = 1.02;
    function focusZoomWhole(i) {
      if (i < 0 || i >= positions.length) return null;
      var spec = focusZoomSpec(i);
      if (!spec || spec.u < ZOOM_MIN_U) return null;

      var ws = waypoints(i);
      return (ws.length === 1 && ws[0].b === ws[0].a) ? spec : null;
    }

    function focusZoomChained(i) {
      if (i <= 0 || i >= positions.length) return false;
      var ann = annotations[i];
      if (!ann || ann.getAttribute('data-zoom-chain') !== 'true') return false;
      var prev = zoomEdge(i - 1, 'out');
      var cur = zoomEdge(i, 'in');
      return !!(prev && cur &&
        Math.abs(prev.u - cur.u) < 0.01 &&
        Math.abs(prev.scrollY - cur.scrollY) < 2);
    }

    function calloutZoomOn(i) {
      if (!zoomEnabled) return false;
      var ann = annotations[i];
      return !!(ann && ann.getAttribute('data-callout-zoom') === 'true');
    }

    function calloutWindow(i, k) {
      var key = i + ':' + k;
      var v = cwCache[key];
      if (v !== undefined) return v;
      var subs = spotTargets[i];
      var list = subs && subs[k];
      if (!list || !list.length) return (cwCache[key] = null);
      var texts = annotations[i]
        ? annotations[i].querySelectorAll('.walkthrough-callout-text') : [];
      var authored = texts[k] ? WS.normalizeRegion(texts[k], true, 'data-zoom-') : null;
      if (authored && authored.w) return (cwCache[key] = authored);
      return calloutBox(i, k);
    }

    function heldBox(i, k) {
      if (k <= 0) return false;
      var key = i + ':' + k;
      if (hbCache[key] !== undefined) return hbCache[key];
      var a = calloutBox(i, k - 1), b = calloutBox(i, k), fp = positions[i];
      if (!a || !b || !fp) return false;
      return (hbCache[key] = WS.sameBox(a, b, fp.width, fp.rawHeight) &&
        (!calloutZoomOn(i) || WS.sameSpec(calloutZoomSpec(i, k - 1), calloutZoomSpec(i, k))));
    }

    function calloutBox(i, k) {
      var key = i + ':' + k;
      var v = cbCache[key];
      if (v !== undefined) return v;
      var subs = spotTargets[i];
      var list = subs && subs[k];
      if (!list || !list.length) return (cbCache[key] = null);
      var focusEl = focusEls[i];
      var br = focusEl ? focusEl.getBoundingClientRect() : null;
      if (!br || !br.width || !br.height) return null;
      var L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
      for (var n = 0; n < list.length; n++) {
        var t = list[n];
        if (t.underline) continue;
        var box = t.img || t.el;
        if (!box) continue;
        var r = box.getBoundingClientRect();
        var l = r.left, tp = r.top, rr = r.right, bb = r.bottom;
        if (t.img || t.frac) {
          l = r.left + (t.fx || 0) * r.width;
          tp = r.top + (t.fy || 0) * r.height;
          rr = l + (t.fw || 0) * r.width;
          bb = tp + (t.fh || 0) * r.height;
        }
        if (l < L) L = l;
        if (tp < T) T = tp;
        if (rr > R) R = rr;
        if (bb > B) B = bb;
      }
      if (!(R > L && B > T)) return (cbCache[key] = null);
      v = {
        x: clamp((L - br.left) / br.width, 0, 1),
        y: clamp((T - br.top) / br.height, 0, 1),
        w: clamp((R - L) / br.width, 0.001, 1),
        h: clamp((B - T) / br.height, 0.001, 1),
        xEnd: null
      };
      cbCache[key] = v;
      return v;
    }

    function slideLeavesBox(i, k) {
      var key = i + ':' + k;
      if (slCache[key] !== undefined) return slCache[key];
      var spec = calloutZoomOn(i) ? calloutZoomSpec(i, k) : (k === 0 ? focusZoomWhole(i) : null);
      var list = spotTargets[i] && spotTargets[i][k];
      if (!spec || spec.panXEnd === spec.panX || !list ||
          list.some(function(t) { return t.frac; })) return (slCache[key] = false);
      var box = calloutBox(i, k), fp = positions[i];
      if (!box || !fp) return false;
      var cx = fp.left + (box.x + box.w / 2) * fp.width;
      return (slCache[key] = cx < spec.panXEnd || cx > spec.panXEnd + panelW / spec.u);
    }

    function calloutZoomSpec(i, k) {
      var key = i + ':' + k;
      if (czCache[key] !== undefined) return czCache[key];
      if (!calloutZoomOn(i)) return (czCache[key] = null);
      var win = calloutWindow(i, k);
      var fp = positions[i];
      if (!win || !fp) return null;

      var cws = waypoints(i);
      var fit = WS.zoomFit({
        regX: win.x, regXEnd: win.xEnd, regW: win.w,
        blockLeft: fp.left, blockTop: fp.rawTop + win.y * fp.rawHeight,
        blockWidth: fp.width, blockHeight: win.h * fp.rawHeight,
        frameW: panelW, frameH: panelHFit,
        contentW: panelW, contentH: contentH,
        maxScale: WIDE,

        parkY: cws[Math.min(k, cws.length - 1)].a
      });
      var spec = fit.scale < ZOOM_MIN_U ? null
        : { u: fit.scale, panX: fit.panX, scrollY: fit.scrollY, panXEnd: fit.panXEnd };
      czCache[key] = spec;
      return spec;
    }

    function zoomEdge(i, edge) {
      if (i < 0 || i >= positions.length) return null;
      if (!calloutZoomOn(i)) return focusZoomWhole(i);
      var n = subCount(i);
      return calloutZoomSpec(i, edge === 'in' ? 0 : n - 1);
    }

    function slidEnd(s) {
      return s.panXEnd === s.panX ? s
        : { u: s.u, panX: s.panXEnd, panXEnd: s.panXEnd, scrollY: s.scrollY };
    }

    function lerpSpec(a, b, t) {
      return {
        u: a.u + (b.u - a.u) * t,
        panX: a.panX + (b.panX - a.panX) * t,
        panXEnd: a.panXEnd + (b.panXEnd - a.panXEnd) * t,
        scrollY: a.scrollY + (b.scrollY - a.scrollY) * t
      };
    }

    var ZOOM_SWAP = 0.16;

    var SWAP_LEAD = 0.08;

    var ZOOM_FALL_SHARE = 0.4;

    var ZOOM_RAMP_FLOOR = 0.24;

    var ZOOM_REST_HOLD = 0.2;

    function rampPx(segLen, needHead, needTail, edge) {
      var both = needHead && needTail;
      var usable = both ? Math.max(0, segLen - ZOOM_REST_HOLD * vpH) : segLen;
      var share = both
        ? usable * (edge === 'head' ? ZOOM_FALL_SHARE : 1 - ZOOM_FALL_SHARE)
        : usable;
      return Math.max(0, Math.min(ZOOM_RISE * vpH, share));
    }

    function holdScaleOf(i) {
      if (!zoomEnabled) return 1;
      if (!focusZoomSpec(i) && !(calloutZoomOn(i) && (zoomEdge(i, 'in') || zoomEdge(i, 'out')))) return 1;
      var v = parseFloat(annotations[i].getAttribute('data-hold-scale'));
      return (isFinite(v) && v > 0) ? v : 1;
    }

    function slideRendered(i, k) {
      var spec = calloutZoomOn(i) ? calloutZoomSpec(i, k)
        : (k === 0 ? focusZoomWhole(i) : null);
      if (!spec) return 0;
      return Math.abs(spec.panXEnd - spec.panX) * spec.u;
    }

    function subWindows(i) {
      if (swCache[i]) return swCache[i];
      var ws = waypoints(i);
      var per = overflows[i] || [];
      var origin = holdOrigin(i);
      var swapOn = calloutZoomOn(i);

      var holdScale = ws.length ? holdScaleOf(i) : 1;
      var slideK = [];
      for (var k = 0; k < ws.length; k++) slideK.push(slideRendered(i, k));
      var heldK = null;
      if (swapOn) {
        heldK = [];
        for (var hk = 0; hk < ws.length; hk++) heldK.push(heldBox(i, hk));
      }
      var sw = subWindowsSynced({
        waypoints: ws, origin: origin, overflows: per, swapOn: swapOn, heldK: heldK,
        holdScale: holdScale, slidePxK: slideK, vpH: vpH, panelW: panelW,
        K: {
          PAN_RATE: PAN_RATE, TRAV_SLOW: TRAV_SLOW, TRAV_RUN_CAP: TRAV_RUN_CAP,
          FRAME_PAD: FRAME_PAD_SYNCED, HOLD_PER_SUB: HOLD_PER_SUB,
          DOCK_REVEAL_RATE: DOCK_REVEAL_RATE, HEAD_DWELL: HEAD_DWELL,
          TAIL_DWELL: TAIL_DWELL, EXIT_BUFFER: EXIT_BUFFER,
          SLIDE_SLOW_VH: SLIDE_SLOW_VH, SLIDE_RUNWAY: SLIDE_RUNWAY,
          SLIDE_TAIL: SLIDE_TAIL, ZOOM_SWAP: ZOOM_SWAP, SWAP_LEAD: SWAP_LEAD
        }
      });
      swCache[i] = sw;
      return sw;
    }

    function measure() {
      vpH = stableViewportH();

      if (vpH > 0 && phoneScreen.clientHeight > 0) panelRatio = phoneScreen.clientHeight / vpH;
      panelH = Math.max(1, Math.round(vpH * panelRatio));
      if (zoomEnabled) {

        panelW = phoneScreen.clientWidth;
        panelHFit = phoneScreen.clientHeight || panelH;
      }
      contentH = toP(content.scrollHeight);
      maxScroll = Math.max(0, contentH - panelH);
      positions = [];
      Array.prototype.forEach.call(focusEls, function(el, i) {

        var reg = readRegion(annotations[i]);
        positions.push({
          top: toP(el.offsetTop + (reg ? reg.y * el.offsetHeight : 0)),
          height: toP(reg ? reg.h * el.offsetHeight : el.offsetHeight),
          left: toP(el.offsetLeft), width: toP(el.offsetWidth),

          rawTop: toP(el.offsetTop), rawHeight: toP(el.offsetHeight)
        });
      });

      spanCache = {};
      wpCache = [];
      swCache = [];
      zsCache = [];
      cwCache = {};
      czCache = {};
      cbCache = {};
      hbCache = {};
      slCache = {};
      measureDockOverflows();
    }

    var lastDockKey = '';

    function liveAnimations(el) {
      if (!el || typeof el.getAnimations !== 'function') return null;
      var out = [];
      el.getAnimations({ subtree: true }).forEach(function(a) {
        out.push({ target: a.effect && a.effect.target, name: a.animationName, time: a.currentTime, done: a.playState === 'finished' });
      });
      return out;
    }
    function resumeAnimations(el, before) {
      if (!before) return;
      void el.offsetWidth;
      el.getAnimations({ subtree: true }).forEach(function(a) {
        var target = a.effect && a.effect.target, was = null;
        for (var n = 0; n < before.length; n++) {
          if (before[n].target === target && before[n].name === a.animationName) { was = before[n]; break; }
        }
        if (!was || was.done) a.finish();
        else if (was.time != null) a.currentTime = was.time;
      });
    }
    function measureDockOverflows() {
      var dockKey = annotationsCol.clientWidth + 'x' + annotationsCol.clientHeight;
      if (dockKey === lastDockKey && overflows.length) return;
      lastDockKey = dockKey;
      overflows = [];
      var dockH = annotationsCol.clientHeight;
      var liveActive = annotationsCol.querySelector('.walkthrough-annotation.active');
      var liveAnims = liveAnimations(liveActive);
      if (liveActive) liveActive.classList.remove('active');
      annotations.forEach(function(ann) {
        var texts = ann.querySelectorAll('.walkthrough-callout-text');
        var liveCurrent = ann.querySelector('.walkthrough-callout-text.current');
        if (liveCurrent) liveCurrent.classList.remove('current');
        ann.classList.add('active');
        var per = [];
        if (!texts.length) {
          per.push(Math.max(0, annotationsCol.scrollHeight - dockH));
        } else {
          Array.prototype.forEach.call(texts, function(p) {
            p.classList.add('current');
            per.push(Math.max(0, annotationsCol.scrollHeight - dockH));
            p.classList.remove('current');
          });
        }
        ann.classList.remove('active');
        if (liveCurrent) liveCurrent.classList.add('current');
        overflows.push(per);
      });
      if (liveActive) { liveActive.classList.add('active'); resumeAnimations(liveActive, liveAnims); }
    }

    function buildSegments() {
      segments = [];
      var cum = 0;
      var n = positions.length;

      entryDefers = entryPanOptIn || (zoomEnabled && !!zoomEdge(0, 'in'));
      var entryLen = (entryDefers ? ENTRY_LEN_DEFER : ENTRY_LEN) * vpH;
      segments.push({ type: 'entry', start: cum, len: entryLen });
      cum += entryLen;
      for (var i = 0; i < n; i++) {

        var len = subWindows(i).totalPx;
        segments.push({ type: 'hold', i: i, start: cum, len: len });
        cum += len;
        if (i < n - 1) {

          var toA = waypoints(i + 1)[0].a;
          var gap = Math.max(0, basePos(i + 1) - chainEnd(i));
          var hopD = Math.max(0, toA - Math.max(basePos(i + 1), chainEnd(i)));
          var tLen = TRANSIT_MIN * vpH + gap * TRANSIT_RATE + hopD * PAN_RATE;

          if (zoomEnabled && zoomEdge(i, 'out') && zoomEdge(i + 1, 'in') &&
              !focusZoomChained(i + 1)) {
            tLen = Math.max(tLen, ZOOM_REST_HOLD * vpH +
              (ZOOM_RAMP_FLOOR * vpH) / (1 - ZOOM_FALL_SHARE));
          }
          segments.push({ type: 'transit', from: i, to: i + 1, start: cum, len: tLen });
          cum += tLen;
        }
      }
      var lastEnd = chainEnd(n - 1);
      var exitLen = EXIT_LEN * vpH + Math.max(0, maxScroll - lastEnd) * TRANSIT_RATE;
      segments.push({ type: 'exit', start: cum, len: exitLen });
      cum += exitLen;
      total = cum;

      runway.style.height = Math.round(total + vpH) + 'px';
    }

    function findSegment(scrolled) {
      for (var s = 0; s < segments.length; s++) {
        if (scrolled < segments[s].start + segments[s].len) return segments[s];
      }
      return segments[segments.length - 1];
    }

    var destroyed = false;

    var scheduleUpdate = WS.rafThrottle(update);
    var lastActive = -2;
    var lastSub = -1;
    var lastReveal = 0;

    function setDock(active, sub) {
      var swapped = false;
      if (active !== lastActive) {
        annotations.forEach(function(ann, i) {
          var isActive = i === active;
          ann.classList.toggle('active', isActive);
          if (!isActive) {
            Array.prototype.forEach.call(
              ann.querySelectorAll('.walkthrough-callout-text[aria-current]'),
              function(p) { p.removeAttribute('aria-current'); }
            );
          }
        });
        lastActive = active;
        lastSub = -1;
        swapped = true;
        keys.arrive(active);
        keys.announce(active);
      }
      if (active >= 0 && sub !== lastSub) {
        lastSub = sub;
        swapped = true;
        var texts = annotations[active].querySelectorAll('.walkthrough-callout-text');
        Array.prototype.forEach.call(texts, function(p, k) {
          var current = k === sub - 1;
          p.classList.toggle('current', current);
          p.classList.toggle('seen', k < sub - 1);

          if (current) p.setAttribute('aria-current', 'true');
          else p.removeAttribute('aria-current');
        });
        var row = stepRows[active];
        if (row) {
          Array.prototype.forEach.call(row.children, function(dot, k) {
            dot.classList.toggle('on', k <= sub - 1);
          });
        }
      }
      if (swapped) {

        annotationsCol.scrollTop = 0;
        lastReveal = 0;
      }
    }

    var offRunway = false;

    var probe = (window.debug && window.debug.metrics)
      ? window.debug.metrics('walkthrough-zoom') : null;
    var pv = probe ? { prev: 0, avg: 0, worst: 0, long: 0, frames: 0, ramp: null } : null;

    function probeFrame(t0, scrolled, env, zu, segType, active, sub, spec) {
      var now = performance.now();
      var dt = pv.prev ? now - pv.prev : 0;
      pv.prev = now;
      pv.frames++;
      if (dt) {
        pv.avg = pv.avg ? pv.avg * 0.9 + dt * 0.1 : dt;
        if (dt > pv.worst) pv.worst = dt;
        if (dt > 34) pv.long++;
      }
      probe.set('frame', pv.avg.toFixed(1) + ' avg  ' + pv.worst.toFixed(0) + ' worst');
      probe.set('self', (now - t0).toFixed(2) + ' ms');
      probe.set('long', pv.long + ' / ' + pv.frames);
      probe.set('zoom', env.toFixed(2) + ' env   ' + zu.toFixed(3) + ' zu');

      probe.set('at', segType + '  focus ' + (active < 0 ? '-' : active) + '.' + sub +
        '  ' + (spec ? 'park' : 'no-spec'));
      probe.set('scroll', Math.round(scrolled) + ' / ' + Math.round(total));
      probe.set('vpH', vpH + ' px');

      if (env > 0 && env < 1) {
        if (!pv.ramp) pv.ramp = { from: scrolled, frames: 0, t0: now };
        pv.ramp.frames++;
      } else if (pv.ramp) {
        if (env >= 1) {
          probe.note('ramp ' + Math.abs(scrolled - pv.ramp.from).toFixed(0) + 'px  ' +
            pv.ramp.frames + 'f  ' + (now - pv.ramp.t0).toFixed(0) + 'ms');
        }
        pv.ramp = null;
      }
    }

    function update() {
      if (destroyed) return;
      var probeT0 = pv ? performance.now() : 0;
      var raw = -section.getBoundingClientRect().top;

      var off = raw < -vpH || raw > total + vpH;
      if (off && offRunway) return;
      if (off) dwell.tick(null, raw);
      offRunway = off;

      if (!off) syncLazyVideos();
      var scrolled = clamp(raw, 0, total);
      var seg = findSegment(scrolled);
      var t = seg.len > 0 ? clamp((scrolled - seg.start) / seg.len, 0, 1) : 1;
      var lastIdx = positions.length - 1;
      var scrollY = 0, active = -1, sub = 1, reveal = 0;

      var zoomSpecLive = null, zoomEnv = 0;

      var holdDwellQ = 0;

      var holdW = 0, holdLocal = 0, holdShare = 0;

      var holdSwapQ = 0, holdSwapOut = false;

      var holdSlideOut = false;

      if (seg.type === 'entry') {

        var eq = entryDefers
          ? clamp((t - ENTRY_RISE_AT) / Math.max(1e-6, 1 - ENTRY_RISE_AT), 0, 1)
          : t;
        scrollY = entryPanOptIn ? basePos(0) * easeOutCubic(eq) : holdOrigin(0);
      } else if (seg.type === 'hold') {
        var i = seg.i;
        var ws = waypoints(i);
        var sw = subWindows(i);
        var nw = ws.length;
        var wIdx = nw - 1;
        for (var wj = 0; wj < nw; wj++) {
          if (t < sw.bounds[wj + 1]) { wIdx = wj; break; }
        }
        var wSpan = Math.max(1e-6, sw.bounds[wIdx + 1] - sw.bounds[wIdx]);
        var wLocal = clamp((t - sw.bounds[wIdx]) / wSpan, 0, 1);
        var wFrom = wIdx === 0 ? holdOrigin(i) : ws[wIdx - 1].b;
        var share = sw.shares[wIdx] || 0;
        holdW = wIdx; holdLocal = wLocal; holdShare = share;

        holdSwapQ = wLocal / Math.max(1e-6, share);
        if (wIdx > 0 && wLocal < share && calloutZoomOn(i) && !heldBox(i, wIdx) &&
            (calloutZoomSpec(i, wIdx - 1) || calloutZoomSpec(i, wIdx))) {
          var hopPx = share * (sw.bounds[wIdx + 1] - sw.bounds[wIdx]) * seg.len;
          var leadQ = Math.min(0.5, SWAP_LEAD * vpH / Math.max(1e-6, hopPx));
          holdSwapQ = clamp((holdSwapQ - leadQ) / Math.max(1e-6, 1 - leadQ), 0, 1);
          holdSwapOut = true;
        }
        if (wLocal < share) {

          scrollY = wFrom + (ws[wIdx].a - wFrom) * holdSwapQ;
        } else {

          var head = sw.heads[wIdx] || 0;
          var tail = sw.tails[wIdx] || 0;
          var dq = clamp((wLocal - share - head) /
            Math.max(1e-6, 1 - share - head - tail), 0, 1);
          scrollY = ws[wIdx].a + (ws[wIdx].b - ws[wIdx].a) * dq;

          holdDwellQ = clamp((dq - SLIDE_RUNWAY) / (1 - SLIDE_RUNWAY), 0, 1);

          holdSlideOut = dq >= 1 && slideLeavesBox(i, wIdx);
        }

        var subN = 0;
        for (var k2 = 0; k2 < nw; k2++) {
          var pb0 = sw.bounds[k2], pb1 = sw.bounds[k2 + 1];
          if (t >= pb0 + (sw.shares[k2] || 0) * (pb1 - pb0)) subN = k2 + 1;
          else break;
        }
        if (subN > 0) {
          active = i;
          sub = subN;

          var subOver = (overflows[i] || [])[sub - 1] || 0;
          if (subOver) {
            var db0 = sw.bounds[sub - 1], db1 = sw.bounds[sub];
            var dShare = sw.shares[sub - 1] || 0;
            var dTail = sw.tails[sub - 1] || 0;
            var dLocal = clamp(
              (((t - db0) / Math.max(1e-6, db1 - db0)) - dShare) /
                Math.max(1e-6, 1 - dShare - dTail),
              0, 1);
            reveal = subOver * clamp(dLocal / REVEAL_SPAN, 0, 1);
          }
        }
      } else if (seg.type === 'transit') {
        var a = chainEnd(seg.from);

        var b = waypoints(seg.to)[0].a;
        scrollY = a + (b - a) * t;

      } else {

        var le = chainEnd(lastIdx);
        scrollY = le + (maxScroll - le) * t;
      }

      var zoomAtEnd = false;
      if (zoomEnabled) {
        if (seg.type === 'hold') {
          if (calloutZoomOn(seg.i)) {

            var specHere = calloutZoomSpec(seg.i, holdW);
            var specPrev = holdW > 0 ? calloutZoomSpec(seg.i, holdW - 1) : null;
            if (holdW > 0 && holdLocal < holdShare) {
              var sq = easeOutCubic(holdSwapQ);

              if (specPrev && specHere) { zoomSpecLive = lerpSpec(slidEnd(specPrev), specHere, sq); zoomEnv = 1; }
              else if (specPrev) { zoomSpecLive = specPrev; zoomEnv = 1 - sq; zoomAtEnd = true; }
              else if (specHere) { zoomSpecLive = specHere; zoomEnv = sq; }
            } else if (specHere) {
              zoomSpecLive = specHere;
              zoomEnv = 1;
            }
          } else {
            zoomSpecLive = focusZoomWhole(seg.i);
            if (zoomSpecLive) zoomEnv = 1;
          }
        } else if (seg.type === 'transit') {
          var sOut = zoomEdge(seg.from, 'out');
          var sIn = zoomEdge(seg.to, 'in');
          if (focusZoomChained(seg.to)) {

            var tc = easeOutCubic(t);
            var snapX = sOut.panXEnd + (sIn.panX - sOut.panXEnd) * tc;
            zoomSpecLive = {
              u: sIn.u, panX: snapX, panXEnd: snapX,
              scrollY: sOut.scrollY + (sIn.scrollY - sOut.scrollY) * tc
            };
            zoomEnv = 1;
          } else if (sOut || sIn) {
            var pxIn = t * seg.len;
            var rlOut = sOut ? rampPx(seg.len, !!sOut, !!sIn, 'head') : 0;
            var rlIn = sIn ? rampPx(seg.len, !!sOut, !!sIn, 'tail') : 0;
            var envOut = rlOut > 0 ? 1 - smoothStep(clamp(pxIn / rlOut, 0, 1)) : 0;
            var envIn = rlIn > 0 ? 1 - smoothStep(clamp((seg.len - pxIn) / rlIn, 0, 1)) : 0;
            if (envOut > 0) { zoomSpecLive = sOut; zoomEnv = envOut; zoomAtEnd = true; }
            else if (envIn > 0) { zoomSpecLive = sIn; zoomEnv = envIn; }
          }
        } else if (seg.type === 'entry') {

          var sE = zoomEdge(0, 'in');
          var rlE = sE ? rampPx(seg.len * (1 - ENTRY_RISE_AT), false, true, 'tail') : 0;
          if (rlE > 0) {
            zoomEnv = 1 - smoothStep(clamp((seg.len - t * seg.len) / rlE, 0, 1));
            if (zoomEnv > 0) zoomSpecLive = sE;
          }
        } else {
          var sX = zoomEdge(lastIdx, 'out');
          var rlX = sX ? rampPx(seg.len, true, false, 'head') : 0;
          if (rlX > 0) {
            zoomEnv = 1 - smoothStep(clamp((t * seg.len) / rlX, 0, 1));
            if (zoomEnv > 0) { zoomSpecLive = sX; zoomAtEnd = true; }
          }
        }
      }

      var zu = 1, zxP = 0, zyP = scrollY;
      if (zoomSpecLive && zoomEnv > 0) {
        zu = 1 + (zoomSpecLive.u - 1) * zoomEnv;

        var panXLive = zoomAtEnd
          ? zoomSpecLive.panXEnd
          : zoomSpecLive.panX +
            (zoomSpecLive.panXEnd - zoomSpecLive.panX) * trapEase(holdDwellQ, SLIDE_EASE);
        zxP = panXLive * zoomEnv;
        zyP = scrollY + (zoomSpecLive.scrollY - scrollY) * zoomEnv;

        var yMax = Math.max(0, contentH - panelHFit / zu);
        zxP = clamp(zxP, 0, Math.max(0, panelW - panelW / zu));
        zyP = clamp(zyP, 0, Math.max(yMax, scrollY));
      }
      if (zoomEnabled) {
        var zEff = zu / WIDE;
        content.style.transform =
          'translate3d(' + (-zu * zxP) + 'px, ' + (-zu * zyP) + 'px, 0) scale(' + zEff + ')';
        appliedZ = zEff;
      } else {
        content.style.transform = 'translate3d(0, ' + (-scrollY) + 'px, 0)';
      }

      var atEntry = seg.type === 'entry' && active < 0;
      setEntryState(atEntry, atEntry && (!entryDefers || t < ENTRY_CONDENSE));

      var shown = holdSlideOut ? -1 : active;
      if (holdSlideOut) reveal = 0;
      setDock(shown, sub);

      lastStop = active;
      if (lastStop < 0) {
        if (seg.type === 'transit') lastStop = seg.from;
        else if (seg.type === 'hold') lastStop = seg.i - 1;
        else if (seg.type === 'exit') lastStop = lastIdx;
      }
      WS.publishStop(section, lastStop, positions.length,
        seg.type === 'entry' ? 'entry' : seg.type === 'exit' ? 'exit' : 'tour');

      var revealPx = Math.round(reveal);
      if (revealPx !== lastReveal) {
        annotationsCol.scrollTop = revealPx;
        lastReveal = revealPx;
      }

      if (zoomEnabled && phoneScreen.scrollLeft) phoneScreen.scrollLeft = 0;

      var hasOverflow = shown >= 0 &&
        annotationsCol.scrollTop + annotationsCol.clientHeight <
          annotationsCol.scrollHeight - 4;

      setSpot(holdSwapOut ? -1 : shown, Math.max(0, sub - 1));
      annotationsCol.classList.toggle('has-overflow', hasOverflow);
      if (chrome.fill) {
        chrome.fill.style.transform = 'scaleX(' + (maxScroll > 0 ? scrollY / maxScroll : 1) + ')';
      }
      if (!off) dwell.tick(placeOf(seg, t), scrolled);
      if (pv) probeFrame(probeT0, scrolled, zoomEnv, zu, seg.type, active, sub, zoomSpecLive);
    }

    function onScroll() { scheduleUpdate(); }

    function remeasure() {
      if (destroyed) return;
      if (zoomEnabled) phoneScreen.scrollLeft = 0;
      measure();
      buildSegments();
      update();
    }

    function calloutLandFrac(i, k) {
      var sw = subWindows(i);
      var kk = clamp(k, 0, sw.bounds.length - 2);
      var b0 = sw.bounds[kk] || 0;
      var b1 = sw.bounds[kk + 1] || 1;
      var panDone = b0 + (sw.shares[kk] || 0) * (b1 - b0);
      var spec = calloutZoomOn(i) ? calloutZoomSpec(i, kk) : focusZoomWhole(i);
      var into = (spec && spec.panXEnd !== spec.panX) ? SLIDE_RUNWAY * 0.5 : 0.25;
      return Math.min(0.98, panDone + into * (b1 - panDone));
    }

    function holdLandFrac(i) {
      return calloutLandFrac(i, 0);
    }

    function segScrollY(seg, frac) {
      return section.getBoundingClientRect().top + window.pageYOffset +
        seg.start + seg.len * clamp(frac, 0, 1);
    }

    function holdScrollY(i, frac) {
      for (var s = 0; s < segments.length; s++) {
        if (segments[s].type === 'hold' && segments[s].i === i) return segScrollY(segments[s], frac);
      }
      return segScrollY({ start: 0, len: 0 }, 0);
    }

    measure();
    if (!positions.length) return null;
    buildSegments();

    section.walkthroughRevealScrollY = function() {
      return holdScrollY(0, holdLandFrac(0));
    };

    section.walkthroughCalloutScrollY = function(i, k) {
      return holdScrollY(clamp(i, 0, positions.length - 1), calloutLandFrac(clamp(i, 0, positions.length - 1), k || 0));
    };

    section.walkthroughStopNav = stopNav;
    section.walkthroughGoToStop = goToStop;

    window.addEventListener('scroll', onScroll, { passive: true });

    function remeasureDock() { lastDockKey = ''; remeasure(); }
    function settleRemeasure() { WS.viewport.settle(remeasure); }
    function settleRemeasureDock() { WS.viewport.settle(remeasureDock); }
    window.addEventListener('load', settleRemeasureDock);

    function readPlace() {
      var raw = -section.getBoundingClientRect().top;
      if (raw < 0 || raw > total) return null;
      var seg = findSegment(raw);
      return placeOf(seg, seg.len > 0 ? clamp((raw - seg.start) / seg.len, 0, 1) : 1);
    }
    function placeOf(seg, frac) {
      return { s: segments.indexOf(seg), type: seg.type, stop: seg.i, frac: frac };
    }
    function placeScrollY(place) {
      return segScrollY(segments[Math.min(place.s, segments.length - 1)], place.frac);
    }
    var unanchor = WS.viewport.anchor({ read: readPlace, scrollY: placeScrollY, settled: update });

    section.walkthroughPlace = readPlace;

    var dwell = window.ElasticDwell.create({
      section: section, viewport: WS.viewport, vpH: stableViewportH,
      note: function(text) {
        var m = window.debug && window.debug.metrics('scroll-hud');
        if (m) m.note(text);
      },
      place: readPlace, scrollY: placeScrollY,
      windows: function(i) { var sw = subWindows(i); return { bounds: sw.bounds, shares: sw.shares }; },
      holdSeg: function(i) {
        for (var s = 0; s < segments.length; s++) {
          if (segments[s].type === 'hold' && segments[s].i === i) return s;
        }
        return -1;
      },
      still: function(i, k) {
        var wp = waypoints(i)[k];
        return !!wp && wp.b === wp.a && !calloutZoomOn(i) && !focusZoomWhole(i) &&
          !((overflows[i] || [])[k]);
      }
    });

    var contentObserver = null;

    var dockObserver = null;
    if ('ResizeObserver' in window) {
      contentObserver = new ResizeObserver(debounce(settleRemeasure, 100));
      contentObserver.observe(content);
      dockObserver = new ResizeObserver(debounce(settleRemeasureDock, 100));
      dockObserver.observe(annotationsCol);
    }

    var lazyVideos = content.querySelectorAll('.wt-lazy-video');
    var videoObserver = WS.observeVideos(lazyVideos, phoneScreen);

    var syncLazyVideos = WS.videoRectSync(lazyVideos, phoneScreen);

    update();

    function destroy() {
      destroyed = true;
      keys.destroy();

      Array.prototype.forEach.call(lazyVideos, function(v) { v.pause(); });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('load', settleRemeasureDock);
      unanchor();
      dwell.destroy();
      if (contentObserver) contentObserver.disconnect();
      if (dockObserver) dockObserver.disconnect();
      if (videoObserver) videoObserver.disconnect();
      if (chrome.el.parentNode) chrome.el.parentNode.removeChild(chrome.el);
      if (cueEl.parentNode) cueEl.parentNode.removeChild(cueEl);
      spot.destroy();
      if (heading) heading.classList.remove('is-condensed');
      annotationsCol.classList.remove('has-overflow');
      annotationsCol.scrollTop = 0;
      stepRows.forEach(function(row) {
        if (row && row.parentNode) row.parentNode.removeChild(row);
      });
      if (heading && headingParent) headingParent.insertBefore(heading, headingNext);
      if (controlBar && controlBarParent) controlBarParent.insertBefore(controlBar, controlBarNext);
      section.classList.remove('is-condensed');
      annotations.forEach(function(ann) {
        ann.classList.remove('active');
        Array.prototype.forEach.call(
          ann.querySelectorAll('.walkthrough-callout-text'),
          function(p) {
            p.classList.remove('current', 'seen');
            p.removeAttribute('aria-current');
          }
        );
      });
      parkedFocusables.forEach(function(p) {
        if (p.tabindex === null) p.el.removeAttribute('tabindex');
        else p.el.setAttribute('tabindex', p.tabindex);
      });
      content.style.transform = '';
      runway.style.height = '';
      delete section.walkthroughRevealScrollY;
      delete section.walkthroughCalloutScrollY;
      delete section.walkthroughStopNav;
      delete section.walkthroughGoToStop;
      delete section.walkthroughStopState;
      delete section.walkthroughPlace;
      debugLog('walkthrough-mobile', 'act ' + actIdx + ': synced destroyed');
    }

    return { destroy: destroy, handleResize: remeasure };
  }

  function setupInterleaved(section, actIdx) {
    return window.WalkthroughInterleaved.setup(section, actIdx, {
      addressText: addressText, buildChrome: buildChrome, readRegion: readRegion
    });
  }

  window.WalkthroughMobile = {
    setupSynced: setupSynced,
    setupInterleaved: setupInterleaved
  };
})();
