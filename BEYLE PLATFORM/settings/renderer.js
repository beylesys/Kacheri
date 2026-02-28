'use strict';

/**
 * BEYLE Platform — Settings Window Renderer (Slice S22)
 *
 * Vanilla JS logic for the settings form.
 * Communicates with the main process via `window.settingsAPI`
 * (exposed by settings/preload.js).
 */

/* ================================================================== */
/*  DOM References                                                      */
/* ================================================================== */

var $ = function (id) { return document.getElementById(id); };

var els = {
  // Backend
  modeCloud: $('modeCloud'),
  modeLocal: $('modeLocal'),
  cloudUrl: $('cloudUrl'),
  cloudUrlField: $('cloudUrlField'),
  cloudUrlStatus: $('cloudUrlStatus'),
  localPortField: $('localPortField'),
  localPortDisplay: $('localPortDisplay'),

  // Products
  productDocs: $('productDocs'),
  productStudio: $('productStudio'),
  productJaal: $('productJaal'),

  // JAAL Sync
  jaalApiUrl: $('jaalApiUrl'),
  jaalWorkspaceId: $('jaalWorkspaceId'),
  jaalPat: $('jaalPat'),
  jaalAutoSync: $('jaalAutoSync'),
  patStatus: $('patStatus'),
  patStatusText: $('patStatusText'),
  syncStatus: $('syncStatus'),

  // Appearance
  appearance: $('appearance'),

  // Startup
  launchAtLogin: $('launchAtLogin'),
  startMinimized: $('startMinimized'),

  // Tray
  trayEnabled: $('trayEnabled'),
  closeToTray: $('closeToTray'),

  // Footer
  footerStatus: $('footerStatus'),
  btnSave: $('btnSave'),
  btnCancel: $('btnCancel'),
  versionLabel: $('versionLabel'),
};

/* ================================================================== */
/*  State                                                               */
/* ================================================================== */

/** Debounce timer for cloud URL validation. */
var validateTimer = null;

/** Whether a save is in progress (prevents double-click). */
var saving = false;

/* ================================================================== */
/*  Initialization                                                      */
/* ================================================================== */

document.addEventListener('DOMContentLoaded', function () {
  loadCurrentConfig();
  loadJaalSyncConfig();
  wireEvents();
});

/**
 * Load platform config from main process and populate the form.
 */
async function loadCurrentConfig() {
  try {
    var cfg = await window.settingsAPI.getConfig();

    // Backend mode
    if (cfg.backendMode === 'local') {
      els.modeLocal.checked = true;
    } else {
      els.modeCloud.checked = true;
    }
    updateBackendModeUI(cfg.backendMode);

    // Cloud URL
    els.cloudUrl.value = cfg.cloudUrl || '';

    // Local port
    els.localPortDisplay.textContent = cfg.localPort ? String(cfg.localPort) : '—';

    // Enabled products
    var products = new Set(cfg.enabledProducts || []);
    els.productDocs.checked = products.has('docs');
    els.productStudio.checked = products.has('design-studio');
    els.productJaal.checked = products.has('jaal');

    // Appearance
    els.appearance.value = cfg.appearance || 'system';

    // Startup
    var startup = cfg.startup || {};
    els.launchAtLogin.checked = !!startup.launchAtLogin;
    els.startMinimized.checked = !!startup.startMinimized;

    // Tray
    var tray = cfg.tray || {};
    els.trayEnabled.checked = tray.enabled !== false;
    els.closeToTray.checked = tray.closeToTray !== false;

    // Auto-sync
    els.jaalAutoSync.checked = cfg.jaalAutoSync !== false;

    // Version label
    els.versionLabel.textContent = 'v' + (cfg.version || '0.1.0');
  } catch (err) {
    showStatus('Failed to load config: ' + err.message, 'error');
  }
}

/**
 * Load JAAL sync config (PAT status, workspace, API URL, last sync).
 */
