// KACHERI BACKEND/src/store/extractions.ts
// Document Intelligence: Store for AI extractions and corrections
//
// Tables: extractions, extraction_corrections
// See: Docs/Roadmap/document-intelligence-work-scope.md

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type DocumentType =
  | "contract"
  | "invoice"
  | "proposal"
  | "meeting_notes"
  | "report"
  | "other";

export type AnomalySeverity = "info" | "warning" | "error";

export interface Anomaly {
  code: string;
  severity: AnomalySeverity;
  message: string;
  suggestion?: string;
}

// Domain type (camelCase, for API)
export interface Extraction {
  id: string;
  docId: string;
  documentType: DocumentType;
  typeConfidence: number;
  extraction: Record<string, unknown>;
  fieldConfidences: Record<string, number> | null;
  anomalies: Anomaly[] | null;
  proofId: string | null;
  createdAt: string;  // ISO string
  updatedAt: string;  // ISO string
  createdBy: string | null;
}

// Row type (snake_case, matches DB)
interface ExtractionRow {
  id: string;
  doc_id: string;
  document_type: string;
  type_confidence: number;
  extraction_json: string;
  field_confidences_json: string | null;
  anomalies_json: string | null;
  proof_id: string | null;
  created_at: number;
  updated_at: number;
  created_by: string | null;
}

export interface CreateExtractionInput {
  docId: string;
  documentType: DocumentType;
  typeConfidence: number;
  extraction: Record<string, unknown>;
  fieldConfidences?: Record<string, number>;
  anomalies?: Anomaly[];
  proofId?: string;
  createdBy?: string;
}

export interface UpdateExtractionInput {
  documentType?: DocumentType;
  typeConfidence?: number;
  extraction?: Record<string, unknown>;
  fieldConfidences?: Record<string, number>;
  anomalies?: Anomaly[];
  proofId?: string;
}

// Correction types
export interface ExtractionCorrection {
  id: string;
  extractionId: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  correctedBy: string;
  correctedAt: string;  // ISO string
}

interface CorrectionRow {
  id: string;
  extraction_id: string;
  field_path: string;
  old_value: string | null;
  new_value: string | null;
  corrected_by: string;
  corrected_at: number;
}

export interface CreateCorrectionInput {
  extractionId: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  correctedBy: string;
}

/* ---------- Row to Domain Converters ---------- */

function rowToExtraction(row: ExtractionRow): Extraction {
  return {
    id: row.id,
    docId: row.doc_id,
    documentType: row.document_type as DocumentType,
    typeConfidence: row.type_confidence,
    extraction: parseJson(row.extraction_json, {}),
    fieldConfidences: parseJson(row.field_confidences_json, null),
    anomalies: parseJson(row.anomalies_json, null),
    proofId: row.proof_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by,
  };
}

function rowToCorrection(row: CorrectionRow): ExtractionCorrection {
  return {
    id: row.id,
    extractionId: row.extraction_id,
    fieldPath: row.field_path,
    oldValue: parseJson(row.old_value, null),
    newValue: parseJson(row.new_value, null),
    correctedBy: row.corrected_by,
    correctedAt: new Date(row.corrected_at).toISOString(),
  };
}

/** Safely parse JSON with fallback */
function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ---------- Extraction CRUD ---------- */

/** Create a new extraction for a document */
export async function createExtraction(input: CreateExtractionInput): Promise<Extraction> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(
      `INSERT INTO extractions (
        id, doc_id, document_type, type_confidence,
        extraction_json, field_confidences_json, anomalies_json,
        proof_id, created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.docId,
        input.documentType,
        input.typeConfidence,
        JSON.stringify(input.extraction),
        input.fieldConfidences ? JSON.stringify(input.fieldConfidences) : null,
        input.anomalies ? JSON.stringify(input.anomalies) : null,
        input.proofId ?? null,
        now,
        now,
        input.createdBy ?? null,
      ]
    );

    return (await getExtractionById(id))!;
  } catch (err) {
    console.error("[extractions] Failed to create extraction:", err);
    throw err;
  }
}

/** Get extraction by ID */
export async function getExtractionById(id: string): Promise<Extraction | null> {
  try {
    const row = await db.queryOne<ExtractionRow>(
      `SELECT * FROM extractions WHERE id = ?`,
      [id]
    );
    return row ? rowToExtraction(row) : null;
  } catch (err) {
    console.error("[extractions] Failed to get extraction by id:", err);
    return null;
  }
}

/** Get extraction by document ID (one-to-one relationship) */
export async function getExtractionByDocId(docId: string): Promise<Extraction | null> {
  try {
    const row = await db.queryOne<ExtractionRow>(
      `SELECT * FROM extractions WHERE doc_id = ?`,
      [docId]
    );
    return row ? rowToExtraction(row) : null;
  } catch (err) {
    console.error("[extractions] Failed to get extraction by doc_id:", err);
    return null;
  }
}

/** Batch-fetch extractions by document IDs (single query) */
export async function getExtractionsByDocIds(docIds: string[]): Promise<Map<string, Extraction>> {
  const map = new Map<string, Extraction>();
  if (docIds.length === 0) return map;
  try {
    const placeholders = docIds.map(() => "?").join(", ");
    const rows = await db.queryAll<ExtractionRow>(
      `SELECT * FROM extractions WHERE doc_id IN (${placeholders})`,
      docIds
    );
    for (const row of rows) {
      map.set(row.doc_id, rowToExtraction(row));
    }
    return map;
  } catch (err) {
    console.error("[extractions] Failed to batch-get extractions by doc_ids:", err);
    return map;
  }
}

/** Update an extraction */
export async function updateExtraction(
  id: string,
  updates: UpdateExtractionInput
): Promise<Extraction | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.documentType !== undefined) {
    sets.push("document_type = ?");
    params.push(updates.documentType);
  }

  if (updates.typeConfidence !== undefined) {
    sets.push("type_confidence = ?");
    params.push(updates.typeConfidence);
  }

  if (updates.extraction !== undefined) {
    sets.push("extraction_json = ?");
    params.push(JSON.stringify(updates.extraction));
  }

  if (updates.fieldConfidences !== undefined) {
    sets.push("field_confidences_json = ?");
    params.push(JSON.stringify(updates.fieldConfidences));
  }

  if (updates.anomalies !== undefined) {
    sets.push("anomalies_json = ?");
    params.push(JSON.stringify(updates.anomalies));
  }

  if (updates.proofId !== undefined) {
    sets.push("proof_id = ?");
    params.push(updates.proofId);
  }

  params.push(id);

  try {
    const result = await db.run(
      `UPDATE extractions SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    if (result.changes === 0) {
      return null;
    }

    return getExtractionById(id);
  } catch (err) {
    console.error("[extractions] Failed to update extraction:", err);
    return null;
  }
}

