// KACHERI FRONTEND/src/api/messages.ts
// API client for workspace messages (persistent chat).

export type Message = {
  id: number;
  workspaceId: string;
  authorId: string;
  content: string;
  replyToId: number | null;
  editedAt: string | null;
  createdAt: string;
};

export type CreateMessageParams = {
  content: string;
  replyToId?: number;
  mentions?: string[];
};

export type ListMessagesOptions = {
  limit?: number;
  before?: number;
  after?: number;
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

export const messagesApi = {
  /**
   * List messages for a workspace with pagination.
   * Requires workspace member access.
   */
  async list(
    workspaceId: string,
    options?: ListMessagesOptions
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const qs = new URLSearchParams();
    if (options?.limit) qs.set('limit', String(options.limit));
    if (options?.before) qs.set('before', String(options.before));
    if (options?.after) qs.set('after', String(options.after));
    const q = qs.toString();
    return request<{ messages: Message[]; hasMore: boolean }>(
      `/workspaces/${workspaceId}/messages${q ? `?${q}` : ''}`
    );
  },

  /**
   * Create a new message in a workspace.
   * Requires workspace member access.
   */
  async create(
    workspaceId: string,
    params: CreateMessageParams
  ): Promise<Message> {
    return request<Message>(`/workspaces/${workspaceId}/messages`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Update a message's content.
   * Requires being the author of the message.
   */
  async update(messageId: number, content: string): Promise<Message> {
    return request<Message>(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  },

  /**
   * Delete (soft) a message.
   * Requires being the author of the message.
   */
  async delete(messageId: number): Promise<void> {
    await request<void>(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  },
};
