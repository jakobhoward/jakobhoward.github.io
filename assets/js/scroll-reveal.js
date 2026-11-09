

(function () {
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js-reveal');

  var DURATION = 600;
  var STAGGER = 70;

  document.querySelectorAll('[data-reveal-stagger]').forEach(function (parent) {
    Array.prototype.forEach.call(parent.children, function (child, i) {
      child.style.setProperty('--reveal-i', i);
    });
  });

  function settle(el) {
    var isStagger = el.hasAttribute('data-reveal-stagger');
    var wait = DURATION + 100 + (isStagger ? STAGGER * el.children.length : 0);
    setTimeout(function () {
      el.removeAttribute('data-reveal');
      el.removeAttribute('data-reveal-stagger');
      Array.prototype.forEach.call(el.children, function (child) {
        child.style.removeProperty('--reveal-i');
      });
    }, wait);
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
        settle(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach(function (el) {
    observer.observe(el);
  });
})();
