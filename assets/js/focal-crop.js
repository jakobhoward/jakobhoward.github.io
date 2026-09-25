

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before focal-crop.js');
  }
  var WS = window.WalkthroughShared;
  var clamp = WS.clamp, easeOutCubic = WS.easeOutCubic;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initFocalCrop() {
    var scene = document.querySelector('.scrolly-scene[data-scene="1"]');
    var bg = scene && scene.querySelector('.scrolly-bg');
    var img = bg && bg.querySelector('img[data-focal-y]');
    if (!img) return;

    var hero = document.querySelector('.hero-scrolly');
    var focalY = parseFloat(img.dataset.focalY);
    var pan = parseFloat(img.dataset.pan);
    var panning = pan > 0 && !reducedMotion;
    var headroom = 0, baseTop = 0;

    function applyTop() {
      if (!panning || !hero || headroom <= 0) return;

      var t = clamp(-hero.getBoundingClientRect().top / window.innerHeight, 0, 1);
      img.style.top = Math.round(baseTop - headroom * easeOutCubic(t)) + 'px';
    }

    function update() {
      var cW = bg.offsetWidth, cH = bg.offsetHeight;
      var iW = img.naturalWidth, iH = img.naturalHeight;
      if (!iW) return;

      var targetPx = cH * 0.55;
      var coverScale = Math.max(cW / iW, cH / iH);
      var minScale = (cH - targetPx) / (iH * (1 - focalY));
      var scale = Math.max(coverScale, Math.min(minScale, coverScale * 1.25));
      if (panning) scale *= (1 + pan);

      var w = Math.ceil(iW * scale), h = Math.ceil(iH * scale);
      var left = Math.round((cW - w) / 2);
      var top = Math.round(targetPx - focalY * h);
      top = Math.min(0, Math.max(cH - h, top));

      img.classList.add('focal-crop');
      img.style.width = w + 'px';
      img.style.height = h + 'px';
      img.style.left = left + 'px';
      img.style.top = top + 'px';

      baseTop = top;
      headroom = Math.max(0, h - cH + top);
      applyTop();
    }

    if (img.naturalWidth) update();
    else img.addEventListener('load', update);

    window.addEventListener('resize', WS.debounce(update, 150));

    if (panning) {
      window.addEventListener('scroll', WS.rafThrottle(applyTop), { passive: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFocalCrop);
  } else {
    initFocalCrop();
  }
})();
