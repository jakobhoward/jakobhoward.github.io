

(function() {
  'use strict';

  var WS = window.WalkthroughShared;
  var debugLog = (WS && WS.debugLog) || function() {};

  function hud() { return window.debug && window.debug.metrics('scroll-hud'); }
  function hudNote(text) { var m = hud(); if (m) m.note(text); }

  document.addEventListener('DOMContentLoaded', function() {
    if (!('IntersectionObserver' in window)) return;
    var motionOK = document.documentElement.classList.contains('js-motion');

    document.querySelectorAll('.plsb-stage').forEach(function(stage) {
      var strip = stage.querySelector('.plsb');
      if (!strip || strip.querySelectorAll('.plsb-panel').length < 2) return;
      var runway = stage.closest('.plsb-runway');
      if (!runway) return;
      var pinQuery = window.matchMedia('(min-width: 1024px) and (min-height: 700px)');

      function fitBand() {
        var cs = getComputedStyle(document.documentElement);
        var small = WS ? WS.viewport.small() : window.innerHeight;
        return small - (parseFloat(cs.getPropertyValue('--header-height')) || 0) -
          (parseFloat(cs.getPropertyValue('--hud-bar-height')) || 0) - 8;
      }

      function applyPin() {

        runway.classList.remove('plsb-runway--tight');
        var band = fitBand(), stageH = stage.offsetHeight, tight = false;
        var want = motionOK && (pinQuery.matches || stageH <= band);
        if (motionOK && !want) {
          runway.classList.add('plsb-runway--tight');
          var tightH = stage.offsetHeight;
          tight = tightH <= band + 8;
          if (tight) { want = true; stageH = tightH; band += 8; }
        }
        runway.classList.toggle('plsb-runway--tight', tight);
        runway.classList.toggle('plsb-runway--pin', want);
        debugLog('plsb-carousel', 'pinned linger', want ? (tight ? 'on (tight)' : 'on') : 'off');
        var m = hud();
        if (m) m.set('board', Math.round(stageH) + ' / ' + Math.round(band) + 'px ' + (want ? (tight ? 'pin tight' : 'pin') : 'flow'));
      }

      if (pinQuery.addEventListener) pinQuery.addEventListener('change', applyPin);
      else if (pinQuery.addListener) pinQuery.addListener(applyPin);

      if (WS) WS.viewport.onChange(applyPin);
      window.addEventListener('load', applyPin);
      applyPin();

      if (WS && window.StoryboardCatch) {
        window.StoryboardCatch.create({
          runway: runway, stage: stage, viewport: WS.viewport, note: hudNote,
          pinned: function() { return runway.classList.contains('plsb-runway--pin'); }
        });
      }
    });
  });
})();
