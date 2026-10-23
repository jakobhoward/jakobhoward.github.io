

(function () {
  'use strict';
  var SLACK = 6;

  function bind(row) {
    function paint() {
      var more = row.scrollWidth - row.clientWidth;
      row.classList.toggle('is-more-left', row.scrollLeft > SLACK);
      row.classList.toggle('is-more-right', more - row.scrollLeft > SLACK);
    }

    var onScroll = window.WalkthroughShared.rafThrottle(paint);
    row.addEventListener('scroll', onScroll, { passive: true });
    window.WalkthroughShared.viewport.onChange(onScroll);
    if (typeof ResizeObserver === 'function') new ResizeObserver(onScroll).observe(row);
    paint();
  }

  function init() {
    var rows = document.querySelectorAll('.info-card-deliverables');
    for (var i = 0; i < rows.length; i++) bind(rows[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
