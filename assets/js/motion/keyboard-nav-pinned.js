

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before motion/keyboard-nav-pinned.js');
  }
  var WS = window.WalkthroughShared;
  var clamp = WS.clamp;
  var stableViewportH = WS.stableViewportH;

  function create(ctx) {

    var section = ctx.section, runway = ctx.runway;
    var annotationsCol = ctx.annotationsCol;
    var focusLabels = ctx.focusLabels;
    var focusSubWindows = ctx.focusSubWindows, focusRevealAts = ctx.focusRevealAts;
    var segScrollY = ctx.segScrollY, findSegment = ctx.findSegment;

    var numFocuses, activeFocus, segments, totalVh, callouts, destroyed;
    function sync() {
      numFocuses = ctx.numFocuses();
      activeFocus = ctx.activeFocus();
      segments = ctx.segments();
      totalVh = ctx.totalVh();
      callouts = ctx.callouts();
      destroyed = ctx.destroyed();
    }

    var headingTitleEl = section.querySelector('.walkthrough-heading-title');
    var liveRegion = null;
    var lastAnnouncedFocus = -1;
    var lastRailFocus = -1;
    var keyNavTarget = -1;
    var keyNavSub = -1;

    function stepTarget(delta) {
      if (keyNavTarget >= 0) {

        var t = clamp(keyNavTarget + delta, 0, numFocuses - 1);
        return t === keyNavTarget ? -1 : t;
      }
      if (activeFocus < 0 && delta < 0) {

        return lastRailFocus;
      }
      var base = activeFocus >= 0 ? activeFocus : lastRailFocus;
      var target = clamp(base + delta, 0, numFocuses - 1);

      if (target === base) return -1;
      return target;
    }

    function calloutScrollY(focusIdx, subIdx) {
      for (var s2 = 0; s2 < segments.length; s2++) {
        var sg = segments[s2];
        if (sg.type === 'hold' && sg.focusIdx === focusIdx) {
          var sw = focusSubWindows(focusIdx);
          var k = clamp(subIdx, 0, sw.bounds.length - 2);
          var span = sw.bounds[k + 1] - sw.bounds[k];
          var share = sw.panShares[k] || 0;
          var tailK = sw.tailShares[k] || 0;

          var holdQ = sw.bounds[k] + (share + 0.25 * (1 - share - tailK)) * span;
          var ov = focusRevealAts(focusIdx)[k];
          if (isFinite(ov)) holdQ = Math.max(holdQ, Math.min(0.98, ov + 0.02));
          return segScrollY(sg, Math.min(1, holdQ));
        }
      }
      return section.getBoundingClientRect().top + window.pageYOffset;
    }

    function navigateToFocus(target) {
      keyNavTarget = target;
      keyNavSub = 0;
      window.scrollTo({ top: calloutScrollY(target, 0), behavior: 'smooth' });
      watchKeyNav();
    }

    section.walkthroughBeatNav = function(delta, fromY) {
      sync();
      var f, s;
      if (keyNavTarget >= 0) {
        f = keyNavTarget;
        s = keyNavSub + delta;
      } else {
        var scrolled2 = (typeof fromY === 'number' && isFinite(fromY))
          ? fromY - (section.getBoundingClientRect().top + window.pageYOffset)
          : -section.getBoundingClientRect().top;
        var totalPx2 = runway.offsetHeight;
        if (scrolled2 < 0 || scrolled2 > totalPx2) return false;
        var prog2 = clamp(scrolled2 / Math.max(1, totalPx2 - stableViewportH()), 0, 1);
        var sg2 = findSegment(prog2 * totalVh);
        var sp2 = (prog2 * totalVh - sg2.startVh) / sg2.vh;
        if (sg2.type === 'entry') {
          if (delta < 0) return false;
          f = 0; s = 0;
        } else if (sg2.type === 'exit') {
          if (delta > 0) return false;
          f = numFocuses - 1;
          s = ((callouts[f] && callouts[f].length) || 1) - 1;
        } else if (sg2.type === 'transit') {
          if (delta > 0) { f = sg2.to; s = 0; }
          else { f = sg2.from; s = ((callouts[sg2.from] && callouts[sg2.from].length) || 1) - 1; }
        } else {
          var holdQCur = sp2;
          var swCur = focusSubWindows(sg2.focusIdx);
          var sCur = swCur.bounds.length - 2;
          for (var sj = 0; sj < swCur.bounds.length - 1; sj++) {
            if (holdQCur < swCur.bounds[sj + 1]) { sCur = sj; break; }
          }
          f = sg2.focusIdx;
          s = sCur + delta;
        }
      }

      if (f >= 0 && f < numFocuses) {
        var nHere = (callouts[f] && callouts[f].length) || 1;
        if (s >= nHere) { f += 1; s = 0; }
        else if (s < 0) {
          f -= 1;
          if (f >= 0) s = ((callouts[f] && callouts[f].length) || 1) - 1;
        }
      }
      if (f < 0 || f >= numFocuses) return false;
      keyNavTarget = f;
      keyNavSub = s;
      window.scrollTo({ top: calloutScrollY(f, s), behavior: 'smooth' });
      watchKeyNav();
      return true;
    };

    var keyNavWatchRaf = null;
    function watchKeyNav() {
      if (keyNavWatchRaf) cancelAnimationFrame(keyNavWatchRaf);
      var lastY = window.scrollY;
      var stillSince = performance.now();
      function tick(now) {
        sync();
        keyNavWatchRaf = null;
        if (destroyed || keyNavTarget < 0) return;
        var y = window.scrollY;
        if (y !== lastY) { lastY = y; stillSince = now; }
        else if (now - stillSince > 350) { keyNavTarget = -1; keyNavSub = -1; return; }
        keyNavWatchRaf = requestAnimationFrame(tick);
      }
      keyNavWatchRaf = requestAnimationFrame(tick);
    }

    function onAnnotationKeydown(e) {

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      var delta = 0;
      if (e.key === 'ArrowRight') delta = 1;
      else if (e.key === 'ArrowLeft') delta = -1;
      else return;

      if (section.walkthroughBeatNav(delta)) e.preventDefault();
    }

    section.walkthroughStopNav = function(delta) {
      sync();
      var target = stepTarget(delta);
      if (target < 0) return false;
      navigateToFocus(target);
      return true;
    };

    section.walkthroughGoToStop = function(i) {
      sync();
      navigateToFocus(clamp(i, 0, numFocuses - 1));
    };

    if (annotationsCol) {
      annotationsCol.setAttribute('role', 'region');
      annotationsCol.setAttribute('aria-label',
        (headingTitleEl ? headingTitleEl.textContent.trim() : 'Campaign walkthrough') + ' annotations');
      annotationsCol.setAttribute('tabindex', '0');
      annotationsCol.addEventListener('keydown', onAnnotationKeydown);
    }

    if (annotationsCol) {

      liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.style.position = 'absolute';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.overflow = 'hidden';
      liveRegion.style.clipPath = 'inset(50%)';
      liveRegion.style.whiteSpace = 'nowrap';
      annotationsCol.appendChild(liveRegion);
    }

    function announceFocus(focusIdx) {
      sync();
      if (!liveRegion || focusIdx < 0 || focusIdx === lastAnnouncedFocus) return;
      lastAnnouncedFocus = focusIdx;

      var entries = callouts[focusIdx];
      var body = (entries && entries[0] && entries[0].annTextEl)
        ? entries[0].annTextEl.textContent.trim() : '';
      liveRegion.textContent = body
        ? (focusLabels[focusIdx] + '. ' + body)
        : focusLabels[focusIdx];
    }

    function destroy() {
      if (keyNavWatchRaf) { cancelAnimationFrame(keyNavWatchRaf); keyNavWatchRaf = null; }
      if (annotationsCol) {
        annotationsCol.removeEventListener('keydown', onAnnotationKeydown);
        annotationsCol.removeAttribute('tabindex');
        annotationsCol.removeAttribute('role');
        annotationsCol.removeAttribute('aria-label');
      }
      if (liveRegion && liveRegion.parentNode) liveRegion.parentNode.removeChild(liveRegion);
    }

    return {
      announce: announceFocus,
      target: function() { return keyNavTarget; },
      clearTarget: function() { keyNavTarget = -1; keyNavSub = -1; },
      setRail: function(focus) { lastRailFocus = focus; },
      resetAnnounced: function() { lastAnnouncedFocus = -1; },
      destroy: destroy
    };
  }

  window.KeyboardNavPinned = { create: create };
})();
