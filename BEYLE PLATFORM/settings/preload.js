'use strict';

/**
 * BEYLE Platform — Settings Window Preload Script (Slice S22)
 *
 * Exposes `window.settingsAPI` for the settings renderer.
 * All calls go through IPC to the main process which owns config state.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  /**
   * Read current platform config (sanitized — no secrets).
   * @returns {Promise<{
   *   backendMode: string,
   *   cloudUrl: string,
   *   localPort: number,
   *   enabledProducts: string[],
   *   appearance: string,
   *   startup: { launchAtLogin: boolean, startMinimized: boolean },
   *   tray: { enabled: boolean, closeToTray: boolean },
   *   jaalAutoSync: boolean
   * }>}
   */
  getConfig: () => ipcRenderer.invoke('platform:settings:getConfig'),

  /**
   * Save partial platform config. Only provided fields are updated.
   * Triggers side effects (menu/tray rebuild, backend mode switch, etc.)
   * @param {Object} partial — Fields to update
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  saveConfig: (partial) => ipcRenderer.invoke('platform:settings:saveConfig', partial),

  /**
   * Validate a cloud URL by pinging its /health endpoint (5s timeout).
   * @param {string} url — The cloud URL to validate
   * @returns {Promise<{ ok: boolean, reachable: boolean, error?: string }>}
   */
  validateCloudUrl: (url) =>
    ipcRenderer.invoke('platform:settings:validateCloudUrl', url),

  /**
   * Read JAAL sync configuration (PAT status, workspace, API URL).
   * PAT value is never returned — only `patConfigured` boolean.
   * @returns {Promise<{ workspaceId?: string, apiUrl?: string, patConfigured: boolean, patEncrypted: boolean, lastSync?: object } | null>}
   */
  getJaalSyncConfig: () =>
    ipcRenderer.invoke('platform:settings:getJaalSyncConfig'),

  /**
   * Save JAAL sync configuration. PAT is encrypted via safeStorage.
   * @param {{ pat?: string, workspaceId?: string, apiUrl?: string }} payload
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  saveJaalSyncConfig: (payload) =>
    ipcRenderer.invoke('platform:settings:saveJaalSyncConfig', payload),

  /**
   * Get last JAAL sync result.
   * @returns {Promise<{ ok: boolean, ts?: number, error?: string } | null>}
   */
  getJaalSyncStatus: () =>
    ipcRenderer.invoke('platform:settings:getJaalSyncStatus'),

  /**
   * Close the settings window.
   */
  closeWindow: () => ipcRenderer.invoke('platform:settings:close'),
});
