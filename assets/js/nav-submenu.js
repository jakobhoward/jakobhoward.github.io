

(function() {
  'use strict';

  var items = document.querySelectorAll('.nav-item');
  if (!items.length) return;

  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  Array.prototype.forEach.call(items, function(item) {
    var toggle = item.querySelector('.nav-disclosure');
    var submenu = item.querySelector('.nav-submenu');
    if (!toggle || !submenu) return;

    function isOpen() {
      if (item.classList.contains('is-dismissed')) return false;
      return item.classList.contains('is-open') ||
        (canHover && item.matches(':hover')) ||
        item.contains(document.activeElement);
    }

    function sync() {
      toggle.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
    }

    function dismiss() {
      item.classList.add('is-dismissed');
      item.classList.remove('is-open');
      sync();
    }

    function reset() {
      item.classList.remove('is-dismissed');
      item.classList.remove('is-open');
      sync();
    }

    toggle.addEventListener('click', function() {
      if (isOpen()) {
        dismiss();
      } else {
        item.classList.remove('is-dismissed');
        item.classList.add('is-open');
        sync();
      }
    });

    item.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape' || !isOpen()) return;
      dismiss();

      toggle.focus();
    });

    if (canHover) {

      item.addEventListener('pointerenter', function() {
        item.classList.remove('is-dismissed');
        sync();
      });

      item.addEventListener('pointerleave', reset);
    }

    item.addEventListener('focusin', sync);

    item.addEventListener('focusout', function() {
      requestAnimationFrame(function() {
        if (item.contains(document.activeElement)) sync();
        else reset();
      });
    });

    submenu.addEventListener('click', reset);

    document.addEventListener('pointerdown', function(e) {
      if (!item.contains(e.target)) reset();
    });
  });
})();
