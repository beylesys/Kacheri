// KACHERI FRONTEND/src/api/suggestions.ts
// API client for document suggestions (track changes mode).

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';
export type ChangeType = 'insert' | 'delete' | 'replace';

export type Suggestion = {
  id: number;
  docId: string;
  authorId: string;
  status: SuggestionStatus;
  changeType: ChangeType;
  fromPos: number;
  toPos: number;
  originalText: string | null;
  proposedText: string | null;
  comment: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSuggestionParams = {
  changeType: ChangeType;
  fromPos: number;
  toPos: number;
  originalText?: string;
  proposedText?: string;
  comment?: string;
};

export type ListSuggestionsOptions = {
  status?: SuggestionStatus;
  authorId?: string;
  changeType?: ChangeType;
  from?: number;
  to?: number;
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
    const text = await res.text();
    let errorMessage = `API ${res.status}: ${text || res.statusText}`;
    try {
      const json = JSON.parse(text);
      if (json.error) errorMessage = json.error;
    } catch {}
    throw new Error(errorMessage);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const suggestionsApi = {
  /**
   * List all suggestions for a document.
   * Requires viewer+ access.
   */
  async list(
    docId: string,
    options?: ListSuggestionsOptions
  ): Promise<{ suggestions: Suggestion[]; pendingCount: number; total: number }> {
    const qs = new URLSearchParams();
    if (options?.status) qs.set('status', options.status);
    if (options?.authorId) qs.set('authorId', options.authorId);
    if (options?.changeType) qs.set('changeType', options.changeType);
    if (options?.from !== undefined) qs.set('from', String(options.from));
    if (options?.to !== undefined) qs.set('to', String(options.to));
    const q = qs.toString();
    return request<{ suggestions: Suggestion[]; pendingCount: number; total: number }>(
      `/docs/${docId}/suggestions${q ? `?${q}` : ''}`
    );
  },

  /**
   * Create a new suggestion on a document.
   * Requires commenter+ access.
   */
  async create(docId: string, params: CreateSuggestionParams): Promise<Suggestion> {
    return request<Suggestion>(`/docs/${docId}/suggestions`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Get a single suggestion by ID.
   * Requires viewer+ access on the document.
   */
  async get(suggestionId: number): Promise<Suggestion> {
    return request<Suggestion>(`/suggestions/${suggestionId}`);
  },

  /**
   * Update a suggestion's comment.
   * Requires commenter+ access and must be the author.
   */
  async updateComment(suggestionId: number, comment: string): Promise<Suggestion> {
    return request<Suggestion>(`/suggestions/${suggestionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ comment }),
    });
  },

  /**
   * Delete a suggestion.
   * Author with commenter+ can delete their own.
   * Editor+ can delete any suggestion.
   */
  async delete(suggestionId: number): Promise<void> {
    await request<void>(`/suggestions/${suggestionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Accept a suggestion.
   * Requires editor+ access.
   */
  async accept(suggestionId: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      `/suggestions/${suggestionId}/accept`,
      { method: 'POST' }
    );
  },

  /**
   * Reject a suggestion.
   * Requires editor+ access.
   */
  async reject(suggestionId: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(
      `/suggestions/${suggestionId}/reject`,
      { method: 'POST' }
    );
  },

  /**
   * Accept all pending suggestions for a document.
   * Requires editor+ access.
   */
  async acceptAll(docId: string): Promise<{ ok: boolean; count: number }> {
    return request<{ ok: boolean; count: number }>(
      `/docs/${docId}/suggestions/accept-all`,
      { method: 'POST' }
    );
  },

  /**
   * Reject all pending suggestions for a document.
   * Requires editor+ access.
   */
  async rejectAll(docId: string): Promise<{ ok: boolean; count: number }> {
    return request<{ ok: boolean; count: number }>(
      `/docs/${docId}/suggestions/reject-all`,
      { method: 'POST' }
    );
  },
};
