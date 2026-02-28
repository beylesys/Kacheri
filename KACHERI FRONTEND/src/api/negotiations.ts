// KACHERI FRONTEND/src/api/negotiations.ts
// API client for Redline / Negotiation AI endpoints.
//
// Covers:
//   - Sessions: create, list, get, update, delete, settle, abandon, summary
//   - Rounds: create (manual), import (file upload), list, get, batch analyze
//   - Changes: list, get, update status, analyze, counterproposal, bulk accept/reject
//   - Workspace: list all, stats
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 10

import type {
  CreateSessionParams,
  CreateSessionResponse,
  ListSessionsResponse,
  SessionDetailResponse,
  UpdateSessionParams,
  UpdateSessionResponse,
  CreateRoundParams,
  CreateRoundResponse,
  ImportRoundOptions,
  ImportRoundResponse,
  ListRoundsResponse,
  RoundDetailResponse,
  ListChangesOptions,
  ListChangesResponse,
  ChangeDetailResponse,
  UpdateChangeStatusParams,
  UpdateChangeResponse,
  AnalyzeSingleResponse,
  BatchAnalyzeResponse,
  GenerateCounterproposalParams,
  GenerateCounterproposalResponse,
  ListCounterproposalsResponse,
  AcceptAllResponse,
  RejectAllResponse,
  SessionSummaryResponse,
  SettleResponse,
  AbandonResponse,
  ListWorkspaceNegotiationsOptions,
  ListWorkspaceNegotiationsResponse,
  WorkspaceNegotiationStatsResponse,
} from '../types/negotiation';

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

