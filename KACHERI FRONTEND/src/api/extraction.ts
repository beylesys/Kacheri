// KACHERI FRONTEND/src/api/extraction.ts
// API client for Document Intelligence extraction endpoints.
//
// Covers:
//   - Extraction: trigger, get, update, export
//   - Extraction Actions: create, list, delete
//   - Workspace Extraction Standards: list, create, update, delete
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 8

import type {
  ExtractParams,
  ExtractResponse,
  GetExtractionResponse,
  UpdateExtractionParams,
  UpdateExtractionResponse,
  CreateActionParams,
  CreateActionResponse,
  ListActionsResponse,
  DeleteActionResponse,
  ListStandardsOptions,
  ListStandardsResponse,
  CreateStandardParams,
  CreateStandardResponse,
  UpdateStandardParams,
  UpdateStandardResponse,
  DeleteStandardResponse,
} from '../types/extraction';

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

const REQUEST_TIMEOUT_MS = 45_000; // 45s (longer than backend 30s to get backend error first)

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
      throw new Error('Request timed out. The extraction may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch a file download (blob) from the API.
 * Used for extraction export endpoints that return file content.
 */
async function requestBlob(path: string): Promise<Blob> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = new Headers();

    const auth = authHeader();
    for (const [k, v] of Object.entries(auth)) headers.set(k, v);
    const dev = devUserHeader();
    for (const [k, v] of Object.entries(dev)) headers.set(k, v);

    const res = await fetch(`${API_BASE}${path}`, { headers, signal: controller.signal });

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = `API ${res.status}: ${text || res.statusText}`;
      try {
        const json = JSON.parse(text);
        if (json.error) errorMessage = json.error;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.blob();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Extraction API ---------- */

export const extractionApi = {
  /**
   * Trigger AI extraction for a document.
   * Requires editor+ access. Rate limited.
   */
  async extract(
    docId: string,
    params: ExtractParams
  ): Promise<ExtractResponse> {
    return request<ExtractResponse>(`/docs/${docId}/extract`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Get existing extraction for a document.
   * Requires viewer+ access.
   */
  async get(docId: string): Promise<GetExtractionResponse> {
    return request<GetExtractionResponse>(`/docs/${docId}/extraction`);
  },

  /**
   * Apply manual corrections to extracted fields.
   * Requires editor+ access.
   */
  async update(
    docId: string,
    params: UpdateExtractionParams
  ): Promise<UpdateExtractionResponse> {
    return request<UpdateExtractionResponse>(`/docs/${docId}/extraction`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  },

  /**
   * Export extraction data as JSON or CSV file.
   * Returns a Blob for file download.
   * Requires viewer+ access.
   */
  async exportData(
    docId: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<Blob> {
    return requestBlob(`/docs/${docId}/extraction/export?format=${format}`);
  },

  /**
   * Create an action (reminder or flag_review) for an extraction.
   * Requires editor+ access.
   */
  async createAction(
    docId: string,
    params: CreateActionParams
  ): Promise<CreateActionResponse> {
    return request<CreateActionResponse>(
      `/docs/${docId}/extraction/actions`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * List all actions for an extraction.
   * Requires viewer+ access.
   */
  async listActions(docId: string): Promise<ListActionsResponse> {
    return request<ListActionsResponse>(
      `/docs/${docId}/extraction/actions`
    );
  },

  /**
   * Delete or cancel an extraction action.
   * Pending/scheduled actions are cancelled; completed/cancelled are deleted.
   * Requires editor+ access.
   */
  async deleteAction(
    docId: string,
    actionId: string
  ): Promise<DeleteActionResponse> {
    return request<DeleteActionResponse>(
      `/docs/${docId}/extraction/actions/${actionId}`,
      { method: 'DELETE' }
    );
  },
};

/* ---------- Workspace Extraction Standards API ---------- */

export const extractionStandardsApi = {
  /**
   * List extraction standards for a workspace.
   * Requires viewer+ access on workspace.
   */
  async list(
    workspaceId: string,
    options?: ListStandardsOptions
  ): Promise<ListStandardsResponse> {
    const qs = new URLSearchParams();
    if (options?.documentType) qs.set('documentType', options.documentType);
    if (options?.enabled !== undefined) qs.set('enabled', String(options.enabled));
    const q = qs.toString();
    return request<ListStandardsResponse>(
      `/workspaces/${workspaceId}/extraction-standards${q ? `?${q}` : ''}`
    );
  },

  /**
   * Create a new extraction standard.
   * Requires workspace admin access.
   */
  async create(
    workspaceId: string,
    params: CreateStandardParams
  ): Promise<CreateStandardResponse> {
    return request<CreateStandardResponse>(
      `/workspaces/${workspaceId}/extraction-standards`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Update an existing extraction standard.
   * Requires workspace admin access.
   */
  async update(
    workspaceId: string,
    standardId: string,
    params: UpdateStandardParams
  ): Promise<UpdateStandardResponse> {
    return request<UpdateStandardResponse>(
      `/workspaces/${workspaceId}/extraction-standards/${standardId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Delete an extraction standard.
   * Requires workspace admin access.
   */
  async delete(
    workspaceId: string,
    standardId: string
  ): Promise<DeleteStandardResponse> {
    return request<DeleteStandardResponse>(
      `/workspaces/${workspaceId}/extraction-standards/${standardId}`,
      { method: 'DELETE' }
    );
  },
};
