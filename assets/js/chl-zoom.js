

(function () {
  'use strict';

  var section = document.querySelector('.chl');
  var dialog = section && section.querySelector('.chl-zoom-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  var img = dialog.querySelector('.chl-zoom-img');
  var title = dialog.querySelector('.chl-zoom-title');
  var frames = [].slice.call(section.querySelectorAll('.chl-row-media'));
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var opener = null;

  function log(msg, data) {
    if (window.debug && window.debug.flag('chl-zoom')) window.debug.log('chl-zoom', msg, data || '');
  }

  function setInteractive(on) {
    section.classList.toggle('is-zoomable', on);
    frames.forEach(function (frame) {
      if (on) {
        frame.setAttribute('role', 'button');
        frame.setAttribute('tabindex', '0');
      } else {
        frame.removeAttribute('role');
        frame.removeAttribute('tabindex');
      }
    });
    log('interactive', on);
  }

  function open(frame) {
    var source = frame.querySelector('img');
    var label = frame.parentNode.querySelector('.chl-row-label');
    img.src = source.currentSrc || source.src;
    img.alt = source.alt;
    img.setAttribute('width', source.getAttribute('width'));
    img.setAttribute('height', source.getAttribute('height'));
    title.textContent = label ? label.textContent : '';
    opener = frame;
    document.body.classList.add('chl-zoom-open');
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.scrollLeft = 0;

    dialog.focus();
    log('open', img.src);
  }

  section.addEventListener('click', function (event) {
    if (!section.classList.contains('is-zoomable')) return;
    var frame = event.target.closest('.chl-row-media');
    if (frame) open(frame);
  });

  section.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!section.classList.contains('is-zoomable')) return;
    var frame = event.target.closest('.chl-row-media');
    if (!frame) return;
    event.preventDefault();
    open(frame);
  });

  dialog.addEventListener('click', function (event) {
    if (event.target !== img) dialog.close();
  });

  dialog.addEventListener('close', function () {
    document.body.classList.remove('chl-zoom-open');
    if (opener) opener.focus({ preventScroll: true });
    log('close');
  });

  setInteractive(!finePointer.matches);

  if (finePointer.addEventListener) {
    finePointer.addEventListener('change', function (event) { setInteractive(!event.matches); });
  }
})();
