

(function () {
  'use strict';

  if (!window.WalkthroughShared) {
    throw new Error('walkthrough-shared.js must load before motion/walkthrough-interleaved.js');
  }
  var WS = window.WalkthroughShared;
  var debugLog = WS.debugLog;

  var addressText, buildChrome, readRegion;

  function applyCropWindow(blockEl, ann) {
    var reg = readRegion(ann);
    if (!reg) return null;

    var w = reg.w == null ? 1 : reg.w;
    var wrap = document.createElement('div');
    wrap.className = 'wt-mi-crop';
    wrap.style.setProperty('--rx', String(reg.x));
    wrap.style.setProperty('--ry', String(reg.y));
    wrap.style.setProperty('--rw', String(w));
    wrap.appendChild(blockEl);
    return { el: wrap, block: blockEl, h: reg.h };
  }

  function fitCropWindows(crops) {
    crops.forEach(function(c) {
      var bh = c.block.offsetHeight;
      c.el.style.height = bh ? (bh * c.h) + 'px' : '';
    });
  }

  function setupInterleaved(section, actIdx) {
    var content = section.querySelector('.wt-phone-scroll');
    var annotations = section.querySelectorAll('.walkthrough-annotation');
    if (!content || !annotations.length) return null;
    var iggRoot = content.querySelector('.igg-content') || content;

    var focusEls = WS.resolveFocusEls(content, annotations);
    var annsByBlock = new Map();
    Array.prototype.forEach.call(annotations, function(ann, i) {
      var b = focusEls[i];
      if (!b) return;
      if (!annsByBlock.has(b)) annsByBlock.set(b, []);
      annsByBlock.get(b).push(ann);
    });

    var address = addressText(section);
    var container = document.createElement('div');
    container.className = 'wt-mi';

    var heading = section.querySelector('.walkthrough-heading');
    if (heading) {
      var hc = heading.cloneNode(true);
      hc.classList.add('wt-mi-heading');
      container.appendChild(hc);
    }

    var pendingTransit = 0;
    var sliceCount = 0;
    var crops = [];

    function flushSeam() {
      if (!pendingTransit) return;
      pendingTransit = 0;
      var seam = document.createElement('div');
      seam.className = 'wt-mi-seam';
      var label = document.createElement('span');
      label.textContent = 'Page continues';
      seam.appendChild(label);
      container.appendChild(seam);
    }

    Array.prototype.forEach.call(iggRoot.children, function(block) {
      if (!block.classList || !block.classList.contains('igg-block')) return;
      var anns = annsByBlock.get(block);
      if (!anns) { pendingTransit++; return; }
      flushSeam();
      anns.forEach(function(ann) { addSlice(block, ann); });
    });
    flushSeam();

    function addSlice(block, ann) {
      var slice = document.createElement('section');
      slice.className = 'wt-mi-slice';
      slice.appendChild(buildChrome(address, false).el);

      var page = document.createElement('div');
      page.className = 'igg-content wt-mi-page';
      var blockClone = block.cloneNode(true);
      var crop = applyCropWindow(blockClone, ann);
      page.appendChild(crop ? crop.el : blockClone);
      if (crop) crops.push(crop);
      slice.appendChild(page);

      var card = document.createElement('aside');
      card.className = 'wt-mi-card';
      var label = ann.querySelector('.walkthrough-annotation-label');
      if (label) card.appendChild(label.cloneNode(true));
      Array.prototype.forEach.call(
        ann.querySelectorAll('.walkthrough-annotation-text'),
        function(p) { card.appendChild(p.cloneNode(true)); }
      );
      slice.appendChild(card);

      container.appendChild(slice);
      sliceCount++;
    }

    if (!sliceCount) return null;
    debugLog('walkthrough-mobile', 'act ' + actIdx + ': interleaved setup (' + sliceCount + ' slices)');
    section.appendChild(container);

    var cropObserver = null;
    if (crops.length) {
      if (typeof ResizeObserver === 'function') {
        cropObserver = new ResizeObserver(function() { fitCropWindows(crops); });
        crops.forEach(function(c) { cropObserver.observe(c.block); });
      } else {
        fitCropWindows(crops);
      }
    }

    var videoObserver = null;
    var videos = container.querySelectorAll('.wt-lazy-video');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Array.prototype.forEach.call(videos, function(v) {
        v.setAttribute('controls', '');
      });
    } else {
      videoObserver = WS.observeVideos(videos, null);
    }

    function destroy() {
      if (videoObserver) videoObserver.disconnect();
      if (cropObserver) cropObserver.disconnect();
      if (container.parentNode) container.parentNode.removeChild(container);
      debugLog('walkthrough-mobile', 'act ' + actIdx + ': interleaved destroyed');
    }

    return { destroy: destroy, handleResize: function() {} };
  }

  function setup(section, actIdx, helpers) {
    addressText = helpers.addressText;
    buildChrome = helpers.buildChrome;
    readRegion = helpers.readRegion;
    return setupInterleaved(section, actIdx);
  }

  window.WalkthroughInterleaved = { setup: setup };
})();
