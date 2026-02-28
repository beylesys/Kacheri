// KACHERI FRONTEND/src/api/knowledge.ts
// API client for Cross-Document Intelligence / Knowledge Graph endpoints.
//
// Covers:
//   - Entities: list, get detail, update, delete, merge
//   - Relationships: list (workspace-level)
//   - Per-document: entities, related documents
//   - Search: semantic (AI-powered), keyword (FTS5)
//   - Admin: trigger index, status, summary
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 12

import type {
  ListEntitiesOptions,
  ListEntitiesResponse,
  GetEntityDetailResponse,
  UpdateEntityParams,
  UpdateEntityResponse,
  MergeEntitiesParams,
  MergeEntitiesResponse,
  ListRelationshipsOptions,
  ListRelationshipsResponse,
  DocEntitiesResponse,
  RelatedDocsResponse,
  SemanticSearchParams,
  SemanticSearchResponse,
  KeywordSearchResponse,
  TriggerIndexParams,
  TriggerIndexResponse,
  IndexStatusResponse,
  KnowledgeSummaryResponse,
} from '../types/knowledge';

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

const REQUEST_TIMEOUT_MS = 45_000; // 45s (longer than backend 20s semantic search timeout)

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
      throw new Error('Request timed out. The knowledge query may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Knowledge API ---------- */

export const knowledgeApi = {
  /**
   * List all entities for a workspace with optional filters, search, sorting, and pagination.
   * Requires workspace member access.
   */
  async listEntities(
    workspaceId: string,
    opts?: ListEntitiesOptions
  ): Promise<ListEntitiesResponse> {
    const qs = new URLSearchParams();
    if (opts?.type) qs.set('type', opts.type);
    if (opts?.search) qs.set('search', opts.search);
    if (opts?.sort) qs.set('sort', opts.sort);
    if (opts?.order) qs.set('order', opts.order);
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset));
    if (opts?.productSource) qs.set('productSource', opts.productSource);
    const q = qs.toString();
    return request<ListEntitiesResponse>(
      `/workspaces/${workspaceId}/knowledge/entities${q ? `?${q}` : ''}`
    );
  },

  /**
   * Get full entity detail including mentions and relationships.
   * Requires workspace member access.
   */
  async getEntity(
    workspaceId: string,
    entityId: string
  ): Promise<GetEntityDetailResponse> {
    return request<GetEntityDetailResponse>(
      `/workspaces/${workspaceId}/knowledge/entities/${entityId}`
    );
  },

  /**
   * Update entity name, aliases, or metadata.
   * Requires workspace admin access.
   */
  async updateEntity(
    workspaceId: string,
    entityId: string,
    params: UpdateEntityParams
  ): Promise<UpdateEntityResponse> {
    return request<UpdateEntityResponse>(
      `/workspaces/${workspaceId}/knowledge/entities/${entityId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Delete an entity and all its mentions/relationships.
   * Requires workspace admin access.
   */
  async deleteEntity(
    workspaceId: string,
    entityId: string
  ): Promise<void> {
    return request<void>(
      `/workspaces/${workspaceId}/knowledge/entities/${entityId}`,
      { method: 'DELETE' }
    );
  },

  /**
   * Merge duplicate entities into one canonical entity.
   * Requires workspace admin access.
   */
  async mergeEntities(
    workspaceId: string,
    params: MergeEntitiesParams
  ): Promise<MergeEntitiesResponse> {
    return request<MergeEntitiesResponse>(
      `/workspaces/${workspaceId}/knowledge/entities/merge`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * List entity relationships for a workspace with optional filters.
   * Requires workspace member access.
   */
  async listRelationships(
    workspaceId: string,
    opts?: ListRelationshipsOptions
  ): Promise<ListRelationshipsResponse> {
    const qs = new URLSearchParams();
    if (opts?.entityId) qs.set('entityId', opts.entityId);
    if (opts?.type) qs.set('type', opts.type);
    if (opts?.minStrength !== undefined) qs.set('minStrength', String(opts.minStrength));
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request<ListRelationshipsResponse>(
      `/workspaces/${workspaceId}/knowledge/relationships${q ? `?${q}` : ''}`
    );
  },

  /**
   * List all entities mentioned in a specific document.
   * Requires viewer+ doc access.
   */
  async getDocEntities(docId: string): Promise<DocEntitiesResponse> {
    return request<DocEntitiesResponse>(`/docs/${docId}/entities`);
  },

  /**
   * Find documents related to a specific document via shared entities.
   * Uses entity overlap ranking with optional AI re-ranking.
   * Requires viewer+ doc access.
   */
  async getRelatedDocs(
    docId: string,
    limit?: number
  ): Promise<RelatedDocsResponse> {
    const qs = new URLSearchParams();
    if (limit !== undefined) qs.set('limit', String(limit));
    const q = qs.toString();
    return request<RelatedDocsResponse>(
      `/docs/${docId}/related${q ? `?${q}` : ''}`
    );
  },

  /**
   * AI-powered semantic search across workspace documents.
   * Rate limited. Creates proof record.
   * Requires workspace member access.
   */
  async semanticSearch(
    workspaceId: string,
    params: SemanticSearchParams
  ): Promise<SemanticSearchResponse> {
    return request<SemanticSearchResponse>(
      `/workspaces/${workspaceId}/knowledge/search`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Fast FTS5 keyword search. No AI calls. No rate limiting.
   * Returns matching entities and documents.
   * Requires workspace member access.
   */
  async keywordSearch(
    workspaceId: string,
    q: string,
    limit?: number
  ): Promise<KeywordSearchResponse> {
    const qs = new URLSearchParams();
    qs.set('q', q);
    if (limit !== undefined) qs.set('limit', String(limit));
    return request<KeywordSearchResponse>(
      `/workspaces/${workspaceId}/knowledge/search?${qs.toString()}`
    );
  },
};

/* ---------- Knowledge Admin API ---------- */

export const knowledgeAdminApi = {
  /**
   * Trigger full workspace re-index (harvest entities, normalize, detect relationships, rebuild FTS5).
   * Returns 202 immediately; indexing runs asynchronously via background worker.
   * Requires workspace admin access.
   */
  async triggerIndex(
    workspaceId: string,
    params?: TriggerIndexParams
  ): Promise<TriggerIndexResponse> {
    return request<TriggerIndexResponse>(
      `/workspaces/${workspaceId}/knowledge/index`,
      {
        method: 'POST',
        body: JSON.stringify(params ?? {}),
      }
    );
  },

  /**
   * Get current knowledge graph index status for a workspace.
   * Requires workspace member access.
   */
  async getStatus(workspaceId: string): Promise<IndexStatusResponse> {
    return request<IndexStatusResponse>(
      `/workspaces/${workspaceId}/knowledge/status`
    );
  },

  /**
   * Get dashboard summary with stats, top entities, type breakdown, and recent queries.
   * Requires workspace member access.
   */
  async getSummary(workspaceId: string): Promise<KnowledgeSummaryResponse> {
    return request<KnowledgeSummaryResponse>(
      `/workspaces/${workspaceId}/knowledge/summary`
    );
  },
};
