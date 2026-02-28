// KACHERI FRONTEND/src/api/canvasTemplates.ts
// API client for Design Studio Frame Template endpoints.
//
// Covers:
//   - Templates: create, list, get, update, delete
//   - Tags: list distinct tags
//
// See: Docs/API_CONTRACT.md — Frame Templates (Slice D9)

import type {
  CanvasTemplate,
  CreateTemplateParams,
  UpdateTemplateParams,
  ListTemplatesParams,
  ListTemplatesResponse,
  ListTagsResponse,
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
      throw new Error('Request timed out. The template operation may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Canvas Template API ---------- */

export const canvasTemplateApi = {
  /**
   * Create a new frame template from frame code.
   * Requires workspace editor+ role.
   */
  async create(
    workspaceId: string,
    params: CreateTemplateParams
  ): Promise<CanvasTemplate> {
    return request<CanvasTemplate>(
      `/workspaces/${workspaceId}/templates`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * List frame templates in a workspace with pagination and optional filters.
   * Requires workspace viewer+ role.
   */
  async list(
    workspaceId: string,
    params?: ListTemplatesParams
  ): Promise<ListTemplatesResponse> {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.compositionMode) qs.set('compositionMode', params.compositionMode);
    const q = qs.toString();
    return request<ListTemplatesResponse>(
      `/workspaces/${workspaceId}/templates${q ? `?${q}` : ''}`
    );
  },

  /**
   * Get a single frame template by ID.
   * Requires workspace viewer+ role.
   */
  async get(
    workspaceId: string,
    templateId: string
  ): Promise<CanvasTemplate> {
    return request<CanvasTemplate>(
      `/workspaces/${workspaceId}/templates/${templateId}`
    );
  },

  /**
   * Update a frame template. Only provided fields are modified.
   * Requires workspace editor+ role.
   */
  async update(
    workspaceId: string,
    templateId: string,
    params: UpdateTemplateParams
  ): Promise<CanvasTemplate> {
    return request<CanvasTemplate>(
      `/workspaces/${workspaceId}/templates/${templateId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Delete a frame template.
   * Requires workspace editor+ role.
   */
  async delete(
    workspaceId: string,
    templateId: string
  ): Promise<void> {
    return request<void>(
      `/workspaces/${workspaceId}/templates/${templateId}`,
      { method: 'DELETE' }
    );
  },

  /**
   * List distinct tags across all frame templates in a workspace.
   * Requires workspace viewer+ role.
   */
  async listTags(
    workspaceId: string
  ): Promise<ListTagsResponse> {
    return request<ListTagsResponse>(
      `/workspaces/${workspaceId}/templates/tags`
    );
  },
};
