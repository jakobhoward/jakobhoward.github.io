

(function() {
  'use strict';

  const state = {
    types: [],
    industries: [],
    query: ''
  };

  const grid = document.querySelector('.projects-grid');
  const cards = Array.from(document.querySelectorAll('.project-card'));
  const noResults = document.querySelector('.no-results');
  const resetBtn = document.querySelector('.reset-filters-btn');

  if (!grid || cards.length === 0) return;

  const cardData = cards.map(card => ({
    el: card,
    types: (card.dataset.types || '').split(/\s+/).filter(Boolean),
    industries: (card.dataset.industries || '').split(/\s+/).filter(Boolean),
    search: (card.dataset.search || '').toLowerCase()
  }));

  const counts = { types: {}, industries: {}, total: cards.length };
  cardData.forEach(d => {
    d.types.forEach(t => { counts.types[t] = (counts.types[t] || 0) + 1; });
    d.industries.forEach(i => { counts.industries[i] = (counts.industries[i] || 0) + 1; });
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', function() { window.ProjectFilters.clear(); });
  }

  function queryTerms(q) {
    return String(q == null ? '' : q).trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matches(data, s) {
    if (s.types.length && !s.types.some(t => data.types.includes(t))) return false;
    if (s.industries.length && !s.industries.some(i => data.industries.includes(i))) return false;
    const terms = queryTerms(s.query);
    if (terms.length && !terms.every(t => data.search.includes(t))) return false;
    return true;
  }

  function applyFilters() {
    let visibleCount = 0;

    cardData.forEach(d => {
      const show = matches(d, state);
      d.el.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    if (noResults) {
      noResults.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    updateUrl();
  }

  function updateUrl() {

    const params = new URLSearchParams(window.location.search);
    ['type', 'industry', 'q'].forEach(k => params.delete(k));

    if (state.types.length) params.set('type', state.types.join(','));
    if (state.industries.length) params.set('industry', state.industries.join(','));
    if (state.query.trim()) params.set('q', state.query.trim());

    const qs = params.toString().replace(/%2C/g, ',');
    const url = (qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname) + window.location.hash;

    history.replaceState(null, '', url);
  }

  function readUrl() {
    const params = new URLSearchParams(window.location.search);

    const parseList = (raw, dim) => String(raw).split(',')
      .map(s => s.trim())
      .filter((s, i, a) => s && counts[dim][s] !== undefined && a.indexOf(s) === i);

    if (params.has('type')) state.types = parseList(params.get('type'), 'types');
    if (params.has('industry')) state.industries = parseList(params.get('industry'), 'industries');
    if (params.has('q')) state.query = String(params.get('q'));

    applyFilters();
  }

  readUrl();

  function slugify(v) {
    return (v === 'all' || !v) ? 'all' : String(v).toLowerCase().replace(/\s+/g, '-');
  }

  const MUTATORS = ['setFilter', 'toggleFilter', 'setQuery', 'clear', 'apply'];

  window.ProjectFilters = {
    state: state,
    counts: counts,
    cardData: cardData,
    matches: matches,
    MUTATORS: MUTATORS,

    setFilter: function(dim, value) {
      const v = slugify(value);
      state[dim] = v === 'all' ? [] : [v];
      applyFilters();
    },

    toggleFilter: function(dim, value) {
      const v = slugify(value);
      if (v === 'all') state[dim] = [];
      else if (state[dim].includes(v)) state[dim] = state[dim].filter(s => s !== v);
      else state[dim] = state[dim].concat(v);
      applyFilters();
    },

    setQuery: function(q) {
      state.query = q == null ? '' : String(q);
      applyFilters();
    },
    clear: function() {
      state.types = []; state.industries = []; state.query = '';
      applyFilters();
    },
    apply: applyFilters
  };

})();
