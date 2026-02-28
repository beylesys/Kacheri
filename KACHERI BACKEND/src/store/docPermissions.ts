// KACHERI BACKEND/src/store/docPermissions.ts
// Document-level permission store with CRUD operations.
// Supports 4 roles: owner > editor > commenter > viewer

import { db } from '../db';
import { getDoc } from './docs';
import type { WorkspaceRole } from '../workspace/types';

// ============================================
// Types
// ============================================

export type DocRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export const DOC_ROLE_HIERARCHY: Record<DocRole, number> = {
  owner: 100,
  editor: 75,
  commenter: 50,
  viewer: 25,
};

export interface DocPermission {
  id: number;
  docId: string;
  userId: string;
  role: DocRole;
  grantedBy: string;
  grantedAt: number;
}

// API-friendly version with ISO date
export interface DocPermissionMeta {
  docId: string;
  userId: string;
  role: DocRole;
  grantedBy: string;
  grantedAt: string; // ISO string
}

// Internal row type from SQLite
interface DocPermissionRow {
  id: number;
  doc_id: string;
  user_id: string;
  role: string;
  granted_by: string;
  granted_at: number;
}

// ============================================
// Role Helpers
// ============================================

/**
 * Check if a user's doc role meets the required level.
 */
export function hasDocPermission(userRole: DocRole | null, requiredRole: DocRole): boolean {
  if (!userRole) return false;
  return DOC_ROLE_HIERARCHY[userRole] >= DOC_ROLE_HIERARCHY[requiredRole];
}

/**
 * Validate that a string is a valid DocRole.
 */
export function isValidDocRole(role: string): role is DocRole {
  return ['owner', 'editor', 'commenter', 'viewer'].includes(role);
}

/**
 * Map workspace role to equivalent doc role.
 * - owner -> owner
 * - admin -> editor
 * - editor -> editor
 * - viewer -> viewer
 */
