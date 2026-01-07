// KACHERI FRONTEND/src/api/comments.ts
// API client for document comments with threading and mentions.

export type Comment = {
  id: number;
  docId: string;
  threadId: string | null;
  parentId: number | null;
  authorId: string;
  content: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorText: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  mentions: string[];
};

export type CreateCommentParams = {
  content: string;
  parentId?: number;
  anchorFrom?: number;
  anchorTo?: number;
  anchorText?: string;
  mentions?: string[];
};

export type ListCommentsOptions = {
  includeDeleted?: boolean;
  includeResolved?: boolean;
  threadId?: string;
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

export const commentsApi = {
  /**
   * List all comments for a document.
   * Requires viewer+ access.
   */
  async list(
    docId: string,
    options?: ListCommentsOptions
  ): Promise<{ comments: Comment[] }> {
    const qs = new URLSearchParams();
    if (options?.includeDeleted) qs.set('includeDeleted', 'true');
    if (options?.includeResolved === false) qs.set('includeResolved', 'false');
    if (options?.threadId) qs.set('threadId', options.threadId);
    const q = qs.toString();
    return request<{ comments: Comment[] }>(
      `/docs/${docId}/comments${q ? `?${q}` : ''}`
    );
  },

  /**
   * Create a new comment on a document.
   * Requires commenter+ access.
   */
  async create(docId: string, params: CreateCommentParams): Promise<Comment> {
    return request<Comment>(`/docs/${docId}/comments`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Get a single comment by ID.
   * Requires viewer+ access on the document.
   */
  async get(commentId: number): Promise<Comment> {
    return request<Comment>(`/comments/${commentId}`);
  },

  /**
   * Update a comment's content.
   * Requires commenter+ access and must be the author.
   */
  async update(commentId: number, content: string): Promise<Comment> {
    return request<Comment>(`/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  },

  /**
   * Delete (soft) a comment.
   * Author with commenter+ can delete their own.
   * Editor+ can delete any comment.
   */
  async delete(commentId: number): Promise<void> {
    await request<void>(`/comments/${commentId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Resolve a comment thread.
   * Requires commenter+ access.
   */
  async resolve(commentId: number): Promise<{ ok: true; threadId: string }> {
    return request<{ ok: true; threadId: string }>(
      `/comments/${commentId}/resolve`,
      { method: 'POST' }
    );
  },

  /**
   * Reopen a resolved thread.
   * Requires commenter+ access.
   */
  async reopen(commentId: number): Promise<{ ok: true; threadId: string }> {
    return request<{ ok: true; threadId: string }>(
      `/comments/${commentId}/reopen`,
      { method: 'POST' }
    );
  },
};
