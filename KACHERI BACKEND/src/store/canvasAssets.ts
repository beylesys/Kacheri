// KACHERI BACKEND/src/store/canvasAssets.ts
// Design Studio: Store for canvas assets (generated images, uploads, fonts)
// and workspace image generation credit tracking.
//
// Tables: canvas_assets, workspace_image_credits
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice B5

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

// Domain type (camelCase, for API)
export interface CanvasAsset {
  id: string;
  canvasId: string;
  workspaceId: string;
  assetType: "image" | "font" | "icon" | "video" | "audio" | "other";
  name: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  source: "upload" | "ai_generated" | "external";
  proofId: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface CanvasAssetRow {
  id: string;
  canvas_id: string;
  workspace_id: string;
  asset_type: string;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  source: string;
  proof_id: string | null;
  metadata_json: string | null;
  created_by: string;
  created_at: number;
}

export interface CreateAssetInput {
  canvasId: string;
  workspaceId: string;
  assetType: CanvasAsset["assetType"];
  name: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  source: CanvasAsset["source"];
  proofId?: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
}

/* ---------- Credit Types ---------- */

export interface CreditInfo {
  total: number;
  used: number;
  remaining: number;
}

/* ---------- Helpers ---------- */

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ---------- Row to Domain Converters ---------- */

function rowToAsset(row: CanvasAssetRow): CanvasAsset {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    workspaceId: row.workspace_id,
    assetType: row.asset_type as CanvasAsset["assetType"],
    name: row.name,
    filePath: row.file_path,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    source: row.source as CanvasAsset["source"],
    proofId: row.proof_id,
    metadata: parseJson<Record<string, unknown> | null>(row.metadata_json, null),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ---------- CRUD Operations ---------- */

/** Create a new canvas asset record */
export async function createAsset(input: CreateAssetInput): Promise<CanvasAsset> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO canvas_assets (
        id, canvas_id, workspace_id, asset_type, name,
        file_path, file_size, mime_type, source,
        proof_id, metadata_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.canvasId,
      input.workspaceId,
      input.assetType,
      input.name,
      input.filePath,
      input.fileSize,
      input.mimeType,
      input.source,
      input.proofId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.createdBy,
      now,
    ]);

    return (await getAssetById(id))!;
  } catch (err) {
    console.error("[canvas_assets] Failed to create asset:", err);
    throw err;
  }
}

/** Get asset by ID */
export async function getAssetById(id: string): Promise<CanvasAsset | null> {
  try {
    const row = await db.queryOne<CanvasAssetRow>(
      `SELECT * FROM canvas_assets WHERE id = ?`,
      [id]
    );

    return row ? rowToAsset(row) : null;
  } catch (err) {
    console.error("[canvas_assets] Failed to get asset by id:", err);
    return null;
  }
}

/** Get all assets for a canvas, ordered by creation time */
export async function getAssetsByCanvas(canvasId: string): Promise<CanvasAsset[]> {
  try {
    const rows = await db.queryAll<CanvasAssetRow>(`
      SELECT * FROM canvas_assets
      WHERE canvas_id = ?
      ORDER BY created_at DESC
    `, [canvasId]);

    return rows.map(rowToAsset);
  } catch (err) {
    console.error("[canvas_assets] Failed to get assets by canvas:", err);
    return [];
  }
}

/** Delete an asset record (hard delete) */
export async function deleteAsset(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM canvas_assets WHERE id = ?`,
      [id]
    );

    return (result.changes ?? 0) > 0;
  } catch (err) {
    console.error("[canvas_assets] Failed to delete asset:", err);
    return false;
  }
}

/** Count assets for a canvas */
export async function countAssetsByCanvas(canvasId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvas_assets WHERE canvas_id = ?
    `, [canvasId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error("[canvas_assets] Failed to count assets:", err);
    return 0;
  }
}

/* ---------- Credit Operations ---------- */

const DEFAULT_IMAGE_CREDITS = Number(process.env.IMAGE_CREDITS_DEFAULT) || 100;

/**
 * Get or initialize credit row for a workspace.
 * Lazy-initializes with the default credit allocation on first access.
 */
export async function getOrInitCredits(workspaceId: string): Promise<CreditInfo> {
  try {
    let row = await db.queryOne<{ credits_total: number; credits_used: number }>(`
      SELECT credits_total, credits_used
      FROM workspace_image_credits
      WHERE workspace_id = ?
    `, [workspaceId]);

    if (!row) {
      await db.run(`
        INSERT INTO workspace_image_credits (workspace_id, credits_total, credits_used, updated_at)
        VALUES (?, ?, 0, ?)
      `, [workspaceId, DEFAULT_IMAGE_CREDITS, Date.now()]);

      row = { credits_total: DEFAULT_IMAGE_CREDITS, credits_used: 0 };
    }

    return {
      total: row.credits_total,
      used: row.credits_used,
      remaining: row.credits_total - row.credits_used,
    };
  } catch (err) {
    console.error("[canvas_assets] Failed to get/init credits:", err);
    return { total: DEFAULT_IMAGE_CREDITS, used: 0, remaining: DEFAULT_IMAGE_CREDITS };
  }
}

/**
 * Get remaining credits for a workspace.
 * Initializes the credit row if it doesn't exist.
 */
export async function getCreditsRemaining(workspaceId: string): Promise<number> {
  return (await getOrInitCredits(workspaceId)).remaining;
}

/**
 * Atomically deduct one image generation credit.
 * Returns the new remaining credits, or null if credits are exhausted.
 * Uses atomic SQL: UPDATE ... WHERE credits_used < credits_total
 */
export async function deductCredit(workspaceId: string): Promise<{ creditsRemaining: number } | null> {
  try {
    // Ensure row exists
    await getOrInitCredits(workspaceId);

    // Atomic deduction — only increments if credits remain
    const result = await db.run(`
      UPDATE workspace_image_credits
      SET credits_used = credits_used + 1, updated_at = ?
      WHERE workspace_id = ? AND credits_used < credits_total
    `, [Date.now(), workspaceId]);

    if ((result.changes ?? 0) === 0) {
      return null; // credits exhausted
    }

    const row = await db.queryOne<{ remaining: number }>(`
      SELECT credits_total - credits_used as remaining
      FROM workspace_image_credits
      WHERE workspace_id = ?
    `, [workspaceId]);

    return { creditsRemaining: row?.remaining ?? 0 };
  } catch (err) {
    console.error("[canvas_assets] Failed to deduct credit:", err);
    return null;
  }
}

/* ---------- Export aggregated store object ---------- */

export const CanvasAssetStore = {
  create: createAsset,
  getById: getAssetById,
  getByCanvas: getAssetsByCanvas,
  delete: deleteAsset,
  countByCanvas: countAssetsByCanvas,
  getCreditsRemaining,
  deductCredit,
  getOrInitCredits,
};
