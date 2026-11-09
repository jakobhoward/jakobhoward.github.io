

(function () {
  'use strict';

  var SCENES = [
    { label: 'Roof · blue hour', outfits: [
      { file: 'outfits/roof-eisenhower-cream-crew.jpg',  label: 'Eisenhower + cream crew' },
      { file: 'outfits/roof-eisenhower-mock-neck.jpg',   label: 'Eisenhower + mock neck' },
      { file: 'outfits/roof-eisenhower-grey-oxford.jpg', label: 'Eisenhower + grey oxford' },
      { file: 'outfits/roof-eisenhower-black-polo.jpg',  label: 'Eisenhower + black polo' },
      { file: 'outfits/roof-eisenhower-blue-oxford.jpg', label: 'Eisenhower + blue oxford' },
      { file: 'outfits/roof-eisenhower-butter-cream.jpg', label: 'Eisenhower + butter-cream sweater' },
      { file: 'outfits/roof-eisenhower-navy-full-zip.jpg', label: 'Eisenhower + navy full-zip' },
      { file: 'outfits/roof-eisenhower-navy-vneck-blue-oxford.jpg', label: 'Eisenhower + navy V-neck + blue oxford' },
      { file: 'outfits/roof-eisenhower-plum-henley.jpg', label: 'Eisenhower + plum henley' },
      { file: 'outfits/roof-bomber-black-polo.jpg',      label: 'Bomber + black polo' },
      { file: 'outfits/roof-bomber-mock-neck.jpg',       label: 'Bomber + mock neck' },
      { file: 'outfits/roof-bomber-blue-oxford.jpg',     label: 'Bomber + blue oxford' },
      { file: 'outfits/roof-bomber-grey-oxford.jpg',     label: 'Bomber + grey oxford' },
      { file: 'outfits/roof-bomber-oakmoss-polo.jpg',    label: 'Bomber + oakmoss polo' },
      { file: 'outfits/roof-bomber-navy-henley.jpg',     label: 'Bomber + navy henley' },
      { file: 'outfits/roof-chore-coat-cream-crew.jpg',  label: 'Chore coat + cream crew' },
      { file: 'outfits/roof-chore-coat-grey-oxford.jpg', label: 'Chore coat + grey oxford' },
      { file: 'outfits/roof-chore-coat-mock-neck.jpg',   label: 'Chore coat + mock neck' },
      { file: 'outfits/roof-chore-coat-black-polo.jpg',  label: 'Chore coat + black polo' },
      { file: 'outfits/roof-chore-coat-butter-cream.jpg', label: 'Chore coat + butter-cream sweater' },
      { file: 'outfits/roof-chore-coat-blue-oxford.jpg', label: 'Chore coat + blue oxford' },
      { file: 'outfits/roof-chore-coat-sage-henley.jpg', label: 'Chore coat + sage henley' },
      { file: 'outfits/roof-burgundy-quarter-zip.jpg',   label: 'Burgundy quarter-zip' },
      { file: 'outfits/roof-mock-neck.jpg',              label: 'Mock neck' },
      { file: 'outfits/roof-cream-crew.jpg',             label: 'Cream grid crew' },
      { file: 'outfits/roof-black-polo.jpg',             label: 'Black polo' },
      { file: 'outfits/roof-butter-cream.jpg',           label: 'Butter-cream sweater' },
      { file: 'outfits/roof-charcoal-vneck-grey-oxford.jpg', label: 'Charcoal V-neck + grey oxford' },
      { file: 'outfits/roof-navy-vneck-blue-oxford.jpg', label: 'Navy V-neck + blue oxford' },
      { file: 'outfits/roof-evergreen-cardigan-grey-oxford.jpg', label: 'Evergreen cardigan + grey oxford' },
      { file: 'outfits/roof-navy-full-zip-grey-oxford.jpg', label: 'Navy full-zip + grey oxford' },
      { file: 'outfits/roof-charcoal-vneck-sage-henley.jpg', label: 'Charcoal V-neck + sage henley' },
      { file: 'outfits/roof-navy-vneck-plum-henley.jpg', label: 'Navy V-neck + plum henley' }
    ] },
    { label: 'Courtyard glass', outfits: [
      { file: 'hero-18.jpg', label: 'Chore coat + cream polo (not owned)' },
      { file: 'outfits/glass-chore-coat-cream-crew.jpg',  label: 'Chore coat + cream crew' },
      { file: 'outfits/glass-chore-coat-grey-oxford.jpg', label: 'Chore coat + grey oxford' },
      { file: 'outfits/glass-chore-coat-burgundy-quarter-zip.jpg', label: 'Chore coat + burgundy quarter-zip' },
      { file: 'outfits/glass-chore-coat-mock-neck.jpg',   label: 'Chore coat + mock neck' },
      { file: 'outfits/glass-eisenhower-cream-crew.jpg',  label: 'Eisenhower + cream crew' },
      { file: 'outfits/glass-eisenhower-blue-oxford.jpg', label: 'Eisenhower + blue oxford' },
      { file: 'outfits/glass-bomber-navy-cable-polo.jpg', label: 'Bomber + navy cable polo' },
      { file: 'outfits/glass-bomber-mock-neck.jpg',       label: 'Bomber + mock neck' },
      { file: 'outfits/glass-cardigan-grey-oxford.jpg',   label: 'Evergreen cardigan + grey oxford' },
      { file: 'outfits/glass-cardigan-blue-oxford.jpg',   label: 'Evergreen cardigan + blue oxford' },
      { file: 'outfits/glass-vneck-grey-oxford.jpg',      label: 'Charcoal V-neck + grey oxford' },
      { file: 'outfits/glass-quarter-zip-grey-oxford.jpg', label: 'Burgundy quarter-zip + grey oxford' },
      { file: 'outfits/glass-burgundy-quarter-zip.jpg',   label: 'Burgundy quarter-zip' },
      { file: 'outfits/glass-mock-neck.jpg',              label: 'Mock neck' },
      { file: 'outfits/glass-cream-crew.jpg',             label: 'Cream grid crew' }
    ] },
    { label: 'Courtyard glass · smile', outfits: [
      { file: 'outfits/glass-brick-chore-coat-cream-crew.jpg',   label: 'Chore coat + cream crew' },
      { file: 'outfits/glass-brick-burgundy-quarter-zip.jpg',    label: 'Burgundy quarter-zip' },
      { file: 'outfits/glass-brick-cardigan-blue-oxford.jpg',    label: 'Evergreen cardigan + blue oxford' },
      { file: 'outfits/glass-brick-quarter-zip-grey-oxford.jpg', label: 'Burgundy quarter-zip + grey oxford' }
    ] },
    { label: 'Navy backdrop · laugh', outfits: [
      { file: 'hero-19.jpg', label: 'Brown knit polo' },
      { file: 'outfits/laugh-burgundy-quarter-zip.jpg',  label: 'Burgundy quarter-zip' },
      { file: 'outfits/laugh-oakmoss-polo.jpg',          label: 'Oakmoss polo' },
      { file: 'outfits/laugh-butter-cream-sweater.jpg',  label: 'Butter-cream sweater' },
      { file: 'outfits/laugh-sage-henley.jpg',           label: 'Sage henley' }
    ] },
    { label: 'Navy backdrop · closed', outfits: [
      { file: 'hero-20.jpg', label: 'Oatmeal sweater polo (not owned)' },
      { file: 'outfits/backdrop-mock-neck.jpg',          label: 'Mock neck' },
      { file: 'outfits/backdrop-cream-crew.jpg',         label: 'Cream grid crew' },
      { file: 'outfits/backdrop-vneck-blue-oxford.jpg',  label: 'Charcoal V-neck + blue oxford' },
      { file: 'outfits/backdrop-plum-henley.jpg',        label: 'Plum henley' },
      { file: 'outfits/backdrop-ocean-teal-tee.jpg',     label: 'Ocean teal tee' },
      { file: 'outfits/backdrop-charcoal-vneck-plum-henley.jpg', label: 'Charcoal V-neck + plum henley' }
    ] },
    { label: 'Lobby · working', outfits: [
      { file: 'hero-21.jpg', label: 'Cream sweater polo (not owned)' },
      { file: 'outfits/lobby-black-polo.jpg',            label: 'Black polo' },
      { file: 'outfits/lobby-navy-cable-polo.jpg',       label: 'Navy cable polo' },
      { file: 'outfits/lobby-vneck-blue-oxford.jpg',     label: 'Navy V-neck + blue oxford' }
    ] },
    { label: 'Earlier mockups', outfits: [
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
    ] }
  ];

  var BASE = '/assets/images/about-mockups/';
  var STORE = 'aboutHeroMockupPick';

  var section = document.querySelector('.about-intro--photo');
  var control = document.querySelector('[data-hero-switcher]');
  if (!section || !control) return;

  var sceneSelect = control.querySelector('[data-hero-scene]');
  var outfitSelect = control.querySelector('[data-hero-outfit]');
  var prev = control.querySelector('[data-hero-prev]');
  var next = control.querySelector('[data-hero-next]');
  var count = control.querySelector('[data-hero-count]');

  var scene = 0;
  var picks = SCENES.map(function () { return 0; });

  try {
    var saved = JSON.parse(window.localStorage.getItem(STORE));
    if (saved && SCENES[saved.scene]) scene = saved.scene;
    if (saved && Array.isArray(saved.picks)) {
      saved.picks.forEach(function (pick, i) {
        if (SCENES[i] && SCENES[i].outfits[pick]) picks[i] = pick;
      });
    }
  } catch (e) {   }

  function save() {
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ scene: scene, picks: picks }));
    } catch (e) {   }
  }

  function fillOptions(select, items) {
    select.textContent = '';
    items.forEach(function (item, i) {
      var option = document.createElement('option');
      option.value = String(i);
      option.textContent = item.label;
      select.appendChild(option);
    });
  }

  var warmed = {};
  function warm(outfits) {
    outfits.forEach(function (hero) {
      if (warmed[hero.file]) return;
      warmed[hero.file] = true;
      new Image().src = BASE + hero.file;
    });
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
    var outfits = SCENES[scene].outfits;
    var hero = outfits[picks[scene]];
    section.style.setProperty('--about-hero-img', "url('" + BASE + hero.file + "')");
    sceneSelect.value = String(scene);
    outfitSelect.value = String(picks[scene]);
    count.textContent = (picks[scene] + 1) + ' / ' + outfits.length;
    applyFit();

    save();
  }

  function showScene(index) {
    scene = index;
    fillOptions(outfitSelect, SCENES[scene].outfits);
    warm(SCENES[scene].outfits);
    render();
  }

  function step(delta) {
    var total = SCENES[scene].outfits.length;
    picks[scene] = (picks[scene] + delta + total) % total;
    render();
  }

  function stepScene(delta) {
    showScene((scene + delta + SCENES.length) % SCENES.length);
  }

  fillOptions(sceneSelect, SCENES);

  sceneSelect.addEventListener('change', function () {
    showScene(parseInt(sceneSelect.value, 10));
  });
  outfitSelect.addEventListener('change', function () {
    picks[scene] = parseInt(outfitSelect.value, 10);
    render();
  });
  prev.addEventListener('click', function () { step(-1); });
  next.addEventListener('click', function () { step(1); });

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
    var delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!delta) return;
    if (event.shiftKey) stepScene(delta);
    else step(delta);
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 150);
  });

  showScene(scene);
}());
