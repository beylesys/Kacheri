// KACHERI FRONTEND/src/api/docLinks.ts
// API client for cross-document links and backlinks

export interface DocLink {
  id: number;
  fromDocId: string;
  toDocId: string;
  fromDocTitle?: string;
  toDocTitle?: string;
  workspaceId: string | null;
  linkText: string | null;
  position: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const docLinksApi = {
  /**
   * List all documents that link TO this document (backlinks).
   * Requires viewer+ access.
   */
  listBacklinks: (docId: string): Promise<{ backlinks: DocLink[] }> =>
    request<{ backlinks: DocLink[] }>(`/docs/${docId}/backlinks`),

  /**
   * List all documents that this document links TO (outgoing links).
   * Requires viewer+ access.
   */
  listLinks: (docId: string): Promise<{ links: DocLink[] }> =>
    request<{ links: DocLink[] }>(`/docs/${docId}/links`),
};
