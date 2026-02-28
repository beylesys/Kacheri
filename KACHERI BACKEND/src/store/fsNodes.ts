// KACHERI BACKEND/src/store/fsNodes.ts
// Data-access layer for the file manager tree (folders + docs).
// Now with workspace scoping support.

import { db } from "../db";

export type FileNodeKind = "folder" | "doc";

export interface FileNodeRow {
  id: number;
  parent_id: number | null;
  kind: string;
  name: string;
  doc_id: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: number | null;  // NULL = not deleted, timestamp = soft-deleted
}

export interface FileNode {
  id: string;             // "node-<numeric id>"
  parentId: string | null;
  kind: FileNodeKind;
  name: string;
  docId: string | null;
  hasChildren: boolean;
}

// Extended type for trash items
export interface TrashedFileNode extends FileNode {
  deletedAt: string;  // ISO string
}

const ROOT_SENTINEL_ID = "root";

/**
 * Ensure there is a root folder for the given workspace and return its numeric id.
 * Each workspace gets its own root folder (workspace_id-scoped).
 * If workspaceId is null, returns the global unscoped root.
 */
export async function ensureRootFolderId(workspaceId?: string | null): Promise<number> {
  // Check for existing non-deleted root in this workspace
  const existing = workspaceId
    ? await db.queryOne<{ id?: number }>(
        `SELECT id FROM fs_nodes WHERE parent_id IS NULL AND workspace_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
        [workspaceId]
      )
    : await db.queryOne<{ id?: number }>(
        `SELECT id FROM fs_nodes WHERE parent_id IS NULL AND workspace_id IS NULL AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
        []
      );

  if (existing && typeof existing.id === "number") {
    return existing.id;
  }

  // Create a new root folder for this workspace
  const now = new Date().toISOString();
  const info = await db.run(
    `INSERT INTO fs_nodes (parent_id, kind, name, doc_id, workspace_id, created_at, updated_at)
     VALUES (NULL, 'folder', 'Root', NULL, ?, ?, ?)
     RETURNING id`,
    [workspaceId || null, now, now]
  );

  return Number(info.lastInsertRowid || 0);
}

function encodeId(id: number): string {
  return `node-${id}`;
}

function decodeId(id: string): number {
  const m = /^node-(\d+)$/.exec(id);
  if (!m) {
    throw new Error(`Invalid fs node id: ${id}`);
  }
  return Number(m[1]);
}

/**
 * Convert a public parentId ("node-123" or "root" or null/undefined)
 * into the numeric id used in fs_nodes.parent_id.
 */
async function resolveParentNumericId(parentId?: string | null, workspaceId?: string | null): Promise<number> {
  if (!parentId || parentId === ROOT_SENTINEL_ID) {
    return ensureRootFolderId(workspaceId);
  }
  return decodeId(parentId);
}

async function getNodeRowById(id: number, includeDeleted = false): Promise<FileNodeRow | null> {
  const row = includeDeleted
    ? await db.queryOne<FileNodeRow>(
        `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
         FROM fs_nodes
         WHERE id = ?`,
        [id]
      )
    : await db.queryOne<FileNodeRow>(
        `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
         FROM fs_nodes
         WHERE id = ? AND deleted_at IS NULL`,
        [id]
      );

  return row ?? null;
}

/**
 * Given a set of node ids, return a map of "id -> number of direct non-deleted children".
 */
async function computeHasChildren(ids: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.queryAll<{ pid: number; cnt: number }>(
    `SELECT parent_id AS pid, COUNT(*) AS cnt
     FROM fs_nodes
     WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL
     GROUP BY parent_id`,
    ids
  );

  for (const r of rows) {
    map.set(r.pid, r.cnt);
  }
  return map;
}

