

(function () {
  var canvases = document.querySelectorAll('canvas.walkthrough-bg-fx[data-bg-effect]');
  if (!canvases.length) return;
  if (!document.createElement('canvas').getContext) return;

  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');

  var sprites = [makeSprite(22), makeSprite(33), makeSprite(44)];

  Array.prototype.forEach.call(canvases, function (canvas) { setupEmbers(canvas); });

  function makeSprite(hue) {
    var s = 64;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'hsla(' + (hue + 14) + ', 100%, 88%, 1)');
    grad.addColorStop(0.25, 'hsla(' + hue + ', 96%, 62%, 0.85)');
    grad.addColorStop(0.6, 'hsla(' + (hue - 6) + ', 92%, 48%, 0.22)');
    grad.addColorStop(1, 'hsla(' + hue + ', 90%, 45%, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  }

  function setupEmbers(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var animated = canvas.getAttribute('data-bg-effect') !== 'glow';

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var particles = [];
    var raf = null;
    var running = false;
    var visible = true;
    var lastT = 0;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function makeParticle(initial) {

      return {
        x: rand(0, W),
        y: initial ? rand(0, H) : rand(H, H + 40),
        r: rand(0.6, 2.0),
        vy: rand(8, 20),
        sway: rand(3, 8),
        swaySpeed: rand(0.3, 0.9),
        phase: rand(0, Math.PI * 2),
        life: initial ? rand(0, 6) : 0,
        ttl: rand(7, 14),
        sprite: (Math.random() * sprites.length) | 0,
        bright: Math.random() < 0.08 ? rand(0.5, 0.75) : rand(0.16, 0.4)
      };
    }

    function seed() {
      particles = [];
      if (!W || !H || !animated) return;
      var target = Math.round(Math.min(70, (W * H) / 22000));
      for (var i = 0; i < target; i++) particles.push(makeParticle(true));
    }

    function resize() {
      var w = canvas.clientWidth;
      var h = canvas.clientHeight;
      if (!w || !h) { W = 0; H = 0; particles = []; return; }
      W = w; H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function paintBase() {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#080605');
      g.addColorStop(0.6, '#120b07');
      g.addColorStop(1, '#22140a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      var rg = ctx.createRadialGradient(W * 0.5, H * 1.02, 0, W * 0.5, H * 1.02, Math.max(W, H) * 0.75);
      rg.addColorStop(0, 'rgba(122, 62, 22, 0.22)');
      rg.addColorStop(1, 'rgba(122, 62, 22, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }

    function drawParticles() {
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var f = p.life / p.ttl;
        var alpha = p.bright;
        if (f < 0.15) alpha *= f / 0.15;
        else if (f > 0.65) alpha *= (1 - f) / 0.35;
        if (alpha <= 0.01) continue;
        var x = p.x + Math.sin(p.phase + p.life * p.swaySpeed) * p.sway;
        var size = p.r * 8;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[p.sprite], x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function step(now) {
      if (!running) return;
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
      lastT = now;
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.y -= p.vy * dt;
        p.life += dt;
        if (p.life >= p.ttl || p.y < -12) particles[i] = makeParticle(false);
      }
      paintBase();
      drawParticles();
      raf = requestAnimationFrame(step);
    }

    function renderStatic() {
      if (!W || !H) return;
      for (var i = 0; i < particles.length; i++) particles[i].life = particles[i].ttl * 0.4;
      paintBase();
      drawParticles();
    }

    function start() {
      if (running || !W || !H) return;
      if (!animated || reduceMq.matches) { renderStatic(); return; }
      running = true;
      lastT = 0;
      raf = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    var lastW = -1, lastH = -1, lastDpr = -1;
    function applySize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;

      var d = animated ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      if (w === lastW && h === lastH && d === lastDpr) return;
      lastW = w; lastH = h; lastDpr = d;
      dpr = d;
      resize();
    }

    function refresh() {
      applySize();
      if (reduceMq.matches) { stop(); renderStatic(); }
      else if (visible) start();
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(refresh).observe(canvas);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {

        visible = entries[entries.length - 1].isIntersecting;
        if (visible) refresh(); else stop();
      }, { threshold: 0 }).observe(canvas);
    }

    window.addEventListener('resize', debounce(function () {
      stop();
      applySize();
      if (reduceMq.matches) renderStatic();
      else if (visible) start();
    }, 150));

    if (reduceMq.addEventListener) {
      reduceMq.addEventListener('change', function () {
        stop();
        applySize();
        if (reduceMq.matches) renderStatic(); else if (visible) start();
      });
    }

    applySize();

    if (!('ResizeObserver' in window) && !('IntersectionObserver' in window)) start();

    function debounce(fn, d) {
      var t;
      return function () { clearTimeout(t); t = setTimeout(fn, d); };
    }
  }
})();
