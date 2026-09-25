

(function () {
  'use strict';

  var doc = document;
  var xp = doc.querySelector('.xp-section');
  var vertex = doc.querySelector('.chapter-seam--vertex');
  var endMarker = doc.getElementById('get-in-touch');
  var container = xp && xp.querySelector('.container');
  if (!xp || !vertex || !endMarker || !container || !window.PathDraw) return;

  var NS = 'http://www.w3.org/2000/svg';
  var FLOOR = window.matchMedia('(min-width: 1360px)');
  var STROKE = 2;
  var FADE_PX = 160;

  var rootStyle = getComputedStyle(doc.documentElement);
  var AMBER = rootStyle.getPropertyValue('--color-accent').trim() || '#FFD54F';
  var TEAL = rootStyle.getPropertyValue('--color-teal').trim() || '#4DB6AC';

  var svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'about-spine');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-draw-runway', '');
  svg.setAttribute('data-draw-complete-at-bottom', '');

  var defs = doc.createElementNS(NS, 'defs');
  svg.appendChild(defs);

  function gradient(id, stops) {
    var g = doc.createElementNS(NS, 'linearGradient');
    g.setAttribute('id', id);
    g.setAttribute('gradientUnits', 'userSpaceOnUse');
    stops.forEach(function (s) {
      var stop = doc.createElementNS(NS, 'stop');
      stop.setAttribute('offset', String(s.at));
      stop.setAttribute('stop-color', s.color);
      if (s.alpha !== undefined) stop.setAttribute('stop-opacity', String(s.alpha));
      g.appendChild(stop);
    });
    defs.appendChild(g);
    return g;
  }

  var gradFall = gradient('about-spine-fall', [
    { at: 0, color: AMBER, alpha: 0 },
    { at: 0.05, color: AMBER, alpha: 1 },
    { at: 1, color: AMBER, alpha: 1 }
  ]);
  var gradCross = gradient('about-spine-cross', [
    { at: 0, color: AMBER },
    { at: 1, color: TEAL }
  ]);
  var gradClimb = gradient('about-spine-climb', [
    { at: 0, color: TEAL, alpha: 1 },
    { at: 0.95, color: TEAL, alpha: 1 },
    { at: 1, color: TEAL, alpha: 0 }
  ]);

  function spinePath(gradId) {
    var p = doc.createElementNS(NS, 'path');
    p.setAttribute('data-draw', '');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'url(#' + gradId + ')');
    p.setAttribute('stroke-width', String(STROKE));
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
    return p;
  }

  var fall = spinePath('about-spine-fall');
  var cross = spinePath('about-spine-cross');
  var climb = spinePath('about-spine-climb');

  doc.body.appendChild(svg);

  var lastPageHeight = 0;

  function layout() {
    lastPageHeight = doc.documentElement.scrollHeight;
    doc.body.classList.toggle('has-spine', FLOOR.matches);

    var sy = window.scrollY;
    var contRect = container.getBoundingClientRect();
    var firstChapter = xp.querySelector('.xp-chapter') || xp;

    var xL = Math.round(contRect.left) + 0.5;
    var xR = Math.round(contRect.right) - 0.5;
    var y0 = firstChapter.getBoundingClientRect().top + sy;
    var vRect = vertex.getBoundingClientRect();
    var yV = vRect.top + sy;
    var yVEnd = vRect.bottom + sy;
    var yEnd = endMarker.getBoundingClientRect().top + sy;
    if (!(y0 < yV && yV < yVEnd && yVEnd < yEnd)) return;

    svg.style.top = y0 + 'px';
    svg.setAttribute('width', String(doc.documentElement.clientWidth));
    svg.setAttribute('height', String(Math.ceil(yEnd - y0)));

    var lyV = yV - y0;
    var lyEnd = yEnd - y0;
    fall.setAttribute('d', 'M' + xL + ' 0 V' + lyV);
    cross.setAttribute('d', 'M' + xL + ' ' + lyV + ' H' + xR);
    climb.setAttribute('d', 'M' + xR + ' ' + lyV + ' V' + lyEnd);

    var span = Math.max(1, yEnd - y0);
    var pV = (yV - y0) / span;
    var pVEnd = (yVEnd - y0) / span;
    fall.setAttribute('data-draw-window', '0 ' + pV.toFixed(4));
    cross.setAttribute('data-draw-window', pV.toFixed(4) + ' ' + pVEnd.toFixed(4));
    climb.setAttribute('data-draw-window', pVEnd.toFixed(4) + ' 1');

    gradFall.setAttribute('x1', String(xL)); gradFall.setAttribute('x2', String(xL));
    gradFall.setAttribute('y1', '0'); gradFall.setAttribute('y2', String(lyV));
    var fallFade = Math.min(0.3, FADE_PX / Math.max(1, lyV));
    gradFall.children[1].setAttribute('offset', String(fallFade));
    gradCross.setAttribute('x1', String(xL)); gradCross.setAttribute('x2', String(xR));
    gradCross.setAttribute('y1', String(lyV)); gradCross.setAttribute('y2', String(lyV));
    gradClimb.setAttribute('x1', String(xR)); gradClimb.setAttribute('x2', String(xR));
    gradClimb.setAttribute('y1', String(lyV)); gradClimb.setAttribute('y2', String(lyEnd));
    var climbFade = 1 - Math.min(0.3, FADE_PX / Math.max(1, lyEnd - lyV));
    gradClimb.children[1].setAttribute('offset', String(climbFade));

    window.PathDraw.refresh();
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (doc.documentElement.scrollHeight !== lastPageHeight) layout();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', layout);
  window.addEventListener('load', layout);
  doc.addEventListener('about:layout-change', layout);
  if (FLOOR.addEventListener) FLOOR.addEventListener('change', layout);

  layout();
}());
