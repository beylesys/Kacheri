// KACHERI FRONTEND/src/api/compliance.ts
// API client for Compliance Checker endpoints.
//
// Covers:
//   - Compliance Checks: trigger, get latest, get history
//   - Compliance Policies: list, create, update, delete, get templates
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A8

import type {
  CheckComplianceParams,
  CheckComplianceResponse,
  CheckSkippedResponse,
  CheckNoPoliciesResponse,
  GetLatestCheckResponse,
  CheckHistoryOptions,
  CheckHistoryResponse,
  ListPoliciesOptions,
  ListPoliciesResponse,
  CreatePolicyParams,
  CreatePolicyResponse,
  UpdatePolicyParams,
  UpdatePolicyResponse,
  DeletePolicyResponse,
  ListTemplatesOptions,
  ListTemplatesResponse,
} from '../types/compliance';

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
      throw new Error('Request timed out. The compliance check may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Compliance Check API ---------- */

export const complianceApi = {
  /**
   * Trigger a compliance check against all enabled workspace policies.
   * Requires editor+ access. Rate limited.
   *
   * When triggeredBy is 'auto_save', the response may be a CheckSkippedResponse
   * (debounced or no auto-check policies) instead of a full check result.
   * When no policies are enabled, returns CheckNoPoliciesResponse.
   */
  async check(
    docId: string,
    params: CheckComplianceParams
  ): Promise<CheckComplianceResponse | CheckSkippedResponse | CheckNoPoliciesResponse> {
    return request<CheckComplianceResponse | CheckSkippedResponse | CheckNoPoliciesResponse>(
      `/docs/${docId}/compliance/check`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Get the latest compliance check result for a document.
   * Requires viewer+ access.
   */
  async getLatest(docId: string): Promise<GetLatestCheckResponse> {
    return request<GetLatestCheckResponse>(`/docs/${docId}/compliance`);
  },

  /**
   * Get paginated history of compliance checks for a document.
   * Requires viewer+ access.
   */
  async getHistory(
    docId: string,
    opts?: CheckHistoryOptions
  ): Promise<CheckHistoryResponse> {
    const qs = new URLSearchParams();
    if (opts?.limit !== undefined) qs.set('limit', String(opts.limit));
    if (opts?.offset !== undefined) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return request<CheckHistoryResponse>(
      `/docs/${docId}/compliance/history${q ? `?${q}` : ''}`
    );
  },
};

/* ---------- Compliance Policies API ---------- */

export const compliancePoliciesApi = {
  /**
   * List all compliance policies for a workspace.
   * Supports optional category and enabled filters.
   * Requires viewer+ access on workspace.
   */
  async list(
    workspaceId: string,
    opts?: ListPoliciesOptions
  ): Promise<ListPoliciesResponse> {
    const qs = new URLSearchParams();
    if (opts?.category) qs.set('category', opts.category);
    if (opts?.enabled !== undefined) qs.set('enabled', String(opts.enabled));
    const q = qs.toString();
    return request<ListPoliciesResponse>(
      `/workspaces/${workspaceId}/compliance-policies${q ? `?${q}` : ''}`
    );
  },

  /**
   * Create a new compliance policy.
   * Requires workspace admin access.
   */
  async create(
    workspaceId: string,
    params: CreatePolicyParams
  ): Promise<CreatePolicyResponse> {
    return request<CreatePolicyResponse>(
      `/workspaces/${workspaceId}/compliance-policies`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Update an existing compliance policy.
   * Requires workspace admin access.
   */
  async update(
    workspaceId: string,
    policyId: string,
    params: UpdatePolicyParams
  ): Promise<UpdatePolicyResponse> {
    return request<UpdatePolicyResponse>(
      `/workspaces/${workspaceId}/compliance-policies/${policyId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Delete a compliance policy.
   * Requires workspace admin access.
   */
  async delete(
    workspaceId: string,
    policyId: string
  ): Promise<DeletePolicyResponse> {
    return request<DeletePolicyResponse>(
      `/workspaces/${workspaceId}/compliance-policies/${policyId}`,
      { method: 'DELETE' }
    );
  },

  /**
   * Get built-in policy templates.
   * Supports optional category filter.
   * Requires viewer+ access on workspace.
   */
  async getTemplates(
    workspaceId: string,
    opts?: ListTemplatesOptions
  ): Promise<ListTemplatesResponse> {
    const qs = new URLSearchParams();
    if (opts?.category) qs.set('category', opts.category);
    const q = qs.toString();
    return request<ListTemplatesResponse>(
      `/workspaces/${workspaceId}/compliance-policies/templates${q ? `?${q}` : ''}`
    );
  },
};