async function loadJaalSyncConfig() {
  try {
    var sync = await window.settingsAPI.getJaalSyncConfig();
    if (!sync) {
      // kacheriSync not initialized — show defaults
      updatePatStatus(false, false);
      return;
    }

    els.jaalApiUrl.value = sync.apiUrl || '';
    els.jaalWorkspaceId.value = sync.workspaceId || '';
    updatePatStatus(sync.patConfigured, sync.patEncrypted);

    // Load last sync status
    var status = await window.settingsAPI.getJaalSyncStatus();
    if (status && status.ts) {
      var date = new Date(status.ts);
      var text = status.ok
        ? 'Last sync: ' + date.toLocaleString()
        : 'Last sync failed: ' + (status.error || 'unknown error');
      els.syncStatus.textContent = text;
    } else {
      els.syncStatus.textContent = 'No sync history';
    }
  } catch (err) {
    els.syncStatus.textContent = 'Could not load sync config';
  }
}

/* ================================================================== */
/*  Event Wiring                                                        */
/* ================================================================== */

function wireEvents() {
  // Backend mode radio change
  els.modeCloud.addEventListener('change', function () {
    updateBackendModeUI('cloud');
  });
  els.modeLocal.addEventListener('change', function () {
    updateBackendModeUI('local');
  });

  // Cloud URL validation on input (debounced 800ms)
  els.cloudUrl.addEventListener('input', function () {
    if (validateTimer) clearTimeout(validateTimer);
    var url = els.cloudUrl.value.trim();
    if (!url) {
      setUrlStatus('', '');
      return;
    }
    validateTimer = setTimeout(function () {
      validateCloudUrl(url);
    }, 800);
  });

  // Save button
  els.btnSave.addEventListener('click', function () {
    handleSave();
  });

  // Cancel button
  els.btnCancel.addEventListener('click', function () {
    window.settingsAPI.closeWindow();
  });

  // Keyboard: Enter to save, Escape to cancel
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      window.settingsAPI.closeWindow();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  });
}

/* ================================================================== */
/*  UI Helpers                                                          */
/* ================================================================== */

/**
 * Show/hide cloud vs local fields based on backend mode.
 * @param {string} mode — 'cloud' or 'local'
 */
function updateBackendModeUI(mode) {
  if (mode === 'cloud') {
    els.cloudUrlField.classList.remove('hidden');
    els.localPortField.classList.add('hidden');
  } else {
    els.cloudUrlField.classList.add('hidden');
    els.localPortField.classList.remove('hidden');
  }
}

/**
 * Update PAT status badge.
 * @param {boolean} configured
 * @param {boolean} encrypted
 */
function updatePatStatus(configured, encrypted) {
  if (configured) {
    els.patStatus.className = 'pat-status configured';
    var text = encrypted ? 'Configured (encrypted)' : 'Configured';
    els.patStatusText.textContent = text;
    els.jaalPat.placeholder = 'Enter new PAT to replace';
  } else {
    els.patStatus.className = 'pat-status not-configured';
    els.patStatusText.textContent = 'Not configured';
    els.jaalPat.placeholder = 'Enter PAT (bpat_...)';
  }
}

/**
 * Set the cloud URL validation status indicator.
 * @param {string} cls — 'reachable', 'unreachable', 'checking', or ''
 * @param {string} text — Status text
 */
function setUrlStatus(cls, text) {
  // Clear previous content safely (no innerHTML)
  els.cloudUrlStatus.textContent = '';
  if (!cls) {
    els.cloudUrlStatus.className = 'url-validation';
    return;
  }
  els.cloudUrlStatus.className = 'url-validation ' + cls;
  var dot = document.createElement('span');
  dot.className = 'dot';
  els.cloudUrlStatus.appendChild(dot);
  els.cloudUrlStatus.appendChild(document.createTextNode(' ' + text));
}

