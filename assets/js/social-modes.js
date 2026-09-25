

(function() {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  var PI = Math.PI;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.social-post-time[data-date]').forEach(function(el) {
      var at = new Date(el.dataset.date).getTime();

      if (!isFinite(at)) return;
      var weeks = Math.floor((Date.now() - at) / 604800000);

      el.textContent = weeks < 52 ? weeks + 'w'
        : weeks < 104 ? Math.floor(weeks / 4.345) + 'mo'
        : Math.floor(weeks / 52.18) + 'y';
    });
  });

  if (reducedMotion || window.innerWidth <= 768) return;

  document.addEventListener('DOMContentLoaded', function() {

    var section = document.querySelector('.social-embeds-section');
    if (!section) return;
    var cards = Array.from(section.querySelectorAll('.social-embed--extracted'));

    if (cards.length < 2) return;
    var N = cards.length;
    var grid = section.querySelector('.social-grid');
    if (!grid) return;

    init();

    function init() {
      var suspended = false;
      section.classList.add('social-mode--stack');
      section.classList.add('social-mode--thumbs');

      var container = section.querySelector('.container');
      var sticky = document.createElement('div');
      sticky.className = 'social-sticky';
      section.insertBefore(sticky, container);
      sticky.appendChild(container);
      section.style.height = (N * 75) + 'vh';

      var bgWrap = document.createElement('div');
      bgWrap.className = 'social-morph-bgs';
      var bgLayers = [];
      cards.forEach(function(card, i) {
        var layer = document.createElement('div');
        layer.className = 'social-morph-bg';
        var img = card.querySelector('.social-post-image img');
        if (img) {
          var bgImg = document.createElement('img');
          bgImg.src = img.src;
          bgImg.alt = '';
          layer.appendChild(bgImg);
        }
        layer.style.opacity = i === 0 ? '1' : '0';
        bgWrap.appendChild(layer);
        bgLayers.push(layer);
      });
      sticky.insertBefore(bgWrap, sticky.firstChild);

      var cardImages = cards.map(function(c) {
        return c.querySelector('.social-post-image img');
      });
      var cardVideos = cards.map(function(c) {
        return c.querySelector('.social-post-image video');
      });

      function setMediaTransform(i, v) {
        if (cardImages[i]) cardImages[i].style.transform = v;
        if (cardVideos[i]) cardVideos[i].style.transform = v;
      }

      var sectionVisible = false;
      cardVideos.forEach(function(v) { if (v) v.muted = true; });

      function syncVideos(activeIdx) {
        cardVideos.forEach(function(v, i) {
          if (!v) return;
          if (i === activeIdx && sectionVisible && !suspended) {
            if (v.paused) {
              var p = v.play();
              if (p && p.catch) p.catch(function() {});
            }
          } else if (!v.paused) {
            v.pause();
          }
        });
      }

      if (cardVideos.some(function(v) { return v; }) && 'IntersectionObserver' in window) {
        new IntersectionObserver(function(entries) {
          sectionVisible = entries[0].isIntersecting;
          syncVideos(lastActive);
        }, { threshold: 0.3 }).observe(section);
      }

      function measureCards() {

        cards.forEach(function(c) {
          var hasCssHeight = c.classList.contains('social-embed--portrait') ||
            c.classList.contains('social-embed--square');
          c.style.height = hasCssHeight ? '' : 'auto';
        });

        var h, max = 0;
        cards.forEach(function(c) {
          h = parseFloat(getComputedStyle(c).height);
          if (h > max) max = h;
        });
        max = Math.ceil(max);
        grid.style.height = max + 'px';
        cards.forEach(function(c) { c.style.height = max + 'px'; });
      }

      function positionCards() {
        cards.forEach(function(c, i) {
          c.style.position = 'absolute';
          c.style.left = '0';
          c.style.right = '0';
          c.style.top = '0';
          c.style.zIndex = String(N + 1 - i);
          c.style.willChange = 'transform, opacity, box-shadow';
        });
      }
      positionCards();
      measureCards();

      if (document.fonts && document.fonts.status !== 'loaded') {
        document.fonts.ready.then(function() {
          if (suspended) return;
          measureCards();
          cardWidth = cards[0].offsetWidth;
          clearSlide = Math.min(cardWidth / ARC_X, 0.95);
          update();
        });
      }

      function suspend() {
        suspended = true;
        completing = false;
        snapping = false;
        animatedProgress = null;
        settledProgress = null;
        pulse.idx = -1;
        section.classList.remove('social-mode--stack', 'social-mode--thumbs');
        section.style.height = '';

        sticky.style.position = 'static';
        sticky.style.height = 'auto';
        sticky.style.overflow = 'visible';
        sticky.style.display = 'block';
        bgWrap.style.display = 'none';
        strip.style.display = 'none';
        grid.style.height = '';
        grid.style.transform = '';

        cards.forEach(function(c, i) {
          c.style.position = '';
          c.style.left = '';
          c.style.right = '';
          c.style.top = '';
          c.style.zIndex = '';
          c.style.transform = '';
          c.style.transformOrigin = '';
          c.style.opacity = '';
          c.style.boxShadow = '';
          c.style.pointerEvents = '';
          c.style.height = '';
          c.style.transition = '';
          c.style.willChange = '';
          setMediaTransform(i, '');
          if (cardVideos[i] && !cardVideos[i].paused) cardVideos[i].pause();
        });
      }

      function resume() {
        suspended = false;
        section.classList.add('social-mode--stack');
        section.classList.add('social-mode--thumbs');
        section.style.height = (N * 75) + 'vh';
        sticky.style.position = '';
        sticky.style.height = '';
        sticky.style.overflow = '';
        sticky.style.display = '';
        bgWrap.style.display = '';
        strip.style.display = '';
        positionCards();
        measureCards();
        cardWidth = cards[0].offsetWidth;
        clearSlide = Math.min(cardWidth / ARC_X, 0.95);
        for (var ti = 0; ti < thumbEls.length; ti++) {
          thumbEls[ti].classList.toggle('active', ti === 0);
          thumbEls[ti].style.transform = '';
        }
        lastActive = 0;
        lastTopCard = 0;
        settledProgress = null;
        update();
        syncVideos(lastActive);
      }

      var resizeTimer = null;
      window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
          if (window.innerWidth <= 768) { if (!suspended) suspend(); return; }
          if (suspended) { resume(); return; }

          settledProgress = null;
          measureCards();
          cardWidth = cards[0].offsetWidth;
          clearSlide = Math.min(cardWidth / ARC_X, 0.95);
        }, 200);
      }, { passive: true });

      function scrollToCard(i) {
        startComplete(i);
      }

      var strip = document.createElement('div');
      strip.className = 'social-thumb-strip';
      var progressBars = [];
      cards.forEach(function(card, i) {
        var btn = document.createElement('button');
        btn.className = 'social-thumb' + (i === 0 ? ' active' : '');
        btn.style.position = 'relative';
        btn.setAttribute('aria-label', 'View post ' + (i + 1));
        var img = card.querySelector('.social-post-image img');
        if (img) {
          var thumbImg = document.createElement('img');
          thumbImg.src = img.src;
          thumbImg.alt = '';
          btn.appendChild(thumbImg);
        } else {

          var cap = card.querySelector('.social-post-caption p');
          var thumbTxt = document.createElement('span');
          thumbTxt.className = 'social-thumb-text';
          thumbTxt.textContent = cap ? cap.textContent.trim().slice(0, 44) : '';
          btn.appendChild(thumbTxt);
        }
        var fill = document.createElement('div');
        fill.className = 'social-thumb-progress';
        btn.appendChild(fill);
        progressBars.push(fill);
        btn.addEventListener('click', function() { scrollToCard(i); });
        strip.appendChild(btn);
      });

      strip.style.setProperty('--thumb-count', String(N));
      sticky.appendChild(strip);
      var thumbEls = strip.querySelectorAll('.social-thumb');

      document.addEventListener('keydown', function(e) {
        if (suspended) return;
        var rect = section.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        if (e.key === 'ArrowRight' && lastActive < N - 1) {
          e.preventDefault();
          scrollToCard(lastActive + 1);
        } else if (e.key === 'ArrowLeft' && lastActive > 0) {
          e.preventDefault();
          scrollToCard(lastActive - 1);
        }
      });

      var completing = false;
      var completeStart = 0;
      var completeFrom = 0;
      var completeTo = 0;
      var completeDuration = 400;
      var animatedProgress = null;

      var settledProgress = null;
      var settledScrollY = 0;

      function startComplete(targetIdx) {
        completing = true;
        snapping = true;
        settledProgress = null;
        completeStart = performance.now();
        completeFrom = animatedProgress !== null ? animatedProgress : getProgress();
        completeTo = targetIdx / N;

        var dist = Math.abs(completeTo - completeFrom) * N;
        completeDuration = clamp(300 + dist * 260, 360, 900);

        var sTop = window.scrollY + section.getBoundingClientRect().top;
        var runway = section.offsetHeight - window.innerHeight;
        window.scrollTo(0, sTop + completeTo * runway);
        requestAnimationFrame(driveComplete);
      }

      function driveComplete(now) {
        if (!completing) return;
        var elapsed = now - completeStart;
        var p = Math.min(elapsed / completeDuration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        animatedProgress = completeFrom + (completeTo - completeFrom) * eased;
        update();
        if (p < 1) {
          requestAnimationFrame(driveComplete);
        } else {
          animatedProgress = null;
          settledProgress = completeTo;
          settledScrollY = window.scrollY;
          completing = false;
          snapping = false;
          update();
        }
      }

      var INTENT_WINDOW = 200;
      var lastIntentTime = -Infinity;
      function markIntent() { lastIntentTime = performance.now(); }
      window.addEventListener('wheel', markIntent, { passive: true });
      window.addEventListener('touchstart', markIntent, { passive: true });
      window.addEventListener('touchmove', markIntent, { passive: true });

      document.addEventListener('keydown', function(e) {
        if (e.key === 'Home' || e.key === 'End' ||
            e.key === 'PageUp' || e.key === 'PageDown') {
          lastIntentTime = -Infinity;
        }
      });

      function snapLog(msg, data) {
        if (window.debug && window.debug.flag('social-snap')) {
          window.debug.log('social-snap', msg, data || '');
        }
      }

      var snapTimer = null;
      var snapping = false;
      var lastScrollY = window.scrollY;
      var lastScrollTime = performance.now();
      window.addEventListener('scroll', function() {
        if (suspended || snapping) return;

        if (settledProgress !== null && Math.abs(window.scrollY - settledScrollY) > 2) {
          settledProgress = null;
        }
        var currentY = window.scrollY;
        var now = performance.now();
        var dt = now - lastScrollTime;
        var scrollDir = currentY > lastScrollY ? 1 : -1;
        var velocity = dt > 0 ? Math.abs(currentY - lastScrollY) / dt : 0;
        lastScrollY = currentY;
        lastScrollTime = now;

        if (velocity > 0.8) {
          var seg = getProgress() * N;
          var idx = Math.min(Math.floor(seg), N - 1);
          var frac = seg - idx;
          if (idx < N - 1 && frac > 0.15 && frac < 0.85) {
            if (now - lastIntentTime >= INTENT_WINDOW) {
              snapLog('flick ignored — ballistic transit',
                { velocity: +velocity.toFixed(3), frac: +frac.toFixed(3) });
            } else {
              var target = scrollDir > 0 ? idx + 1 : idx;
              snapLog('flick commit', { target: target, velocity: +velocity.toFixed(3) });
              clearTimeout(snapTimer);
              startComplete(target);
              return;
            }
          }
        }

        clearTimeout(snapTimer);
        snapTimer = setTimeout(function() {

          if (suspended) return;
          var seg = getProgress() * N;
          var idx = Math.min(Math.floor(seg), N - 1);
          var frac = seg - idx;
          if (idx < N - 1 && frac > 0.05 && frac < 0.95) {
            var threshold = scrollDir > 0 ? 0.3 : 0.7;
            var target = frac >= threshold ? idx + 1 : idx;
            snapLog('settle commit', { target: target, frac: +frac.toFixed(3) });
            startComplete(target);
          }
        }, 120);
      }, { passive: true });

      function getProgress() {
        var rect = section.getBoundingClientRect();
        var runway = section.offsetHeight - window.innerHeight;
        if (runway <= 0) return 0;
        return clamp(-rect.top / runway, 0, 1);
      }

      var seatRim = getComputedStyle(section).getPropertyValue('--glass-seat-rim').trim();
      var rimPrefix = seatRim ? seatRim + ', ' : '';
      var baseShadow = rimPrefix + '0 8px 32px rgba(0,0,0,0.15)';
      var lastActive = 0;
      var lastTopCard = 0;

      var PULSE_MS = 450;
      var pulse = { idx: -1, start: 0 };
      var pulseRaf = false;

      function pulseState(i, now) {
        if (pulse.idx !== i) return null;
        var k = (now - pulse.start) / PULSE_MS;
        if (k >= 1) { pulse.idx = -1; return null; }

        var e = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
        return {
          scale: 0.97 + 0.03 * e,
          opacity: 0.92 + 0.08 * Math.min(k * 2, 1)
        };
      }

      function ensurePulseFrames() {
        if (pulseRaf) return;
        pulseRaf = true;
        requestAnimationFrame(function tick() {
          if (pulse.idx === -1 || suspended) { pulseRaf = false; return; }
          if (!completing) update();
          requestAnimationFrame(tick);
        });
      }

      var ARC_PEAK = -120;
      var ARC_X = 1000;
      var ARC_ROT = 25;
      var ARC_SCALE_DIP = 0.08;
      var STACK_TILT = 3;

      var cardWidth = cards[0].offsetWidth;
      var clearSlide = Math.min(cardWidth / ARC_X, 0.95);

      function easeAsymmetric(v) {
        if (v < 0.4) {
          var p = v / 0.4;
          return 0.5 * p * p;
        }
        var p = (v - 0.4) / 0.6;
        return 0.5 + 0.5 * (1 - (1 - p) * (1 - p));
      }

      function update() {
        if (suspended) return;
        var now = performance.now();
        var progress = animatedProgress !== null ? animatedProgress
          : settledProgress !== null ? settledProgress
          : getProgress();

        var seg = progress * N;
        var active = Math.min(Math.floor(seg), N - 1);
        var t = seg - active;

        var dispActive = active;
        if (active < N - 1 && easeAsymmetric(t) >= clearSlide) dispActive = active + 1;

        if (active !== lastTopCard) {
          if (active > lastTopCard) {
            pulse.idx = active;
            pulse.start = now;
            ensurePulseFrames();
          } else {
            pulse.idx = -1;
          }
          lastTopCard = active;
        }
        var peekCount = Math.min(N - active - 2, 2);
        var backY = Math.max(peekCount + 1, 1) * 6 + 8;
        var nextPeekCount = Math.min(N - active - 3, 2);
        var nextBackY = Math.max(nextPeekCount + 1, 1) * 6 + 8;

        cards.forEach(function(c, i) {
          var dir = (i % 2 === 0) ? 1 : -1;

          if (i < active) {

            if (i === active - 1) {
              c.style.transform = 'translateY(' + backY + 'px) scale(' + (1 - (peekCount + 2) * 0.015) + ')';
              c.style.opacity = '0.25';
            } else {
              c.style.opacity = '0';
            }
            c.style.zIndex = '0';
            c.style.boxShadow = baseShadow;
            c.style.pointerEvents = 'none';
            c.style.transformOrigin = 'center center';
            setMediaTransform(i, '');

          } else if (i === active && active < N - 1) {

            var tEased = easeAsymmetric(t);
            var slide = tEased;
            var arcX, arcY, arcRot, arcScale, zFront;
            var siftPulse = pulseState(i, now);

            if (slide < clearSlide) {

              var outP = slide / clearSlide;
              arcX = ARC_X * slide * dir;
              arcY = ARC_PEAK * outP;
              arcRot = ARC_ROT * outP * dir;
              arcScale = 1 - ARC_SCALE_DIP * outP;
              zFront = true;
            } else {

              var retP = (slide - clearSlide) / (1 - clearSlide);
              var retEased = retP * retP * (3 - 2 * retP);
              arcX = ARC_X * clearSlide * (1 - retEased) * dir;
              arcY = ARC_PEAK * (1 - retEased) + nextBackY * retEased;
              arcRot = ARC_ROT * (1 - retEased) * dir;
              arcScale = (1 - ARC_SCALE_DIP) + (ARC_SCALE_DIP - (nextPeekCount + 2) * 0.015) * retEased;
              zFront = false;
            }

            var lift = Math.abs(arcY) / Math.abs(ARC_PEAK);
            var shadowX = -arcX * 0.15;
            var shadowY = 8 + lift * 30;
            var shadowBlur = 32 + lift * 24;
            var shadowAlpha = 0.15 + lift * 0.1;
            var contactAlpha = 0.08 * (1 - slide);

            var rimAlpha = lift * 0.25;
            var rimWidth = lift * 2;

            if (siftPulse) arcScale *= siftPulse.scale;
            c.style.transformOrigin = dir > 0 ? 'bottom left' : 'bottom right';
            c.style.transform = 'translateY(' + arcY + 'px) translateX(' + arcX + 'px) rotate(' + arcRot + 'deg) scale(' + arcScale + ')';
            c.style.opacity = zFront ? String(siftPulse ? siftPulse.opacity : 1) : String(Math.max(1 - (slide - clearSlide) / (1 - clearSlide) * 0.75, 0.25));
            c.style.zIndex = zFront ? String(N + 1) : '0';
            c.style.boxShadow = rimPrefix + shadowX + 'px ' + shadowY + 'px ' + shadowBlur + 'px rgba(0,0,0,' + shadowAlpha + '), 0 2px 6px rgba(0,0,0,' + contactAlpha + '), inset 0 ' + rimWidth + 'px 0 rgba(255,255,255,' + rimAlpha + ')';
            c.style.pointerEvents = zFront ? 'auto' : 'none';

            setMediaTransform(i, 'translate(' + (-arcX * 0.02) + 'px, ' + (-arcY * 0.05) + 'px) scale(1.05)');

          } else if (i === active) {

            var restPulse = pulseState(i, now);
            c.style.transformOrigin = 'center center';
            c.style.transform = 'translateY(0) rotate(0deg) scale(' + (restPulse ? restPulse.scale : 1) + ')';
            c.style.opacity = restPulse ? String(restPulse.opacity) : '1';
            c.style.zIndex = String(N + 1);
            c.style.boxShadow = baseShadow;
            c.style.pointerEvents = 'auto';
            setMediaTransform(i, '');

          } else {

            var depth = i - active - 1;
            var release = t < 0.15 ? t / 0.15 : 1;
            var breatheY = (1 - release) * 3;
            var peekY = depth * 6 + 6 + breatheY;
            var breatheScale = (1 - (depth + 1) * 0.015) + release * 0.005;
            c.style.transformOrigin = 'center center';
            c.style.transform = 'translateY(' + peekY + 'px) scale(' + breatheScale + ')';
            c.style.opacity = depth > 2 ? '0' : '1';
            c.style.zIndex = String(N - depth);
            c.style.boxShadow = baseShadow;
            c.style.pointerEvents = 'none';
            setMediaTransform(i, '');
          }
        });

        var activeDir = (active % 2 === 0) ? 1 : -1;
        if (active < N - 1 && t > 0 && t < 1) {

          var tiltCurve = Math.sin(PI * Math.min(t / 0.5, 1)) * Math.max(1 - t / 0.7, 0);
          grid.style.transformOrigin = 'center bottom';
          grid.style.transform = 'rotate(' + (STACK_TILT * tiltCurve * -activeDir) + 'deg)';
        } else {
          grid.style.transform = '';
        }

        var bgBell = Math.sin(PI * t);
        var hueShift = bgBell * 8;
        bgLayers.forEach(function(bg, i) {
          if (i === active && active < N - 1) {
            bg.style.opacity = String(1 - t);
            bg.firstChild && (bg.firstChild.style.filter = 'blur(' + (25 - bgBell * 8) + 'px) saturate(' + (150 + bgBell * 30) + '%) brightness(' + (0.45 + bgBell * 0.1) + ') hue-rotate(' + hueShift + 'deg)');
          } else if (i === active + 1 && active < N - 1) {
            bg.style.opacity = String(t);
            bg.firstChild && (bg.firstChild.style.filter = 'blur(25px) saturate(150%) brightness(0.45) hue-rotate(' + (-hueShift) + 'deg)');
          } else if (i === active) {
            bg.style.opacity = '1';
            bg.firstChild && (bg.firstChild.style.filter = '');
          } else {
            bg.style.opacity = '0';
          }
        });

        if (dispActive !== lastActive) {
          for (var j = 0; j < thumbEls.length; j++) {
            if (j === dispActive) {
              thumbEls[j].classList.add('active');
            } else {
              thumbEls[j].classList.remove('active');

              thumbEls[j].style.transform = '';
            }
          }

          if (thumbEls[dispActive]) {
            var bounceThumb = thumbEls[dispActive];
            bounceThumb.style.transform = 'scale(1.2)';
            setTimeout(function() {
              bounceThumb.style.transform = '';
            }, 200);
          }
          lastActive = dispActive;
          syncVideos(dispActive);
        }

        var intra = clamp(t, 0, 1);
        progressBars.forEach(function(bar, i) {
          var s = i === active ? intra : (i < active ? 1 : 0);
          bar.style.transform = 'scaleY(' + s + ')';
        });
      }

      var ticking = false;
      window.addEventListener('scroll', function() {
        if (suspended) return;
        if (completing || !ticking) {
          if (completing) return;
          var rect = section.getBoundingClientRect();
          if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;
          ticking = true;
          requestAnimationFrame(function() { update(); ticking = false; });
        }
      }, { passive: true });
      update();
    }

  });
})();
