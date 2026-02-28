// KACHERI BACKEND/src/store/docLinks.ts
// Document links store for cross-document references and backlinks.

import { db } from '../db';

// ============================================
// Types
// ============================================

export interface DocLink {
  id: number;
  fromDocId: string;
  toDocId: string;
  workspaceId: string | null;
  linkText: string | null;
  position: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// API-friendly version with ISO dates
export interface DocLinkMeta {
  id: number;
  fromDocId: string;
  toDocId: string;
  toDocTitle?: string;     // Included when joining with docs table
  fromDocTitle?: string;   // Included for backlinks
  workspaceId: string | null;
  linkText: string | null;
  position: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Internal row type from SQLite
interface DocLinkRow {
  id: number;
  from_doc_id: string;
  to_doc_id: string;
  workspace_id: string | null;
  link_text: string | null;
  position: number | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

// Extended row with joined doc title
interface DocLinkWithTitleRow extends DocLinkRow {
  to_doc_title?: string;
  from_doc_title?: string;
}

// Create link params
export interface CreateDocLinkParams {
  fromDocId: string;
  toDocId: string;
  createdBy: string;
  workspaceId?: string | null;
  linkText?: string | null;
  position?: number | null;
}

// Sync input type
export interface SyncLinkInput {
  toDocId: string;
  linkText?: string | null;
  position?: number | null;
}

// ============================================
// Row Conversion
// ============================================

function rowToDocLink(row: DocLinkRow): DocLink {
  return {
    id: row.id,
    fromDocId: row.from_doc_id,
    toDocId: row.to_doc_id,
    workspaceId: row.workspace_id,
    linkText: row.link_text,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToDocLinkMeta(row: DocLinkWithTitleRow): DocLinkMeta {
  const meta: DocLinkMeta = {
    id: row.id,
    fromDocId: row.from_doc_id,
    toDocId: row.to_doc_id,
    workspaceId: row.workspace_id,
    linkText: row.link_text,
    position: row.position,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };

  if (row.to_doc_title !== undefined) {
    meta.toDocTitle = row.to_doc_title;
  }
  if (row.from_doc_title !== undefined) {
    meta.fromDocTitle = row.from_doc_title;
  }

  return meta;
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new doc link.
 */
export async function createDocLink(params: CreateDocLinkParams): Promise<DocLinkMeta | null> {
  const {
    fromDocId,
    toDocId,
    createdBy,
    workspaceId = null,
    linkText = null,
    position = null,
  } = params;

  const now = Date.now();

  try {
    const result = await db.run(`
      INSERT INTO doc_links (
        from_doc_id, to_doc_id, workspace_id, link_text, position,
        created_by, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      RETURNING id
    `, [fromDocId, toDocId, workspaceId, linkText, position, createdBy, now, now]);

    const linkId = result.lastInsertRowid as number;
    return getDocLink(linkId);
  } catch (err) {
    console.error('[docLinks] Failed to create doc link:', err);
    return null;
  }
}

/**
 * Get a single doc link by ID.
 */
export async function getDocLink(id: number): Promise<DocLinkMeta | null> {
  try {
    const row = await db.queryOne<DocLinkWithTitleRow>(`
      SELECT dl.id, dl.from_doc_id, dl.to_doc_id, dl.workspace_id,
             dl.link_text, dl.position, dl.created_by,
             dl.created_at, dl.updated_at, dl.deleted_at,
             d.title as to_doc_title
      FROM doc_links dl
      LEFT JOIN docs d ON dl.to_doc_id = d.id
      WHERE dl.id = ? AND dl.deleted_at IS NULL
    `, [id]);

    return row ? rowToDocLinkMeta(row) : null;
  } catch (err) {
    console.error('[docLinks] Failed to get doc link:', err);
    return null;
  }
}

/**
 * List all outgoing links from a document.
 */
export async function listLinksFromDoc(fromDocId: string): Promise<DocLinkMeta[]> {
  try {
    const rows = await db.queryAll<DocLinkWithTitleRow>(`
      SELECT dl.id, dl.from_doc_id, dl.to_doc_id, dl.workspace_id,
             dl.link_text, dl.position, dl.created_by,
             dl.created_at, dl.updated_at, dl.deleted_at,
             d.title as to_doc_title
      FROM doc_links dl
      LEFT JOIN docs d ON dl.to_doc_id = d.id
      WHERE dl.from_doc_id = ? AND dl.deleted_at IS NULL
      ORDER BY dl.position ASC, dl.created_at ASC
    `, [fromDocId]);

    return rows.map(rowToDocLinkMeta);
  } catch (err) {
    console.error('[docLinks] Failed to list links from doc:', err);
    return [];
  }
}

/**
 * List all backlinks (documents that link to this document).
 */
export async function listLinksToDoc(toDocId: string): Promise<DocLinkMeta[]> {
  try {
    const rows = await db.queryAll<DocLinkWithTitleRow>(`
      SELECT dl.id, dl.from_doc_id, dl.to_doc_id, dl.workspace_id,
             dl.link_text, dl.position, dl.created_by,
             dl.created_at, dl.updated_at, dl.deleted_at,
             d.title as from_doc_title
      FROM doc_links dl
      LEFT JOIN docs d ON dl.from_doc_id = d.id
      WHERE dl.to_doc_id = ? AND dl.deleted_at IS NULL
        AND d.deleted_at IS NULL
      ORDER BY dl.created_at DESC
    `, [toDocId]);

    return rows.map(rowToDocLinkMeta);
  } catch (err) {
    console.error('[docLinks] Failed to list links to doc:', err);
    return [];
  }
}

/**
 * Soft delete a doc link.
 */
export async function deleteDocLink(id: number): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE doc_links
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `, [now, now, id]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[docLinks] Failed to delete doc link:', err);
    return false;
  }
}

/**
 * Permanently delete a doc link.
 */
export async function permanentlyDeleteDocLink(id: number): Promise<boolean> {
  try {
    const info = await db.run(`
      DELETE FROM doc_links
      WHERE id = ?
    `, [id]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[docLinks] Failed to permanently delete doc link:', err);
    return false;
  }
}

/**
 * Delete all links from a document (permanent).
 * Used when a document is permanently deleted.
 */
export async function deleteAllLinksFromDoc(fromDocId: string): Promise<number> {
  try {
    const info = await db.run(`
      DELETE FROM doc_links
      WHERE from_doc_id = ?
    `, [fromDocId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[docLinks] Failed to delete all links from doc:', err);
    return 0;
  }
}

/**
 * Delete all links to a document (permanent).
 * Used when a document is permanently deleted.
 */
export async function deleteAllLinksToDoc(toDocId: string): Promise<number> {
  try {
    const info = await db.run(`
      DELETE FROM doc_links
      WHERE to_doc_id = ?
    `, [toDocId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[docLinks] Failed to delete all links to doc:', err);
    return 0;
  }
}

/**
 * Sync all links for a document (called on save).
 * Removes links that are no longer in the document and adds new ones.
 * Returns counts of added/removed links.
 */
export async function syncDocLinks(
  fromDocId: string,
  links: SyncLinkInput[],
  userId: string,
  workspaceId?: string | null
): Promise<{ added: number; removed: number; total: number }> {
  const now = Date.now();

  try {
    // Get existing links
    const existingRows = await db.queryAll<{ id: number; to_doc_id: string; position: number | null }>(`
      SELECT id, to_doc_id, position
      FROM doc_links
      WHERE from_doc_id = ? AND deleted_at IS NULL
    `, [fromDocId]);

    // Create map of existing links keyed by (toDocId, position)
    const existingMap = new Map<string, number>();
    for (const row of existingRows) {
      const key = `${row.to_doc_id}:${row.position ?? 'null'}`;
      existingMap.set(key, row.id);
    }

    // Create set of new links keyed by (toDocId, position)
    const newLinkKeys = new Set<string>();
    for (const link of links) {
      const key = `${link.toDocId}:${link.position ?? 'null'}`;
      newLinkKeys.add(key);
    }

    // Find links to remove (in existing but not in new)
    const toRemove: number[] = [];
    for (const [key, id] of existingMap.entries()) {
      if (!newLinkKeys.has(key)) {
        toRemove.push(id);
      }
    }

    // Find links to add (in new but not in existing)
    const toAdd: SyncLinkInput[] = [];
    for (const link of links) {
      const key = `${link.toDocId}:${link.position ?? 'null'}`;
      if (!existingMap.has(key)) {
        toAdd.push(link);
      }
    }

    // Execute removals and insertions inside a transaction
    await db.transaction(async (tx) => {
      // Soft delete removed links
      if (toRemove.length > 0) {
        const placeholders = toRemove.map(() => '?').join(',');
        await tx.run(`
          UPDATE doc_links
          SET deleted_at = ?, updated_at = ?
          WHERE id IN (${placeholders})
        `, [now, now, ...toRemove]);
      }

      // Insert new links
      for (const link of toAdd) {
        await tx.run(`
          INSERT INTO doc_links (
            from_doc_id, to_doc_id, workspace_id, link_text, position,
            created_by, created_at, updated_at, deleted_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `, [
          fromDocId,
          link.toDocId,
          workspaceId ?? null,
          link.linkText ?? null,
          link.position ?? null,
          userId,
          now,
          now,
        ]);
      }
    });

    return {
      added: toAdd.length,
      removed: toRemove.length,
      total: links.length,
    };
  } catch (err) {
    console.error('[docLinks] Failed to sync doc links:', err);
    return { added: 0, removed: 0, total: 0 };
  }
}

/**
 * Get link count for a document (outgoing).
 */
export async function getLinkCountFromDoc(fromDocId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM doc_links
      WHERE from_doc_id = ? AND deleted_at IS NULL
    `, [fromDocId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error('[docLinks] Failed to get link count:', err);
    return 0;
  }
}

/**
 * Get backlink count for a document.
 */
export async function getBacklinkCount(toDocId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM doc_links dl
      LEFT JOIN docs d ON dl.from_doc_id = d.id
      WHERE dl.to_doc_id = ? AND dl.deleted_at IS NULL
        AND d.deleted_at IS NULL
    `, [toDocId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error('[docLinks] Failed to get backlink count:', err);
    return 0;
  }
}
