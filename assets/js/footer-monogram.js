

(function () {
  'use strict';

  var mark = document.querySelector('.footer-mark');
  if (!mark) return;

  var motion = document.documentElement.classList.contains('js-motion');
  if (!motion || !('IntersectionObserver' in window)) {
    mark.classList.add('is-drawn');
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    if (!entries.some(function (e) { return e.isIntersecting; })) return;
    io.disconnect();
    mark.classList.add('is-drawn');
  }, { threshold: 0.6 });

  io.observe(mark);
}());
