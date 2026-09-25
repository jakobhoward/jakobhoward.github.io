

(function () {
  'use strict';

  var HEROES = [
    { file: 'hero-02.jpg', label: 'Gas Works · open smile',   src: 42 },
    { file: 'hero-05.jpg', label: 'Gas Works · warm closed',  src: 16 },
    { file: 'hero-07.jpg', label: 'Kubota · closed',          src: 34 },
    { file: 'hero-13.jpg', label: 'Kubota · overcast',        src: 6  },
    { file: 'hero-10.jpg', label: 'Arboretum · closed',       src: 8  },
    { file: 'hero-09.jpg', label: 'Conservatory · quiet',     src: 7  },
    { file: 'hero-04.jpg', label: 'Brick oak · closed',       src: 33 },
    { file: 'hero-11.jpg', label: 'South Lake Union · half',  src: 35 },
    { file: 'hero-15.jpg', label: 'South Lake Union · half',  src: 30 },
    { file: 'hero-16.jpg', label: 'South Lake Union · half',  src: 18 },
    { file: 'hero-01.jpg', label: 'pfp navy · open smile',    src: 41 },
    { file: 'hero-03.jpg', label: 'pfp charcoal · closed',    src: 32 },
    { file: 'hero-06.jpg', label: 'pfp charcoal · golden',    src: 12 },
    { file: 'hero-08.jpg', label: 'pfp navy · closed',        src: 10 },
    { file: 'hero-12.jpg', label: 'pfp charcoal · neutral',   src: 26 },
    { file: 'hero-14.jpg', label: 'pfp charcoal · warm',      src: 21 }
  ];

  var BASE = '/assets/images/about-mockups/';
  var STORE = 'aboutHeroMockup';

  var section = document.querySelector('.about-intro--photo');
  var control = document.querySelector('[data-hero-switcher]');
  if (!section || !control) return;

  var prev = control.querySelector('[data-hero-prev]');
  var next = control.querySelector('[data-hero-next]');
  var count = control.querySelector('[data-hero-count]');

  var index = 0;

  try {
    var saved = parseInt(window.localStorage.getItem(STORE), 10);
    if (!isNaN(saved) && saved >= 0 && saved < HEROES.length) index = saved;
  } catch (e) {   }

  function save(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) {   }
  }

  function availableHeight() {
    var top = section.getBoundingClientRect().top + window.pageYOffset;

    return Math.floor(window.innerHeight - top);
  }

  function applyFit() {
    section.style.minHeight = availableHeight() + 'px';
    section.classList.add('hero-fit');
  }

  function render() {
    var hero = HEROES[index];
    section.style.setProperty('--about-hero-img', "url('" + BASE + hero.file + "')");
    count.textContent = (index + 1) + ' / ' + HEROES.length;
    applyFit();

    save(STORE, String(index));
  }

  function step(delta) {
    index = (index + delta + HEROES.length) % HEROES.length;
    render();
  }

  prev.addEventListener('click', function () { step(-1); });
  next.addEventListener('click', function () { step(1); });

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || event.target.isContentEditable) return;
    if (event.key === 'ArrowLeft') { step(-1); }
    else if (event.key === 'ArrowRight') { step(1); }
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 150);
  });

  HEROES.slice(0, 4).forEach(function (hero) {
    var img = new Image();
    img.src = BASE + hero.file;
  });

  render();
}());
