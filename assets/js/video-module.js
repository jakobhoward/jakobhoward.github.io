

(function () {
  'use strict';

  const root = document.querySelector('.vm');
  const player = root && root.querySelector('[data-vm-player]');
  const reel = root && root.querySelector('[data-vm-reel]');
  const strip = reel && reel.querySelector('.vm-scenes');
  if (!player || !strip || !window.VideoFacade) return;

  const HOST = window.VideoFacade.host;
  const AUTO_MS = 8000;
  const HOLD_MS = 12000;
  const SETTLE_MS = 1200;
  const PLAYING = 1, BUFFERING = 3;
  const LINGER_S = 0.3;

  const scenes = [...strip.querySelectorAll('.vm-scene')];
  const times = scenes.map(s => Number(s.dataset.t));
  const dots = [...reel.querySelectorAll('.vm-dot')];
  const lines = [...strip.querySelectorAll('.vm-line[data-end]')].map(p => {
    const words = [...p.querySelectorAll('.vm-w')];
    return { words, starts: words.map(w => Number(w.dataset.s)), end: Number(p.dataset.end) };
  });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const behavior = () => (reduce.matches ? 'auto' : 'smooth');
  const autoOn = () => getComputedStyle(reel).getPropertyValue('--vm-auto').trim() === '1';

  let iframe = null;
  let live = false;
  let playing = false;
  let current = -1;
  let at = 0;
  let holdUntil = 0;
  let ownScrollAt = -Infinity;
  let inView = false;
  let timer = 0;
  let clockT = 0;
  let clockAt = 0;
  let rate = 1;
  let running = false;
  let said = null;
  let ticking = false;

  const sceneAt = sec => {
    let i = -1;
    times.forEach((t, k) => { if (t <= sec + 0.25) i = k; });
    return i;
  };
  const stripPad = () => parseFloat(getComputedStyle(strip).paddingLeft) || 0;

  function setAt(i) {
    at = i;
    dots.forEach((d, k) => {
      d.classList.toggle('is-at', k === i);
      if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
  }

  function show(i, how) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    ownScrollAt = performance.now();
    strip.scrollTo({ left: scenes[i].offsetLeft - stripPad(), behavior: how || behavior() });
    setAt(i);
  }

  function mark(i) {
    if (i === current) return;
    current = i;
    scenes.forEach((s, k) => s.classList.toggle('is-current', k === i));
    if (i >= 0 && performance.now() > holdUntil) show(i);
  }

  const hold = () => { holdUntil = performance.now() + HOLD_MS; };

  const now = () => clockT + (running ? ((performance.now() - clockAt) / 1000) * rate : 0);

  function wordAt(sec) {
    for (const l of lines) {
      if (sec < l.starts[0] || sec >= l.end + LINGER_S) continue;
      let k = 0;
      while (k + 1 < l.starts.length && l.starts[k + 1] <= sec) k++;
      return l.words[k];
    }
    return null;
  }

  function markWord() {
    const w = wordAt(now());
    if (w === said) return;
    if (said) said.classList.remove('is-said');
    if (w) w.classList.add('is-said');
    said = w;
  }

  function frame() {
    markWord();
    if (running) requestAnimationFrame(frame); else ticking = false;
  }

  function clock(t) {
    if (typeof t === 'number') { clockT = t; clockAt = performance.now(); }
    if (!lines.length) return;
    if (running && !ticking) { ticking = true; requestAnimationFrame(frame); } else markWord();
  }

  function arm() {
    if (!timer && inView) timer = setTimeout(tick, AUTO_MS);
  }
  function tick() {
    timer = 0;
    const idle = !(live && playing);
    const held = performance.now() < holdUntil;
    if (inView && idle && !held && autoOn() && !reduce.matches && !reel.matches(':hover, :focus-within')) {
      show((at + 1) % scenes.length);
    }
    arm();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries.some(e => e.isIntersecting);
      if (inView) arm(); else if (timer) { clearTimeout(timer); timer = 0; }
    }, { threshold: 0.4 }).observe(reel);
  } else {
    inView = true;
    arm();
  }

  function send(func, args) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), HOST);
    }
  }

  function showPlayer() {
    const r = player.getBoundingClientRect();
    const top = window.WalkthroughShared && WalkthroughShared.chromeOffset ? WalkthroughShared.chromeOffset() : 0;
    if (r.top < top || r.bottom > window.innerHeight) player.scrollIntoView({ block: 'start', behavior: behavior() });
  }

  function playFrom(t) {
    if (!iframe) {
      iframe = window.VideoFacade.mount(player.querySelector('.video-facade'), { start: t });
    } else if (live) {
      send('seekTo', [t, true]);
      send('playVideo');
    } else {
      const url = new URL(iframe.src);
      url.searchParams.set('start', String(t));
      iframe.src = url.toString();
    }
    holdUntil = 0;
    mark(sceneAt(t));
    showPlayer();
  }

  document.addEventListener('videofacade:mount', e => {
    if (!player.contains(e.target)) return;
    iframe = e.detail.iframe;
    iframe.addEventListener('load', () => {
      let tries = 0;
      const hello = setInterval(() => {
        if (live || ++tries > 40 || !iframe.contentWindow) { clearInterval(hello); return; }
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'campaign-video', channel: 'widget' }), HOST);
      }, 250);
    });
  });

  window.addEventListener('message', e => {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== HOST) return;
    let data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
    if (!data || typeof data !== 'object') return;
    live = true;
    const info = data.info;
    if (info && typeof info.playbackRate === 'number' && info.playbackRate > 0) rate = info.playbackRate;
    if (info && typeof info.playerState === 'number') {
      playing = info.playerState === PLAYING || info.playerState === BUFFERING;

      const runs = info.playerState === PLAYING;
      if (runs !== running) { clockT = now(); clockAt = performance.now(); running = runs; }
    }
    const t = info && info.currentTime;
    if (data.event === 'infoDelivery' && typeof t === 'number') mark(sceneAt(t));
    if (data.event === 'infoDelivery' || data.event === 'onReady') clock(data.event === 'infoDelivery' ? t : undefined);
  });

  strip.addEventListener('click', e => {
    const btn = e.target.closest('.vm-time');
    if (btn) playFrom(Number(btn.dataset.t));
  });

  reel.addEventListener('click', e => {
    const dot = e.target.closest('.vm-dot');
    if (!dot) return;
    hold();
    show(dots.indexOf(dot));
  });

  let queued = false;
  strip.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (performance.now() - ownScrollAt < SETTLE_MS) return;
      const left = strip.scrollLeft + stripPad();
      let best = 0;
      scenes.forEach((s, i) => {
        if (Math.abs(s.offsetLeft - left) < Math.abs(scenes[best].offsetLeft - left)) best = i;
      });
      if (best !== at) { hold(); setAt(best); }
    });
  }, { passive: true });

  setAt(0);
})();
