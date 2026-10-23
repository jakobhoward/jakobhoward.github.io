

(function (root, factory) {
  var api = factory(root ? root.WalkthroughShared : require('../walkthrough-shared.js'));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) (root.KeyResultsEntrance = root.KeyResultsEntrance || {}).scrubbed = api;
})(typeof window !== 'undefined' ? window : null, function (WS) {
  'use strict';
  var clamp = WS.clamp, smoothStep = WS.smoothStep;

  var DRIFT_END_VH = 0.28;
  var PIN_START_VH = 0.5;
  var A_DRIFT = 0.32;

  function restTop(g) { return g.slotTop; }
  function pinStart(g) { return g.vh * PIN_START_VH; }

  function at(s, g) {
    var driftEnd = g.vh * DRIFT_END_VH, pinAt = g.vh * PIN_START_VH;
    if (s < driftEnd) {

      var a = clamp(s / driftEnd, 0, 1);
      return {
        top: g.slotTop - s * A_DRIFT,
        opacity: 0.85 + a * 0.05,
        gridScale: 1 + a * 0.06 * g.gridScaleK,
        headScale: 1 + a * 0.03,
        headingOpacity: 0
      };
    }

    var phaseAEndTop = g.slotTop - driftEnd * A_DRIFT;
    var ease = smoothStep(clamp((s - driftEnd) / (pinAt - driftEnd), 0, 1));
    return {
      top: phaseAEndTop + (g.centeredTop - phaseAEndTop) * ease,
      opacity: 0.9 + ease * 0.1,

      gridScale: 1 + (0.06 + ease * 0.06) * g.gridScaleK,
      headScale: 1.03 + ease * 0.03,
      headingOpacity: g.hiddenHeadingRest ? clamp((ease - 0.65) / 0.35, 0, 1) * 0.5 : 0
    };
  }

  return { restTop: restTop, pinStart: pinStart, at: at };
});
