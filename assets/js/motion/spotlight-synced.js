

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before motion/spotlight-synced.js');
  }
  var WS = window.WalkthroughShared;
  var clamp = WS.clamp;

  function create(ctx) {
    var section = ctx.section, phoneScreen = ctx.phoneScreen;
    var annotations = ctx.annotations, focusEls = ctx.focusEls;
    var readRegion = ctx.readRegion, zoomEnabled = ctx.zoomEnabled;

    var destroyed = false;

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
    var OUTLINE_GUTTER_PX = 10;
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
                ul: underline ? makeUnderline() : null,

                within: underline && a.hasAttribute('data-anchor-in-x') ? {
                  fx: parseFloat(a.getAttribute('data-anchor-in-x')) || 0,
                  fy: parseFloat(a.getAttribute('data-anchor-in-y')) || 0,
                  fw: parseFloat(a.getAttribute('data-anchor-in-w')) || 0,
                  fh: parseFloat(a.getAttribute('data-anchor-in-h')) || 0
                } : null
              });
            });
            if (!list.length) list.push({ el: focusEl });

            else if (list.every(function(t) { return t.underline; })) {
              var boxEl = focusEl.querySelector('[data-callout="' + ref + '"]');
              if (boxEl) list.unshift({ el: boxEl });
            }
          }
          subs.push(list);
        });
      }
      spotTargets.push(subs);
    });

    var SPOT_PAD = 6;

    var UL_SEEN_TOL = 2;
    var UL_LATE_MS = 600;
    function ulSeen(l, t, r, b, panel) {
      function fits(a0, a1, p0, p1) {
        return (a0 >= p0 - UL_SEEN_TOL && a1 <= p1 + UL_SEEN_TOL) || (a0 <= p0 && a1 >= p1);
      }
      return fits(l, r, panel.left, panel.right) && fits(t, b, panel.top, panel.bottom);
    }
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

          var w = t.within;
          uls.push({ el: t.ul, l: l, r: r, y: b, seen: w
            ? ulSeen(ir.left + w.fx * ir.width, ir.top + w.fy * ir.height,
                ir.left + (w.fx + w.fw) * ir.width, ir.top + (w.fy + w.fh) * ir.height, panel)
            : ulSeen(l, tp, r, b, panel) });
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
        var uy = (uls[u].y + WS.UNDERLINE_DROP_PX - panel.top) * sy;
        spotUnderlines.push({
          el: uls[u].el,
          seen: uls[u].seen,
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

    var SPOT_SPRING_OMEGA_SYNCED = 12.8;

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
    var litAt = 0;
    function setLit(list) {
      for (var n = 0; n < litEls.length; n++) litEls[n].classList.remove('wt-callout-lit');
      for (var o = 0; o < litUls.length; o++) litUls[o].classList.remove('revealed', 'is-late');
      litEls = [];
      litUls = [];
      litAt = performance.now();
      if (!list) return;
      for (var m = 0; m < list.length; m++) {
        if (list[m].el) { list[m].el.classList.add('wt-callout-lit'); litEls.push(list[m].el); }
        if (list[m].ul) litUls.push(list[m].ul);
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

        var gutter = OUTLINE_GUTTER_PX * spotHalfStroke.x / 1.25;
        spotOutlineSvg.classList.toggle('is-runoff-l', s.x < -gutter);
        spotOutlineSvg.classList.toggle('is-runoff-r', s.x + s.w > spotVB.w + gutter);
      }

      for (var u = 0; u < spotUnderlines.length; u++) {
        var ul = spotUnderlines[u];
        ul.el.setAttribute('d', ul.d);
        if (ul.seen && litUls.indexOf(ul.el) >= 0 && !ul.el.classList.contains('revealed')) {
          if (performance.now() - litAt > UL_LATE_MS) ul.el.classList.add('is-late');
          ul.el.classList.add('revealed');
        }
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
      var e = p >= 1 ? 1 : WS.springStep(ms / 1000, SPOT_SPRING_OMEGA_SYNCED, SPOT_SPRING_ZETA);
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

    function destroy() {
      destroyed = true;
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
    }

    return { targets: spotTargets, set: setSpot, destroy: destroy };
  }

  window.SpotlightSynced = { create: create };
})();
