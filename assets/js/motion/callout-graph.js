

(function () {
  'use strict';

  function build(ctx) {
    var linesSvg = ctx.linesSvg, bloomClipId = ctx.bloomClipId;
    var annotations = ctx.annotations, focusEls = ctx.focusEls;
    var focusRegion = ctx.focusRegion, regionUnionRect = ctx.regionUnionRect;
    var bloomClipRect = null;

    var callouts = [];

    var SVG_NS = 'http://www.w3.org/2000/svg';

    function createSvg(tag, attrs) {
      var el = document.createElementNS(SVG_NS, tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    function buildCallouts() {
      if (linesSvg) {
        while (linesSvg.firstChild) linesSvg.removeChild(linesSvg.firstChild);
      }
      callouts = [];
      bloomClipRect = null;
      if (linesSvg) {
        var clipDefs = createSvg('defs', {});
        var clipEl = createSvg('clipPath', { id: bloomClipId, clipPathUnits: 'userSpaceOnUse' });
        bloomClipRect = createSvg('rect', { x: 0, y: 0, width: 0, height: 0 });
        clipEl.appendChild(bloomClipRect);
        clipDefs.appendChild(clipEl);
        linesSvg.appendChild(clipDefs);
      }

      for (var i = 0; i < focusEls.length; i++) {
        var focusEl = focusEls[i];
        var annEl = annotations[i];
        var calloutTexts = annEl ? annEl.querySelectorAll('.walkthrough-callout-text') : [];
        var entries = [];

        if (calloutTexts.length === 0) {

          var singleAnnText = annEl ? annEl.querySelector('.walkthrough-annotation-text') : null;
          var reg = focusRegion(i);
          entries.push(reg ? {

            annTextEl: singleAnnText,
            outlineEl: null,

            targets: [regionUnionRect(focusEl, reg)],
            noLine: true
          } : {
            annTextEl: singleAnnText,
            outlineEl: focusEl,
            targets: [{ kind: 'dom', el: focusEl }],
            noLine: true
          });
        } else {
          for (var j = 0; j < calloutTexts.length; j++) {
            var p = calloutTexts[j];
            var ref = p.getAttribute('data-callout-ref');

            var anchorSpans = annEl.querySelectorAll('.walkthrough-callout-anchor[data-callout-ref="' + ref + '"]');

            var entry = { annTextEl: p, outlineEl: null, targets: [], continuesPrev: p.getAttribute('data-continues') === 'true' };

            if (anchorSpans.length === 0) {

              var domEl = focusEl.querySelector('[data-callout="' + ref + '"]');
              if (domEl) {
                entry.outlineEl = domEl;
                entry.targets.push({ kind: 'dom', el: domEl });
              } else {

                entry.outlineEl = focusEl;
                entry.targets.push({ kind: 'dom', el: focusEl });
              }
            } else {

              for (var s = 0; s < anchorSpans.length; s++) {
                var span = anchorSpans[s];
                var imgName = span.getAttribute('data-anchor-image');
                var imgEl = imgName ? focusEl.querySelector('[data-callout-image="' + imgName + '"]') : null;
                if (!imgEl) continue;
                entry.targets.push({
                  kind: 'rect',
                  imgEl: imgEl,
                  fx: parseFloat(span.getAttribute('data-anchor-x')) || 0,
                  fy: parseFloat(span.getAttribute('data-anchor-y')) || 0,
                  fw: parseFloat(span.getAttribute('data-anchor-w')) || 0,
                  fh: parseFloat(span.getAttribute('data-anchor-h')) || 0,

                  underline: span.getAttribute('data-anchor-underline') === 'true'
                });
              }
              if (entry.targets.length === 0) continue;

              var boxEl = entry.targets.every(function(tg) { return tg.underline; })
                ? focusEl.querySelector('[data-callout="' + ref + '"]') : null;
              if (boxEl) {
                entry.outlineEl = boxEl;
                entry.targets.unshift({ kind: 'dom', el: boxEl });
              }
            }

            entries.push(entry);
          }
        }

        for (var k = 0; k < entries.length; k++) {
          if (!entries[k].targets.length) continue;
          if (!entries[k].noLine) {
            var path = createSvg('path', {
              'class': 'walkthrough-line',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.75',
              pathLength: '1'
            });
            var dotA = createSvg('circle', { 'class': 'walkthrough-dot walkthrough-dot--annotation', r: '3.5', fill: 'currentColor' });
            if (linesSvg) {
              linesSvg.appendChild(path);
              linesSvg.appendChild(dotA);
            }
            entries[k].lineEl = path;
            entries[k].dotAEl = dotA;
          }

          var bloomClass = 'walkthrough-bloom' + (entries[k].noLine ? ' walkthrough-bloom--noline' : '');
          var bloomUp = createSvg('path', {
            'class': bloomClass,
            fill: 'none',
            pathLength: '1',
            'clip-path': 'url(#' + bloomClipId + ')'
          });
          var bloomDown = createSvg('path', {
            'class': bloomClass,
            fill: 'none',
            pathLength: '1',
            'clip-path': 'url(#' + bloomClipId + ')'
          });
          if (linesSvg) {
            linesSvg.appendChild(bloomUp);
            linesSvg.appendChild(bloomDown);
          }
          entries[k].bloomUpEl = bloomUp;
          entries[k].bloomDownEl = bloomDown;
          entries[k].dotPEls = [];
          entries[k].underlineEls = [];
          for (var t = 0; t < entries[k].targets.length; t++) {
            if (entries[k].targets[t].underline) {

              var ul = createSvg('path', {
                'class': 'walkthrough-underline',
                fill: 'none',
                pathLength: '1',
                'clip-path': 'url(#' + bloomClipId + ')'
              });
              if (linesSvg) linesSvg.appendChild(ul);
              entries[k].underlineEls.push(ul);
              entries[k].dotPEls.push(null);
              continue;
            }
            entries[k].underlineEls.push(null);
            if (!entries[k].noLine) {
              var dotP = createSvg('circle', { 'class': 'walkthrough-dot walkthrough-dot--phone', r: '3.5', fill: 'currentColor' });
              if (linesSvg) linesSvg.appendChild(dotP);
              entries[k].dotPEls.push(dotP);
            } else {
              entries[k].dotPEls.push(null);
            }
          }
        }

        callouts.push(entries);
      }
    }

    buildCallouts();
    return { callouts: callouts, clipRect: bloomClipRect };
  }

  window.CalloutGraph = { build: build };
})();
