

(function () {
  'use strict';

  var doc = document;
  var els = doc.querySelectorAll('[data-rail-years]');
  if (els.length < 2) return;

  var endMarker = doc.getElementById('get-in-touch');

  var READ_LINE = 0.45;

  var rail = doc.createElement('nav');
  rail.className = 'year-rail';
  rail.setAttribute('aria-label', 'Career timeline');
  rail.innerHTML =
    '<div class="year-rail-head" aria-hidden="true">' +
    '<span class="year-rail-year"></span>' +
    '<span class="year-rail-dir"></span>' +
    '<span class="year-rail-label"></span>' +
    '</div>' +
    '<ol class="year-rail-stops"></ol>';
  var yearEl = rail.querySelector('.year-rail-year');
  var dirEl = rail.querySelector('.year-rail-dir');
  var labelEl = rail.querySelector('.year-rail-label');
  var stopsEl = rail.querySelector('.year-rail-stops');
  doc.body.appendChild(rail);

  function parseYears(raw) {
    var m = String(raw).match(/(\d{4})\s*[–—-]\s*(\d{4})/);
    if (!m) return null;
    return { a: Number(m[1]), b: Number(m[2]) };
  }

  var waypoints = [];
  var segments = [];
  var activeFrom = Infinity;
  var activeTo = Infinity;
  var lastPageHeight = 0;

  function visible(el) {
    return el.offsetParent !== null;
  }

  var dotsById = {};

  function buildStops() {
    dotsById = {};
    stopsEl.innerHTML = '';
    waypoints.forEach(function (wp) {
      var li = doc.createElement('li');
      var a = doc.createElement('a');
      a.className = 'year-rail-dot';
      a.href = '#' + wp.id;
      a.title = wp.label + ' · ' + wp.display;
      a.setAttribute('aria-label', a.title);
      a.style.setProperty('--rail-accent', wp.accent);
      dotsById[wp.id] = a;
      li.appendChild(a);
      stopsEl.appendChild(li);
    });
  }

  function measure() {
    lastPageHeight = doc.documentElement.scrollHeight;
    var scrollY = window.scrollY;
    var prevIds = waypoints.map(function (w) { return w.id; }).join();

    waypoints = [];
    Array.prototype.forEach.call(els, function (el) {
      if (!visible(el)) return;
      var years = parseYears(el.getAttribute('data-rail-years'));
      if (!years || !el.id) return;

      if (el.getAttribute('data-rail-dir') === 'desc') {
        years = { a: years.b, b: years.a };
      }
      var rect = el.getBoundingClientRect();
      waypoints.push({
        id: el.id,
        label: el.getAttribute('data-rail-label') || '',
        accent: el.getAttribute('data-rail-accent') || 'var(--color-teal)',
        years: years,
        display: Math.min(years.a, years.b) + '–' + Math.max(years.a, years.b),
        top: rect.top + scrollY,
        bottom: rect.bottom + scrollY
      });
    });
    waypoints.sort(function (a, b) { return a.top - b.top; });

    segments = [];
    waypoints.forEach(function (wp, i) {
      segments.push({ from: wp.top, to: wp.bottom, y0: wp.years.a, y1: wp.years.b, wp: wp });
      var next = waypoints[i + 1];
      if (next) {
        segments.push({ from: wp.bottom, to: next.top, y0: wp.years.b, y1: next.years.a, wp: next });
      }
    });

    activeFrom = waypoints.length ? waypoints[0].top : Infinity;
    activeTo = endMarker
      ? endMarker.getBoundingClientRect().top + scrollY
      : (waypoints.length ? waypoints[waypoints.length - 1].bottom : Infinity);

    if (waypoints.map(function (w) { return w.id; }).join() !== prevIds) buildStops();
    waypoints.forEach(function (wp) { wp.dot = dotsById[wp.id]; });
    lastWp = null;
  }

  var lastYear = null;
  var lastWp = null;
  var lastDir = 0;

  function swapText(el, text) {
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove('is-swapping');
    void el.offsetWidth;
    el.classList.add('is-swapping');
  }

  function update() {

    if (doc.documentElement.scrollHeight !== lastPageHeight) measure();
    if (!segments.length) return;

    var line = window.scrollY + window.innerHeight * READ_LINE;

    var nearEnd = window.scrollY + window.innerHeight >=
      doc.documentElement.scrollHeight - 120;
    var active = line >= activeFrom && line < activeTo && !nearEnd;
    rail.classList.toggle('is-active', active);
    if (!active) return;

    var seg = segments[0];
    for (var i = 0; i < segments.length; i++) {
      if (line >= segments[i].from && (line < segments[i].to || i === segments.length - 1)) {
        seg = segments[i];
        if (line < seg.to) break;
      }
    }

    var span = Math.max(1, seg.to - seg.from);
    var p = Math.min(1, Math.max(0, (line - seg.from) / span));
    var year = Math.round(seg.y0 + (seg.y1 - seg.y0) * p);
    var dir = seg.y1 > seg.y0 ? 1 : (seg.y1 < seg.y0 ? -1 : lastDir);

    if (year !== lastYear) {
      yearEl.textContent = String(year);
      lastYear = year;
    }
    if (dir !== lastDir) {
      swapText(dirEl, dir >= 0 ? '▲' : '▼');
      lastDir = dir;
    }
    if (seg.wp !== lastWp) {
      swapText(labelEl, seg.wp.label);
      rail.style.setProperty('--rail-accent', seg.wp.accent);
      waypoints.forEach(function (wp) {
        wp.dot.classList.toggle('is-current', wp === seg.wp);
      });
      lastWp = seg.wp;
    }
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      update();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); update(); });
  window.addEventListener('load', function () { measure(); update(); });
  doc.addEventListener('about:layout-change', function () { measure(); update(); });

  measure();
  update();
}());
