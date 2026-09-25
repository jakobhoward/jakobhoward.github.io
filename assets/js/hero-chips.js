

(function () {
  'use strict';
  var SLACK = 6;

  function bind(row) {
    var ticking = false;
    function paint() {
      ticking = false;
      var more = row.scrollWidth - row.clientWidth;
      row.classList.toggle('is-more-left', row.scrollLeft > SLACK);
      row.classList.toggle('is-more-right', more - row.scrollLeft > SLACK);
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }
    row.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
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
