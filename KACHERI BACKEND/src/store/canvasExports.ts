// KACHERI BACKEND/src/store/canvasExports.ts
// Design Studio: Store for canvas export records and status tracking
//
// Tables: canvas_exports
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A2

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type ExportFormat =
  | "pdf"
  | "pptx"
  | "html_bundle"
  | "html_standalone"
  | "png"
  | "svg"
  | "embed"
  | "mp4";

export type ExportStatus = "pending" | "processing" | "completed" | "failed";

const VALID_FORMATS: readonly ExportFormat[] = [
  "pdf", "pptx", "html_bundle", "html_standalone", "png", "svg", "embed", "mp4",
];

const VALID_STATUSES: readonly ExportStatus[] = [
  "pending", "processing", "completed", "failed",
];

export function validateExportFormat(value: string): value is ExportFormat {
  return (VALID_FORMATS as readonly string[]).includes(value);
}

export function validateExportStatus(value: string): value is ExportStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

// Domain type (camelCase, for API)
export interface CanvasExport {
  id: string;
  canvasId: string;
  format: ExportFormat;
  status: ExportStatus;
  filePath: string | null;
  fileSize: number | null;
  proofId: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string; // ISO string
  completedAt: string | null;
}

// Row type (snake_case, matches DB)
interface CanvasExportRow {
  id: string;
  canvas_id: string;
  format: string;
  status: string;
  file_path: string | null;
  file_size: number | null;
  proof_id: string | null;
  error_message: string | null;
  metadata_json: string | null;
  created_by: string;
  created_at: number;
  completed_at: number | null;
}

export interface CreateExportInput {
  canvasId: string;
  format: ExportFormat;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateExportStatusInput {
  status: ExportStatus;
  filePath?: string;
  fileSize?: number;
  proofId?: string;
  errorMessage?: string;
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

function rowToExport(row: CanvasExportRow): CanvasExport {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    format: row.format as ExportFormat,
    status: row.status as ExportStatus,
    filePath: row.file_path,
    fileSize: row.file_size,
    proofId: row.proof_id,
    errorMessage: row.error_message,
    metadata: parseJson<Record<string, unknown> | null>(row.metadata_json, null),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

/* ---------- CRUD Operations ---------- */

/** Create a new export record (initially pending) */
export async function createExport(input: CreateExportInput): Promise<CanvasExport> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO canvas_exports (
        id, canvas_id, format, status,
        file_path, file_size, proof_id, error_message,
        metadata_json, created_by, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.canvasId,
      input.format,
      "pending", // initial status
      null, // file_path
      null, // file_size
      null, // proof_id
      null, // error_message
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.createdBy,
      now,
      null, // completed_at
    ]);

    return (await getExportById(id))!;
  } catch (err) {
    console.error("[canvas_exports] Failed to create export:", err);
    throw err;
  }
}

/** Update export status and optional completion fields */
export async function updateExportStatus(id: string, input: UpdateExportStatusInput): Promise<CanvasExport | null> {
  const sets: string[] = ["status = ?"];
  const params: unknown[] = [input.status];

  if (input.filePath !== undefined) {
    sets.push("file_path = ?");
    params.push(input.filePath);
  }

  if (input.fileSize !== undefined) {
    sets.push("file_size = ?");
    params.push(input.fileSize);
  }

  if (input.proofId !== undefined) {
    sets.push("proof_id = ?");
    params.push(input.proofId);
  }

  if (input.errorMessage !== undefined) {
    sets.push("error_message = ?");
    params.push(input.errorMessage);
  }

  // Set completed_at when status is completed or failed
  if (input.status === "completed" || input.status === "failed") {
    sets.push("completed_at = ?");
    params.push(Date.now());
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE canvas_exports
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return getExportById(id);
  } catch (err) {
    console.error("[canvas_exports] Failed to update export status:", err);
    return null;
  }
}

/** Get export by ID */
export async function getExportById(id: string): Promise<CanvasExport | null> {
  try {
    const row = await db.queryOne<CanvasExportRow>(
      `SELECT * FROM canvas_exports WHERE id = ?`,
      [id]
    );

    return row ? rowToExport(row) : null;
  } catch (err) {
    console.error("[canvas_exports] Failed to get export by id:", err);
    return null;
  }
}

/** List exports for a canvas (paginated, most recent first) */
export async function listExportsByCanvas(
  canvasId: string,
  opts?: { limit?: number; offset?: number; format?: ExportFormat; status?: ExportStatus }
): Promise<{ exports: CanvasExport[]; total: number }> {
  try {
    let whereClause = `WHERE canvas_id = ?`;
    const whereParams: unknown[] = [canvasId];

    if (opts?.format) {
      whereClause += ` AND format = ?`;
      whereParams.push(opts.format);
    }

    if (opts?.status) {
      whereClause += ` AND status = ?`;
      whereParams.push(opts.status);
    }

    // Count query
    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM canvas_exports ${whereClause}`,
      whereParams
    );
    const total = countRow?.count ?? 0;

    // Data query
    let query = `
      SELECT * FROM canvas_exports
      ${whereClause}
      ORDER BY created_at DESC
    `;
    const params: unknown[] = [...whereParams];

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<CanvasExportRow>(query, params);
    return { exports: rows.map(rowToExport), total };
  } catch (err) {
    console.error("[canvas_exports] Failed to list exports:", err);
    return { exports: [], total: 0 };
  }
}

/** Count exports for a canvas */
export async function countExportsByCanvas(canvasId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvas_exports WHERE canvas_id = ?
    `, [canvasId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error("[canvas_exports] Failed to count exports:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const CanvasExportStore = {
  create: createExport,
  updateStatus: updateExportStatus,
  getById: getExportById,
  listByCanvas: listExportsByCanvas,
  countByCanvas: countExportsByCanvas,
  // Validators
  validateExportFormat,
  validateExportStatus,
};
