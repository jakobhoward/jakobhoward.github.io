

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before motion/connector-lines.js');
  }
  var WS = window.WalkthroughShared;

  function create(ctx) {
    var layoutEl = ctx.layoutEl, phoneFrame = ctx.phoneFrame;
    var phoneScreen = ctx.phoneScreen;
    var linesSvg = ctx.linesSvg, spotSvg = ctx.spotSvg;
    var SPOT_VB_W = ctx.spotVbW;
    var targetViewportRect = ctx.targetViewportRect;
    var updateSpotlight = ctx.updateSpotlight;

    var callouts, activeFocus, revealedCount, swapReleased, exitReleased;
    var destroyed, screenRadius, bloomClipRect;
    function readLive() {
      callouts = ctx.callouts();
      activeFocus = ctx.activeFocus();
      revealedCount = ctx.revealedCount();
      swapReleased = ctx.swapReleased();
      exitReleased = ctx.exitReleased();
      destroyed = ctx.destroyed();
      screenRadius = ctx.screenRadius();
      bloomClipRect = ctx.bloomClipRect();
    }

    var BEZEL_REACH_PX = 7;

    function computeTargetPoint(target, baseRect, layoutRect, phoneTop, phoneBottom, phoneScreenRect) {

      var phoneLeft = phoneScreenRect
        ? phoneScreenRect.left - layoutRect.left - (BEZEL_REACH_PX - 1.5)
        : -Infinity;
      var phoneRight = phoneScreenRect
        ? phoneScreenRect.left - layoutRect.left + phoneScreenRect.width + (BEZEL_REACH_PX - 1.5)
        : Infinity;
      if (target.kind === 'dom') {

        return {
          x: Math.max(phoneLeft, Math.min(baseRect.right - layoutRect.left + WS.RAIL_PAD_PX, phoneRight)),
          y: Math.max(phoneTop, Math.min(baseRect.top - layoutRect.top + baseRect.height / 2, phoneBottom))
        };
      }

      var padCss = (phoneScreenRect && phoneScreenRect.width > 0)
        ? WS.RAIL_PAD_PX * phoneScreenRect.width / SPOT_VB_W
        : WS.RAIL_PAD_PX;

      var airCss = target.type ? WS.CONTENT_KEEP_PX : 0;
      return {
        x: Math.max(phoneLeft, Math.min(baseRect.left - layoutRect.left + baseRect.width * (target.fx + target.fw) + padCss + airCss, phoneRight)),
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
      var pad = entry.outlineEl
        ? WS.RAIL_PAD_PX
        : ((phoneScreenRect && phoneScreenRect.width > 0) ? WS.RAIL_PAD_PX * phoneScreenRect.width / SPOT_VB_W : WS.RAIL_PAD_PX);
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
      var scrL = phoneScreenRect.left - layoutRect.left;
      var scrR = scrL + phoneScreenRect.width;
      var cutL = scrL - BEZEL_REACH_PX + hs;
      var cutT = phoneScreenRect.top  - layoutRect.top  + hs;
      var cutR = scrR + BEZEL_REACH_PX - hs;
      var cutB = cutT + phoneScreenRect.height - 2 * hs;

      var v = WS.outlineSpan(b.y, b.y + b.h, cutT, cutB,
        WS.BOX_EDGE_SNAP_PX, WS.BOX_EDGE_RUNOFF_PX);

      var u = WS.outlineSpan(b.x, b.x + b.w, cutL, cutR,
        WS.BOX_EDGE_SNAP_PX, WS.BOX_EDGE_RUNOFF_PX);
      if (!(u.y1 > u.y0) || !(v.y1 > v.y0)) return null;
      var openL = u.y0 < cutL, openR = u.y1 > cutR;
      var x0 = openL ? scrL : u.y0, x1 = openR ? scrR : u.y1;
      return { x: x0, y: v.y0, w: x1 - x0, h: v.y1 - v.y0, openL: openL, openR: openR };
    }

    function keepOpenSides(t, b) {
      if (!t || t === b) return t;
      t.openL = !!b.openL && t.x === b.x;
      t.openR = !!b.openR && Math.abs(t.x + t.w - (b.x + b.w)) < 0.01;
      return t;
    }

    function buildBloomPath(b, r, direction) {
      if (!b) return '';
      var rc = Math.min(r, b.w / 2, b.h / 2);
      var down = direction === 'down';
      var x0 = b.x, x1 = b.x + b.w, ym = b.y + b.h / 2;
      var yr = down ? b.y + b.h : b.y;
      var yc = down ? yr - rc : yr + rc;
      var arc = ' A' + rc + ',' + rc + (down ? ' 0 0 1 ' : ' 0 0 0 ');
      var d = b.openR ? 'M' + x1 + ',' + yr
        : 'M' + x1 + ',' + ym + ' L' + x1 + ',' + yc + arc + (x1 - rc) + ',' + yr;
      return d + (b.openL ? ' L' + x0 + ',' + yr
        : ' L' + (x0 + rc) + ',' + yr + arc + x0 + ',' + yc + ' L' + x0 + ',' + ym);
    }

    function updateLines(phoneScreenRect) {
      readLive();
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

        var boxes = [], leaders = [];
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
            var lo = ay, hi = ay;
            for (var t = 0; t < c.targets.length; t++) {
              if (c.targets[t].underline) { pts.push(null); continue; }
              var baseRect = targetViewportRect(i, j, t, c.targets[t], phoneScreenRect);
              var pt = computeTargetPoint(c.targets[t], baseRect, layoutRect, phoneTop, phoneBottom, phoneScreenRect);
              pts.push(pt);
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < lo) lo = pt.y;
              if (pt.y > hi) hi = pt.y;
            }

            leaders[j] = { ax: ax, ay: ay, pts: pts, maxX: maxX, lo: lo, hi: hi,
              jx: Math.min(Math.max(maxX + 12, ax - 24), ax - 12) };
          }

          if (c.underlineEls) {
            for (var uu = 0; uu < c.underlineEls.length; uu++) {
              if (!c.underlineEls[uu]) continue;
              var utg = c.targets[uu];
              var ubase = targetViewportRect(i, j, uu, utg, phoneScreenRect);
              var ux1 = ubase.left - layoutRect.left + ubase.width * utg.fx;
              var ux2 = ux1 + ubase.width * utg.fw;
              var uy = ubase.top - layoutRect.top + ubase.height * (utg.fy + utg.fh) +
                WS.UNDERLINE_DROP_PX;
              put(c.underlineEls[uu], 'd', 'M' + ux1 + ',' + uy + ' L' + ux2 + ',' + uy);
            }
          }

          if (c.bloomUpEl && c.bloomDownEl) {
            boxes[j] = clampBloomBox(
              computeEntryBoxBoundsCss(i, j, c, layoutRect, phoneScreenRect),
              layoutRect, phoneScreenRect);
          }
        }
        toDraw.push(i, entries, boxes, leaders);
      }
      for (var w = 0; w < writes.length; w += 3) writes[w].setAttribute(writes[w + 1], writes[w + 2]);
      for (var dw = 0; dw < toDraw.length; dw += 4) {
        var shown = drawBlooms(toDraw[dw], toDraw[dw + 1], toDraw[dw + 2]);
        drawLeaders(toDraw[dw], toDraw[dw + 1], toDraw[dw + 2], toDraw[dw + 3], shown);
      }
    }

    function drawBlooms(focusIdx, entries, boxes) {
      var live = (swapReleased || exitReleased) ? -1 : ctx.boxOwner(focusIdx, revealedCount - 1);
      var placed = live >= 0 && boxes[live] ? [boxes[live]] : [];
      var drawn = [];
      for (var j = entries.length - 1; j >= 0; j--) {
        var c = entries[j];
        if (!c.bloomUpEl || !c.bloomDownEl) continue;
        if (ctx.boxOwner(focusIdx, j) !== j) continue;
        var b = boxes[j];
        var occluded = false;
        if (b && j !== live && j < revealedCount) {
          for (var p = 0; p < placed.length && b; p++) b = keepOpenSides(WS.ghostOutline(b, placed[p]), b);
          if (b) placed.push(b);
          else occluded = true;
        }
        if (b) {
          c.bloomUpEl.setAttribute('d',   buildBloomPath(b, 8, 'up'));
          c.bloomDownEl.setAttribute('d', buildBloomPath(b, 8, 'down'));
        } else if (!occluded && c.bloomUpEl.getAttribute('d')) {
          c.bloomUpEl.setAttribute('d', '');
          c.bloomDownEl.setAttribute('d', '');
        }
        c.bloomUpEl.classList.toggle('is-occluded', occluded);
        c.bloomDownEl.classList.toggle('is-occluded', occluded);
        drawn[j] = !!b;
      }
      return { live: live, drawn: drawn };
    }

    function drawLeaders(focusIdx, entries, boxes, leaders, shown) {
      var cur = (swapReleased || exitReleased) ? -1 : revealedCount - 1;
      var liveBox = shown.live >= 0 ? boxes[shown.live] : null;
      var liveLead = cur >= 0 && leaders[cur] && leaders[cur].maxX > -Infinity &&
        shown.drawn[ctx.boxOwner(focusIdx, cur)] ? leaders[cur] : null;
      for (var j = 0; j < entries.length; j++) {
        var c = entries[j], L = leaders[j];
        if (!L) continue;
        var owner = ctx.boxOwner(focusIdx, j);
        var visible = L.maxX > -Infinity && !!shown.drawn[owner];
        var jx = L.jx;
        if (visible && liveLead && j !== cur && j < revealedCount && owner !== shown.live) {
          if (entersBox(L, jx, liveBox)) visible = false;
          else if (Math.abs(jx - liveLead.jx) < 1 && L.lo < liveLead.hi && liveLead.lo < L.hi) {
            jx = (jx + L.ax) / 2;
            visible = !(liveLead.ay > L.lo && liveLead.ay < L.hi) && !branchesWithin(L, liveLead);
          }
        }
        var d = '';
        if (L.maxX > -Infinity) {
          d = 'M' + L.ax + ',' + L.ay + ' L' + jx + ',' + L.ay;
          for (var b = 0; b < L.pts.length; b++) {
            if (!L.pts[b]) continue;
            d += ' M' + jx + ',' + L.ay + ' L' + jx + ',' + L.pts[b].y + ' L' + L.pts[b].x + ',' + L.pts[b].y;
          }
        }
        c.lineEl.setAttribute('d', d);
        c.lineEl.classList.toggle('is-occluded', !visible);
        c.dotAEl.setAttribute('cx', L.ax);
        c.dotAEl.setAttribute('cy', L.ay);
        c.dotAEl.classList.toggle('is-occluded', !visible);
        for (var dp = 0; dp < L.pts.length; dp++) {
          if (!L.pts[dp] || !c.dotPEls[dp]) continue;
          c.dotPEls[dp].setAttribute('cx', L.pts[dp].x);
          c.dotPEls[dp].setAttribute('cy', L.pts[dp].y);
          c.dotPEls[dp].classList.toggle('is-occluded', !visible);
        }
      }
    }

    function entersBox(L, jx, bx) {
      if (!bx) return false;
      var m = 3;
      for (var b = 0; b < L.pts.length; b++) {
        var p = L.pts[b];
        if (p && p.y > bx.y - m && p.y < bx.y + bx.h + m &&
            p.x < bx.x + bx.w - m && jx > bx.x) return true;
      }
      return false;
    }

    function branchesWithin(L, K) {
      for (var b = 0; b < L.pts.length; b++) {
        if (L.pts[b] && L.pts[b].y > K.lo && L.pts[b].y < K.hi) return true;
      }
      return false;
    }

    var lineSettleRaf = null;
    var lineSettleUntil = 0;
    function startLineSettle(ms) {
      lineSettleUntil = Math.max(lineSettleUntil, performance.now() + ms);
      if (lineSettleRaf) return;
      function settleTick(now) {
        readLive();
        lineSettleRaf = null;
        if (destroyed) return;
        var rect = phoneScreen ? phoneScreen.getBoundingClientRect() : null;
        if (linesSvg && phoneFrame && rect && activeFocus >= 0) updateLines(rect);
        if (spotSvg && rect) updateSpotlight(rect);
        if (now < lineSettleUntil) lineSettleRaf = requestAnimationFrame(settleTick);
      }
      lineSettleRaf = requestAnimationFrame(settleTick);
    }

    return { update: updateLines, settle: startLineSettle };
  }

  window.ConnectorLines = { create: create };
})();
