

(function() {
  'use strict';

  var PF = window.ProjectFilters;
  if (!PF) return;

  var cards = PF.cardData;

  function norm(v) {
    if (v == null || v === 'all') return [];
    return Array.isArray(v) ? v : [v];
  }

  function countFor(overrides) {
    var s = {
      types: PF.state.types,
      industries: PF.state.industries,
      query: PF.state.query
    };
    for (var k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) s[k] = overrides[k];
    }
    s.types = norm(s.types);
    s.industries = norm(s.industries);

    var n = 0;
    for (var i = 0; i < cards.length; i++) {
      if (PF.matches(cards[i], s)) n++;
    }
    return n;
  }

  var labelCache = null;
  function labels() {
    if (labelCache) return labelCache;
    labelCache = { types: {}, industries: {} };
    var el = document.getElementById('filter-options');
    var opts = {};
    if (el) {
      try { opts = JSON.parse(el.textContent) || {}; } catch (e) { opts = {}; }
    }
    Object.keys(labelCache).forEach(function(dim) {
      (opts[dim] || []).forEach(function(label) {
        labelCache[dim][String(label).toLowerCase().replace(/\s+/g, '-')] = label;
      });
    });
    return labelCache;
  }

  function items(dim) {
    var lbl = labels()[dim] || {};
    var tally = PF.counts[dim] || {};
    return Object.keys(tally).map(function(slug) {
      return { slug: slug, label: lbl[slug] || slug, count: tally[slug] };
    }).sort(function(a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
  }

  function labelFor(dim, slug) {
    if (!slug || slug === 'all') return null;
    return labels()[dim][slug] || slug;
  }

  var subscribers = [];

  PF.MUTATORS.forEach(function(m) {
    var orig = PF[m];
    PF[m] = function() {
      var out = orig.apply(PF, arguments);
      notify();
      return out;
    };
  });
  function notify() {
    var visible = countFor({});
    subscribers.forEach(function(fn) { fn(PF.state, visible); });
  }

  function subscribe(fn) {
    subscribers.push(fn);
    fn(PF.state, countFor({}));
  }

  function mountAboveGrid(className) {
    var grid = document.querySelector('.projects-grid');
    if (!grid || !grid.parentNode) return null;
    var el = document.createElement('div');
    if (className) el.className = className;
    grid.parentNode.insertBefore(el, grid);
    return el;
  }

  window.FilterModel = {
    PF: PF,
    total: PF.counts.total,
    items: items,
    labelFor: labelFor,
    countFor: countFor,
    visibleCount: function() { return countFor({}); },
    subscribe: subscribe,
    mountAboveGrid: mountAboveGrid
  };
})();
