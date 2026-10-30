

(function () {
  'use strict';

  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  var FRAMES = '.chl-row-media, .chl-zoom-frame';

  function log(msg, data) {
    if (window.debug && window.debug.flag('chl-zoom')) window.debug.log('chl-zoom', msg, data || '');
  }

  [].forEach.call(document.querySelectorAll('.chl'), bind);

  function bind(section) {
    var dialog = section.querySelector('.chl-zoom-dialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    var img = dialog.querySelector('.chl-zoom-img');
    var title = dialog.querySelector('.chl-zoom-title');
    var frames = [].slice.call(section.querySelectorAll(FRAMES));
    var opener = null;

    function always(frame) { return frame.hasAttribute('data-zoom-always'); }

    function setInteractive(on) {
      section.classList.toggle('is-zoomable', on);
      frames.forEach(function (frame) {
        if (on || always(frame)) {
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
      var full = source.getAttribute('data-zoom-src');
      var label = frame.parentNode.querySelector('.chl-row-label');
      img.src = full || source.currentSrc || source.src;
      img.alt = source.alt;
      img.setAttribute('width', source.getAttribute(full ? 'data-zoom-width' : 'width'));
      img.setAttribute('height', source.getAttribute(full ? 'data-zoom-height' : 'height'));
      title.textContent = frame.getAttribute('data-zoom-title') || (label ? label.textContent : '');
      dialog.setAttribute('aria-label', title.textContent || source.alt);
      opener = frame;
      document.body.classList.add('chl-zoom-open');
      dialog.showModal();
      dialog.scrollTop = 0;
      dialog.scrollLeft = 0;

      dialog.focus();
      log('open', img.src);
    }

    function frameOf(event) {
      var frame = event.target.closest(FRAMES);
      return frame && (always(frame) || section.classList.contains('is-zoomable')) ? frame : null;
    }

    section.addEventListener('click', function (event) {
      var frame = frameOf(event);
      if (frame) open(frame);
    });

    section.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      var frame = frameOf(event);
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
  }
})();
