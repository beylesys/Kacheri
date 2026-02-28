'use strict';

/**
 * BEYLE Platform — Electron Main Process (Slices S7 + S8 + S9 + S10 + S11)
 *
 * Unified desktop shell for all BEYLE products (Kacheri Docs, File Manager,
 * Design Studio, BEYLE JAAL). Wraps the KACHERI Frontend React app in an
 * Electron BrowserWindow.
 *
 * Features:
 * - Cloud mode: loads React frontend from a remote URL
 * - Local mode: starts KACHERI Backend as embedded subprocess (S8),
 *   auto-selects port, SQLite in userData, health monitoring
 * - Offline resilience: auto-restart on crash (max 3 attempts),
 *   cloud health polling, overlay banner, activity feed caching (S9)
 * - JAAL desktop window integration: opens JAAL research browser with
 *   full privacy, IPC handlers, and Kacheri sync (S10)
 * - Product switching: Ctrl+1–5 shortcuts, application menu bar with
 *   product list and states, dynamic window titles, tray Recent Items (S11)
 * - Single instance lock — re-launch focuses existing window
 * - Window state persistence — saves/restores position, size, maximized
 * - System tray with product quick-launch menu and recent items
 * - IPC bridge exposing window.electronAPI to the renderer
 *
 * Conventions: CommonJS (matching BEYLE JAAL), no external dependencies
 * beyond Node.js built-ins and Electron.
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
} = require('electron');
const path = require('path');
const fs = require('fs');

// Embedded backend manager (Slice S8)
const {
  startEmbeddedBackend,
  stopEmbeddedBackend,
  monitorHealth,
  startWithAutoRestart, // S9: auto-restart on crash
} = require('./lib/embeddedBackend');

// Offline resilience manager (Slice S9)
const offlineManager = require('./lib/offlineManager');

// JAAL desktop window integration (Slice S10)
const jaalDesktop = require('./lib/jaalDesktop');

/* ================================================================== */
/*  Section 1: Config Loading                                          */
/* ================================================================== */

const CONFIG_PATH = path.join(__dirname, 'config.json');

/** Default config used when config.json is missing or unparseable. */
const DEFAULT_CONFIG = {
  backendMode: 'cloud',
  cloudUrl: 'http://localhost:5173',
  localPort: 3001,
  enabledProducts: ['docs', 'design-studio'],
  window: { width: 1280, height: 900, x: null, y: null, maximized: false },
  tray: { enabled: true, closeToTray: true },
  appearance: 'system',
  startup: { launchAtLogin: false, startMinimized: false },
  jaalAutoSync: true,
};

/**
 * Read and parse config.json, falling back to defaults on any error.
 * Never throws.
 */
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      window: { ...DEFAULT_CONFIG.window, ...(parsed.window || {}) },
      tray: { ...DEFAULT_CONFIG.tray, ...(parsed.tray || {}) },
      startup: { ...DEFAULT_CONFIG.startup, ...(parsed.startup || {}) },
    };
  } catch (err) {
    console.warn('Failed to load config.json, using defaults:', err.message);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Persist config to disk. Swallows errors (non-critical).
 */
function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save config:', err.message);
  }
}

let config = loadConfig();

/* ================================================================== */
/*  Section 1d: Product Route Mapping (Slice S11)                      */
/* ================================================================== */

/**
 * Maps URL path patterns to human-readable product names for window titles,
 * menu state display, and recent items labeling.
 * Order matters: first match wins. More specific patterns come first.
 */
const PRODUCT_ROUTES = [
  { pattern: /^\/doc\//, label: 'Kacheri Docs', product: 'docs' },
  { pattern: /^\/docs/, label: 'Kacheri Docs', product: 'docs' },
  { pattern: /^\/workspaces\/[^/]+\/studio\//, label: 'Design Studio', product: 'design-studio' },
  { pattern: /^\/workspaces\/[^/]+\/knowledge/, label: 'Knowledge Explorer', product: 'docs' },
  { pattern: /^\/workspaces\/[^/]+\/clauses/, label: 'Clause Library', product: 'docs' },
  { pattern: /^\/workspaces\/[^/]+\/negotiations/, label: 'Negotiations', product: 'docs' },
  { pattern: /^\/workspaces\/[^/]+\/compliance/, label: 'Compliance', product: 'docs' },
  { pattern: /^\/workspaces\/[^/]+\/extraction/, label: 'Extraction Standards', product: 'docs' },
  { pattern: /^\/workspaces\/[^/]+\/ai-safety/, label: 'AI Safety', product: null },
  { pattern: /^\/help\/proofs/, label: 'Proof System', product: null },
  { pattern: /^\/files/, label: 'File Manager', product: null },
  { pattern: /^\/jaal/, label: 'JAAL Research', product: 'jaal' },
  { pattern: /^\/ai-watch/, label: 'AI Watch', product: null },
  { pattern: /^\/$/, label: 'Home', product: null },
];

/** Fallback title when no route matches. */
const DEFAULT_TITLE = 'BEYLE Platform';

/**
 * Given a URL, extract the pathname and resolve the product label.
 * @param {string} url - Full URL including protocol and host.
 * @returns {{ label: string|null, product: string|null }}
 */
function resolveProductFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    for (const route of PRODUCT_ROUTES) {
      if (route.pattern.test(pathname)) {
        return { label: route.label, product: route.product };
      }
    }
  } catch (_err) {
    // Invalid URL (e.g., data: URLs during loading/error states)
  }
  return { label: null, product: null };
}

