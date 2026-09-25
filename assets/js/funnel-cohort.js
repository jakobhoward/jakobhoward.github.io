

(function() {
  'use strict';

  var WS = window.WalkthroughShared;
  var debugLog = (WS && WS.debugLog) || function() {};

  function initPrelaunchFunnel() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var scopes = document.querySelectorAll('.prelaunch-section .anim-scope');
    if (!scopes.length) return;
    scopes.forEach(function(s) { s.classList.add('anim-armed'); });
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.35 });
    scopes.forEach(function(s) { io.observe(s); });
  }

  function initFunnelCohort() {
    if (!document.documentElement.classList.contains('js-motion')) return;
    if (!('IntersectionObserver' in window)) return;
    var funnel = document.querySelector('.prelaunch-funnel');
    if (!funnel) return;
    var stage = funnel.closest('.pf-stage');
    var grid = funnel.querySelector('.pf-grid');
    var node = funnel.querySelector('.pf-funnel');
    var outs = Array.prototype.slice.call(funnel.querySelectorAll('.pf-out'));

    var bar = stage ? stage.querySelector('.pf-bar') : null;
    if (!stage || !grid || !node || !outs.length || !bar) return;
    var countIn = stage.querySelector('[data-pf-count="in"]');
    var countOut = stage.querySelector('[data-pf-count="out"]');

    var statOut = stage.querySelector('[data-pf-stat]');

    [countIn, countOut, statOut].forEach(function(el) {
      if (el) el.style.minWidth = el.textContent.trim().length + 'ch';
    });

    if (statOut) statOut.textContent = '0%';

    var canvas = document.createElement('canvas');
    canvas.className = 'pf-cohort-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    funnel.appendChild(canvas);
    funnel.classList.add('pf-cohort');

    var SETTLE = 0.75;

    var ctx = null, dots = [], TOTAL = 1, frameW = 0, frameH = 0, stickyTop = 0;

    var wall = null;

    function jitter(i) { return ((i * 2654435761) % 1000) / 1000; }

    function measure() {
      var frame = funnel.getBoundingClientRect();
      if (!frame.width || !frame.height) return false;
      frameW = frame.width; frameH = frame.height;

      stickyTop = parseFloat(getComputedStyle(bar).top) || 0;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(frameW * dpr);
      canvas.height = Math.round(frameH * dpr);
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var nodeRect = node.getBoundingClientRect();
      var sx = nodeRect.width / 340, sy = nodeRect.height / 430;
      var mouthY = nodeRect.top - frame.top;
      var centerX = nodeRect.left - frame.left + 170 * sx;
      var stemHalf = 38 * sx;
      var taperY = mouthY + 180 * sy;
      var stemTopY = mouthY + 330 * sy;
      var exitY = mouthY + 430 * sy;

      dots = Array.prototype.map.call(grid.querySelectorAll('circle'), function(c, i) {
        var r = c.getBoundingClientRect();
        return {
          el: c,
          hidden: false,
          x0: r.left + r.width / 2 - frame.left,
          y0: r.top + r.height / 2 - frame.top,
          gold: c.classList.contains('pf-in--primed'),
          j: jitter(i)
        };
      });
      if (!dots.length) return false;

      function wallAt(u, side) {
        var w = 1 - u;
        var xr = (w * w * w + 3 * w * w * u) * 340 + (3 * w * u * u + u * u * u) * 208;
        var yv = w * w * w * 180 + 3 * w * w * u * 255 + 3 * w * u * u * 265 + u * u * u * 330;

        var dxr = 6 * w * u * -132;
        var dyr = 3 * w * w * 75 + 6 * w * u * 10 + 3 * u * u * 65;
        var xv = side > 0 ? xr : 340 - xr;
        var px = nodeRect.left - frame.left + xv * sx, py = mouthY + yv * sy;
        var nx = (side > 0 ? -1 : 1) * dyr * sy, ny = dxr * sx;
        var nl = Math.sqrt(nx * nx + ny * ny) || 1;
        var CLEAR = 10;
        return { x: px + (nx / nl) * CLEAR, y: py + (ny / nl) * CLEAR };
      }

      var WALL_N = 24;
      var wallYs = [], wallXs = [];
      for (var wi = 0; wi <= WALL_N; wi++) {
        var wp = wallAt(wi / WALL_N, 1);
        wallYs.push(wp.y);
        wallXs.push(wp.x - centerX);
      }
      wall = { top: mouthY, bottom: exitY, cx: centerX, ys: wallYs, xs: wallXs };

      var order = dots.map(function(d, i) { return i; })
        .sort(function(a, b) { return dots[a].j - dots[b].j; });
      var goldRank = 0;
      TOTAL = 1;
      order.forEach(function(idx, rank) {
        var d = dots[idx];
        d.delay = rank * 26;
        d.dur = 2300 + d.j * 500;
        d.p = [
          { x: d.x0, y: d.y0 },
          { x: centerX + (d.x0 - centerX) * 0.5, y: mouthY + 8 }
        ];

        var side = d.x0 >= centerX ? 1 : -1;
        if (d.gold) {
          var slot = outs[goldRank % outs.length];
          d.goldRank = goldRank;

          var carom = goldRank % 9 === 4;
          goldRank++;
          if (carom) {
            d.dur += 450;
            d.p.push(wallAt(0.3 + d.j * 0.15, side));
            d.p.push(wallAt(0.62 + d.j * 0.12, -side));
          } else {
            d.p.push({ x: centerX + (d.j - 0.5) * 2 * (stemHalf - 6), y: taperY });
          }
          var sr = slot.getBoundingClientRect();
          d.p.push({ x: centerX + (d.j - 0.5) * 1.2 * (stemHalf - 8), y: stemTopY });
          d.p.push({ x: centerX, y: exitY });
          d.p.push({ x: sr.left + sr.width / 2 - frame.left, y: sr.top + sr.height / 2 - frame.top });
        } else if (d.j >= 0.55 && d.j < 0.63) {

          d.p.push(wallAt(0.25 + (d.j - 0.55) * 2.5, side));
          d.p.push({ x: centerX - side * stemHalf * 0.6, y: mouthY + 300 * sy });
          d.absorbT = 0.85 + d.j * 0.1;
        } else {
          d.p.push({ x: centerX + (d.j - 0.5) * 2 * (stemHalf - 6), y: taperY });

          d.absorbT = 0.55 + d.j * 0.3;
        }
        if (d.delay + d.dur > TOTAL) TOTAL = d.delay + d.dur;
      });
      debugLog('funnel-cohort', 'measured:', dots.length, 'dots,', goldRank, 'gold, timeline', Math.round(TOTAL));
      return true;
    }

    function sample(pts, t) {
      var ft = Math.min(0.9999, Math.max(0, t)) * (pts.length - 1);
      var i = Math.floor(ft), lt = ft - i;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * lt,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * lt
      };
    }
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function drawAt(t) {
      if (!ctx) return;
      ctx.clearRect(0, 0, frameW, frameH);
      var launched = 0, landedGold = 0;
      dots.forEach(function(d) {
        var lt = (t - d.delay) / d.dur;
        var away = lt > 0;
        if (away) launched++;

        if (d.hidden !== away) {
          d.el.style.opacity = away ? '0' : '';
          d.hidden = away;
        }
        if (lt <= 0) return;
        if (lt >= 1) {
          if (d.gold) landedGold++;
          return;
        }
        var alpha = 1;
        if (!d.gold) {
          if (lt >= d.absorbT) return;
          alpha = Math.max(0, 1 - Math.pow(lt / d.absorbT, 3) * 0.92);
        }
        var pos = sample(d.p, ease(lt));

        if (wall && pos.y > wall.top && pos.y < wall.bottom) {
          var wys = wall.ys, wn = wys.length - 1, lim;
          if (pos.y <= wys[0]) lim = wall.xs[0];
          else if (pos.y >= wys[wn]) lim = wall.xs[wn];
          else {
            var lo = 0, hi = wn;
            while (hi - lo > 1) {
              var mid = (lo + hi) >> 1;
              if (wys[mid] <= pos.y) lo = mid; else hi = mid;
            }
            var f = (pos.y - wys[lo]) / ((wys[hi] - wys[lo]) || 1);
            lim = wall.xs[lo] + (wall.xs[hi] - wall.xs[lo]) * f;
          }
          var wdx = pos.x - wall.cx;
          if (wdx > lim) pos.x = wall.cx + lim;
          else if (wdx < -lim) pos.x = wall.cx - lim;
        }
        ctx.globalAlpha = alpha;
        if (d.gold) {
          ctx.fillStyle = '#FFD54F';
          ctx.shadowColor = 'rgba(255, 213, 79, 0.6)';
          ctx.shadowBlur = 5;
        } else {
          ctx.fillStyle = 'rgba(121, 134, 203, 0.85)';
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, d.gold ? 5 : 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      outs.forEach(function(o, i) { o.classList.toggle('is-lit', i < landedGold); });
      if (countIn) countIn.textContent = String(launched);
      if (countOut) countOut.textContent = String(landedGold);
      if (statOut) statOut.textContent = Math.round(landedGold * 100 / Math.max(1, dots.length)) + '%';
    }

    function currentT() {
      var sr = stage.getBoundingClientRect();
      var travel = sr.height - bar.offsetHeight;
      if (travel <= 0) return 0;
      var p = Math.min(1, Math.max(0, (stickyTop - sr.top) / travel));
      return Math.min(1, p / SETTLE) * TOTAL;
    }

    var raf = null, watching = false, lastT = -1, measured = false;
    function tick() {
      raf = null;

      if (measured) {
        var lf = funnel.getBoundingClientRect();
        if (Math.abs(lf.width - frameW) > 0.5 || Math.abs(lf.height - frameH) > 0.5) {
          measured = false;
          lastT = -1;
          debugLog('funnel-cohort', 'frame drifted — remeasuring',
            Math.round(lf.width) + 'x' + Math.round(lf.height), 'was', Math.round(frameW) + 'x' + Math.round(frameH));
        }
      }
      if (!measured) measured = measure();
      if (measured) {
        var t = currentT();
        if (t !== lastT) {
          lastT = t;
          drawAt(t);
        }
      }
      if (watching) raf = requestAnimationFrame(tick);
    }

    var io = new IntersectionObserver(function(entries) {
      var on = entries[entries.length - 1].isIntersecting;
      if (on && !watching) {
        watching = true;
        if (raf === null) raf = requestAnimationFrame(tick);
        debugLog('funnel-cohort', 'scrub live');
      } else if (!on && watching) {
        watching = false;
      }
    }, { rootMargin: '25% 0px 25% 0px', threshold: 0 });
    io.observe(stage);

    window.addEventListener('resize', function() {
      measured = false;
      lastT = -1;
      if (watching && raf === null) raf = requestAnimationFrame(tick);
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initPrelaunchFunnel();
    initFunnelCohort();
  });
})();
