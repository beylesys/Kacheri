// KACHERI FRONTEND/src/api/reviewers.ts
// API client for document reviewer assignments.
// Slice 12 — Phase 2 Sprint 4

export type ReviewerStatus = 'pending' | 'in_review' | 'completed';

export type DocReviewer = {
  id: number;
  docId: string;
  workspaceId: string;
  userId: string;
  assignedBy: string;
  status: ReviewerStatus;
  assignedAt: number;
  completedAt: number | null;
  notes: string | null;
};

export type ListReviewersResponse = {
  reviewers: DocReviewer[];
  count: number;
};

export type AssignReviewerResponse = {
  reviewer: DocReviewer;
};

export type UpdateReviewerResponse = {
  reviewer: DocReviewer;
};

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

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const auth = authHeader();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  const dev = devUserHeader();
  for (const [k, v] of Object.entries(dev)) headers.set(k, v);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

export const reviewersApi = {
  /** List all reviewers for a document. */
  list(docId: string): Promise<ListReviewersResponse> {
    return request<ListReviewersResponse>(`/docs/${docId}/reviewers`);
  },

  /** Assign a reviewer to a document. */
  assign(docId: string, userId: string): Promise<AssignReviewerResponse> {
    return request<AssignReviewerResponse>(`/docs/${docId}/reviewers`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  /** Update a reviewer's status. */
  updateStatus(
    docId: string,
    userId: string,
    status: ReviewerStatus,
    notes?: string | null
  ): Promise<UpdateReviewerResponse> {
    return request<UpdateReviewerResponse>(
      `/docs/${docId}/reviewers/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: notes ?? undefined }),
      }
    );
  },

  /** Remove a reviewer from a document. */
  remove(docId: string, userId: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(
      `/docs/${docId}/reviewers/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  },
};
