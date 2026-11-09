

(function () {
  'use strict';

  function setupStaticWalkthrough(section) {
    var phoneScreen = section.querySelector('.wt-phone-screen');
    var content = section.querySelector('.wt-phone-scroll');
    var headingTitleEl = section.querySelector('.walkthrough-heading-title');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    function syncScrollRegion() {
      if (!phoneScreen) return;
      if (phoneScreen.scrollHeight > phoneScreen.clientHeight + 1) {
        phoneScreen.setAttribute('tabindex', '0');
        phoneScreen.setAttribute('role', 'region');
        phoneScreen.setAttribute('aria-label',
          (headingTitleEl ? headingTitleEl.textContent.trim() : 'Campaign page') + ' — scrollable capture');
      } else {
        phoneScreen.removeAttribute('tabindex');
        phoneScreen.removeAttribute('role');
        phoneScreen.removeAttribute('aria-label');
      }
    }
    syncScrollRegion();

    var videoObserver = null;
    var lazyVideos = (content || section).querySelectorAll('.wt-lazy-video');
    function pauseAll() {
      Array.prototype.forEach.call(lazyVideos, function(v) { v.pause(); });
    }
    function onReduceChange() { if (reduce.matches) pauseAll(); }
    if (lazyVideos.length && 'IntersectionObserver' in window) {
      videoObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (reduce.matches) return;

          if (entry.isIntersecting) entry.target.play().catch(function() {});
          else entry.target.pause();
        });
      }, { threshold: 0.1 });
      lazyVideos.forEach(function(v) { videoObserver.observe(v); });
      if (typeof reduce.addEventListener === 'function') {
        reduce.addEventListener('change', onReduceChange);
      }
    }

    function destroy() {
      if (videoObserver) videoObserver.disconnect();
      if (typeof reduce.removeEventListener === 'function') {
        reduce.removeEventListener('change', onReduceChange);
      }
      pauseAll();
      if (phoneScreen) {
        phoneScreen.removeAttribute('tabindex');
        phoneScreen.removeAttribute('role');
        phoneScreen.removeAttribute('aria-label');
      }
    }
    return { destroy: destroy, handleResize: syncScrollRegion };
  }

  window.WalkthroughStatic = { setup: setupStaticWalkthrough };
})();
