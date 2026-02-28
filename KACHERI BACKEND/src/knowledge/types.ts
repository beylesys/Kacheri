// KACHERI BACKEND/src/knowledge/types.ts
// Cross-Document Intelligence: Shared types for the knowledge module
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 3

import type { EntityType } from "../store/workspaceEntities";

/* ---------- Entity Harvester Types ---------- */

/**
 * Intermediate entity produced by per-document-type harvesters.
 * Represents a single entity occurrence found in extraction data,
 * before dedup/canonicalization.
 */
export interface RawEntity {
  /** Display name from extraction (e.g., "Acme Corp", "$150,000") */
  name: string;
  /** Entity type classification */
  entityType: EntityType;
  /** Extraction field origin (e.g., "parties[0].name", "paymentTerms.amount") */
  fieldPath: string;
  /** Surrounding context for citation */
  context?: string;
  /** Confidence score (from fieldConfidences or heuristic) */
  confidence?: number;
  /** Type-specific metadata (address, currency, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Result of harvesting entities from a document or workspace.
 */
export interface HarvestResult {
  /** Document ID (empty string for workspace-level results) */
  docId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Number of new canonical entities created */
  entitiesCreated: number;
  /** Number of existing canonical entities matched (reused) */
  entitiesReused: number;
  /** Number of new mention records created */
  mentionsCreated: number;
  /** Number of duplicate mentions skipped (INSERT OR IGNORE) */
  mentionsSkipped: number;
  /** Non-fatal errors encountered during harvesting */
  errors: string[];
}