/** Delete an extraction (cascades to corrections and actions) */
export async function deleteExtraction(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM extractions WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[extractions] Failed to delete extraction:", err);
    return false;
  }
}

/** Delete extraction by document ID */
export async function deleteExtractionByDocId(docId: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM extractions WHERE doc_id = ?`,
      [docId]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[extractions] Failed to delete extraction by doc_id:", err);
    return false;
  }
}

/** Get extractions by document type */
export async function getExtractionsByType(
  documentType: DocumentType,
  limit: number = 100,
  offset: number = 0
): Promise<Extraction[]> {
  try {
    const rows = await db.queryAll<ExtractionRow>(
      `SELECT * FROM extractions
       WHERE document_type = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [documentType, limit, offset]
    );
    return rows.map(rowToExtraction);
  } catch (err) {
    console.error("[extractions] Failed to get extractions by type:", err);
    return [];
  }
}

/* ---------- Correction CRUD ---------- */

/** Create a correction record for a field edit */
export async function createCorrection(input: CreateCorrectionInput): Promise<ExtractionCorrection> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(
      `INSERT INTO extraction_corrections (
        id, extraction_id, field_path, old_value, new_value,
        corrected_by, corrected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.extractionId,
        input.fieldPath,
        input.oldValue !== undefined ? JSON.stringify(input.oldValue) : null,
        input.newValue !== undefined ? JSON.stringify(input.newValue) : null,
        input.correctedBy,
        now,
      ]
    );

    return (await getCorrectionById(id))!;
  } catch (err) {
    console.error("[extractions] Failed to create correction:", err);
    throw err;
  }
}

/** Get correction by ID */
export async function getCorrectionById(id: string): Promise<ExtractionCorrection | null> {
  try {
    const row = await db.queryOne<CorrectionRow>(
      `SELECT * FROM extraction_corrections WHERE id = ?`,
      [id]
    );
    return row ? rowToCorrection(row) : null;
  } catch (err) {
    console.error("[extractions] Failed to get correction by id:", err);
    return null;
  }
}

/** Get all corrections for an extraction, ordered by time */
export async function getCorrectionsByExtraction(extractionId: string): Promise<ExtractionCorrection[]> {
  try {
    const rows = await db.queryAll<CorrectionRow>(
      `SELECT * FROM extraction_corrections
       WHERE extraction_id = ?
       ORDER BY corrected_at DESC`,
      [extractionId]
    );
    return rows.map(rowToCorrection);
  } catch (err) {
    console.error("[extractions] Failed to get corrections:", err);
    return [];
  }
}

/** Get corrections for a specific field path */
export async function getCorrectionsByField(
  extractionId: string,
  fieldPath: string
): Promise<ExtractionCorrection[]> {
  try {
    const rows = await db.queryAll<CorrectionRow>(
      `SELECT * FROM extraction_corrections
       WHERE extraction_id = ? AND field_path = ?
       ORDER BY corrected_at DESC`,
      [extractionId, fieldPath]
    );
    return rows.map(rowToCorrection);
  } catch (err) {
    console.error("[extractions] Failed to get corrections by field:", err);
    return [];
  }
}

/* ---------- Export aggregated store object ---------- */

export const ExtractionsStore = {
  create: createExtraction,
  getById: getExtractionById,
  getByDocId: getExtractionByDocId,
  getByDocIds: getExtractionsByDocIds,
  update: updateExtraction,
  delete: deleteExtraction,
  deleteByDocId: deleteExtractionByDocId,
  getByType: getExtractionsByType,
  createCorrection,
  getCorrectionById,
  getCorrectionsByExtraction,
  getCorrectionsByField,
};
