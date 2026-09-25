

(function() {
  'use strict';

  var WS = window.WalkthroughShared;
  var debugLog = (WS && WS.debugLog) || function() {};

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

  function armInstrument(selector, armClass) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    eachStoryPanel(selector, function(el, panel, strip) {
      el.classList.add(armClass);
      whenPanelCentered(panel, strip, function() { el.classList.add('is-go'); });
    });
  }

  var INSTRUMENTS = [
    ['.plsb-duel', 'duel-armed'],
    ['.plsb-route', 'gaunt-armed'],
    ['.plsb-survey', 'survey-armed'],
    ['.plsb-swap', 'swap-armed'],
    ['.plsb-test', 'test-armed'],
    ['.plsb-quad', 'quad-armed']
  ];
  function initStoryInstruments() {
    INSTRUMENTS.forEach(function(row) { armInstrument(row[0], row[1]); });
    fitQuadGrow();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitQuadGrow);
    window.addEventListener('resize', fitQuadGrow);
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
      window.addEventListener('resize', queue);
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

      var runway = stage.closest('.plsb-runway');
      var pinQuery = window.matchMedia('(min-width: 1024px) and (min-height: 700px)');

      function applyPin() {
        var want = motionOK && pinQuery.matches;
        runway.classList.toggle('plsb-runway--pin', want);
        debugLog('plsb-carousel', 'pinned linger', want ? 'on' : 'off');
      }

      if (runway) {

        if (pinQuery.addEventListener) pinQuery.addEventListener('change', applyPin);
        else if (pinQuery.addListener) pinQuery.addListener(applyPin);
        applyPin();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initStoryInstruments();
    initTestCycler();
    initQuoteCycler();
    initCaptionDrift();
    initStoryboardNav();
    initCanvasSlides();
    initStoryCarousel();
  });
})();