/**
 * Format the window title per spec: "BEYLE — {Label}"
 * @param {string|null} label - Product label or null for default.
 * @returns {string}
 */
function formatTitle(label) {
  return label ? 'BEYLE \u2014 ' + label : DEFAULT_TITLE;
}

/* ================================================================== */
/*  Section 1e: Recent Items Tracking (Slice S11)                      */
/* ================================================================== */

/**
 * In-memory list of recently navigated products.
 * Each entry: { label: string, route: string, timestamp: number }
 * Max 5 entries. Deduplicates by route (most recent wins).
 * Volatile: not persisted to disk (non-critical UX state).
 */
const MAX_RECENT_ITEMS = 5;
let recentItems = [];

/**
 * Track a navigation event. Deduplicates by route; most recent first.
 * Triggers tray rebuild to update the "Recent Items" submenu.
 *
 * @param {string} label - Human-readable product label.
 * @param {string} route - The route path (e.g., '/docs', '/files').
 */
function trackRecentItem(label, route) {
  if (!label || !route) return;

  // Remove existing entry with same route (dedup)
  recentItems = recentItems.filter(function (item) {
    return item.route !== route;
  });

  // Prepend new entry
  recentItems.unshift({ label: label, route: route, timestamp: Date.now() });

  // Cap at max
  if (recentItems.length > MAX_RECENT_ITEMS) {
    recentItems = recentItems.slice(0, MAX_RECENT_ITEMS);
  }

  // Rebuild tray to show updated recent items
  rebuildTrayMenu();
}

/* ================================================================== */
/*  Section 1b: Embedded Backend State (Slice S8)                      */
/* ================================================================== */

/** Port the embedded backend is listening on (null = not running). */
let localBackendPort = null;

/** Reference to the backend child process (null = not running). */
let backendChild = null;

/** Health monitor handle (has .stop() method). */
let healthMonitor = null;

/** Current backend status: not_started | starting | healthy | unhealthy | error */
let backendStatus = 'not_started';

/* ================================================================== */
/*  Section 1c: Health Monitor Callbacks (Slice S9)                    */
/* ================================================================== */

/**
 * Called by monitorHealth when the backend becomes unhealthy.
 * Updates status variable and notifies offlineManager.
 */
function onBackendUnhealthy() {
  backendStatus = 'unhealthy';
  console.warn('[Platform] Backend health check failing');
  offlineManager.notifyBackendUnhealthy();
}

/**
 * Called by monitorHealth when the backend recovers.
 * Updates status variable and notifies offlineManager.
 */
function onBackendHealthy() {
  backendStatus = 'healthy';
  console.log('[Platform] Backend health recovered');
  offlineManager.notifyBackendHealthy();
}

/* ================================================================== */
/*  Section 2: Single Instance Lock                                    */
/* ================================================================== */

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running. Quit immediately.
  // The existing instance will receive the 'second-instance' event.
  app.quit();
} else {
  // This is the primary instance.
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/* ================================================================== */
/*  Section 3: Window State Persistence                                */
/* ================================================================== */

let mainWindow = null;
let saveTimeout = null;

/**
 * Check whether a point (x, y) falls within any connected display.
 * Used to avoid restoring a window to a disconnected monitor.
 */
function isPositionOnScreen(x, y) {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    return x >= dx && x < dx + width && y >= dy && y < dy + height;
  });
}

/**
 * Capture current window bounds. When maximized, only record the
 * maximized flag — don't overwrite the restore-size bounds.
 */
function getWindowBounds() {
  if (!mainWindow) return null;
  const isMaximized = mainWindow.isMaximized();
  if (isMaximized) {
    return { maximized: true };
  }
  const bounds = mainWindow.getBounds();
  return {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: false,
  };
}

/**
 * Debounced save of window state to config.json (500ms delay).
 * Prevents excessive disk writes during rapid resize/move.
 */
function saveWindowState() {
  const bounds = getWindowBounds();
  if (!bounds) return;
  config.window = { ...config.window, ...bounds };
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveConfig(config), 500);
}

/* ================================================================== */
/*  Section 4: System Tray                                             */
/* ================================================================== */

let tray = null;

/**
 * 16x16 "B" monogram PNG as base64 data URL.
 * Minimal placeholder icon for the system tray.
 * Future slices can upgrade to branded .ico/.icns/.png assets.
 */