function rowToNode(
  row: FileNodeRow,
  childCountMap: Map<number, number>
): FileNode {
  const hasChildren = (childCountMap.get(row.id) ?? 0) > 0;
  const parentId =
    row.parent_id == null ? null : encodeId(row.parent_id);

  return {
    id: encodeId(row.id),
    parentId,
    kind: row.kind as FileNodeKind,
    name: row.name,
    docId: row.doc_id ?? null,
    hasChildren,
  };
}

/**
 * List non-deleted children of a given parent node (or the root folder if omitted).
 * Now workspace-scoped.
 * Excludes doc nodes whose referenced doc is deleted (to prevent orphaned entries).
 */
export async function listChildren(parentId?: string | null, workspaceId?: string | null): Promise<FileNode[]> {
  const parentNumericId = await resolveParentNumericId(parentId, workspaceId);

  // Use LEFT JOIN to filter out doc nodes whose referenced doc is deleted
  const rows = await db.queryAll<FileNodeRow>(
    `SELECT f.id, f.parent_id, f.kind, f.name, f.doc_id, f.workspace_id, f.created_at, f.updated_at, f.deleted_at
     FROM fs_nodes f
     LEFT JOIN docs d ON f.kind = 'doc' AND f.doc_id = d.id
     WHERE f.parent_id = ? AND f.deleted_at IS NULL
       AND (f.kind != 'doc' OR (d.id IS NOT NULL AND d.deleted_at IS NULL))
     ORDER BY f.kind DESC, f.name COLLATE NOCASE ASC, f.id ASC`,
    [parentNumericId]
  );

  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const childCounts = await computeHasChildren(ids);

  return rows.map((r) => rowToNode(r, childCounts));
}

/** Create a folder under the given parent (or root, if omitted). */
export async function createFolder(opts: {
  parentId?: string | null;
  name: string;
  workspaceId?: string | null;
}): Promise<FileNode> {
  const parentNumericId = await resolveParentNumericId(opts.parentId, opts.workspaceId);
  const name = opts.name.trim();
  const now = new Date().toISOString();

  const info = await db.run(
    `INSERT INTO fs_nodes (parent_id, kind, name, doc_id, workspace_id, created_at, updated_at)
     VALUES (?, 'folder', ?, NULL, ?, ?, ?)
     RETURNING id`,
    [parentNumericId, name, opts.workspaceId || null, now, now]
  );

  const id = Number(info.lastInsertRowid || 0);
  const row = await getNodeRowById(id);
  if (!row) {
    throw new Error("Failed to read back created folder node");
  }
  const childCounts = await computeHasChildren([row.id]);
  return rowToNode(row, childCounts);
}

/**
 * Attach or update a doc node.
 *
 * - If there is already a doc node for this docId:
 *   - If parentId is provided, we MOVE it under that parent.
 *   - If parentId is omitted, we keep the existing parent and just update the name.
 * - If there is no doc node yet:
 *   - We create one under the given parentId, or under the root folder if parentId is omitted.
 */
export async function attachDocNode(
  docId: string,
  name: string,
  parentId?: string | null,
  workspaceId?: string | null
): Promise<FileNode> {
  const now = new Date().toISOString();
  const trimmedName = name.trim();

  const existing = await db.queryOne<FileNodeRow>(
    `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at
     FROM fs_nodes
     WHERE kind = 'doc' AND doc_id = ?
     ORDER BY id ASC
     LIMIT 1`,
    [docId]
  );

  if (existing) {
    const parentNumericId =
      parentId === undefined
        ? (existing.parent_id ?? await ensureRootFolderId(workspaceId))
        : await resolveParentNumericId(parentId, workspaceId);

    await db.run(
      `UPDATE fs_nodes
       SET parent_id = ?, name = ?, workspace_id = ?, updated_at = ?
       WHERE id = ?`,
      [
        parentNumericId,
        trimmedName,
        workspaceId || existing.workspace_id || null,
        now,
        existing.id,
      ]
    );

    const row = await getNodeRowById(existing.id);
    if (!row) throw new Error("Doc node disappeared after update");
    const childCounts = await computeHasChildren([row.id]);
    return rowToNode(row, childCounts);
  }

  const parentNumericId =
    parentId === undefined
      ? await ensureRootFolderId(workspaceId)
      : await resolveParentNumericId(parentId, workspaceId);

  const info = await db.run(
    `INSERT INTO fs_nodes (parent_id, kind, name, doc_id, workspace_id, created_at, updated_at)
     VALUES (?, 'doc', ?, ?, ?, ?, ?)
     RETURNING id`,
    [parentNumericId, trimmedName, docId, workspaceId || null, now, now]
  );

  const id = Number(info.lastInsertRowid || 0);
  const row = await getNodeRowById(id);
  if (!row) throw new Error("Failed to read back created doc node");
  const childCounts = await computeHasChildren([row.id]);
  return rowToNode(row, childCounts);
}

