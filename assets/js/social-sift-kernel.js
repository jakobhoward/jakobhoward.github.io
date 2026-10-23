

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SocialSiftKernel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var APEX = 0.55;
  var LIFT = 120;
  var ROT = 25;
  var DIP = 0.08;

  var CLEAR = 24;

  var DEPTH_Y = 6;
  var DEPTH_SCALE = 0.015;
  var DECK_LEVELS = 3;
  var BACK_Y = 8;
  var BACK_OPACITY = 0.25;

  var MEDIA_X = 10;
  var MEDIA_Y = 6;
  var MEDIA_ZOOM = 0.05;
  var SHADOW_TRAIL = 0.08;
  var SHADOW_DROP = 26;
  var RECOIL = 3;

  var OMEGA_TRACK = 18;
  var OMEGA_SETTLE = 11;
  var VMAX = 10;
  var SUBSTEP = 1 / 240;
  var SETTLE_P = 5e-4;
  var SETTLE_V = 5e-3;

  var COMMIT = 0.3;

  var EPS = 1e-4;

  var ON_CARD = 1e-3;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function smootherstep(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }

  function locate(p, n) {
    var k = clamp(Math.floor(p + EPS), 0, n - 1);
    return { k: k, f: clamp(p - k, 0, 1) };
  }

  function dirOf(i) { return i % 2 === 0 ? 1 : -1; }

  function sizeOf(v, j) { return typeof v === 'number' ? v : v[j]; }

  function fitUnder(i, t, w, h) {
    return Math.min(1, sizeOf(w, t) / sizeOf(w, i), sizeOf(h, t) / sizeOf(h, i));
  }

  function deckPose(d, z, fit) {
    return {
      x: 0, y: DEPTH_Y * d, rot: 0, scale: (1 - DEPTH_SCALE * d) * fit, px: 0, py: 0,
      opacity: clamp(DECK_LEVELS + 1 - d, 0, 1), z: z, lift: 0
    };
  }

  function backRest(kLeft, n, fit) {
    var d = Math.min(n - 1 - kLeft, DECK_LEVELS);
    return { y: DEPTH_Y * d + BACK_Y, scale: (1 - DEPTH_SCALE * (d + 1)) * fit };
  }

  function pose(i, p, n, w, h) {
    var loc = locate(p, n), k = loc.k, f = loc.f;
    var sifting = k < n - 1;

    if (i > k) {

      var rise = sifting ? smootherstep(f / APEX) : 0;
      var fit = fitUnder(i, k, w, h);
      if (sifting) fit = lerp(fit, i === k + 1 ? 1 : fitUnder(i, k + 1, w, h), rise);
      return deckPose(i - k - rise, n - i, fit);
    }
    if (i === k && !sifting) return deckPose(0, n + 1, 1);
    if (i < k) {

      var rest = backRest(i, n, fitUnder(i, i + 1, w, h));
      var fade = i === k - 1 ? BACK_OPACITY * (1 - smootherstep(f / 0.5)) : 0;
      return { x: 0, y: rest.y, rot: 0, scale: rest.scale, px: 0, py: 0, opacity: fade, z: 0, lift: 0 };
    }

    var dir = dirOf(i), wi = sizeOf(w, i);
    var cx = -dir * wi / 2, cy = sizeOf(h, i) / 2;
    var reach = dir * ((wi + sizeOf(w, k + 1)) / 2 + CLEAR);
    if (f <= APEX) {
      var e = smootherstep(f / APEX);
      return {
        x: reach * e, y: -LIFT * e, rot: dir * ROT * e, scale: 1 - DIP * e,
        px: cx, py: cy, opacity: 1, z: n + 1, lift: e
      };
    }

    var g = smootherstep((f - APEX) / (1 - APEX));
    var back = backRest(k, n, fitUnder(k, k + 1, w, h));
    return {
      x: reach * (1 - g), y: lerp(-LIFT, back.y, g), rot: dir * ROT * (1 - g),
      scale: lerp(1 - DIP, back.scale, g), px: cx * (1 - g), py: cy * (1 - g),
      opacity: lerp(1, BACK_OPACITY, g), z: 0, lift: 1 - g
    };
  }

  function r2(v) { return Math.round(v * 100) / 100; }

  function transformOf(q) {
    var t = 'translate3d(' + r2(q.x) + 'px,' + r2(q.y) + 'px,0)';
    if (q.rot !== 0 || q.scale !== 1) {
      var pivot = q.px !== 0 || q.py !== 0;
      if (pivot) t += ' translate(' + r2(q.px) + 'px,' + r2(q.py) + 'px)';
      t += ' rotate(' + Math.round(q.rot * 1e4) / 1e4 + 'deg) scale(' + Math.round(q.scale * 1e4) / 1e4 + ')';
      if (pivot) t += ' translate(' + r2(-q.px) + 'px,' + r2(-q.py) + 'px)';
    }
    return t;
  }

  function shadowTransformOf(q) {
    return transformOf({
      x: q.x * (1 - SHADOW_TRAIL), y: q.y + SHADOW_DROP * q.lift,
      rot: q.rot, scale: q.scale, px: q.px, py: q.py
    });
  }

  function mediaTransformOf(q, i) {
    if (q.lift === 0) return '';
    return 'translate3d(' + r2(-dirOf(i) * MEDIA_X * q.lift) + 'px,' + r2(MEDIA_Y * q.lift) + 'px,0) scale(' +
      Math.round((1 + MEDIA_ZOOM * q.lift) * 1e4) / 1e4 + ')';
  }

  function recoil(p, n) {
    var loc = locate(p, n);
    if (loc.k >= n - 1 || loc.f === 0) return 0;
    var curve = Math.sin(Math.PI * Math.min(loc.f / 0.5, 1)) * Math.max(1 - loc.f / 0.7, 0);
    return -dirOf(loc.k) * RECOIL * curve;
  }

  function displayed(p, n) {
    var loc = locate(p, n);
    return loc.k < n - 1 && loc.f >= APEX ? loc.k + 1 : loc.k;
  }

  function fill(j, p, n) {
    var loc = locate(p, n);
    return j < loc.k ? 1 : j === loc.k ? loc.f : 0;
  }

  function ambient(p, n) {
    var loc = locate(p, n);
    if (loc.k >= n - 1) return { k: loc.k, mix: 0, glow: 0 };
    return { k: loc.k, mix: smootherstep((loc.f - 0.15) / 0.7), glow: Math.sin(Math.PI * loc.f) };
  }

  function springStep(s, target, dt, omega) {
    var w = omega || OMEGA_TRACK;
    dt = clamp(dt, 0, 0.064);
    var steps = Math.max(1, Math.ceil(dt / SUBSTEP)), h = dt / steps;
    for (var j = 0; j < steps; j++) {
      var a = -w * w * (s.p - target) - 2 * w * s.v;
      s.v = clamp(s.v + a * h, -VMAX, VMAX);
      s.p += s.v * h;
    }
    if (Math.abs(s.p - target) < SETTLE_P && Math.abs(s.v) < SETTLE_V) {
      s.p = target; s.v = 0;
      return true;
    }
    return false;
  }

  function settleTarget(p, n, dir) {
    var loc = locate(p, n);
    if (loc.k >= n - 1 || loc.f < ON_CARD || loc.f > 1 - ON_CARD) return null;
    return loc.f >= (dir > 0 ? COMMIT : 1 - COMMIT) ? loc.k + 1 : loc.k;
  }

  function stepTarget(p, n, dir) {
    var loc = locate(p, n);
    var on = loc.k >= n - 1 ? n - 1
      : loc.f < ON_CARD ? loc.k
      : loc.f > 1 - ON_CARD ? loc.k + 1
      : -1;
    var to = on >= 0 ? on + dir : dir > 0 ? loc.k + 1 : loc.k;
    return to < 0 || to > n - 1 ? null : to;
  }

  function arriveTarget(p, n, dir) {
    var to = settleTarget(p, n, dir);
    return to === null ? displayed(p, n) : to;
  }

  return {
    pose: pose,
    transformOf: transformOf,
    shadowTransformOf: shadowTransformOf,
    mediaTransformOf: mediaTransformOf,
    recoil: recoil,
    displayed: displayed,
    fill: fill,
    ambient: ambient,
    springStep: springStep,
    settleTarget: settleTarget,
    stepTarget: stepTarget,
    arriveTarget: arriveTarget,
    locate: locate,
    APEX: APEX,
    CLEAR: CLEAR,
    OMEGA_TRACK: OMEGA_TRACK,
    OMEGA_SETTLE: OMEGA_SETTLE,
    VMAX: VMAX
  };
});
