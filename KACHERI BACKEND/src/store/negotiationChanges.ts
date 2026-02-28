// KACHERI BACKEND/src/store/negotiationChanges.ts
// Negotiation Changes: Store for individual changes detected between rounds
//
// Tables: negotiation_changes
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type ChangeType = "insert" | "delete" | "replace";

export type ChangeCategory = "substantive" | "editorial" | "structural";

export type ChangeStatus = "pending" | "accepted" | "rejected" | "countered";

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** AI analysis result stored as JSON */
export interface AnalysisResult {
  category: ChangeCategory;
  riskLevel: RiskLevel;
  summary: string;
  impact: string;
  historicalContext: string | null;
  clauseComparison: string | null;
  complianceFlags: string[];
  recommendation: "accept" | "reject" | "counter" | "review";
  recommendationReason: string;
}

// Domain type (camelCase, for API)
export interface NegotiationChange {
  id: string;
  sessionId: string;
  roundId: string;
  changeType: ChangeType;
  category: ChangeCategory;
  sectionHeading: string | null;
  originalText: string | null;
  proposedText: string | null;
  fromPos: number;
  toPos: number;
  status: ChangeStatus;
  suggestionId: number | null;
  riskLevel: RiskLevel | null;
  aiAnalysis: AnalysisResult | null;
  resolvedBy: string | null;
  resolvedAt: string | null; // ISO string
  createdAt: string;         // ISO string
  updatedAt: string;         // ISO string
}

