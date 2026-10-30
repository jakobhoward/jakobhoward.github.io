

(function() {
  'use strict';

  var COARSE = window.matchMedia('(hover: none), (pointer: coarse)');

  var cards = [].slice.call(document.querySelectorAll('.project-card'));
  if (!cards.length) return;

  var current = null;

  function clear() {
    if (current) current.classList.remove('is-revealed');
    current = null;
  }

  function reveal(card) {
    if (current === card) return;
    clear();
    card.classList.add('is-revealed');

    if (window.cardMetricCount) window.cardMetricCount.countCard(card);
    current = card;
  }

  function linkFor(target) {
    return target.closest ? target.closest('.project-card .card-link') : null;
  }

  var TAP_SLOP_PX = 12;
  var startX = 0, startY = 0, isTap = false;

  document.addEventListener('touchstart', function(e) {
    isTap = COARSE.matches && e.touches.length === 1;
    if (!isTap) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!isTap) return;
    var t = e.touches[0];
    if (Math.abs(t.clientX - startX) > TAP_SLOP_PX ||
        Math.abs(t.clientY - startY) > TAP_SLOP_PX) isTap = false;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!isTap) return;
    var link = linkFor(e.target);
    if (!link) { clear(); return; }
    var card = link.closest('.project-card');
    if (card === current) return;
    e.preventDefault();
    reveal(card);
  }, { passive: false });

  document.addEventListener('click', function(e) {
    if (!COARSE.matches) return;

    if (e.detail === 0) return;
    var link = linkFor(e.target);
    if (!link) {
      clear();
      return;
    }
    var card = link.closest('.project-card');
    if (card === current) return;
    e.preventDefault();
    reveal(card);
  });
})();