const TRAY_ICON_DATA =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
  'bklEQVR42mNgGAWDBDAyMDD8J0cjExD/B2L8apjwaTQB4v9A' +
  'TJJmFiD+D8T/SdGMy4D/QEyMZpIG+B9d4X8gJqSZ5EAEM8Cf' +
  'yECkOhDJDsT/uAKRkOb/RPgBl2aSMiJJLiAKYCTVAJJcQBTA' +
  'SKoBJLsAANkXN8EU7GNaAAAAAElFTkSuQmCC';

/** Show/focus the main window, restoring from minimize if needed. */
function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

/**
 * Resolve the base URL that the BrowserWindow is loading.
 * Cloud mode: cloudUrl. Local mode: localhost:{port} (S8).
 */
function resolveLoadUrl() {
  if (config.backendMode === 'cloud') {
    return config.cloudUrl || DEFAULT_CONFIG.cloudUrl;
  }
  // Local mode: use the port discovered by embedded backend (S8)
  if (localBackendPort) {
    return 'http://localhost:' + localBackendPort;
  }
  // Backend not ready yet — caller will show error/loading page
  return null;
}

/**
 * Focus the main window and navigate to a specific route path.
 * Used by tray menu product quick-launch items.
 */
function focusAndNavigate(routePath) {
  showMainWindow();
  if (!mainWindow) return;
  const baseUrl = resolveLoadUrl();
  if (baseUrl) {
    mainWindow.loadURL(baseUrl + routePath);
  }
}

/**
 * Create the system tray icon. Menu is built separately by rebuildTrayMenu().
 */
function createTray() {
  if (!config.tray || !config.tray.enabled) return;

  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('BEYLE Platform');

  // Build initial menu
  rebuildTrayMenu();

  // Double-click tray icon shows the main window
  tray.on('double-click', () => showMainWindow());
}

/**
 * Rebuild the tray context menu dynamically.
 * Called on initial tray creation and after navigation events to update
 * the "Recent Items" submenu.
 *
 * Menu structure:
 * - Header: "BEYLE Platform" (disabled)
 * - Product quick-launch items (respecting enabledProducts)
 * - Recent Items submenu (when populated)
 * - Show Window / Quit
 */
