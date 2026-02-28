// KACHERI FRONTEND/src/api/clauses.ts
// API client for Clause Library endpoints.
//
// Covers:
//   - Clauses: list, get, create, update, archive, list versions, get version
//   - Clause Actions: insert into doc, suggest similar, create from selection
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B8

import type {
  ListClausesOptions,
  ListClausesResponse,
  GetClauseResponse,
  CreateClauseParams,
  CreateClauseResponse,
  UpdateClauseParams,
  UpdateClauseResponse,
  ArchiveClauseResponse,
  ListVersionsResponse,
  GetVersionResponse,
  InsertClauseParams,
  InsertClauseResponse,
  SuggestClausesParams,
  SuggestClausesResponse,
  FromSelectionParams,
  FromSelectionResponse,
} from '../types/clause';

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
      throw new Error('Request timed out. The clause operation may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Clauses API ---------- */

export const clausesApi = {
  /**
   * List all clauses for a workspace with optional search, category, tag filters + pagination.
   * Requires workspace member access.
   */
  async list(
    workspaceId: string,
    opts?: ListClausesOptions
  ): Promise<ListClausesResponse> {
    const qs = new URLSearchParams();
    if (opts?.search) qs.set('search', opts.search);
    if (opts?.category) qs.set('category', opts.category);
    if (opts?.tag) qs.set('tag', opts.tag);
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request<ListClausesResponse>(
      `/workspaces/${workspaceId}/clauses${q ? `?${q}` : ''}`
    );
  },

  /**
   * Get a single clause by ID.
   * Requires workspace member access.
   */
  async get(
    workspaceId: string,
    clauseId: string
  ): Promise<GetClauseResponse> {
    return request<GetClauseResponse>(
      `/workspaces/${workspaceId}/clauses/${clauseId}`
    );
  },

  /**
   * Create a new clause + initial version record.
   * Requires editor+ access.
   */
  async create(
    workspaceId: string,
    params: CreateClauseParams
  ): Promise<CreateClauseResponse> {
    return request<CreateClauseResponse>(
      `/workspaces/${workspaceId}/clauses`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Update an existing clause. Creates a new version if content changes.
   * Requires editor+ access.
   */
  async update(
    workspaceId: string,
    clauseId: string,
    params: UpdateClauseParams
  ): Promise<UpdateClauseResponse> {
    return request<UpdateClauseResponse>(
      `/workspaces/${workspaceId}/clauses/${clauseId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Archive a clause (soft delete).
   * Requires editor+ access.
   */
  async archive(
    workspaceId: string,
    clauseId: string
  ): Promise<ArchiveClauseResponse> {
    return request<ArchiveClauseResponse>(
      `/workspaces/${workspaceId}/clauses/${clauseId}`,
      { method: 'DELETE' }
    );
  },

  /**
   * List all versions for a clause, ordered by version descending.
   * Requires workspace member access.
   */
  async listVersions(
    workspaceId: string,
    clauseId: string
  ): Promise<ListVersionsResponse> {
    return request<ListVersionsResponse>(
      `/workspaces/${workspaceId}/clauses/${clauseId}/versions`
    );
  },

  /**
   * Get a specific version by version number.
   * Requires workspace member access.
   */
  async getVersion(
    workspaceId: string,
    clauseId: string,
    versionNum: number
  ): Promise<GetVersionResponse> {
    return request<GetVersionResponse>(
      `/workspaces/${workspaceId}/clauses/${clauseId}/versions/${versionNum}`
    );
  },
};

/* ---------- Clause Actions API ---------- */

export const clauseActionsApi = {
  /**
   * Insert a clause into a document.
   * Logs usage, increments usage_count, creates proof packet.
   * Requires editor+ access.
   */
  async insert(
    docId: string,
    params: InsertClauseParams
  ): Promise<InsertClauseResponse> {
    return request<InsertClauseResponse>(
      `/docs/${docId}/clauses/insert`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Find similar clauses for a text selection.
   * Uses AI-powered similarity detection. Rate limited.
   * Requires editor+ access. Requires X-Workspace-Id header.
   */
  async suggest(
    docId: string,
    params: SuggestClausesParams
  ): Promise<SuggestClausesResponse> {
    return request<SuggestClausesResponse>(
      `/docs/${docId}/clauses/suggest`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Create a clause from selected document text with AI-assisted metadata.
   * AI generates title/description if not provided; category auto-detected.
   * Rate limited. Requires editor+ access.
   */
  async fromSelection(
    workspaceId: string,
    params: FromSelectionParams
  ): Promise<FromSelectionResponse> {
    return request<FromSelectionResponse>(
      `/workspaces/${workspaceId}/clauses/from-selection`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },
};