function workspaceHeader(): Record<string, string> {
  try {
    const w =
      (typeof localStorage !== 'undefined' && localStorage.getItem('workspaceId')) ||
      '';
    return w ? { 'X-Workspace-Id': w } : {};
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

    // Only auto-set Content-Type for string bodies (not FormData)
    if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const auth = authHeader();
    for (const [k, v] of Object.entries(auth)) headers.set(k, v);
    const dev = devUserHeader();
    for (const [k, v] of Object.entries(dev)) headers.set(k, v);
    const ws = workspaceHeader();
    for (const [k, v] of Object.entries(ws)) headers.set(k, v);

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
      throw new Error('Request timed out. The operation may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Negotiation Sessions API ---------- */

export const negotiationSessionsApi = {
  /**
   * Create a new negotiation session for a document.
   * Requires editor+ access.
   */
  async create(
    docId: string,
    params: CreateSessionParams
  ): Promise<CreateSessionResponse> {
    return request<CreateSessionResponse>(
      `/docs/${docId}/negotiations`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * List all negotiation sessions for a document.
   * Requires viewer+ access.
   */
  async list(docId: string): Promise<ListSessionsResponse> {
    return request<ListSessionsResponse>(
      `/docs/${docId}/negotiations`
    );
  },

  /**
   * Get session detail with rounds summary and change status counts.
   * Round objects omit snapshotHtml/snapshotText.
   * Requires viewer+ access.
   */
  async get(nid: string): Promise<SessionDetailResponse> {
    return request<SessionDetailResponse>(
      `/negotiations/${nid}`
    );
  },

  /**
   * Update session title, counterparty info, or status.
   * Validates status transitions (no changes from terminal states).
   * Requires editor+ access.
   */
  async update(
    nid: string,
    params: UpdateSessionParams
  ): Promise<UpdateSessionResponse> {
    return request<UpdateSessionResponse>(
      `/negotiations/${nid}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Delete a negotiation session (CASCADE: rounds, changes, counterproposals).
   * Requires workspace admin access.
   */
  async delete(nid: string): Promise<void> {
    return request<void>(
      `/negotiations/${nid}`,
      { method: 'DELETE' }
    );
  },

  /**
   * Settle a negotiation session. Validates all changes are resolved,
   * creates a final version snapshot, converts accepted changes to suggestions,
   * and marks the session as settled.
   * Requires editor+ access.
   */
  async settle(nid: string): Promise<SettleResponse> {
    return request<SettleResponse>(
      `/negotiations/${nid}/settle`,
      { method: 'POST' }
    );
  },

  /**
   * Abandon a negotiation session. Preserves all data for audit.
   * No document modifications.
   * Requires editor+ access.
   */
  async abandon(nid: string): Promise<AbandonResponse> {
    return request<AbandonResponse>(
      `/negotiations/${nid}/abandon`,
      { method: 'POST' }
    );
  },

  /**
   * Get session summary with stats and change distribution.
   * Includes byStatus, byCategory, byRisk breakdowns, acceptance rate,
   * and latest round info.
   * Requires viewer+ access.
   */
  async summary(nid: string): Promise<SessionSummaryResponse> {
    return request<SessionSummaryResponse>(
      `/negotiations/${nid}/summary`
    );
  },
};

/* ---------- Negotiation Rounds API ---------- */

export const negotiationRoundsApi = {
  /**
   * Create a new round with manual HTML content.
   * Runs the full round import pipeline: redline comparison, change detection,
   * version snapshot, session count updates.
   * Requires editor+ access.
   */
  async create(
    nid: string,
    params: CreateRoundParams
  ): Promise<CreateRoundResponse> {
    return request<CreateRoundResponse>(
      `/negotiations/${nid}/rounds`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Import an external document (DOCX/PDF) as a new round.
   * File is converted to HTML, then processed through the round import pipeline.
   * Always sets proposedBy: "external".
   * Requires editor+ access.
   */
  async importFile(
    nid: string,
    file: File,
    opts?: ImportRoundOptions
  ): Promise<ImportRoundResponse> {
    const qs = new URLSearchParams();
    if (opts?.proposerLabel) qs.set('proposerLabel', opts.proposerLabel);
    if (opts?.notes) qs.set('notes', opts.notes);
    const q = qs.toString();

    const form = new FormData();
    form.append('file', file);

    return request<ImportRoundResponse>(
      `/negotiations/${nid}/rounds/import${q ? `?${q}` : ''}`,
      {
        method: 'POST',
        body: form,
      },
      90_000 // 90s timeout for file upload + conversion + redline comparison
    );
  },

  /**
   * List all rounds for a session (without snapshot HTML/text).
   * Requires viewer+ access.
   */
  async list(nid: string): Promise<ListRoundsResponse> {
    return request<ListRoundsResponse>(
      `/negotiations/${nid}/rounds`
    );
  },

  /**
   * Get full round detail including snapshot HTML and text.
   * This is the only round endpoint that returns full snapshots.
   * Requires viewer+ access.
   */
  async get(nid: string, rid: string): Promise<RoundDetailResponse> {
    return request<RoundDetailResponse>(
      `/negotiations/${nid}/rounds/${rid}`
    );
  },

  /**
   * Batch analyze all changes in a round.
   * Groups changes to minimize AI calls (max 10 per batch, 30s timeout).
   * Creates proof record. Rate limited (10/hour).
   * Requires editor+ access.
   */
  async batchAnalyze(nid: string, rid: string): Promise<BatchAnalyzeResponse> {
    return request<BatchAnalyzeResponse>(
      `/negotiations/${nid}/rounds/${rid}/analyze`,
      { method: 'POST' },
      60_000 // 60s timeout for batch AI analysis
    );
  },
};

/* ---------- Negotiation Changes API ---------- */

export const negotiationChangesApi = {
  /**
   * List all changes for a session with optional filters.
   * Supports filtering by round, status, category, risk level.
   * Requires viewer+ access.
   */
  async list(
    nid: string,
    opts?: ListChangesOptions
  ): Promise<ListChangesResponse> {
    const qs = new URLSearchParams();
    if (opts?.roundId) qs.set('roundId', opts.roundId);
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.category) qs.set('category', opts.category);
    if (opts?.riskLevel) qs.set('riskLevel', opts.riskLevel);
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request<ListChangesResponse>(
      `/negotiations/${nid}/changes${q ? `?${q}` : ''}`
    );
  },

  /**
   * Get a single change with full AI analysis.
   * Requires viewer+ access.
   */
  async get(nid: string, cid: string): Promise<ChangeDetailResponse> {
    return request<ChangeDetailResponse>(
      `/negotiations/${nid}/changes/${cid}`
    );
  },

  /**
   * Update a change's status (accept, reject, or counter).
   * Returns updated change and session with recalculated counts.
   * Requires editor+ access.
   */
  async updateStatus(
    nid: string,
    cid: string,
    params: UpdateChangeStatusParams
  ): Promise<UpdateChangeResponse> {
    return request<UpdateChangeResponse>(
      `/negotiations/${nid}/changes/${cid}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Trigger AI deep-dive analysis for a specific change.
   * Gathers context from knowledge graph, clause library, and compliance policies.
   * Creates proof record. Rate limited (10/hour).
   * Returns cached result if already analyzed.
   * Requires editor+ access.
   */
  async analyze(nid: string, cid: string): Promise<AnalyzeSingleResponse> {
    return request<AnalyzeSingleResponse>(
      `/negotiations/${nid}/changes/${cid}/analyze`,
      { method: 'POST' }
    );
  },

  /**
   * Generate AI compromise language for a change.
   * Modes: balanced (fair split), favorable (lean user), minimal_change (smallest mod).
   * Creates proof record. Rate limited (10/hour).
   * Requires editor+ access.
   */
  async generateCounterproposal(
    nid: string,
    cid: string,
    params: GenerateCounterproposalParams
  ): Promise<GenerateCounterproposalResponse> {
    return request<GenerateCounterproposalResponse>(
      `/negotiations/${nid}/changes/${cid}/counterproposal`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * List all AI-generated counterproposals for a change.
   * Requires viewer+ access.
   */
  async listCounterproposals(
    nid: string,
    cid: string
  ): Promise<ListCounterproposalsResponse> {
    return request<ListCounterproposalsResponse>(
      `/negotiations/${nid}/changes/${cid}/counterproposals`
    );
  },

  /**
   * Accept all pending changes in a session.
   * Returns count of accepted changes and updated session.
   * Requires editor+ access.
   */
  async acceptAll(nid: string): Promise<AcceptAllResponse> {
    return request<AcceptAllResponse>(
      `/negotiations/${nid}/changes/accept-all`,
      { method: 'POST' }
    );
  },

  /**
   * Reject all pending changes in a session.
   * Returns count of rejected changes and updated session.
   * Requires editor+ access.
   */
  async rejectAll(nid: string): Promise<RejectAllResponse> {
    return request<RejectAllResponse>(
      `/negotiations/${nid}/changes/reject-all`,
      { method: 'POST' }
    );
  },
};

/* ---------- Workspace Negotiations API ---------- */

export const negotiationWorkspaceApi = {
  /**
   * List all negotiation sessions in a workspace.
   * Supports filtering by status and counterparty name (partial match).
   * Each negotiation enriched with docTitle.
   * Requires viewer+ access.
   */
  async list(
    workspaceId: string,
    opts?: ListWorkspaceNegotiationsOptions
  ): Promise<ListWorkspaceNegotiationsResponse> {
    const qs = new URLSearchParams();
    if (opts?.status) qs.set('status', opts.status);
    if (opts?.counterparty) qs.set('counterparty', opts.counterparty);
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request<ListWorkspaceNegotiationsResponse>(
      `/workspaces/${workspaceId}/negotiations${q ? `?${q}` : ''}`
    );
  },

  /**
   * Get aggregate statistics for all negotiations in a workspace.
   * Includes total, active, settled this month, average rounds,
   * overall acceptance rate, and breakdown by status.
   * Requires viewer+ access.
   */
  async stats(workspaceId: string): Promise<WorkspaceNegotiationStatsResponse> {
    return request<WorkspaceNegotiationStatsResponse>(
      `/workspaces/${workspaceId}/negotiations/stats`
    );
  },
};
