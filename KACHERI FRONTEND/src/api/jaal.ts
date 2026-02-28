// KACHERI FRONTEND/src/api/jaal.ts
// API client for JAAL backend service endpoints — Slices S4 (Phase B) + S13 (Phase D)
//
// Covers:
//   - Sessions: create, list, get, update (start/end research sessions)
//   - Guide: summarize, extract-links, compare (AI actions)
//   - Proofs: create, list, get (cryptographic proof management)
//   - Policy: evaluate, privacy-receipt (trust & policy evaluation)
//   - Browse: proxy fetch (web topology browsing)
//   - Memory Graph: search entities, get detail, keyword search (S13 — delegates to knowledge API)
//
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice S5 (backend endpoints)
// NOTE: Backend endpoints (S5) are not yet implemented. All calls will 404 until S5 is complete.

/* ---------- Knowledge Types (S13 — Memory Graph delegation) ---------- */

import type {
  ListEntitiesOptions,
  ListEntitiesResponse,
  GetEntityDetailResponse,
  KeywordSearchResponse,
} from '../types/knowledge';

/* ---------- Types ---------- */

export interface JaalSession {
  id: string;
  workspaceId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  actionCount: number;
  metadata: Record<string, unknown>;
}

export interface JaalProof {
  id: string;
  sessionId: string | null;
  workspaceId: string;
  userId: string;
  kind: string;
  hash: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface GuideRequest {
  url: string;
  content: string;
}

export interface CompareRequest {
  urlA: string;
  contentA: string;
  urlB: string;
  contentB: string;
}

export interface GuideResponse {
  result: string;
  proofId?: string;
}

export interface PolicyEvaluation {
  allowed: boolean;
  reasons: string[];
  policy: Record<string, unknown>;
}

export interface PrivacyReceiptItem {
  id: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface PrivacyReceiptResponse {
  receipts: PrivacyReceiptItem[];
}

export interface TrustSummary {
  sessionId: string | null;
  totals: { actions: number; allow: number; deny: number };
  providers: { local: number; openai: number; anthropic: number; other: number };
  egress: {
    totalEvents: number;
    totalBytes: number;
    byDomain: Record<string, { count: number; bytes: number }>;
  };
  anomalies: Array<{
    code: string;
    severity: 'red' | 'amber';
    title: string;
    details: string;
  }>;
}

interface CreateSessionResponse {
  session: JaalSession;
}

interface ListSessionsResponse {
  sessions: JaalSession[];
}

interface ListProofsResponse {
  proofs: JaalProof[];
}

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
  timeoutMs: number = REQUEST_TIMEOUT_MS,
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
      } catch {
        /* use raw text */
      }
      throw new Error(errorMessage);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- API ---------- */

export const jaalApi = {
  /* -- Sessions -- */

  async createSession(workspaceId: string): Promise<JaalSession> {
    const data = await request<CreateSessionResponse>('/jaal/sessions', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    });
    return data.session;
  },

  async updateSession(
    sid: string,
    body: { ended?: boolean; metadata?: Record<string, unknown> },
  ): Promise<JaalSession> {
    const data = await request<{ session: JaalSession }>(
      `/jaal/sessions/${encodeURIComponent(sid)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    return data.session;
  },

  async listSessions(): Promise<JaalSession[]> {
    const data = await request<ListSessionsResponse>('/jaal/sessions');
    return data.sessions;
  },

  async getSession(sid: string): Promise<JaalSession> {
    const data = await request<{ session: JaalSession }>(
      `/jaal/sessions/${encodeURIComponent(sid)}`,
    );
    return data.session;
  },

  /* -- Guide (AI Actions) -- */

  async summarize(body: GuideRequest): Promise<GuideResponse> {
    return request<GuideResponse>('/jaal/guide/summarize', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async extractLinks(body: GuideRequest): Promise<GuideResponse> {
    return request<GuideResponse>('/jaal/guide/extract-links', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async compare(body: CompareRequest): Promise<GuideResponse> {
    return request<GuideResponse>('/jaal/guide/compare', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /* -- Proofs -- */

  async createProof(body: {
    sessionId?: string;
    kind: string;
    payload: Record<string, unknown>;
  }): Promise<JaalProof> {
    const data = await request<{ proof: JaalProof }>('/jaal/proofs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.proof;
  },

  async listProofs(params?: {
    sessionId?: string;
    kind?: string;
    limit?: number;
  }): Promise<JaalProof[]> {
    const qs = new URLSearchParams();
    if (params?.sessionId) qs.set('sessionId', params.sessionId);
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    const query = qs.toString();
    const data = await request<ListProofsResponse>(
      `/jaal/proofs${query ? `?${query}` : ''}`,
    );
    return data.proofs;
  },

  async getProof(pid: string): Promise<JaalProof> {
    const data = await request<{ proof: JaalProof }>(
      `/jaal/proofs/${encodeURIComponent(pid)}`,
    );
    return data.proof;
  },

  /* -- Policy -- */

  async evaluatePolicy(params: {
    action: string;
    url?: string;
    mode?: string;
  }): Promise<PolicyEvaluation> {
    const qs = new URLSearchParams();
    qs.set('action', params.action);
    if (params.url) qs.set('url', params.url);
    if (params.mode) qs.set('mode', params.mode);
    return request<PolicyEvaluation>(`/jaal/policy/evaluate?${qs.toString()}`);
  },

  async getPrivacyReceipt(): Promise<PrivacyReceiptResponse> {
    return request<PrivacyReceiptResponse>('/jaal/policy/privacy-receipt');
  },

  /* -- Browse Proxy (web topology) -- */

  /**
   * Returns the URL to use as an iframe src for backend-proxied browsing.
   * Does NOT make a fetch call — returns the URL string directly.
   */
  browseProxyUrl(url: string): string {
    return `${API_BASE}/jaal/browse?url=${encodeURIComponent(url)}`;
  },

  /* -- Memory Graph (S13 — delegates to knowledge API endpoints) -- */

  /**
   * Search entities in the Memory Graph. Wraps knowledge listEntities endpoint.
   * Used by useMemoryContext for URL-based auto-context.
   */
  async memorySearchEntities(
    workspaceId: string,
    opts?: ListEntitiesOptions,
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
      `/workspaces/${workspaceId}/knowledge/entities${q ? `?${q}` : ''}`,
    );
  },

  /**
   * Get full entity detail with mentions (including productSource) and relationships.
   * Used by useMemoryContext for entity expansion with product source badges.
   */
  async memoryGetEntity(
    workspaceId: string,
    entityId: string,
  ): Promise<GetEntityDetailResponse> {
    return request<GetEntityDetailResponse>(
      `/workspaces/${workspaceId}/knowledge/entities/${encodeURIComponent(entityId)}`,
    );
  },

  /**
   * Fast FTS5 keyword search across the Memory Graph (no AI call, no rate limit).
   * Used by useMemoryContext for manual search within JAAL.
   */
  async memoryKeywordSearch(
    workspaceId: string,
    q: string,
    limit?: number,
  ): Promise<KeywordSearchResponse> {
    const qs = new URLSearchParams();
    qs.set('q', q);
    if (limit !== undefined) qs.set('limit', String(limit));
    return request<KeywordSearchResponse>(
      `/workspaces/${workspaceId}/knowledge/search?${qs.toString()}`,
    );
  },
};
