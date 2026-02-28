// KACHERI BACKEND/src/negotiation/types.ts
// Negotiation: Shared type definitions for the negotiation module
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 2

import type { ChangeType, ChangeCategory } from "../store/negotiationChanges";

/* ============= Redline Comparator — Public Types ============= */

/**
 * Input to the redline comparator.
 * Both snapshots come from negotiation_rounds table columns.
 */
export interface RedlineCompareInput {
  /** Previous round snapshot (HTML) — used for section extraction */
  previousHtml: string;
  /** Previous round snapshot (plain text) — used for diffing */
  previousText: string;
  /** Current round snapshot (HTML) */
  currentHtml: string;
  /** Current round snapshot (plain text) — used for diffing */
  currentText: string;
  /** Negotiation session ID (for context, not stored here) */
  sessionId: string;
  /** Current round ID (for context, not stored here) */
  roundId: string;
}

/**
 * A single detected change from the redline comparison.
 * Directly compatible with CreateChangeInput for storage in negotiation_changes.
 */
export interface DetectedChange {
  changeType: ChangeType;
  category: ChangeCategory;
  sectionHeading: string | null;
  originalText: string | null;
  proposedText: string | null;
  /** Character position (start) in the previous round's plain text */
  fromPos: number;
  /** Character position (end) in the previous round's plain text */
  toPos: number;
}

/**
 * Result of a redline comparison between two rounds.
 */
export interface RedlineCompareResult {
  changes: DetectedChange[];
  totalChanges: number;
  substantive: number;
  editorial: number;
  structural: number;
  /** Wall-clock time for the comparison (ms) */
  processingTimeMs: number;
}

/* ============= Redline Comparator — Internal Types ============= */

/** A paragraph with character position metadata in the source text. */
export interface Paragraph {
  text: string;
  startPos: number;
  endPos: number;
  index: number;
}

/** A sentence with character position metadata within its parent paragraph. */
export interface Sentence {
  text: string;
  startPosInParagraph: number;
  endPosInParagraph: number;
}

/** A document section boundary for heading mapping. */
export interface SectionBoundary {
  heading: string;
  level: number;
  /** Character position (start) in the plain text */
  startPos: number;
  /** Character position (end) in the plain text */
  endPos: number;
}
