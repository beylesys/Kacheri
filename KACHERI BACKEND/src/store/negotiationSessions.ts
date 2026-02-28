// KACHERI BACKEND/src/store/negotiationSessions.ts
// Negotiation Sessions: Store for top-level negotiation tracking
//
// Tables: negotiation_sessions
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type NegotiationStatus =
  | "draft"
  | "active"
  | "awaiting_response"
  | "reviewing"
  | "settled"
  | "abandoned";

// Domain type (camelCase, for API)
export interface NegotiationSession {
  id: string;
  docId: string;
  workspaceId: string;
  title: string;
  counterpartyName: string;
  counterpartyLabel: string | null;
  status: NegotiationStatus;
  currentRound: number;
  totalChanges: number;
  acceptedChanges: number;
  rejectedChanges: number;
  pendingChanges: number;
  startedBy: string;
  settledAt: string | null; // ISO string
  createdAt: string;        // ISO string
  updatedAt: string;        // ISO string
}

// Row type (snake_case, matches DB)
interface SessionRow {
  id: string;
  doc_id: string;
  workspace_id: string;
  title: string;
  counterparty_name: string;
  counterparty_label: string | null;
  status: string;
  current_round: number;
  total_changes: number;
  accepted_changes: number;
  rejected_changes: number;
  pending_changes: number;
  started_by: string;
  settled_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateSessionInput {
  docId: string;
  workspaceId: string;
  title: string;
  counterpartyName: string;
  counterpartyLabel?: string;
  startedBy: string;
}

export interface UpdateSessionInput {
  title?: string;
  counterpartyName?: string;
  counterpartyLabel?: string | null;
  status?: NegotiationStatus;
}

/* ---------- Row to Domain Converters ---------- */

function rowToSession(row: SessionRow): NegotiationSession {
  return {
    id: row.id,
    docId: row.doc_id,
    workspaceId: row.workspace_id,
    title: row.title,
    counterpartyName: row.counterparty_name,
    counterpartyLabel: row.counterparty_label,
    status: row.status as NegotiationStatus,
    currentRound: row.current_round,
    totalChanges: row.total_changes,
    acceptedChanges: row.accepted_changes,
    rejectedChanges: row.rejected_changes,
    pendingChanges: row.pending_changes,
    startedBy: row.started_by,
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/* ---------- Validation ---------- */

const VALID_STATUSES: NegotiationStatus[] = [
  "draft", "active", "awaiting_response", "reviewing", "settled", "abandoned",
];

export function validateStatus(value: string): value is NegotiationStatus {
  return VALID_STATUSES.includes(value as NegotiationStatus);
}

/* ---------- CRUD Operations ---------- */

/** Create a new negotiation session */
export async function createSession(input: CreateSessionInput): Promise<NegotiationSession> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO negotiation_sessions (
        id, doc_id, workspace_id, title, counterparty_name, counterparty_label,
        status, current_round, total_changes, accepted_changes, rejected_changes,
        pending_changes, started_by, settled_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.docId,
      input.workspaceId,
      input.title,
      input.counterpartyName,
      input.counterpartyLabel ?? null,
      "draft",
      0,  // current_round
      0,  // total_changes
      0,  // accepted_changes
      0,  // rejected_changes
      0,  // pending_changes
      input.startedBy,
      null, // settled_at
      now,
      now
    ]);

    return (await getById(id))!;
  } catch (err) {
    console.error("[negotiationSessions] Failed to create session:", err);
    throw err;
  }
}

/** Get session by ID */
export async function getById(id: string): Promise<NegotiationSession | null> {
  try {
    const row = await db.queryOne<SessionRow>(
      `SELECT * FROM negotiation_sessions WHERE id = ?`,
      [id]
    );

    return row ? rowToSession(row) : null;
  } catch (err) {
    console.error("[negotiationSessions] Failed to get session by id:", err);
    return null;
  }
}

/** Get all negotiation sessions for a document */
export async function getByDoc(docId: string): Promise<NegotiationSession[]> {
  try {
    const rows = await db.queryAll<SessionRow>(`
      SELECT * FROM negotiation_sessions
      WHERE doc_id = ?
      ORDER BY created_at DESC
    `, [docId]);

    return rows.map(rowToSession);
  } catch (err) {
    console.error("[negotiationSessions] Failed to get sessions by doc:", err);
    return [];
  }
}

