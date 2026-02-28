'use strict';

/**
 * BEYLE Platform — Offline Manager (Slice S9)
 *
 * Centralized offline state machine for the Electron desktop shell.
 * Handles:
 *   - Offline detection and state transitions (online/offline/reconnecting)
 *   - Injected overlay banner in the renderer for visual feedback
 *   - Activity feed caching (memory + persisted JSON)
 *   - Cloud mode health polling
 *   - Push status events to renderer via webContents.send()
 *
 * All overlay UI is injected via executeJavaScript() so that no React/frontend
 * code changes are required. This keeps S9 within the Electron shell scope.
 *
 * Conventions: CommonJS, no external dependencies beyond Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

/** Cloud health polling interval (matches spec: 10 seconds). */
const CLOUD_HEALTH_POLL_INTERVAL_MS = 10_000;

/** Cloud health request timeout. */
const CLOUD_HEALTH_TIMEOUT_MS = 5_000;

/** Consecutive cloud failures before declaring offline. */
const CLOUD_UNHEALTHY_THRESHOLD = 2;

/** Maximum cached activity feed items. */
const ACTIVITY_CACHE_MAX_ITEMS = 20;

/** Duration (ms) to show the green "Connected" banner before removing. */
const RECOVERY_BANNER_DURATION_MS = 3_000;

/* ================================================================== */
/*  Module State                                                       */
/* ================================================================== */

/** Current offline state: 'online' | 'offline' | 'reconnecting' */
let _state = 'online';

/** Reference to the main BrowserWindow. */
let _mainWindow = null;

/** Platform config reference. */
let _config = null;

/** Cloud health polling interval handle. */
let _cloudHealthInterval = null;

/** Cached activity feed: { items: [], cachedAt: number, workspaceId: string } | null */
let _activityCache = null;

/** File path for persisted activity cache. */
let _activityCachePath = null;

/** Recovery banner removal timeout. */
let _recoveryTimeout = null;

/* ================================================================== */
/*  Initialization                                                     */
/* ================================================================== */

/**
 * Initialize the offline manager.
 * Call once after createWindow() in main.js.
 *
 * @param {import('electron').BrowserWindow} mainWindow
 * @param {object} config — Platform config object
 * @param {string} userDataPath — app.getPath('userData')
 */
function init(mainWindow, config, userDataPath) {
  _mainWindow = mainWindow;
  _config = config;
  _activityCachePath = path.join(userDataPath, 'data', 'activity-cache.json');

  // Load persisted activity cache if it exists
  _loadPersistedCache();
}

/* ================================================================== */
/*  State Accessors                                                    */
/* ================================================================== */

/**
 * Get the current offline state.
 * @returns {'online' | 'offline' | 'reconnecting'}
 */
function getState() {
  return _state;
}

/* ================================================================== */
/*  State Transition Notifications                                     */
/* ================================================================== */

/**
 * Called when the health monitor declares the backend unhealthy.
 * Transitions: online → offline.
 * Idempotent: no-op if already offline or reconnecting.
 */
function notifyBackendUnhealthy() {
  if (_state === 'offline') return; // Already offline, no-op

  const previous = _state;
  _state = 'offline';

  console.warn(
    `[OfflineManager] State: ${previous} → offline`
  );

  _pushStatusToRenderer('offline', 'Backend unavailable \u2014 reconnecting...');
  _injectOverlay(
    'Backend unavailable \u2014 reconnecting...',
    'offline',
    false
  );
}

/**
 * Called when the health monitor detects recovery OR when a restart succeeds.
 * Transitions: offline|reconnecting → online.
 * Idempotent: no-op if already online.
 */
function notifyBackendHealthy() {
  if (_state === 'online') return; // Already online, no-op

  const previous = _state;
  _state = 'online';

  console.log(
    `[OfflineManager] State: ${previous} → online`
  );

  _pushStatusToRenderer('online', 'Connected');

  // Show green recovery banner, then remove after 3 seconds
  _injectOverlay('Connected', 'recovery', false);

  if (_recoveryTimeout) clearTimeout(_recoveryTimeout);
  _recoveryTimeout = setTimeout(() => {
    _removeOverlay();
    _recoveryTimeout = null;
  }, RECOVERY_BANNER_DURATION_MS);
}

/**
 * Called when an auto-restart attempt begins.
 * Transitions: offline → reconnecting.
 *
 * @param {number} attempt — Current restart attempt (1-based)
 * @param {number} maxAttempts — Maximum attempts allowed
 */
function notifyBackendRestarting(attempt, maxAttempts) {
  const previous = _state;
  _state = 'reconnecting';

  console.log(
    `[OfflineManager] State: ${previous} → reconnecting (attempt ${attempt}/${maxAttempts})`
  );

  const message = `Restarting backend (attempt ${attempt}/${maxAttempts})...`;
  _pushStatusToRenderer('reconnecting', message);
  _injectOverlay(message, 'reconnecting', false);
}

