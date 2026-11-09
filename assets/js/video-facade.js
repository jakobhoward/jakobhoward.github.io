

(function() {
  'use strict';

  if (window.VideoFacade) return;

  var HOST = 'https://www.youtube-nocookie.com';

  function mount(btn, opts) {
    if (!btn || btn.dataset.mounted) return null;
    btn.dataset.mounted = '1';
    var start = Math.max(0, Math.floor((opts && opts.start) || 0));
    var query = ['autoplay=1', 'playsinline=1', 'rel=0'];
    if (start) query.push('start=' + start);
    if (btn.hasAttribute('data-api')) query.push('enablejsapi=1', 'origin=' + encodeURIComponent(location.origin));
    var iframe = document.createElement('iframe');

    iframe.src = HOST + '/embed/' + encodeURIComponent(btn.dataset.videoId || '') + '?' + query.join('&');

    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
    iframe.setAttribute('allowfullscreen', '');
    iframe.title = btn.getAttribute('aria-label') || 'Video';
    var shell = document.createElement('div');
    shell.className = 'video-embed';
    shell.appendChild(iframe);
    btn.replaceWith(shell);

    iframe.focus({ preventScroll: true });
    shell.dispatchEvent(new CustomEvent('videofacade:mount', { bubbles: true, detail: { iframe: iframe, start: start } }));
    return iframe;
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.video-facade');
    if (btn) mount(btn);
  });

  window.VideoFacade = { mount: mount, host: HOST };
})();
