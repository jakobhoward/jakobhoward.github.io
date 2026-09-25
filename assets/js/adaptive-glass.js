

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before adaptive-glass.js');
  }
  var WS = window.WalkthroughShared;
  var clamp = WS.clamp, debounce = WS.debounce;

  function imageLuminance(img) {
    try {
      var c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 48, 48);
      var d = ctx.getImageData(0, 0, 48, 48).data, sum = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 24) continue;
        sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        n++;
      }
      return n ? sum / n : null;
    } catch (e) { return null; }
  }

  function initGlassCards() {
    var cards = document.querySelectorAll('.project-info-card');
    if (!cards.length) return;
    var bg = document.getElementById('glass-source-hero');
    if (!bg) return;

    function bgLuminanceBehind(card) {
      if (!bg.naturalWidth) return null;
      var ir = bg.getBoundingClientRect();
      if (ir.width <= 0 || ir.height <= 0) return null;
      var cr = card.getBoundingClientRect();
      var sx = bg.naturalWidth / ir.width, sy = bg.naturalHeight / ir.height;
      var x = clamp((cr.left - ir.left) * sx, 0, bg.naturalWidth - 1);
      var y = clamp((cr.top - ir.top) * sy, 0, bg.naturalHeight - 1);
      var w = clamp(cr.width * sx, 1, bg.naturalWidth - x);
      var h = clamp(cr.height * sy, 1, bg.naturalHeight - y);
      try {
        var c = document.createElement('canvas');
        c.width = 20; c.height = 20;
        var ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bg, x, y, w, h, 0, 0, 20, 20);
        var d = ctx.getImageData(0, 0, 20, 20).data, sum = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
        return n ? sum / n : null;
      } catch (e) { return null; }
    }

    function apply() {
      cards.forEach(function(card) {
        var lum = bgLuminanceBehind(card);
        if (lum == null) return;

        var op = (0.52 + clamp(lum, 0, 1) * 0.28).toFixed(2);
        card.style.setProperty('--card-fill', 'rgba(6,8,18,' + op + ')');
      });
    }

    if (bg.complete && bg.naturalWidth) apply();
    else bg.addEventListener('load', apply);
    window.addEventListener('resize', debounce(apply, 200));
  }

  function initLogoChips() {
    var chips = document.querySelectorAll('.logo-chip');
    if (!chips.length) return;

    function tint(chip, img) {

      var tone = chip.getAttribute('data-chip-tone');
      var lum = tone === 'light' ? 0.05 : tone === 'dark' ? 0.95 : imageLuminance(img);
      if (lum == null) return;
      var L = 1 - lum;
      var grey = Math.round((0.12 + 0.74 * L) * 255);
      chip.style.setProperty('--chip-bg', 'rgba(' + grey + ',' + grey + ',' + grey + ',' + (0.42 + 0.2 * L).toFixed(2) + ')');
      chip.style.setProperty('--chip-border', 'rgba(255,255,255,' + (0.12 + 0.4 * L).toFixed(2) + ')');
      chip.style.setProperty('--chip-sheen', 'rgba(255,255,255,' + (0.15 + 0.45 * L).toFixed(2) + ')');

      chip.style.setProperty('--chip-fg', L > 0.5 ? 'rgba(22,24,38,0.7)' : 'rgba(255,255,255,0.82)');
    }

    chips.forEach(function(chip) {
      var img = chip.querySelector('img');
      if (!img) return;
      if (img.complete && img.naturalWidth) tint(chip, img);
      else img.addEventListener('load', function() { tint(chip, img); });
    });
  }

  function init() {
    initGlassCards();
    initLogoChips();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
