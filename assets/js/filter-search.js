

(function() {
  'use strict';

  var Kit = window.FilterModel;
  if (!Kit) return;

  var PF = Kit.PF;
  var mount = document.querySelector('.fs-sentence');
  if (!mount || typeof PF.setQuery !== 'function') return;

  var wrap = document.createElement('div');
  wrap.className = 'fs-search';

  wrap.insertAdjacentHTML('afterbegin',
    '<svg class="fs-search-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M10.5 10.5 L14.2 14.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>');

  var input = document.createElement('input');

  input.type = 'search';
  input.className = 'fs-search-input';
  input.placeholder = 'Search projects…';
  input.setAttribute('aria-label', 'Search projects by name or client');
  input.autocomplete = 'off';
  wrap.appendChild(input);

  var clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'fs-search-clear';
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.textContent = '×';
  wrap.appendChild(clearBtn);

  mount.insertBefore(wrap, mount.firstChild);
  mount.classList.add('fs-has-search');

  var timer = null;
  function commit() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (input.value !== PF.state.query) PF.setQuery(input.value);
  }
  input.addEventListener('input', function() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(commit, 140);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      commit();
    } else if (e.key === 'Escape' && input.value) {

      e.stopPropagation();
      input.value = '';
      commit();
    }
  });
  clearBtn.addEventListener('click', function() {
    input.value = '';
    commit();
    input.focus();
  });

  Kit.subscribe(function(state) {
    var active = !!(state.query && state.query.trim());

    mount.classList.toggle('fs-searching', active);

    if (!timer && input.value !== state.query) {
      input.value = state.query;
    }
  });
})();
