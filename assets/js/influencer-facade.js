

(function() {
  'use strict';

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.video-facade');
    if (!btn || btn.dataset.mounted) return;
    btn.dataset.mounted = '1';
    var iframe = document.createElement('iframe');

    iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(btn.dataset.videoId || '') + '?autoplay=1';
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.title = btn.getAttribute('aria-label') || 'Video review';
    var shell = document.createElement('div');
    shell.className = 'video-embed';
    shell.appendChild(iframe);
    btn.replaceWith(shell);
    iframe.focus();
  });
})();
