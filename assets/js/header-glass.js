

(function () {
  'use strict';

  var header = document.querySelector('.site-header');
  if (!header) return;

  var REST_RGB = [36, 36, 66];
  var PEAK_RGB = [20, 20, 38];
  var REST_ALPHA = 0.72;
  var PEAK_ALPHA = 0.92;

  var SAMPLES = 9;
  var PROFILE_W = 8;
  var PROFILE_H = 32;

  var EPSILON = 0.02;

  var MIN_GAP_MS = 120;

  var profiles = new WeakMap();
  var pending = false;
  var lastApply = 0;
  var lastLum = -1;

  function log() {
    if (window.debug && window.debug.flag('header-glass')) {
      window.debug.log.apply(window.debug, ['header-glass'].concat([].slice.call(arguments)));
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function relLuminance(r, g, b) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function profileFor(img) {
    if (profiles.has(img)) return profiles.get(img);
    if (!img.complete || !img.naturalWidth) return null;
    var rows = null;
    try {
      var c = document.createElement('canvas');
      c.width = PROFILE_W;
      c.height = PROFILE_H;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, PROFILE_W, PROFILE_H);
      var d = ctx.getImageData(0, 0, PROFILE_W, PROFILE_H).data;
      rows = new Array(PROFILE_H);
      for (var y = 0; y < PROFILE_H; y++) {
        var sum = 0;
        for (var x = 0; x < PROFILE_W; x++) {
          var i = (y * PROFILE_W + x) * 4;
          sum += relLuminance(d[i], d[i + 1], d[i + 2]);
        }
        rows[y] = sum / PROFILE_W;
      }
    } catch (e) {
      rows = null;
    }
    profiles.set(img, rows);
    return rows;
  }

  function imageLuminanceAt(img, y) {
    var rows = profileFor(img);
    if (!rows) return null;
    var r = img.getBoundingClientRect();
    if (r.height <= 0) return null;
    var frac = clamp((y - r.top) / r.height, 0, 0.999);
    return rows[Math.floor(frac * PROFILE_H)];
  }

  function backgroundColor(el) {
    var bg = getComputedStyle(el).backgroundColor;
    if (!bg) return null;
    var m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(parseFloat);
    var alpha = p.length > 3 ? p[3] : 1;
    if (!alpha) return null;
    return [relLuminance(p[0], p[1], p[2]), alpha];
  }

  function effectiveOpacity(el, memo) {
    var chain = [];
    var node = el;
    var acc = 1;
    while (node && node !== document.documentElement) {
      if (memo.has(node)) { acc = memo.get(node); break; }
      chain.push(node);
      node = node.parentElement;
    }
    for (var i = chain.length - 1; i >= 0; i--) {
      var own = parseFloat(getComputedStyle(chain[i]).opacity);
      acc *= isNaN(own) ? 1 : own;
      memo.set(chain[i], acc);
    }
    return acc;
  }

  function luminanceAt(x, y, memo) {
    var stack = document.elementsFromPoint(x, y);
    var acc = 0;
    var remaining = 1;

    for (var i = 0; i < stack.length && remaining > 0.01; i++) {
      var el = stack[i];
      if (el === header || header.contains(el)) continue;

      var op = effectiveOpacity(el, memo);
      if (op <= 0) continue;

      var lum, alpha;
      if (el.tagName === 'IMG') {
        lum = imageLuminanceAt(el, y);
        if (lum === null) continue;
        alpha = op;
      } else {
        var bg = backgroundColor(el);
        if (!bg) continue;
        lum = bg[0];
        alpha = bg[1] * op;
      }
      if (alpha <= 0) continue;

      acc += lum * alpha * remaining;
      remaining *= (1 - alpha);
    }

    if (remaining >= 1) return null;
    return acc / (1 - remaining);
  }

  function apply() {
    pending = false;
    lastApply = performance.now();
    var rect = header.getBoundingClientRect();
    if (rect.height <= 0) return;

    var y = rect.top + rect.height / 2;
    var width = window.innerWidth;
    var total = 0;
    var hits = 0;
    var memo = new Map();

    for (var i = 0; i < SAMPLES; i++) {

      var x = ((i + 0.5) / SAMPLES) * width;
      var lum = luminanceAt(x, y, memo);
      if (lum !== null) { total += lum; hits++; }
    }

    if (!hits) {
      log('no samples resolved — keeping CSS resting fill');
      return;
    }

    var mean = total / hits;
    if (lastLum >= 0 && Math.abs(mean - lastLum) < EPSILON) return;
    lastLum = mean;

    var t = clamp(mean, 0, 1);
    var rgb = REST_RGB.map(function (c, n) {
      return Math.round(c + (PEAK_RGB[n] - c) * t);
    });
    var alpha = (REST_ALPHA + (PEAK_ALPHA - REST_ALPHA) * t).toFixed(3);

    header.style.setProperty(
      '--header-fill',
      'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')'
    );
    log('luminance', mean.toFixed(3), '→ fill alpha', alpha, 'from', hits, 'samples');
  }

  function schedule() {
    if (pending) return;
    pending = true;
    var wait = MIN_GAP_MS - (performance.now() - lastApply);
    if (wait <= 0) requestAnimationFrame(apply);
    else setTimeout(function () { requestAnimationFrame(apply); }, wait);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  window.addEventListener('load', schedule);

  schedule();
})();
