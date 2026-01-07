// KACHERI FRONTEND/src/api/docPermissions.ts
// API client for document-level permissions

export type DocRole = 'owner' | 'editor' | 'commenter' | 'viewer';

// Workspace-wide access level type
export type WorkspaceAccessLevel = 'none' | 'viewer' | 'commenter' | 'editor' | null;

export interface DocPermission {
  docId: string;
  userId: string;
  role: DocRole;
  grantedBy: string;
  grantedAt: string;
}

// Response type for list permissions (owners see workspaceAccess)
export interface ListPermissionsResponse {
  permissions: DocPermission[];
  workspaceAccess?: WorkspaceAccessLevel;
}

// Response type for workspace access update
export interface WorkspaceAccessResponse {
  docId: string;
  workspaceAccess: WorkspaceAccessLevel;
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

export const docPermissionsApi = {
  /**
   * List all permissions for a document.
   * Owners see all permissions + workspaceAccess, others see only their own.
   */
  async list(docId: string): Promise<ListPermissionsResponse> {
    return request<ListPermissionsResponse>(`/docs/${docId}/permissions`);
  },

  /**
   * Grant permission to a user on a document.
   * Requires editor+ role. Only owners can grant owner role.
   */
  async grant(
    docId: string,
    userId: string,
    role: DocRole
  ): Promise<DocPermission> {
    return request<DocPermission>(`/docs/${docId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  },

  /**
   * Update a user's role on a document.
   * Requires owner role.
   */
  async update(
    docId: string,
    userId: string,
    role: DocRole
  ): Promise<DocPermission> {
    return request<DocPermission>(`/docs/${docId}/permissions/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  /**
   * Revoke a user's permission on a document.
   * Requires owner role (or self-removal for non-owners).
   */
  async revoke(docId: string, userId: string): Promise<void> {
    await request<void>(`/docs/${docId}/permissions/${userId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Update the workspace-wide access level for a document.
   * Requires owner role.
   * @param workspaceAccess - 'none' | 'viewer' | 'commenter' | 'editor' | null
   */
  async updateWorkspaceAccess(
    docId: string,
    workspaceAccess: WorkspaceAccessLevel
  ): Promise<WorkspaceAccessResponse> {
    return request<WorkspaceAccessResponse>(`/docs/${docId}/workspace-access`, {
      method: 'PATCH',
      body: JSON.stringify({ workspaceAccess }),
    });
  },
};
