

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WheelFlick = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var FLICK_PX = 260;
  var WIN_MS = 140;

  var NOTCH_PX = 40;

  var QUIET_MS = 160;
  var SWALLOW_MAX_MS = 2600;
  var REENGAGE_RATIO = 0.9;
  var REENGAGE_AFTER_MS = 300;

  var BAILOUT_N = 3;
  var BAILOUT_MS = 2500;

  function create() {
    var prevAt = -Infinity;
    var winStart = -Infinity, winDir = 0, accum = 0;
    var swallowing = false, swallowStart = 0, peak = 0;
    var lastMag = 0, lastLone = false;
    var arriving = false;
    var commits = [], bailed = false;

    function openTrain() {
      swallowing = false;
      arriving = false;
      winStart = -Infinity;
      accum = 0;
    }

    function answer(act, dir, fresh, arrival) {
      return { act: act, dir: dir, fresh: fresh, arrival: arrival };
    }

    function feed(px, now, notched) {
      if (!px) return answer('pass', 0, false, false);
      var mag = Math.abs(px), dir = px > 0 ? 1 : -1;
      var quiet = now - prevAt > QUIET_MS;
      prevAt = now;
      if (quiet) openTrain();
      if (bailed) {

        if (!(quiet && (notched || mag >= NOTCH_PX))) return answer('pass', dir, false, false);
        bailed = false;
        commits = [];
      }

      var opens = quiet;
      if (swallowing) {
        var held = now - swallowStart;
        var hands = held > REENGAGE_AFTER_MS && mag >= peak * REENGAGE_RATIO;
        if (held <= SWALLOW_MAX_MS && !hands) {
          if (mag > peak) peak = mag;
          return answer('swallow', dir, false, false);
        }

        swallowing = false;
        winStart = -Infinity;
        accum = 0;
        opens = hands;
      }

      var fresh = now - winStart > WIN_MS || dir !== winDir;
      if (fresh) { winStart = now; winDir = dir; accum = 0; }
      accum += mag;
      lastMag = mag;
      var notch = opens && (notched || mag >= NOTCH_PX);
      lastLone = notch && quiet;
      var flick = notch || accum >= FLICK_PX;
      return answer(flick ? 'flick' : 'pass', dir, fresh, flick && arriving);
    }

    function commit(now) {
      swallowing = true;
      swallowStart = now;
      peak = lastMag;
      arriving = false;
      if (lastLone) return;
      commits.push(now);
      while (commits.length && now - commits[0] > BAILOUT_MS) commits.shift();
      if (commits.length >= BAILOUT_N) bailed = true;
    }

    function attach(now, moving) {
      openTrain();
      prevAt = moving ? now : -Infinity;
      arriving = !!moving;
    }

    function reset() {
      openTrain();
      prevAt = -Infinity;
      commits = [];
      bailed = false;
    }

    return {
      feed: feed,
      commit: commit,
      attach: attach,
      reset: reset,
      bailedOut: function () { return bailed; }
    };
  }

  return {
    create: create,
    FLICK_PX: FLICK_PX,
    WIN_MS: WIN_MS,
    NOTCH_PX: NOTCH_PX,
    QUIET_MS: QUIET_MS,
    SWALLOW_MAX_MS: SWALLOW_MAX_MS,
    REENGAGE_AFTER_MS: REENGAGE_AFTER_MS,
    BAILOUT_N: BAILOUT_N,
    BAILOUT_MS: BAILOUT_MS
  };
});
