

(function() {
  'use strict';

  var m = window.debug && window.debug.metrics('scroll-hud');
  if (!m) return;

  var POLL_MS = 250;

  function start() {
    var WS = window.WalkthroughShared;
    var acts = document.querySelectorAll('.campaign-walkthrough-section');
    var lastY = window.scrollY, lastT = performance.now();
    var v = 0, peak = 0, restY = lastY, wasMoving = false;

    function where() {
      for (var i = 0; i < acts.length; i++) {
        if (typeof acts[i].walkthroughPlace !== 'function') continue;
        var place = acts[i].walkthroughPlace();
        if (place) return { act: acts[i], place: place };
      }
      return null;
    }

    function sample() {
      var t = performance.now(), y = window.scrollY, dt = t - lastT;
      if (dt > 0) v = (v + (y - lastY) / dt * 1000) / 2;
      lastY = y; lastT = t;
      peak = Math.max(peak, Math.abs(v));
      var moving = !!(WS && WS.viewport.moving());
      m.set('vw', window.innerWidth + ' px');
      m.set('y', Math.round(y));
      m.set('v', Math.round(v) + ' px/s');
      m.set('moving', moving ? 'yes' : 'rest');

      var at = where();
      if (at) {
        var st = at.act.walkthroughStopState, place = at.place;
        m.set('act', at.act.getAttribute('data-hud-label') +
          (st ? ' · stop ' + (st.index + 1) + '/' + st.count + ' · ' + st.phase : ''));
        m.set('seg', place.type + (place.stop != null ? ' ' + place.stop : '') +
          ' @ ' + place.frac.toFixed(2));
      } else {
        m.set('act', '-');
        m.set('seg', '-');
      }

      if (wasMoving && !moving) {
        m.note('rest: ' + Math.round(y - restY) + 'px, peak ' + Math.round(peak) + ' px/s');
        restY = y; peak = 0;
      }
      wasMoving = moving;
    }

    window.addEventListener('scroll', sample, { passive: true });
    setInterval(sample, POLL_MS);
    sample();

    if (window.debug.flag('scroll-trace')) startTrace(WS, where);
  }

  function startTrace(WS, where) {
    var URL = '/trace';
    var FLUSH_MS = 1500;
    var MAX_BATCH = 300;
    var MAX_BYTES = 48000;
    var store = window.debug._metrics['scroll-hud'];
    var session = new Date().toISOString().slice(5, 19).replace(/[-:T]/g, '') + '-' +
      Math.random().toString(36).slice(2, 6);
    var t0 = performance.now(), seen = 0, queue = [], bytes = 0, last = '', timer = 0;

    function push(ev) {
      queue.push(ev);
      bytes += JSON.stringify(ev).length + 1;
      if (queue.length >= MAX_BATCH || bytes >= MAX_BYTES) return flush();
      clearTimeout(timer);
      timer = setTimeout(flush, FLUSH_MS);
    }

    var knobs = null;
    try { knobs = JSON.parse(localStorage.getItem('dwellKnobs') || 'null'); } catch (e) {   }
    var flags = new URLSearchParams(location.search).get('debug');

    function body() {
      var b = JSON.stringify({
        session: session, page: location.pathname, ua: navigator.userAgent,
        vw: window.innerWidth, dpr: window.devicePixelRatio, flags: flags,
        knobs: knobs, events: queue
      });
      queue = []; bytes = 0;
      return b;
    }

    function flush() {
      clearTimeout(timer);
      if (!queue.length) return;
      fetch(URL, { method: 'POST', body: body(), keepalive: true,
        headers: { 'Content-Type': 'application/json' } }).catch(function() {});
    }

    function record(e) {
      var t = Math.round((performance.now() - t0) * 10) / 10;

      var n = Math.min((store.noted || 0) - seen, store.notes.length);
      seen = store.noted || 0;
      if (n > 0) store.notes.slice(-n).forEach(function(text) { push({ t: t, e: 'n', note: text }); });

      var at = where(), st = at && at.act.walkthroughStopState, p = at && at.place;
      var ev = {
        y: Math.round(window.scrollY * 10) / 10,
        ih: window.innerHeight,
        mv: WS && WS.viewport.moving() ? 1 : 0,
        act: at ? at.act.getAttribute('data-hud-label') : null,
        stop: st ? st.index : null, ph: st ? st.phase : null,
        seg: p ? p.type : null, k: p && p.stop != null ? p.stop : null,
        f: p ? Math.round(p.frac * 1000) / 1000 : null
      };

      var ht = window.HeroTrace;
      if (ht) ev.h = ht.sample();
      var key = JSON.stringify(ev);
      if (e === 'f' && key === last && !(ht && ev.mv)) return;
      last = key;
      ev.t = t; ev.e = e;
      push(ev);
    }

    window.addEventListener('scroll', function() { record('s'); }, { passive: true });
    (function frame() { record('f'); requestAnimationFrame(frame); })();
    window.addEventListener('pagehide', function() {
      if (queue.length) navigator.sendBeacon(URL, body());
    });
    m.set('trace', session);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
