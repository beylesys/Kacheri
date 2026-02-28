// KACHERI FRONTEND/src/api/canvas.ts
// API client for Design Studio Canvas CRUD endpoints.
//
// Covers:
//   - Canvases: create, list, search, get, update, delete
//   - Frames: get, update code
//   - Permissions: set, list, remove
//   - Versions: create, list, restore
//   - Exports: trigger, get status
//
// See: Docs/API_CONTRACT.md — Design Studio Endpoints (Slice A3), Canvas Version & Export (Slice B4)

import type {
  Canvas,
  CanvasFrame,
  CanvasWithFrames,
  CanvasVersion,
  CanvasExport,
  CanvasPermissionMeta,
  CanvasRole,
  CreateCanvasParams,
  ListCanvasesParams,
  UpdateCanvasParams,
  CreateVersionParams,
  TriggerExportParams,
  ListCanvasesResponse,
  SearchCanvasesResponse,
  RestoreVersionResponse,
  ListVersionsResponse,
  ListPermissionsResponse,
  EmbedWhitelistResponse,
} from '../types/canvas';

/* ---------- Infra ---------- */

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_URL ??
  '/api';

function authHeader(): Record<string, string> {
  try {
    const token =
      typeof localStorage !== 'undefined' && localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function devUserHeader(): Record<string, string> {
  try {
    const u =
      (typeof localStorage !== 'undefined' && localStorage.getItem('devUser')) ||
      '';
    return u ? { 'X-Dev-User': u } : {};
  } catch {
    return {};
  }
}

const REQUEST_TIMEOUT_MS = 45_000;

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init?.headers);

    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const auth = authHeader();
    for (const [k, v] of Object.entries(auth)) headers.set(k, v);
    const dev = devUserHeader();
    for (const [k, v] of Object.entries(dev)) headers.set(k, v);

    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = `API ${res.status}: ${text || res.statusText}`;
      try {
        const json = JSON.parse(text);
        if (json.message) errorMessage = json.message;
        else if (json.error) errorMessage = json.error;
      } catch {}
      throw new Error(errorMessage);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. The canvas operation may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Canvas CRUD API ---------- */

export const canvasApi = {
  /**
   * Create a new canvas in a workspace. Creator becomes implicit owner.
   * Requires workspace editor+ role.
   */
  async create(
    workspaceId: string,
    params: CreateCanvasParams
  ): Promise<Canvas> {
    return request<Canvas>(
      `/workspaces/${workspaceId}/canvases`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * List canvases in a workspace with pagination and sorting.
   * Requires workspace viewer+ role.
   */
  async list(
    workspaceId: string,
    params?: ListCanvasesParams
  ): Promise<ListCanvasesResponse> {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortDir) qs.set('sortDir', params.sortDir);
    const q = qs.toString();
    return request<ListCanvasesResponse>(
      `/workspaces/${workspaceId}/canvases${q ? `?${q}` : ''}`
    );
  },

  /**
   * Full-text search canvases by title and description.
   * Requires workspace viewer+ role.
   */
  async search(
    workspaceId: string,
    query: string,
    params?: { limit?: number; offset?: number }
  ): Promise<SearchCanvasesResponse> {
    const qs = new URLSearchParams();
    qs.set('q', query);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    return request<SearchCanvasesResponse>(
      `/workspaces/${workspaceId}/canvases/search?${qs.toString()}`
    );
  },

  /**
   * Get a canvas with all its frames.
   * Requires canvas viewer+ role.
   */
  async get(
    workspaceId: string,
    canvasId: string
  ): Promise<CanvasWithFrames> {
    return request<CanvasWithFrames>(
      `/workspaces/${workspaceId}/canvases/${canvasId}`
    );
  },

  /**
   * Update canvas metadata. Only provided fields are modified.
   * Requires canvas editor+ role.
   */
  async update(
    workspaceId: string,
    canvasId: string,
    params: UpdateCanvasParams
  ): Promise<Canvas> {
    return request<Canvas>(
      `/workspaces/${workspaceId}/canvases/${canvasId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Soft-delete a canvas. Only canvas owner can delete.
   */
  async delete(
    workspaceId: string,
    canvasId: string
  ): Promise<void> {
    return request<void>(
      `/workspaces/${workspaceId}/canvases/${canvasId}`,
      { method: 'DELETE' }
    );
  },

  /* ---------- Frames ---------- */

  /**
   * Get a single frame with its code.
   * Requires canvas viewer+ role.
   */
  async getFrame(
    canvasId: string,
    frameId: string
  ): Promise<CanvasFrame> {
    return request<CanvasFrame>(
      `/canvases/${canvasId}/frames/${frameId}`
    );
  },

  /**
   * Replace a frame's HTML/CSS/JS code. SHA256 hash recomputed on backend.
   * Requires canvas editor+ role.
   */
  async updateFrameCode(
    canvasId: string,
    frameId: string,
    code: string
  ): Promise<CanvasFrame> {
    return request<CanvasFrame>(
      `/canvases/${canvasId}/frames/${frameId}/code`,
      {
        method: 'PUT',
        body: JSON.stringify({ code }),
      }
    );
  },

  /**
   * Partially update a frame's metadata (speaker notes, title, duration, transition).
   * Requires canvas editor+ role.
   */
  async updateFrame(
    canvasId: string,
    frameId: string,
    updates: { speakerNotes?: string | null; title?: string; durationMs?: number; transition?: string; metadata?: Record<string, unknown> | null }
  ): Promise<CanvasFrame> {
    return request<CanvasFrame>(
      `/canvases/${canvasId}/frames/${frameId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  },

  /* ---------- Permissions ---------- */

  /**
   * Grant or update a per-canvas permission for a user.
   * Requires canvas owner role.
   */
  async setPermission(
    canvasId: string,
    userId: string,
    role: CanvasRole
  ): Promise<CanvasPermissionMeta> {
    return request<CanvasPermissionMeta>(
      `/canvases/${canvasId}/permissions`,
      {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
      }
    );
  },

  /**
   * List all per-canvas permission overrides.
   * Requires canvas owner role.
   */
  async listPermissions(
    canvasId: string
  ): Promise<ListPermissionsResponse> {
    return request<ListPermissionsResponse>(
      `/canvases/${canvasId}/permissions`
    );
  },

  /**
   * Remove a per-canvas permission override for a user.
   * Requires canvas owner role.
   */
  async removePermission(
    canvasId: string,
    userId: string
  ): Promise<void> {
    return request<void>(
      `/canvases/${canvasId}/permissions/${userId}`,
      { method: 'DELETE' }
    );
  },

  /* ---------- Versions ---------- */

  /**
   * Create a named version snapshot capturing full canvas state.
   * Requires canvas editor+ role.
   */
  async createVersion(
    canvasId: string,
    params: CreateVersionParams
  ): Promise<CanvasVersion & { frameCount: number }> {
    return request<CanvasVersion & { frameCount: number }>(
      `/canvases/${canvasId}/versions`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * List version snapshots for a canvas (most recent first).
   * Requires canvas viewer+ role.
   */
  async listVersions(
    canvasId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<ListVersionsResponse> {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return request<ListVersionsResponse>(
      `/canvases/${canvasId}/versions${q ? `?${q}` : ''}`
    );
  },

  /**
   * Restore canvas to a previous version snapshot.
   * Requires canvas editor+ role.
   */
  async restoreVersion(
    canvasId: string,
    versionId: string
  ): Promise<RestoreVersionResponse> {
    return request<RestoreVersionResponse>(
      `/canvases/${canvasId}/versions/${versionId}/restore`,
      { method: 'POST' }
    );
  },

  /* ---------- Exports ---------- */

  /**
   * Trigger an export job. Export stays in "pending" until render workers are available (Phase 5).
   * Requires canvas viewer+ role.
   */
  async triggerExport(
    canvasId: string,
    params: TriggerExportParams
  ): Promise<CanvasExport> {
    return request<CanvasExport>(
      `/canvases/${canvasId}/export`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Get the status of an export job.
   * Requires canvas viewer+ role.
   */
  async getExport(
    canvasId: string,
    exportId: string
  ): Promise<CanvasExport> {
    return request<CanvasExport>(
      `/canvases/${canvasId}/exports/${exportId}`
    );
  },

  /* ---------- Provenance ---------- */

  /**
   * List canvas provenance timeline (design proof kinds + AI actions).
   * Requires canvas viewer+ role.
   */
  async listProvenance(
    canvasId: string,
    opts?: { action?: string; limit?: number; before?: number; from?: number; to?: number }
  ): Promise<any[]> {
    const p = new URLSearchParams();
    if (opts?.action) p.set('action', opts.action);
    if (opts?.limit) p.set('limit', String(opts.limit));
    if (opts?.before) p.set('before', String(opts.before));
    if (opts?.from) p.set('from', String(opts.from));
    if (opts?.to) p.set('to', String(opts.to));
    const q = p.toString();
    return request<any[]>(`/canvases/${canvasId}/provenance${q ? `?${q}` : ''}`);
  },

  /* ---------- Publish / Embed (Slice E5) ---------- */

  /**
   * Toggle canvas published state for public embedding.
   * Requires canvas owner role.
   */
  async publish(
    canvasId: string,
    published: boolean
  ): Promise<Canvas> {
    return request<Canvas>(
      `/canvases/${canvasId}/publish`,
      {
        method: 'PATCH',
        body: JSON.stringify({ published }),
      }
    );
  },

  /* ---------- Embed Whitelist (Slice E7) ---------- */

  /**
   * Get the effective embed whitelist for a workspace.
   * Returns default domains, custom workspace additions, and the merged effective list.
   * Requires workspace viewer+ role.
   */
  async getEmbedWhitelist(
    workspaceId: string
  ): Promise<EmbedWhitelistResponse> {
    return request<EmbedWhitelistResponse>(
      `/workspaces/${workspaceId}/embed-whitelist`
    );
  },

  /**
   * Update the workspace's custom embed domain whitelist.
   * Replaces the existing custom list entirely. Default domains cannot be removed.
   * Requires workspace admin+ role.
   */
  async updateEmbedWhitelist(
    workspaceId: string,
    domains: string[]
  ): Promise<EmbedWhitelistResponse> {
    return request<EmbedWhitelistResponse>(
      `/workspaces/${workspaceId}/embed-whitelist`,
      {
        method: 'PUT',
        body: JSON.stringify({ domains }),
      }
    );
  },
};

/* ---------- Public Embed URL Helpers (Slice E5) ---------- */

/**
 * Get the public embed URL for a full canvas.
 * This URL can be used as the `src` of an `<iframe>`.
 */
export function getPublicCanvasEmbedUrl(canvasId: string): string {
  return `${API_BASE}/embed/public/canvases/${canvasId}`;
}

/**
 * Get the public embed URL for a single frame.
 * This URL can be used as the `src` of an `<iframe>`.
 */
export function getPublicFrameEmbedUrl(frameId: string): string {
  return `${API_BASE}/embed/public/frames/${frameId}`;
}
