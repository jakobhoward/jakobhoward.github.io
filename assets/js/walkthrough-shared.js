

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WalkthroughShared = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function smoothStep(t) { return t * t * (3 - 2 * t); }

  function springStep(t, omega, zeta) {
    if (t <= 0) return 0;
    var d = zeta * omega * t;
    if (zeta >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
    var wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-d) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
  }

  function smoothInt(x) { return x * x * x - (x * x * x * x) / 2; }

  function trapEase(t, r) {
    if (!(r > 0)) return t;
    var n = 1 - r;
    if (t < r) return r * smoothInt(t / r) / n;
    if (t > 1 - r) return 1 - r * smoothInt((1 - t) / r) / n;
    return (r / 2 + (t - r)) / n;
  }

  function debounce(fn, delay) {
    var timeout;
    return function () { clearTimeout(timeout); timeout = setTimeout(fn, delay); };
  }

  var lvhProbe = null;
  function stableViewportH() {
    if (typeof document === 'undefined') return 0;
    if (!lvhProbe) {
      lvhProbe = document.createElement('div');
      lvhProbe.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none;';
      (document.body || document.documentElement).appendChild(lvhProbe);
    }
    var h = lvhProbe.offsetHeight;
    return h > 0 ? h : window.innerHeight;
  }

  function rafThrottle(fn) {
    var ticking = false;
    return function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(function () { ticking = false; fn(); });
      }
    };
  }

  function debugLog() {
    var d = (typeof window !== 'undefined') && window.debug;
    if (d && typeof d.log === 'function') d.log.apply(d, arguments);
  }

  var SLIDE_EASE = 0.15;

  var SLIDE_RUNWAY = 0.1;

  var ZOOM_EDGE_PX = 14;

  var BOX_EDGE_SNAP_PX = 8;
  var BOX_EDGE_RUNOFF_PX = 32;

  function outlineSpan(top, bottom, cutT, cutB, snap, runoff) {
    var vis0 = Math.max(top, cutT), vis1 = Math.min(bottom, cutB);
    if (vis1 <= vis0) return { y0: vis0, y1: vis0 };
    return {
      y0: top >= cutT - snap ? vis0 : cutT - runoff,
      y1: bottom <= cutB + snap ? vis1 : cutB + runoff
    };
  }

  var GHOST_GAP_PX = 8;
  var GHOST_TRIM_MAX = 0.35;

  function ghostOutline(g, c, gap, trimMax) {
    if (!g || !c) return g;
    if (gap == null) gap = GHOST_GAP_PX;
    if (trimMax == null) trimMax = GHOST_TRIM_MAX;
    var gx1 = g.x + g.w, gy1 = g.y + g.h;
    var cx0 = c.x - gap, cy0 = c.y - gap;
    var cx1 = c.x + c.w + gap, cy1 = c.y + c.h + gap;
    if (gx1 <= cx0 || g.x >= cx1 || gy1 <= cy0 || g.y >= cy1) return g;
    var best = null;
    function consider(loss, extent, box) {
      if (!(extent > 0) || loss / extent > trimMax) return;
      if (!best || loss < best.loss) best = { loss: loss, box: box };
    }
    if (g.y < cy0) consider(gy1 - cy0, g.h, { x: g.x, y: g.y, w: g.w, h: cy0 - g.y });
    if (gy1 > cy1) consider(cy1 - g.y, g.h, { x: g.x, y: cy1, w: g.w, h: gy1 - cy1 });
    if (g.x < cx0) consider(gx1 - cx0, g.w, { x: g.x, y: g.y, w: cx0 - g.x, h: g.h });
    if (gx1 > cx1) consider(cx1 - g.x, g.w, { x: cx1, y: g.y, w: gx1 - cx1, h: g.h });
    return best ? best.box : null;
  }

  function zoomFit(p) {
    var regionW = p.regW * p.blockWidth;
    var vTerm = p.frameH / p.blockHeight;
    var s0 = clamp(Math.min(p.frameW / regionW, vTerm), 1, p.maxScale);
    var far = (p.regXEnd == null ? p.regX : Math.max(p.regX, p.regXEnd)) + p.regW;
    var mL = Math.min(ZOOM_EDGE_PX, Math.max(0, p.regX) * p.blockWidth * s0);
    var mR = Math.min(ZOOM_EDGE_PX, Math.max(0, 1 - far) * p.blockWidth * s0);
    var scale = clamp(Math.min((p.frameW - mL - mR) / regionW, vTerm), 1, p.maxScale);
    function originFor(xf) {
      var winW = p.frameW / scale;
      var slack = Math.max(0, winW - regionW - (mL + mR) / scale);
      return clamp(p.blockLeft + xf * p.blockWidth - mL / scale - slack / 2,
                   0, Math.max(0, p.contentW - winW));
    }
    var panX = originFor(p.regX);

    var winH = p.frameH / scale;
    var yContain = p.blockTop + p.blockHeight - winH;
    var centred = p.blockTop + p.blockHeight / 2 - winH / 2;
    var scrollY;
    if (p.parkY == null) {
      scrollY = centred;
    } else {

      var aim = (p.blockHeight <= winH && centred > p.parkY) ? centred : p.parkY;
      scrollY = clamp(aim, Math.min(yContain, p.blockTop), Math.max(yContain, p.blockTop));
    }
    scrollY = clamp(scrollY, 0, Math.max(0, p.contentH - winH));
    return {
      scale: scale, panX: panX, scrollY: scrollY,
      panXEnd: p.regXEnd == null ? panX : originFor(p.regXEnd)
    };
  }

  function normalizeRegion(ann, mobile, base) {
    if (!ann) return null;
    var b = base || 'data-region-';
    var p = (mobile && ann.hasAttribute(b + 'm-y')) ? b + 'm-' : b;
    var y = parseFloat(ann.getAttribute(p + 'y'));
    var h = parseFloat(ann.getAttribute(p + 'h'));
    if (isNaN(y) || isNaN(h) || h <= 0) return null;
    var x = parseFloat(ann.getAttribute(p + 'x'));
    var w = parseFloat(ann.getAttribute(p + 'w'));
    var x2 = parseFloat(ann.getAttribute(p + 'x2'));
    x = (isNaN(x) || x < 0) ? 0 : x;
    w = (isNaN(w) || w <= 0) ? null : w;
    return {
      y: y, h: h, x: x, w: w,
      xEnd: (w && !isNaN(x2) && x2 >= 0 && x2 !== x) ? x2 : null
    };
  }

  function regionSpotFrac(reg) {
    var fx = reg.x || 0;
    var fw = reg.w || 1;
    if (reg.w && reg.xEnd != null) {
      var lo = Math.min(fx, reg.xEnd);
      fw = Math.max(fx, reg.xEnd) + fw - lo;
      fx = lo;
    }
    return { fx: fx, fy: reg.y, fw: fw, fh: reg.h };
  }

  function resolveFocusEls(content, annotations) {
    var blocks = content.querySelectorAll('[data-focus]');
    var byName = {};
    for (var b = 0; b < blocks.length; b++) {
      var nm = blocks[b].getAttribute('data-focus');
      if (nm && !byName[nm]) byName[nm] = blocks[b];
    }
    var out = [];
    for (var i = 0; i < annotations.length; i++) {
      var ann = annotations[i];
      var ref = ann.getAttribute('data-focus-ref') || ann.getAttribute('data-annotation');
      out.push((ref && byName[ref]) || blocks[i] || null);
    }

    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  }

  function publishStop(section, index, count, phase) {
    var prev = section.walkthroughStopState;
    if (prev && prev.index === index && prev.count === count && prev.phase === phase) return;
    var state = { index: index, count: count, phase: phase };
    section.walkthroughStopState = state;
    section.dispatchEvent(new CustomEvent('walkthrough:stop', { detail: state }));
  }

  return {
    clamp: clamp,
    easeOutCubic: easeOutCubic,
    springStep: springStep,
    smoothStep: smoothStep,
    smoothInt: smoothInt,
    trapEase: trapEase,
    debounce: debounce,
    stableViewportH: stableViewportH,
    rafThrottle: rafThrottle,
    debugLog: debugLog,
    zoomFit: zoomFit,
    normalizeRegion: normalizeRegion,
    regionSpotFrac: regionSpotFrac,
    resolveFocusEls: resolveFocusEls,
    publishStop: publishStop,
    SLIDE_EASE: SLIDE_EASE,
    SLIDE_RUNWAY: SLIDE_RUNWAY,
    ZOOM_EDGE_PX: ZOOM_EDGE_PX,
    outlineSpan: outlineSpan,
    ghostOutline: ghostOutline,
    BOX_EDGE_SNAP_PX: BOX_EDGE_SNAP_PX,
    BOX_EDGE_RUNOFF_PX: BOX_EDGE_RUNOFF_PX,
    GHOST_GAP_PX: GHOST_GAP_PX
  };
});
