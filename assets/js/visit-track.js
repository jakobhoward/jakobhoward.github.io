

(function () {
  'use strict';

  var ENDPOINT = '/api/collect.php';
  var HEARTBEAT_MS = 15000;
  var FLAG = 'visit-track';

  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  var host = window.location.hostname;
  if (navigator.webdriver || window.location.protocol === 'file:' ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(host) ||
      /\.local$/.test(host)) return;

  var dbg = window.debug || { flag: function () { return false; }, log: function () {} };

  var token = null;
  try {
    var params = new URLSearchParams(window.location.search);
    var k = params.get('k');
    if (k && /^[A-Za-z0-9]{1,12}(-[A-Za-z])?$/.test(k)) token = k.toLowerCase();

    if (k !== null) {
      params.delete('k');
      var qs = params.toString();
      var clean = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      window.history.replaceState(null, '', clean);
    }
  } catch (e) {

  }

  function send(payload) {
    payload.path = window.location.pathname;
    if (token) payload.k = token;

    dbg.log(FLAG, payload.kind, payload);

    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        return;
      }
      fetch(ENDPOINT, {
        method: 'POST',
        body: body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () {});
    } catch (e) {

    }
  }

  function environment() {
    var tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}

    var w = window.innerWidth;
    var device = w < 768 ? 'mobile' : (w < 1100 ? 'tablet' : 'desktop');

    return {
      tz: tz,
      device: device,
      referrer: document.referrer || null
    };
  }

  var env = environment();
  send({
    kind: 'pageview',
    tz: env.tz,
    device: env.device,
    referrer: env.referrer
  });

  var beats = 0;
  var timer = null;

  function beat() {
    if (document.hidden) return;
    beats++;
    send({ kind: 'heartbeat', detail: String(beats * (HEARTBEAT_MS / 1000)) });
  }

  function startBeating() {
    if (timer === null) timer = window.setInterval(beat, HEARTBEAT_MS);
  }

  function stopBeating() {
    if (timer !== null) { window.clearInterval(timer); timer = null; }
  }

  startBeating();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopBeating(); else startBeating();
  });

  if ('IntersectionObserver' in window) {
    var seen = Object.create(null);
    var sections = document.querySelectorAll('section[id], [data-track-section]');

    if (sections.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var name = entry.target.getAttribute('data-track-section') || entry.target.id;
          if (!name || seen[name]) return;
          seen[name] = true;
          send({ kind: 'section', detail: name });
        });
      }, { threshold: 0.5 });

      Array.prototype.forEach.call(sections, function (el) { io.observe(el); });
    }
  }

  document.addEventListener('click', function (evt) {
    var link = evt.target.closest && evt.target.closest('a[href*="/projects/"]');
    if (!link) return;
    send({ kind: 'project_open', detail: link.getAttribute('href') });
  }, { passive: true });

  if (window.matchMedia) {
    var printMq = window.matchMedia('print');
    var onPrint = function (mq) { if (mq.matches) send({ kind: 'print' }); };
    if (printMq.addEventListener) printMq.addEventListener('change', onPrint);
    else if (printMq.addListener) printMq.addListener(onPrint);
  }
  window.addEventListener('beforeprint', function () { send({ kind: 'print' }); });

  window.addEventListener('pagehide', function () {
    stopBeating();
    send({ kind: 'exit', detail: String(beats * (HEARTBEAT_MS / 1000)) });
  });
})();
