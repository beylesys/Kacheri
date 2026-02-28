'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * BEYLE Platform — Preload Script (Slice S7 + S8 + S9 + S10 + S11)
 *
 * Exposes `window.electronAPI` for the KACHERI Frontend renderer.
 *
 * The frontend's platform/context.ts detects Electron by checking:
 *   (window as Record<string, unknown>).electronAPI
 * and reads the backend URL as a synchronous property:
 *   api?.backendUrl as string | undefined
 *
 * IMPORTANT: `backendUrl` must be a synchronous property, not an async
 * function. context.ts reads it at module load time (line 92). We use
 * ipcRenderer.sendSync() which is safe because main.js registers IPC
 * handlers (wireIPC) before creating the BrowserWindow.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // --- Synchronous property: backend URL ---
  // Read by KACHERI FRONTEND/src/platform/context.ts getBackendUrl()
  backendUrl: ipcRenderer.sendSync('platform:getBackendUrl'),

  // --- Async API methods ---

  /**
   * Returns platform configuration.
   * @returns {Promise<{ backendMode: string, cloudUrl: string, enabledProducts: string[], localPort: number }>}
   */
  getConfig: () => ipcRenderer.invoke('platform:getConfig'),

  /**
   * Opens a JAAL desktop window (S10).
   * Creates or focuses the JAAL research browser window with full
   * privacy, IPC handlers, sessions, proofs, and Kacheri sync.
   * @returns {Promise<{ ok: boolean, action?: string, error?: string }>}
   */
  openJaal: () => ipcRenderer.invoke('platform:openJaal'),

  /**
   * Returns the current backend health status.
   * Cloud mode: pings /health endpoint with 5s timeout.
   * Local mode: returns actual embedded backend status.
   * @returns {Promise<{ status: string, mode: string, port?: number, message?: string }>}
   */
  getBackendStatus: () => ipcRenderer.invoke('platform:getBackendStatus'),

  /**
   * Returns platform information.
   * @returns {Promise<{ platform: 'electron', version: string, backendMode: string }>}
   */
  getPlatformInfo: () => ipcRenderer.invoke('platform:getPlatformInfo'),

  // --- S8: Embedded backend error recovery ---

  /**
   * Switch from local mode to cloud mode.
   * Saves config and reloads the window with the cloud URL.
   * @returns {Promise<{ ok: boolean }>}
   */
  switchToCloudMode: () => ipcRenderer.invoke('platform:switchToCloudMode'),

  /**
   * Retry starting the local embedded backend.
   * Only meaningful when backendStatus is 'error'.
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  retryLocalBackend: () => ipcRenderer.invoke('platform:retryLocalBackend'),

  // --- S9: Offline mode & resilience ---

  /**
   * Cache activity feed items for offline use.
   * Called by the renderer after each successful activity feed fetch.
   * @param {Array} items — Activity feed items
   * @param {string} workspaceId — Current workspace ID
   * @returns {Promise<{ ok: boolean }>}
   */
  cacheActivityFeed: (items, workspaceId) =>
    ipcRenderer.invoke('platform:cacheActivityFeed', items, workspaceId),

  /**
   * Get cached activity feed when the backend is offline.
   * @returns {Promise<{ items: Array, cachedAt: number, workspaceId: string, cached: true } | null>}
   */
  getCachedActivityFeed: () =>
    ipcRenderer.invoke('platform:getCachedActivityFeed'),

  /**
   * Get current offline state.
   * @returns {Promise<{ state: 'online' | 'offline' | 'reconnecting' }>}
   */
  getOfflineState: () => ipcRenderer.invoke('platform:getOfflineState'),

  /**
   * Subscribe to backend status change events pushed from the main process.
   * Returns a cleanup function to unsubscribe.
   * @param {(data: { state: string, message: string, timestamp: number }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onBackendStatusChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('platform:backend-status-changed', handler);
    return () =>
      ipcRenderer.removeListener('platform:backend-status-changed', handler);
  },
});