export function mapWorkspaceToDocRole(wsRole: WorkspaceRole): DocRole {
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

function rowToPermission(row: DocPermissionRow): DocPermission {
  return {
    id: row.id,
    docId: row.doc_id,
    userId: row.user_id,
    role: row.role as DocRole,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at,
  };
}

function rowToPermissionMeta(row: DocPermissionRow): DocPermissionMeta {
  return {
    docId: row.doc_id,
    userId: row.user_id,
    role: row.role as DocRole,
    grantedBy: row.granted_by,
    grantedAt: new Date(row.granted_at).toISOString(),
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Get a single doc permission for a user.
 */
export async function getDocPermission(docId: string, userId: string): Promise<DocPermission | null> {
  const row = await db.queryOne<DocPermissionRow>(`
    SELECT id, doc_id, user_id, role, granted_by, granted_at
    FROM doc_permissions
    WHERE doc_id = ? AND user_id = ?
  `, [docId, userId]);

  return row ? rowToPermission(row) : null;
}

/**
 * List all permissions for a document.
 */
export async function listDocPermissions(docId: string): Promise<DocPermissionMeta[]> {
  const rows = await db.queryAll<DocPermissionRow>(`
    SELECT id, doc_id, user_id, role, granted_by, granted_at
    FROM doc_permissions
    WHERE doc_id = ?
    ORDER BY granted_at ASC
  `, [docId]);

  return rows.map(rowToPermissionMeta);
}

/**
 * Grant a permission to a user on a document.
 * If the user already has a permission, this will fail (use updateDocPermission instead).
 */
export async function grantDocPermission(
  docId: string,
  userId: string,
  role: DocRole,
  grantedBy: string
): Promise<DocPermissionMeta> {
  const now = Date.now();

  await db.run(`
    INSERT INTO doc_permissions (doc_id, user_id, role, granted_by, granted_at)
    VALUES (?, ?, ?, ?, ?)
  `, [docId, userId, role, grantedBy, now]);

  return {
    docId,
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
export async function updateDocPermission(
  docId: string,
  userId: string,
  role: DocRole
): Promise<DocPermissionMeta | null> {
  const info = await db.run(`
    UPDATE doc_permissions
    SET role = ?
    WHERE doc_id = ? AND user_id = ?
  `, [role, docId, userId]);

  if (info.changes === 0) {
    return null;
  }

  const row = await db.queryOne<DocPermissionRow>(`
    SELECT id, doc_id, user_id, role, granted_by, granted_at
    FROM doc_permissions
    WHERE doc_id = ? AND user_id = ?
  `, [docId, userId]);

  return row ? rowToPermissionMeta(row) : null;
}

/**
 * Revoke a user's permission on a document.
 * Returns true if revoked, false if not found.
 */
export async function revokeDocPermission(docId: string, userId: string): Promise<boolean> {
  const info = await db.run(`
    DELETE FROM doc_permissions
    WHERE doc_id = ? AND user_id = ?
  `, [docId, userId]);

  return (info.changes ?? 0) > 0;
}

/**
 * List all doc IDs where a user has explicit permissions.
 */
export async function listDocsWithPermission(userId: string): Promise<string[]> {
  const rows = await db.queryAll<{ doc_id: string }>(`
    SELECT DISTINCT doc_id
    FROM doc_permissions
    WHERE user_id = ?
  `, [userId]);

  return rows.map(r => r.doc_id);
}

/**
 * Delete all permissions for a document.
 * Called when a document is permanently deleted.
 */
export async function deleteAllDocPermissions(docId: string): Promise<number> {
  const info = await db.run(`
    DELETE FROM doc_permissions
    WHERE doc_id = ?
  `, [docId]);

  return info.changes ?? 0;
}

// ============================================
// Access Resolution
// ============================================

/**
 * Get the effective doc role for a user.
 * Resolution order:
 * 1. Explicit doc permission (takes precedence)
 * 2. Doc's workspace_access setting (if user is workspace member)
 * 3. Workspace role mapping (fallback)
 * 4. Doc creator (implicit owner)
 * 5. null (no access)
 *
 * @param docId - The document ID
 * @param userId - The user ID
 * @param getWorkspaceRole - Function to get user's workspace role
 * @returns The effective role, or null if no access
 */
export async function getEffectiveDocRole(
  docId: string,
  userId: string | null,
  getWorkspaceRole: (workspaceId: string, userId: string) => WorkspaceRole | null | Promise<WorkspaceRole | null>
): Promise<DocRole | null> {
  if (!userId) return null;

  // 1. Check explicit doc permission (takes precedence)
  const docPerm = await getDocPermission(docId, userId);
  if (docPerm) {
    return docPerm.role;
  }

  // 2. Get doc to check workspace, workspace_access, and creator
  const doc = await getDocWithCreatorAndAccess(docId);
  if (!doc) return null;

  // 3. Check workspace_access and workspace role if user is in workspace
  if (doc.workspaceId) {
    const wsRole = await getWorkspaceRole(doc.workspaceId, userId);
    if (wsRole) {
      // User IS a workspace member - check workspace_access setting
      if (doc.workspaceAccess) {
        if (doc.workspaceAccess === 'none') {
          // Explicit 'none' means no workspace-based access - skip to creator check
          // Don't return here, fall through to creator check
        } else if (isValidDocRole(doc.workspaceAccess)) {
          // Use the doc's workspace_access setting
          return doc.workspaceAccess as DocRole;
        }
      } else {
        // No workspace_access set (null) - use workspace role mapping as fallback
        return mapWorkspaceToDocRole(wsRole);
      }
    }
  }

  // 4. Check if user is doc creator (implicit owner)
  if (doc.createdBy === userId) {
    return 'owner';
  }

  return null; // No access
}

/**
 * Get doc with created_by and workspace_access fields for access resolution.
 */
async function getDocWithCreatorAndAccess(docId: string): Promise<{
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
    FROM docs
    WHERE id = ? AND deleted_at IS NULL
  `, [docId]);

  if (!row) return null;

  return {
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    workspaceAccess: row.workspace_access,
  };
}
