// KACHERI BACKEND/src/store/docs.ts
// SQLite-based document store with workspace scoping.
// Migrated from JSON file storage for proper workspace isolation.

import { db } from '../db';
import { randomInt } from 'crypto';
import { deleteAllDocComments } from './comments';
import { deleteAllDocVersions } from './versions';
import { deleteAllDocSuggestions } from './suggestions';
import { softDeleteDocNodes, restoreDocNodes, permanentDeleteDocNodes } from './fsNodes';

// Layout settings for page setup
export interface LayoutSettings {
  pageSize: 'a4' | 'letter' | 'legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;    // mm
    bottom: number;
    left: number;
    right: number;
  };
  header?: {
    enabled: boolean;
    content: string;  // HTML content
    height: number;   // mm
  };
  footer?: {
    enabled: boolean;
    content: string;  // HTML content
    height: number;   // mm
    showPageNumbers: boolean;
  };
}

// Default layout settings
export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  pageSize: 'a4',
  orientation: 'portrait',
  margins: {
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
  },
};

// Workspace access level type for workspace-wide sharing
export type WorkspaceAccessLevel = 'none' | 'viewer' | 'commenter' | 'editor';

export type DocMeta = {
  id: string;
  title: string;
  workspaceId: string | null;
  createdBy: string | null;  // user ID of doc creator (for implicit ownership)
  createdAt: string;   // ISO string for API compatibility
  updatedAt: string;   // ISO string for API compatibility
  layoutSettings?: LayoutSettings;  // page layout configuration
  workspaceAccess?: WorkspaceAccessLevel | null;  // workspace-wide access level
};

// Internal row type from SQLite
interface DocRow {
  id: string;
  title: string;
  workspace_id: string | null;
  created_by: string | null;  // user ID of doc creator
  created_at: number;  // Unix timestamp ms
  updated_at: number;  // Unix timestamp ms
  deleted_at: number | null;  // NULL = not deleted, timestamp = soft-deleted
  layout_settings: string | null;  // JSON string of LayoutSettings
  workspace_access: string | null;  // 'none' | 'viewer' | 'commenter' | 'editor' | null
}

// Extended type for trash items
export type TrashedDocMeta = DocMeta & {
  deletedAt: string;  // ISO string
};

/**
 * ESM-safe ID generator (replaces nanoid which is ESM-only).
 * Matches the old shape: 12 chars from 0-9a-z.
 */
const ALPHABET = '1234567890abcdefghijklmnopqrstuvwxyz';
function genId12(): string {
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Parse layout_settings JSON string safely */
function parseLayoutSettings(json: string | null): LayoutSettings | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as LayoutSettings;
  } catch {
    return undefined;
  }
}

/** Parse workspace_access string safely */
function parseWorkspaceAccess(value: string | null): WorkspaceAccessLevel | null {
  if (!value) return null;
  if (['none', 'viewer', 'commenter', 'editor'].includes(value)) {
    return value as WorkspaceAccessLevel;
  }
  return null;
}

/** Convert SQLite row to API-friendly DocMeta */
function rowToDoc(row: DocRow): DocMeta {
  return {
    id: row.id,
    title: row.title,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    layoutSettings: parseLayoutSettings(row.layout_settings),
    workspaceAccess: parseWorkspaceAccess(row.workspace_access),
  };
}

/**
 * List all non-deleted documents, optionally filtered by workspace.
 * If workspaceId is provided, only returns docs in that workspace.
 * If workspaceId is null/undefined, returns all docs (for backward compatibility).
 */
