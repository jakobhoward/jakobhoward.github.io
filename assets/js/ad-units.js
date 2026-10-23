

(function () {
  'use strict';

  var section = document.querySelector('.paid-social');
  if (!section) return;

  var units = Array.prototype.slice.call(section.querySelectorAll('.adu'));
  var videoUnits = units.filter(function (u) { return u.querySelector('video.adu-video'); });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverPointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasIO = 'IntersectionObserver' in window;

  var active = null;
  var ratio = new Map();

  function videoOf(unit) { return unit.querySelector('video.adu-video'); }

  function setActive(unit) {
    if (unit === active) return;
    active = unit;
    videoUnits.forEach(function (u) {
      var v = videoOf(u);
      if (u === unit) {
        u.classList.remove('adu--paused');
        var p = v.play();

        if (p && p.catch) p.catch(function () { v.controls = true; });
      } else {
        u.classList.add('adu--paused');
        if (!v.paused) v.pause();
      }
    });
  }

  function mostVisible() {
    var best = null, bestRatio = 0;
    videoUnits.forEach(function (u) {
      var r = ratio.get(u) || 0;
      if (r > bestRatio) { best = u; bestRatio = r; }
    });
    return best;
  }

  if (reduce || !hasIO) {
    videoUnits.forEach(function (u) { videoOf(u).controls = true; });
  } else {
    videoUnits.forEach(function (u) { u.classList.add('adu--paused'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { ratio.set(e.target, e.isIntersecting ? e.intersectionRatio : 0); });
      if (hoverPointer) {

        if (!active || !(ratio.get(active) > 0)) {
          var first = videoUnits.filter(function (u) { return ratio.get(u) > 0; })[0];
          if (first) setActive(first);
        }

        if (active && !(ratio.get(active) > 0)) videoOf(active).pause();
        else if (active && videoOf(active).paused) videoOf(active).play().catch(function () {});
      } else {
        var next = mostVisible();
        if (next) setActive(next);
        else if (active) videoOf(active).pause();
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    videoUnits.forEach(function (u) { io.observe(u); });

    if (hoverPointer) {

      var lastX = null, lastY = null, scrolledAt = 0;
      window.addEventListener('scroll', function () { scrolledAt = Date.now(); }, { passive: true });
      section.addEventListener('pointermove', function (e) {
        var moved = e.clientX !== lastX || e.clientY !== lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (!moved || Date.now() - scrolledAt < 150) return;
        var unit = e.target.closest ? e.target.closest('.adu') : null;
        if (unit && videoOf(unit)) setActive(unit);
      });
    }
    section.addEventListener('click', function (e) {
      var play = e.target.closest ? e.target.closest('.adu-play') : null;
      if (play) setActive(play.closest('.adu'));
    });
  }

  var viewportFns = [];
  function onViewportChange(fn) { viewportFns.push(fn); }
  document.addEventListener('DOMContentLoaded', function () {
    viewportFns.forEach(function (fn) { window.WalkthroughShared.viewport.onChange(fn); });
  });

  function actMode(act) {
    var WS = window.WalkthroughShared;
    return WS ? WS.actMode(act) : 'pinned';
  }

  function chromeOffset() {
    var WS = window.WalkthroughShared;
    return WS ? WS.chromeOffset() : 0;
  }

  function landStop(act, focus) {

    if (typeof act.walkthroughGoToStop === 'function') {
      act.walkthroughGoToStop(focus);
      return true;
    }
    return false;
  }

  var origin = null;
  var pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'adu-return';
  pill.hidden = true;
  pill.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>Back to the ad';
  document.body.appendChild(pill);

  var landedAct = null;
  function hidePill() {
    pill.hidden = true;
    origin = null;
  }
  function showPill() {

    var device = landedAct && actMode(landedAct) === 'pinned' ? landedAct.querySelector('.wt-phone') : null;
    var r = device ? device.getBoundingClientRect() : null;
    pill.style.left = r ? Math.round(r.left + r.width / 2) + 'px' : '';
    pill.hidden = false;
  }

  pill.addEventListener('click', function () {
    if (!origin) return hidePill();
    var top = origin.getBoundingClientRect().top + window.pageYOffset - chromeOffset() - 16;
    window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    if (hoverPointer && videoOf(origin)) setActive(origin);
    hidePill();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pill.hidden) hidePill(); });
  if (hasIO) {

    new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; }) && !pill.hidden) hidePill();
    }, { threshold: 0.2 }).observe(section);
  }

  section.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('.adu-stat-link') : null;
    if (!link) return;
    var acts = document.querySelectorAll('.campaign-walkthrough-section');
    var act = acts[parseInt(link.getAttribute('data-act'), 10) || 0];
    if (!act) return;
    origin = link.closest('.adu');
    landedAct = act;
    var focus = parseInt(link.getAttribute('data-stop'), 10) || 0;
    if (!landStop(act, focus)) {

      var ann = act.querySelectorAll('.walkthrough-annotation')[focus] || act;
      window.scrollTo({ top: ann.getBoundingClientRect().top + window.pageYOffset - chromeOffset() - 16, behavior: 'smooth' });
    }

    setTimeout(function () { if (origin) showPill(); }, 700);
  });

  section.addEventListener('click', function (e) {
    var more = e.target.closest ? e.target.closest('.adu-more') : null;
    if (!more) return;
    var unit = more.closest('.adu');
    if (more.classList.contains('adu-less')) { collapse(unit, more); return; }
    unit.classList.add('adu--expanded');
    unit.querySelectorAll('.adu-more').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    var less = unit.querySelector('.adu-less-wrap');
    if (less) less.hidden = false;
    fitStages();
  });

  section.querySelectorAll('.adu').forEach(function (unit) {
    if (!unit.querySelector('.adu-more')) return;
    var lines = unit.querySelectorAll('.adu-checklist li');
    var host = lines.length ? lines[lines.length - 1] : unit.querySelector('.adu-primary');
    if (!host) return;
    var wrap = document.createElement('span');
    wrap.className = 'adu-less-wrap';
    wrap.hidden = true;
    wrap.innerHTML = ' <button type="button" class="adu-more adu-less" aria-expanded="true">See less</button>';
    host.appendChild(wrap);
  });
  function collapse(unit, less) {
    var hadFocus = document.activeElement === less;
    unit.classList.remove('adu--expanded');
    less.parentNode.hidden = true;
    unit.querySelectorAll('.adu-more').forEach(function (b) {
      if (b !== less) b.setAttribute('aria-expanded', 'false');
    });

    settleClamps();
    balanceFolds();
    fitStages();
    fitIgFeet();

    var over = unit.getBoundingClientRect().top - chromeOffset() - 16;
    if (over < 0) window.scrollTo({ top: window.pageYOffset + over, behavior: reduce ? 'auto' : 'smooth' });
    if (hadFocus) {
      var more = unit.querySelector('.adu-more-wrap .adu-more, .adu-more--block:not(.is-idle)');
      if (more) more.focus({ preventScroll: true });
    }
  }

  var folds = [];
  section.querySelectorAll('.adu').forEach(function (unit) {
    var items = Array.prototype.slice.call(unit.querySelectorAll('.adu-checklist li'));
    var wrap = unit.querySelector('.adu-more-wrap');
    if (!wrap || !items.length) return;
    var floor = items.filter(function (li) { return !li.classList.contains('adu-fold'); }).length;
    folds.push({ unit: unit, text: unit.querySelector('.adu-text'), items: items, wrap: wrap, floor: floor });
  });
  function showLines(f, k) {
    f.items.forEach(function (li, i) { li.classList.toggle('adu-fold', i >= k); });
    if (k < f.items.length) f.items[k - 1].appendChild(f.wrap);
    else if (f.wrap.parentNode) f.wrap.parentNode.removeChild(f.wrap);
  }

  function heightAt(f, k) {
    showLines(f, k);
    var card = f.unit.getBoundingClientRect();
    return (f.items[k - 1].getBoundingClientRect().bottom - card.top) +
      (card.bottom - f.text.getBoundingClientRect().bottom);
  }
  function balanceFolds() {
    var groups = {}, grids = [];
    folds.forEach(function (f) {
      if (f.unit.classList.contains('adu--expanded')) return;
      var grid = f.unit.parentNode;
      var strip = getComputedStyle(grid).display === 'flex';
      if (grids.indexOf(grid) < 0) grids.push(grid);
      var key = grids.indexOf(grid) + (strip ? '' : ':' + f.unit.offsetTop);
      (groups[key] = groups[key] || { strip: strip, cards: [] }).cards.push(f);
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      var target = g.strip
        ? Math.max.apply(null, g.cards.map(function (f) { return heightAt(f, f.floor); }))
        : Math.min.apply(null, g.cards.map(function (f) { return heightAt(f, f.items.length); }));
      g.cards.forEach(function (f) {
        var k = f.items.length;
        while (k > f.floor && heightAt(f, k) > target + 1) k--;
        showLines(f, k);
      });
    });
  }

  var clamps = [];
  section.querySelectorAll('.adu-text--clamp').forEach(function (t) {
    var p = t.querySelector('.adu-primary'), more = t.querySelector('.adu-more--block');
    var lines = parseInt(t.style.getPropertyValue('--adu-fold-lines'), 10) || 3;
    if (p && more) clamps.push({ text: t, p: p, more: more, lines: lines });
  });
  function cuts(p) { return p.scrollHeight > p.clientHeight + 1; }

  function naturalLines(p) {
    return Math.round(p.scrollHeight / (parseFloat(getComputedStyle(p).lineHeight) || 1));
  }

  function clampTargets() {
    var rows = {}, grids = [];
    clamps.forEach(function (c) {
      var grid = c.text.closest('.psoc-grid');
      if (!grid || getComputedStyle(grid).display === 'flex') { c.target = c.lines; return; }
      if (grids.indexOf(grid) < 0) grids.push(grid);
      var key = grids.indexOf(grid) + ':' + c.text.closest('.adu').offsetTop;
      (rows[key] = rows[key] || []).push(c);
    });
    Object.keys(rows).forEach(function (key) {
      var shortest = Math.min.apply(null, rows[key].map(function (c) { return naturalLines(c.p); }));
      rows[key].forEach(function (c) { c.target = Math.max(c.lines, shortest); });
    });
  }

  function endsBlank(p, k) {
    var bottom = p.getBoundingClientRect().bottom, lh = p.clientHeight / k;
    var range = document.createRange();
    range.selectNodeContents(p);
    return !Array.prototype.some.call(range.getClientRects(), function (r) {
      var mid = r.top + r.height / 2;
      return r.width >= 1 && mid > bottom - lh && mid < bottom;
    });
  }
  function settleClamps() {
    clampTargets();
    clamps.forEach(function (c) {
      var k = c.target;
      c.text.classList.remove('adu-text--at-break');
      c.text.style.setProperty('--adu-fold-lines', k);
      while (k > 1 && cuts(c.p) && endsBlank(c.p, k)) c.text.style.setProperty('--adu-fold-lines', --k);
      if (k < c.target) {
        c.text.style.setProperty('--adu-fold-height', c.p.getBoundingClientRect().height + 'px');
        c.text.classList.add('adu-text--at-break');
      }
      c.more.classList.toggle('is-idle', !cuts(c.p));
    });
  }

  settleClamps();
  balanceFolds();

  var foldWidth = window.innerWidth;
  onViewportChange(function () {
    if (window.innerWidth === foldWidth) return;
    foldWidth = window.innerWidth;
    settleClamps();
    balanceFolds();
  });

  var ARROW_REACH = 48;
  function arrows(track, prev, next) {
    if (!track || !prev || !next) return;

    function stepBy(dir) {
      var at = track.scrollLeft, max = track.scrollWidth - track.clientWidth;
      var origin = track.getBoundingClientRect().left - at;
      var pad = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
      var stops = Array.prototype.map.call(track.children, function (card) {
        var r = card.getBoundingClientRect();
        var x = getComputedStyle(card).scrollSnapAlign.indexOf('center') > -1
          ? r.left - origin + r.width / 2 - track.clientWidth / 2
          : r.left - origin - pad;
        return Math.max(0, Math.min(max, x));
      });
      var to = dir > 0
        ? stops.filter(function (x) { return x > at + 1; })[0]
        : stops.filter(function (x) { return x < at - 1; }).pop();
      if (to !== undefined) track.scrollTo({ left: to, behavior: reduce ? 'auto' : 'smooth' });
    }
    function sync() {
      var hadFocus = document.activeElement;
      var box = track.getBoundingClientRect(), cards = track.children;
      var scrolls = cards.length > 0 && getComputedStyle(track).overflowX !== 'visible';
      prev.hidden = !scrolls || box.left - cards[0].getBoundingClientRect().left <= ARROW_REACH;
      next.hidden = !scrolls || cards[cards.length - 1].getBoundingClientRect().right - box.right <= ARROW_REACH;
      if (hadFocus === prev && prev.hidden && !next.hidden) next.focus({ preventScroll: true });
      if (hadFocus === next && next.hidden && !prev.hidden) prev.focus({ preventScroll: true });
    }
    prev.addEventListener('click', function () { stepBy(-1); });
    next.addEventListener('click', function () { stepBy(1); });
    track.addEventListener('scroll', sync, { passive: true });
    onViewportChange(sync);
    sync();
  }
  if (hoverPointer) {
    section.querySelectorAll('.adu-carousel').forEach(function (carousel) {
      arrows(carousel.querySelector('.adu-carousel-track'),
        carousel.querySelector('.adu-carousel-nav--prev'), carousel.querySelector('.adu-carousel-nav--next'));
    });
    section.querySelectorAll('.psoc-strip').forEach(function (strip) {
      arrows(strip.querySelector('.psoc-grid'),
        strip.querySelector('.psoc-strip-nav--prev'), strip.querySelector('.psoc-strip-nav--next'));
    });
  }

  var FILL_MAX = 1.08;
  function fitStages() {
    section.querySelectorAll('.psoc-grid--1 .adu').forEach(function (unit) {
      var media = unit.querySelector('.adu-media > img, .adu-media > video');

      unit.classList.remove('adu--fill');
      if (!media || getComputedStyle(unit).display !== 'grid') return;
      var stage = media.parentNode.getBoundingClientRect().height;
      var own = media.getBoundingClientRect().height;
      if (stage > own + 1 && stage <= own * FILL_MAX) unit.classList.add('adu--fill');
    });
  }
  fitStages();
  onViewportChange(fitStages);

  var BAND_PX = 24;
  function fitIgFeet() {
    section.querySelectorAll('.adu--ig').forEach(function (unit) {
      unit.classList.add('adu--natural');
      var own = unit.offsetHeight;
      unit.classList.remove('adu--natural');
      unit.classList.toggle('adu--natural', unit.offsetHeight - own > BAND_PX);
    });
  }
  fitIgFeet();

  onViewportChange(fitIgFeet);
})();
