/**
 * Workspace API Client
 */

import type {
  Workspace,
  WorkspaceMember,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
} from './types';

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
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const workspaceApi = {
  // List user's workspaces
  async list(): Promise<Workspace[]> {
    const data = await request<{ workspaces: Workspace[] }>('/workspaces');
    return data.workspaces;
  },

  // Get single workspace
  async get(id: string): Promise<Workspace> {
    return request<Workspace>(`/workspaces/${id}`);
  },

  // Get or create default workspace
  async getDefault(): Promise<Workspace> {
    return request<Workspace>('/workspaces/default');
  },

  // Create workspace
  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    return request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // Update workspace
  async update(id: string, input: UpdateWorkspaceInput): Promise<Workspace> {
    return request<Workspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  // Delete workspace
  async delete(id: string): Promise<void> {
    await request<void>(`/workspaces/${id}`, { method: 'DELETE' });
  },

  // List members
  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const data = await request<{ members: WorkspaceMember[] }>(
      `/workspaces/${workspaceId}/members`
    );
    return data.members;
  },

  // Add member
  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<WorkspaceMember> {
    return request<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  },

  // Update member role
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<WorkspaceMember> {
    return request<WorkspaceMember>(
      `/workspaces/${workspaceId}/members/${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }
    );
  },

  // Remove member
  async removeMember(workspaceId: string, userId: string): Promise<void> {
    await request<void>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    });
  },
};
