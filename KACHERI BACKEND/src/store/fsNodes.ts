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
export function ensureRootFolderId(workspaceId?: string | null): number {
  // Check for existing non-deleted root in this workspace
  const existing = db
    .prepare(
      workspaceId
        ? `SELECT id FROM fs_nodes WHERE parent_id IS NULL AND workspace_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`
        : `SELECT id FROM fs_nodes WHERE parent_id IS NULL AND workspace_id IS NULL AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`
    )
    .get(workspaceId ? workspaceId : undefined) as { id?: number } | undefined;

  if (existing && typeof existing.id === "number") {
    return existing.id;
  }

  // Create a new root folder for this workspace
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO fs_nodes (parent_id, kind, name, doc_id, workspace_id, created_at, updated_at)
       VALUES (NULL, 'folder', 'Root', NULL, @workspace_id, @created_at, @updated_at)`
    )
    .run({ workspace_id: workspaceId || null, created_at: now, updated_at: now });

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
function resolveParentNumericId(parentId?: string | null, workspaceId?: string | null): number {
  if (!parentId || parentId === ROOT_SENTINEL_ID) {
    return ensureRootFolderId(workspaceId);
  }
  return decodeId(parentId);
}

function getNodeRowById(id: number, includeDeleted = false): FileNodeRow | null {
  const row = db
    .prepare(
      includeDeleted
        ? `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
           FROM fs_nodes
           WHERE id = ?`
        : `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
           FROM fs_nodes
           WHERE id = ? AND deleted_at IS NULL`
    )
    .get(id) as FileNodeRow | undefined;

  return row ?? null;
}

/**
 * Given a set of node ids, return a map of "id -> number of direct non-deleted children".
 */
function computeHasChildren(ids: number[]): Map<number, number> {
  const map = new Map<number, number>();
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT parent_id AS pid, COUNT(*) AS cnt
       FROM fs_nodes
       WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL
       GROUP BY parent_id`
    )
    .all(...ids) as Array<{ pid: number; cnt: number }>;

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
export function listChildren(parentId?: string | null, workspaceId?: string | null): FileNode[] {
  const parentNumericId = resolveParentNumericId(parentId, workspaceId);

  // Use LEFT JOIN to filter out doc nodes whose referenced doc is deleted
  const rows = db
    .prepare(
      `SELECT f.id, f.parent_id, f.kind, f.name, f.doc_id, f.workspace_id, f.created_at, f.updated_at, f.deleted_at
       FROM fs_nodes f
       LEFT JOIN docs d ON f.kind = 'doc' AND f.doc_id = d.id
       WHERE f.parent_id = ? AND f.deleted_at IS NULL
         AND (f.kind != 'doc' OR (d.id IS NOT NULL AND d.deleted_at IS NULL))
       ORDER BY f.kind DESC, f.name COLLATE NOCASE ASC, f.id ASC`
    )
    .all(parentNumericId) as FileNodeRow[];

  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const childCounts = computeHasChildren(ids);

  return rows.map((r) => rowToNode(r, childCounts));
}

