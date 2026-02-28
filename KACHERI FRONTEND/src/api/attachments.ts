// KACHERI FRONTEND/src/api/attachments.ts
// API client for document attachments (upload, list, serve, delete).

export type DocAttachment = {
  id: string;
  docId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: number;
  metadata: Record<string, unknown> | null;
};

export type AttachmentLimits = {
  maxCount: number;
  maxTotalBytes: number;
};

export type ListAttachmentsResponse = {
  attachments: DocAttachment[];
  totalSize: number;
  count: number;
  limits: AttachmentLimits;
};

export type UploadAttachmentResponse = {
  attachment: DocAttachment;
  proof: { id: string; hash: string };
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

export const attachmentsApi = {
  /** List all attachments for a document. Requires viewer+ access. */
  async list(docId: string): Promise<ListAttachmentsResponse> {
    return request<ListAttachmentsResponse>(`/docs/${docId}/attachments`);
  },

  /**
   * Upload a file attachment. Requires editor+ access.
   * Uses raw fetch with FormData (not the request<T> wrapper)
   * because the wrapper auto-sets Content-Type: application/json
   * which would corrupt the multipart boundary.
   */
  async upload(
    docId: string,
    file: File,
    workspaceId: string
  ): Promise<UploadAttachmentResponse> {
    const form = new FormData();
    form.append('file', file);

    const headers: Record<string, string> = {
      'X-Workspace-Id': workspaceId,
      ...authHeader(),
      ...devUserHeader(),
    };

    const res = await fetch(`${API_BASE}/docs/${docId}/attachments`, {
      method: 'POST',
      headers,
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = `API ${res.status}: ${text || res.statusText}`;
      try {
        const json = JSON.parse(text);
        if (json.error) errorMessage = json.error;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.json();
  },

  /** Returns the direct URL for an attachment file (for use in iframe/img src). */
  getFileUrl(docId: string, attachmentId: string): string {
    return `${API_BASE}/docs/${docId}/attachments/${attachmentId}/file`;
  },

  /** Soft-delete an attachment. Requires editor+ or uploader. */
  async delete(docId: string, attachmentId: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(
      `/docs/${docId}/attachments/${attachmentId}`,
      { method: 'DELETE' }
    );
  },
};