/** Rename all nodes attached to a given doc id. */
export async function renameDocNode(docId: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `UPDATE fs_nodes SET name = ?, updated_at = ? WHERE kind = 'doc' AND doc_id = ?`,
    [name.trim(), now, docId]
  );
}

/** Remove any node(s) attached to the given doc id. */
export async function deleteDocNode(docId: string): Promise<void> {
  await db.run(
    `DELETE FROM fs_nodes WHERE kind = 'doc' AND doc_id = ?`,
    [docId]
  );
}

/** Soft-delete any node(s) attached to the given doc id (move to trash). */
export async function softDeleteDocNodes(docId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `UPDATE fs_nodes SET deleted_at = ?, updated_at = ? WHERE kind = 'doc' AND doc_id = ? AND deleted_at IS NULL`,
    [now, now, docId]
  );
}

/** Restore soft-deleted node(s) attached to the given doc id (restore from trash). */
export async function restoreDocNodes(docId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `UPDATE fs_nodes SET deleted_at = NULL, updated_at = ? WHERE kind = 'doc' AND doc_id = ? AND deleted_at IS NOT NULL`,
    [now, docId]
  );
}

/** Permanently delete node(s) attached to the given doc id (only if already soft-deleted). */
export async function permanentDeleteDocNodes(docId: string): Promise<void> {
  await db.run(
    `DELETE FROM fs_nodes WHERE kind = 'doc' AND doc_id = ? AND deleted_at IS NOT NULL`,
    [docId]
  );
}

/** Rename a node by id. Returns the updated node or null if not found. */
export async function renameNode(nodeId: string, name: string): Promise<FileNode | null> {
  const id = decodeId(nodeId);
  const now = new Date().toISOString();

  const row = await getNodeRowById(id);
  if (!row) return null;

  await db.run(
    `UPDATE fs_nodes SET name = ?, updated_at = ? WHERE id = ?`,
    [name.trim(), now, id]
  );

  const updated = await getNodeRowById(id);
  if (!updated) return null;
  const childCounts = await computeHasChildren([updated.id]);
  return rowToNode(updated, childCounts);
}

/** Move a node to a new parent. Returns the updated node or null if not found. */
export async function moveNode(
  nodeId: string,
  parentId: string | null,
  workspaceId?: string | null
): Promise<FileNode | null> {
  const id = decodeId(nodeId);
  const parentNumericId = parentId
    ? await resolveParentNumericId(parentId, workspaceId)
    : await ensureRootFolderId(workspaceId);
  const now = new Date().toISOString();

  const row = await getNodeRowById(id);
  if (!row) return null;

  if (row.parent_id === parentNumericId) {
    const childCounts = await computeHasChildren([row.id]);
    return rowToNode(row, childCounts);
  }

  await db.run(
    `UPDATE fs_nodes SET parent_id = ?, updated_at = ? WHERE id = ?`,
    [parentNumericId, now, id]
  );

  const updated = await getNodeRowById(id);
  if (!updated) return null;
  const childCounts = await computeHasChildren([updated.id]);
  return rowToNode(updated, childCounts);
}

