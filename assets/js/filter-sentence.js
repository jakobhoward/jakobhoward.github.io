

(function() {
  'use strict';

  var Kit = window.FilterModel;
  if (!Kit) return;

  var PF = Kit.PF;

  var mount = Kit.mountAboveGrid('fs-sentence');
  if (!mount) return;

  var sentence = document.createElement('p');
  sentence.className = 'fss-sentence';
  mount.appendChild(sentence);

  var status = document.createElement('div');
  status.className = 'fss-visually-hidden';
  status.setAttribute('role', 'status');
  mount.appendChild(status);

  var overlay = document.createElement('div');
  overlay.className = 'fss-overlay';
  document.body.appendChild(overlay);

  var mainEl = document.querySelector('.main-content');
  var headerEl = document.querySelector('.site-header');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function smartLower(s) {
    return String(s).split(' ').map(function(w) {
      return /[A-Z]{2}|[a-z][A-Z]/.test(w) ? w : w.toLowerCase();
    }).join(' ');
  }
  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  var TYPE_NOUNS = {
    'advertising': ['advertising project', 'advertising projects'],
    'amazon-a+-content': ['Amazon A+ content project', 'Amazon A+ content projects'],
    'blog-article': ['blog article', 'blog articles'],
    'crowdfunding-campaign': ['crowdfunding campaign', 'crowdfunding campaigns'],
    'dtc-launch': ['DTC launch', 'DTC launches'],
    'data-storytelling': ['data storytelling piece', 'data storytelling pieces'],
    'email-content': ['email content project', 'email content projects'],
    'go-to-market-study': ['go-to-market study', 'go-to-market studies'],
    'influencer-campaign': ['influencer campaign', 'influencer campaigns'],
    'infographics': ['infographics project', 'infographics projects'],
    'information-architecture': ['information architecture project', 'information architecture projects'],
    'landing-page': ['landing page', 'landing pages'],
    'product-strategy': ['product strategy project', 'product strategy projects'],
    'social-media-content': ['social media content project', 'social media content projects'],

    'ux-research': ['UX research project', 'UX research projects'],
    'video-production': ['video production', 'video productions'],
    'website-design': ['website design', 'website designs'],
    'ebook': ['eBook', 'eBooks']
  };
  var DIM_META = {
    types: { title: 'Deliverables', clear: 'Every deliverable', noun: 'deliverables' },
    industries: { title: 'Industries', clear: 'Any industry', noun: 'industries' }
  };
  var POP_W = { types: 300, industries: 335 };

  var typeCount = Kit.items('types').length;
  var industryCount = Kit.items('industries').length;

  var ROLL_SEEN_KEY = 'jp.archiveIntroRoll';
  function rollAlreadySeen() {

    if (window.debug && window.debug.flag('filter-roll')) return false;
    try { return window.sessionStorage.getItem(ROLL_SEEN_KEY) === '1'; } catch (e) { return false; }
  }
  function markRollSeen() {
    try { window.sessionStorage.setItem(ROLL_SEEN_KEY, '1'); } catch (e) {   }
  }

  var prevCount = null;
  var pendingFocusDim = null;
  var suppress = null;
  var keepChooserOpen = false;
  var chooser = null;

  function activeFilterCount(state) {
    var n = 0;
    if (state.types.length) n++;
    if (state.industries.length) n++;

    if (state.query && state.query.trim()) n++;
    return n;
  }

  function enumerate(list) {
    if (list.length <= 1) return list[0] || '';
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }

  function nounFor(typeSlug, n) {
    var pair = TYPE_NOUNS[typeSlug];
    if (!pair) {
      var l = smartLower(Kit.labelFor('types', typeSlug) || typeSlug);
      pair = [l, l + 's'];
    }
    return n === 1 ? pair[0] : pair[1];
  }

  function slotHTML(dim, text, opts) {
    opts = opts || {};
    var cls = 'fss-slot';
    if (opts.ph) cls += ' fss-ph';
    if (opts.set) cls += ' fss-set';
    if (opts.ghost) cls += ' fss-ghost';

    var isReset = dim === 'reset';
    var pop = isReset ? '' : ' aria-haspopup="dialog" aria-expanded="false"';
    var glyph = isReset
      ? '<span class="fss-x" aria-hidden="true">×</span>'
      : '<span class="fss-caret" aria-hidden="true">▾</span>';

    var title = opts.title ? ' title="' + esc(opts.title) + '"' : '';
    return '<button type="button" class="' + cls + '" data-dim="' + dim + '"' + pop + title +
      ' aria-label="' + esc(opts.label || text) + '"><span class="fss-label">' + esc(text) + '</span>' + glyph + '</button>';
  }

  function renderSentence(state, n) {
    var total = Kit.total;
    var unfiltered = activeFilterCount(state) === 0;
    var val = n === 0 ? 'no' : String(n);
    var prevVal = prevCount === null ? null : (prevCount === 0 ? 'no' : String(prevCount));
    var tickAnim = prevVal !== null && prevVal !== val && !reducedMotion();

    var tick = '';
    if (tickAnim) tick += '<span class="fss-tick-old" aria-hidden="true">' + esc(prevVal) + '</span>';
    tick += '<span class="fss-tick-val' + (tickAnim ? ' fss-tick-in' : '') + '">' + esc(val) + '</span>';
    var countHtml = '<span class="fss-count"><span class="fss-tick">' + tick + '</span></span>';

    var html = 'Showing ' + (unfiltered ? 'all ' : '') + countHtml + ' ';

    var t = state.types;
    var typeNouns = t.map(function(s) { return nounFor(s, 2); });
    if (t.length === 1) {
      html += slotHTML('types', nounFor(t[0], n), { set: true, label: 'Deliverable — currently ' + typeNouns[0] });
    } else if (t.length === 2 && n !== 1) {
      var pair = typeNouns[0] + ' and ' + typeNouns[1];
      html += slotHTML('types', pair, { set: true, label: 'Deliverables — currently ' + pair });
    } else if (t.length >= 2) {
      html += (n === 1 ? 'project' : 'projects') + ' spanning ' + slotHTML('types', t.length + ' deliverables',
        { set: true, title: enumerate(typeNouns), label: 'Deliverables — currently ' + enumerate(typeNouns) });
    } else {
      html += n === 1 ? 'project' : 'projects';
    }

    var iv = state.industries;
    var indNames = iv.map(function(s) { return smartLower(Kit.labelFor('industries', s)); });
    if (iv.length === 1) {
      html += ' for ' + slotHTML('industries', indNames[0], { set: true, label: 'Industry — currently ' + indNames[0] }) + ' brands';
    } else if (iv.length === 2) {
      var duo = indNames[0] + ' and ' + indNames[1];
      html += ' for ' + slotHTML('industries', duo, { set: true, label: 'Industries — currently ' + duo }) + ' brands';
    } else if (iv.length >= 3) {
      html += ' across ' + slotHTML('industries', iv.length + ' industries',
        { set: true, title: enumerate(indNames), label: 'Industries — currently ' + enumerate(indNames) });
    }

    var ph = [];
    if (!t.length) {
      ph.push(unfiltered
        ? slotHTML('types', typeCount + ' deliverables', { ph: true, label: 'Deliverable — currently all ' + typeCount + ' deliverables' })
        : slotHTML('types', 'every deliverable', { ph: true, label: 'Deliverable — currently every deliverable' }));
    }
    if (!iv.length) {
      ph.push(unfiltered
        ? slotHTML('industries', industryCount + ' industries', { ph: true, label: 'Industry — currently all ' + industryCount + ' industries' })
        : slotHTML('industries', 'any industry', { ph: true, label: 'Industry — currently any industry' }));
    }

    if (unfiltered) {
      html += ' — spanning ' + ph[0] + ' across ' + ph[1] + '.';
    } else {
      if (ph.length) html += '<span class="fss-ph-run"> — ' + ph.join(', ') + '</span>';
      html += '. ' + slotHTML('reset', 'clear', { ghost: true, label: 'Clear filters — show all ' + total + ' projects' });
    }

    sentence.innerHTML = html;

    if (tickAnim) setTimeout(function() {
      sentence.querySelectorAll('.fss-tick-old').forEach(function(el) { el.remove(); });
    }, 350);
  }

  var roll = null;

  function prepIntroRoll() {
    if (reducedMotion() || rollAlreadySeen()) return;
    if (activeFilterCount(PF.state) !== 0) return;
    var label = sentence.querySelector('.fss-slot[data-dim="industries"] .fss-label');
    if (!label) return;
    var finalText = label.textContent;

    var seq = Kit.items('industries').slice(0, 7).map(function(o) { return smartLower(o.label); });
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit;';
    label.parentNode.appendChild(probe);
    function widthOf(t) { probe.textContent = t; return probe.getBoundingClientRect().width; }
    var lockW = 0;
    seq.concat([finalText]).forEach(function(t) { lockW = Math.max(lockW, widthOf(t)); });
    var finalW = widthOf(finalText);
    probe.remove();
    seq.push(finalText);

    roll = { label: label, seq: seq, finalText: finalText, lockW: Math.ceil(lockW), finalW: Math.ceil(finalW), timer: null };
  }

  function settleMs() {
    var v = parseFloat(getComputedStyle(mount).getPropertyValue('--roll-settle'));
    return v > 0 ? v * 1000 : 340;
  }

  function cancelRoll() {
    if (!roll) return;
    var r = roll;
    roll = null;
    if (r.timer) clearInterval(r.timer);
    if (r.label.isConnected) {
      r.label.textContent = r.finalText;
      r.label.classList.remove('fss-roll', 'fss-rolling', 'fss-settling');
      r.label.style.cssText = '';
    }
  }

  function runIntroRoll() {
    if (!roll) return;
    var r = roll;
    var label = r.label;
    markRollSeen();

    label.style.cssText = 'display:inline-block;text-align:center;white-space:nowrap;width:' + r.lockW + 'px';
    void label.offsetWidth;
    label.classList.add('fss-rolling');
    var i = 0;
    function tick() {
      if (roll !== r || !label.isConnected) { cancelRoll(); return; }
      label.textContent = r.seq[i];
      label.classList.remove('fss-roll');
      void label.offsetWidth;
      label.classList.add('fss-roll');
      i++;
      if (i >= r.seq.length) {
        clearInterval(r.timer);
        r.timer = null;

        label.classList.remove('fss-rolling');
        label.classList.add('fss-settling');
        label.style.width = r.finalW + 'px';
        setTimeout(function() { if (roll === r) cancelRoll(); }, settleMs() + 80);
      }
    }
    tick();
    r.timer = setInterval(tick, 340);
  }

  var sentinel = document.createElement('div');
  sentinel.className = 'fss-sentinel';
  mount.parentNode.insertBefore(sentinel, mount);

  if ('IntersectionObserver' in window) {
    var headerPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 64;
    var stickyObserver = new IntersectionObserver(function(entries) {
      var last = entries[entries.length - 1];
      mount.classList.toggle('is-stuck', !last.isIntersecting);
      scheduleTwoLines();
    }, { rootMargin: '-' + (headerPx + 9) + 'px 0px 0px 0px', threshold: 0 });
    stickyObserver.observe(sentinel);
  }

  function enforceTwoLines() {
    sentence.classList.remove('fss-tight');
    if (!mount.classList.contains('is-stuck')) return;
    if (window.innerWidth > 520) return;
    var lh = parseFloat(getComputedStyle(sentence).lineHeight) || 24;
    if (sentence.scrollHeight > lh * 2 + 6) sentence.classList.add('fss-tight');
  }

  function scheduleTwoLines() {
    enforceTwoLines();
    if (window.requestAnimationFrame) window.requestAnimationFrame(enforceTwoLines);
  }
  mount.addEventListener('transitionend', function(e) {
    if (e.target === mount && e.propertyName.indexOf('padding') === 0) enforceTwoLines();
  });
  window.addEventListener('resize', scheduleTwoLines);

  function optionsFor(dim) {
    var sel = PF.state[dim];

    function contextCount(slug) {
      var ov = {};
      ov[dim] = slug;
      return Kit.countFor(ov);
    }
    var opts = [{ label: DIM_META[dim].clear, value: 'all', selected: sel.length === 0, count: contextCount('all'), isClear: true }];
    Kit.items(dim).forEach(function(o) {
      opts.push({ label: o.label, value: o.slug, selected: sel.indexOf(o.slug) !== -1, count: contextCount(o.slug) });
    });
    return opts;
  }

  function openChooser(dim, trigger) {
    closeChooser(false);
    cancelRoll();

    settleStabilizer();

    var isSheet = !window.matchMedia('(min-width: 768px)').matches;
    var meta = DIM_META[dim];
    var opts = optionsFor(dim);
    opts.forEach(function(o) { o.disabled = !o.isClear && !o.selected && o.count === 0; });

    var el = document.createElement('div');
    el.className = 'fss-chooser ' + (isSheet ? 'fss-sheet' : 'fss-popover');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', meta.title);
    var inner = '';
    if (isSheet) inner += '<div class="fss-sheet-handle" aria-hidden="true"></div>';
    inner += '<div class="fss-chooser-head">' + esc(meta.title) +
      '<span class="fss-head-hint"> · pick any number</span></div>';
    if (isSheet) inner += '<button type="button" class="fss-sheet-done">Done</button>';
    if (dim === 'types' || dim === 'industries') {
      inner += '<input class="fss-chooser-search" type="text" placeholder="Type to narrow…" aria-label="Narrow the ' + esc(meta.title.toLowerCase()) + ' list">';
    }
    inner += '<div class="fss-listbox" role="listbox" tabindex="0" aria-multiselectable="true" aria-label="' + esc(meta.title) + ' options"></div>';
    el.innerHTML = inner;

    var scrim = null;
    if (isSheet) {
      scrim = document.createElement('div');
      scrim.className = 'fss-scrim';
      overlay.appendChild(scrim);
      document.body.style.overflow = 'hidden';

      el.setAttribute('aria-modal', 'true');
      if (mainEl) mainEl.inert = true;
    }
    overlay.appendChild(el);

    chooser = { el: el, scrim: scrim, dim: dim, trigger: trigger, isSheet: isSheet, opts: opts, visible: [], query: '', active: -1, vw: window.innerWidth };

    var lb = el.querySelector('.fss-listbox');
    lb.addEventListener('click', function(e) {
      var row = e.target.closest('.fss-option');
      if (!row || !chooser) return;
      var o = chooser.visible[Number(row.dataset.idx)];
      if (!o || o.disabled) return;
      choose(o);
    });
    lb.addEventListener('keydown', onListKeydown);

    var doneBtn = el.querySelector('.fss-sheet-done');
    if (doneBtn) doneBtn.addEventListener('click', function() { closeChooser(true); });

    var inp = el.querySelector('.fss-chooser-search');
    if (inp) {
      inp.addEventListener('input', function() {
        if (!chooser) return;
        chooser.query = inp.value;
        buildList();
      });
      inp.addEventListener('keydown', function(e) {
        if (!chooser) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); lb.focus(); }
        else if (e.key === 'Escape' && inp.value) {
          e.stopPropagation();
          e.preventDefault();
          inp.value = '';
          chooser.query = '';
          buildList();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (!chooser.query.trim()) return;
          var first = null;
          chooser.visible.forEach(function(o) {
            if (!first && !o.disabled && !o.isClear) first = o;
          });
          if (!first) chooser.visible.forEach(function(o) {
            if (!first && !o.disabled) first = o;
          });
          if (first) choose(first);
        }
      });
    }

    el.addEventListener('keydown', trapTab);

    buildList();
    if (!isSheet) positionPopover(el, trigger, dim);

    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeydown);
    window.addEventListener('resize', onWinResize);
    if (!isSheet) window.addEventListener('scroll', onWinScroll, { passive: true });

    trigger.setAttribute('aria-expanded', 'true');

    var coarse = window.matchMedia('(pointer: coarse)').matches;
    if (inp && !isSheet && !coarse) inp.focus(); else lb.focus();
  }

  function buildList() {
    var c = chooser;
    if (!c) return;
    var q = c.query.trim().toLowerCase();
    c.visible = c.opts.filter(function(o) {
      return o.isClear || !q || o.label.toLowerCase().indexOf(q) !== -1;
    });
    var lb = c.el.querySelector('.fss-listbox');
    var html = c.visible.map(function(o, i) {
      return '<div class="fss-option' + (o.isClear ? ' fss-clear' : '') + '" role="option" id="fss-opt-' + i +
        '" aria-selected="' + (o.selected ? 'true' : 'false') + '"' + (o.disabled ? ' aria-disabled="true"' : '') +
        ' data-idx="' + i + '">' +
        '<span class="fss-check" aria-hidden="true">' + (o.selected ? '✓' : '') + '</span>' +
        '<span class="fss-opt-label">' + esc(o.label) + '</span>' +
        (o.count === null || o.count === undefined ? '' : '<span class="fss-opt-count">' + o.count + '</span>') +
        '</div>';
    }).join('');
    var anyMatch = c.visible.some(function(o) { return !o.isClear; });
    if (q && !anyMatch) {
      html += '<div class="fss-listbox-empty">No ' + esc(DIM_META[c.dim].noun || 'options') + ' match “' + esc(c.query.trim()) + '”.</div>';
    }
    lb.innerHTML = html;
    var idx = -1;
    c.visible.forEach(function(o, i) {
      if (idx === -1 && o.selected && !o.disabled) idx = i;
    });
    if (idx < 0) c.visible.forEach(function(o, i) {
      if (idx === -1 && !o.disabled) idx = i;
    });
    setActive(idx);
  }

  function setActive(i) {
    var c = chooser;
    if (!c) return;
    var lb = c.el.querySelector('.fss-listbox');
    var prev = lb.querySelector('.fss-option.fss-active');
    if (prev) prev.classList.remove('fss-active');
    c.active = i;
    if (i < 0) { lb.removeAttribute('aria-activedescendant'); return; }
    var row = lb.querySelector('#fss-opt-' + i);
    if (!row) return;
    row.classList.add('fss-active');
    lb.setAttribute('aria-activedescendant', row.id);
    var top = row.offsetTop;
    var bottom = top + row.offsetHeight;
    if (top < lb.scrollTop) lb.scrollTop = top;
    else if (bottom > lb.scrollTop + lb.clientHeight) lb.scrollTop = bottom - lb.clientHeight;
  }

  function onListKeydown(e) {
    var c = chooser;
    if (!c) return;
    var enabled = [];
    c.visible.forEach(function(o, i) { if (!o.disabled) enabled.push(i); });
    if (!enabled.length) return;
    var pos = enabled.indexOf(c.active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(enabled[Math.min(pos + 1, enabled.length - 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(pos <= 0 ? enabled[0] : enabled[pos - 1]);
    } else if (e.key === 'Home' || e.key === 'PageUp') {
      e.preventDefault();
      setActive(enabled[0]);
    } else if (e.key === 'End' || e.key === 'PageDown') {
      e.preventDefault();
      setActive(enabled[enabled.length - 1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      var o = c.visible[c.active];
      if (o && !o.disabled) choose(o);
    }
  }

  function trapTab(e) {
    if (e.key !== 'Tab' || !chooser) return;
    if (!chooser.isSheet) {

      closeChooser(true);
      return;
    }
    var f = Array.prototype.slice.call(chooser.el.querySelectorAll('input, button, [tabindex="0"]'));
    if (!f.length) return;
    var i = f.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1);
    if (i < 0) i = f.length - 1;
    if (i >= f.length) i = 0;
    e.preventDefault();
    f[i].focus();
  }

  function positionPopover(el, trigger, dim) {
    el.style.width = Math.min(POP_W[dim] || 300, window.innerWidth - 32) + 'px';
    var r = trigger.getBoundingClientRect();
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var left = Math.min(Math.max(16, r.left - 10), window.innerWidth - w - 16);
    var top = r.bottom + 10;
    if (top + h > window.innerHeight - 12 && r.top - h - 10 >= 12) top = r.top - h - 10;
    else if (top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function choose(o) {
    var dim = chooser.dim;
    if (chooser.isSheet) {

      keepChooserOpen = true;
    } else {

      pendingFocusDim = dim;
      closeChooser(false);
    }
    if (o.isClear) PF.setFilter(dim, 'all');
    else PF.toggleFilter(dim, o.value);
  }

  function refreshChooserSelection() {
    var c = chooser;
    if (!c) return;
    var sel = PF.state[c.dim];
    c.opts.forEach(function(o) {
      o.selected = o.isClear ? sel.length === 0 : sel.indexOf(o.value) !== -1;
      o.disabled = !o.isClear && !o.selected && o.count === 0;
    });
    c.el.querySelectorAll('.fss-option').forEach(function(row) {
      var o = c.visible[Number(row.dataset.idx)];
      if (!o) return;
      row.setAttribute('aria-selected', o.selected ? 'true' : 'false');
      if (o.disabled) row.setAttribute('aria-disabled', 'true');
      else row.removeAttribute('aria-disabled');
      row.querySelector('.fss-check').textContent = o.selected ? '✓' : '';
    });
  }

  function closeChooser(refocus) {
    if (!chooser) return;
    var c = chooser;
    chooser = null;
    c.el.remove();
    if (c.scrim) c.scrim.remove();
    if (c.isSheet) {
      document.body.style.overflow = '';
      if (mainEl) mainEl.inert = false;
    }
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onDocKeydown);
    window.removeEventListener('resize', onWinResize);
    window.removeEventListener('scroll', onWinScroll);
    if (c.trigger && c.trigger.isConnected) {
      c.trigger.setAttribute('aria-expanded', 'false');
      if (refocus) c.trigger.focus();
    }
  }

  function onDocPointerDown(e) {
    if (!chooser) return;
    if (chooser.el.contains(e.target)) return;
    var slotHit = e.target.closest ? e.target.closest('.fss-slot') : null;
    if (slotHit === chooser.trigger) {
      suppress = { dim: chooser.dim, t: Date.now() };

      document.addEventListener('click', function() { suppress = null; }, { once: true });
    }
    closeChooser(!slotHit);
  }

  function onDocKeydown(e) {
    if (e.key === 'Escape') closeChooser(true);
  }

  function onWinResize() {

    if (chooser && window.innerWidth !== chooser.vw) closeChooser(false);
  }

  function onWinScroll() {

    if (!chooser) return;
    var t = chooser.trigger;
    var r = t.getBoundingClientRect();
    var topEdge = headerEl ? headerEl.offsetHeight : 0;
    if (r.bottom < topEdge || r.top > window.innerHeight) {
      var hadFocus = chooser.el.contains(document.activeElement);
      closeChooser(false);
      if (hadFocus && t.isConnected) t.focus({ preventScroll: true });
    } else {
      positionPopover(chooser.el, t, chooser.dim);
    }
  }

  var heightTimer = null;

  function settleStabilizer() {
    if (heightTimer) { clearTimeout(heightTimer); heightTimer = null; }
    mount.style.height = '';
    mount.style.overflow = '';
    mount.style.transition = '';
    sentence.querySelectorAll('.fss-slot').forEach(function(el) {
      if (!el.style.transition && !el.style.opacity) return;
      el.style.transition = 'none';
      el.style.transform = '';
      el.style.opacity = '';
    });
  }

  function captureFrame() {
    var slots = {};
    sentence.querySelectorAll('.fss-slot').forEach(function(el) {
      slots[el.dataset.dim] = el.getBoundingClientRect();
    });
    return { slots: slots, h: mount.getBoundingClientRect().height };
  }

  function playFrame(snap) {

    mount.style.transition = 'none';
    mount.style.height = '';
    var newH = mount.getBoundingClientRect().height;
    if (Math.abs(newH - snap.h) >= 1) {
      mount.style.height = snap.h + 'px';
      mount.style.overflow = 'hidden';
      void mount.offsetHeight;
      mount.style.transition = 'height 0.3s ease';
      mount.style.height = newH + 'px';
      if (heightTimer) clearTimeout(heightTimer);
      heightTimer = setTimeout(function() {
        mount.style.height = '';
        mount.style.overflow = '';
        mount.style.transition = '';
      }, 330);
    } else {
      mount.style.transition = '';
    }

    sentence.querySelectorAll('.fss-slot').forEach(function(el) {
      var old = snap.slots[el.dataset.dim];
      if (!old) {
        el.style.opacity = '0';
        void el.offsetWidth;
        el.style.transition = 'opacity 0.25s ease 0.1s';
        el.style.opacity = '1';
        setTimeout(function() { el.style.opacity = ''; el.style.transition = ''; }, 420);
        return;
      }
      var now = el.getBoundingClientRect();
      var dx = old.left - now.left;
      var dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      void el.offsetWidth;
      el.style.transition = 'transform 0.3s ease';
      el.style.transform = '';
      setTimeout(function() { el.style.transition = ''; }, 340);
    });
  }

  sentence.addEventListener('click', function(e) {
    var btn = e.target.closest('.fss-slot');
    if (!btn) return;
    var dim = btn.dataset.dim;
    if (suppress && suppress.dim === dim && Date.now() - suppress.t < 700) { suppress = null; return; }
    suppress = null;
    if (dim === 'reset') {
      pendingFocusDim = 'types';
      PF.clear();
      return;
    }
    openChooser(dim, btn);
  });

  Kit.subscribe(function(state, n) {
    cancelRoll();

    if (chooser && !keepChooserOpen) closeChooser(false);

    var snap = prevCount !== null && !reducedMotion() ? captureFrame() : null;
    renderSentence(state, n);
    if (snap) playFrame(snap);
    if (chooser && keepChooserOpen) refreshChooserSelection();
    keepChooserOpen = false;
    scheduleTwoLines();

    var parts = [];
    if (state.types.length) parts.push(enumerate(state.types.map(function(s) { return nounFor(s, 2); })));
    if (state.industries.length) parts.push(enumerate(state.industries.map(function(s) { return smartLower(Kit.labelFor('industries', s)); })));
    if (state.query && state.query.trim()) parts.push('matching “' + state.query.trim() + '”');
    status.textContent = 'Showing ' + n + ' of ' + Kit.total + ' projects' +
      (parts.length ? ' — ' + parts.join('; ') : '') + '.';
    if (pendingFocusDim) {
      var els = sentence.querySelectorAll('.fss-slot[data-dim="' + pendingFocusDim + '"]');
      var target = els.length ? els[els.length - 1] : sentence.querySelector('.fss-slot');
      if (target) target.focus();
      pendingFocusDim = null;
    }
    prevCount = n;
  });

  prepIntroRoll();
  setTimeout(runIntroRoll, 600);
})();
