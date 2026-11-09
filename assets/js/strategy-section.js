

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before strategy-section.js');
  }
  var WS = window.WalkthroughShared;
  var clamp = WS.clamp, easeOutCubic = WS.easeOutCubic;

  function initStrategySection() {
    var section = document.querySelector('.strategy-section');
    if (!section) return;
    var cards = section.querySelectorAll('.scrolly-card');
    if (!cards.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    function update() {
      var vh = window.innerHeight;
      cards.forEach(function(card) {
        var rect = card.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var t = clamp((vh * 0.65 - center) / (vh * 0.25) + 1, 0, 1);
        var e = easeOutCubic(t);
        card.style.opacity = e;
        card.style.transform = 'translateY(' + ((1 - e) * 30) + 'px)';
      });
    }

    window.addEventListener('scroll', WS.rafThrottle(update), { passive: true });
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStrategySection);
  } else {
    initStrategySection();
  }
})();
