

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
    var pan = parseFloat(img.dataset.pan);
    var panning = pan > 0 && !reducedMotion;
    if (!panning || !hero) return;
    var headroom = 0;

    function applyPan() {
      if (headroom <= 0) return;

      var t = clamp(-hero.getBoundingClientRect().top / WS.stableViewportH(), 0, 1);
      img.style.transform = 'translate3d(0, ' + (-Math.round(headroom * easeOutCubic(t))) + 'px, 0)';
    }

    function update() {
      headroom = Math.max(0, img.offsetHeight - bg.offsetHeight + img.offsetTop);
      applyPan();
    }

    update();

    WS.viewport.onChange(update);
    window.addEventListener('scroll', WS.rafThrottle(applyPan), { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFocalCrop);
  } else {
    initFocalCrop();
  }
})();
