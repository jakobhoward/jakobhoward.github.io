

(function () {
  'use strict';

  function buildAttributionTypewriter(el) {
    var text = el.textContent;

    el.setAttribute('aria-label', text);
    el.textContent = '';

    var visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    var chars = [];
    text.split(' ').forEach(function(word, i) {
      if (i > 0) visual.appendChild(document.createTextNode(' '));
      var w = document.createElement('span');
      w.className = 'tw-word';
      for (var c = 0; c < word.length; c++) {
        var ch = document.createElement('span');
        ch.className = 'tw-char';
        ch.textContent = word[c];
        w.appendChild(ch);
        chars.push(ch);
      }
      visual.appendChild(w);
    });
    var caret = document.createElement('span');
    caret.className = 'tw-caret';
    visual.appendChild(caret);
    el.appendChild(visual);

    var CHAR_MS = 32;
    var CARET_LINGER_MS = 900;

    var state = 'idle';
    var raf = null;
    var caretTimer = null;
    var startedAt = 0;
    var shown = 0;

    function setShown(n) {
      while (shown < n) { chars[shown].classList.add('tw-on'); shown++; }
      while (shown > n) { shown--; chars[shown].classList.remove('tw-on'); }
    }

    function placeCaret(n) {
      if (n > 0) chars[n - 1].insertAdjacentElement('afterend', caret);
      else if (chars.length) chars[0].parentNode.insertBefore(caret, chars[0]);
    }

    function stopTimers() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (caretTimer) { clearTimeout(caretTimer); caretTimer = null; }
    }

    function tick(now) {
      var n = Math.min(chars.length, Math.floor((now - startedAt) / CHAR_MS) + 1);
      setShown(n);
      placeCaret(n);
      if (n < chars.length) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        state = 'done';
        caretTimer = setTimeout(function() {
          caretTimer = null;
          caret.classList.remove('tw-on');
        }, CARET_LINGER_MS);
      }
    }

    return {
      start: function() {
        if (state !== 'idle') return;
        state = 'typing';
        placeCaret(0);
        caret.classList.add('tw-on');
        startedAt = performance.now();
        raf = requestAnimationFrame(tick);
      },
      reset: function() {
        if (state === 'idle') return;
        stopTimers();
        setShown(0);
        caret.classList.remove('tw-on');
        state = 'idle';
      },
      finish: function() {
        if (state === 'done' && shown === chars.length && !caretTimer) return;
        stopTimers();
        setShown(chars.length);
        caret.classList.remove('tw-on');
        state = 'done';
      }
    };
  }

  window.AttributionTypewriter = buildAttributionTypewriter;
})();
