

(function() {
  'use strict';

  var STALE_DAYS = 7;
  var flagsData = { flags: {} };
  var enabledFlags = {};
  var logHistory = [];
  var panelVisible = false;
  var panelElement = null;

  var metricStores = {};
  var NOTE_MAX = 8;
  var hudRequested = false;

  function loadHud() {
    if (hudRequested) return;
    hudRequested = true;
    var s = document.createElement('script');
    s.src = '/assets/debug/perf-hud.js';
    s.async = true;
    (document.body || document.head || document.documentElement).appendChild(s);
  }

  function parseEnabled() {
    var enabled = {};

    var stored = null;
    try { stored = localStorage.getItem('debug'); } catch (e) {   }
    if (stored) {
      if (stored === '*') {
        enabled['*'] = true;
      } else {
        stored.split(',').forEach(function(f) {
          enabled[f.trim()] = true;
        });
      }
    }

    var params = new URLSearchParams(window.location.search);
    var urlDebug = params.get('debug');
    if (urlDebug) {
      if (urlDebug === '*') {
        enabled['*'] = true;
      } else {
        urlDebug.split(',').forEach(function(f) {
          enabled[f.trim()] = true;
        });
      }
    }

    return enabled;
  }

  function checkStale(flagName) {
    var flag = flagsData.flags[flagName];
    if (!flag || !flag.created) return;

    var created = new Date(flag.created);
    var now = new Date();
    var days = Math.floor((now - created) / (1000 * 60 * 60 * 24));

    if (days >= STALE_DAYS) {
      console.warn(
        '[debug] Warning: Flag "' + flagName + '" is ' + days + ' days old. ' +
        'Consider cleanup: ' + (flag.cleanup || 'No cleanup instructions.')
      );
    }
  }

  function store(list) {
    try {
      if (list) localStorage.setItem('debug', list);
      else localStorage.removeItem('debug');
    } catch (e) {   }
  }

  enabledFlags = parseEnabled();

  function loadFlags() {
    return fetch('/assets/debug/flags.json')
      .then(function(r) { return r.ok ? r.json() : { flags: {} }; })
      .then(function(data) { flagsData = data; })
      .catch(function() {   });
  }
  if (Object.keys(enabledFlags).length) loadFlags();

  var debug = {

    flag: function(name) {
      var enabled = enabledFlags['*'] || enabledFlags[name];
      if (enabled) {
        checkStale(name);
      }
      return !!enabled;
    },

    log: function(name) {
      if (!this.flag(name)) return;

      var args = Array.prototype.slice.call(arguments, 1);
      var prefix = '[' + name + ']';

      logHistory.push({
        flag: name,
        args: args,
        time: new Date().toLocaleTimeString()
      });
      if (logHistory.length > 100) logHistory.shift();

      console.log('%c' + prefix, 'color: #0ea5e9; font-weight: bold', ...args);

      if (panelVisible) updatePanel();
    },

    metrics: function(name) {
      if (!this.flag(name)) return null;
      var store = metricStores[name];
      if (!store) {
        store = metricStores[name] = { values: {}, order: [], notes: [] };
        loadHud();
      }
      return {
        set: function(key, value) {
          if (!(key in store.values)) store.order.push(key);
          store.values[key] = value;
        },
        note: function(text) {
          store.notes.push(text);
          if (store.notes.length > NOTE_MAX) store.notes.shift();
        }
      };
    },

    list: function() {

      if (!Object.keys(flagsData.flags).length) return loadFlags().then(function() { debug.list(); });
      console.log('%cRegistered Debug Flags:', 'font-weight: bold; font-size: 14px');
      var flags = Object.entries(flagsData.flags);

      if (flags.length === 0) {
        console.log('  (no flags registered)');
      } else {
        flags.forEach(function(entry) {
          var name = entry[0];
          var info = entry[1];
          var enabled = enabledFlags['*'] || enabledFlags[name];
          var status = enabled ? '[ON]' : '[OFF]';
          var style = enabled ? 'color: #22c55e' : 'color: #6b7280';
          console.log('%c' + status + ' ' + name, style, '-', info.description || 'No description');
          if (info.cleanup) {
            console.log('       %cCleanup: ' + info.cleanup, 'color: #eab308');
          }
        });
      }

      console.log('\nEnabled flags:', Object.keys(enabledFlags).join(', ') || '(none)');
      console.log('Enable via: ?debug=flag1,flag2 or localStorage.debug = "flag1,flag2"');
    },

    enable: function(name) {
      enabledFlags[name] = true;
      store(Object.keys(enabledFlags).join(','));
      console.log('%c[debug] Enabled: ' + name, 'color: #22c55e');
    },

    disable: function(name) {
      delete enabledFlags[name];
      var remaining = Object.keys(enabledFlags);
      store(remaining.join(','));
      console.log('%c[debug] Disabled: ' + name, 'color: #ef4444');
    },

    clear: function() {
      enabledFlags = {};
      store('');
      console.log('%c[debug] All flags cleared', 'color: #6b7280');
    },

    panel: function() {
      if (!Object.keys(flagsData.flags).length) loadFlags().then(updatePanel);
      if (panelVisible) {
        hidePanel();
      } else {
        showPanel();
      }
    }
  };

  function createPanel() {
    var panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.innerHTML = [
      '<style>',
      '#debug-panel {',
      '  position: fixed; bottom: 0; right: 0; width: 400px; max-height: 300px;',
      '  background: #1e1e1e; color: #d4d4d4; font-family: monospace; font-size: 12px;',
      '  border-top-left-radius: 8px; box-shadow: 0 -2px 10px rgba(0,0,0,0.3);',
      '  z-index: 99999; overflow: hidden;',
      '}',
      '#debug-panel-header {',
      '  background: #2d2d2d; padding: 8px 12px; display: flex; justify-content: space-between;',
      '  border-bottom: 1px solid #404040; cursor: move;',
      '}',
      '#debug-panel-header span { color: #0ea5e9; font-weight: bold; }',
      '#debug-panel-close { background: none; border: none; color: #888; cursor: pointer; font-size: 16px; }',
      '#debug-panel-close:hover { color: #fff; }',
      '#debug-panel-content { padding: 8px 12px; overflow-y: auto; max-height: 250px; }',
      '.debug-log { margin: 4px 0; padding: 4px; border-left: 2px solid #0ea5e9; padding-left: 8px; }',
      '.debug-log-time { color: #6b7280; margin-right: 8px; }',
      '.debug-log-flag { color: #0ea5e9; font-weight: bold; margin-right: 8px; }',
      '.debug-flags { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #404040; }',
      '.debug-flag-tag { display: inline-block; padding: 2px 8px; margin: 2px; border-radius: 4px; font-size: 11px; }',
      '.debug-flag-on { background: #166534; color: #bbf7d0; }',
      '.debug-flag-off { background: #404040; color: #9ca3af; }',
      '</style>',
      '<div id="debug-panel-header">',
      '  <span>Debug Panel</span>',
      '  <button id="debug-panel-close">&times;</button>',
      '</div>',
      '<div id="debug-panel-content">',
      '  <div class="debug-flags"></div>',
      '  <div class="debug-logs"></div>',
      '</div>'
    ].join('\n');
    return panel;
  }

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function updatePanel() {
    if (!panelElement) return;

    var flagsEl = panelElement.querySelector('.debug-flags');
    var logsEl = panelElement.querySelector('.debug-logs');

    var flagsHtml = '<strong>Flags:</strong> ';
    var allFlags = Object.keys(flagsData.flags);
    if (allFlags.length === 0) {
      flagsHtml += '<span style="color:#6b7280">(none registered)</span>';
    } else {
      allFlags.forEach(function(name) {
        var enabled = enabledFlags['*'] || enabledFlags[name];
        var cls = enabled ? 'debug-flag-on' : 'debug-flag-off';
        flagsHtml += '<span class="debug-flag-tag ' + cls + '">' + esc(name) + '</span>';
      });
    }
    flagsEl.innerHTML = flagsHtml;

    var logsHtml = '<strong>Recent Logs:</strong><br>';
    if (logHistory.length === 0) {
      logsHtml += '<span style="color:#6b7280">(no logs yet)</span>';
    } else {
      logHistory.slice(-20).reverse().forEach(function(entry) {
        logsHtml += '<div class="debug-log">';
        logsHtml += '<span class="debug-log-time">' + esc(entry.time) + '</span>';
        logsHtml += '<span class="debug-log-flag">[' + esc(entry.flag) + ']</span>';
        logsHtml += esc(entry.args.map(function(a) {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' '));
        logsHtml += '</div>';
      });
    }
    logsEl.innerHTML = logsHtml;
  }

  function showPanel() {
    if (!panelElement) {
      panelElement = createPanel();
      document.body.appendChild(panelElement);
      panelElement.querySelector('#debug-panel-close').addEventListener('click', hidePanel);
    }
    panelElement.style.display = 'block';
    panelVisible = true;
    updatePanel();
    console.log('%c[debug] Panel opened', 'color: #0ea5e9');
  }

  function hidePanel() {
    if (panelElement) {
      panelElement.style.display = 'none';
    }
    panelVisible = false;
    console.log('%c[debug] Panel closed', 'color: #6b7280');
  }

  debug._metrics = metricStores;
  window.debug = debug;
})();
