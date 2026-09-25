

(function() {
  'use strict';

  var PF = window.ProjectFilters;
  if (!PF) return;

  var grid = document.querySelector('.projects-grid');
  if (!grid) return;

  var timers = new WeakMap();
  var settleTimer = null;

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function visibleCards() {
    return Array.prototype.filter.call(grid.querySelectorAll('.project-card'), function(c) {
      return c.style.display !== 'none';
    });
  }

  function capture() {
    var rects = new Map();
    visibleCards().forEach(function(c) {
      rects.set(c, c.getBoundingClientRect());
    });
    return rects;
  }

  function play(before) {
    var cards = visibleCards();

    grid.setAttribute('data-flip-active', '');
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(function() {
      grid.removeAttribute('data-flip-active');
      settleTimer = null;
    }, 400);

    cards.forEach(function(c) {
      if (timers.has(c)) { clearTimeout(timers.get(c)); timers.delete(c); }
      c.style.transition = 'none';
      c.style.transform = '';
    });
    var resting = cards.map(function(c) { return c.getBoundingClientRect(); });

    cards.forEach(function(c, i) {
      var old = before.get(c);
      if (!old) {
        c.style.opacity = '0';
      } else {
        var dx = old.left - resting[i].left;
        var dy = old.top - resting[i].top;
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
          c.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        }
      }
    });
    void grid.offsetWidth;

    cards.forEach(function(c) {
      c.style.transition = 'transform 0.32s ease, opacity 0.28s ease 0.06s';
      c.style.transform = '';
      c.style.opacity = '';
      timers.set(c, setTimeout(function() {
        c.style.transition = '';
        timers.delete(c);
      }, 400));
    });
  }

  PF.MUTATORS.forEach(function(m) {
    var orig = PF[m];
    PF[m] = function() {
      if (reducedMotion()) return orig.apply(PF, arguments);
      var before = capture();
      var out = orig.apply(PF, arguments);
      play(before);
      return out;
    };
  });
})();
