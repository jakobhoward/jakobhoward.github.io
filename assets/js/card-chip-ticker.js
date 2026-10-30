

(function() {
  'use strict';

  var SPEED = 36;
  var BEAT_MS = 150;
  var SLACK = 1;

  var rows = document.querySelectorAll('.project-card .overlay-types');
  if (!rows.length) return;

  var FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)');
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  var byCard = new WeakMap();
  var measures = [];

  function focusVisible(el) {
    try { return el.matches(':focus-visible'); } catch (e) { return false; }
  }

  function bind(row) {
    var card = row.closest('.project-card');
    var track = row.querySelector('.overlay-types-track');
    var chips = track ? [].slice.call(track.children) : [];
    if (!card || !chips.length) return;

    var laps = [];
    var hovered = false, focused = false, counting = false, shown = false;
    var readyAt = 0;
    var timer = null;

    function dropLaps() {
      laps.forEach(function(node) { track.removeChild(node); });
      laps = [];
    }

    function addLap() {
      var mark = document.createElement('span');
      mark.className = 'overlay-types-loop';
      track.appendChild(mark);
      laps.push(mark);
      chips.forEach(function(chip) {
        var copy = chip.cloneNode(true);
        copy.setAttribute('data-ticker-copy', '');
        track.appendChild(copy);
        laps.push(copy);
      });
    }

    function measure() {
      var width = row.clientWidth;
      if (!width) return;
      var cs = getComputedStyle(row);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var room = width - padL - (parseFloat(cs.paddingRight) || 0);
      var first = chips[0], last = chips[chips.length - 1];
      var set = last.offsetLeft + last.offsetWidth - first.offsetLeft;

      if (REDUCED.matches || set <= room + SLACK) {
        dropLaps();
        row.classList.remove('is-ticker');
        update();
        return;
      }

      if (!laps.length) addLap();
      var perLap = chips.length + 1;
      var lap = laps[1].offsetLeft - first.offsetLeft;
      var need = Math.max(1, Math.ceil((width - padL - set + 2) / lap + 1));
      while (laps.length < need * perLap) addLap();
      while (laps.length > need * perLap) track.removeChild(laps.pop());

      row.style.setProperty('--ticker-shift', -lap + 'px');
      row.style.setProperty('--ticker-duration', (lap / SPEED).toFixed(2) + 's');
      row.classList.add('is-ticker');
      update();
    }

    function update() {
      clearTimeout(timer);
      timer = null;
      var run = shown && !counting && row.classList.contains('is-ticker');
      if (run) {
        var wait = readyAt - performance.now();
        if (wait > 0) {
          timer = setTimeout(update, wait);
          run = false;
        }
      }
      row.classList.toggle('is-ticking', run);
    }

    function sync() {
      var now = hovered || focused || card.classList.contains('is-revealed');
      if (now && !shown) {
        shown = true;
        clearTimeout(timer);
        timer = setTimeout(update, 0);
        return;
      }
      shown = now;
      update();
    }

    card.addEventListener('mouseenter', function() {
      if (!FINE_POINTER.matches) return;
      hovered = true;
      sync();
    });
    card.addEventListener('mouseleave', function() {
      hovered = false;
      sync();
    });
    card.addEventListener('focusin', function(e) {
      focused = focusVisible(e.target);
      sync();
    });
    card.addEventListener('focusout', function() {
      focused = false;
      sync();
    });
    card.addEventListener('cardcount:start', function() {
      counting = true;
      update();
    });
    card.addEventListener('cardcount:end', function() {
      counting = false;
      readyAt = performance.now() + BEAT_MS;
      update();
    });

    byCard.set(card, sync);
    measures.push(measure);
    if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(row);
    measure();
  }

  Array.prototype.forEach.call(rows, bind);

  function measureAll() { measures.forEach(function(m) { m(); }); }

  if (typeof MutationObserver === 'function') {
    var observer = new MutationObserver(function(records) {
      records.forEach(function(r) {
        var sync = byCard.get(r.target);
        if (sync) sync();
      });
    });
    Array.prototype.forEach.call(rows, function(row) {
      var card = row.closest('.project-card');
      if (card) observer.observe(card, { attributes: true, attributeFilter: ['class'] });
    });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
  if (REDUCED.addEventListener) REDUCED.addEventListener('change', measureAll);
})();