// Row type (snake_case, matches DB)
interface ChangeRow {
  id: string;
  session_id: string;
  round_id: string;
  change_type: string;
  category: string;
  section_heading: string | null;
  original_text: string | null;
  proposed_text: string | null;
  from_pos: number;
  to_pos: number;
  status: string;
  suggestion_id: number | null;
  risk_level: string | null;
  ai_analysis_json: string | null;
  resolved_by: string | null;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateChangeInput {
  sessionId: string;
  roundId: string;
  changeType: ChangeType;
  category?: ChangeCategory;
  sectionHeading?: string;
  originalText?: string;
  proposedText?: string;
  fromPos: number;
  toPos: number;
}

/* ---------- Row to Domain Converters ---------- */

function rowToChange(row: ChangeRow): NegotiationChange {
  return {
    id: row.id,
    sessionId: row.session_id,
    roundId: row.round_id,
    changeType: row.change_type as ChangeType,
    category: row.category as ChangeCategory,
    sectionHeading: row.section_heading,
    originalText: row.original_text,
    proposedText: row.proposed_text,
    fromPos: row.from_pos,
    toPos: row.to_pos,
    status: row.status as ChangeStatus,
    suggestionId: row.suggestion_id,
    riskLevel: row.risk_level as RiskLevel | null,
    aiAnalysis: parseJson<AnalysisResult | null>(row.ai_analysis_json, null),
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
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

const VALID_CHANGE_TYPES: ChangeType[] = ["insert", "delete", "replace"];
const VALID_CATEGORIES: ChangeCategory[] = ["substantive", "editorial", "structural"];
const VALID_STATUSES: ChangeStatus[] = ["pending", "accepted", "rejected", "countered"];
const VALID_RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];

export function validateChangeType(value: string): value is ChangeType {
  return VALID_CHANGE_TYPES.includes(value as ChangeType);
}

export function validateCategory(value: string): value is ChangeCategory {
  return VALID_CATEGORIES.includes(value as ChangeCategory);
}

export function validateStatus(value: string): value is ChangeStatus {
  return VALID_STATUSES.includes(value as ChangeStatus);
}

export function validateRiskLevel(value: string): value is RiskLevel {
  return VALID_RISK_LEVELS.includes(value as RiskLevel);
}

const INSERT_SQL = `
  INSERT INTO negotiation_changes (
    id, session_id, round_id, change_type, category, section_heading,
    original_text, proposed_text, from_pos, to_pos, status,
    suggestion_id, risk_level, ai_analysis_json,
    resolved_by, resolved_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/* ---------- CRUD Operations ---------- */

/** Create a single negotiation change */
export async function createChange(input: CreateChangeInput): Promise<NegotiationChange> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(INSERT_SQL, [
      id,
      input.sessionId,
      input.roundId,
      input.changeType,
      input.category ?? "editorial",
      input.sectionHeading ?? null,
      input.originalText ?? null,
      input.proposedText ?? null,
      input.fromPos,
      input.toPos,
      "pending",
      null, // suggestion_id
      null, // risk_level
      null, // ai_analysis_json
      null, // resolved_by
      null, // resolved_at
      now,
      now,
    ]);

    return (await getById(id))!;
  } catch (err) {
    console.error("[negotiationChanges] Failed to create change:", err);
    throw err;
  }
}

/** Batch create multiple changes in a transaction */
export async function batchCreate(changes: CreateChangeInput[]): Promise<NegotiationChange[]> {
  const now = Date.now();
  const ids: string[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const input of changes) {
        const id = nanoid(12);
        ids.push(id);

        await tx.run(INSERT_SQL, [
          id,
          input.sessionId,
          input.roundId,
          input.changeType,
          input.category ?? "editorial",
          input.sectionHeading ?? null,
          input.originalText ?? null,
          input.proposedText ?? null,
          input.fromPos,
          input.toPos,
          "pending",
          null, // suggestion_id
          null, // risk_level
          null, // ai_analysis_json
          null, // resolved_by
          null, // resolved_at
          now,
          now,
        ]);
      }
    });

    return await Promise.all(ids.map(async (id) => (await getById(id))!));
  } catch (err) {
    console.error("[negotiationChanges] Failed to batch create changes:", err);
    throw err;
  }
}

/** Get change by ID */
export async function getById(id: string): Promise<NegotiationChange | null> {
  try {
    const row = await db.queryOne<ChangeRow>(
      `SELECT * FROM negotiation_changes WHERE id = ?`,
      [id]
    );
    return row ? rowToChange(row) : null;
  } catch (err) {
    console.error("[negotiationChanges] Failed to get change by id:", err);
    return null;
  }
}

/** Get changes for a round with optional filters and pagination */
export async function getByRound(
  roundId: string,
  opts?: {
    status?: ChangeStatus;
    category?: ChangeCategory;
    riskLevel?: RiskLevel;
    limit?: number;
    offset?: number;
  }
): Promise<NegotiationChange[]> {
  try {
    let query = `SELECT * FROM negotiation_changes WHERE round_id = ?`;
    const params: unknown[] = [roundId];

    if (opts?.status) {
      query += ` AND status = ?`;
      params.push(opts.status);
    }

    if (opts?.category) {
      query += ` AND category = ?`;
      params.push(opts.category);
    }

    if (opts?.riskLevel) {
      query += ` AND risk_level = ?`;
      params.push(opts.riskLevel);
    }

    query += ` ORDER BY from_pos ASC`;

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<ChangeRow>(query, params);
    return rows.map(rowToChange);
  } catch (err) {
    console.error("[negotiationChanges] Failed to get changes by round:", err);
    return [];
  }
}

/** Get changes for a session with optional filters */
export async function getBySession(
  sessionId: string,
  opts?: {
    status?: ChangeStatus;
    category?: ChangeCategory;
    riskLevel?: RiskLevel;
    limit?: number;
    offset?: number;
  }
): Promise<NegotiationChange[]> {
  try {
    let query = `SELECT * FROM negotiation_changes WHERE session_id = ?`;
    const params: unknown[] = [sessionId];

    if (opts?.status) {
      query += ` AND status = ?`;
      params.push(opts.status);
    }

    if (opts?.category) {
      query += ` AND category = ?`;
      params.push(opts.category);
    }

    if (opts?.riskLevel) {
      query += ` AND risk_level = ?`;
      params.push(opts.riskLevel);
    }

    query += ` ORDER BY from_pos ASC`;

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<ChangeRow>(query, params);
    return rows.map(rowToChange);
  } catch (err) {
    console.error("[negotiationChanges] Failed to get changes by session:", err);
    return [];
  }
}

/** Get changes by status for a session */
export async function getByStatus(
  sessionId: string,
  status: ChangeStatus
): Promise<NegotiationChange[]> {
  try {
    const rows = await db.queryAll<ChangeRow>(
      `SELECT * FROM negotiation_changes
       WHERE session_id = ? AND status = ?
       ORDER BY from_pos ASC`,
      [sessionId, status]
    );
    return rows.map(rowToChange);
  } catch (err) {
    console.error("[negotiationChanges] Failed to get changes by status:", err);
    return [];
  }
}

/** Update change status (accept/reject/counter) */
export async function updateStatus(
  id: string,
  status: ChangeStatus,
  resolvedBy?: string
): Promise<NegotiationChange | null> {
  const now = Date.now();

  try {
    const result = await db.run(
      `UPDATE negotiation_changes
       SET status = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        status,
        resolvedBy ?? null,
        status !== "pending" ? now : null,
        now,
        id,
      ]
    );

    if (result.changes === 0) {
      return null;
    }

    return getById(id);
  } catch (err) {
    console.error("[negotiationChanges] Failed to update change status:", err);
    return null;
  }
}

