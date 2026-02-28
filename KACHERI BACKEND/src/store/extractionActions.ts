// KACHERI BACKEND/src/store/extractionActions.ts
// Document Intelligence: Store for extraction actions (reminders, flags, exports)
//
// Tables: extraction_actions
// See: Docs/Roadmap/document-intelligence-work-scope.md

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type ActionType = "reminder" | "flag_review" | "export" | "compare";
export type ActionStatus = "pending" | "scheduled" | "completed" | "cancelled";

// Domain type (camelCase, for API)
export interface ExtractionAction {
  id: string;
  extractionId: string;
  actionType: ActionType;
  fieldPath: string | null;
  config: Record<string, unknown> | null;
  status: ActionStatus;
  scheduledFor: string | null;  // ISO string
  completedAt: string | null;   // ISO string
  createdBy: string;
  createdAt: string;            // ISO string
}

// Row type (snake_case, matches DB)
interface ActionRow {
  id: string;
  extraction_id: string;
  action_type: string;
  field_path: string | null;
  config_json: string | null;
  status: string;
  scheduled_for: number | null;
  completed_at: number | null;
  created_by: string;
  created_at: number;
}

export interface CreateActionInput {
  extractionId: string;
  actionType: ActionType;
  fieldPath?: string;
  config?: Record<string, unknown>;
  scheduledFor?: number;  // Unix timestamp ms
  createdBy: string;
}

export interface ActionFilter {
  extractionId?: string;
  actionType?: ActionType;
  status?: ActionStatus;
  limit?: number;
  offset?: number;
}

/* ---------- Row to Domain Converter ---------- */