/** Get all negotiation sessions for a workspace with optional filters */
export async function getByWorkspace(
  workspaceId: string,
  opts?: {
    status?: NegotiationStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<NegotiationSession[]> {
  try {
    let query = `SELECT * FROM negotiation_sessions WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.status) {
      query += ` AND status = ?`;
      params.push(opts.status);
    }

    if (opts?.search) {
      query += ` AND (title LIKE ? OR counterparty_name LIKE ?)`;
      const searchTerm = `%${opts.search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ` ORDER BY created_at DESC`;

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<SessionRow>(query, params);
    return rows.map(rowToSession);
  } catch (err) {
    console.error("[negotiationSessions] Failed to get sessions by workspace:", err);
    return [];
  }
}

/** Update a negotiation session */
export async function updateSession(
  id: string,
  updates: UpdateSessionInput
): Promise<NegotiationSession | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.title !== undefined) {
    sets.push("title = ?");
    params.push(updates.title);
  }

  if (updates.counterpartyName !== undefined) {
    sets.push("counterparty_name = ?");
    params.push(updates.counterpartyName);
  }

  if (updates.counterpartyLabel !== undefined) {
    sets.push("counterparty_label = ?");
    params.push(updates.counterpartyLabel);
  }

  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);

    // Set settled_at when transitioning to settled
    if (updates.status === "settled") {
      sets.push("settled_at = ?");
      params.push(now);
    }
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE negotiation_sessions
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return await getById(id);
  } catch (err) {
    console.error("[negotiationSessions] Failed to update session:", err);
    return null;
  }
}

/** Update change counts and current round for a session */
export async function updateCounts(
  id: string,
  counts: {
    totalChanges?: number;
    acceptedChanges?: number;
    rejectedChanges?: number;
    pendingChanges?: number;
    currentRound?: number;
  }
): Promise<NegotiationSession | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (counts.totalChanges !== undefined) {
    sets.push("total_changes = ?");
    params.push(counts.totalChanges);
  }

  if (counts.acceptedChanges !== undefined) {
    sets.push("accepted_changes = ?");
    params.push(counts.acceptedChanges);
  }

  if (counts.rejectedChanges !== undefined) {
    sets.push("rejected_changes = ?");
    params.push(counts.rejectedChanges);
  }

  if (counts.pendingChanges !== undefined) {
    sets.push("pending_changes = ?");
    params.push(counts.pendingChanges);
  }

  if (counts.currentRound !== undefined) {
    sets.push("current_round = ?");
    params.push(counts.currentRound);
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE negotiation_sessions
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return await getById(id);
  } catch (err) {
    console.error("[negotiationSessions] Failed to update session counts:", err);
    return null;
  }
}

/** Delete a negotiation session */
export async function deleteSession(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM negotiation_sessions WHERE id = ?`,
      [id]
    );

    return result.changes > 0;
  } catch (err) {
    console.error("[negotiationSessions] Failed to delete session:", err);
    return false;
  }
}

/** Count negotiation sessions for a workspace */
export async function countSessions(
  workspaceId: string,
  opts?: { status?: NegotiationStatus }
): Promise<number> {
  try {
    let query = `SELECT COUNT(*) as count FROM negotiation_sessions WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.status) {
      query += ` AND status = ?`;
      params.push(opts.status);
    }

    const row = await db.queryOne<{ count: number }>(query, params);
    return row?.count ?? 0;
  } catch (err) {
    console.error("[negotiationSessions] Failed to count sessions:", err);
    return 0;
  }
}

/** Soft-archive draft sessions older than maxAgeDays (default 90).
 *  Transitions stale 'draft' sessions to 'abandoned'. Idempotent. */
export async function archiveStale(workspaceId: string, maxAgeDays = 90): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  try {
    const result = await db.run(`
      UPDATE negotiation_sessions
      SET status = 'abandoned', updated_at = ?
      WHERE workspace_id = ? AND status = 'draft' AND updated_at < ?
    `, [Date.now(), workspaceId, cutoff]);
    if (result.changes > 0) {
      console.log(
        "[negotiationSessions] Archived",
        result.changes,
        "stale draft sessions in workspace",
        workspaceId
      );
    }
    return result.changes;
  } catch (err) {
    console.error("[negotiationSessions] Failed to archive stale sessions:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const NegotiationSessionsStore = {
  create: createSession,
  getById,
  getByDoc,
  getByWorkspace,
  update: updateSession,
  updateCounts,
  delete: deleteSession,
  count: countSessions,
  archiveStale,
  // Validators
  validateStatus,
};
