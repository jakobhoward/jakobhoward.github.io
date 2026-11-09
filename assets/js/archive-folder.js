

(function() {
  'use strict';

  var folders = [].slice.call(document.querySelectorAll('.project-folder'));
  if (!folders.length) return;

  var SETTLE_MS = 450;
  var INTENT_MS = 100;
  var COLLAPSE_MS = 220;

  var navType = (function() {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      return nav ? nav.type : 'navigate';
    } catch (e) { return 'navigate'; }
  })();

  function filtered() {
    var PF = window.ProjectFilters;
    return !!(PF && PF.isFiltered && PF.isFiltered());
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function withMotion(mutate, origins) {
    if (window.GridMotion) window.GridMotion.run(mutate, origins);
    else mutate();
  }

  function px(el, prop) {
    return parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0;
  }

  function setHash(hash) {
    var url = window.location.pathname + window.location.search + (hash ? '#' + hash : '');
    try { history.replaceState(history.state, '', url); } catch (e) {   }
  }

  folders.forEach(function(folder) {
    var id = folder.getAttribute('data-folder');
    var face = folder.querySelector('.folder-face');
    var button = face && face.querySelector('.card-link');
    var box = folder.querySelector('.folder-members');
    var rows = [].slice.call(folder.querySelectorAll('.folder-head, .folder-foot'));
    var folds = [].slice.call(folder.querySelectorAll('.folder-fold'));
    var members = box ? [].slice.call(box.children).filter(function(el) {
      return el.classList.contains('project-card');
    }) : [];
    if (!id || !button || !box || members.length < 2) return;
    var lead = members[0];
    var grid = folder.closest('.projects-grid');
    var busy = false;

    function isOpen() { return folder.classList.contains('is-open'); }

    function sync() {
      var open = isOpen();
      folder.classList.toggle('is-dissolved', filtered());
      button.setAttribute('aria-expanded', String(open));
      folds.forEach(function(f) { f.setAttribute('aria-expanded', String(open)); });
    }

    function announce() {
      folder.dispatchEvent(new CustomEvent('archivefolder:open', { bubbles: true, detail: { id: id } }));
    }

    function open(opts) {
      opts = opts || {};
      if (isOpen() || busy) return;
      warm();
      var mutate = function() {
        folder.classList.add('is-open');
        sync();
      };
      if (opts.instant) {
        mutate();
      } else {

        var from = face.getBoundingClientRect();
        var peeks = [0, px(folder, '--folder-peek-1'), px(folder, '--folder-peek-2')];
        var origins = new Map();
        members.forEach(function(m, i) {
          origins.set(m, { left: from.left, top: from.top + peeks[Math.min(i, peeks.length - 1)] });
        });
        withMotion(mutate, origins);
      }
      setHash(box.id);
      if (opts.scroll && !folder.classList.contains('is-dissolved')) bringIntoView();
      if (opts.focus) {

        var link = lead.querySelector('.card-link');
        if (link) link.focus({ preventScroll: true });
      }
    }

    function bringIntoView() {
      var top = folder.getBoundingClientRect().top;
      if (top >= 0 && top < window.innerHeight * 0.5) return;
      folder.scrollIntoView({ block: 'start', behavior: 'auto' });
      requestAnimationFrame(function() {
        var bar = document.querySelector('.fs-sentence');
        if (!bar) return;
        var under = bar.getBoundingClientRect().bottom + 24 - folder.getBoundingClientRect().top;
        if (under > 0) window.scrollBy(0, -under);
      });
    }

    function finishClose(opts) {
      withMotion(function() {
        folder.classList.remove('is-open', 'is-folding');
        sync();
      });
      setHash('');
      if (opts.focus) button.focus({ preventScroll: true });
    }

    function close(opts) {
      opts = opts || {};
      if (!isOpen() || busy) return;
      if (opts.instant || reducedMotion() || !window.GridMotion ||
          folder.classList.contains('is-dissolved')) {
        finishClose(opts);
        return;
      }
      busy = true;
      folder.classList.add('is-folding');
      var cell = lead.getBoundingClientRect();
      var target = folder.getBoundingClientRect();
      var parts = members.concat(rows);
      members.forEach(function(m) {
        var r = m.getBoundingClientRect();
        m.style.transition = 'transform ' + COLLAPSE_MS + 'ms ease-in, opacity ' + COLLAPSE_MS + 'ms ease-in';
        m.style.transform = 'translate(' + (target.left - r.left) + 'px, ' +
          (target.top + (cell.top - target.top) - r.top) + 'px)';
        m.style.opacity = '0';
      });
      rows.forEach(function(row) {
        row.style.transition = 'opacity ' + COLLAPSE_MS + 'ms ease-in';
        row.style.opacity = '0';
      });
      setTimeout(function() {

        parts.forEach(function(el) {
          el.style.transition = 'none';
          el.style.transform = '';
          el.style.opacity = '';
        });
        void folder.offsetWidth;
        parts.forEach(function(el) { el.style.transition = ''; });
        busy = false;
        finishClose(opts);
      }, COLLAPSE_MS);
    }

    var warmed = false;
    var intent = null;
    function warm() {
      if (intent) { clearTimeout(intent); intent = null; }
      if (warmed) return;
      warmed = true;
      members.forEach(function(m) {
        [].forEach.call(m.querySelectorAll('img[loading="lazy"]'), function(img) {
          img.loading = 'eager';
          if (img.decode) img.decode().catch(function() {});
        });
      });
    }
    face.addEventListener('pointerenter', function() {
      if (!warmed && !intent) intent = setTimeout(warm, INTENT_MS);
    });
    face.addEventListener('pointerleave', function() {
      if (intent) { clearTimeout(intent); intent = null; }
    });
    face.addEventListener('focusin', warm);
    face.addEventListener('touchstart', warm, { passive: true });

    button.addEventListener('click', function() {
      if (isOpen()) return;
      open({ focus: true });
      announce();
    });
    folds.forEach(function(f) {
      f.addEventListener('click', function() { close({ focus: true }); });
    });
    folder.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape' || !isOpen() || folder.classList.contains('is-dissolved')) return;
      e.preventDefault();
      close({ focus: true });
    });
    if (grid) grid.addEventListener('projectfilters:apply', sync);
    window.addEventListener('hashchange', function() {
      if (window.location.hash === '#' + box.id) open({ instant: true, scroll: true });
      else if (isOpen()) close({ instant: true });
    });

    var marks = [].slice.call(face.querySelectorAll('.folder-roll-item[data-count-mark]'));
    var settle = null;

    face.addEventListener('cardcount:start', function() {
      if (settle) { clearTimeout(settle); settle = null; }
      marks.forEach(function(item) { item.classList.remove('is-lit'); });
      folder.classList.add('is-counting');
    });

    face.addEventListener('cardcount:progress', function(e) {
      var shown = e.detail ? e.detail.fraction : 0;
      marks.forEach(function(item) {
        if (!item.classList.contains('is-lit') &&
            shown >= parseFloat(item.getAttribute('data-count-mark')) - 1e-4) {
          item.classList.add('is-lit');
        }
      });
    });

    face.addEventListener('cardcount:end', function() {
      marks.forEach(function(item) { item.classList.add('is-lit'); });
      settle = setTimeout(function() {
        folder.classList.remove('is-counting');
        settle = null;
      }, SETTLE_MS);
    });

    if (window.location.hash === '#' + box.id) {
      var fresh = navType === 'navigate';
      open({ instant: true, scroll: fresh });
      if (fresh) document.addEventListener('DOMContentLoaded', announce);
    }
    sync();
  });
})();
