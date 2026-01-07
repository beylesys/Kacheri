// src/api/invites.ts
// API client for workspace invites.

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Invite {
  id: number;
  workspaceId: string;
  inviteToken: string;
  invitedEmail: string;
  invitedBy: string;
  role: WorkspaceRole;
  status: InviteStatus;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  acceptedBy: string | null;
}

export interface InviteInfo {
  workspaceId: string;
  workspaceName: string;
  invitedEmail: string;
  invitedBy: string;
  inviterName?: string;
  role: WorkspaceRole;
  status: InviteStatus;
  expiresAt: number;
  isValid: boolean;
}

export interface AcceptInviteResult {
  success: boolean;
  workspaceId?: string;
  workspaceName?: string;
  error?: string;
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

export const invitesApi = {
  /**
   * Create a new invite for a workspace.
   * Requires admin+ role.
   */
  async create(workspaceId: string, email: string, role?: WorkspaceRole): Promise<Invite> {
    return request<Invite>(`/workspaces/${workspaceId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  /**
   * List invites for a workspace.
   * Requires admin+ role.
   */
  async list(workspaceId: string, status?: 'all' | 'pending'): Promise<Invite[]> {
    const qs = status ? `?status=${status}` : '';
    const result = await request<{ invites: Invite[] }>(`/workspaces/${workspaceId}/invites${qs}`);
    return result.invites;
  },

  /**
   * Get invite info by token.
   * Public endpoint (for invite accept page).
   */
  async getByToken(token: string): Promise<InviteInfo> {
    return request<InviteInfo>(`/invites/${token}`);
  },

  /**
   * Accept an invite.
   * Requires authenticated user.
   */
  async accept(token: string): Promise<AcceptInviteResult> {
    return request<AcceptInviteResult>(`/invites/${token}/accept`, {
      method: 'POST',
    });
  },

  /**
   * Revoke an invite.
   * Requires admin+ role.
   */
  async revoke(workspaceId: string, inviteId: number): Promise<void> {
    await request<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Generate an invite link URL.
   */
  getInviteLink(token: string): string {
    return `${window.location.origin}/invite/${token}`;
  },
};
