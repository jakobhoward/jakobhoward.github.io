

(function () {
  'use strict';

  var TARGETS = [
    ['floor',   '.hero-metrics-floor',                              'yko'],
    ['grid',    '.hero-metrics-floor .metrics-grid',                'yk'],
    ['head',    '.hero-metrics-floor .metrics-heading-group',       'k'],
    ['value',   '.hero-metrics-floor .metric-value',                'o'],
    ['label',   '.hero-metrics-floor .metric-label',                'a'],
    ['heading', '.hero-metrics-floor .metrics-heading',             'a'],
    ['title',   '.hero-scrolly .scrolly-step[data-step="hero"] > .container', 'o'],
    ['overlay', '.hero-scrolly .scrolly-scene[data-scene="1"] .scrolly-overlay', 'o'],
    ['blend',   '.hero-scrolly .scrolly-bg-blend',                  'o'],
    ['bg',      '.hero-scrolly .scrolly-scene[data-scene="1"] .scrolly-bg', 'k'],
    ['crop',    '.hero-scrolly .scrolly-bg img.focal-crop',         'y']
  ];
  var els = {};

  function transformOf(cs) {
    var t = cs.transform;
    if (!t || t === 'none') return [1, 0];
    var n = t.slice(t.indexOf('(') + 1, -1).split(',').map(parseFloat);
    return n.length === 16 ? [n[0], n[13]] : [n[0], n[5]];
  }

  function alphaOf(cs) {
    var n = cs.color.replace(/[^\d.,-]/g, '').split(',');
    return n.length >= 4 ? parseFloat(n[3]) : 1;
  }
  var round = function (v, d) { return Math.round(v * d) / d; };

  function sample() {
    if (!document.querySelector('.hero-scrolly')) return null;
    var out = {};
    for (var i = 0; i < TARGETS.length; i++) {
      var name = TARGETS[i][0], fields = TARGETS[i][2];

      var el = els[name] || (els[name] = document.querySelector(TARGETS[i][1]));
      if (!el) continue;
      var cs = getComputedStyle(el), tf = null, row = [];
      for (var f = 0; f < fields.length; f++) {
        switch (fields[f]) {
          case 'y': tf = tf || transformOf(cs); row.push(round(tf[1], 10)); break;
          case 'k': tf = tf || transformOf(cs); row.push(round(tf[0], 10000)); break;
          case 'o': row.push(round(parseFloat(cs.opacity), 1000)); break;
          case 'a': row.push(round(alphaOf(cs), 1000)); break;
        }
      }
      out[name] = row;
    }
    return out;
  }

  if (typeof window !== 'undefined') window.HeroTrace = { sample: sample, TARGETS: TARGETS };

  if (typeof module !== 'undefined' && module.exports) module.exports = { TARGETS: TARGETS };
})();
