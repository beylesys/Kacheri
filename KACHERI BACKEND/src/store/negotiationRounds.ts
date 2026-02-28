// KACHERI BACKEND/src/store/negotiationRounds.ts
// Negotiation Rounds: Store for individual rounds within a negotiation
//
// Tables: negotiation_rounds
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type RoundType = "initial_proposal" | "counterproposal" | "revision" | "final";

export type ProposedBy = "internal" | "external";

// Domain type (camelCase, for API)
export interface NegotiationRound {
  id: string;
  sessionId: string;
  roundNumber: number;
  roundType: RoundType;
  proposedBy: ProposedBy;
  proposerLabel: string | null;
  snapshotHtml: string;
  snapshotText: string;
  snapshotHash: string;
  versionId: string | null;
  importSource: string | null;
  notes: string | null;
  changeCount: number;
  createdBy: string;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface RoundRow {
  id: string;
  session_id: string;
  round_number: number;
  round_type: string;
  proposed_by: string;
  proposer_label: string | null;
  snapshot_html: string;
  snapshot_text: string;
  snapshot_hash: string;
  version_id: string | null;
  import_source: string | null;
  notes: string | null;
  change_count: number;
  created_by: string;
  created_at: number;
}

export interface CreateRoundInput {
  sessionId: string;
  roundNumber: number;
  roundType: RoundType;
  proposedBy: ProposedBy;
  proposerLabel?: string;
  snapshotHtml: string;
  snapshotText: string;
  snapshotHash: string;
  versionId?: string;
  importSource?: string;
  notes?: string;
  createdBy: string;
}

/* ---------- Row to Domain Converters ---------- */

function rowToRound(row: RoundRow): NegotiationRound {
  return {
    id: row.id,
    sessionId: row.session_id,
    roundNumber: row.round_number,
    roundType: row.round_type as RoundType,
    proposedBy: row.proposed_by as ProposedBy,
    proposerLabel: row.proposer_label,
    snapshotHtml: row.snapshot_html,
    snapshotText: row.snapshot_text,
    snapshotHash: row.snapshot_hash,
    versionId: row.version_id,
    importSource: row.import_source,
    notes: row.notes,
    changeCount: row.change_count,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ---------- Validation ---------- */

const VALID_ROUND_TYPES: RoundType[] = [
  "initial_proposal", "counterproposal", "revision", "final",
];

export function validateRoundType(value: string): value is RoundType {
  return VALID_ROUND_TYPES.includes(value as RoundType);
}

const VALID_PROPOSED_BY: ProposedBy[] = ["internal", "external"];

export function validateProposedBy(value: string): value is ProposedBy {
  return VALID_PROPOSED_BY.includes(value as ProposedBy);
}

/* ---------- CRUD Operations ---------- */

/** Create a new negotiation round */
export async function createRound(input: CreateRoundInput): Promise<NegotiationRound> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(
      `INSERT INTO negotiation_rounds (
        id, session_id, round_number, round_type, proposed_by, proposer_label,
        snapshot_html, snapshot_text, snapshot_hash, version_id,
        import_source, notes, change_count, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.sessionId,
        input.roundNumber,
        input.roundType,
        input.proposedBy,
        input.proposerLabel ?? null,
        input.snapshotHtml,
        input.snapshotText,
        input.snapshotHash,
        input.versionId ?? null,
        input.importSource ?? null,
        input.notes ?? null,
        0, // change_count
        input.createdBy,
        now,
      ]
    );

    return (await getById(id))!;
  } catch (err) {
    console.error("[negotiationRounds] Failed to create round:", err);
    throw err;
  }
}

/** Get round by ID */
export async function getById(id: string): Promise<NegotiationRound | null> {
  try {
    const row = await db.queryOne<RoundRow>(
      `SELECT * FROM negotiation_rounds WHERE id = ?`,
      [id]
    );
    return row ? rowToRound(row) : null;
  } catch (err) {
    console.error("[negotiationRounds] Failed to get round by id:", err);
    return null;
  }
}

/** Get all rounds for a negotiation session, ordered by round number */
export async function getBySession(sessionId: string): Promise<NegotiationRound[]> {
  try {
    const rows = await db.queryAll<RoundRow>(
      `SELECT * FROM negotiation_rounds
       WHERE session_id = ?
       ORDER BY round_number ASC`,
      [sessionId]
    );
    return rows.map(rowToRound);
  } catch (err) {
    console.error("[negotiationRounds] Failed to get rounds by session:", err);
    return [];
  }
}

/** Get the most recent round for a negotiation session */
export async function getLatest(sessionId: string): Promise<NegotiationRound | null> {
  try {
    const row = await db.queryOne<RoundRow>(
      `SELECT * FROM negotiation_rounds
       WHERE session_id = ?
       ORDER BY round_number DESC
       LIMIT 1`,
      [sessionId]
    );
    return row ? rowToRound(row) : null;
  } catch (err) {
    console.error("[negotiationRounds] Failed to get latest round:", err);
    return null;
  }
}

/** Update change count for a round (after redline comparison) */
export async function updateChangeCount(id: string, count: number): Promise<boolean> {
  try {
    const result = await db.run(
      `UPDATE negotiation_rounds SET change_count = ? WHERE id = ?`,
      [count, id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[negotiationRounds] Failed to update change count:", err);
    return false;
  }
}

/** Delete all rounds for a session (cascade cleanup) */
export async function deleteBySession(sessionId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM negotiation_rounds WHERE session_id = ?`,
      [sessionId]
    );
    return result.changes;
  } catch (err) {
    console.error("[negotiationRounds] Failed to delete rounds by session:", err);
    return 0;
  }
}

/** Count rounds for a session */
export async function countRounds(sessionId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM negotiation_rounds WHERE session_id = ?`,
      [sessionId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[negotiationRounds] Failed to count rounds:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const NegotiationRoundsStore = {
  create: createRound,
  getById,
  getBySession,
  getLatest,
  updateChangeCount,
  deleteBySession,
  count: countRounds,
  // Validators
  validateRoundType,
  validateProposedBy,
};
