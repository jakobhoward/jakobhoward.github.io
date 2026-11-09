

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before motion/keyboard-nav-synced.js');
  }
  var WS = window.WalkthroughShared;
  var clamp = WS.clamp;

  function create(ctx) {
    var section = ctx.section, annotations = ctx.annotations;
    var annotationsCol = ctx.annotationsCol;
    var holdScrollY = ctx.holdScrollY, holdLandFrac = ctx.holdLandFrac;

    var lastActive, lastStop, destroyed;

    var focusLabels = [];
    annotations.forEach(function(ann, i) {
      var l = ann.querySelector('.walkthrough-annotation-label');
      focusLabels[i] = l ? l.textContent.trim() : 'Section ' + (i + 1);
    });
    var liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.style.position = 'absolute';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    liveRegion.style.clipPath = 'inset(50%)';
    liveRegion.style.whiteSpace = 'nowrap';
    annotationsCol.appendChild(liveRegion);

    var headingTitleEl = section.querySelector('.walkthrough-heading-title');
    annotationsCol.setAttribute('role', 'region');
    annotationsCol.setAttribute('aria-label',
      (headingTitleEl ? headingTitleEl.textContent.trim() : 'Campaign walkthrough') + ' annotations');
    annotationsCol.setAttribute('tabindex', '0');

    var keyNavTarget = -1;

    function goToStop(i) {
      keyNavTarget = clamp(i, 0, annotations.length - 1);
      window.scrollTo({ top: holdScrollY(keyNavTarget, holdLandFrac(keyNavTarget)), behavior: 'smooth' });
      watchKeyNav();
    }

    var keyNavWatchRaf = null;
    function watchKeyNav() {
      if (keyNavWatchRaf) cancelAnimationFrame(keyNavWatchRaf);
      var lastY = window.scrollY;
      var stillSince = performance.now();
      function tick(now) {
        destroyed = ctx.destroyed();
        keyNavWatchRaf = null;
        if (destroyed || keyNavTarget < 0) return;
        var y = window.scrollY;
        if (y !== lastY) { lastY = y; stillSince = now; }
        else if (now - stillSince > 350) { keyNavTarget = -1; return; }
        keyNavWatchRaf = requestAnimationFrame(tick);
      }
      keyNavWatchRaf = requestAnimationFrame(tick);
    }

    function stopNav(delta) {
      lastActive = ctx.lastActive();
      lastStop = ctx.lastStop();
      var target;
      if (keyNavTarget >= 0) target = keyNavTarget + delta;
      else if (lastActive >= 0) target = lastActive + delta;
      else target = delta > 0 ? lastStop + 1 : lastStop;
      if (target < 0 || target >= annotations.length) return false;
      goToStop(target);
      return true;
    }

    function onUserScrollGesture(e) {
      var t = e.target;
      if (t && t.closest && t.closest('button, a')) return;
      keyNavTarget = -1;
    }
    window.addEventListener('touchstart', onUserScrollGesture, { passive: true });
    window.addEventListener('wheel', onUserScrollGesture, { passive: true });

    function onDockKeydown(e) {

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      var delta = 0;
      if (e.key === 'ArrowRight') delta = 1;
      else if (e.key === 'ArrowLeft') delta = -1;
      else return;

      if (stopNav(delta)) e.preventDefault();
    }
    annotationsCol.addEventListener('keydown', onDockKeydown);

    var lastAnnounced = -1;

    function arrive(active) {
      if (active >= 0 && active === keyNavTarget) keyNavTarget = -1;
    }

    function announce(active) {
      if (active >= 0 && active !== lastAnnounced) {
        lastAnnounced = active;
        liveRegion.textContent = focusLabels[active];
      }
    }

    function destroy() {
      if (keyNavWatchRaf) { cancelAnimationFrame(keyNavWatchRaf); keyNavWatchRaf = null; }
      window.removeEventListener('touchstart', onUserScrollGesture);
      window.removeEventListener('wheel', onUserScrollGesture);
      if (liveRegion.parentNode) liveRegion.parentNode.removeChild(liveRegion);
      annotationsCol.removeEventListener('keydown', onDockKeydown);
      annotationsCol.removeAttribute('tabindex');
      annotationsCol.removeAttribute('role');
      annotationsCol.removeAttribute('aria-label');
    }

    return {
      stopNav: stopNav, goToStop: goToStop,
      arrive: arrive, announce: announce, destroy: destroy
    };
  }

  window.KeyboardNavSynced = { create: create };
})();
