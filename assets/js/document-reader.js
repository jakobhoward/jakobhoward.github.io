

(function () {
  'use strict';

  var zoom = document.querySelector('[data-doc-zoom]');
  var sheets = document.querySelector('.doc-reader__sheets');
  if (!zoom || !sheets) return;

  var img = zoom.querySelector('[data-doc-zoom-img]');
  var count = zoom.querySelector('[data-doc-count]');
  var prev = zoom.querySelector('[data-doc-step="-1"]');
  var next = zoom.querySelector('[data-doc-step="1"]');

  var figures = [].slice.call(sheets.querySelectorAll('.doc-sheet'));
  var pages = figures.map(function (figure) { return figure.querySelector('.doc-sheet__page'); });
  if (!pages.length || !pages[0]) return;

  var current = 0;
  var lastFocus = null;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  function setInteractive(on) {
    document.querySelector('.doc-reader').classList.toggle('is-interactive', on);
    figures.forEach(function (figure, index) {
      if (on) {
        figure.setAttribute('role', 'button');
        figure.setAttribute('tabindex', '0');
        figure.setAttribute('aria-label', 'Open page ' + (index + 1) + ' of ' + pages.length + ' to read');
      } else {
        figure.removeAttribute('role');
        figure.removeAttribute('tabindex');
        figure.removeAttribute('aria-label');
      }
    });
  }

  function show(index) {
    current = Math.min(pages.length - 1, Math.max(0, index));
    var source = pages[current];
    img.src = source.currentSrc || source.src;
    img.alt = source.alt;
    count.textContent = (current + 1) + ' / ' + pages.length;
    prev.disabled = current === 0;
    next.disabled = current === pages.length - 1;
    zoom.scrollTop = 0;
    zoom.scrollLeft = 0;
  }

  function open(index) {
    lastFocus = document.activeElement;
    zoom.hidden = false;
    document.body.classList.add('doc-zoom-open');
    show(index);
    zoom.querySelector('[data-doc-close]').focus();
  }

  function close() {
    zoom.hidden = true;
    document.body.classList.remove('doc-zoom-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  sheets.addEventListener('click', function (event) {

    if (finePointer.matches) return;
    var figure = event.target.closest('[data-doc-page]');
    if (figure) open(Number(figure.dataset.docPage));
  });

  sheets.addEventListener('keydown', function (event) {
    if (finePointer.matches) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var figure = event.target.closest('[data-doc-page]');
    if (!figure) return;
    event.preventDefault();
    open(Number(figure.dataset.docPage));
  });

  setInteractive(!finePointer.matches);

  if (finePointer.addEventListener) {
    finePointer.addEventListener('change', function (event) { setInteractive(!event.matches); });
  }

  zoom.addEventListener('click', function (event) {
    if (event.target.closest('[data-doc-close]')) return close();
    var step = event.target.closest('[data-doc-step]');
    if (step) show(current + Number(step.dataset.docStep));
  });

  document.addEventListener('keydown', function (event) {
    if (zoom.hidden) return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowRight') show(current + 1);
    else if (event.key === 'ArrowLeft') show(current - 1);
  });
})();
