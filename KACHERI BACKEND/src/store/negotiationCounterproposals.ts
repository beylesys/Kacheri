// KACHERI BACKEND/src/store/negotiationCounterproposals.ts
// Negotiation Counterproposals: Store for AI-generated counterproposal alternatives
//
// Tables: negotiation_counterproposals
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type CounterproposalMode = "balanced" | "favorable" | "minimal_change";

// Domain type (camelCase, for API)
export interface NegotiationCounterproposal {
  id: string;
  changeId: string;
  mode: CounterproposalMode;
  proposedText: string;
  rationale: string;
  clauseId: string | null;
  proofId: string | null;
  accepted: boolean;
  createdBy: string;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface CounterproposalRow {
  id: string;
  change_id: string;
  mode: string;
  proposed_text: string;
  rationale: string;
  clause_id: string | null;
  proof_id: string | null;
  accepted: number;
  created_by: string;
  created_at: number;
}

export interface CreateCounterproposalInput {
  changeId: string;
  mode: CounterproposalMode;
  proposedText: string;
  rationale: string;
  clauseId?: string;
  proofId?: string;
  createdBy: string;
}

/* ---------- Row to Domain Converters ---------- */

function rowToCounterproposal(row: CounterproposalRow): NegotiationCounterproposal {
  return {
    id: row.id,
    changeId: row.change_id,
    mode: row.mode as CounterproposalMode,
    proposedText: row.proposed_text,
    rationale: row.rationale,
    clauseId: row.clause_id,
    proofId: row.proof_id,
    accepted: row.accepted === 1,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ---------- Validation ---------- */

const VALID_MODES: CounterproposalMode[] = ["balanced", "favorable", "minimal_change"];

export function validateMode(value: string): value is CounterproposalMode {
  return VALID_MODES.includes(value as CounterproposalMode);
}

/* ---------- CRUD Operations ---------- */

/** Create a new counterproposal */
export async function createCounterproposal(
  input: CreateCounterproposalInput
): Promise<NegotiationCounterproposal> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(
      `INSERT INTO negotiation_counterproposals (
        id, change_id, mode, proposed_text, rationale,
        clause_id, proof_id, accepted, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.changeId,
        input.mode,
        input.proposedText,
        input.rationale,
        input.clauseId ?? null,
        input.proofId ?? null,
        0, // accepted
        input.createdBy,
        now,
      ]
    );

    return (await getById(id))!;
  } catch (err) {
    console.error("[negotiationCounterproposals] Failed to create counterproposal:", err);
    throw err;
  }
}

/** Get counterproposal by ID */
export async function getById(id: string): Promise<NegotiationCounterproposal | null> {
  try {
    const row = await db.queryOne<CounterproposalRow>(
      `SELECT * FROM negotiation_counterproposals WHERE id = ?`,
      [id]
    );
    return row ? rowToCounterproposal(row) : null;
  } catch (err) {
    console.error("[negotiationCounterproposals] Failed to get counterproposal by id:", err);
    return null;
  }
}

/** Get all counterproposals for a change */
export async function getByChange(changeId: string): Promise<NegotiationCounterproposal[]> {
  try {
    const rows = await db.queryAll<CounterproposalRow>(
      `SELECT * FROM negotiation_counterproposals
       WHERE change_id = ?
       ORDER BY created_at DESC`,
      [changeId]
    );
    return rows.map(rowToCounterproposal);
  } catch (err) {
    console.error("[negotiationCounterproposals] Failed to get counterproposals by change:", err);
    return [];
  }
}

/** Accept a counterproposal (set accepted = 1) */
export async function accept(id: string): Promise<NegotiationCounterproposal | null> {
  try {
    const result = await db.run(
      `UPDATE negotiation_counterproposals SET accepted = 1 WHERE id = ?`,
      [id]
    );

    if (result.changes === 0) {
      return null;
    }

    return getById(id);
  } catch (err) {
    console.error("[negotiationCounterproposals] Failed to accept counterproposal:", err);
    return null;
  }
}

/** Delete all counterproposals for a change (cascade cleanup) */
export async function deleteByChange(changeId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM negotiation_counterproposals WHERE change_id = ?`,
      [changeId]
    );
    return result.changes;
  } catch (err) {
    console.error("[negotiationCounterproposals] Failed to delete counterproposals by change:", err);
    return 0;
  }
}

/** Count counterproposals for a change */
export async function countByChange(changeId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM negotiation_counterproposals WHERE change_id = ?`,
      [changeId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[negotiationCounterproposals] Failed to count counterproposals:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const NegotiationCounterproposalsStore = {
  create: createCounterproposal,
  getById,
  getByChange,
  accept,
  deleteByChange,
  count: countByChange,
  // Validators
  validateMode,
};