/**
 * Called when all auto-restart attempts have been exhausted.
 * Transitions to 'offline' permanently with action buttons.
 *
 * @param {Error} error — The fatal error
 */
function notifyFatalError(error) {
  _state = 'offline';

  const message = error.message || 'Backend failed to start';
  console.error(`[OfflineManager] Fatal error: ${message}`);

  _pushStatusToRenderer('offline', message);
  _injectOverlay(
    `Backend failed: ${_escapeHtml(message)}`,
    'fatal',
    true
  );
}

/* ================================================================== */
/*  Cloud Mode Health Monitoring                                       */
/* ================================================================== */

/**
 * Start cloud mode health polling.
 * Polls {cloudUrl}/health every 10 seconds.
 *
 * @param {string} cloudUrl — The cloud backend base URL
 */
function startCloudMonitoring(cloudUrl) {
  stopCloudMonitoring(); // Clear any existing interval

  let consecutiveFailures = 0;

  _cloudHealthInterval = setInterval(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        CLOUD_HEALTH_TIMEOUT_MS
      );

      const res = await fetch(`${cloudUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        consecutiveFailures = 0;
        if (_state !== 'online') {
          notifyBackendHealthy();
        }
      } else {
        consecutiveFailures++;
        if (
          consecutiveFailures >= CLOUD_UNHEALTHY_THRESHOLD &&
          _state === 'online'
        ) {
          notifyBackendUnhealthy();
        }
      }
    } catch (_err) {
      consecutiveFailures++;
      if (
        consecutiveFailures >= CLOUD_UNHEALTHY_THRESHOLD &&
        _state === 'online'
      ) {
        notifyBackendUnhealthy();
      }
    }
  }, CLOUD_HEALTH_POLL_INTERVAL_MS);
}

/**
 * Stop cloud mode health polling.
 */
function stopCloudMonitoring() {
  if (_cloudHealthInterval) {
    clearInterval(_cloudHealthInterval);
    _cloudHealthInterval = null;
  }
}

/* ================================================================== */
/*  Activity Feed Caching                                              */
/* ================================================================== */

/**
 * Cache activity feed items from the renderer.
 * Stored in memory and persisted to disk.
 *
 * @param {Array} items — Activity feed items
 * @param {string} workspaceId — Current workspace ID
 */
function cacheActivityFeed(items, workspaceId) {
  if (!Array.isArray(items)) return;

  _activityCache = {
    items: items.slice(0, ACTIVITY_CACHE_MAX_ITEMS),
    cachedAt: Date.now(),
    workspaceId: workspaceId || null,
  };

  _persistCache();
}

/**
 * Get the cached activity feed.
 * @returns {{ items: Array, cachedAt: number, workspaceId: string|null, cached: true } | null}
 */
function getActivityCache() {
  if (!_activityCache) return null;
  return {
    ...structuredClone(_activityCache),
    cached: true,
  };
}

/**
 * Load persisted cache from disk.
 * @private
 */
function _loadPersistedCache() {
  if (!_activityCachePath) return;
  try {
    if (fs.existsSync(_activityCachePath)) {
      const raw = fs.readFileSync(_activityCachePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items)) {
        _activityCache = parsed;
      }
    }
  } catch (err) {
    console.warn(
      '[OfflineManager] Failed to load activity cache:',
      err.message
    );
  }
}

/**
 * Persist cache to disk. Non-blocking, errors swallowed.
 * @private
 */
function _persistCache() {
  if (!_activityCachePath || !_activityCache) return;
  try {
    // Ensure data directory exists
    const dir = path.dirname(_activityCachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      _activityCachePath,
      JSON.stringify(_activityCache, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.warn(
      '[OfflineManager] Failed to persist activity cache:',
      err.message
    );
  }
}

/* ================================================================== */
/*  Overlay Injection                                                  */
/* ================================================================== */

/**
 * Inject an offline status banner into the renderer's DOM.
 * Uses executeJavaScript to create a fixed-position overlay.
 *
 * @param {string} message — The message to display
 * @param {'offline' | 'reconnecting' | 'fatal' | 'recovery'} variant — Banner style
 * @param {boolean} showActions — Whether to show Switch to Cloud / Retry buttons
 * @private
 */
function _injectOverlay(message, variant, showActions) {
  if (!_mainWindow || _mainWindow.isDestroyed()) return;

  const bgColor =
    variant === 'recovery'
      ? 'rgba(34, 197, 94, 0.95)'
      : variant === 'reconnecting'
        ? 'rgba(245, 158, 11, 0.95)'
        : 'rgba(239, 68, 68, 0.95)';

  const textColor = '#ffffff';

  const actionsHtml = showActions
    ? `<div style="margin-top:6px;display:flex;gap:8px;justify-content:center;">
        <button onclick="window.electronAPI?.switchToCloudMode?.()" style="
          padding:4px 12px;border:1px solid rgba(255,255,255,0.4);
          border-radius:4px;background:transparent;color:#fff;
          cursor:pointer;font-size:12px;">Switch to Cloud Mode</button>
        <button onclick="window.electronAPI?.retryLocalBackend?.()" style="
          padding:4px 12px;border:1px solid rgba(255,255,255,0.4);
          border-radius:4px;background:transparent;color:#fff;
          cursor:pointer;font-size:12px;">Retry</button>
      </div>`
    : '';

  const spinnerCss =
    variant === 'reconnecting'
      ? `@keyframes beyle-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
         .beyle-offline-spinner{display:inline-block;width:14px;height:14px;
         border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;
         border-radius:50%;animation:beyle-spin 0.8s linear infinite;
         vertical-align:middle;margin-right:6px;}`
      : '';

  const spinnerHtml =
    variant === 'reconnecting'
      ? '<span class="beyle-offline-spinner"></span>'
      : '';

  const dotHtml =
    variant === 'offline' || variant === 'fatal'
      ? '<span style="display:inline-block;width:8px;height:8px;background:#fff;border-radius:50%;margin-right:6px;opacity:0.8;vertical-align:middle;"></span>'
      : '';

  const cachedNote =
    _activityCache && (variant === 'offline' || variant === 'fatal')
      ? '<span style="margin-left:8px;font-size:11px;opacity:0.7;">(using cached data)</span>'
      : '';

  // Escape backticks and backslashes for the JS string literal
  const safeMessage = message.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

  const script = `(function(){
    ${spinnerCss ? `var style=document.getElementById('beyle-offline-style');if(!style){style=document.createElement('style');style.id='beyle-offline-style';style.textContent=\`${spinnerCss}\`;document.head.appendChild(style);}else{style.textContent=\`${spinnerCss}\`;}` : ''}
    var el=document.getElementById('beyle-offline-banner');
    if(!el){
      el=document.createElement('div');
      el.id='beyle-offline-banner';
      el.setAttribute('role','alert');
      el.setAttribute('aria-live','assertive');
      document.body.appendChild(el);
    }
    el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:999999;'+
      'background:${bgColor};color:${textColor};'+
      'padding:8px 16px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'+
      'font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.3);'+
      'transition:opacity 0.3s ease,transform 0.3s ease;';
    el.innerHTML='${dotHtml}${spinnerHtml}'+\`${safeMessage}\`+'${cachedNote}${actionsHtml}';
  })();`;

  // If the page is still loading, defer injection
  if (_mainWindow.webContents.isLoading()) {
    _mainWindow.webContents.once('did-finish-load', () => {
      _mainWindow.webContents.executeJavaScript(script).catch(() => {});
    });
  } else {
    _mainWindow.webContents.executeJavaScript(script).catch(() => {});
  }
}

/**
 * Remove the offline overlay banner from the renderer's DOM.
 * @private
 */
function _removeOverlay() {
  if (!_mainWindow || _mainWindow.isDestroyed()) return;

  const script = `(function(){
    var el=document.getElementById('beyle-offline-banner');
    if(el){
      el.style.opacity='0';
      el.style.transform='translateY(-100%)';
      setTimeout(function(){el.remove();},300);
    }
    var style=document.getElementById('beyle-offline-style');
    if(style) style.remove();
  })();`;

  _mainWindow.webContents.executeJavaScript(script).catch(() => {});
}

/* ================================================================== */
/*  IPC Push                                                           */
/* ================================================================== */

/**
 * Push a status change event to the renderer via webContents.send().
 *
 * @param {'online' | 'offline' | 'reconnecting'} state
 * @param {string} message — Human-readable status message
 * @private
 */
function _pushStatusToRenderer(state, message) {
  if (!_mainWindow || _mainWindow.isDestroyed()) return;
  _mainWindow.webContents.send('platform:backend-status-changed', {
    state,
    message,
    timestamp: Date.now(),
  });
}

/* ================================================================== */
/*  HTML Escaping                                                      */
/* ================================================================== */

/**
 * Escape a string for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 * @private
 */
function _escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================== */
/*  Cleanup                                                            */
/* ================================================================== */

/**
 * Clean up all intervals and references.
 * Called from app.on('before-quit').
 */
function destroy() {
  stopCloudMonitoring();

  if (_recoveryTimeout) {
    clearTimeout(_recoveryTimeout);
    _recoveryTimeout = null;
  }

  _mainWindow = null;
  _config = null;
}

/* ================================================================== */
/*  Module Exports                                                     */
/* ================================================================== */

module.exports = {
  init,
  getState,
  notifyBackendUnhealthy,
  notifyBackendHealthy,
  notifyBackendRestarting,
  notifyFatalError,
  cacheActivityFeed,
  getActivityCache,
  startCloudMonitoring,
  stopCloudMonitoring,
  destroy,
};
