

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before motion/flick-to-step.js');
  }
  var WS = window.WalkthroughShared;
  var debugLog = WS.debugLog;

  function create(ctx) {
    var section = ctx.section, flagSkip = ctx.flagSkip;

    var destroyed;

    var FLICK_PX = 260;
    var FLICK_WIN_MS = 140;
    var SWALLOW_QUIET_MS = 160;
    var SWALLOW_MAX_MS = 2600;
    var REENGAGE_RATIO = 0.9;
    var REENGAGE_AFTER_MS = 300;
    var BAILOUT_N = 3;
    var BAILOUT_MS = 2500;
    var flickAccum = 0, flickWinStart = 0, flickDir = 0, flickAnchorY = 0;
    var flickSwallowing = false, flickQuietTimer = null, flickHardTimer = null;
    var flickSwallowStart = 0, flickTailPeak = 0;
    var flickBailedOut = false, flickCommits = [];
    var flickAttached = false;

    function flickPinnedHere() {
      var r = section.getBoundingClientRect();
      return r.top <= 1 && r.bottom >= window.innerHeight - 1;
    }

    function endFlickSwallow() {
      if (flickSwallowing) debugLog('walkthrough-flick', 'swallow end');
      flickSwallowing = false;
      flickAccum = 0;
      clearTimeout(flickQuietTimer); flickQuietTimer = null;
      clearTimeout(flickHardTimer); flickHardTimer = null;
    }

    function onFlickWheel(e) {
      destroyed = ctx.destroyed();
      if (destroyed || flickBailedOut || !flickPinnedHere()) return;

      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      var px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (!px) return;
      var now = performance.now();
      var mag = Math.abs(px);

      if (flickSwallowing) {

        if (now - flickSwallowStart > REENGAGE_AFTER_MS &&
            mag >= flickTailPeak * REENGAGE_RATIO) {
          debugLog('walkthrough-flick', 're-engaged mid-swallow', { px: Math.round(mag) });
          endFlickSwallow();
        } else {

          if (mag > flickTailPeak) flickTailPeak = mag;
          e.preventDefault();
          clearTimeout(flickQuietTimer);
          flickQuietTimer = setTimeout(endFlickSwallow, SWALLOW_QUIET_MS);
          return;
        }
      }

      var dir = px > 0 ? 1 : -1;
      if (now - flickWinStart > FLICK_WIN_MS || dir !== flickDir) {

        flickWinStart = now; flickAccum = 0; flickDir = dir;
        flickAnchorY = window.pageYOffset;
      }
      flickAccum += mag;

      if (flickAccum < FLICK_PX) return;

      if (!section.walkthroughBeatNav(dir, flickAnchorY)) {
        debugLog('walkthrough-flick', 'passthrough at end', { dir: dir });
        return;
      }

      e.preventDefault();
      flickSwallowing = true;
      flickSwallowStart = now;
      flickTailPeak = mag;
      clearTimeout(flickQuietTimer); flickQuietTimer = setTimeout(endFlickSwallow, SWALLOW_QUIET_MS);
      clearTimeout(flickHardTimer); flickHardTimer = setTimeout(endFlickSwallow, SWALLOW_MAX_MS);
      flagSkip();

      flickCommits.push(now);
      while (flickCommits.length && now - flickCommits[0] > BAILOUT_MS) flickCommits.shift();
      if (flickCommits.length >= BAILOUT_N) {
        flickBailedOut = true;
        debugLog('walkthrough-flick', 'bailout — interception off for this visit');
      }
      debugLog('walkthrough-flick', 'commit', { dir: dir, px: Math.round(flickAccum) });
    }

    function setFlickListener(on) {
      if (on === flickAttached) return;
      flickAttached = on;
      if (on) {
        window.addEventListener('wheel', onFlickWheel, { passive: false });
      } else {
        window.removeEventListener('wheel', onFlickWheel, { passive: false });
        endFlickSwallow();
      }
    }

    return {
      setListener: setFlickListener,
      swallowing: function() { return flickSwallowing; },
      reset: function() {
        setFlickListener(false);
        flickBailedOut = false;
        flickCommits.length = 0;
      }
    };
  }

  window.FlickToStep = { create: create };
})();