export function listDocs(workspaceId?: string | null): DocMeta[] {
  let rows: DocRow[];

  if (workspaceId) {
    rows = db.prepare(`
      SELECT id, title, workspace_id, created_by, created_at, updated_at, deleted_at, layout_settings, workspace_access
      FROM docs
      WHERE workspace_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all(workspaceId) as DocRow[];
  } else {
    // Return all non-deleted docs (backward compatibility for unscoped queries)
    rows = db.prepare(`
      SELECT id, title, workspace_id, created_by, created_at, updated_at, deleted_at, layout_settings, workspace_access
      FROM docs
      WHERE deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all() as DocRow[];
  }

  return rows.map(rowToDoc);
}

/**
 * Get a single non-deleted document by ID.
 * Returns null if not found or if deleted.
 */
export function getDoc(id: string): DocMeta | null {
  const row = db.prepare(`
    SELECT id, title, workspace_id, created_by, created_at, updated_at, deleted_at, layout_settings, workspace_access
    FROM docs
    WHERE id = ? AND deleted_at IS NULL
  `).get(id) as DocRow | undefined;

  return row ? rowToDoc(row) : null;
}

/**
 * Get a document by ID, including deleted ones (for trash operations).
 */
export function getDocIncludingDeleted(id: string): (DocMeta & { deletedAt: string | null }) | null {
  const row = db.prepare(`
    SELECT id, title, workspace_id, created_by, created_at, updated_at, deleted_at, layout_settings, workspace_access
    FROM docs
    WHERE id = ?
  `).get(id) as DocRow | undefined;

  if (!row) return null;

  return {
    ...rowToDoc(row),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  };
}

/**
 * Create a new document.
 * If workspaceId is provided, the doc is scoped to that workspace.
 * If createdBy is provided, it's stored for implicit ownership.
 */
export function createDoc(title: string, workspaceId?: string | null, createdBy?: string | null): DocMeta {
  const id = genId12();
  const now = Date.now();

  db.prepare(`
    INSERT INTO docs (id, title, workspace_id, created_by, created_at, updated_at)
    VALUES (@id, @title, @workspace_id, @created_by, @created_at, @updated_at)
  `).run({
    id,
    title: title.trim() || 'Untitled',
    workspace_id: workspaceId || null,
    created_by: createdBy || null,
    created_at: now,
    updated_at: now,
  });

  return {
    id,
    title: title.trim() || 'Untitled',
    workspaceId: workspaceId || null,
    createdBy: createdBy || null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

/**
 * Update a document's title.
 * Returns the updated doc, or null if not found.
 */
export function updateDocTitle(id: string, title: string): DocMeta | null {
  const now = Date.now();

  const info = db.prepare(`
    UPDATE docs
    SET title = @title, updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: title.trim(),
    updated_at: now,
  });

  if (info.changes === 0) {
    return null;
  }

  return getDoc(id);
}

/**
 * Update a document's workspace assignment.
 * Used when moving a doc to a different workspace.
 */
export function updateDocWorkspace(id: string, workspaceId: string | null): DocMeta | null {
  const now = Date.now();

  const info = db.prepare(`
    UPDATE docs
    SET workspace_id = @workspace_id, updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    workspace_id: workspaceId,
    updated_at: now,
  });

  if (info.changes === 0) {
    return null;
  }

  return getDoc(id);
}

/**
 * Update a document's layout settings.
 * Returns the updated doc, or null if not found.
 */
export function updateDocLayout(id: string, layoutSettings: LayoutSettings): DocMeta | null {
  const now = Date.now();

  const info = db.prepare(`
    UPDATE docs
    SET layout_settings = @layout_settings, updated_at = @updated_at
    WHERE id = @id AND deleted_at IS NULL
  `).run({
    id,
    layout_settings: JSON.stringify(layoutSettings),
    updated_at: now,
  });

  if (info.changes === 0) {
    return null;
  }

  return getDoc(id);
}

/**
 * Get a document's layout settings, with defaults if not set.
 */
export function getDocLayout(id: string): LayoutSettings | null {
  const doc = getDoc(id);
  if (!doc) return null;
  return doc.layoutSettings ?? DEFAULT_LAYOUT_SETTINGS;
}

/**
 * Update a document's workspace-wide access setting.
 * This sets the default access level for all workspace members.
 * Returns the updated doc, or null if not found.
 */
export function updateDocWorkspaceAccess(
  id: string,
  workspaceAccess: WorkspaceAccessLevel | null
): DocMeta | null {
  const now = Date.now();

  // Validate the value
  if (workspaceAccess !== null && !['none', 'viewer', 'commenter', 'editor'].includes(workspaceAccess)) {
    return null;
  }

  const info = db.prepare(`
    UPDATE docs
    SET workspace_access = @workspace_access, updated_at = @updated_at
    WHERE id = @id AND deleted_at IS NULL
  `).run({
    id,
    workspace_access: workspaceAccess,
    updated_at: now,
  });

  if (info.changes === 0) {
    return null;
  }

  return getDoc(id);
}

/**
 * Soft-delete a document by ID (move to trash).
 * Also soft-deletes any fs_nodes referencing this doc.
 * Returns true if soft-deleted, false if not found or already deleted.
 */
export function deleteDoc(id: string): boolean {
  const now = Date.now();

  const info = db.prepare(`
    UPDATE docs
    SET deleted_at = @deleted_at, updated_at = @updated_at
    WHERE id = @id AND deleted_at IS NULL
  `).run({
    id,
    deleted_at: now,
    updated_at: now,
  });

  if ((info.changes ?? 0) > 0) {
    // Also soft-delete any fs_nodes referencing this doc
    softDeleteDocNodes(id);
    return true;
  }

  return false;
}

/**
 * Restore a soft-deleted document from trash.
 * Also restores any fs_nodes referencing this doc.
 * Returns the restored doc, or null if not found or not deleted.
 */
export function restoreDoc(id: string): DocMeta | null {
  const now = Date.now();

  const info = db.prepare(`
    UPDATE docs
    SET deleted_at = NULL, updated_at = @updated_at
    WHERE id = @id AND deleted_at IS NOT NULL
  `).run({
    id,
    updated_at: now,
  });

  if (info.changes === 0) {
    return null;
  }

  // Also restore any fs_nodes referencing this doc
  restoreDocNodes(id);

  return getDoc(id);
}

/**
 * Permanently delete a document (remove from database entirely).
 * Only works on already soft-deleted docs (in trash).
 * Cascades: deletes comments, versions, suggestions, and fs_nodes.
 * Returns true if permanently deleted, false if not found or not in trash.
 */
export function permanentDeleteDoc(id: string): boolean {
  // First check if the doc exists and is in trash
  const doc = db.prepare(`
    SELECT 1 FROM docs WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1
  `).get(id);

  if (!doc) {
    return false;
  }

  // Delete associated data before deleting the document
  deleteAllDocComments(id);
  deleteAllDocVersions(id);
  deleteAllDocSuggestions(id);
  permanentDeleteDocNodes(id);

  // Now delete the document itself
  const info = db.prepare(`
    DELETE FROM docs WHERE id = ? AND deleted_at IS NOT NULL
  `).run(id);

  return (info.changes ?? 0) > 0;
}

/**
 * List soft-deleted documents in trash, optionally filtered by workspace.
 */
export function listTrash(workspaceId?: string | null): TrashedDocMeta[] {
  let rows: DocRow[];

  if (workspaceId) {
    rows = db.prepare(`
      SELECT id, title, workspace_id, created_by, created_at, updated_at, deleted_at, layout_settings, workspace_access
      FROM docs
      WHERE workspace_id = ? AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `).all(workspaceId) as DocRow[];
  } else {
    rows = db.prepare(`
      SELECT id, title, workspace_id, created_by, created_at, updated_at, deleted_at, layout_settings, workspace_access
      FROM docs
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `).all() as DocRow[];
  }

  return rows.map(row => ({
    ...rowToDoc(row),
    deletedAt: new Date(row.deleted_at!).toISOString(),
  }));
}

/**
 * Check if a non-deleted document exists.
 */
export function docExists(id: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM docs WHERE id = ? AND deleted_at IS NULL LIMIT 1
  `).get(id);

  return !!row;
}

/**
 * Migrate docs from legacy JSON file to SQLite.
 * This is idempotent - it skips docs that already exist.
 * Call this on startup if needed.
 */
export async function migrateFromJson(jsonPath: string): Promise<{ migrated: number; skipped: number }> {
  const { promises: fs } = await import('fs');

  let migrated = 0;
  let skipped = 0;

  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    const docs = JSON.parse(raw) as Array<{
      id: string;
      title: string;
      createdAt?: string;
      updatedAt?: string;
    }>;

    if (!Array.isArray(docs)) {
      return { migrated: 0, skipped: 0 };
    }

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO docs (id, title, workspace_id, created_at, updated_at)
      VALUES (@id, @title, NULL, @created_at, @updated_at)
    `);

    for (const doc of docs) {
      const createdAt = doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now();
      const updatedAt = doc.updatedAt ? new Date(doc.updatedAt).getTime() : createdAt;

      const info = insertStmt.run({
        id: doc.id,
        title: doc.title || 'Untitled',
        created_at: createdAt,
        updated_at: updatedAt,
      });

      if (info.changes > 0) {
        migrated++;
      } else {
        skipped++;
      }
    }
  } catch (err: any) {
    // File doesn't exist or is invalid - that's fine
    if (err.code !== 'ENOENT') {
      console.warn('[docs] Migration warning:', err.message);
    }
  }

  return { migrated, skipped };
}

// ============================================
// DEPRECATED: Legacy async API for compatibility
// These wrap the sync functions for existing callers
// ============================================

/** @deprecated Use listDocs() instead */
export async function readDocs(): Promise<DocMeta[]> {
  return listDocs();
}

/** @deprecated Use the sync version instead */
export async function writeDocs(_docs: DocMeta[]): Promise<void> {
  // No-op: SQLite handles persistence
  console.warn('[docs] writeDocs() is deprecated - SQLite handles persistence');
}
