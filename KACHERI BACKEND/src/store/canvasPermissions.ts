// KACHERI BACKEND/src/store/canvasPermissions.ts
// Canvas-level permission store with CRUD operations.
// Supports 3 roles: owner > editor > viewer
// Mirrors docPermissions.ts pattern exactly.
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A3

import { db } from '../db';
import type { WorkspaceRole } from '../workspace/types';

// ============================================
// Types
// ============================================

export type CanvasRole = 'owner' | 'editor' | 'viewer';

export const CANVAS_ROLE_HIERARCHY: Record<CanvasRole, number> = {
  owner: 100,
  editor: 75,
  viewer: 25,
};

export interface CanvasPermission {
  id: number;
  canvasId: string;
  userId: string;
  role: CanvasRole;
  grantedBy: string;
  grantedAt: number;
}

// API-friendly version with ISO date
export interface CanvasPermissionMeta {
  canvasId: string;
  userId: string;
  role: CanvasRole;
  grantedBy: string;
  grantedAt: string; // ISO string
}

// Internal row type from SQLite
interface CanvasPermissionRow {
  id: number;
  canvas_id: string;
  user_id: string;
  role: string;
  granted_by: string;
  granted_at: number;
}

// ============================================
// Role Helpers
// ============================================

/**
 * Check if a user's canvas role meets the required level.
 */
export function hasCanvasPermission(userRole: CanvasRole | null, requiredRole: CanvasRole): boolean {
  if (!userRole) return false;
  return CANVAS_ROLE_HIERARCHY[userRole] >= CANVAS_ROLE_HIERARCHY[requiredRole];
}

/**
 * Validate that a string is a valid CanvasRole.
 */
export function isValidCanvasRole(role: string): role is CanvasRole {
  return ['owner', 'editor', 'viewer'].includes(role);
}

/**
 * Map workspace role to equivalent canvas role.
 * - owner  -> owner
 * - admin  -> editor
 * - editor -> editor
 * - viewer -> viewer
 */
export function mapWorkspaceToCanvasRole(wsRole: WorkspaceRole): CanvasRole {
  switch (wsRole) {
    case 'owner': return 'owner';
    case 'admin': return 'editor';
    case 'editor': return 'editor';
    case 'viewer': return 'viewer';
  }
}

// ============================================
// Row Conversion
// ============================================

function rowToPermission(row: CanvasPermissionRow): CanvasPermission {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    userId: row.user_id,
    role: row.role as CanvasRole,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
  };
}