/** Create a folder under the given parent (or root, if omitted). */
export function createFolder(opts: {
  parentId?: string | null;
  name: string;
  workspaceId?: string | null;
}): FileNode {
  const parentNumericId = resolveParentNumericId(opts.parentId, opts.workspaceId);
  const name = opts.name.trim();
  const now = new Date().toISOString();

  const info = db
    .prepare(
      `INSERT INTO fs_nodes (parent_id, kind, name, doc_id, workspace_id, created_at, updated_at)
       VALUES (@parent_id, 'folder', @name, NULL, @workspace_id, @created_at, @updated_at)`
    )
    .run({
      parent_id: parentNumericId,
      name,
      workspace_id: opts.workspaceId || null,
      created_at: now,
      updated_at: now,
    });

  const id = Number(info.lastInsertRowid || 0);
  const row = getNodeRowById(id);
  if (!row) {
    throw new Error("Failed to read back created folder node");
  }
  const childCounts = computeHasChildren([row.id]);
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
export function attachDocNode(
  docId: string,
  name: string,
  parentId?: string | null,
  workspaceId?: string | null
): FileNode {
  const now = new Date().toISOString();
  const trimmedName = name.trim();

  const existing = db
    .prepare(
      `SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at
       FROM fs_nodes
       WHERE kind = 'doc' AND doc_id = ?
       ORDER BY id ASC
       LIMIT 1`
    )
    .get(docId) as FileNodeRow | undefined;

  if (existing) {
    const parentNumericId =
      parentId === undefined
        ? (existing.parent_id ?? ensureRootFolderId(workspaceId))
        : resolveParentNumericId(parentId, workspaceId);

    db.prepare(
      `UPDATE fs_nodes
       SET parent_id = @parent_id, name = @name, workspace_id = @workspace_id, updated_at = @updated_at
       WHERE id = @id`
    ).run({
      id: existing.id,
      parent_id: parentNumericId,
      name: trimmedName,
      workspace_id: workspaceId || existing.workspace_id || null,
      updated_at: now,
    });

    const row = getNodeRowById(existing.id);
    if (!row) throw new Error("Doc node disappeared after update");
    const childCounts = computeHasChildren([row.id]);
    return rowToNode(row, childCounts);
  }

  const parentNumericId =
    parentId === undefined
      ? ensureRootFolderId(workspaceId)
      : resolveParentNumericId(parentId, workspaceId);

  const info = db
    .prepare(
      `INSERT INTO fs_nodes (parent_id, kind, name, doc_id, workspace_id, created_at, updated_at)
       VALUES (@parent_id, 'doc', @name, @doc_id, @workspace_id, @created_at, @updated_at)`
    )
    .run({
      parent_id: parentNumericId,
      name: trimmedName,
      doc_id: docId,
      workspace_id: workspaceId || null,
      created_at: now,
      updated_at: now,
    });

  const id = Number(info.lastInsertRowid || 0);
  const row = getNodeRowById(id);
  if (!row) throw new Error("Failed to read back created doc node");
  const childCounts = computeHasChildren([row.id]);
  return rowToNode(row, childCounts);
}

/** Rename all nodes attached to a given doc id. */
export function renameDocNode(docId: string, name: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE fs_nodes
     SET name = @name, updated_at = @updated_at
     WHERE kind = 'doc' AND doc_id = @doc_id`
  ).run({ name: name.trim(), updated_at: now, doc_id: docId });
}

/** Remove any node(s) attached to the given doc id. */
export function deleteDocNode(docId: string): void {
  db.prepare(
    `DELETE FROM fs_nodes
     WHERE kind = 'doc' AND doc_id = ?`
  ).run(docId);
}

/** Soft-delete any node(s) attached to the given doc id (move to trash). */
export function softDeleteDocNodes(docId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE fs_nodes
     SET deleted_at = @deleted_at, updated_at = @updated_at
     WHERE kind = 'doc' AND doc_id = @doc_id AND deleted_at IS NULL`
  ).run({ deleted_at: now, updated_at: now, doc_id: docId });
}

