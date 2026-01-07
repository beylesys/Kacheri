/**
 * Workspace Types
 *
 * Core type definitions for workspace and membership.
 */

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;        // user_id of creator
  createdAt: number;        // unix ms
  updatedAt: number;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: number;
}

export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
}

export interface AddMemberInput {
  userId: string;
  role: WorkspaceRole;
}

/**
 * Permission checks based on role hierarchy:
 * owner > admin > editor > viewer
 */
export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  owner: 100,
  admin: 75,
  editor: 50,
  viewer: 25,
};

export function hasPermission(
  userRole: WorkspaceRole,
  requiredRole: WorkspaceRole
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * What each role can do:
 * - viewer: read docs, exports, provenance
 * - editor: create/edit docs, folders, export
 * - admin: manage members (add/remove editors/viewers), workspace settings
 * - owner: everything including delete workspace, transfer ownership
 */
export const ROLE_PERMISSIONS = {
  viewer: ['read'],
  editor: ['read', 'write', 'export'],
  admin: ['read', 'write', 'export', 'manage_members', 'settings'],
  owner: ['read', 'write', 'export', 'manage_members', 'settings', 'delete', 'transfer'],
} as const;