function rowToPermissionMeta(row: CanvasPermissionRow): CanvasPermissionMeta {
  return {
    canvasId: row.canvas_id,
    userId: row.user_id,
    role: row.role as CanvasRole,
    grantedBy: row.granted_by,
    grantedAt: new Date(row.granted_at).toISOString(),
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Get a single canvas permission for a user.
 */
export async function getCanvasPermission(canvasId: string, userId: string): Promise<CanvasPermission | null> {
  const row = await db.queryOne<CanvasPermissionRow>(`
    SELECT id, canvas_id, user_id, role, granted_by, granted_at
    FROM canvas_permissions
    WHERE canvas_id = ? AND user_id = ?
  `, [canvasId, userId]);

  return row ? rowToPermission(row) : null;
}

/**
 * List all permissions for a canvas.
 */
export async function listCanvasPermissions(canvasId: string): Promise<CanvasPermissionMeta[]> {
  const rows = await db.queryAll<CanvasPermissionRow>(`
    SELECT id, canvas_id, user_id, role, granted_by, granted_at
    FROM canvas_permissions
    WHERE canvas_id = ?
    ORDER BY granted_at ASC
  `, [canvasId]);

  return rows.map(rowToPermissionMeta);
}

/**
 * Grant a permission to a user on a canvas.
 * If the user already has a permission, this will fail (use updateCanvasPermission instead).
 */
export async function grantCanvasPermission(
  canvasId: string,
  userId: string,
  role: CanvasRole,
  grantedBy: string
): Promise<CanvasPermissionMeta> {
  const now = Date.now();

  await db.run(`
    INSERT INTO canvas_permissions (canvas_id, user_id, role, granted_by, granted_at)
    VALUES (?, ?, ?, ?, ?)
  `, [canvasId, userId, role, grantedBy, now]);

  return {
    canvasId,
    userId,
    role,
    grantedBy,
    grantedAt: new Date(now).toISOString(),
  };
}

/**
 * Update an existing permission's role.
 * Returns the updated permission, or null if not found.
 */
export async function updateCanvasPermission(
  canvasId: string,
  userId: string,
  role: CanvasRole
): Promise<CanvasPermissionMeta | null> {
  const info = await db.run(`
    UPDATE canvas_permissions
    SET role = ?
    WHERE canvas_id = ? AND user_id = ?
  `, [role, canvasId, userId]);

  if (info.changes === 0) {
    return null;
  }

  const row = await db.queryOne<CanvasPermissionRow>(`
    SELECT id, canvas_id, user_id, role, granted_by, granted_at
    FROM canvas_permissions
    WHERE canvas_id = ? AND user_id = ?
  `, [canvasId, userId]);

  return row ? rowToPermissionMeta(row) : null;
}

/**
 * Revoke a user's permission on a canvas.
 * Returns true if revoked, false if not found.
 */
export async function revokeCanvasPermission(canvasId: string, userId: string): Promise<boolean> {
  const info = await db.run(`
    DELETE FROM canvas_permissions
    WHERE canvas_id = ? AND user_id = ?
  `, [canvasId, userId]);

  return (info.changes ?? 0) > 0;
}

/**
 * Delete all permissions for a canvas.
 * Called when a canvas is permanently deleted.
 */
export async function deleteAllCanvasPermissions(canvasId: string): Promise<number> {
  const info = await db.run(`
    DELETE FROM canvas_permissions
    WHERE canvas_id = ?
  `, [canvasId]);

  return info.changes ?? 0;
}

// ============================================
// Access Resolution
// ============================================

/**
 * Get the effective canvas role for a user.
 * Resolution order:
 * 1. Explicit canvas permission (takes precedence)
 * 2. Canvas's workspace_access setting (if user is workspace member)
 * 3. Workspace role mapping (fallback)
 * 4. Canvas creator (implicit owner)
 * 5. null (no access)
 *
 * @param canvasId - The canvas ID
 * @param userId - The user ID
 * @param getWorkspaceRole - Function to get user's workspace role
 * @returns The effective role, or null if no access
 */
export async function getEffectiveCanvasRole(
  canvasId: string,
  userId: string | null,
  getWorkspaceRole: (workspaceId: string, userId: string) => WorkspaceRole | null | Promise<WorkspaceRole | null>
): Promise<CanvasRole | null> {
  if (!userId) return null;

  // 1. Check explicit canvas permission (takes precedence)
  const canvasPerm = await getCanvasPermission(canvasId, userId);
  if (canvasPerm) {
    return canvasPerm.role;
  }

  // 2. Get canvas to check workspace, workspace_access, and creator
  const canvas = await getCanvasWithCreatorAndAccess(canvasId);
  if (!canvas) return null;

  // 3. Check workspace_access and workspace role if user is in workspace
  if (canvas.workspaceId) {
    const wsRole = await getWorkspaceRole(canvas.workspaceId, userId);
    if (wsRole) {
      // User IS a workspace member - check workspace_access setting
      if (canvas.workspaceAccess) {
        if (canvas.workspaceAccess === 'none') {
          // Explicit 'none' means no workspace-based access - skip to creator check
        } else if (isValidCanvasRole(canvas.workspaceAccess)) {
          return canvas.workspaceAccess as CanvasRole;
        }
      } else {
        // No workspace_access set (null) - use workspace role mapping as fallback
        return mapWorkspaceToCanvasRole(wsRole);
      }
    }
  }

  // 4. Check if user is canvas creator (implicit owner)
  if (canvas.createdBy === userId) {
    return 'owner';
  }

  return null; // No access
}

/**
 * Get canvas with created_by and workspace_access fields for access resolution.
 */
async function getCanvasWithCreatorAndAccess(canvasId: string): Promise<{
  workspaceId: string | null;
  createdBy: string | null;
  workspaceAccess: string | null;
} | null> {
  const row = await db.queryOne<{
    workspace_id: string | null;
    created_by: string | null;
    workspace_access: string | null;
  }>(`
    SELECT workspace_id, created_by, workspace_access
    FROM canvases
    WHERE id = ? AND deleted_at IS NULL
  `, [canvasId]);

  if (!row) return null;

  return {
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    workspaceAccess: row.workspace_access,
  };
}

// ============================================
// Aggregated Export
// ============================================

export const CanvasPermissionsStore = {
  getCanvasPermission,
  listCanvasPermissions,
  grantCanvasPermission,
  updateCanvasPermission,
  revokeCanvasPermission,
  deleteAllCanvasPermissions,
  getEffectiveCanvasRole,
  hasCanvasPermission,
  isValidCanvasRole,
  mapWorkspaceToCanvasRole,
};