function rebuildTrayMenu() {
  if (!tray) return;

  var enabled = new Set(config.enabledProducts || []);

  var menuItems = [
    { label: 'BEYLE Platform', enabled: false },
    { type: 'separator' },
    { label: 'Home', click: function () { focusAndNavigate('/'); } },
    {
      label: 'Kacheri Docs',
      click: function () { focusAndNavigate('/docs'); },
      enabled: enabled.has('docs'),
    },
    {
      label: 'File Manager',
      click: function () { focusAndNavigate('/files'); },
    },
    {
      label: 'Design Studio',
      click: function () { focusAndNavigate('/files'); },
      enabled: enabled.has('design-studio'),
    },
    {
      label: 'BEYLE JAAL',
      click: function () {
        jaalDesktop
          .openJaalWindow(app.getPath('userData'))
          .catch(function (err) {
            console.error('[Platform] Tray JAAL click error:', err.message);
          });
      },
    },
  ];

  // Recent Items submenu (only show if we have items)
  if (recentItems.length > 0) {
    menuItems.push({ type: 'separator' });
    menuItems.push({
      label: 'Recent Items',
      submenu: recentItems.map(function (item) {
        return {
          label: item.label,
          click: function () { focusAndNavigate(item.route); },
        };
      }),
    });
  }

  menuItems.push({ type: 'separator' });
  menuItems.push({ label: 'Settings', click: function () { openSettingsWindow(); } });
  menuItems.push({ label: 'Show Window', click: function () { showMainWindow(); } });
  menuItems.push({
    label: 'Quit',
    click: function () {
      app.isQuitting = true;
      app.quit();
    },
  });

  var contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

/* ================================================================== */
/*  Section 4b: Application Menu Bar (Slice S11)                       */
/* ================================================================== */

/**
 * Build and set the application-level menu with product shortcuts.
 *
 * Uses Menu.setApplicationMenu() rather than globalShortcut because:
 * - globalShortcut captures keys system-wide (steals Ctrl+1 from other apps)
 * - setApplicationMenu accelerators only fire when the Electron app is focused
 * - Applies to ALL windows (main + JAAL), satisfying "shortcuts work from any window"
 *
 * Called once after createWindow(), and can be called again if product states change.
 */
function buildAppMenu() {
  var enabled = new Set(config.enabledProducts || []);

  var template = [
    {
      label: 'Products',
      submenu: [
        {
          label: 'Home',
          accelerator: 'CmdOrCtrl+1',
          click: function () { focusAndNavigate('/'); },
        },
        {
          label: 'Kacheri Docs',
          accelerator: 'CmdOrCtrl+2',
          enabled: enabled.has('docs'),
          click: function () { focusAndNavigate('/docs'); },
        },
        {
          label: 'File Manager',
          accelerator: 'CmdOrCtrl+3',
          click: function () { focusAndNavigate('/files'); },
        },
        {
          label: 'Design Studio',
          accelerator: 'CmdOrCtrl+4',
          enabled: enabled.has('design-studio'),
          click: function () { focusAndNavigate('/files'); },
          // Note: Design Studio has no standalone landing page (documented in S2).
          // Navigates to /files where user picks a workspace canvas.
        },
        {
          label: 'BEYLE JAAL',
          accelerator: 'CmdOrCtrl+5',
          click: function () {
            jaalDesktop
              .openJaalWindow(app.getPath('userData'))
              .catch(function (err) {
                console.error('[Platform] Menu JAAL click error:', err.message);
              });
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: function () { openSettingsWindow(); },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: function () {
            app.isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];

  var menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/* ================================================================== */
/*  Section 4c: Settings Window (Slice S22)                             */
/* ================================================================== */

/** Reference to the settings BrowserWindow (null when closed). */
let settingsWindow = null;

/**
 * Open the settings window, or focus it if already open.
 * The settings window is a secondary BrowserWindow loading
 * BEYLE PLATFORM/settings/index.html with its own preload script.
 */
function openSettingsWindow() {
  // Single instance — reuse if already open
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 700,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'BEYLE Platform — Settings',
    parent: mainWindow || undefined,
    modal: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'settings', 'preload.js'),
      devTools: true,
    },
  });

  settingsWindow.setMenuBarVisibility(false);

  settingsWindow.loadFile(path.join(__dirname, 'settings', 'index.html'));

  settingsWindow.on('closed', function () {
    settingsWindow = null;
  });
}

/* ================================================================== */
/*  Section 5: Local Mode Error HTML (Slice S8)                        */
/* ================================================================== */

/**
 * Build an error page shown when the embedded backend fails to start.
 * Includes a "Switch to Cloud Mode" button that communicates back to
 * the main process via a custom protocol handler or IPC.
 *
 * @param {string} errorMessage — The error reason to display.
 * @returns {string} — Fully formed HTML string.
 */
function buildBackendErrorHtml(errorMessage) {
  const safeMsg = (errorMessage || 'Unknown error')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BEYLE Platform — Backend Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f14;
      color: #e0e0e8;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 520px; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #ff5c5c; }
    p {
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 0.75rem;
      color: #a0a0b0;
    }
    code {
      background: #1a1a24;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.85rem;
      color: #c0c0d0;
    }
    .error-box {
      margin: 1.5rem 0;
      padding: 1rem;
      background: #1a1a24;
      border-radius: 8px;
      border: 1px solid #3a2a2a;
      text-align: left;
    }
    .error-box p { margin-bottom: 0; font-size: 0.85rem; }
    .actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; justify-content: center; }
    button {
      padding: 0.6rem 1.5rem;
      border: none;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .btn-primary { background: #7c5cff; color: #fff; }
    .btn-primary:hover { background: #6a4ae0; }
    .btn-secondary { background: #2a2a3a; color: #e0e0e8; }
    .btn-secondary:hover { background: #3a3a4a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Backend Startup Failed</h1>
    <p>The local backend could not be started.</p>
    <div class="error-box">
      <p>${safeMsg}</p>
    </div>
    <p>You can switch to cloud mode to connect to a remote backend,
    or retry starting the local backend.</p>
    <div class="actions">
      <button class="btn-primary" onclick="window.electronAPI?.switchToCloudMode?.()">
        Switch to Cloud Mode
      </button>
      <button class="btn-secondary" onclick="window.electronAPI?.retryLocalBackend?.()">
        Retry
      </button>
    </div>
  </div>
</body>
</html>`;
}

/* ================================================================== */
/*  Section 6: BrowserWindow Creation                                  */
/* ================================================================== */

function createWindow() {
  const winOpts = {
    width: config.window.width || 1280,
    height: config.window.height || 900,
    title: 'BEYLE Platform',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true,
    },
  };

  // Apply saved position only if it falls within a visible display
  if (config.window.x != null && config.window.y != null) {
    if (isPositionOnScreen(config.window.x, config.window.y)) {
      winOpts.x = config.window.x;
      winOpts.y = config.window.y;
    }
  }

  mainWindow = new BrowserWindow(winOpts);

  // Restore maximized state
  if (config.window.maximized) {
    mainWindow.maximize();
  }

  // S11: removeMenu() removed — buildAppMenu() sets application-level menu
  // with product shortcuts (Ctrl+1–5) that applies to all windows.

  // --- Window state persistence events ---
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  // --- Close-to-tray behavior ---
  mainWindow.on('close', (event) => {
    saveWindowState();
    if (config.tray && config.tray.closeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // --- Load the appropriate URL ---
  const loadUrl = resolveLoadUrl();
  if (loadUrl) {
    mainWindow.loadURL(loadUrl);
  } else if (config.backendMode === 'local' && backendStatus === 'error') {
    // Local mode: backend failed to start — show error page
    const html = buildBackendErrorHtml(
      'The embedded backend did not start. Check console for details.'
    );
    mainWindow.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(html)
    );
  } else {
    // Local mode: backend starting — show loading indicator
    const loadingHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>BEYLE Platform</title>
<style>
  body { background: #0f0f14; color: #e0e0e8; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; font-family: system-ui; }
  .loader { text-align: center; }
  h2 { color: #7c5cff; margin-bottom: 1rem; }
  .spinner { width: 32px; height: 32px; border: 3px solid #2a2a3a;
             border-top-color: #7c5cff; border-radius: 50%;
             animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head><body><div class="loader">
  <div class="spinner"></div>
  <h2>Starting local backend...</h2>
  <p style="color:#a0a0b0">This may take a moment on first run.</p>
</div></body></html>`;
    mainWindow.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml)
    );
  }

  // --- Handle load failures (e.g., cloud URL unreachable) ---
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `Failed to load ${validatedURL}: ${errorCode} ${errorDescription}`
      );
      // Show a user-friendly error page
      const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Connection Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f14;
      color: #e0e0e8;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 520px; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #ff5c5c; }
    p { font-size: 0.95rem; line-height: 1.6; margin-bottom: 0.75rem; color: #a0a0b0; }
    code { background: #1a1a24; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85rem; color: #c0c0d0; }
    button {
      margin-top: 1rem;
      padding: 0.6rem 1.5rem;
      background: #7c5cff;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 0.9rem;
      cursor: pointer;
    }
    button:hover { background: #6a4ae0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Connection Error</h1>
    <p>Could not connect to <code>${validatedURL || 'the configured URL'}</code>.</p>
    <p>Error: ${errorDescription || 'Unknown error'} (${errorCode})</p>
    <p>Make sure the KACHERI Frontend is running and the URL in <code>config.json</code> is correct.</p>
    <button onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`;
      mainWindow.loadURL(
        'data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml)
      );
    }
  );

  // --- S11: Dynamic window title based on active product ---
  // Listen to both did-navigate (full page loads) and did-navigate-in-page
  // (SPA pushState/replaceState) to catch all React Router transitions.
  var wc = mainWindow.webContents;

  function updateMainWindowTitle(url) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    var resolved = resolveProductFromUrl(url);
    mainWindow.setTitle(formatTitle(resolved.label));

    // Track for recent items
    try {
      var pathname = new URL(url).pathname;
      if (resolved.label) {
        trackRecentItem(resolved.label, pathname);
      }
    } catch (_err) {
      // Ignore data: URLs, etc.
    }
  }

  wc.on('did-navigate', function (_event, url) {
    updateMainWindowTitle(url);
  });

  wc.on('did-navigate-in-page', function (_event, url) {
    updateMainWindowTitle(url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ================================================================== */
/*  Section 7: IPC Handler Registration                                */
/* ================================================================== */

function wireIPC() {
  // --- Synchronous: backendUrl for preload property ---
  // preload.js reads this via ipcRenderer.sendSync() to expose as
  // window.electronAPI.backendUrl (synchronous property).
  // context.ts reads it as: api?.backendUrl as string | undefined
  ipcMain.on('platform:getBackendUrl', (event) => {
    if (config.backendMode === 'cloud') {
      event.returnValue = config.cloudUrl || DEFAULT_CONFIG.cloudUrl;
    } else {
      // Local mode: use auto-discovered port (S8), fall back to config
      event.returnValue =
        'http://localhost:' + (localBackendPort || config.localPort || 3001);
    }
  });

  // --- Async: getConfig ---
  ipcMain.handle('platform:getConfig', async () => {
    return {
      backendMode: config.backendMode,
      cloudUrl: config.cloudUrl,
      enabledProducts: config.enabledProducts || ['docs', 'design-studio'],
      localPort: localBackendPort || config.localPort || 3001,
    };
  });

  // --- Async: openJaal (S10: JAAL Desktop Window Integration) ---
  ipcMain.handle('platform:openJaal', async () => {
    return jaalDesktop.openJaalWindow(app.getPath('userData'));
  });

  // --- Async: getBackendStatus (S8: returns actual embedded backend status) ---
  ipcMain.handle('platform:getBackendStatus', async () => {
    if (config.backendMode === 'local') {
      return {
        status: backendStatus,
        mode: 'local',
        port: localBackendPort,
      };
    }

    // Cloud mode: ping the /health endpoint
    const healthUrl =
      (config.cloudUrl || DEFAULT_CONFIG.cloudUrl) + '/health';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return { status: data.status || 'healthy', mode: 'cloud' };
      }
      return { status: 'degraded', mode: 'cloud' };
    } catch (_err) {
      return { status: 'unreachable', mode: 'cloud' };
    }
  });

  // --- Async: getPlatformInfo ---
  ipcMain.handle('platform:getPlatformInfo', async () => {
    let version = '0.1.0';
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
      );
      version = pkg.version || version;
    } catch (_err) {
      // Swallow — use default version
    }
    return {
      platform: 'electron',
      version,
      backendMode: config.backendMode,
    };
  });

  // --- Async: switchToCloudMode (S8 + S9: used by error page / offline overlay) ---
  ipcMain.handle('platform:switchToCloudMode', async () => {
    config.backendMode = 'cloud';
    saveConfig(config);

    // Stop any running embedded backend
    if (backendChild) {
      await stopEmbeddedBackend(backendChild);
      backendChild = null;
      localBackendPort = null;
      backendStatus = 'not_started';
    }
    if (healthMonitor) {
      healthMonitor.stop();
      healthMonitor = null;
    }

    // Reload the window with cloud URL
    const cloudUrl = config.cloudUrl || DEFAULT_CONFIG.cloudUrl;
    if (mainWindow) {
      mainWindow.loadURL(cloudUrl);
    }

    // S9: Start cloud health monitoring after switching
    offlineManager.stopCloudMonitoring();
    offlineManager.startCloudMonitoring(cloudUrl);

    return { ok: true, url: cloudUrl };
  });

  // --- Async: retryLocalBackend (S8 + S9: used by error page / offline overlay) ---
  ipcMain.handle('platform:retryLocalBackend', async () => {
    if (config.backendMode !== 'local') {
      return { ok: false, error: 'Not in local mode' };
    }

    // Stop any existing backend
    if (backendChild) {
      await stopEmbeddedBackend(backendChild);
      backendChild = null;
    }
    if (healthMonitor) {
      healthMonitor.stop();
      healthMonitor = null;
    }

    backendStatus = 'starting';
    localBackendPort = null;

    try {
      const result = await startEmbeddedBackend({
        userDataPath: app.getPath('userData'),
        backendDir: path.resolve(__dirname, '..', 'KACHERI BACKEND'),
        enabledProducts: config.enabledProducts,
      });
      localBackendPort = result.port;
      backendChild = result.child;
      backendStatus = 'healthy';

      // Start health monitoring with S9 callbacks
      healthMonitor = monitorHealth(
        localBackendPort,
        onBackendUnhealthy,
        onBackendHealthy
      );

      // S9: Notify offline manager of recovery
      offlineManager.notifyBackendHealthy();

      // Reload window with backend URL
      if (mainWindow) {
        mainWindow.loadURL('http://localhost:' + localBackendPort);
      }
      return { ok: true, port: localBackendPort };
    } catch (err) {
      backendStatus = 'error';
      console.error('[Platform] Retry failed:', err.message);

      // S9: Notify offline manager of fatal error
      offlineManager.notifyFatalError(err);

      // Show error page
      if (mainWindow) {
        const html = buildBackendErrorHtml(err.message);
        mainWindow.loadURL(
          'data:text/html;charset=utf-8,' + encodeURIComponent(html)
        );
      }
      return { ok: false, error: err.message };
    }
  });

  // --- S9: Offline mode & resilience IPC handlers ---

  /** Cache activity feed items from the renderer for offline use. */
  ipcMain.handle(
    'platform:cacheActivityFeed',
    async (_event, items, workspaceId) => {
      offlineManager.cacheActivityFeed(items, workspaceId);
      return { ok: true };
    }
  );

  /** Return cached activity feed when the backend is offline. */
  ipcMain.handle('platform:getCachedActivityFeed', async () => {
    return offlineManager.getActivityCache();
  });

  /** Return current offline state. */
  ipcMain.handle('platform:getOfflineState', async () => {
    return { state: offlineManager.getState() };
  });

  // --- S22: Settings window IPC handlers ---

  /**
   * Read current platform config for the settings UI.
   * Returns sanitized config (no secrets, no window bounds).
   */
  ipcMain.handle('platform:settings:getConfig', async () => {
    let version = '0.1.0';
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
      );
      version = pkg.version || version;
    } catch (_err) {
      // Use default version
    }
    return {
      backendMode: config.backendMode,
      cloudUrl: config.cloudUrl || '',
      localPort: localBackendPort || config.localPort || 3001,
      enabledProducts: config.enabledProducts || DEFAULT_CONFIG.enabledProducts,
      appearance: config.appearance || 'system',
      startup: config.startup || DEFAULT_CONFIG.startup,
      tray: config.tray || DEFAULT_CONFIG.tray,
      jaalAutoSync: config.jaalAutoSync !== false,
      version: version,
    };
  });

  /**
   * Save partial platform config from the settings UI.
   * Triggers side effects: menu/tray rebuild, backend mode switch, etc.
   */
  ipcMain.handle('platform:settings:saveConfig', async (_event, partial) => {
    try {
      var prevMode = config.backendMode;
      var prevProducts = (config.enabledProducts || []).join(',');
      var prevTrayEnabled = config.tray && config.tray.enabled;

      // Apply partial updates to config
      if (partial.backendMode) config.backendMode = partial.backendMode;
      if (partial.cloudUrl !== undefined) config.cloudUrl = partial.cloudUrl;
      if (partial.enabledProducts) config.enabledProducts = partial.enabledProducts;
      if (partial.appearance !== undefined) config.appearance = partial.appearance;
      if (partial.startup) config.startup = { ...config.startup, ...partial.startup };
      if (partial.tray) config.tray = { ...config.tray, ...partial.tray };
      if (partial.jaalAutoSync !== undefined) config.jaalAutoSync = partial.jaalAutoSync;

      // Apply launch-at-login setting
      if (partial.startup && partial.startup.launchAtLogin !== undefined) {
        try {
          app.setLoginItemSettings({
            openAtLogin: partial.startup.launchAtLogin,
          });
        } catch (err) {
          console.warn('[Platform] setLoginItemSettings failed:', err.message);
        }
      }

      saveConfig(config);

      // Side effects: rebuild menus if products changed
      var newProducts = (config.enabledProducts || []).join(',');
      var productsChanged = prevProducts !== newProducts;
      if (productsChanged) {
        buildAppMenu();
      }

      // Side effects: tray enable/disable and product-change rebuild
      var newTrayEnabled = config.tray && config.tray.enabled;
      if (prevTrayEnabled && !newTrayEnabled && tray) {
        tray.destroy();
        tray = null;
      } else if (!prevTrayEnabled && newTrayEnabled && !tray) {
        createTray(); // createTray() calls rebuildTrayMenu() internally
      } else if (newTrayEnabled && productsChanged) {
        rebuildTrayMenu(); // Only rebuild if products actually changed
      }

      // Side effects: backend mode changed
      if (prevMode !== config.backendMode) {
        if (config.backendMode === 'cloud') {
          // Switch to cloud: stop local backend, reload with cloud URL
          if (backendChild) {
            await stopEmbeddedBackend(backendChild);
            backendChild = null;
            localBackendPort = null;
            backendStatus = 'not_started';
          }
          if (healthMonitor) {
            healthMonitor.stop();
            healthMonitor = null;
          }
          offlineManager.stopCloudMonitoring();
          offlineManager.startCloudMonitoring(
            config.cloudUrl || DEFAULT_CONFIG.cloudUrl
          );
          if (mainWindow) {
            mainWindow.loadURL(config.cloudUrl || DEFAULT_CONFIG.cloudUrl);
          }
        } else {
          // Switch to local: start embedded backend
          offlineManager.stopCloudMonitoring();
          backendStatus = 'starting';
          try {
            var result = await startEmbeddedBackend({
              userDataPath: app.getPath('userData'),
              backendDir: path.resolve(__dirname, '..', 'KACHERI BACKEND'),
              enabledProducts: config.enabledProducts,
            });
            localBackendPort = result.port;
            backendChild = result.child;
            backendStatus = 'healthy';
            healthMonitor = monitorHealth(
              localBackendPort,
              onBackendUnhealthy,
              onBackendHealthy
            );
            offlineManager.notifyBackendHealthy();
            if (mainWindow) {
              mainWindow.loadURL('http://localhost:' + localBackendPort);
            }
          } catch (err) {
            backendStatus = 'error';
            console.error('[Platform] Local backend start failed:', err.message);
            offlineManager.notifyFatalError(err);
          }
        }
      }

      return { ok: true };
    } catch (err) {
      console.error('[Platform] Settings save error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  /**
   * Validate a cloud URL by pinging /health with a 5-second timeout.
   */
  ipcMain.handle(
    'platform:settings:validateCloudUrl',
    async (_event, url) => {
      if (!url || typeof url !== 'string') {
        return { ok: false, reachable: false, error: 'No URL provided' };
      }
      // Sanitize: ensure it looks like a URL
      try {
        new URL(url);
      } catch (_err) {
        return { ok: false, reachable: false, error: 'Invalid URL format' };
      }
      var healthUrl = url.replace(/\/+$/, '') + '/health';
      try {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 5000);
        var res = await fetch(healthUrl, { signal: controller.signal });
        clearTimeout(timeout);
        return { ok: true, reachable: res.ok };
      } catch (err) {
        return {
          ok: false,
          reachable: false,
          error: err.name === 'AbortError' ? 'Timeout (5s)' : err.message,
        };
      }
    }
  );

  /**
   * Read JAAL sync config via kacheriSync (lazy-loaded via jaalDesktop).
   * Returns PAT status (never the actual token).
   */
  ipcMain.handle('platform:settings:getJaalSyncConfig', async () => {
    var sync = jaalDesktop.getKacheriSync();
    if (!sync) {
      return null;
    }
    try {
      return sync.getConfig();
    } catch (err) {
      console.warn('[Platform] getJaalSyncConfig error:', err.message);
      return null;
    }
  });

  /**
   * Save JAAL sync config (PAT encrypted via safeStorage).
   */
  ipcMain.handle(
    'platform:settings:saveJaalSyncConfig',
    async (_event, payload) => {
      var sync = jaalDesktop.getKacheriSync();
      if (!sync) {
        return { ok: false, error: 'JAAL sync module not available' };
      }
      try {
        sync.configure(payload);
        return { ok: true };
      } catch (err) {
        console.error('[Platform] saveJaalSyncConfig error:', err.message);
        return { ok: false, error: err.message };
      }
    }
  );

  /**
   * Get last JAAL sync result.
   */
  ipcMain.handle('platform:settings:getJaalSyncStatus', async () => {
    var sync = jaalDesktop.getKacheriSync();
    if (!sync) return null;
    try {
      return sync.getLastSyncState();
    } catch (_err) {
      return null;
    }
  });

  /**
   * Close the settings window.
   */
  ipcMain.handle('platform:settings:close', async () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });
}

/* ================================================================== */
/*  Section 8: App Lifecycle                                           */
/* ================================================================== */

// Flag to distinguish intentional quit from close-to-tray
app.isQuitting = false;

// Only proceed if this is the primary instance (see Section 2)
if (gotTheLock) {
  app.whenReady().then(async () => {
    wireIPC();

    // --- S8 + S9: Start embedded backend in local mode with auto-restart ---
    if (config.backendMode === 'local') {
      backendStatus = 'starting';
      try {
        const backendOpts = {
          userDataPath: app.getPath('userData'),
          backendDir: path.resolve(__dirname, '..', 'KACHERI BACKEND'),
          enabledProducts: config.enabledProducts,
        };

        // S9: Use startWithAutoRestart for crash recovery (max 3 attempts)
        await startWithAutoRestart(
          backendOpts,
          // onPortReady — fires on initial start AND each successful restart
          (port, child) => {
            const isRestart = localBackendPort !== null;
            localBackendPort = port;
            backendChild = child;
            backendStatus = 'healthy';

            console.log(
              `[Platform] Backend ${isRestart ? 're' : ''}started on port ${port}`
            );

            // Restart health monitor on (potentially new) port
            if (healthMonitor) {
              healthMonitor.stop();
            }
            healthMonitor = monitorHealth(
              port,
              onBackendUnhealthy,
              onBackendHealthy
            );

            offlineManager.notifyBackendHealthy();

            // If window is showing error/loading page, reload with backend URL
            if (isRestart && mainWindow && !mainWindow.isDestroyed()) {
              const currentUrl = mainWindow.webContents.getURL();
              if (currentUrl.startsWith('data:')) {
                mainWindow.loadURL('http://localhost:' + port);
              }
            }
          },
          // onFatalError — max restarts exceeded
          (error) => {
            backendStatus = 'error';
            console.error('[Platform] Fatal backend error:', error.message);
            offlineManager.notifyFatalError(error);
          },
          // onRestarting — restart attempt beginning (before backoff delay)
          (attempt, maxAttempts) => {
            offlineManager.notifyBackendRestarting(attempt, maxAttempts);
          }
        );
      } catch (err) {
        console.error('[Platform] Embedded backend failed:', err.message);
        backendStatus = 'error';
        // createWindow() will show the error page via resolveLoadUrl() → null
      }
    }

    createWindow();
    buildAppMenu(); // S11: Set application menu with product shortcuts (Ctrl+1–5)
    createTray();

    // S9: Initialize offline manager after window creation
    offlineManager.init(mainWindow, config, app.getPath('userData'));

    // S9: Start cloud health monitoring if in cloud mode
    if (config.backendMode === 'cloud') {
      offlineManager.startCloudMonitoring(
        config.cloudUrl || DEFAULT_CONFIG.cloudUrl
      );
    }

    // S9: If local mode failed at startup, notify offline manager now
    if (config.backendMode === 'local' && backendStatus === 'error') {
      offlineManager.notifyFatalError(
        new Error('The embedded backend did not start. Check console for details.')
      );
    }

    // macOS: re-create window when dock icon is clicked and no windows exist
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        showMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    // On macOS, apps stay open until Cmd+Q.
    // On other platforms, don't quit if tray is active and closeToTray is on.
    if (process.platform === 'darwin') return;
    if (config.tray && config.tray.closeToTray && tray) return;
    app.quit();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;

    // S22: Close settings window if open
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.destroy();
      settingsWindow = null;
    }

    // S10: Destroy JAAL window and clean up resources
    jaalDesktop.destroy();

    // S9: Stop offline monitoring (cloud polling, recovery timers)
    offlineManager.destroy();

    // S8: Stop health monitoring
    if (healthMonitor) {
      healthMonitor.stop();
      healthMonitor = null;
    }

    // S8: Gracefully stop the embedded backend subprocess
    if (backendChild) {
      stopEmbeddedBackend(backendChild).then(() => {
        backendChild = null;
        localBackendPort = null;
        backendStatus = 'not_started';
      });
    }
  });
}
