

(function() {
  'use strict';

  if (!window.debug || !window.debug._metrics) return;

  var HUD_HZ = 4;
  var stores = window.debug._metrics;
  var root = null;
  var sections = {};
  var last = 0;

  function build() {
    root = document.createElement('div');
    root.id = 'debug-perf-hud';
    var style = document.createElement('style');
    style.textContent = [
      '#debug-perf-hud {',
      '  position: fixed; top: 0; left: 0; z-index: 100000;',
      '  max-width: 62vw; padding: 5px 7px;',
      '  background: rgba(10,10,16,0.82); color: #d4d4d4;',
      '  font: 500 10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;',
      '  font-variant-numeric: tabular-nums;',
      '  border-bottom-right-radius: 6px;',
      '  pointer-events: none; white-space: pre;',
      '  will-change: transform;',
      '}',
      '#debug-perf-hud .hud-flag { color: #0ea5e9; font-weight: 700; }',
      '#debug-perf-hud .hud-k { color: #6b7280; }',
      '#debug-perf-hud .hud-v { color: #e5e7eb; }',
      '#debug-perf-hud .hud-note { color: #a3e635; }'
    ].join('\n');
    root.appendChild(style);
    document.body.appendChild(root);
  }

  function sectionFor(flag) {
    if (sections[flag]) return sections[flag];
    var wrap = document.createElement('div');
    var head = document.createElement('div');
    head.className = 'hud-flag';
    head.textContent = flag;
    var body = document.createElement('div');
    var notes = document.createElement('div');
    notes.className = 'hud-note';
    wrap.appendChild(head);
    wrap.appendChild(body);
    wrap.appendChild(notes);
    root.appendChild(wrap);
    return (sections[flag] = { body: body, notes: notes, rows: {} });
  }

  function paint() {
    for (var flag in stores) {
      if (!Object.prototype.hasOwnProperty.call(stores, flag)) continue;
      var store = stores[flag];
      var sec = sectionFor(flag);
      for (var n = 0; n < store.order.length; n++) {
        var key = store.order[n];
        var row = sec.rows[key];
        if (!row) {
          row = document.createElement('div');
          var k = document.createElement('span');
          k.className = 'hud-k';
          k.textContent = key + ' ';
          var v = document.createElement('span');
          v.className = 'hud-v';
          row.appendChild(k);
          row.appendChild(v);
          sec.body.appendChild(row);
          sec.rows[key] = row;
        }
        var target = row.lastChild;
        var next = String(store.values[key]);
        if (target.textContent !== next) target.textContent = next;
      }
      var joined = store.notes.join('\n');
      if (sec.notes.textContent !== joined) sec.notes.textContent = joined;
    }
  }

  function tick(ts) {
    if (ts - last >= 1000 / HUD_HZ) {
      last = ts;
      paint();
    }
    requestAnimationFrame(tick);
  }

  function start() {
    build();
    requestAnimationFrame(tick);
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