/**
 * Show a status message in the footer.
 * @param {string} text
 * @param {'success'|'error'|''} type
 * @param {number} [autoClearMs] — Auto-clear after N ms
 */
function showStatus(text, type, autoClearMs) {
  els.footerStatus.textContent = text;
  els.footerStatus.className = 'footer-status' + (type ? ' ' + type : '');
  if (autoClearMs) {
    setTimeout(function () {
      if (els.footerStatus.textContent === text) {
        els.footerStatus.textContent = '';
        els.footerStatus.className = 'footer-status';
      }
    }, autoClearMs);
  }
}

/* ================================================================== */
/*  Cloud URL Validation                                                */
/* ================================================================== */

/**
 * Ping a cloud URL's /health endpoint.
 * @param {string} url
 */
async function validateCloudUrl(url) {
  setUrlStatus('checking', 'Checking...');
  try {
    var result = await window.settingsAPI.validateCloudUrl(url);
    if (result.reachable) {
      setUrlStatus('reachable', 'Reachable');
    } else {
      setUrlStatus('unreachable', result.error || 'Unreachable');
    }
  } catch (_err) {
    setUrlStatus('unreachable', 'Validation failed');
  }
}

/* ================================================================== */
/*  Save Handler                                                        */
/* ================================================================== */

/**
 * Collect form values and save both platform config and JAAL sync config.
 */
async function handleSave() {
  if (saving) return;
  saving = true;
  els.btnSave.disabled = true;
  showStatus('Saving...', '');

  try {
    // --- Collect platform config ---
    var backendMode = els.modeLocal.checked ? 'local' : 'cloud';

    var enabledProducts = [];
    if (els.productDocs.checked) enabledProducts.push('docs');
    if (els.productStudio.checked) enabledProducts.push('design-studio');
    if (els.productJaal.checked) enabledProducts.push('jaal');

    var platformConfig = {
      backendMode: backendMode,
      cloudUrl: els.cloudUrl.value.trim(),
      enabledProducts: enabledProducts,
      appearance: els.appearance.value,
      startup: {
        launchAtLogin: els.launchAtLogin.checked,
        startMinimized: els.startMinimized.checked,
      },
      tray: {
        enabled: els.trayEnabled.checked,
        closeToTray: els.closeToTray.checked,
      },
      jaalAutoSync: els.jaalAutoSync.checked,
    };

    var result = await window.settingsAPI.saveConfig(platformConfig);
    if (!result.ok) {
      showStatus('Save failed: ' + (result.error || 'Unknown error'), 'error');
      return;
    }

    // --- Save JAAL sync config (if any fields provided) ---
    var jaalPayload = {};
    var hasJaalChanges = false;

    var apiUrl = els.jaalApiUrl.value.trim();
    if (apiUrl) {
      jaalPayload.apiUrl = apiUrl;
      hasJaalChanges = true;
    }

    var workspaceId = els.jaalWorkspaceId.value.trim();
    if (workspaceId) {
      jaalPayload.workspaceId = workspaceId;
      hasJaalChanges = true;
    }

    var pat = els.jaalPat.value.trim();
    if (pat) {
      jaalPayload.pat = pat;
      hasJaalChanges = true;
    }

    if (hasJaalChanges) {
      var syncResult = await window.settingsAPI.saveJaalSyncConfig(jaalPayload);
      if (!syncResult.ok) {
        showStatus(
          'Platform saved, but JAAL sync failed: ' + (syncResult.error || ''),
          'error'
        );
        return;
      }
    }

    // Clear PAT input after save (security: don't echo it)
    els.jaalPat.value = '';

    // Reload JAAL sync status to reflect changes
    if (hasJaalChanges) {
      await loadJaalSyncConfig();
    }

    showStatus('Settings saved', 'success', 3000);
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  } finally {
    saving = false;
    els.btnSave.disabled = false;
  }
}