/** Restore soft-deleted node(s) attached to the given doc id (restore from trash). */
export function restoreDocNodes(docId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE fs_nodes
     SET deleted_at = NULL, updated_at = @updated_at
     WHERE kind = 'doc' AND doc_id = @doc_id AND deleted_at IS NOT NULL`
  ).run({ updated_at: now, doc_id: docId });
}

/** Permanently delete node(s) attached to the given doc id (only if already soft-deleted). */
export function permanentDeleteDocNodes(docId: string): void {
  db.prepare(
    `DELETE FROM fs_nodes
     WHERE kind = 'doc' AND doc_id = ? AND deleted_at IS NOT NULL`
  ).run(docId);
}

/** Rename a node by id. Returns the updated node or null if not found. */
export function renameNode(nodeId: string, name: string): FileNode | null {
  const id = decodeId(nodeId);
  const now = new Date().toISOString();

  const row = getNodeRowById(id);
  if (!row) return null;

  db.prepare(
    `UPDATE fs_nodes
     SET name = @name, updated_at = @updated_at
     WHERE id = @id`
  ).run({ id, name: name.trim(), updated_at: now });

  const updated = getNodeRowById(id);
  if (!updated) return null;
  const childCounts = computeHasChildren([updated.id]);
  return rowToNode(updated, childCounts);
}

/** Move a node to a new parent. Returns the updated node or null if not found. */
export function moveNode(
  nodeId: string,
  parentId: string | null,
  workspaceId?: string | null
): FileNode | null {
  const id = decodeId(nodeId);
  const parentNumericId = parentId
    ? resolveParentNumericId(parentId, workspaceId)
    : ensureRootFolderId(workspaceId);
  const now = new Date().toISOString();

  const row = getNodeRowById(id);
  if (!row) return null;

  if (row.parent_id === parentNumericId) {
    const childCounts = computeHasChildren([row.id]);
    return rowToNode(row, childCounts);
  }

  db.prepare(
    `UPDATE fs_nodes
     SET parent_id = @parent_id, updated_at = @updated_at
     WHERE id = @id`
  ).run({ id, parent_id: parentNumericId, updated_at: now });

  const updated = getNodeRowById(id);
  if (!updated) return null;
  const childCounts = computeHasChildren([updated.id]);
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

export function getNodeWithChildCount(nodeId: string): NodeWithChildCount | null {
  const id = decodeId(nodeId);
  const row = getNodeRowById(id);
  if (!row) return null;

  const childCounts = computeHasChildren([row.id]);
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
export function deleteNode(nodeId: string): boolean {
  const id = decodeId(nodeId);

  const row = getNodeRowById(id);
  if (!row) return false;

  // Check for non-deleted children
  const childCountRow = db
    .prepare(`SELECT COUNT(*) AS c FROM fs_nodes WHERE parent_id = ? AND deleted_at IS NULL`)
    .get(id) as { c?: number } | undefined;
  const childCount = Number(childCountRow?.c || 0);
  if (childCount > 0) {
    // Safety guard: do not delete non-empty folders.
    return false;
  }

  const now = Date.now();
  const info = db.prepare(`
    UPDATE fs_nodes
    SET deleted_at = @deleted_at, updated_at = @updated_at
    WHERE id = @id AND deleted_at IS NULL
  `).run({
    id,
    deleted_at: now,
    updated_at: new Date(now).toISOString(),
  });

  return Number(info.changes || 0) > 0;
}

/**
 * Restore a soft-deleted node from trash.
 * Returns the restored node, or null if not found or not deleted.
 */
export function restoreNode(nodeId: string): FileNode | null {
  const id = decodeId(nodeId);

  const row = getNodeRowById(id, true);  // include deleted
  if (!row || !row.deleted_at) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE fs_nodes
    SET deleted_at = NULL, updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    updated_at: now,
  });

  const updated = getNodeRowById(id);
  if (!updated) return null;
  const childCounts = computeHasChildren([updated.id]);
  return rowToNode(updated, childCounts);
}

/**
 * Permanently delete a node (remove from database entirely).
 * Only works on already soft-deleted nodes (in trash).
 * Returns true if permanently deleted, false if not found or not in trash.
 */
export function permanentDeleteNode(nodeId: string): boolean {
  const id = decodeId(nodeId);

  const info = db.prepare(`
    DELETE FROM fs_nodes WHERE id = ? AND deleted_at IS NOT NULL
  `).run(id);

  return (info.changes ?? 0) > 0;
}

/**
 * List soft-deleted nodes in trash, optionally filtered by workspace.
 * Excludes kind='doc' entries since those are shown via docs trash (to avoid duplicates).
 */
export function listTrash(workspaceId?: string | null): TrashedFileNode[] {
  let rows: FileNodeRow[];

  if (workspaceId) {
    rows = db.prepare(`
      SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
      FROM fs_nodes
      WHERE workspace_id = ? AND deleted_at IS NOT NULL AND kind != 'doc'
      ORDER BY deleted_at DESC
    `).all(workspaceId) as FileNodeRow[];
  } else {
    rows = db.prepare(`
      SELECT id, parent_id, kind, name, doc_id, workspace_id, created_at, updated_at, deleted_at
      FROM fs_nodes
      WHERE deleted_at IS NOT NULL AND kind != 'doc'
      ORDER BY deleted_at DESC
    `).all() as FileNodeRow[];
  }

  // For trash items, we compute hasChildren differently (include deleted children)
  const childCounts = new Map<number, number>();

  return rows.map(row => ({
    ...rowToNode(row, childCounts),
    deletedAt: new Date(row.deleted_at!).toISOString(),
  }));
}
