// KACHERI BACKEND/src/store/canvases.ts
// Design Studio: Store for workspace-scoped canvases (top-level containers)
//
// Tables: canvases, canvases_fts
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A2

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type CompositionMode = "deck" | "page" | "notebook" | "widget";

const VALID_COMPOSITION_MODES: readonly CompositionMode[] = [
  "deck", "page", "notebook", "widget",
];

export function validateCompositionMode(value: string): value is CompositionMode {
  return (VALID_COMPOSITION_MODES as readonly string[]).includes(value);
}

// Domain type (camelCase, for API)
export interface Canvas {
  id: string;
  title: string;
  description: string | null;
  workspaceId: string;
  createdBy: string;
  compositionMode: CompositionMode;
  themeJson: Record<string, unknown> | null;
  kclVersion: string;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  workspaceAccess: string | null;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  deletedAt: string | null;
}

// Row type (snake_case, matches DB)
interface CanvasRow {
  id: string;
  title: string;
  description: string | null;
  workspace_id: string;
  created_by: string;
  composition_mode: string;
  theme_json: string | null;
  kcl_version: string;
  is_locked: number;
  locked_by: string | null;
  locked_at: number | null;
  is_published: number;
  published_at: number | null;
  workspace_access: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface CreateCanvasInput {
  workspaceId: string;
  createdBy: string;
  title?: string;
  description?: string;
  compositionMode?: CompositionMode;
}

export interface UpdateCanvasInput {
  title?: string;
  description?: string | null;
  compositionMode?: CompositionMode;
  themeJson?: Record<string, unknown> | null;
  kclVersion?: string;
}

/* ---------- Helpers ---------- */

/** Safely parse JSON with fallback */
function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ---------- Row to Domain Converters ---------- */

function rowToCanvas(row: CanvasRow): Canvas {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    compositionMode: row.composition_mode as CompositionMode,
    themeJson: parseJson<Record<string, unknown> | null>(row.theme_json, null),
    kclVersion: row.kcl_version,
    isLocked: row.is_locked === 1,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
    isPublished: row.is_published === 1,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    workspaceAccess: row.workspace_access,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  };
}

/* ---------- FTS Sync Helpers ---------- */

async function syncFts(id: string, workspaceId: string, title: string, description: string | null): Promise<void> {
  try {
    // Delete existing FTS entry if present
    await db.run(`DELETE FROM canvases_fts WHERE canvas_id = ?`, [id]);
    // Insert updated entry
    await db.run(`
      INSERT INTO canvases_fts (canvas_id, workspace_id, title, description)
      VALUES (?, ?, ?, ?)
    `, [id, workspaceId, title, description ?? ""]);
  } catch (err) {
    console.error("[canvases] Failed to sync FTS:", err);
  }
}

async function deleteFts(id: string): Promise<void> {
  try {
    await db.run(`DELETE FROM canvases_fts WHERE canvas_id = ?`, [id]);
  } catch (err) {
    console.error("[canvases] Failed to delete FTS entry:", err);
  }
}

/* ---------- CRUD Operations ---------- */

