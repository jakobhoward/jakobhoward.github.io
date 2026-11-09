

(function (root, factory) {
  var scrubbed = root ? (root.KeyResultsEntrance || {}).scrubbed : require('./key-results-entrance-scrubbed.js');
  if (!scrubbed) throw new Error('KeyResultsEntrance.native: motion/key-results-entrance-scrubbed.js must load first (its growth curve is composed here)');
  var api = factory(root ? root.WalkthroughShared : require('../walkthrough-shared.js'), scrubbed);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) (root.KeyResultsEntrance = root.KeyResultsEntrance || {}).native = api;
})(typeof window !== 'undefined' ? window : null, function (WS, scrubbed) {
  'use strict';
  var clamp = WS.clamp;

  var SETTLE_PX = 64;

  function restTop(g) { return Math.min(g.centeredTop, g.slotTop); }
  function ride(g) { return g.slotTop - restTop(g); }
  function settle(g) { return Math.min(SETTLE_PX, ride(g) / 2); }
  function pinStart(g) { return ride(g) + settle(g); }

  function arrivalTop(s, g) {
    var m = settle(g), r = ride(g);
    if (m <= 0 || s <= r - m) return g.slotTop - s;
    var u = clamp((s - (r - m)) / (2 * m), 0, 1);
    return g.slotTop - (r - m) - 2 * m * (u - u * u * u + u * u * u * u / 2);
  }

  function at(s, g) {

    var a = clamp(s / Math.max(pinStart(g), 1), 0, 1);

    var climb = scrubbed.at(a * scrubbed.pinStart(g), g);
    return {
      top: arrivalTop(s, g),

      opacity: 0.85 + a * 0.15,
      gridScale: climb.gridScale,
      headScale: climb.headScale,

      headingOpacity: g.hiddenHeadingRest ? clamp((a - 0.65) / 0.35, 0, 1) * 0.5 : 0
    };
  }

  return { restTop: restTop, pinStart: pinStart, at: at };
});
