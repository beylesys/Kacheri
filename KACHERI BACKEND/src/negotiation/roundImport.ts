// KACHERI BACKEND/src/negotiation/roundImport.ts
// Round Import Pipeline: Orchestrates importing a document as a negotiation round
//
// Takes already-converted HTML + text (conversion done at route level via existing
// import pipeline). Handles: round creation, redline comparison, change storage,
// version snapshot creation, and session counter updates.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 5

import { createHash } from "crypto";
import { htmlToPlainText } from "../compliance/engine";
import { createVersion } from "../store/versions";
import {
  NegotiationSessionsStore,
  type NegotiationSession,
  type NegotiationStatus,
} from "../store/negotiationSessions";
import {
  NegotiationRoundsStore,
  type NegotiationRound,
  type RoundType,
  type ProposedBy,
} from "../store/negotiationRounds";
import {
  NegotiationChangesStore,
  type NegotiationChange,
  type CreateChangeInput,
} from "../store/negotiationChanges";
import { compareRounds } from "./redlineComparator";
import type { RedlineCompareResult } from "./types";

/* ============= Types ============= */

/** Input for importing a round (external or internal). */
export interface ImportRoundInput {
  /** Negotiation session ID */
  sessionId: string;
  /** Document ID (for version snapshot creation) */
  docId: string;
  /** Already-converted HTML content */
  html: string;
  /** Plain text content for diffing. If omitted, extracted from html. */
  text?: string;
  /** Who proposed this round */
  proposedBy: ProposedBy;
  /** Human-readable proposer label (e.g., "Acme Legal", "John Smith") */
  proposerLabel?: string;
  /** Import source tag (e.g., 'upload:docx', 'upload:pdf', 'manual') */
  importSource?: string;
  /** Optional round-level notes */
  notes?: string;
  /** User ID performing the import */
  createdBy: string;
}

/** Result of importing a round. */
export interface ImportRoundResult {
  /** The newly created round */
  round: NegotiationRound;
  /** All detected changes from redline comparison */
  changes: NegotiationChange[];
  /** Redline comparison result (null if first round) */
  comparison: RedlineCompareResult | null;
  /** Version snapshot ID (null if version creation failed) */
  versionId: number | null;
  /** Updated session after count/status updates */
  sessionUpdated: NegotiationSession;
}

/* ============= Constants ============= */

/** Session statuses that are terminal — cannot add rounds. */
const TERMINAL_STATUSES: NegotiationStatus[] = ["settled", "abandoned"];

/** Session statuses that auto-transition to 'reviewing' on external round import. */
const AUTO_REVIEW_STATUSES: NegotiationStatus[] = ["draft", "awaiting_response"];

/* ============= Main Entry Point ============= */

/**
 * Import a document as a new negotiation round.
 *
 * Pipeline:
 * 1. Validate session exists and is not terminal
 * 2. Compute SHA256 hash (idempotency check)
 * 3. Determine round number and type
 * 4. Create version snapshot in document history
 * 5. Create negotiation round record
 * 6. Run redline comparison against previous round
 * 7. Batch create negotiation_changes records
 * 8. Update round change count
 * 9. Update session counts and status
 * 10. Return result
 */