/** Create a new canvas */
export async function createCanvas(input: CreateCanvasInput): Promise<Canvas> {
  const id = nanoid(12);
  const now = Date.now();
  const title = input.title?.trim() || "Untitled Canvas";
  const compositionMode = input.compositionMode ?? "deck";

  try {
    await db.run(`
      INSERT INTO canvases (
        id, title, description, workspace_id, created_by,
        composition_mode, theme_json, kcl_version,
        is_locked, locked_by, locked_at,
        is_published, published_at, workspace_access,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      title,
      input.description ?? null,
      input.workspaceId,
      input.createdBy,
      compositionMode,
      null, // theme_json
      "1.0.0", // kcl_version default
      0, // is_locked
      null, // locked_by
      null, // locked_at
      0, // is_published
      null, // published_at
      null, // workspace_access
      now,
      now,
      null // deleted_at
    ]);

    // Sync FTS
    await syncFts(id, input.workspaceId, title, input.description ?? null);

    return (await getCanvasById(id))!;
  } catch (err) {
    console.error("[canvases] Failed to create canvas:", err);
    throw err;
  }
}

/** Get canvas by ID (excludes soft-deleted) */
export async function getCanvasById(id: string): Promise<Canvas | null> {
  try {
    const row = await db.queryOne<CanvasRow>(
      `SELECT * FROM canvases WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    return row ? rowToCanvas(row) : null;
  } catch (err) {
    console.error("[canvases] Failed to get canvas by id:", err);
    return null;
  }
}

/** Get canvas by ID (including soft-deleted, for restore operations) */
export async function getCanvasIncludingDeleted(id: string): Promise<Canvas | null> {
  try {
    const row = await db.queryOne<CanvasRow>(
      `SELECT * FROM canvases WHERE id = ?`,
      [id]
    );

    return row ? rowToCanvas(row) : null;
  } catch (err) {
    console.error("[canvases] Failed to get canvas including deleted:", err);
    return null;
  }
}

/** List canvases for a workspace with optional pagination */
export async function listCanvasByWorkspace(
  workspaceId: string,
  opts?: {
    limit?: number;
    offset?: number;
    sortBy?: "updated_at" | "created_at" | "title";
    sortDir?: "asc" | "desc";
  }
): Promise<{ canvases: Canvas[]; total: number }> {
  try {
    const sortCol = opts?.sortBy ?? "updated_at";
    const sortDir = (opts?.sortDir ?? "desc").toUpperCase();

    // Count query
    const countRow = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvases
      WHERE workspace_id = ? AND deleted_at IS NULL
    `, [workspaceId]);
    const total = countRow?.count ?? 0;

    // Data query
    let query = `
      SELECT * FROM canvases
      WHERE workspace_id = ? AND deleted_at IS NULL
      ORDER BY ${sortCol} ${sortDir}
    `;
    const params: unknown[] = [workspaceId];

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<CanvasRow>(query, params);
    return { canvases: rows.map(rowToCanvas), total };
  } catch (err) {
    console.error("[canvases] Failed to list canvases:", err);
    return { canvases: [], total: 0 };
  }
}

/** Update an existing canvas */
export async function updateCanvas(id: string, updates: UpdateCanvasInput): Promise<Canvas | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.title !== undefined) {
    sets.push("title = ?");
    params.push(updates.title.trim());
  }

  if (updates.description !== undefined) {
    sets.push("description = ?");
    params.push(updates.description);
  }

  if (updates.compositionMode !== undefined) {
    sets.push("composition_mode = ?");
    params.push(updates.compositionMode);
  }

  if (updates.themeJson !== undefined) {
    sets.push("theme_json = ?");
    params.push(updates.themeJson ? JSON.stringify(updates.themeJson) : null);
  }

  if (updates.kclVersion !== undefined) {
    sets.push("kcl_version = ?");
    params.push(updates.kclVersion);
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE canvases
      SET ${sets.join(", ")}
      WHERE id = ? AND deleted_at IS NULL
    `, params);

    if (result.changes === 0) {
      return null;
    }

    // Sync FTS if title or description changed
    if (updates.title !== undefined || updates.description !== undefined) {
      const canvas = await getCanvasById(id);
      if (canvas) {
        await syncFts(id, canvas.workspaceId, canvas.title, canvas.description);
      }
    }

    return await getCanvasById(id);
  } catch (err) {
    console.error("[canvases] Failed to update canvas:", err);
    return null;
  }
}

/** Soft-delete a canvas */
export async function softDeleteCanvas(id: string): Promise<boolean> {
  const now = Date.now();

  try {
    const result = await db.run(`
      UPDATE canvases
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `, [now, now, id]);

    if ((result.changes ?? 0) > 0) {
      await deleteFts(id);
      return true;
    }

    return false;
  } catch (err) {
    console.error("[canvases] Failed to soft-delete canvas:", err);
    return false;
  }
}

/** Restore a soft-deleted canvas */
export async function restoreCanvas(id: string): Promise<Canvas | null> {
  const now = Date.now();

  try {
    const result = await db.run(`
      UPDATE canvases
      SET deleted_at = NULL, updated_at = ?
      WHERE id = ? AND deleted_at IS NOT NULL
    `, [now, id]);

    if (result.changes === 0) {
      return null;
    }

    // Re-sync FTS
    const canvas = await getCanvasById(id);
    if (canvas) {
      await syncFts(id, canvas.workspaceId, canvas.title, canvas.description);
    }

    return canvas;
  } catch (err) {
    console.error("[canvases] Failed to restore canvas:", err);
    return null;
  }
}

