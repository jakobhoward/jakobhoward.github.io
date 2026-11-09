

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before motion/spotlight-pinned.js');
  }
  var WS = window.WalkthroughShared;
  var debugLog = WS.debugLog;
  var clamp = WS.clamp;

  function create(ctx) {
    var spotSvg = ctx.svg;
    var targetViewportRect = ctx.targetViewportRect;

    var callouts, activeFocus, revealedCount, hopReleased;
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

    var SPOT_SPRING_OMEGA_PINNED = 12.4;
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

    function snapSpotState() {
      var t = morphTarget;
      cancelMorph();
      if (t) {
        applyLeadTrail(t, t);
        applyBridgeLine(t, t);
      }
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
        var leadT  = WS.springStep(ms / 1000, SPOT_SPRING_OMEGA_PINNED, SPOT_SPRING_ZETA);
        var trailT = pour ? leadT
          : WS.springStep((ms - SPOT_TRAIL_LAG_MS) / 1000, SPOT_SPRING_OMEGA_PINNED, SPOT_SPRING_ZETA);
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

      var pad = WS.RAIL_PAD_PX;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var t = 0; t < entry.targets.length; t++) {
        var tg = entry.targets[t];

        if (tg.underline) continue;
        var base = targetViewportRect(focusIdx, entryIdx, t, tg, phoneScreenRect);
        var l, top, r, b;
        if (tg.kind === 'dom') {
          l = base.left; top = base.top; r = base.right; b = base.bottom;
        } else {

          var air = tg.type ? WS.CONTENT_KEEP_PX : 0;
          l   = base.left + base.width  * tg.fx - air;
          top = base.top  + base.height * tg.fy - air;
          r   = base.left + base.width  * (tg.fx + tg.fw) + air;
          b   = base.top  + base.height * (tg.fy + tg.fh) + air;
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
      callouts = ctx.callouts();
      activeFocus = ctx.activeFocus();
      revealedCount = ctx.revealedCount();
      hopReleased = ctx.hopReleased();

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

      var isSubStepChange = (activeFocus === spotLastFocusIdx && subIdx !== spotLastSubIdx &&
        ctx.boxOwner(activeFocus, subIdx) !== ctx.boxOwner(activeFocus, spotLastSubIdx));

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

    return {
      update: updateSpotlight, clear: clearSpotState, snap: snapSpotState,
      VB_W: SPOT_VB_W, VB_H: SPOT_VB_H
    };
  }

  window.SpotlightPinned = { create: create };
})();