/**
 * Helper used by the delete route: look up a node and the number of
 * direct children it currently has. Returns null if the node does not exist.
 */
export interface NodeWithChildCount {
  node: FileNode;
  childCount: number;
}

export async function getNodeWithChildCount(nodeId: string): Promise<NodeWithChildCount | null> {
  const id = decodeId(nodeId);
  const row = await getNodeRowById(id);
  if (!row) return null;

  const childCounts = await computeHasChildren([row.id]);
  const node = rowToNode(row, childCounts);
  const childCount = childCounts.get(row.id) ?? 0;

  return { node, childCount };
}

/**
 * Soft-delete a node (move to trash). Returns:
 * - true if the node was soft-deleted;
 * - false if it did not exist, already deleted, or still has children.
 *
 * NOTE: Callers that want to distinguish "not found" vs "folder not empty"
 * should use getNodeWithChildCount(...) first.
 */
export async function deleteNode(nodeId: string): Promise<boolean> {
  const id = decodeId(nodeId);

  const row = await getNodeRowById(id);
  if (!row) return false;

  // Check for non-deleted children
  const childCountRow = await db.queryOne<{ c?: number }>(
    `SELECT COUNT(*) AS c FROM fs_nodes WHERE parent_id = ? AND deleted_at IS NULL`,
    [id]
  );
  const childCount = Number(childCountRow?.c || 0);
  if (childCount > 0) {
    // Safety guard: do not delete non-empty folders.
    return false;
  }

  const now = Date.now();
  const info = await db.run(
    `UPDATE fs_nodes SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    [now, new Date(now).toISOString(), id]
  );

  return Number(info.changes || 0) > 0;
}

/**
 * Restore a soft-deleted node from trash.
 * Returns the restored node, or null if not found or not deleted.
 */
export async function restoreNode(nodeId: string): Promise<FileNode | null> {
  const id = decodeId(nodeId);

  const row = await getNodeRowById(id, true);  // include deleted
  if (!row || !row.deleted_at) return null;

  const now = new Date().toISOString();
  await db.run(
    `UPDATE fs_nodes SET deleted_at = NULL, updated_at = ? WHERE id = ?`,
    [now, id]
  );

  const updated = await getNodeRowById(id);
  if (!updated) return null;
  const childCounts = await computeHasChildren([updated.id]);
  return rowToNode(updated, childCounts);
}

/**
 * Permanently delete a node (remove from database entirely).
 * Only works on already soft-deleted nodes (in trash).
 * Returns true if permanently deleted, false if not found or not in trash.
 */
export async function permanentDeleteNode(nodeId: string): Promise<boolean> {
  const id = decodeId(nodeId);

  const info = await db.run(
    `DELETE FROM fs_nodes WHERE id = ? AND deleted_at IS NOT NULL`,
    [id]
  );

  return (info.changes ?? 0) > 0;
}

/**
 * List soft-deleted nodes in trash, optionally filtered by workspace.
 * Excludes kind='doc' entries since those are shown via docs trash (to avoid duplicates).
 */
export async function listTrash(workspaceId?: string | null): Promise<TrashedFileNode[]> {
  let rows: FileNodeRow[];

  if (workspaceId) {
    rows = await db.queryAll<FileNodeRow>(
      `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
       FROM fs_nodes
       WHERE workspace_id = ? AND deleted_at IS NOT NULL AND kind != 'doc'
       ORDER BY deleted_at DESC`,
      [workspaceId]
    );
  } else {
    rows = await db.queryAll<FileNodeRow>(
      `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
       FROM fs_nodes
       WHERE deleted_at IS NOT NULL AND kind != 'doc'
       ORDER BY deleted_at DESC`,
      []
    );
  }

  // For trash items, we compute hasChildren differently (include deleted children)
  const childCounts = new Map<number, number>();

  return rows.map(row => ({
    ...rowToNode(row, childCounts),
    deletedAt: new Date(row.deleted_at!).toISOString(),
  }));
}
