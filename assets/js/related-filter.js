

(function () {
  'use strict';

  function initRelatedFilter() {
    var filterBtns = document.querySelectorAll('.industry-filter-btn');
    var cards = document.querySelectorAll('.related-card');
    if (!filterBtns.length || !cards.length) return;
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var industry = btn.dataset.industry.toLowerCase().replace(/\s+/g, '-');
        filterBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        cards.forEach(function(card) {
          if (industry === 'all') { card.style.display = ''; return; }
          var ci = (card.dataset.industries || '').split(/\s+/).filter(Boolean);
          card.style.display = ci.includes(industry) ? '' : 'none';
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRelatedFilter);
  } else {
    initRelatedFilter();
  }
})();