export async function importRound(input: ImportRoundInput): Promise<ImportRoundResult> {
  const {
    sessionId,
    docId,
    html,
    proposedBy,
    proposerLabel,
    importSource,
    notes,
    createdBy,
  } = input;

  // Resolve plain text: use provided text or extract from HTML
  const text = input.text?.trim() || htmlToPlainText(html);

  // Step 1: Validate session
  const session = await NegotiationSessionsStore.getById(sessionId);
  if (!session) {
    throw new Error(`Negotiation session not found: ${sessionId}`);
  }

  if (TERMINAL_STATUSES.includes(session.status)) {
    throw new Error(
      `Cannot add rounds to ${session.status} session (${sessionId})`
    );
  }

  // Step 2: Compute SHA256 hash for integrity and idempotency
  const snapshotHash = computeHash(html);

  // Idempotency check: if a round with this hash already exists, return it
  const existingRound = await findRoundByHash(sessionId, snapshotHash);
  if (existingRound) {
    return buildExistingRoundResult(existingRound, session);
  }

  // Step 3: Determine round number and type
  const previousRound = await NegotiationRoundsStore.getLatest(sessionId);
  const roundNumber = previousRound ? previousRound.roundNumber + 1 : 1;
  const roundType = determineRoundType(roundNumber, proposedBy, previousRound);

  // Step 4: Create version snapshot in document history
  const versionName = buildVersionName(roundNumber, proposedBy, session.counterpartyName);
  let versionId: number | null = null;

  try {
    const versionResult = await createVersion({
      docId,
      name: versionName,
      snapshotHtml: html,
      snapshotText: text,
      createdBy,
      metadata: {
        notes: `Negotiation round ${roundNumber} — ${proposedBy}`,
      },
    });

    if (versionResult) {
      versionId = versionResult.id;
    }
  } catch (err) {
    // Version creation failure is non-fatal — log and continue
    console.error("[roundImport] Failed to create version snapshot:", err);
  }

  // Step 5: Create negotiation round record
  const round = await NegotiationRoundsStore.create({
    sessionId,
    roundNumber,
    roundType,
    proposedBy,
    proposerLabel,
    snapshotHtml: html,
    snapshotText: text,
    snapshotHash,
    versionId: versionId != null ? String(versionId) : undefined,
    importSource,
    notes,
    createdBy,
  });

  // Step 6: Run redline comparison against previous round
  let comparison: RedlineCompareResult | null = null;
  let changes: NegotiationChange[] = [];

  if (previousRound) {
    comparison = compareRounds({
      previousHtml: previousRound.snapshotHtml,
      previousText: previousRound.snapshotText,
      currentHtml: html,
      currentText: text,
      sessionId,
      roundId: round.id,
    });

    // Step 7: Batch create negotiation_changes
    if (comparison.changes.length > 0) {
      const changeInputs: CreateChangeInput[] = comparison.changes.map((dc) => ({
        sessionId,
        roundId: round.id,
        changeType: dc.changeType,
        category: dc.category,
        sectionHeading: dc.sectionHeading ?? undefined,
        originalText: dc.originalText ?? undefined,
        proposedText: dc.proposedText ?? undefined,
        fromPos: dc.fromPos,
        toPos: dc.toPos,
      }));

      changes = await NegotiationChangesStore.batchCreate(changeInputs);
    }
  }

  // Step 8: Update round change count
  await NegotiationRoundsStore.updateChangeCount(round.id, changes.length);

  // Step 9: Update session counts and status
  const statusCounts = await NegotiationChangesStore.countByStatus(sessionId);
  const totalChanges =
    statusCounts.pending +
    statusCounts.accepted +
    statusCounts.rejected +
    statusCounts.countered;

  const sessionUpdates: {
    totalChanges: number;
    pendingChanges: number;
    acceptedChanges: number;
    rejectedChanges: number;
    currentRound: number;
  } = {
    totalChanges,
    pendingChanges: statusCounts.pending,
    acceptedChanges: statusCounts.accepted,
    rejectedChanges: statusCounts.rejected,
    currentRound: roundNumber,
  };

  await NegotiationSessionsStore.updateCounts(sessionId, sessionUpdates);

  // Auto-transition session status on external round import
  if (
    proposedBy === "external" &&
    AUTO_REVIEW_STATUSES.includes(session.status)
  ) {
    await NegotiationSessionsStore.update(sessionId, { status: "reviewing" });
  }

  // Fetch updated session
  const sessionUpdated = (await NegotiationSessionsStore.getById(sessionId))!;

  return {
    round,
    changes,
    comparison,
    versionId,
    sessionUpdated,
  };
}

/* ============= Helpers ============= */

/** Compute SHA256 hash of HTML content. */
function computeHash(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

/**
 * Determine the round type based on context.
 *
 * Rules:
 * - Round 1 → initial_proposal
 * - External round after round 1 → counterproposal
 * - Internal round after round 1 → revision
 * - Override: if previous round is final, new round is also final (shouldn't happen)
 */
function determineRoundType(
  roundNumber: number,
  proposedBy: ProposedBy,
  previousRound: NegotiationRound | null
): RoundType {
  if (roundNumber === 1) return "initial_proposal";
  if (proposedBy === "external") return "counterproposal";
  return "revision";
}

/** Build a human-readable version name for the document snapshot. */
function buildVersionName(
  roundNumber: number,
  proposedBy: ProposedBy,
  counterpartyName: string
): string {
  const party = proposedBy === "external" ? counterpartyName : "Internal";
  return `Negotiation Round ${roundNumber} — ${party}`;
}

/**
 * Find an existing round in a session by snapshot hash.
 * Used for re-import idempotency.
 */
async function findRoundByHash(
  sessionId: string,
  hash: string
): Promise<NegotiationRound | null> {
  const rounds = await NegotiationRoundsStore.getBySession(sessionId);
  return rounds.find((r) => r.snapshotHash === hash) ?? null;
}

/**
 * Build result for an existing round (re-import case).
 * Fetches existing changes and returns them without re-creating.
 */
async function buildExistingRoundResult(
  existingRound: NegotiationRound,
  session: NegotiationSession
): Promise<ImportRoundResult> {
  const changes = await NegotiationChangesStore.getByRound(existingRound.id);
  const versionId = existingRound.versionId
    ? parseInt(existingRound.versionId, 10) || null
    : null;

  return {
    round: existingRound,
    changes,
    comparison: null, // comparison not re-run on re-import
    versionId,
    sessionUpdated: session,
  };
}

/* ============= Export ============= */

export const RoundImport = {
  importRound,
  // Exposed for testing
  computeHash,
  determineRoundType,
  buildVersionName,
  findRoundByHash,
};
