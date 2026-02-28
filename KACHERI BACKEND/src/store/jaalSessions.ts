// KACHERI BACKEND/src/store/jaalSessions.ts
// JAAL Research Sessions: Store for research session lifecycle tracking
//
// Tables: jaal_sessions
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md - Slice S5

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type JaalSessionStatus = "active" | "ended" | "abandoned";

// Domain type (camelCase, for API) — matches frontend JaalSession interface
export interface JaalSession {
  id: string;
  workspaceId: string;
  userId: string;
  status: JaalSessionStatus;
  actionCount: number;
  metadata: Record<string, unknown>;
  startedAt: string;        // ISO string
  endedAt: string | null;   // ISO string or null
}

// Row type (snake_case, matches DB)
interface SessionRow {
  id: string;
  workspace_id: string;
  user_id: string;
  status: string;
  action_count: number;
  metadata_json: string | null;
  started_at: number;
  ended_at: number | null;
}

export interface CreateJaalSessionInput {
  workspaceId: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateJaalSessionInput {
  status?: JaalSessionStatus;
  metadata?: Record<string, unknown>;
}

/* ---------- Row to Domain Converter ---------- */

function rowToSession(row: SessionRow): JaalSession {
  let metadata: Record<string, unknown> = {};
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch {
      metadata = {};
    }
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    status: row.status as JaalSessionStatus,
    actionCount: row.action_count,
    metadata,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
  };
}

/* ---------- CRUD Operations ---------- */

/** Create a new research session */
async function create(input: CreateJaalSessionInput): Promise<JaalSession> {
  const id = nanoid(12);
  const now = Date.now();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  try {
    await db.run(
      `INSERT INTO jaal_sessions (
        id, workspace_id, user_id, status, action_count,
        metadata_json, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.workspaceId, input.userId, "active", 0, metadataJson, now, null]
    );

    return (await getById(id))!;
  } catch (err) {
    console.error("[jaalSessions] Failed to create session:", err);
    throw err;
  }
}

/** Get session by ID */
async function getById(id: string): Promise<JaalSession | null> {
  try {
    const row = await db.queryOne<SessionRow>(
      `SELECT * FROM jaal_sessions WHERE id = ?`,
      [id]
    );
    return row ? rowToSession(row) : null;
  } catch (err) {
    console.error("[jaalSessions] Failed to get session by id:", err);
    return null;
  }
}

/** List sessions for a workspace with optional filters */
async function listByWorkspace(
  workspaceId: string,
  opts?: {
    userId?: string;
    status?: JaalSessionStatus;
    limit?: number;
  }
): Promise<JaalSession[]> {
  try {
    let query = `SELECT * FROM jaal_sessions WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.userId) {
      query += ` AND user_id = ?`;
      params.push(opts.userId);
    }

    if (opts?.status) {
      query += ` AND status = ?`;
      params.push(opts.status);
    }

    query += ` ORDER BY started_at DESC`;

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);
    }

    const rows = await db.queryAll<SessionRow>(query, params);
    return rows.map(rowToSession);
  } catch (err) {
    console.error("[jaalSessions] Failed to list sessions:", err);
    return [];
  }
}

/** Update a session (status and/or metadata) */
async function update(
  id: string,
  updates: UpdateJaalSessionInput
): Promise<JaalSession | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);

    // Set ended_at when transitioning to ended or abandoned
    if (updates.status === "ended" || updates.status === "abandoned") {
      sets.push("ended_at = ?");
      params.push(Date.now());
    }
  }

  if (updates.metadata !== undefined) {
    sets.push("metadata_json = ?");
    params.push(JSON.stringify(updates.metadata));
  }

  if (sets.length === 0) {
    return getById(id);
  }

  params.push(id);

  try {
    const result = await db.run(
      `UPDATE jaal_sessions SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    if (result.changes === 0) {
      return null;
    }

    return getById(id);
  } catch (err) {
    console.error("[jaalSessions] Failed to update session:", err);
    return null;
  }
}

/** Atomically increment action count */
async function incrementActionCount(id: string): Promise<JaalSession | null> {
  try {
    const result = await db.run(
      `UPDATE jaal_sessions SET action_count = action_count + 1 WHERE id = ?`,
      [id]
    );

    if (result.changes === 0) {
      return null;
    }

    return getById(id);
  } catch (err) {
    console.error("[jaalSessions] Failed to increment action count:", err);
    return null;
  }
}

/** Delete a session (hard delete — cascades proofs to SET NULL) */
async function deleteSession(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM jaal_sessions WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[jaalSessions] Failed to delete session:", err);
    return false;
  }
}

/* ---------- Export ---------- */

export const JaalSessionStore = {
  create,
  getById,
  listByWorkspace,
  update,
  incrementActionCount,
  delete: deleteSession,
};
