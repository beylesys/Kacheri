// KACHERI BACKEND/src/store/extractionStandards.ts
// Document Intelligence: Store for workspace extraction standards
//
// Tables: workspace_extraction_standards
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 7

import { db } from "../db";
import { nanoid } from "nanoid";
import type { DocumentType, AnomalySeverity } from "./extractions";

/* ---------- Types ---------- */

export type RuleType = "required_field" | "value_range" | "comparison" | "custom";

// Domain type (camelCase, for API)
export interface ExtractionStandard {
  id: string;
  workspaceId: string;
  documentType: DocumentType;
  ruleType: RuleType;
  config: Record<string, unknown>;
  severity: AnomalySeverity;
  enabled: boolean;
  createdBy: string;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface StandardRow {
  id: string;
  workspace_id: string;
  document_type: string;
  rule_type: string;
  rule_config_json: string;
  severity: string;
  enabled: number;
  created_by: string;
  created_at: number;
}

export interface CreateStandardInput {
  workspaceId: string;
  documentType: DocumentType;
  ruleType: RuleType;
  config: Record<string, unknown>;
  severity?: AnomalySeverity;
  enabled?: boolean;
  createdBy: string;
}

export interface UpdateStandardInput {
  documentType?: DocumentType;
  ruleType?: RuleType;
  config?: Record<string, unknown>;
  severity?: AnomalySeverity;
  enabled?: boolean;
}

/* ---------- Row to Domain Converters ---------- */

function rowToStandard(row: StandardRow): ExtractionStandard {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    documentType: row.document_type as DocumentType,
    ruleType: row.rule_type as RuleType,
    config: parseJson(row.rule_config_json, {}),
    severity: row.severity as AnomalySeverity,
    enabled: row.enabled === 1,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
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

/* ---------- Validation ---------- */

const VALID_RULE_TYPES: RuleType[] = ["required_field", "value_range", "comparison", "custom"];
const VALID_SEVERITIES: AnomalySeverity[] = ["info", "warning", "error"];
const VALID_DOC_TYPES: DocumentType[] = [
  "contract",
  "invoice",
  "proposal",
  "meeting_notes",
  "report",
  "other",
];

export function validateRuleType(value: string): value is RuleType {
  return VALID_RULE_TYPES.includes(value as RuleType);
}

export function validateSeverity(value: string): value is AnomalySeverity {
  return VALID_SEVERITIES.includes(value as AnomalySeverity);
}

export function validateDocumentType(value: string): value is DocumentType {
  return VALID_DOC_TYPES.includes(value as DocumentType);
}

/* ---------- CRUD Operations ---------- */

/** Create a new extraction standard */
export async function createStandard(input: CreateStandardInput): Promise<ExtractionStandard> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(
      `INSERT INTO workspace_extraction_standards (
        id, workspace_id, document_type, rule_type,
        rule_config_json, severity, enabled, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workspaceId,
        input.documentType,
        input.ruleType,
        JSON.stringify(input.config),
        input.severity ?? "warning",
        input.enabled !== false ? 1 : 0,
        input.createdBy,
        now,
      ]
    );

    return (await getStandardById(id))!;
  } catch (err) {
    console.error("[extractionStandards] Failed to create standard:", err);
    throw err;
  }
}

/** Get standard by ID */
export async function getStandardById(id: string): Promise<ExtractionStandard | null> {
  try {
    const row = await db.queryOne<StandardRow>(
      `SELECT * FROM workspace_extraction_standards WHERE id = ?`,
      [id]
    );
    return row ? rowToStandard(row) : null;
  } catch (err) {
    console.error("[extractionStandards] Failed to get standard by id:", err);
    return null;
  }
}

/** Get all standards for a workspace, optionally filtered by document type */
export async function getStandardsByWorkspace(
  workspaceId: string,
  documentType?: DocumentType,
  enabledOnly?: boolean
): Promise<ExtractionStandard[]> {
  try {
    let query = `SELECT * FROM workspace_extraction_standards WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (documentType) {
      query += ` AND document_type = ?`;
      params.push(documentType);
    }

    if (enabledOnly) {
      query += ` AND enabled = 1`;
    }

    query += ` ORDER BY created_at DESC`;

    const rows = await db.queryAll<StandardRow>(query, params);
    return rows.map(rowToStandard);
  } catch (err) {
    console.error("[extractionStandards] Failed to get standards:", err);
    return [];
  }
}

/** Get enabled standards for anomaly detection */
export async function getEnabledStandards(
  workspaceId: string,
  documentType: DocumentType
): Promise<ExtractionStandard[]> {
  try {
    // Get standards that match the doc type OR are set to 'other' (applies to all)
    const rows = await db.queryAll<StandardRow>(
      `SELECT * FROM workspace_extraction_standards
       WHERE workspace_id = ?
         AND enabled = 1
         AND (document_type = ? OR document_type = 'other')
       ORDER BY created_at ASC`,
      [workspaceId, documentType]
    );
    return rows.map(rowToStandard);
  } catch (err) {
    console.error("[extractionStandards] Failed to get enabled standards:", err);
    return [];
  }
}

/** Update an existing standard */
export async function updateStandard(
  id: string,
  updates: UpdateStandardInput
): Promise<ExtractionStandard | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.documentType !== undefined) {
    sets.push("document_type = ?");
    params.push(updates.documentType);
  }

  if (updates.ruleType !== undefined) {
    sets.push("rule_type = ?");
    params.push(updates.ruleType);
  }

  if (updates.config !== undefined) {
    sets.push("rule_config_json = ?");
    params.push(JSON.stringify(updates.config));
  }

  if (updates.severity !== undefined) {
    sets.push("severity = ?");
    params.push(updates.severity);
  }

  if (updates.enabled !== undefined) {
    sets.push("enabled = ?");
    params.push(updates.enabled ? 1 : 0);
  }

  if (sets.length === 0) {
    // No updates provided, return current state
    return getStandardById(id);
  }

  params.push(id);

  try {
    const result = await db.run(
      `UPDATE workspace_extraction_standards SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    if (result.changes === 0) {
      return null;
    }

    return getStandardById(id);
  } catch (err) {
    console.error("[extractionStandards] Failed to update standard:", err);
    return null;
  }
}

/** Delete a standard by ID */
export async function deleteStandard(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM workspace_extraction_standards WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[extractionStandards] Failed to delete standard:", err);
    return false;
  }
}

/** Delete all standards for a workspace */
export async function deleteStandardsByWorkspace(workspaceId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM workspace_extraction_standards WHERE workspace_id = ?`,
      [workspaceId]
    );
    return result.changes;
  } catch (err) {
    console.error("[extractionStandards] Failed to delete standards by workspace:", err);
    return 0;
  }
}

/** Count standards for a workspace */
export async function countStandards(workspaceId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM workspace_extraction_standards WHERE workspace_id = ?`,
      [workspaceId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[extractionStandards] Failed to count standards:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const ExtractionStandardsStore = {
  create: createStandard,
  getById: getStandardById,
  getByWorkspace: getStandardsByWorkspace,
  getEnabled: getEnabledStandards,
  update: updateStandard,
  delete: deleteStandard,
  deleteByWorkspace: deleteStandardsByWorkspace,
  count: countStandards,
  // Validators
  validateRuleType,
  validateSeverity,
  validateDocumentType,
};