/** Store AI analysis result for a change */
export async function updateAnalysis(
  id: string,
  analysis: AnalysisResult,
  riskLevel: RiskLevel
): Promise<NegotiationChange | null> {
  const now = Date.now();

  try {
    const result = await db.run(
      `UPDATE negotiation_changes
       SET ai_analysis_json = ?, risk_level = ?, category = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(analysis), riskLevel, analysis.category, now, id]
    );

    if (result.changes === 0) {
      return null;
    }

    return getById(id);
  } catch (err) {
    console.error("[negotiationChanges] Failed to update analysis:", err);
    return null;
  }
}

/** Batch update status for all pending changes in a session (accept-all / reject-all) */
export async function batchUpdateStatus(
  sessionId: string,
  status: ChangeStatus,
  resolvedBy?: string
): Promise<number> {
  const now = Date.now();

  try {
    const result = await db.run(
      `UPDATE negotiation_changes
       SET status = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
       WHERE session_id = ? AND status = 'pending'`,
      [status, resolvedBy ?? null, now, now, sessionId]
    );
    return result.changes;
  } catch (err) {
    console.error("[negotiationChanges] Failed to batch update status:", err);
    return 0;
  }
}

/** Count total changes for a session */
export async function countBySession(sessionId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM negotiation_changes WHERE session_id = ?`,
      [sessionId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[negotiationChanges] Failed to count changes:", err);
    return 0;
  }
}

/** Count changes by status for a session */
export async function countByStatus(sessionId: string): Promise<{
  pending: number;
  accepted: number;
  rejected: number;
  countered: number;
}> {
  try {
    const rows = await db.queryAll<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count
       FROM negotiation_changes
       WHERE session_id = ?
       GROUP BY status`,
      [sessionId]
    );

    const counts = { pending: 0, accepted: 0, rejected: 0, countered: 0 };
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as ChangeStatus] = row.count;
      }
    }

    return counts;
  } catch (err) {
    console.error("[negotiationChanges] Failed to count by status:", err);
    return { pending: 0, accepted: 0, rejected: 0, countered: 0 };
  }
}

/** Count changes for a round with optional filters */
export async function countByRound(
  roundId: string,
  opts?: {
    status?: ChangeStatus;
    category?: ChangeCategory;
    riskLevel?: RiskLevel;
  }
): Promise<number> {
  try {
    let query = `SELECT COUNT(*) as count FROM negotiation_changes WHERE round_id = ?`;
    const params: unknown[] = [roundId];

    if (opts?.status) {
      query += ` AND status = ?`;
      params.push(opts.status);
    }

    if (opts?.category) {
      query += ` AND category = ?`;
      params.push(opts.category);
    }

    if (opts?.riskLevel) {
      query += ` AND risk_level = ?`;
      params.push(opts.riskLevel);
    }

    const row = await db.queryOne<{ count: number }>(query, params);
    return row?.count ?? 0;
  } catch (err) {
    console.error("[negotiationChanges] Failed to count changes by round:", err);
    return 0;
  }
}

/** Count changes for a session with optional filters */
export async function countBySessionFiltered(
  sessionId: string,
  opts?: {
    roundId?: string;
    status?: ChangeStatus;
    category?: ChangeCategory;
    riskLevel?: RiskLevel;
  }
): Promise<number> {
  try {
    let query = `SELECT COUNT(*) as count FROM negotiation_changes WHERE session_id = ?`;
    const params: unknown[] = [sessionId];

    if (opts?.roundId) {
      query += ` AND round_id = ?`;
      params.push(opts.roundId);
    }

    if (opts?.status) {
      query += ` AND status = ?`;
      params.push(opts.status);
    }

    if (opts?.category) {
      query += ` AND category = ?`;
      params.push(opts.category);
    }

    if (opts?.riskLevel) {
      query += ` AND risk_level = ?`;
      params.push(opts.riskLevel);
    }

    const row = await db.queryOne<{ count: number }>(query, params);
    return row?.count ?? 0;
  } catch (err) {
    console.error("[negotiationChanges] Failed to count filtered session changes:", err);
    return 0;
  }
}

/** Link a suggestion ID to a negotiation change (used during settlement) */
export async function linkSuggestion(
  id: string,
  suggestionId: number
): Promise<boolean> {
  const now = Date.now();
  try {
    const result = await db.run(
      `UPDATE negotiation_changes SET suggestion_id = ?, updated_at = ? WHERE id = ?`,
      [suggestionId, now, id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[negotiationChanges] Failed to link suggestion:", err);
    return false;
  }
}

/* ---------- Export aggregated store object ---------- */

export const NegotiationChangesStore = {
  create: createChange,
  batchCreate,
  getById,
  getByRound,
  getBySession,
  getByStatus,
  updateStatus,
  updateAnalysis,
  batchUpdateStatus,
  linkSuggestion,
  countBySession,
  countBySessionFiltered,
  countByRound,
  countByStatus,
  // Validators
  validateChangeType,
  validateCategory,
  validateStatus,
  validateRiskLevel,
};
