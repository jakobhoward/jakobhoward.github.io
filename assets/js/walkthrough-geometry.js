

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./walkthrough-shared.js'));
  } else {
    if (!root || !root.WalkthroughShared) {
      throw new Error('walkthrough-shared.js must load before walkthrough-geometry.js');
    }
    root.WalkthroughGeometry = factory(root.WalkthroughShared);
  }
})(typeof window !== 'undefined' ? window : null, function (WS) {
  'use strict';

  var clamp = WS.clamp;

  function waypointPair(span, prev, visibleH, framePad, maxScroll) {
    if (!span) return { a: prev, b: prev };
    var spanH = span.bottom - span.top;
    var a = spanH > visibleH * 0.8
      ? span.top - visibleH * 0.2
      : (span.top + span.bottom) / 2 - visibleH / 2;
    a = clamp(a, prev, maxScroll);
    var b = clamp(span.bottom + framePad - visibleH, a, maxScroll);
    return { a: a, b: b };
  }

  function chainSeams(chains) {
    for (var s = 0; s + 1 < chains.length; s++) {
      var lastWp = chains[s][chains[s].length - 1];
      var nextWs = chains[s + 1];
      if (lastWp.b > lastWp.a) {
        lastWp.b = Math.max(lastWp.a, Math.min(lastWp.b, nextWs[0].a));
      }
      if (nextWs[0].a < lastWp.b) {
        nextWs[0].a = lastWp.b;
        if (nextWs[0].b < nextWs[0].a) nextWs[0].b = nextWs[0].a;
        for (var m = 1; m < nextWs.length; m++) {
          if (nextWs[m].a < nextWs[m - 1].b) nextWs[m].a = nextWs[m - 1].b;
          if (nextWs[m].b < nextWs[m].a) nextWs[m].b = nextWs[m].a;
        }
      }
    }
    return chains;
  }

  function subWindows(p) {
    var ws = p.waypoints;
    var dwellVh = p.dwellVh;
    var prev = p.origin;
    var weights = [], shares = [], heads = [], tails = [], total = 0;
    var pxPerVh = p.innerH / 100;
    for (var k = 0; k < ws.length; k++) {
      var hopVh = (Math.max(0, ws[k].a - prev) / p.visibleH) * p.panRateVh;

      if (p.hopMinVh && p.hopMinVh[k] > hopVh) hopVh = p.hopMinVh[k];
      var travPx = Math.max(0, ws[k].b - ws[k].a);
      var travVh = (travPx / p.visibleH) * p.panRateVh;

      var minTravVh = (travPx * p.travSlowPagePerPx) / Math.max(1, pxPerVh) - dwellVh;
      if (minTravVh > travVh) travVh = minTravVh;

      if (travPx > 0 && p.travRunwayCapVh > 0 && travVh > p.travRunwayCapVh) {
        travVh = p.travRunwayCapVh;
      }

      var slidePx = p.slidePxK ? (p.slidePxK[k] || 0) : (k === 0 ? p.slidePx : 0);
      if (ws[k].b === ws[k].a) {
        if (slidePx > 0) {

          var slideRunPx = (slidePx / Math.max(1, p.frameW)) *
            p.slideSlowVh * p.innerH /
            (1 - 2 * p.zoomRamp - 2 * (p.slideRunway || 0));
          var minSlideVh = slideRunPx / Math.max(1, pxPerVh) - dwellVh;
          if (minSlideVh > travVh) travVh = minSlideVh;
        }
      }

      var tailVh = travPx > p.framePad ? p.tailDwellVh : 0;
      var headVh = travPx > p.framePad ? (p.headDwellVh || 0) : 0;

      var exitVh = (ws.length > 1 && k === ws.length - 1)
        ? (p.exitBufferVh || 0) : 0;
      var w = hopVh + headVh + travVh + dwellVh + tailVh + exitVh;
      weights.push(w);
      shares.push(hopVh / w);
      heads.push(headVh / w);
      tails.push((tailVh + exitVh) / w);
      total += w;
      prev = ws[k].b;
    }
    var bounds = [0];
    var cum = 0;
    for (var b = 0; b < weights.length; b++) {
      cum += weights[b];
      bounds.push(cum / total);
    }
    bounds[bounds.length - 1] = 1;
    return {
      bounds: bounds, panShares: shares, headShares: heads,
      tailShares: tails, totalVh: total
    };
  }

  function subWindowsSynced(p) {
    var ws = p.waypoints;
    var per = p.overflows || [];
    var prev = p.origin;
    var swapOn = p.swapOn;
    var holdScale = p.holdScale;
    var slidePxK = p.slidePxK || [];
    var vpH = p.vpH, panelW = p.panelW;
    var K = p.K;
    var PAN_RATE = K.PAN_RATE, TRAV_SLOW = K.TRAV_SLOW;
    var TRAV_RUN_CAP = K.TRAV_RUN_CAP, FRAME_PAD = K.FRAME_PAD;
    var HOLD_PER_SUB = K.HOLD_PER_SUB, DOCK_REVEAL_RATE = K.DOCK_REVEAL_RATE;
    var HEAD_DWELL = K.HEAD_DWELL, TAIL_DWELL = K.TAIL_DWELL;
    var EXIT_BUFFER = K.EXIT_BUFFER;
    var SLIDE_SLOW_VH = K.SLIDE_SLOW_VH, SLIDE_RUNWAY = K.SLIDE_RUNWAY;
    var SLIDE_TAIL = K.SLIDE_TAIL;
    var ZOOM_SWAP = K.ZOOM_SWAP, SWAP_LEAD = K.SWAP_LEAD;
    var weights = [], shares = [], heads = [], tails = [], total2 = 0;
    for (var k = 0; k < ws.length; k++) {
      var hopRun = Math.max(0, ws[k].a - prev) * PAN_RATE;

      if (swapOn && k > 0 && !(p.heldK && p.heldK[k])) {
        hopRun = Math.max(hopRun, (ZOOM_SWAP + SWAP_LEAD) * vpH);
      }
      var travPx = Math.max(0, ws[k].b - ws[k].a);
      var travRun = travPx * PAN_RATE;

      var slack = HOLD_PER_SUB * vpH * holdScale +
        (per[k] || 0) * DOCK_REVEAL_RATE;

      var minTravRun = travPx * TRAV_SLOW - slack;
      if (minTravRun > travRun) travRun = minTravRun;

      if (travPx > 0 && travRun > TRAV_RUN_CAP * vpH) travRun = TRAV_RUN_CAP * vpH;

      var slidePx = slidePxK[k] || 0;
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
        ? EXIT_BUFFER * vpH * holdScale : 0;
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

    return {
      bounds: bounds, shares: shares, heads: heads, tails: tails,
      totalPx: total2
    };
  }

  function transitRunwayVh(p) {
    var screens = p.baseD / p.visibleH;
    var taper = p.taper === false ? 1 : 0.55;
    var effVh = (screens <= 1.2
                  ? screens * p.panRateVh
                  : 1.2 * p.panRateVh + (screens - 1.2) * p.panRateVh * taper)
              + (p.hopD / p.visibleH) * p.panRateVh;
    return p.transitVh + effVh;
  }

  function exitRunwayVh(p) {
    if (p.taper === false) {
      return p.exitMinVh + (p.exitDist / p.visibleH) * p.panRateVh;
    }
    return p.exitMinVh + Math.min(20, (p.exitDist / p.visibleH) * p.panRateVh);
  }

  function panEase(t, movePx, visibleH) {
    return Math.abs(movePx) > visibleH * 0.5 ? t : WS.easeOutCubic(t);
  }

  return {
    waypointPair: waypointPair,
    chainSeams: chainSeams,
    subWindows: subWindows,
    subWindowsSynced: subWindowsSynced,
    transitRunwayVh: transitRunwayVh,
    exitRunwayVh: exitRunwayVh,
    panEase: panEase
  };
});
