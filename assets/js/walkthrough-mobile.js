

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

  function playQuietly(v) {
    var p = v.play();
    if (p && p.catch) p.catch(function() {});
  }

  function observeVideos(videos, root) {
    if (!videos.length || !('IntersectionObserver' in window)) return null;
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {

        if (entry.isIntersecting) playQuietly(entry.target);
        else entry.target.pause();
      });
    }, { root: root, threshold: 0.1 });
    videos.forEach(function(v) { io.observe(v); });
    return io;
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
      '<span class="wt-mdock-cue-sub">Highlights of the campaign page, annotated as you go</span>';
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

    var focusLabels = [];
    annotations.forEach(function(ann, i) {
      var l = ann.querySelector('.walkthrough-annotation-label');
      focusLabels[i] = l ? l.textContent.trim() : 'Section ' + (i + 1);
    });
    var liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.style.position = 'absolute';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    liveRegion.style.clipPath = 'inset(50%)';
    liveRegion.style.whiteSpace = 'nowrap';
    annotationsCol.appendChild(liveRegion);

    var headingTitleEl = section.querySelector('.walkthrough-heading-title');
    annotationsCol.setAttribute('role', 'region');
    annotationsCol.setAttribute('aria-label',
      (headingTitleEl ? headingTitleEl.textContent.trim() : 'Campaign walkthrough') + ' annotations');
    annotationsCol.setAttribute('tabindex', '0');

    var keyNavTarget = -1;
    var lastStop = -1;

    function goToStop(i) {
      keyNavTarget = clamp(i, 0, annotations.length - 1);
      window.scrollTo({ top: holdScrollY(keyNavTarget, holdLandFrac(keyNavTarget)), behavior: 'smooth' });
      watchKeyNav();
    }

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
        else if (now - stillSince > 350) { keyNavTarget = -1; return; }
        keyNavWatchRaf = requestAnimationFrame(tick);
      }
      keyNavWatchRaf = requestAnimationFrame(tick);
    }

    function stopNav(delta) {
      var target;
      if (keyNavTarget >= 0) target = keyNavTarget + delta;
      else if (lastActive >= 0) target = lastActive + delta;
      else target = delta > 0 ? lastStop + 1 : lastStop;
      if (target < 0 || target >= annotations.length) return false;
      goToStop(target);
      return true;
    }

    function onUserScrollGesture(e) {
      var t = e.target;
      if (t && t.closest && t.closest('button, a')) return;
      keyNavTarget = -1;
    }
    window.addEventListener('touchstart', onUserScrollGesture, { passive: true });
    window.addEventListener('wheel', onUserScrollGesture, { passive: true });

    function onDockKeydown(e) {

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      var delta = 0;
      if (e.key === 'ArrowRight') delta = 1;
      else if (e.key === 'ArrowLeft') delta = -1;
      else return;
      e.preventDefault();
      stopNav(delta);
    }
    annotationsCol.addEventListener('keydown', onDockKeydown);

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

    var spotSvg = section.querySelector('.walkthrough-spot-svg');
    var spotLead = spotSvg ? spotSvg.querySelector('.wt-spot-blob--lead') : null;
    var spotTrail = spotSvg ? spotSvg.querySelector('.wt-spot-blob--trail') : null;
    var spotVB = { w: 492, h: 1016 };
    if (spotSvg) {
      var vb = (spotSvg.getAttribute('viewBox') || '').split(/\s+/);
      if (vb.length === 4) {
        spotVB.w = parseFloat(vb[2]) || spotVB.w;
        spotVB.h = parseFloat(vb[3]) || spotVB.h;
      }
    }

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var spotOutlineSvg = null, spotStroke = null;
    if (spotSvg && phoneScreen.parentElement) {
      spotOutlineSvg = document.createElementNS(SVG_NS, 'svg');
      spotOutlineSvg.setAttribute('class', 'wt-spot-outline');
      spotOutlineSvg.setAttribute('viewBox', '0 0 ' + spotVB.w + ' ' + spotVB.h);
      spotOutlineSvg.setAttribute('preserveAspectRatio', 'none');
      spotOutlineSvg.setAttribute('aria-hidden', 'true');
      spotStroke = document.createElementNS(SVG_NS, 'rect');
      spotStroke.setAttribute('class', 'wt-spot-stroke');
      spotStroke.setAttribute('rx', '8');
      spotStroke.setAttribute('ry', '8');

      spotStroke.setAttribute('vector-effect', 'non-scaling-stroke');
      spotOutlineSvg.appendChild(spotStroke);
      phoneScreen.parentElement.appendChild(spotOutlineSvg);
    }

    function makeUnderline() {
      if (!spotSvg) return null;
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', 'walkthrough-underline');
      p.setAttribute('fill', 'none');
      p.setAttribute('pathLength', '1');

      p.setAttribute('vector-effect', 'non-scaling-stroke');
      spotSvg.appendChild(p);
      return p;
    }
    var spotTargets = [];
    annotations.forEach(function(ann, i) {
      var focusEl = focusEls[i];
      var subs = [];
      var texts = ann.querySelectorAll('.walkthrough-callout-text');
      if (!texts.length) {

        var reg = readRegion(ann);
        var rf = reg ? WS.regionSpotFrac(reg) : null;
        subs.push([rf
          ? { el: focusEl, frac: true, fx: rf.fx, fy: rf.fy, fw: rf.fw, fh: rf.fh }
          : { el: focusEl }]);
      } else {
        Array.prototype.forEach.call(texts, function(p) {
          var ref = p.getAttribute('data-callout-ref');
          var anchors = ann.querySelectorAll('.walkthrough-callout-anchor[data-callout-ref="' + ref + '"]');
          var list = [];
          if (!anchors.length) {
            list.push({ el: focusEl.querySelector('[data-callout="' + ref + '"]') || focusEl });
          } else {
            Array.prototype.forEach.call(anchors, function(a) {
              var img = focusEl.querySelector('[data-callout-image="' + a.getAttribute('data-anchor-image') + '"]');
              if (!img) return;
              var underline = a.getAttribute('data-anchor-underline') === 'true';
              list.push({
                img: img,
                fx: parseFloat(a.getAttribute('data-anchor-x')) || 0,
                fy: parseFloat(a.getAttribute('data-anchor-y')) || 0,
                fw: parseFloat(a.getAttribute('data-anchor-w')) || 0,
                fh: parseFloat(a.getAttribute('data-anchor-h')) || 0,
                underline: underline,
                ul: underline ? makeUnderline() : null
              });
            });
            if (!list.length) list.push({ el: focusEl });
          }
          subs.push(list);
        });
      }
      spotTargets.push(subs);
    });

    var SPOT_PAD = 6;
    function spotRect(i, k) {
      var subs = spotTargets[i];
      if (!subs || !subs.length) return null;
      var list = subs[Math.min(k, subs.length - 1)];
      if (!list || !list.length) return null;
      var panel = phoneScreen.getBoundingClientRect();
      if (!panel.width || !panel.height) return null;
      var L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
      var uls = [];
      var uL = Infinity, uT = Infinity, uR = -Infinity, uB = -Infinity;
      for (var n = 0; n < list.length; n++) {
        var t = list[n], l, tp, r, b;

        var box = t.img || t.el;
        if (t.img || t.frac) {
          var ir = box.getBoundingClientRect();
          l = ir.left + t.fx * ir.width;
          tp = ir.top + t.fy * ir.height;
          r = l + t.fw * ir.width;
          b = tp + t.fh * ir.height;
        } else {
          var er = box.getBoundingClientRect();
          l = er.left; tp = er.top; r = er.right; b = er.bottom;
        }
        if (t.underline) {

          uls.push({ el: t.ul, l: l, r: r, y: b });
          if (l < uL) uL = l;
          if (tp < uT) uT = tp;
          if (r > uR) uR = r;
          if (b > uB) uB = b;
          continue;
        }
        if (l < L) L = l;
        if (tp < T) T = tp;
        if (r > R) R = r;
        if (b > B) B = b;
      }

      if (L === Infinity) {
        if (!uls.length) return null;
        L = uL; R = uR; T = uT; B = uB;
      }
      var sx = spotVB.w / panel.width;
      var sy = spotVB.h / panel.height;

      spotHalfStroke = { x: 1.25 * sx, y: 1.25 * sy };

      spotUnderlines = [];
      for (var u = 0; u < uls.length; u++) {
        if (!uls[u].el) continue;
        var uy = (uls[u].y - panel.top) * sy;
        spotUnderlines.push({
          el: uls[u].el,
          d: 'M' + ((uls[u].l - panel.left) * sx) + ',' + uy +
             ' L' + ((uls[u].r - panel.left) * sx) + ',' + uy
        });
      }
      return {
        x: (L - panel.left - SPOT_PAD) * sx,
        y: (T - panel.top - SPOT_PAD) * sy,
        w: (R - L + SPOT_PAD * 2) * sx,
        h: (B - T + SPOT_PAD * 2) * sy
      };
    }

    var SPOT_SPRING_OMEGA = 12.8;
    var SPOT_SPRING_ZETA = 0.68;
    var SPOT_TWEEN_CAP_MS = 640;
    var SPOT_POUR_SCALE = 0.62;

    var spotReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var spotHalfStroke = { x: 0, y: 0 };
    var spotUnderlines = [];
    var spotKey = '';
    var spotCur = null;
    var spotAnim = null;
    var spotRafId = null;

    var litEls = [];
    var litUls = [];
    function setLit(list) {
      for (var n = 0; n < litEls.length; n++) litEls[n].classList.remove('wt-callout-lit');
      for (var o = 0; o < litUls.length; o++) litUls[o].classList.remove('revealed');
      litEls = [];
      litUls = [];
      if (!list) return;
      for (var m = 0; m < list.length; m++) {
        if (list[m].el) { list[m].el.classList.add('wt-callout-lit'); litEls.push(list[m].el); }
        if (list[m].ul) { list[m].ul.classList.add('revealed'); litUls.push(list[m].ul); }
      }
    }

    function spotOutline(r) {
      var hx = spotHalfStroke.x, hy = spotHalfStroke.y;
      var vbPerPxX = hx / 1.25, vbPerPx = hy / 1.25;
      var u = WS.outlineSpan(r.x, r.x + r.w, hx, spotVB.w - hx,
        WS.BOX_EDGE_SNAP_PX * vbPerPxX, WS.BOX_EDGE_RUNOFF_PX * vbPerPxX);
      var v = WS.outlineSpan(r.y, r.y + r.h, hy, spotVB.h - hy,
        WS.BOX_EDGE_SNAP_PX * vbPerPx, WS.BOX_EDGE_RUNOFF_PX * vbPerPx);

      var flushL = u.y0 >= hx && u.y0 <= 2 * hx;
      var flushR = u.y1 <= spotVB.w - hx && u.y1 >= spotVB.w - 2 * hx;
      var x0 = flushL ? -hx : u.y0, x1 = flushR ? spotVB.w + hx : u.y1;
      return { x: x0, y: v.y0, w: Math.max(0, x1 - x0), h: Math.max(0, v.y1 - v.y0) };
    }

    function spotApply(r, s) {
      var els = [spotLead, spotTrail];
      for (var n = 0; n < els.length; n++) {
        els[n].style.x = r.x + 'px';
        els[n].style.y = r.y + 'px';
        els[n].style.width = r.w + 'px';
        els[n].style.height = r.h + 'px';
      }
      if (spotStroke) {
        s = s || spotOutline(r);
        spotStroke.style.x = s.x + 'px';
        spotStroke.style.y = s.y + 'px';
        spotStroke.style.width = s.w + 'px';
        spotStroke.style.height = s.h + 'px';
      }

      for (var u = 0; u < spotUnderlines.length; u++) {
        spotUnderlines[u].el.setAttribute('d', spotUnderlines[u].d);
      }
      spotCur = r;
    }

    function spotOff() {
      spotKey = '';
      spotAnim = null;
      setLit(null);
      if (spotSvg) spotSvg.classList.remove('visible');
      if (spotStroke) spotStroke.classList.remove('visible');
    }

    function spotTick(ts) {
      spotRafId = null;
      if (destroyed || !spotAnim) return;
      var to = spotRect(spotAnim.i, spotAnim.k);
      if (!to) { spotAnim = null; return; }
      var ms = ts - spotAnim.start;
      var p = clamp(ms / SPOT_TWEEN_CAP_MS, 0, 1);
      var e = p >= 1 ? 1 : WS.springStep(ms / 1000, SPOT_SPRING_OMEGA, SPOT_SPRING_ZETA);
      var blend = function(a, b) {
        return {
          x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e,
          w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e
        };
      };

      spotApply(blend(spotAnim.from, to), blend(spotOutline(spotAnim.from), spotOutline(to)));
      if (p < 1) spotRafId = requestAnimationFrame(spotTick);
      else spotAnim = null;
    }

    function setSpot(i, k) {
      if (!spotSvg || !spotLead || !spotTrail) return;
      if (i < 0) { spotOff(); return; }
      var to = spotRect(i, k);

      if (!to || to.y + to.h < 0 || to.y > spotVB.h ||
          (zoomEnabled && (to.x + to.w < 0 || to.x > spotVB.w))) { spotOff(); return; }
      var key = i + ':' + k;
      if (key !== spotKey) {
        var wasOn = spotKey !== '' && spotCur;
        spotKey = key;
        var subs = spotTargets[i];
        setLit(subs ? subs[Math.min(k, subs.length - 1)] : null);
        spotSvg.classList.add('visible');
        if (spotStroke) spotStroke.classList.add('visible');

        var from = wasOn ? spotCur : {
          x: to.x + to.w * (1 - SPOT_POUR_SCALE) / 2, y: to.y + to.h * (1 - SPOT_POUR_SCALE) / 2,
          w: to.w * SPOT_POUR_SCALE, h: to.h * SPOT_POUR_SCALE
        };
        if (spotReducedMotion) {
          spotAnim = null;
          spotApply(to);
        } else {
          if (!wasOn) spotApply(from);
          spotAnim = { i: i, k: k, from: from, start: performance.now() };
          if (!spotRafId) spotRafId = requestAnimationFrame(spotTick);
        }
      } else if (!spotAnim) {
        spotApply(to);
      }
    }

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
    var FRAME_PAD = 12;

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
        var pair = waypointPair(calloutSpan(i, k), prev, panelH, FRAME_PAD, maxScroll);
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
      if (!(R > L && B > T)) return (cwCache[key] = null);
      v = {
        x: clamp((L - br.left) / br.width, 0, 1),
        y: clamp((T - br.top) / br.height, 0, 1),
        w: clamp((R - L) / br.width, 0.001, 1),
        h: clamp((B - T) / br.height, 0.001, 1),
        xEnd: null
      };
      cwCache[key] = v;
      return v;
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
      var prev = holdOrigin(i);
      var weights = [], shares = [], heads = [], tails = [], total2 = 0;
      var swapOn = calloutZoomOn(i);
      for (var k = 0; k < ws.length; k++) {
        var hopRun = Math.max(0, ws[k].a - prev) * PAN_RATE;

        if (swapOn && k > 0) hopRun = Math.max(hopRun, (ZOOM_SWAP + SWAP_LEAD) * vpH);
        var travPx = Math.max(0, ws[k].b - ws[k].a);
        var travRun = travPx * PAN_RATE;

        var slack = HOLD_PER_SUB * vpH * holdScaleOf(i) +
          (per[k] || 0) * DOCK_REVEAL_RATE;

        var minTravRun = travPx * TRAV_SLOW - slack;
        if (minTravRun > travRun) travRun = minTravRun;

        if (travPx > 0 && travRun > TRAV_RUN_CAP * vpH) travRun = TRAV_RUN_CAP * vpH;

        var slidePx = slideRendered(i, k);
        if (slidePx > 0) {

          var minSlideRun =
            (slidePx / Math.max(1, panelW)) * SLIDE_SLOW_VH * vpH /
            (1 - SLIDE_RUNWAY) - slack;
          if (minSlideRun > travRun) travRun = minSlideRun;
        }

        var tailRun = travPx > FRAME_PAD ? TAIL_DWELL * vpH : 0;

        var headRun = travPx > FRAME_PAD ? HEAD_DWELL * vpH : 0;

        if (slidePx > 0) {
          tailRun = Math.max(tailRun, SLIDE_TAIL * vpH);
        }

        var exitRun = (ws.length > 1 && k === ws.length - 1)
          ? EXIT_BUFFER * vpH * holdScaleOf(i) : 0;
        var w = hopRun + headRun + travRun + slack + tailRun + exitRun;
        weights.push(w);
        shares.push(w > 0 ? hopRun / w : 0);
        heads.push(w > 0 ? headRun / w : 0);
        tails.push(w > 0 ? (tailRun + exitRun) / w : 0);
        total2 += w;
        prev = ws[k].b;
      }
      var bounds = [0];
      var cum = 0;
      for (var b = 0; b < weights.length; b++) {
        cum += weights[b];
        bounds.push(total2 > 0 ? cum / total2 : 1);
      }
      bounds[bounds.length - 1] = 1;

      var sw = {
        bounds: bounds, shares: shares, heads: heads, tails: tails,
        totalPx: total2
      };
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
      measureDockOverflows();
    }

    var lastDockKey = '';
    function measureDockOverflows() {
      var dockKey = annotationsCol.clientWidth + 'x' + annotationsCol.clientHeight;
      if (dockKey === lastDockKey && overflows.length) return;
      lastDockKey = dockKey;
      overflows = [];
      var dockH = annotationsCol.clientHeight;
      var liveActive = annotationsCol.querySelector('.walkthrough-annotation.active');
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
      if (liveActive) liveActive.classList.add('active');
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
    var ticking = false;
    var lastActive = -2;
    var lastSub = -1;
    var lastAnnounced = -1;
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
        if (active >= 0 && active === keyNavTarget) keyNavTarget = -1;
        if (active >= 0 && active !== lastAnnounced) {
          lastAnnounced = active;
          liveRegion.textContent = focusLabels[active];
        }
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
      if (destroyed) { ticking = false; return; }
      var probeT0 = pv ? performance.now() : 0;
      var raw = -section.getBoundingClientRect().top;

      var off = raw < -vpH || raw > total + vpH;
      if (off && offRunway) { ticking = false; return; }
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
        if (wIdx > 0 && wLocal < share && calloutZoomOn(i) &&
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
      setDock(active, sub);

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

      var hasOverflow = active >= 0 &&
        annotationsCol.scrollTop + annotationsCol.clientHeight <
          annotationsCol.scrollHeight - 4;

      setSpot(holdSwapOut ? -1 : active, Math.max(0, sub - 1));
      annotationsCol.classList.toggle('has-overflow', hasOverflow);
      if (chrome.fill) {
        chrome.fill.style.transform = 'scaleX(' + (maxScroll > 0 ? scrollY / maxScroll : 1) + ')';
      }
      if (pv) probeFrame(probeT0, scrolled, zoomEnv, zu, seg.type, active, sub, zoomSpecLive);
      ticking = false;
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

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

    function holdScrollY(i, frac) {
      var sectionDocTop = section.getBoundingClientRect().top + window.pageYOffset;
      for (var s = 0; s < segments.length; s++) {
        if (segments[s].type === 'hold' && segments[s].i === i) {
          return sectionDocTop + segments[s].start + segments[s].len * clamp(frac, 0, 1);
        }
      }
      return sectionDocTop;
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

    function onWindowLoad() { lastDockKey = ''; remeasure(); }
    window.addEventListener('load', onWindowLoad);

    var onVvResize = debounce(remeasure, 150);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onVvResize);
    }

    var contentObserver = null;

    var dockObserver = null;
    if ('ResizeObserver' in window) {
      contentObserver = new ResizeObserver(debounce(remeasure, 100));
      contentObserver.observe(content);
      dockObserver = new ResizeObserver(debounce(function() { lastDockKey = ''; remeasure(); }, 100));
      dockObserver.observe(annotationsCol);
    }

    var lazyVideos = content.querySelectorAll('.wt-lazy-video');
    var videoObserver = observeVideos(lazyVideos, phoneScreen);

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
        if (vis && v.paused) playQuietly(v);
        else if (!vis && !v.paused) v.pause();
      });
    }

    update();

    function destroy() {
      destroyed = true;
      if (keyNavWatchRaf) { cancelAnimationFrame(keyNavWatchRaf); keyNavWatchRaf = null; }

      Array.prototype.forEach.call(lazyVideos, function(v) { v.pause(); });
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('load', onWindowLoad);
      window.removeEventListener('touchstart', onUserScrollGesture);
      window.removeEventListener('wheel', onUserScrollGesture);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onVvResize);
      }
      if (contentObserver) contentObserver.disconnect();
      if (dockObserver) dockObserver.disconnect();
      if (videoObserver) videoObserver.disconnect();
      if (chrome.el.parentNode) chrome.el.parentNode.removeChild(chrome.el);
      if (cueEl.parentNode) cueEl.parentNode.removeChild(cueEl);
      if (spotRafId) cancelAnimationFrame(spotRafId);
      spotOff();
      [spotLead, spotTrail, spotStroke].forEach(function(el) {
        if (!el) return;
        el.style.x = ''; el.style.y = '';
        el.style.width = ''; el.style.height = '';
      });

      if (spotOutlineSvg && spotOutlineSvg.parentNode) {
        spotOutlineSvg.parentNode.removeChild(spotOutlineSvg);
      }
      spotOutlineSvg = null;
      spotStroke = null;

      spotTargets.forEach(function(subs) {
        subs.forEach(function(list) {
          list.forEach(function(t) {
            if (t.ul && t.ul.parentNode) t.ul.parentNode.removeChild(t.ul);
          });
        });
      });
      if (heading) heading.classList.remove('is-condensed');
      if (liveRegion.parentNode) liveRegion.parentNode.removeChild(liveRegion);
      annotationsCol.removeEventListener('keydown', onDockKeydown);
      annotationsCol.removeAttribute('tabindex');
      annotationsCol.removeAttribute('role');
      annotationsCol.removeAttribute('aria-label');
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
      debugLog('walkthrough-mobile', 'act ' + actIdx + ': synced destroyed');
    }

    return { destroy: destroy, handleResize: remeasure };
  }

  function applyCropWindow(blockEl, ann) {
    var reg = readRegion(ann);
    if (!reg) return null;

    var w = reg.w == null ? 1 : reg.w;
    var wrap = document.createElement('div');
    wrap.className = 'wt-mi-crop';
    wrap.style.setProperty('--rx', String(reg.x));
    wrap.style.setProperty('--ry', String(reg.y));
    wrap.style.setProperty('--rw', String(w));
    wrap.appendChild(blockEl);
    return { el: wrap, block: blockEl, h: reg.h };
  }

  function fitCropWindows(crops) {
    crops.forEach(function(c) {
      var bh = c.block.offsetHeight;
      c.el.style.height = bh ? (bh * c.h) + 'px' : '';
    });
  }

  function setupInterleaved(section, actIdx) {
    var content = section.querySelector('.wt-phone-scroll');
    var annotations = section.querySelectorAll('.walkthrough-annotation');
    if (!content || !annotations.length) return null;
    var iggRoot = content.querySelector('.igg-content') || content;

    var focusEls = WS.resolveFocusEls(content, annotations);
    var annsByBlock = new Map();
    Array.prototype.forEach.call(annotations, function(ann, i) {
      var b = focusEls[i];
      if (!b) return;
      if (!annsByBlock.has(b)) annsByBlock.set(b, []);
      annsByBlock.get(b).push(ann);
    });

    var address = addressText(section);
    var container = document.createElement('div');
    container.className = 'wt-mi';

    var heading = section.querySelector('.walkthrough-heading');
    if (heading) {
      var hc = heading.cloneNode(true);
      hc.classList.add('wt-mi-heading');
      container.appendChild(hc);
    }

    var pendingTransit = 0;
    var sliceCount = 0;
    var crops = [];

    function flushSeam() {
      if (!pendingTransit) return;
      pendingTransit = 0;
      var seam = document.createElement('div');
      seam.className = 'wt-mi-seam';
      var label = document.createElement('span');
      label.textContent = 'Page continues';
      seam.appendChild(label);
      container.appendChild(seam);
    }

    Array.prototype.forEach.call(iggRoot.children, function(block) {
      if (!block.classList || !block.classList.contains('igg-block')) return;
      var anns = annsByBlock.get(block);
      if (!anns) { pendingTransit++; return; }
      flushSeam();
      anns.forEach(function(ann) { addSlice(block, ann); });
    });
    flushSeam();

    function addSlice(block, ann) {
      var slice = document.createElement('section');
      slice.className = 'wt-mi-slice';
      slice.appendChild(buildChrome(address, false).el);

      var page = document.createElement('div');
      page.className = 'igg-content wt-mi-page';
      var blockClone = block.cloneNode(true);
      var crop = applyCropWindow(blockClone, ann);
      page.appendChild(crop ? crop.el : blockClone);
      if (crop) crops.push(crop);
      slice.appendChild(page);

      var card = document.createElement('aside');
      card.className = 'wt-mi-card';
      var label = ann.querySelector('.walkthrough-annotation-label');
      if (label) card.appendChild(label.cloneNode(true));
      Array.prototype.forEach.call(
        ann.querySelectorAll('.walkthrough-annotation-text'),
        function(p) { card.appendChild(p.cloneNode(true)); }
      );
      slice.appendChild(card);

      container.appendChild(slice);
      sliceCount++;
    }

    if (!sliceCount) return null;
    debugLog('walkthrough-mobile', 'act ' + actIdx + ': interleaved setup (' + sliceCount + ' slices)');
    section.appendChild(container);

    var cropObserver = null;
    if (crops.length) {
      if (typeof ResizeObserver === 'function') {
        cropObserver = new ResizeObserver(function() { fitCropWindows(crops); });
        crops.forEach(function(c) { cropObserver.observe(c.block); });
      } else {
        fitCropWindows(crops);
      }
    }

    var videoObserver = null;
    var videos = container.querySelectorAll('.wt-lazy-video');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Array.prototype.forEach.call(videos, function(v) {
        v.setAttribute('controls', '');
      });
    } else {
      videoObserver = observeVideos(videos, null);
    }

    function destroy() {
      if (videoObserver) videoObserver.disconnect();
      if (cropObserver) cropObserver.disconnect();
      if (container.parentNode) container.parentNode.removeChild(container);
      debugLog('walkthrough-mobile', 'act ' + actIdx + ': interleaved destroyed');
    }

    return { destroy: destroy, handleResize: function() {} };
  }

  window.WalkthroughMobile = {
    setupSynced: setupSynced,
    setupInterleaved: setupInterleaved
  };
})();
