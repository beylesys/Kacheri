// KACHERI BACKEND/src/store/canvasFrames.ts
// Design Studio: Store for canvas frames (individual slides/pages within a canvas)
//
// Tables: canvas_frames
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A2

import { db } from "../db";
import { nanoid } from "nanoid";
import { createHash } from "crypto";

/* ---------- Types ---------- */

// Domain type (camelCase, for API)
export interface CanvasFrame {
  id: string;
  canvasId: string;
  title: string | null;
  code: string;
  codeHash: string | null;
  sortOrder: number;
  speakerNotes: string | null;
  thumbnailUrl: string | null;
  durationMs: number;
  transition: string;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface CanvasFrameRow {
  id: string;
  canvas_id: string;
  title: string | null;
  code: string;
  code_hash: string | null;
  sort_order: number;
  speaker_notes: string | null;
  thumbnail_url: string | null;
  duration_ms: number;
  transition: string;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateFrameInput {
  canvasId: string;
  title?: string;
  code?: string;
  sortOrder?: number;
  speakerNotes?: string;
  durationMs?: number;
  transition?: string;
}

export interface UpdateFrameInput {
  title?: string | null;
  code?: string;
  speakerNotes?: string | null;
  durationMs?: number;
  transition?: string;
  metadata?: Record<string, unknown> | null;
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

/** Compute SHA256 hash of code content */
function computeCodeHash(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/* ---------- Row to Domain Converters ---------- */

function rowToFrame(row: CanvasFrameRow): CanvasFrame {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    title: row.title,
    code: row.code,
    codeHash: row.code_hash,
    sortOrder: row.sort_order,
    speakerNotes: row.speaker_notes,
    thumbnailUrl: row.thumbnail_url,
    durationMs: row.duration_ms ?? 5000,
    transition: row.transition ?? "fade",
    metadata: parseJson<Record<string, unknown> | null>(row.metadata_json, null),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/* ---------- CRUD Operations ---------- */

/** Create a new frame within a canvas */
export async function createFrame(input: CreateFrameInput): Promise<CanvasFrame> {
  const id = nanoid(12);
  const now = Date.now();
  const code = input.code ?? "";
  const codeHash = code ? computeCodeHash(code) : null;

  try {
    await db.run(`
      INSERT INTO canvas_frames (
        id, canvas_id, title, code, code_hash, sort_order,
        speaker_notes, thumbnail_url, duration_ms, transition,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.canvasId,
      input.title ?? null,
      code,
      codeHash,
      input.sortOrder ?? 0,
      input.speakerNotes ?? null,
      null, // thumbnail_url
      input.durationMs ?? 5000,
      input.transition ?? "fade",
      null, // metadata_json
      now,
      now,
    ]);

    return (await getFrameById(id))!;
  } catch (err) {
    console.error("[canvas_frames] Failed to create frame:", err);
    throw err;
  }
}

/** Get frame by ID */
export async function getFrameById(id: string): Promise<CanvasFrame | null> {
  try {
    const row = await db.queryOne<CanvasFrameRow>(
      `SELECT * FROM canvas_frames WHERE id = ?`,
      [id]
    );

    return row ? rowToFrame(row) : null;
  } catch (err) {
    console.error("[canvas_frames] Failed to get frame by id:", err);
    return null;
  }
}

/** Get all frames for a canvas, ordered by sort_order */
export async function getFramesByCanvas(canvasId: string): Promise<CanvasFrame[]> {
  try {
    const rows = await db.queryAll<CanvasFrameRow>(`
      SELECT * FROM canvas_frames
      WHERE canvas_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `, [canvasId]);

    return rows.map(rowToFrame);
  } catch (err) {
    console.error("[canvas_frames] Failed to get frames by canvas:", err);
    return [];
  }
}

/** Update an existing frame */
export async function updateFrame(id: string, updates: UpdateFrameInput): Promise<CanvasFrame | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.title !== undefined) {
    sets.push("title = ?");
    params.push(updates.title);
  }

  if (updates.code !== undefined) {
    sets.push("code = ?");
    params.push(updates.code);
    sets.push("code_hash = ?");
    params.push(updates.code ? computeCodeHash(updates.code) : null);
  }

  if (updates.speakerNotes !== undefined) {
    sets.push("speaker_notes = ?");
    params.push(updates.speakerNotes);
  }

  if (updates.durationMs !== undefined) {
    sets.push("duration_ms = ?");
    params.push(updates.durationMs);
  }

  if (updates.transition !== undefined) {
    sets.push("transition = ?");
    params.push(updates.transition);
  }

  if (updates.metadata !== undefined) {
    sets.push("metadata_json = ?");
    params.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE canvas_frames
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return getFrameById(id);
  } catch (err) {
    console.error("[canvas_frames] Failed to update frame:", err);
    return null;
  }
}

/** Delete a frame (hard delete — CASCADE from canvas handles soft-delete flow) */
export async function deleteFrame(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM canvas_frames WHERE id = ?`,
      [id]
    );

    return (result.changes ?? 0) > 0;
  } catch (err) {
    console.error("[canvas_frames] Failed to delete frame:", err);
    return false;
  }
}

/**
 * Reorder frames within a canvas.
 * frameIds array defines the new order (index = new sort_order).
 */
export async function reorderFrames(canvasId: string, frameIds: string[]): Promise<boolean> {
  try {
    const now = Date.now();
    await db.transaction(async (tx) => {
      for (let i = 0; i < frameIds.length; i++) {
        await tx.run(`
          UPDATE canvas_frames
          SET sort_order = ?, updated_at = ?
          WHERE id = ? AND canvas_id = ?
        `, [i, now, frameIds[i], canvasId]);
      }
    });
    return true;
  } catch (err) {
    console.error("[canvas_frames] Failed to reorder frames:", err);
    return false;
  }
}

/** Update frame code and recompute hash */
export async function updateCode(id: string, code: string): Promise<CanvasFrame | null> {
  const now = Date.now();
  const codeHash = code ? computeCodeHash(code) : null;

  try {
    const result = await db.run(`
      UPDATE canvas_frames
      SET code = ?, code_hash = ?, updated_at = ?
      WHERE id = ?
    `, [code, codeHash, now, id]);

    if (result.changes === 0) {
      return null;
    }

    return getFrameById(id);
  } catch (err) {
    console.error("[canvas_frames] Failed to update code:", err);
    return null;
  }
}

/** Update frame thumbnail URL */
export async function updateThumbnail(id: string, thumbnailUrl: string | null): Promise<CanvasFrame | null> {
  const now = Date.now();

  try {
    const result = await db.run(`
      UPDATE canvas_frames
      SET thumbnail_url = ?, updated_at = ?
      WHERE id = ?
    `, [thumbnailUrl, now, id]);

    if (result.changes === 0) {
      return null;
    }

    return getFrameById(id);
  } catch (err) {
    console.error("[canvas_frames] Failed to update thumbnail:", err);
    return null;
  }
}

/** Count frames for a canvas */
export async function countFramesByCanvas(canvasId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvas_frames WHERE canvas_id = ?
    `, [canvasId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error("[canvas_frames] Failed to count frames:", err);
    return 0;
  }
}

/** Delete all frames for a canvas (used by version restore) */
export async function deleteAllByCanvas(canvasId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM canvas_frames WHERE canvas_id = ?`,
      [canvasId]
    );

    return result.changes ?? 0;
  } catch (err) {
    console.error("[canvas_frames] Failed to delete all frames by canvas:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const CanvasFrameStore = {
  create: createFrame,
  getById: getFrameById,
  getByCanvas: getFramesByCanvas,
  update: updateFrame,
  delete: deleteFrame,
  deleteAllByCanvas,
  reorder: reorderFrames,
  updateCode,
  updateThumbnail,
  countByCanvas: countFramesByCanvas,
};