function rowToAction(row: ActionRow): ExtractionAction {
  return {
    id: row.id,
    extractionId: row.extraction_id,
    actionType: row.action_type as ActionType,
    fieldPath: row.field_path,
    config: parseJson(row.config_json, null),
    status: row.status as ActionStatus,
    scheduledFor: row.scheduled_for
      ? new Date(row.scheduled_for).toISOString()
      : null,
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
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

/* ---------- Action CRUD ---------- */

/** Create a new action */
export async function createAction(input: CreateActionInput): Promise<ExtractionAction> {
  const id = nanoid(12);
  const now = Date.now();

  // If scheduledFor is provided, set status to 'scheduled'
  const status: ActionStatus = input.scheduledFor ? "scheduled" : "pending";

  try {
    await db.run(
      `INSERT INTO extraction_actions (
        id, extraction_id, action_type, field_path, config_json,
        status, scheduled_for, completed_at, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        input.extractionId,
        input.actionType,
        input.fieldPath ?? null,
        input.config ? JSON.stringify(input.config) : null,
        status,
        input.scheduledFor ?? null,
        input.createdBy,
        now,
      ]
    );

    return (await getActionById(id))!;
  } catch (err) {
    console.error("[extractionActions] Failed to create action:", err);
    throw err;
  }
}

/** Get action by ID */
export async function getActionById(id: string): Promise<ExtractionAction | null> {
  try {
    const row = await db.queryOne<ActionRow>(
      `SELECT * FROM extraction_actions WHERE id = ?`,
      [id]
    );
    return row ? rowToAction(row) : null;
  } catch (err) {
    console.error("[extractionActions] Failed to get action by id:", err);
    return null;
  }
}

/** Get all actions for an extraction */
export async function getActionsByExtraction(extractionId: string): Promise<ExtractionAction[]> {
  try {
    const rows = await db.queryAll<ActionRow>(
      `SELECT * FROM extraction_actions
       WHERE extraction_id = ?
       ORDER BY created_at DESC`,
      [extractionId]
    );
    return rows.map(rowToAction);
  } catch (err) {
    console.error("[extractionActions] Failed to get actions by extraction:", err);
    return [];
  }
}

/** Get actions with filters */
export async function getActions(filter: ActionFilter = {}): Promise<ExtractionAction[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.extractionId) {
    conditions.push("extraction_id = ?");
    params.push(filter.extractionId);
  }

  if (filter.actionType) {
    conditions.push("action_type = ?");
    params.push(filter.actionType);
  }

  if (filter.status) {
    conditions.push("status = ?");
    params.push(filter.status);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;

  params.push(limit, offset);

  try {
    const rows = await db.queryAll<ActionRow>(
      `SELECT * FROM extraction_actions
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );
    return rows.map(rowToAction);
  } catch (err) {
    console.error("[extractionActions] Failed to get actions:", err);
    return [];
  }
}

/** Update action status */
export async function updateActionStatus(
  id: string,
  status: ActionStatus,
  completedAt?: number
): Promise<ExtractionAction | null> {
  try {
    const result = await db.run(
      `UPDATE extraction_actions SET status = ?, completed_at = ? WHERE id = ?`,
      [status, completedAt ?? null, id]
    );

    if (result.changes === 0) {
      return null;
    }

    return getActionById(id);
  } catch (err) {
    console.error("[extractionActions] Failed to update action status:", err);
    return null;
  }
}

/** Update action config */
export async function updateActionConfig(
  id: string,
  config: Record<string, unknown>
): Promise<ExtractionAction | null> {
  try {
    const result = await db.run(
      `UPDATE extraction_actions SET config_json = ? WHERE id = ?`,
      [JSON.stringify(config), id]
    );

    if (result.changes === 0) {
      return null;
    }

    return getActionById(id);
  } catch (err) {
    console.error("[extractionActions] Failed to update action config:", err);
    return null;
  }
}

/** Delete an action */
export async function deleteAction(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM extraction_actions WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[extractionActions] Failed to delete action:", err);
    return false;
  }
}

/** Get pending reminders that are due (scheduled_for <= now) */
export async function getPendingReminders(before: number): Promise<ExtractionAction[]> {
  try {
    const rows = await db.queryAll<ActionRow>(
      `SELECT * FROM extraction_actions
       WHERE action_type = 'reminder'
         AND status IN ('pending', 'scheduled')
         AND scheduled_for IS NOT NULL
         AND scheduled_for <= ?
       ORDER BY scheduled_for ASC`,
      [before]
    );
    return rows.map(rowToAction);
  } catch (err) {
    console.error("[extractionActions] Failed to get pending reminders:", err);
    return [];
  }
}

/** Get all actions of a specific type for an extraction */
export async function getActionsByType(
  extractionId: string,
  actionType: ActionType
): Promise<ExtractionAction[]> {
  try {
    const rows = await db.queryAll<ActionRow>(
      `SELECT * FROM extraction_actions
       WHERE extraction_id = ? AND action_type = ?
       ORDER BY created_at DESC`,
      [extractionId, actionType]
    );
    return rows.map(rowToAction);
  } catch (err) {
    console.error("[extractionActions] Failed to get actions by type:", err);
    return [];
  }
}

/** Cancel all pending actions for an extraction */
export async function cancelPendingActions(extractionId: string): Promise<number> {
  const now = Date.now();

  try {
    const result = await db.run(
      `UPDATE extraction_actions
       SET status = 'cancelled', completed_at = ?
       WHERE extraction_id = ? AND status IN ('pending', 'scheduled')`,
      [now, extractionId]
    );
    return result.changes;
  } catch (err) {
    console.error("[extractionActions] Failed to cancel pending actions:", err);
    return 0;
  }
}

/** Count actions by status for an extraction */
export async function countActionsByStatus(
  extractionId: string
): Promise<Record<ActionStatus, number>> {
  const result: Record<ActionStatus, number> = {
    pending: 0,
    scheduled: 0,
    completed: 0,
    cancelled: 0,
  };

  try {
    const rows = await db.queryAll<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count
       FROM extraction_actions
       WHERE extraction_id = ?
       GROUP BY status`,
      [extractionId]
    );

    for (const row of rows) {
      const status = row.status as ActionStatus;
      if (status in result) {
        result[status] = row.count;
      }
    }

    return result;
  } catch (err) {
    console.error("[extractionActions] Failed to count actions:", err);
    return result;
  }
}

/* ---------- Export aggregated store object ---------- */

export const ExtractionActionsStore = {
  create: createAction,
  getById: getActionById,
  getByExtraction: getActionsByExtraction,
  getAll: getActions,
  updateStatus: updateActionStatus,
  updateConfig: updateActionConfig,
  delete: deleteAction,
  getPendingReminders,
  getByType: getActionsByType,
  cancelPending: cancelPendingActions,
  countByStatus: countActionsByStatus,
};
