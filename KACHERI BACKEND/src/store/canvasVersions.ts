// KACHERI BACKEND/src/store/canvasVersions.ts
// Design Studio: Store for canvas version snapshots (named save points)
//
// Tables: canvas_versions
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A2

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

// Domain type (camelCase, for API)
export interface CanvasVersion {
  id: string;
  canvasId: string;
  name: string;
  description: string | null;
  snapshotJson: string; // Raw JSON string — not parsed, potentially very large
  createdBy: string;
  createdAt: string; // ISO string
}

// Lightweight version without snapshot (for list views)
export interface CanvasVersionSummary {
  id: string;
  canvasId: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface CanvasVersionRow {
  id: string;
  canvas_id: string;
  name: string;
  description: string | null;
  snapshot_json: string;
  created_by: string;
  created_at: number;
}

export interface CreateVersionInput {
  canvasId: string;
  name: string;
  description?: string;
  snapshotJson: string; // Stringified full canvas + frames state
  createdBy: string;
}

/* ---------- Row to Domain Converters ---------- */

function rowToVersion(row: CanvasVersionRow): CanvasVersion {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    name: row.name,
    description: row.description,
    snapshotJson: row.snapshot_json,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToVersionSummary(row: CanvasVersionRow): CanvasVersionSummary {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ---------- CRUD Operations ---------- */

/** Create a named version snapshot */
export async function createVersion(input: CreateVersionInput): Promise<CanvasVersion> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO canvas_versions (
        id, canvas_id, name, description,
        snapshot_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.canvasId,
      input.name,
      input.description ?? null,
      input.snapshotJson,
      input.createdBy,
      now,
    ]);

    return (await getVersionById(id))!;
  } catch (err) {
    console.error("[canvas_versions] Failed to create version:", err);
    throw err;
  }
}

/** Get version by ID (includes full snapshot for restore) */
export async function getVersionById(id: string): Promise<CanvasVersion | null> {
  try {
    const row = await db.queryOne<CanvasVersionRow>(
      `SELECT * FROM canvas_versions WHERE id = ?`,
      [id]
    );

    return row ? rowToVersion(row) : null;
  } catch (err) {
    console.error("[canvas_versions] Failed to get version by id:", err);
    return null;
  }
}

/** List versions for a canvas (summaries without snapshot, paginated) */
export async function listVersionsByCanvas(
  canvasId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ versions: CanvasVersionSummary[]; total: number }> {
  try {
    // Count query
    const countRow = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvas_versions WHERE canvas_id = ?
    `, [canvasId]);
    const total = countRow?.count ?? 0;

    // Data query — exclude snapshot_json for list performance
    let query = `
      SELECT id, canvas_id, name, description, snapshot_json, created_by, created_at
      FROM canvas_versions
      WHERE canvas_id = ?
      ORDER BY created_at DESC
    `;
    const params: unknown[] = [canvasId];

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<CanvasVersionRow>(query, params);
    return { versions: rows.map(rowToVersionSummary), total };
  } catch (err) {
    console.error("[canvas_versions] Failed to list versions:", err);
    return { versions: [], total: 0 };
  }
}

/** Delete a version */
export async function deleteVersion(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM canvas_versions WHERE id = ?`,
      [id]
    );

    return (result.changes ?? 0) > 0;
  } catch (err) {
    console.error("[canvas_versions] Failed to delete version:", err);
    return false;
  }
}

/** Count versions for a canvas */
export async function countVersionsByCanvas(canvasId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvas_versions WHERE canvas_id = ?
    `, [canvasId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error("[canvas_versions] Failed to count versions:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const CanvasVersionStore = {
  create: createVersion,
  getById: getVersionById,
  listByCanvas: listVersionsByCanvas,
  delete: deleteVersion,
  countByCanvas: countVersionsByCanvas,
};
