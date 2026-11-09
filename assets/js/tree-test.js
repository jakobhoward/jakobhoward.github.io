

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

  var OPEN = [150, 560, 420, 34];
  var FOLD = [130, 420, 320, 24];
  var STEP = [110, 340, 300, 22];
  var BRANCH = [90, 280, 240, 16];

  var GROW_MS = 1400;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(label, cls, onClick, aria) {
    var b = el('button', cls, label);
    b.type = 'button';
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  }

  function rise(node) { node.setAttribute('data-rise', ''); return node; }
  var pad = function (i) { return String(i + 1).padStart(2, '0'); };

  function pathList(steps, cls) {
    var ol = el('ol', 'exh-tt-path' + (cls ? ' ' + cls : ''));
    ol.setAttribute('role', 'list');
    steps.forEach(function (name, i) { ol.appendChild(el('li', i === steps.length - 1 ? 'is-end' : '', name)); });
    return ol;
  }

  var ROOTS = [
    [[266, 0, 254, 18, 205, 50, 66, 116], 24, 2],
    [[334, 0, 346, 18, 395, 50, 534, 112], 24, 2],
    [[288, 0, 284, 40, 258, 104, 222, 204], 24, 2],
    [[312, 0, 318, 46, 344, 116, 374, 210], 24, 2],
    [[196, 54, 160, 78, 138, 118, 122, 168], 9, 1.5],
    [[404, 54, 440, 80, 458, 120, 470, 162], 9, 1.5],
    [[262, 96, 236, 120, 204, 134, 170, 140], 6, 1],
    [[340, 104, 366, 124, 396, 134, 430, 138], 6, 1]
  ];
  function taper(p, w0, w1) {
    var left = [], right = [], steps = 28;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, u = 1 - t;
      var x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
      var y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
      var dx = 3 * u * u * (p[2] - p[0]) + 6 * u * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]);
      var dy = 3 * u * u * (p[3] - p[1]) + 6 * u * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5]);
      var len = Math.hypot(dx, dy) || 1, half = (w0 + (w1 - w0) * Math.pow(t, 0.7)) / 2;
      left.push((x - dy / len * half).toFixed(1) + ',' + (y + dx / len * half).toFixed(1));
      right.unshift((x + dy / len * half).toFixed(1) + ',' + (y - dx / len * half).toFixed(1));
    }
    return 'M' + left.join('L') + 'L' + right.join('L') + 'Z';
  }
  function roots() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'exh-tt-roots');
    svg.setAttribute('viewBox', '60 0 480 220');
    svg.setAttribute('aria-hidden', 'true');

    ['M254,0 A46,16 0 0 0 346,0 Z'].concat(ROOTS.map(function (r) { return taper(r[0], r[1], r[2]); })).forEach(function (d) {
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  function morpher(view) {
    var fading = false, grow = null;
    return function morph(build, t, swap) {
      if (fading) return Promise.resolve(false);
      if (reduced.matches || !view.animate) {
        view.replaceChildren();
        if (swap) swap();
        build(view);
        return Promise.resolve(true);
      }
      var from = view.getBoundingClientRect().height;
      if (grow) { grow.cancel(); grow = null; }
      fading = true;

      view.inert = true;
      var outgoing = Array.prototype.slice.call(view.children).map(function (child) {
        return child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t[0], easing: 'ease-in', fill: 'forwards' }).finished;
      });
      return Promise.all(outgoing).then(function () {
        fading = false;
        view.inert = false;
        view.replaceChildren();
        if (swap) swap();
        build(view);
        var to = view.getBoundingClientRect().height;
        view.style.overflow = 'hidden';
        grow = view.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: t[1], easing: EASE });
        Array.prototype.slice.call(view.querySelectorAll('[data-rise]')).forEach(function (part, i) {
          part.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
            { duration: t[2], delay: Math.round(t[1] * 0.12) + i * t[3], easing: EASE, fill: 'backwards' });
        });
        return grow.finished.then(function () { grow = null; view.style.overflow = ''; return true; }, function () { return false; });
      });
    };
  }

  function initTreeTest(body) {
    var dataEl = body.querySelector('.exh-tt-data');
    var list = body.querySelector('.exh-tt-list');
    var card = body.closest('.exh-row--treetest') || body;
    if (!dataEl || !list) return;
    var study;
    try { study = JSON.parse(dataEl.textContent); } catch (e) { return; }
    var tasks = study.tasks;
    var view = el('div', 'exh-tt-view');
    var live = el('p', 'visually-hidden');
    live.setAttribute('aria-live', 'polite');
    var morph = morpher(view);
    var k = 0, sec = -1, expanded = {}, picked;
    var tried = {};

    function matches(chosen, task) {
      return task.paths.some(function (p) {
        return p.length <= chosen.length && p.every(function (name, i) { return chosen[i] === name; });
      });
    }

    function sketch() {
      var fig = el('div', 'exh-tt-sketch');
      fig.setAttribute('aria-hidden', 'true');
      fig.appendChild(el('span', 'exh-tt-sketch-root', study.tree.name));
      var row = el('ul', 'exh-tt-sketch-row');
      row.style.setProperty('--n', study.tree.children.length);
      var bars = {};
      study.tree.children.forEach(function (section) {
        var node = el('li', 'exh-tt-sketch-node');
        node.appendChild(el('span', 'exh-tt-sketch-label', section.name));
        var leaves = el('span', 'exh-tt-sketch-leaves');
        bars[section.name] = {};
        (section.children || []).forEach(function (page) { bars[section.name][page.name] = leaves.appendChild(el('i')); });
        node.appendChild(leaves);
        row.appendChild(node);
      });
      fig.appendChild(row);
      tasks.forEach(function (task, t) {
        if (tried[t]) task.paths.forEach(function (path) {
          var bar = bars[path[0]] && bars[path[0]][path[1]];
          if (bar) bar.classList.add('is-fruit');
        });
      });

      fig.querySelectorAll('.is-fruit').forEach(function (bar, i) { bar.style.setProperty('--i', i); });
      return fig;
    }
    function rest(v) {
      var n = Object.keys(tried).length;
      v.appendChild(rise(sketch()));
      v.appendChild(rise(button(n === 0 ? 'Try the tree test' : n < tasks.length ? 'Keep going' : 'Try it again', 'exh-tt-cta', open)));
      if (!n) return;
      var tally = rise(el('p', 'exh-tt-tally'));
      tally.appendChild(el('b', null, String(n)));
      tally.appendChild(document.createTextNode(' of ' + tasks.length + ' tried · a dot on each page the study expected'));
      v.appendChild(tally);
    }
    function open() {
      endGrow();

      k = Math.max(0, tasks.findIndex(function (task, i) { return !tried[i]; }));
      sec = -1; expanded = {}; picked = undefined;
      morph(test, OPEN, function () { card.classList.remove('is-tree'); }).then(function (done) {
        if (!done) return;
        var riddle = view.querySelector('.exh-tt-riddle');
        if (riddle) riddle.focus({ preventScroll: true });

        card.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
      });
      live.textContent = 'Tree test open: task ' + (k + 1) + ' of ' + tasks.length;
    }
    function fold() {
      morph(rest, FOLD, function () { card.classList.add('is-tree'); }).then(function () {
        var cta = view.querySelector('.exh-tt-cta');
        if (cta) cta.focus({ preventScroll: true });
      });
      live.textContent = 'Tree test closed';
    }

    function go(i) {
      k = (i + tasks.length) % tasks.length;
      sec = -1; expanded = {}; picked = undefined;
      morph(test, STEP);
      live.textContent = 'Task ' + (k + 1) + ' of ' + tasks.length;
    }
    function finish(chosen) {
      picked = chosen;
      tried[k] = true;
      morph(test, STEP).then(function () {
        var first = view.querySelector('.exh-tt-result button');
        if (first) first.focus({ preventScroll: true });
      });
      live.textContent = chosen ? (matches(chosen, tasks[k]) ? 'That’s where I expected it.' : 'Not where I expected it.') : 'Answer shown.';
    }

    function next() {
      for (var i = 1; i < tasks.length; i++) if (!tried[(k + i) % tasks.length]) return (k + i) % tasks.length;
      return (k + 1) % tasks.length;
    }
    function allTried() { return tasks.every(function (task, i) { return tried[i]; }); }

    function test(into_) {
      into_.appendChild(rise(bar()));
      var riddle = rise(el('p', 'exh-tt-riddle exh-tt-riddle--lead', tasks[k].riddle));
      riddle.tabIndex = -1;
      into_.appendChild(riddle);
      if (picked === undefined) chooser(into_); else result(into_);
    }

    function bar() {
      var top = el('div', 'exh-tt-top');
      var where = el('div', 'exh-tt-where');
      where.appendChild(el('p', 'exh-tt-num', 'Task ' + pad(k) + ' of ' + tasks.length));
      var dots = el('ol', 'exh-tt-dots');
      dots.setAttribute('role', 'list');
      tasks.forEach(function (task, i) {
        var li = el('li');
        var dot = button('', 'exh-tt-dot' + (tried[i] ? ' is-tried' : ''), function () { if (i !== k) go(i); },
          'Task ' + (i + 1) + ' of ' + tasks.length + (tried[i] ? ', tried' : ''));
        if (i === k) dot.setAttribute('aria-current', 'step');
        li.appendChild(dot);
        dots.appendChild(li);
      });
      where.appendChild(dots);
      top.appendChild(where);
      var steps = el('div', 'exh-tt-steps');
      steps.appendChild(button('‹', 'exh-tt-arrow', function () { go(k - 1); }, 'Previous task'));
      steps.appendChild(button('›', 'exh-tt-arrow', function () { go(k + 1); }, 'Next task'));
      steps.appendChild(button('×', 'exh-tt-arrow exh-tt-close', fold, 'Close the tree test'));
      top.appendChild(steps);
      return top;
    }

    function chooser(into_) {
      into_.appendChild(rise(el('p', 'exh-tt-label', 'Tap where you’d look')));
      var tree = rise(el('div', 'exh-tt-tree'));
      tree.setAttribute('role', 'group');
      tree.setAttribute('aria-label', 'The tested tree');
      var chips = study.tree.children.map(function (section, i) {
        var chip = button(section.name, 'exh-tt-sec', function () { if (sec !== i) show(i); });
        chip.style.setProperty('--i', i);
        chip.setAttribute('aria-expanded', 'false');
        tree.appendChild(chip);
        return chip;
      });
      var branch = el('div', 'exh-tt-branch');
      tree.appendChild(branch);
      var regrow = morpher(branch);
      function show(i) {
        sec = i; expanded = {};
        chips.forEach(function (chip, j) { chip.setAttribute('aria-expanded', String(j === i)); });
        branch.style.setProperty('--k', i);
        regrow(pages, BRANCH);
        live.textContent = study.tree.children[i].name + ': ' + (study.tree.children[i].children || []).length + ' pages';
      }
      function pages(into) {
        var section = study.tree.children[sec];
        into.appendChild(rise(button(section.name, 'exh-tt-hub', function () { finish([section.name]); }, section.name + ', the section’s own page')));
        into.appendChild(level(section, [section.name]));
      }

      function level(node, path) {
        var ul = el('ul', 'exh-tt-nodes' + (path.length > 1 ? ' exh-tt-nodes--sub' : ''));
        ul.setAttribute('role', 'list');
        node.children.forEach(function (child) {
          var li = rise(el('li'));
          var at = path.concat(child.name), key = at.join(' › ');
          var row = el('div', 'exh-tt-row');
          row.appendChild(button(child.name, 'exh-tt-node', function () { finish(at); }));
          if (child.children) {
            var more = button('›', 'exh-tt-more', function () {
              expanded[key] = !expanded[key];
              regrow(pages, BRANCH).then(function () {

                var again = Array.prototype.filter.call(branch.querySelectorAll('.exh-tt-more'), function (m) { return m.getAttribute('data-key') === key; })[0];
                if (again) again.focus({ preventScroll: true });
              });
            }, (expanded[key] ? 'Hide' : 'Show') + ' the pages under ' + child.name);
            more.setAttribute('aria-expanded', String(!!expanded[key]));
            more.setAttribute('data-key', key);
            row.appendChild(more);
          }
          li.appendChild(row);
          if (child.children && expanded[key]) {
            li.classList.add('is-open');
            li.appendChild(level(child, at));
          }
          ul.appendChild(li);
        });
        return ul;
      }
      if (sec >= 0) {
        chips[sec].setAttribute('aria-expanded', 'true');
        branch.style.setProperty('--k', sec);
        pages(branch);
      }
      into_.appendChild(tree);
      var actions = rise(el('div', 'exh-tt-actions'));
      actions.appendChild(button('Show the expected answer', 'exh-tt-skip', function () { finish(null); }));
      into_.appendChild(actions);
    }

    function result(into_) {
      var task = tasks[k];
      var hit = !!picked && matches(picked, task);
      var map = rise(el('div', 'exh-tt-tree exh-tt-tree--map'));
      map.setAttribute('aria-hidden', 'true');
      study.tree.children.forEach(function (section) {
        var expected = task.paths.some(function (p) { return p[0] === section.name; });
        var mine = !!picked && picked[0] === section.name && !expected;
        map.appendChild(el('span', 'exh-tt-sec' + (expected ? ' is-expected' : '') + (mine ? ' is-picked' : ''), section.name));
      });
      into_.appendChild(map);
      var block = el('div', 'exh-tt-result');
      if (picked) {
        block.appendChild(rise(el('p', 'exh-tt-verdict' + (hit ? ' is-hit' : ''), hit ? 'That’s where I expected it.' : 'You looked here:')));
        if (!hit) block.appendChild(rise(pathList(picked, 'exh-tt-path--picked')));
      }
      block.appendChild(rise(list.children[k].querySelector('.exh-tt-answer').cloneNode(true)));
      var after = rise(el('div', 'exh-tt-actions'));

      after.appendChild(allTried() ? button('Done', 'exh-tt-go', fold) : button('Next task ›', 'exh-tt-go', function () { go(next()); }));
      if (picked) after.appendChild(button('Try again', 'exh-tt-skip', function () { sec = -1; expanded = {}; picked = undefined; morph(test, STEP); }));
      block.appendChild(after);
      into_.appendChild(block);
    }

    var growing = null, growEnd;
    function endGrow() {
      if (growing) growing.disconnect();
      growing = null;
      clearTimeout(growEnd);
      card.classList.remove('is-seed', 'is-growing');
    }
    function grow() {
      if (reduced.matches || !('IntersectionObserver' in window)) return;
      card.classList.add('is-growing', 'is-seed');
      growing = new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        if (e.intersectionRatio < 0.98 && e.intersectionRect.height < window.innerHeight * 0.7) return;
        growing.disconnect();
        growing = null;
        card.classList.remove('is-seed');
        growEnd = setTimeout(endGrow, GROW_MS);
      }, { threshold: [0.5, 0.75, 0.98, 1], rootMargin: '0px 0px -12% 0px' });

      requestAnimationFrame(function () { requestAnimationFrame(function () { if (growing) growing.observe(card); }); });
    }

    var shape = el('div', 'exh-tt-shape');
    shape.setAttribute('aria-hidden', 'true');
    var canopy = el('div', 'exh-tt-canopy');
    ['exh-tt-body', 'exh-tt-crown', 'exh-tt-crown', 'exh-tt-crown'].forEach(function (cls) { canopy.appendChild(el('i', cls)); });
    shape.appendChild(canopy);
    ['exh-tt-arm exh-tt-arm--l', 'exh-tt-arm exh-tt-arm--r', 'exh-tt-trunk'].forEach(function (cls) { shape.appendChild(el('i', cls)); });
    card.insertBefore(shape, card.firstChild);
    card.insertBefore(roots(), shape.nextSibling);
    card.classList.add('has-shape', 'is-tree');

    rest(view);
    body.appendChild(view);
    body.appendChild(live);
    body.classList.add('is-live');
    grow();
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-treetest]').forEach(initTreeTest);
  });
})();
