

(function () {
  'use strict';

  var acts = [].slice.call(document.querySelectorAll('.campaign-walkthrough-section'));
  if (!acts.length) return;

  var root = document.documentElement;
  var hud = document.querySelector('.project-hud');
  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');

  function scrollBehavior() { return reduceMq.matches ? 'auto' : 'smooth'; }

  function chromeHeight() {
    var headerH = parseFloat(getComputedStyle(root).getPropertyValue('--header-height')) || 64;
    return headerH + (hud && root.classList.contains('hud-active') ? hud.offsetHeight : 0);
  }

  function pinnedAct() {
    for (var i = 0; i < acts.length; i++) {
      var s = acts[i];
      if (typeof s.walkthroughStopNav !== 'function') continue;
      var r = s.getBoundingClientRect();
      if (r.top <= 1 && r.bottom >= window.innerHeight - 1) return s;
    }
    return null;
  }

  var runs = [];
  acts.forEach(function (section) {
    var last = runs[runs.length - 1];
    if (last && last[last.length - 1].section.nextElementSibling === section) last.push({ section: section });
    else runs.push([{ section: section }]);
  });
  runs.forEach(function (run) {
    var total = 0;
    run.forEach(function (leg, i) {
      leg.run = run;
      leg.at = i;
      leg.offset = total;
      leg.count = leg.section.querySelectorAll('[data-wt-chapter]').length;
      leg.title = leg.section.getAttribute('data-hud-label') || '';
      total += leg.count;
    });
    run.total = total;
  });
  function legOf(section) {
    for (var r = 0; r < runs.length; r++) {
      for (var i = 0; i < runs[r].length; i++) if (runs[r][i].section === section) return runs[r][i];
    }
    return null;
  }

  var LAND_REST_FRAMES = 10;
  var LAND_WATCH_MS = 1500;
  var landWatch = null;
  function cancelLand() {
    if (landWatch) cancelAnimationFrame(landWatch);
    landWatch = null;
  }
  function land(aim, arrived) {
    cancelLand();
    aim();
    var lastY = window.pageYOffset, still = 0, retries = 2, aimedAt = performance.now();
    function tick(now) {
      var y = window.pageYOffset;
      still = y === lastY ? still + 1 : 0;
      lastY = y;
      if (still >= LAND_REST_FRAMES && !arrived() && retries-- > 0) {
        aim();
        still = 0;
        aimedAt = now;
      }
      landWatch = (still < LAND_REST_FRAMES || now - aimedAt < LAND_WATCH_MS) && retries >= 0
        ? requestAnimationFrame(tick) : null;
    }
    landWatch = requestAnimationFrame(tick);
  }
  ['wheel', 'touchstart', 'keydown'].forEach(function (type) {
    window.addEventListener(type, cancelLand, { capture: true, passive: true });
  });

  function goToLegStop(leg, i) {
    var target = leg && leg.section;
    if (!target || typeof target.walkthroughGoToStop !== 'function') return;
    land(function () { target.walkthroughGoToStop(i); }, function () {
      var state = target.walkthroughStopState;
      return !!state && state.index === i && state.phase === 'tour';
    });
  }

  function crossSeam(section, delta) {
    var leg = legOf(section);
    var next = leg && leg.run[leg.at + delta];
    if (!next || typeof next.section.walkthroughGoToStop !== 'function') return false;
    goToLegStop(next, delta > 0 ? 0 : next.count - 1);
    return true;
  }

  function restart(section) {
    var top = section.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: scrollBehavior() });
  }

  function skip(section) {
    var leg = legOf(section);
    var last = leg ? leg.run[leg.run.length - 1].section : section;
    function target() {
      return Math.round(last.getBoundingClientRect().bottom + window.pageYOffset - chromeHeight() - 8);
    }
    land(function () { window.scrollTo({ top: target(), behavior: scrollBehavior() }); },
      function () { return Math.abs(target() - window.pageYOffset) <= 2; });
  }

  var closeOpenList = null;

  function openList(bar, button, list) {
    if (closeOpenList) closeOpenList();
    list.hidden = false;
    bar.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    closeOpenList = function () {
      list.hidden = true;
      bar.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      closeOpenList = null;
    };

    var current = list.querySelector('.wt-chapter[aria-current]');
    if (!current) return;
    var offset = current.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += offset - (list.clientHeight - current.offsetHeight) / 2;
  }

  document.addEventListener('click', function (e) {
    if (!closeOpenList) return;
    if (e.target.closest && e.target.closest('.wt-chapters, .wt-ctl-count')) return;
    closeOpenList();
  });

  var fitters = [];

  function bindBar(section) {
    var bar = section.querySelector('.walkthrough-progress');
    if (!bar) return;
    var countBtn = bar.querySelector('.wt-ctl-count');
    var countText = bar.querySelector('.wt-ctl-count-text');
    var list = bar.querySelector('.wt-chapters');

    var dots = bar.querySelectorAll('[data-progress-dot]');
    var chapters = bar.querySelectorAll('[data-wt-chapter]');
    var leg = legOf(section);
    buildTour(bar, leg);

    bar.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var nav = e.target.closest('[data-progress-nav]');
      var dot = e.target.closest('[data-progress-dot]');
      var chapter = e.target.closest('[data-wt-chapter]');
      var far = e.target.closest('[data-wt-tour-stop]');
      if (nav) {
        if (typeof section.walkthroughStopNav === 'function') {
          var delta = nav.getAttribute('data-progress-nav') === 'prev' ? -1 : 1;
          if (!section.walkthroughStopNav(delta)) crossSeam(section, delta);
        }
      } else if (far) {

        var ref = far.getAttribute('data-wt-tour-stop').split(':');
        goToLegStop(leg.run[+ref[0]], +ref[1]);
        if (closeOpenList) closeOpenList();
      } else if (dot || chapter) {
        var i = parseInt((dot || chapter).getAttribute(dot ? 'data-progress-dot' : 'data-wt-chapter'), 10);
        if (!isNaN(i) && typeof section.walkthroughGoToStop === 'function') section.walkthroughGoToStop(i);
        if (chapter && closeOpenList) { closeOpenList(); countBtn.focus(); }
      } else if (e.target.closest('.wt-ctl-count')) {
        if (list.hidden) openList(bar, countBtn, list);
        else if (closeOpenList) closeOpenList();
      } else if (e.target.closest('.wt-ctl-restart')) {
        restart(section);
      } else if (e.target.closest('.wt-ctl-skip')) {
        skip(section);
      }
    });

    function render(state) {
      var index = state.index;

      var total = leg ? leg.run.total : state.count;
      var n = (leg ? leg.offset : 0) + index + 1;
      countText.textContent = n < 1 ? total + ' stops' : n + ' of ' + total;
      [].forEach.call(dots, function (d, i) {
        d.classList.toggle('active', i <= index);
        if (i === index) d.setAttribute('aria-current', 'step');
        else d.removeAttribute('aria-current');
      });
      [].forEach.call(chapters, function (c, i) {
        if (i === index) c.setAttribute('aria-current', 'step');
        else c.removeAttribute('aria-current');
      });
    }
    section.addEventListener('walkthrough:stop', function (e) { render(e.detail); });

    if (section.walkthroughStopState) render(section.walkthroughStopState);

    var BAR_CLEARANCE_PX = 12;
    var BAR_GAP_PX = 24;
    var LIST_MIN_PX = 220;
    fitters.push(function fitBar() {
      bar.classList.remove('is-compact', 'is-anchored', 'is-list-down');
      section.classList.remove('wt-bar-anchored');
      bar.style.removeProperty('--wt-bar-top');
      bar.style.removeProperty('--wt-list-max');

      if (section.classList.contains('is-synced') || !bar.offsetParent) return;
      var slot = section.querySelector('.walkthrough-annotation-slot');
      if (!slot) return;
      var tallest = 0;
      [].forEach.call(section.querySelectorAll('.walkthrough-annotation'), function (a) {
        tallest = Math.max(tallest, a.offsetHeight);
      });

      var hint = section.querySelector('.walkthrough-scroll-hint');
      if (hint) tallest = Math.max(tallest, hint.offsetHeight);

      var cardsEnd = slot.getBoundingClientRect().top + tallest;
      var bottomTop = bar.getBoundingClientRect().top;
      var room = bottomTop - cardsEnd;
      bar.classList.toggle('is-compact', room < BAR_CLEARANCE_PX);
      if (room > BAR_GAP_PX) {
        var originTop = bar.offsetParent.getBoundingClientRect().top + bar.offsetParent.clientTop;
        bar.style.setProperty('--wt-bar-top', Math.round(cardsEnd + BAR_GAP_PX - originTop) + 'px');
        bar.classList.add('is-anchored');
        section.classList.add('wt-bar-anchored');

        var below = room - BAR_GAP_PX - 8;
        if (below >= LIST_MIN_PX) {
          bar.classList.add('is-list-down');
          bar.style.setProperty('--wt-list-max', Math.floor(below) + 'px');
        }
      }
    });
  }

  function buildTour(bar, leg) {
    if (!leg || leg.run.length < 2) return;
    if (leg.at < leg.run.length - 1) bar.classList.add('has-next-act');
    var rail = bar.querySelector('.walkthrough-progress-rail');
    var list = bar.querySelector('.wt-chapters');
    var ownDot = rail.firstElementChild;
    var ownRow = list.firstElementChild;
    leg.run.forEach(function (other) {
      var heading = document.createElement('li');
      heading.className = 'wt-chapters-act';
      heading.textContent = other.title;
      if (other === leg) {
        list.insertBefore(heading, ownRow);
        if (ownDot && leg.at > 0) ownDot.classList.add('wt-tour-seam');
        return;
      }
      var before = other.at < leg.at;
      if (before) list.insertBefore(heading, ownRow); else list.appendChild(heading);
      [].forEach.call(other.section.querySelectorAll('[data-wt-chapter]'), function (src, i) {
        var label = src.textContent;
        var ref = other.at + ':' + i;
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'walkthrough-progress-dot' + (before ? ' active' : '') + (i === 0 && other.at > 0 ? ' wt-tour-seam' : '');
        dot.setAttribute('data-wt-tour-stop', ref);
        dot.setAttribute('aria-label', 'Go to ' + other.title + ': ' + label);
        dot.title = other.title + ' · ' + label;
        if (before) rail.insertBefore(dot, ownDot); else rail.appendChild(dot);
        var li = document.createElement('li');
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'wt-chapter';
        row.setAttribute('data-wt-tour-stop', ref);
        row.textContent = label;
        li.appendChild(row);
        if (before) list.insertBefore(li, ownRow); else list.appendChild(li);
      });
    });

    var skipBtn = bar.querySelector('.wt-ctl-skip');
    if (skipBtn) skipBtn.title = 'Skip the walkthroughs';
  }

  acts.forEach(bindBar);

  var fitTimer = null;
  function fitAll() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(function () { fitters.forEach(function (f) { f(); }); }, 120);
  }
  window.addEventListener('resize', fitAll);
  window.addEventListener('load', fitAll);
  document.addEventListener('walkthrough:measured', fitAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
  fitAll();

  function nextSection(section) {
    var nodes = document.querySelectorAll('[data-hud-label]');
    for (var i = 0; i < nodes.length; i++) {
      if (section.compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING &&
          !section.contains(nodes[i])) {
        return nodes[i];
      }
    }
    return null;
  }

  function exitCue(section) {
    var leg = legOf(section);
    var act = leg && leg.run[leg.at + 1];
    if (act) {
      return { kicker: 'Next walkthrough · ' + act.count + (act.count === 1 ? ' stop' : ' stops'), label: act.title };
    }
    var next = nextSection(section);
    if (!next) return null;
    if (next.classList.contains('project-pagination')) {
      return { kicker: 'End of the tour', label: 'Next project below' };
    }
    return { kicker: 'Keep scrolling', label: next.getAttribute('data-hud-label') };
  }

  function bindNextCue(section) {
    var dock = section.querySelector('.campaign-walkthrough-annotations');
    var chapters = section.querySelectorAll('[data-wt-chapter]');
    if (!dock || !chapters.length) return;
    var cue = document.createElement('div');
    cue.className = 'wt-next-cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML =
      '<span class="wt-next-cue-kicker"></span>' +
      '<span class="wt-next-cue-label"></span>' +
      '<svg class="wt-next-cue-chevron" viewBox="0 0 24 12" width="18" height="9">' +
        '<path d="M4 2l8 8 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    var kicker = cue.firstChild;
    var label = kicker.nextSibling;
    dock.appendChild(cue);

    var lastRead = false;
    function sync() {
      var state = section.walkthroughStopState;
      var on = false;
      if (state && section.classList.contains('is-synced') && state.phase !== 'entry' &&
          !dock.querySelector('.walkthrough-annotation.active')) {
        var exiting = state.phase === 'exit' || state.index >= state.count - 1;
        var words = exiting ? exitCue(section)
          : (chapters[state.index + 1] ? { kicker: 'Next', label: chapters[state.index + 1].textContent } : null);
        if (words && words.label) {
          kicker.textContent = words.kicker;
          label.textContent = words.label;
          on = true;
        }
      }
      cue.classList.toggle('visible', on);

      var synced = !!state && section.classList.contains('is-synced');
      var atLast = synced && state.index >= state.count - 1;
      var showing = !!dock.querySelector('.walkthrough-annotation.active');
      if (!atLast) lastRead = false;
      else if (showing) lastRead = true;
      dock.classList.toggle('is-exited',
        synced && !showing && (state.phase === 'exit' || (atLast && lastRead)));
    }
    section.addEventListener('walkthrough:stop', sync);

    new MutationObserver(sync).observe(dock, {
      subtree: true, attributes: true, attributeFilter: ['class']
    });
    sync();
  }

  acts.forEach(bindNextCue);

  if (hud) {
    var yieldTicking = false;

    var candidate = null;
    var needMeasure = true;
    var checkYield = function () {
      yieldTicking = false;
      if (needMeasure) { needMeasure = false; candidate = pinnedAct(); }
      var act = candidate;
      hud.classList.toggle('is-yielding',
        !!act && act.classList.contains('is-synced') && act.classList.contains('is-condensed'));
    };
    var queueYield = function (e) {
      if (e && (e.type === 'scroll' || e.type === 'resize')) { candidate = pinnedAct(); needMeasure = false; }
      else needMeasure = true;
      if (!yieldTicking) { yieldTicking = true; requestAnimationFrame(checkYield); }
    };
    window.addEventListener('scroll', queueYield, { passive: true });
    window.addEventListener('resize', queueYield);

    acts.forEach(function (s) { s.addEventListener('walkthrough:stop', queueYield); });
    document.addEventListener('walkthrough:measured', queueYield);
    queueYield();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && closeOpenList) {
      var opener = document.querySelector('.wt-ctl-count[aria-expanded="true"]');
      closeOpenList();
      if (opener) opener.focus();
      return;
    }
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (e.key.indexOf('Arrow') !== 0) return;

    root.classList.add('has-keys');
    var delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    var t = e.target;
    if (t && t.closest &&
        t.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="dialog"]')) {
      return;
    }
    var act = pinnedAct();
    if (!act) return;
    var step = typeof act.walkthroughBeatNav === 'function' ? act.walkthroughBeatNav : act.walkthroughStopNav;
    if (step(delta) || crossSeam(act, delta)) e.preventDefault();
  });
})();