/** Lock a canvas (prevents concurrent editing) */
export async function lockCanvas(id: string, userId: string): Promise<Canvas | null> {
  const now = Date.now();

  try {
    const result = await db.run(`
      UPDATE canvases
      SET is_locked = 1, locked_by = ?, locked_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND is_locked = 0
    `, [userId, now, now, id]);

    if (result.changes === 0) {
      return null;
    }

    return await getCanvasById(id);
  } catch (err) {
    console.error("[canvases] Failed to lock canvas:", err);
    return null;
  }
}

/** Unlock a canvas */
export async function unlockCanvas(id: string): Promise<Canvas | null> {
  const now = Date.now();

  try {
    const result = await db.run(`
      UPDATE canvases
      SET is_locked = 0, locked_by = NULL, locked_at = NULL, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND is_locked = 1
    `, [now, id]);

    if (result.changes === 0) {
      return null;
    }

    return await getCanvasById(id);
  } catch (err) {
    console.error("[canvases] Failed to unlock canvas:", err);
    return null;
  }
}

/** Search canvases via FTS5 */
export async function searchCanvases(
  workspaceId: string,
  query: string,
  opts?: { limit?: number; offset?: number }
): Promise<Canvas[]> {
  try {
    const ftsQuery = query.replace(/['"]/g, "").trim();
    if (!ftsQuery) return [];

    let sql = `
      SELECT c.* FROM canvases c
      INNER JOIN canvases_fts fts ON fts.canvas_id = c.id
      WHERE fts.workspace_id = ? AND fts.canvases_fts MATCH ? AND c.deleted_at IS NULL
      ORDER BY rank
    `;
    const params: unknown[] = [workspaceId, ftsQuery];

    if (opts?.limit) {
      sql += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        sql += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<CanvasRow>(sql, params);
    return rows.map(rowToCanvas);
  } catch (err) {
    console.error("[canvases] Failed to search canvases:", err);
    return [];
  }
}

/** Check if a non-deleted canvas exists */
export async function canvasExists(id: string): Promise<boolean> {
  const row = await db.queryOne<{ '1': number }>(
    `SELECT 1 FROM canvases WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );

  return !!row;
}

/** Count canvases for a workspace */
export async function countCanvases(workspaceId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvases
      WHERE workspace_id = ? AND deleted_at IS NULL
    `, [workspaceId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error("[canvases] Failed to count canvases:", err);
    return 0;
  }
}

/** Publish a canvas for public embedding (Slice E5) */
export async function publishCanvas(id: string): Promise<Canvas | null> {
  const now = Date.now();

  try {
    const result = await db.run(`
      UPDATE canvases
      SET is_published = 1, published_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND is_published = 0
    `, [now, now, id]);

    if (result.changes === 0) {
      // May already be published or not found — return current state
      return await getCanvasById(id);
    }

    return await getCanvasById(id);
  } catch (err) {
    console.error("[canvases] Failed to publish canvas:", err);
    return null;
  }
}

/** Unpublish a canvas (Slice E5) */
export async function unpublishCanvas(id: string): Promise<Canvas | null> {
  const now = Date.now();

  try {
    const result = await db.run(`
      UPDATE canvases
      SET is_published = 0, published_at = NULL, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL AND is_published = 1
    `, [now, id]);

    if (result.changes === 0) {
      return await getCanvasById(id);
    }

    return await getCanvasById(id);
  } catch (err) {
    console.error("[canvases] Failed to unpublish canvas:", err);
    return null;
  }
}

/** Get a published canvas by ID (for public embed routes — Slice E5) */
export async function getPublishedCanvasById(id: string): Promise<Canvas | null> {
  try {
    const row = await db.queryOne<CanvasRow>(
      `SELECT * FROM canvases WHERE id = ? AND is_published = 1 AND deleted_at IS NULL`,
      [id]
    );

    return row ? rowToCanvas(row) : null;
  } catch (err) {
    console.error("[canvases] Failed to get published canvas:", err);
    return null;
  }
}

/* ---------- Export aggregated store object ---------- */

export const CanvasStore = {
  create: createCanvas,
  getById: getCanvasById,
  getIncludingDeleted: getCanvasIncludingDeleted,
  getPublishedById: getPublishedCanvasById,
  listByWorkspace: listCanvasByWorkspace,
  update: updateCanvas,
  softDelete: softDeleteCanvas,
  restore: restoreCanvas,
  lock: lockCanvas,
  unlock: unlockCanvas,
  publish: publishCanvas,
  unpublish: unpublishCanvas,
  search: searchCanvases,
  exists: canvasExists,
  count: countCanvases,
  // Validators
  validateCompositionMode,
};
