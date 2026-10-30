

(function() {
  'use strict';

  var WS = window.WalkthroughShared;
  var debugLog = WS.debugLog;

  var PLSB_CENTER_BAND = '0px -49.5% 0px -49.5%';

  function whenPanelCentered(panel, strip, onCenter) {
    if (!('IntersectionObserver' in window)) return;
    var centered = false, stripInView = false, done = false, timer = null;

    function update() {
      if (done) return;
      if (centered && stripInView) {
        if (timer === null) {
          timer = setTimeout(function() {
            done = true;
            centerIO.disconnect();
            stripIO.disconnect();
            onCenter();
          }, 250);
        }
      } else if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    var centerIO = new IntersectionObserver(function(entries) {
      centered = entries[entries.length - 1].isIntersecting;
      update();
    }, { root: strip, rootMargin: PLSB_CENTER_BAND, threshold: 0 });
    centerIO.observe(panel);

    var stripIO = new IntersectionObserver(function(entries) {
      stripInView = entries[entries.length - 1].isIntersecting;
      update();
    }, { rootMargin: '-30% 0px -30% 0px', threshold: 0 });
    stripIO.observe(strip);
  }

  function eachStoryPanel(selector, cb) {
    if (!('IntersectionObserver' in window)) return;
    document.querySelectorAll(selector).forEach(function(el) {
      var panel = el.closest('.plsb-panel'), strip = el.closest('.plsb');
      if (panel && strip) cb(el, panel, strip);
    });
  }

  function armInstrument(selector, armClass, play) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    eachStoryPanel(selector, function(el, panel, strip) {
      el.classList.add(armClass);
      if (play) play.arm(el);
      whenPanelCentered(panel, strip, function() {
        el.classList.add('is-go');
        if (play) play.go(el);
      });
    });
  }

  var TYPE_QUERY = {
    arm: function(flow) {
      var t = flow.querySelector('.plsb-query-text');
      if (!t) return;
      t.setAttribute('data-q', t.textContent);
      t.textContent = '';
    },
    go: function(flow) {
      var t = flow.querySelector('.plsb-query-text');
      if (!t) return;
      var q = t.getAttribute('data-q') || '';
      var delays = [], total = 350;
      for (var k = 0; k < q.length; k++) {
        total += 22 + ((k * 37) % 41);
        delays.push(total);
      }
      flow.style.setProperty('--q-t', (total / 1000).toFixed(2) + 's');
      delays.forEach(function(at, k) {
        setTimeout(function() { t.textContent = q.slice(0, k + 1); }, at);
      });
    }
  };

  var COUNT_UP = {
    arm: function(el) {
      var v = el.querySelector('.plsb-bignum-v');
      var m = v && /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(v.textContent.trim());
      if (!m) return;
      el._count = {
        node: v, text: v.textContent, prefix: m[1], suffix: m[3],
        to: parseFloat(m[2].replace(/,/g, '')),
        decimals: (m[2].split('.')[1] || '').length,
        grouped: m[2].indexOf(',') !== -1
      };
      v.textContent = formatCount(el._count, 0);
    },
    go: function(el) {
      var c = el._count;
      if (!c) return;
      var t0 = null, DUR = 1100;
      requestAnimationFrame(function frame(now) {
        if (t0 === null) t0 = now;
        var p = Math.min(1, (now - t0) / DUR);
        if (p < 1) {
          c.node.textContent = formatCount(c, c.to * (1 - Math.pow(1 - p, 3)));
          requestAnimationFrame(frame);
        } else {
          c.node.textContent = c.text;
        }
      });
    }
  };
  function formatCount(c, n) {
    var s = n.toFixed(c.decimals);
    if (c.grouped) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return c.prefix + s + c.suffix;
  }

  var ASK_RESEARCH = {
    arm: function() {},
    go: function(el) {
      var field = el.querySelector('.plsb-research-text');
      var bubbles = Array.prototype.slice.call(el.querySelectorAll('.plsb-research-q'));
      if (!field || !bubbles.length) return;

      var at = 700;
      bubbles.forEach(function(bubble) {
        var q = bubble.textContent.trim();
        for (var k = 0; k < q.length; k++) {
          at += 14 + ((k * 37) % 27);
          setTimeout(typeInto, at, field, q.slice(0, k + 1));
        }
        at += 340;
        setTimeout(function() { field.textContent = ''; bubble.classList.add('is-asked'); }, at);
        at += 300;
      });
    }
  };
  function typeInto(field, text) { field.textContent = text; }

  var INSTRUMENTS = [
    ['.plsb-duel', 'duel-armed'],
    ['.plsb-route', 'gaunt-armed'],
    ['.plsb-survey', 'survey-armed'],
    ['.plsb-swap', 'swap-armed'],
    ['.plsb-test', 'test-armed'],
    ['.plsb-quad', 'quad-armed'],
    ['.plsb-vis--desk', 'desk-armed'],
    ['.plsb-readers:not(.plsb-readers--persist)', 'readers-armed'],
    ['.plsb-query-flow', 'query-armed', TYPE_QUERY],
    ['.plsb-bignum', 'bignum-armed', COUNT_UP],
    ['.plsb-research', 'research-armed', ASK_RESEARCH]
  ];
  function initStoryInstruments() {
    INSTRUMENTS.forEach(function(row) { armInstrument(row[0], row[1], row[2]); });
    fitQuadGrow();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitQuadGrow);
    WS.viewport.onChange(fitQuadGrow);
  }

  function fitQuadGrow() {
    document.querySelectorAll('.plsb-quad-label').forEach(function(label) {
      var cell = label.closest('.plsb-quad-cell');
      if (!cell || !label.offsetWidth) return;
      label.style.removeProperty('--grow');
      var base = parseFloat(getComputedStyle(label).getPropertyValue('--grow')) || 1;
      var fit = (cell.clientWidth - 16) / label.offsetWidth;
      if (fit < base) label.style.setProperty('--grow', Math.max(1, fit).toFixed(3));
    });
  }

  function initQuoteCycler() {
    document.querySelectorAll('.plsb-swap-panel-copy').forEach(function(copy) {
      var wrap = copy.querySelector('.plsb-swap-quotes');
      var nav = copy.querySelector('.plsb-swap-qnav');
      if (!wrap || !nav) return;
      var quotes = Array.prototype.slice.call(wrap.querySelectorAll('.plsb-swap-quote'));
      if (quotes.length < 2) return;
      var count = nav.querySelector('.plsb-swap-qcount');
      var idx = 0;
      function show(i) {
        idx = (i + quotes.length) % quotes.length;
        quotes.forEach(function(q, j) { q.classList.toggle('is-on', j === idx); });
        if (count) count.textContent = (idx + 1) + ' / ' + quotes.length;
      }
      wrap.classList.add('is-managed');
      show(0);
      nav.hidden = false;
      nav.querySelectorAll('.plsb-swap-qbtn').forEach(function(btn) {
        btn.disabled = false;
        btn.addEventListener('click', function() {
          show(idx + (parseInt(btn.getAttribute('data-dir'), 10) || 1));
        });
      });
    });
  }

  function initContactSheet() {
    var motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var HOLD = 1700, DEVELOP_MS = 1250;
    eachStoryPanel('.plsb-contact', function(list, panel, strip) {
      var pages = Array.prototype.slice.call(list.children);
      var lit = pages.filter(function(li) { return li.hasAttribute('data-lit'); });
      var k = 1, timer = null, held = false, ready = false;
      function lift(li) {
        pages.forEach(function(p) { p.classList.toggle('is-lit', p === li); });
      }
      function step() {
        if (held || !lit.length) return;
        lift(lit[k % lit.length]);
        k++;
      }
      function start() { if (ready && motionOK && timer === null) timer = setInterval(step, HOLD); }
      function stop() { if (timer !== null) { clearInterval(timer); timer = null; } }
      function hold(e) {
        var li = e.target.closest('li');
        if (!li || li.parentNode !== list) return;
        held = true;
        lift(li);
      }
      list.addEventListener('pointerover', hold);
      list.addEventListener('click', hold);
      list.addEventListener('pointerleave', function() { held = false; });
      if (!motionOK) return;
      lift(null);
      list.classList.add('contact-armed');
      whenPanelCentered(panel, strip, function() {
        list.classList.add('is-go');
        setTimeout(function() {
          list.classList.remove('contact-armed', 'is-go');
          ready = true;
          k = 0;
          step();
          start();
        }, DEVELOP_MS);
        new IntersectionObserver(function(entries) {
          if (entries[entries.length - 1].isIntersecting) start(); else stop();
        }).observe(panel);
      });
    });
  }

  function initTestCycler() {
    var motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var HOLD = 3000;
    eachStoryPanel('.plsb-test', function(el, panel, strip) {
      var groups = ['.plsb-test-variant', '.plsb-test-path', '.plsb-test-pill'].map(function(sel) {
        return Array.prototype.slice.call(el.querySelectorAll(sel));
      });
      var pills = groups[2];
      var count = groups[0].length;
      if (count < 2) return;
      var idx = 0, timer = null, taken = false;
      function show(i) {
        idx = i;
        groups.forEach(function(list) {
          list.forEach(function(node, j) { node.classList.toggle('is-on', j === i); });
        });
        pills.forEach(function(pill, j) {
          pill.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
      }
      function start() {
        if (motionOK && !taken && timer === null) {
          timer = setInterval(function() { show((idx + 1) % count); }, HOLD);
        }
      }
      function stop() { if (timer !== null) { clearInterval(timer); timer = null; } }
      el.classList.add('is-cycling');
      show(0);
      pills.forEach(function(pill, i) {
        pill.disabled = false;
        pill.addEventListener('click', function() {
          taken = true;
          stop();
          show(i);
        });
      });
      whenPanelCentered(panel, strip, function() {
        start();

        new IntersectionObserver(function(entries) {
          if (entries[entries.length - 1].isIntersecting) start(); else stop();
        }).observe(panel);
      });
    });
  }

  function initHeldRuns() {
    if (!('IntersectionObserver' in window)) return;
    var motionOK = document.documentElement.classList.contains('js-motion');

    document.querySelectorAll('.plsb-run').forEach(function(run) {
      var strip = run.closest('.plsb');
      var hold = run.querySelector('.plsb-run-layer');
      var panels = Array.prototype.slice.call(run.querySelectorAll('.plsb-panel'));
      if (!strip || !hold || panels.length < 2) return;
      var parts = Array.prototype.slice.call(hold.querySelectorAll('[data-on]'));

      var captions = panels.map(function(panel) { return panel.querySelector('.plsb-readers-center'); });
      var focused = 0;
      function syncCaption() {
        var caption = captions[focused];
        if (caption) run.style.setProperty('--held-panel-h', caption.offsetHeight + 'px');
      }

      var stages = Array.prototype.slice.call(hold.querySelectorAll('.plsb-held-stage'));
      var diagrams = panels.map(function(panel) { return panel.querySelector('.plsb-navs'); });
      var copies = panels.map(function(panel) { return panel.querySelector('.plsb-copy'); });
      function pinStages() {

        var band = 0;
        copies.forEach(function(copy, k) {
          if (copy) band = Math.max(band, copy.getBoundingClientRect().bottom - panels[k].getBoundingClientRect().top + 92);
        });
        hold.style.setProperty('--held-band-h', band + 'px');
        stages.forEach(function(stage, k) {
          var panel = panels[k], diagram = diagrams[k];
          if (!panel || !diagram) return;
          var p = panel.getBoundingClientRect(), d = diagram.getBoundingClientRect();
          stage.style.setProperty('--x', (d.left - p.left - panel.clientLeft) + 'px');
          stage.style.setProperty('--y', (d.top - p.top - panel.clientTop) + 'px');
          stage.style.setProperty('--w', d.width + 'px');
        });
      }

      var FLY_MS = 700, STAGGER_MS = 40, LABEL_IN_MS = 120, GHOST_OUT_MS = 180;
      var FLY_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
      var flights = [];
      function morphStages(from, to) {
        var a = stages[from], b = stages[to];
        if (!a || !b) return;

        flights.forEach(function(anim) { anim.cancel(); });
        flights = [];
        hold.querySelectorAll('.plsb-morph-ghost').forEach(function(ghost) { ghost.remove(); });

        var box = hold.getBoundingClientRect(), ox = box.left + hold.clientLeft, oy = box.top + hold.clientTop;
        function hide(el, ms) { flights.push(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: ms })); }
        function keyed(stage) {
          var by = {};
          stage.querySelectorAll('[data-morph]').forEach(function(el) {
            var key = el.getAttribute('data-morph');
            (by[key] = by[key] || []).push(el);
          });
          Object.keys(by).forEach(function(key) {
            var buttons = by[key].filter(function(el) { return el.classList.contains('plsb-navs-item--button'); });
            if (buttons.length) by[key] = buttons;
          });
          return by;
        }
        var src = keyed(a), dst = keyed(b), n = 0, last = 0;
        var lands = new Map();
        Object.keys(src).forEach(function(key) {
          var froms = src[key], tos = dst[key];
          if (!tos) return;
          var count = Math.max(froms.length, tos.length);
          for (var i = 0; i < count; i++) {
            var s = froms[i % froms.length], t = tos[i % tos.length];
            var sr = s.getBoundingClientRect(), tr = t.getBoundingClientRect();
            var ghost = s.cloneNode(true);
            ghost.removeAttribute('data-morph');
            ghost.classList.add('plsb-morph-ghost');
            ghost.style.left = (sr.left - ox) + 'px';
            ghost.style.top = (sr.top - oy) + 'px';
            hold.appendChild(ghost);
            var scale = tr.height / sr.height;
            var dx = tr.left + tr.width / 2 - (sr.left + sr.width / 2), dy = tr.top + tr.height / 2 - (sr.top + sr.height / 2);
            var move = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')';
            var leave = STAGGER_MS * n++, land = leave + FLY_MS;
            if (!lands.has(t) || land < lands.get(t)) lands.set(t, land);

            flights.push(ghost.animate([{ transform: 'none' }, { transform: move }],
              { duration: FLY_MS, delay: leave, easing: FLY_EASE, fill: 'both' }));
            var out = ghost.animate([{ opacity: 1 }, { opacity: 0 }],
              { duration: GHOST_OUT_MS, delay: land + LABEL_IN_MS, easing: 'ease-in', fill: 'both' });
            out.onfinish = function() { this.effect.target.remove(); };
            flights.push(out);
            last = Math.max(last, land + LABEL_IN_MS + GHOST_OUT_MS);
          }
        });

        Object.keys(src).forEach(function(key) {
          if (dst[key]) src[key].forEach(function(el) { hide(el, last); });
        });
        lands.forEach(function(land, el) {
          flights.push(el.animate([{ opacity: 0 }, { opacity: 1 }],
            { duration: LABEL_IN_MS, delay: land, easing: 'ease-out', fill: 'backwards' }));
        });
      }

      function show(k) {
        if (motionOK && stages.length && k !== focused) morphStages(focused, k);
        var at = String(k);
        parts.forEach(function(el) {
          el.classList.toggle('is-off', el.getAttribute('data-on').split(' ').indexOf(at) === -1);
        });
        focused = k;
        syncCaption();
      }

      var io = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          var k = panels.indexOf(entry.target);
          if (k > -1) {
            show(k);
            debugLog('plsb-carousel', 'held run shows beat', k);
          }
        });
      }, { root: strip, rootMargin: PLSB_CENTER_BAND, threshold: 0 });
      panels.forEach(function(panel) { io.observe(panel); });
      syncCaption();
      if ('ResizeObserver' in window) {
        var ro = new ResizeObserver(syncCaption);
        captions.forEach(function(caption) { if (caption) ro.observe(caption); });
        if (stages.length) {
          var pin = new ResizeObserver(pinStages);
          panels.concat(diagrams).forEach(function(el) { if (el) pin.observe(el); });
        }
      }

      var readers = hold.querySelector('.plsb-readers');
      if (motionOK && readers) {
        readers.classList.add('readers-armed');

        panels.forEach(function(panel) {
          whenPanelCentered(panel, strip, function() { readers.classList.add('is-go'); });
        });
      }
      run.classList.add('is-held');
      if (stages.length) pinStages();
    });
  }

  function centerLeft(strip, panel) {
    return panel.offsetLeft - (strip.clientWidth - panel.offsetWidth) / 2;
  }

  var GLIDE_MS = 1000;
  var glides = new WeakMap();

  function glideTo(strip, left, smooth) {
    var g = glides.get(strip);
    if (!g) { g = { raf: null }; glides.set(strip, g); }
    if (g.raf !== null) { cancelAnimationFrame(g.raf); g.raf = null; }

    function land() { g.raf = null; strip.style.scrollSnapType = ''; }

    var to = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, left));
    if (!smooth) { strip.scrollLeft = to; land(); return; }

    var panels = strip.querySelectorAll('.plsb-panel');
    var step = panels.length > 1 ? Math.abs(panels[1].offsetLeft - panels[0].offsetLeft) : 0;
    if (step && Math.abs(to - strip.scrollLeft) > step * 1.5) {
      strip.scrollLeft = to + (to > strip.scrollLeft ? -step : step);
    }

    var from = strip.scrollLeft;
    if (Math.abs(to - from) < 1) { strip.scrollLeft = to; land(); return; }

    strip.style.scrollSnapType = 'none';
    var t0 = performance.now(), wrote = -1;
    (function tick(now) {
      if (wrote >= 0 && Math.abs(strip.scrollLeft - wrote) > 2) { land(); return; }
      var k = Math.min(1, (now - t0) / GLIDE_MS);

      var eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      strip.scrollLeft = from + (to - from) * eased;
      wrote = strip.scrollLeft;
      if (k < 1) g.raf = requestAnimationFrame(tick); else land();
    })(t0);
  }

  var DRIFT_FADE = 0.85;

  var DRIFT_REST_PX = 2;

  function initCaptionDrift() {
    if (!document.documentElement.classList.contains('js-motion')) return;

    document.querySelectorAll('.plsb').forEach(function(strip) {
      var panels = Array.prototype.slice.call(strip.querySelectorAll('.plsb-panel'));
      if (panels.length < 2) return;
      var rested = panels.map(function() { return null; });
      var queued = false;

      function paint() {
        queued = false;

        var mid = strip.getBoundingClientRect();
        mid = mid.left + mid.width / 2;
        var rects = panels.map(function(panel) { return panel.getBoundingClientRect(); });
        var step = Math.abs(rects[1].left - rects[0].left) || rects[0].width;

        rects.forEach(function(r, i) {
          var panel = panels[i];
          var off = r.left + r.width / 2 - mid;
          var n = Math.max(-1, Math.min(1, off / step));
          var atRest = Math.abs(off) < DRIFT_REST_PX;
          if (atRest !== rested[i]) {
            rested[i] = atRest;
            panel.classList.toggle('is-drifted', !atRest);
          }
          if (atRest) {
            panel.style.removeProperty('--plsb-n');
            panel.style.removeProperty('--plsb-caption-o');
            return;
          }
          var lit = Math.max(0, 1 - Math.abs(n) / DRIFT_FADE);
          panel.style.setProperty('--plsb-n', n.toFixed(4));
          panel.style.setProperty('--plsb-caption-o', Math.pow(lit, 2.5).toFixed(3));
        });
      }

      function queue() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(paint);
      }

      strip.addEventListener('scroll', queue, { passive: true });
      WS.viewport.onChange(queue);
      queue();
      debugLog('plsb-carousel', 'caption drift armed', panels.length, 'beats');
    });
  }

  function initStoryboardNav() {
    if (!('IntersectionObserver' in window)) return;
    var motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('.plsb-nav').forEach(function(nav) {
      var stage = nav.closest('.plsb-stage');
      var strip = stage && stage.querySelector('.plsb');
      if (!strip) return;
      var panels = Array.prototype.slice.call(strip.querySelectorAll('.plsb-panel'));
      var dots = Array.prototype.slice.call(nav.querySelectorAll('.plsb-dot'));
      if (!panels.length || dots.length !== panels.length) {
        debugLog('storyboard-nav', 'panel/dot mismatch — leaving pill hidden', panels.length, dots.length);
        return;
      }

      function setActive(active) {
        dots.forEach(function(dot, i) {
          if (i === active) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
      }

      var io = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          var i = panels.indexOf(entry.target);
          if (i > -1) {
            setActive(i);
            debugLog('storyboard-nav', 'focused beat', i);
          }
        });
      }, { root: strip, rootMargin: PLSB_CENTER_BAND, threshold: 0 });
      panels.forEach(function(panel) { io.observe(panel); });

      dots.forEach(function(dot, i) {
        dot.addEventListener('click', function() {
          glideTo(strip, centerLeft(strip, panels[i]), motionOK);
        });
      });

      setActive(0);
      nav.hidden = false;
    });
  }

  function initCanvasSlides() {
    if (!document.documentElement.classList.contains('js-motion')) return;
    eachStoryPanel('.plsb-canvas', function(canvas, panel, strip) {
      canvas.classList.add('stage-armed');
      whenPanelCentered(panel, strip, function() {
        canvas.classList.add('is-noted');
        debugLog('plsb-carousel', 'canvas slide noted');
      });
    });
  }

  function initStoryCarousel() {
    var motionOK = document.documentElement.classList.contains('js-motion');

    if (!motionOK) {
      document.querySelectorAll('.plsb-shot-video').forEach(function(v) {
        v.autoplay = false;
        v.pause();
      });
    }

    if (!('IntersectionObserver' in window)) return;

    document.querySelectorAll('.plsb-stage').forEach(function(stage) {
      var strip = stage.querySelector('.plsb');
      if (!strip) return;
      var panels = Array.prototype.slice.call(strip.querySelectorAll('.plsb-panel'));
      if (panels.length < 2) return;
      var video = strip.querySelector('.plsb-canvas video');
      var ctl = stage.querySelector('.plsb-ctl');
      var nav = stage.querySelector('.plsb-nav');
      var arrows = Array.prototype.slice.call(stage.querySelectorAll('.plsb-arrow'));
      var current = 0, inView = false, playing = false, ended = false;
      var timer = null, autoStarted = false;

      if (video && motionOK) video.preload = 'auto';

      function goTo(i, smooth) {
        i = Math.max(0, Math.min(panels.length - 1, i));
        glideTo(strip, centerLeft(strip, panels[i]), !!smooth && motionOK);
      }

      function dwellOf(panel) {
        return parseInt(panel.getAttribute('data-dwell'), 10) || 7000;
      }

      function setCtl(state, label) {
        if (!ctl) return;
        ctl.setAttribute('data-state', state);
        ctl.setAttribute('aria-label', label);
      }

      function clearTimer() {
        if (timer !== null) { clearTimeout(timer); timer = null; }
      }

      function restartFill() {
        if (!nav) return;
        nav.classList.remove('is-playing');
        if (playing && inView && !ended) {
          void nav.offsetWidth;
          nav.style.setProperty('--dwell', dwellOf(panels[current]) + 'ms');
          nav.classList.add('is-playing');
        }
      }

      function schedule() {
        clearTimer();
        restartFill();
        if (!playing || !inView || ended) return;
        timer = setTimeout(function() {
          if (current >= panels.length - 1) {
            ended = true; playing = false;
            setCtl('ended', 'Replay highlights');
            restartFill();
            debugLog('plsb-carousel', 'reached the end');
          } else {
            debugLog('plsb-carousel', 'advancing to slide', current + 1);
            goTo(current + 1, true);
          }
        }, dwellOf(panels[current]));
      }

      function play() {
        if (ended) { ended = false; goTo(0, true); }
        playing = true;
        setCtl('playing', 'Pause highlights');
        schedule();
      }

      function pause(why) {
        playing = false;
        clearTimer();
        restartFill();
        setCtl('paused', 'Play highlights');
        debugLog('plsb-carousel', 'paused —', why);
      }

      var videoActive = false, gateRaf = null;
      var entranceEnd = video ? parseFloat(video.getAttribute('data-entrance-end')) || 0 : 0;

      function clearGate() {
        if (gateRaf !== null) { cancelAnimationFrame(gateRaf); gateRaf = null; }
      }

      function holdAtPeak() {
        clearGate();
        if (!entranceEnd) return;
        function watch() {
          gateRaf = null;
          if (!videoActive) return;
          if (video.currentTime >= entranceEnd) {
            video.pause();
            debugLog('plsb-carousel', 'establish clip resting on the peak');
          } else if (!video.paused || video.seeking) {
            gateRaf = requestAnimationFrame(watch);
          }
        }
        gateRaf = requestAnimationFrame(watch);
      }

      function syncVideo() {
        if (!video) return;
        var active = motionOK && inView && video.closest('.plsb-panel') === panels[current];
        if (active && !videoActive) {
          videoActive = true;
          try { video.currentTime = 0; } catch (e) {}
          var p = video.play();
          if (p && p.catch) p.catch(function() {});
          holdAtPeak();
          debugLog('plsb-carousel', 'establish clip: entrance from black');
        } else if (!active && videoActive) {
          videoActive = false;
          clearGate();
          video.pause();
          debugLog('plsb-carousel', 'establish clip: focus lost, holding');
        }
      }

      var centerIO = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          var i = panels.indexOf(entry.target);
          if (i === -1 || i === current) return;
          current = i;
          if (ended && i < panels.length - 1) ended = false;
          syncArrows();
          syncVideo();
          schedule();
        });
      }, { root: strip, rootMargin: PLSB_CENTER_BAND, threshold: 0 });
      panels.forEach(function(p) { centerIO.observe(p); });

      var viewIO = new IntersectionObserver(function(entries) {
        inView = entries[entries.length - 1].isIntersecting;
        if (inView) {
          if (motionOK && !autoStarted) {
            autoStarted = true;
            play();
            debugLog('plsb-carousel', 'autoplay started');
          } else if (playing) {
            schedule();
          }
        } else {
          clearTimer();
        }
        syncVideo();
      }, { threshold: 0.45 });
      viewIO.observe(strip);

      function userPause() { if (playing) pause('user input'); }

      strip.addEventListener('wheel', function(e) {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) userPause();
      }, { passive: true });

      var drag = null;
      function dragCheck(e) {
        if (!drag) return;
        var dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
        if (strip.scrollLeft !== drag.left || (dx > 10 && dx > dy)) {
          drag = null;
          userPause();
        }
      }
      strip.addEventListener('pointerdown', function(e) {
        drag = { x: e.clientX, y: e.clientY, left: strip.scrollLeft };
      });
      strip.addEventListener('pointermove', dragCheck);
      strip.addEventListener('pointercancel', function(e) { dragCheck(e); drag = null; });
      strip.addEventListener('pointerup', function() { drag = null; });
      if (nav) {
        nav.addEventListener('click', function(e) {

          if (e.target.closest('.plsb-dot')) userPause();
        });
      }

      strip.addEventListener('click', function(e) {
        if (e.target.closest('.plsb-hold')) userPause();
      });

      function syncArrows() {
        arrows.forEach(function(arrow) {
          var isNext = arrow.classList.contains('plsb-arrow--next');
          var spent = isNext ? current >= panels.length - 1 : current <= 0;
          if (spent && document.activeElement === arrow) {
            var partner = stage.querySelector(isNext ? '.plsb-arrow--prev' : '.plsb-arrow--next');
            if (partner && !partner.hidden) partner.focus();
          }
          arrow.hidden = spent;
        });
      }

      arrows.forEach(function(arrow) {
        arrow.addEventListener('click', function() {
          userPause();
          var target = Math.max(0, Math.min(panels.length - 1,
            current + (arrow.classList.contains('plsb-arrow--next') ? 1 : -1)));
          goTo(target, true);
        });
      });
      syncArrows();

      if (ctl && motionOK) {
        ctl.addEventListener('click', function() {
          if (playing) pause('control'); else play();
        });
        ctl.hidden = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initHeldRuns();
    initStoryInstruments();
    initTestCycler();
    initQuoteCycler();
    initContactSheet();
    initCaptionDrift();
    initStoryboardNav();
    initCanvasSlides();
    initStoryCarousel();
  });
})();
