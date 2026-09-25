

(function () {
  'use strict';

  var hud = document.querySelector('.project-hud');
  if (!hud) return;

  var root = document.documentElement;
  var pageTitle = document.querySelector('h1.project-title');
  var pagination = document.querySelector('.project-pagination');
  var mainContent = document.querySelector('.main-content');
  var sectionLabel = hud.querySelector('.hud-section');
  var topButton = hud.querySelector('.hud-top');

  var MIN_TRAVEL_RATIO = 1.5;

  var SHOW_FALLBACK_PX = 240;
  var LABEL_LINE_PX = 48;
  var RESIZE_DEBOUNCE_MS = 150;

  var active = false;
  var headerH = 64;
  var chromeH = 108;
  var sections = [];
  var progressEnd = 1;

  var visible = false;
  var lastLabel = null;
  var ticking = false;

  var progressReady = false;
  var lastProgressY = null;
  var lastProgress = 0;

  var titleOutOfView = false;
  var titleObserver = null;
  var observedHeaderH = null;

  var sectionObserver = null;
  var observedSectionKey = null;
  var aboveLine = new Map();

  var ABOVE_REACH_PX = 1000000;

  function dbgLog() {
    if (!window.debug || !window.debug.flag('project-hud')) return;
    window.debug.log.apply(window.debug, ['project-hud'].concat([].slice.call(arguments)));
  }

  function observeTitle() {
    if (!pageTitle || !('IntersectionObserver' in window)) return;
    if (titleObserver && observedHeaderH === headerH) return;
    if (titleObserver) titleObserver.disconnect();
    observedHeaderH = headerH;
    titleObserver = new IntersectionObserver(function (entries) {
      titleOutOfView = !entries[entries.length - 1].isIntersecting;
      applyVisibility();
      dbgLog('Title out of view:', titleOutOfView);
    }, { rootMargin: '-' + headerH + 'px 0px 0px 0px' });
    titleObserver.observe(pageTitle);
  }

  function applyVisibility() {
    setVisible(active && titleOutOfView);
  }

  function observeSections() {
    if (!('IntersectionObserver' in window)) return;
    var line = chromeH + LABEL_LINE_PX;
    var key = window.innerHeight + ':' + line + ':' + sections.length;
    if (sectionObserver && observedSectionKey === key) return;
    if (sectionObserver) sectionObserver.disconnect();
    observedSectionKey = key;
    aboveLine = new Map();
    sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { aboveLine.set(e.target, e.isIntersecting); });
      paintLabel();
    }, { rootMargin: ABOVE_REACH_PX + 'px 0px ' + (line - window.innerHeight) + 'px 0px' });
    sections.forEach(function (s) { sectionObserver.observe(s.el); });
  }

  function paintLabel() {
    var line = chromeH + LABEL_LINE_PX;
    var label = null;
    for (var i = 0; i < sections.length; i++) {
      var el = sections[i].el;
      if (sectionObserver ? aboveLine.get(el) : el.getBoundingClientRect().top <= line) {
        label = sections[i].label;
      }
    }
    if (label !== lastLabel) {
      lastLabel = label;
      if (sectionLabel) sectionLabel.textContent = label || '';
      dbgLog('Section:', label);
    }
  }

  function measure() {
    var viewportH = window.innerHeight;
    headerH = parseFloat(
      getComputedStyle(root).getPropertyValue('--header-height')
    ) || 64;
    chromeH = headerH + hud.offsetHeight;
    observeTitle();

    var endTop = pagination
      ? pagination.getBoundingClientRect().top + window.scrollY
      : root.scrollHeight;
    progressEnd = Math.max(1, endTop - viewportH);
    active = endTop > viewportH * MIN_TRAVEL_RATIO;
    root.classList.toggle('hud-active', active);

    sections = [];
    var nodes = document.querySelectorAll('[data-hud-label]');
    for (var i = 0; i < nodes.length; i++) {
      sections.push({
        el: nodes[i],
        label: nodes[i].getAttribute('data-hud-label')
      });
    }
    observeSections();

    dbgLog('Measured:', {
      active: active,
      chromeH: chromeH,
      hasTitle: !!pageTitle,
      sections: sections.length,
      progressEnd: Math.round(progressEnd),
      progressReady: progressReady
    });

    update();
  }

  function gateProgress() {
    if (!document.querySelector('.campaign-walkthrough-section')) {
      progressReady = true;
      return;
    }
    document.addEventListener('walkthrough:measured', openProgress);

    window.addEventListener('load', openProgress);
  }

  function openProgress() {
    if (progressReady) return;
    progressReady = true;
    dbgLog('Progress unblocked');
    measure();
  }

  function paintProgress(scrollY) {
    if (!progressReady) return;
    var raw = Math.min(Math.max(scrollY / progressEnd, 0), 1);
    var next = raw;
    if (lastProgressY !== null) {
      var dy = scrollY - lastProgressY;
      var step = Math.abs(dy) / progressEnd;
      if (dy > 0) next = Math.min(Math.max(raw, lastProgress), lastProgress + step);
      else if (dy < 0) next = Math.max(Math.min(raw, lastProgress), lastProgress - step);
      else next = lastProgress;
    }
    lastProgressY = scrollY;
    lastProgress = next;
    hud.style.setProperty('--hud-progress', next.toFixed(4));
  }

  function setVisible(next) {
    if (next === visible) return;
    visible = next;
    hud.classList.toggle('is-visible', next);
    dbgLog(next ? 'Shown' : 'Hidden');
  }

  function update() {
    ticking = false;

    if (!active) {
      setVisible(false);
      return;
    }

    var scrollY = window.scrollY;

    if (!titleObserver) {
      titleOutOfView = pageTitle
        ? pageTitle.getBoundingClientRect().bottom <= headerH
        : scrollY > SHOW_FALLBACK_PX;
    }
    applyVisibility();

    paintProgress(scrollY);

    if (!sectionObserver) paintLabel();
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }

  function debounce(fn, delay) {
    var timeout;
    return function () {
      clearTimeout(timeout);
      timeout = setTimeout(fn, delay);
    };
  }

  function init() {
    if (topButton) {
      topButton.addEventListener('click', function () {

        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    }

    gateProgress();
    measure();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', debounce(measure, RESIZE_DEBOUNCE_MS));
    if (document.readyState !== 'complete') {
      window.addEventListener('load', measure);
    }

    if ('ResizeObserver' in window && mainContent) {
      new ResizeObserver(debounce(measure, RESIZE_DEBOUNCE_MS))
        .observe(mainContent);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
