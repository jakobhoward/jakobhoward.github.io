

(function () {
  'use strict';

  var GAP = 8;
  var EDGE = 12;
  var LEAVE_MS = 120;

  var tips = [];
  var current = null;
  var frame = 0;

  function log(msg, data) {
    if (window.debug && window.debug.flag('term-tips')) window.debug.log('term-tips', msg, data || '');
  }

  [].forEach.call(document.querySelectorAll('.term-trigger'), bind);
  if (!tips.length) return;

  document.addEventListener('pointerdown', function (e) {
    if (current && !current.trigger.contains(e.target) && !current.tip.contains(e.target)) close(current);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) {
      current.dismissed = true;
      close(current);
    }
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.WalkthroughShared.viewport.onChange(schedule);

  function bind(trigger) {
    var tip = document.getElementById(trigger.getAttribute('aria-describedby'));
    if (!tip) return;
    var t = { trigger: trigger, tip: tip, pinned: false, hovered: false, focused: false, dismissed: false, timer: 0 };
    tips.push(t);
    document.body.appendChild(tip);
    tip.classList.add('is-placed');

    function hover(on) {
      clearTimeout(t.timer);
      if (on) { t.hovered = true; update(t); return; }
      t.timer = setTimeout(function () { t.hovered = false; t.dismissed = false; update(t); }, LEAVE_MS);
    }
    function mouse(fn) {
      return function (e) { if (e.pointerType === 'mouse') fn(e); };
    }

    trigger.addEventListener('pointerenter', mouse(function () { hover(true); }));
    trigger.addEventListener('pointerleave', mouse(function () { hover(false); }));
    tip.addEventListener('pointerenter', mouse(function () { hover(true); }));
    tip.addEventListener('pointerleave', mouse(function () { hover(false); }));

    trigger.addEventListener('focus', function () {
      if (!trigger.matches(':focus-visible')) return;
      t.focused = true;
      update(t);
    });
    trigger.addEventListener('blur', function () {
      t.focused = false;
      t.pinned = false;
      t.dismissed = false;
      update(t);
    });
    trigger.addEventListener('click', function () {
      t.pinned = !(t.pinned && isOpen(t));
      t.dismissed = false;
      update(t);
    });
  }

  function isOpen(t) {
    return !t.dismissed && (t.pinned || t.hovered || t.focused);
  }

  function update(t) {
    var open = isOpen(t);
    if (open && current && current !== t) close(current);
    t.tip.classList.toggle('is-open', open);
    t.trigger.classList.toggle('is-active', open);
    if (open) {
      current = t;
      place(t);
    } else if (current === t) {
      current = null;
    }
    log(open ? 'open' : 'close', t.trigger.textContent);
  }

  function close(t) {
    t.pinned = t.hovered = t.focused = false;
    clearTimeout(t.timer);
    update(t);
  }

  function schedule() {
    if (!current || frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      if (current) place(current);
    });
  }

  function place(t) {
    var word = t.trigger.getBoundingClientRect();
    var tip = t.tip;
    var vw = document.documentElement.clientWidth;
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var center = word.left + word.width / 2;
    var left = Math.max(EDGE, Math.min(center - w / 2, vw - EDGE - w));
    var below = word.top - GAP - h < window.WalkthroughShared.chromeOffset() + GAP;
    var top = below ? word.bottom + GAP : word.top - GAP - h;
    tip.classList.toggle('is-below', below);
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.style.setProperty('--term-arrow-x', Math.round(center - left) + 'px');
  }
})();
