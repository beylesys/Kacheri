// KACHERI FRONTEND/src/api/versions.ts
// API client for document version history with diff and restore.

export type DocVersionMeta = {
  id: number;
  docId: string;
  versionNumber: number;
  name: string | null;
  snapshotHash: string;
  createdBy: string;
  createdAt: string;
  proofId: number | null;
  metadata: { wordCount?: number; charCount?: number; notes?: string } | null;
};

export type DocVersionFull = DocVersionMeta & {
  snapshotHtml: string;
  snapshotText: string;
};

export type DiffHunk = {
  type: 'add' | 'remove' | 'context';
  lineStart: number;
  content: string[];
};

export type VersionDiff = {
  fromVersion: number;
  toVersion: number;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
};

export type CreateVersionParams = {
  name?: string;
  snapshotHtml: string;
  snapshotText: string;
  metadata?: { wordCount?: number; charCount?: number; notes?: string };
};

export type RestoreVersionParams = {
  fromVersionId: number;
  backupName?: string;
};

export type RestoreResult = {
  ok: true;
  restoredFromVersion: number;
  newVersionCreated: boolean;
  snapshotHtml: string;
  snapshotText: string;
};

export type ListVersionsOptions = {
  limit?: number;
  offset?: number;
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

export const versionsApi = {
  /**
   * List all versions for a document.
   * Requires viewer+ access.
   */
  async list(
    docId: string,
    options?: ListVersionsOptions
  ): Promise<{ versions: DocVersionMeta[]; total: number }> {
    const qs = new URLSearchParams();
    if (options?.limit) qs.set('limit', String(options.limit));
    if (options?.offset) qs.set('offset', String(options.offset));
    const q = qs.toString();
    return request<{ versions: DocVersionMeta[]; total: number }>(
      `/docs/${docId}/versions${q ? `?${q}` : ''}`
    );
  },

  /**
   * Create a new version of a document.
   * Requires editor+ access.
   */
  async create(docId: string, params: CreateVersionParams): Promise<DocVersionMeta> {
    return request<DocVersionMeta>(`/docs/${docId}/versions`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Get a single version with full snapshot.
   * Requires viewer+ access.
   */
  async get(docId: string, versionId: number): Promise<DocVersionFull> {
    return request<DocVersionFull>(`/docs/${docId}/versions/${versionId}`);
  },

  /**
   * Rename a version.
   * Requires editor+ access.
   */
  async rename(docId: string, versionId: number, name: string): Promise<DocVersionMeta> {
    return request<DocVersionMeta>(`/docs/${docId}/versions/${versionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  /**
   * Delete a version (soft delete).
   * Requires editor+ access. Cannot delete latest version.
   */
  async delete(docId: string, versionId: number): Promise<void> {
    await request<void>(`/docs/${docId}/versions/${versionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Get diff between two versions.
   * Requires viewer+ access.
   */
  async getDiff(
    docId: string,
    versionId: number,
    compareWith: number
  ): Promise<VersionDiff> {
    return request<VersionDiff>(
      `/docs/${docId}/versions/${versionId}/diff?compareWith=${compareWith}`
    );
  },

  /**
   * Restore document to a previous version.
   * Creates backup of current content first.
   * Requires editor+ access.
   */
  async restore(docId: string, params: RestoreVersionParams): Promise<RestoreResult> {
    return request<RestoreResult>(`/docs/${docId}/versions/restore`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },
};
