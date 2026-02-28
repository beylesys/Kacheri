// KACHERI BACKEND/src/knowledge/relationshipDetector.ts
// Cross-Document Intelligence: Relationship detector for entity knowledge graph
//
// Discovers and labels relationships between entities:
//   1. Co-occurrence detection: entities sharing documents (no AI)
//   2. AI relationship labeling: for pairs co-occurring in 2+ docs
//   3. Incremental update: on new entity mention, update relationships
//
// Follows same two-stage pattern as entityNormalizer.ts and clauseMatcher.ts.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 5

import { db } from "../db";
import { WorkspaceEntitiesStore } from "../store/workspaceEntities";
import type { WorkspaceEntity } from "../store/workspaceEntities";
import { EntityMentionsStore } from "../store/entityMentions";
import {
  EntityRelationshipsStore,
  type RelationshipType,
  type RelationshipEvidence,
} from "../store/entityRelationships";
import { composeText } from "../ai/modelRouter";
import { withTimeout } from "../ai/extractors/index";

/* ============= Constants ============= */

const DETECTOR_TIMEOUT_MS = 15_000; // 15 seconds per AI call
const MAX_AI_BATCH = 8; // max pairs sent to AI per call
const MIN_COOCCURRENCE_DOCS_FOR_AI = 2; // only AI-label pairs with 2+ shared docs
const MAX_AI_TOKENS = 500; // response token limit
const MAX_EVIDENCE_DOCS = 5; // max docs in evidence array per relationship
const STRENGTH_CAP_DOCS = 10; // shared docs at which base strength reaches 1.0

const VALID_AI_TYPES: RelationshipType[] = [
  "co_occurrence",
  "contractual",
  "financial",
  "organizational",
  "temporal",
  "custom",
];

const SYSTEM_PROMPT =
  "You are a relationship analysis expert for a document management system. " +
  "For each numbered PAIR below, determine the nature of the relationship " +
  "between the two entities based on the documents they appear in together.\n\n" +
  "Output EXACTLY one line per pair in this format: N: TYPE - LABEL - CONFIDENCE - REASON\n" +
  "Where:\n" +
  "  N = pair number\n" +
  "  TYPE = one of: contractual, financial, organizational, temporal, custom\n" +
  "  LABEL = short human-readable relationship description (e.g., 'contracted with', 'pays', 'reports to')\n" +
  "  CONFIDENCE = 0-100 confidence in the relationship type\n" +
  "  REASON = brief explanation\n\n" +
  "If the relationship is unclear or purely coincidental, use TYPE=co_occurrence with a low confidence.\n\n" +
  "Example: 1: contractual - contracted with - 92 - Both entities appear as parties in a services agreement";

/* ============= Types ============= */

/** A pair of entities that co-occur in the same document(s) */
export interface CoOccurrence {
  entityA: WorkspaceEntity;
  entityB: WorkspaceEntity;
  sharedDocIds: string[];
  sharedDocCount: number;
}

/** Result summary of a relationship detection pass */
export interface RelationshipDetectionResult {
  workspaceId: string;
  coOccurrencesFound: number;
  aiLabeled: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
  errors: string[];
}

/** Raw row from co-occurrence SQL query */
interface CoOccurrenceRow {
  entity_a_id: string;
  entity_b_id: string;
  shared_docs: string; // comma-separated doc IDs
  shared_doc_count: number;
}

/* ============= Co-Occurrence Detection (Stage 1) ============= */

/**
 * Find all entity pairs that co-occur in the same documents within a workspace.
 * Uses a self-join on entity_mentions to find pairs sharing docs.
 * The `entity_id < entity_id` constraint ensures each pair is found once.
 *
 * Returns pairs sorted by shared document count (most connected first).
 */
export async function findCoOccurrences(workspaceId: string): Promise<CoOccurrence[]> {
  try {
    const rows = await db.queryAll<CoOccurrenceRow>(
      `
      SELECT
        em1.entity_id AS entity_a_id,
        em2.entity_id AS entity_b_id,
        GROUP_CONCAT(DISTINCT em1.doc_id) AS shared_docs,
        COUNT(DISTINCT em1.doc_id) AS shared_doc_count
      FROM entity_mentions em1
      INNER JOIN entity_mentions em2
        ON em1.doc_id = em2.doc_id AND em1.entity_id < em2.entity_id
      WHERE em1.workspace_id = ?
      GROUP BY em1.entity_id, em2.entity_id
      ORDER BY shared_doc_count DESC
    `,
      [workspaceId]
    );

    const coOccurrences: CoOccurrence[] = [];

    for (const row of rows) {
      const entityA = await WorkspaceEntitiesStore.getById(row.entity_a_id);
      const entityB = await WorkspaceEntitiesStore.getById(row.entity_b_id);

      if (!entityA || !entityB) continue; // skip if entity was deleted

      coOccurrences.push({
        entityA,
        entityB,
        sharedDocIds: row.shared_docs.split(","),
        sharedDocCount: row.shared_doc_count,
      });
    }

    return coOccurrences;
  } catch (err) {
    console.error("[relationshipDetector] Failed to find co-occurrences:", err);
    return [];
  }
}

/**
 * Find co-occurrences for a specific entity (used by incremental update).
 * Returns pairs where the given entity shares documents with other entities.
 */
async function findCoOccurrencesForEntity(
  entityId: string,
  workspaceId: string
): Promise<CoOccurrence[]> {
  try {
    const rows = await db.queryAll<CoOccurrenceRow>(
      `
      SELECT
        em1.entity_id AS entity_a_id,
        em2.entity_id AS entity_b_id,
        GROUP_CONCAT(DISTINCT em1.doc_id) AS shared_docs,
        COUNT(DISTINCT em1.doc_id) AS shared_doc_count
      FROM entity_mentions em1
      INNER JOIN entity_mentions em2
        ON em1.doc_id = em2.doc_id AND em1.entity_id != em2.entity_id
      WHERE em1.entity_id = ? AND em1.workspace_id = ?
      GROUP BY em1.entity_id, em2.entity_id
      ORDER BY shared_doc_count DESC
    `,
      [entityId, workspaceId]
    );

    const coOccurrences: CoOccurrence[] = [];

    for (const row of rows) {
      const entityA = await WorkspaceEntitiesStore.getById(row.entity_a_id);
      const entityB = await WorkspaceEntitiesStore.getById(row.entity_b_id);

      if (!entityA || !entityB) continue;

      coOccurrences.push({
        entityA,
        entityB,
        sharedDocIds: row.shared_docs.split(","),
        sharedDocCount: row.shared_doc_count,
      });
    }

    return coOccurrences;
  } catch (err) {
    console.error(
      "[relationshipDetector] Failed to find co-occurrences for entity:",
      err
    );
    return [];
  }
}

/* ============= Evidence Gathering ============= */

/**
 * Gather evidence (document contexts) for a relationship between two entities.
 * Looks up mention contexts from shared documents.
 * Returns up to MAX_EVIDENCE_DOCS evidence items.
 */
export async function gatherEvidence(
  entityAId: string,
  entityBId: string,
  sharedDocIds: string[]
): Promise<RelationshipEvidence[]> {
  const evidence: RelationshipEvidence[] = [];

  // Limit to MAX_EVIDENCE_DOCS to keep evidence array manageable
  const docsToCheck = sharedDocIds.slice(0, MAX_EVIDENCE_DOCS);

  for (const docId of docsToCheck) {
    try {
      // Get mentions of both entities in this document
      const allMentions = await EntityMentionsStore.getByDoc(docId);
      const mentionsA = allMentions.filter((m) => m.entityId === entityAId);
      const mentionsB = allMentions.filter((m) => m.entityId === entityBId);

      // Build context from both entities' mentions
      const contextParts: string[] = [];

      const contextA = mentionsA
        .map((m) => m.context)
        .filter(Boolean)
        .slice(0, 2);
      const contextB = mentionsB
        .map((m) => m.context)
        .filter(Boolean)
        .slice(0, 2);

      if (contextA.length > 0)
        contextParts.push(contextA.join("; "));
      if (contextB.length > 0)
        contextParts.push(contextB.join("; "));

      const context =
        contextParts.length > 0
          ? contextParts.join(" | ")
          : "Co-occurrence in document";

      evidence.push({ docId, context });
    } catch (err) {
      // Non-fatal: skip this doc
      evidence.push({ docId, context: "Context unavailable" });
    }
  }

  return evidence;
}

/* ============= Co-Occurrence Relationship Creation ============= */

/**
 * Calculate base relationship strength from shared document count.
 * Scales linearly from 0.1 (1 doc) to 1.0 (STRENGTH_CAP_DOCS docs).
 */
function calculateBaseStrength(sharedDocCount: number): number {
  return Math.min(0.1 + (sharedDocCount - 1) * (0.9 / (STRENGTH_CAP_DOCS - 1)), 1.0);
}

/**
 * Create or update co-occurrence relationships for all detected co-occurrences.
 * This is the deterministic (no-AI) baseline.
 */
async function createCoOccurrenceRelationships(
  coOccurrences: CoOccurrence[],
  workspaceId: string
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const co of coOccurrences) {
    try {
      const strength = calculateBaseStrength(co.sharedDocCount);
      const evidence = await gatherEvidence(
        co.entityA.id,
        co.entityB.id,
        co.sharedDocIds
      );

      // Check if co_occurrence relationship already exists
      const existing = await EntityRelationshipsStore.getByPair(
        co.entityA.id,
        co.entityB.id,
        "co_occurrence"
      );

      if (existing) {
        // Update strength and evidence
        await EntityRelationshipsStore.update(existing.id, {
          strength,
          evidence,
        });
        updated++;
      } else {
        // Create new co_occurrence relationship
        const result = await EntityRelationshipsStore.create({
          workspaceId,
          fromEntityId: co.entityA.id,
          toEntityId: co.entityB.id,
          relationshipType: "co_occurrence",
          label: undefined,
          strength,
          evidence,
        });

        if (result) {
          created++;
        }
      }
    } catch (err) {
      console.error(
        `[relationshipDetector] Failed to create co-occurrence for ${co.entityA.name} <-> ${co.entityB.name}:`,
        err
      );
    }
  }

  return { created, updated };
}

/* ============= AI Relationship Labeling (Stage 2) ============= */

/**
 * Parse AI response for relationship labeling.
 * Expected format per line: "N: TYPE - LABEL - CONFIDENCE - REASON"
 * Returns a map of pairIndex -> { type, label, confidence, reason }.
 */
export function parseAiRelationshipResponse(
  response: string,
  expectedCount: number
): Map<
  number,
  { type: RelationshipType; label: string; confidence: number; reason: string }
> {
  const results = new Map<
    number,
    { type: RelationshipType; label: string; confidence: number; reason: string }
  >();
  const lines = response.trim().split("\n");

  for (const line of lines) {
    // Match: "N: TYPE - LABEL - CONFIDENCE - REASON"
    const match = line.match(
      /^(\d+)\s*:\s*(\w+)\s*[-–—]\s*(.+?)\s*[-–—]\s*(\d+)\s*[-–—]\s*(.+)/
    );

    if (match) {
      const index = parseInt(match[1], 10);
      const rawType = match[2].trim().toLowerCase();
      const label = match[3].trim();
      const confidence = parseInt(match[4], 10);
      const reason = match[5].trim();

      // Validate type
      const type = VALID_AI_TYPES.includes(rawType as RelationshipType)
        ? (rawType as RelationshipType)
        : "custom";

      if (
        index >= 1 &&
        index <= expectedCount &&
        confidence >= 0 &&
        confidence <= 100
      ) {
        results.set(index, { type, label, confidence, reason });
      }
    }
  }

  return results;
}

/**
 * Build the AI user prompt for a batch of co-occurring entity pairs.
 * Includes entity names, types, and contexts from shared documents.
 */
async function buildAiPrompt(coOccurrences: CoOccurrence[]): Promise<string> {
  const pairTexts: string[] = [];

  for (let i = 0; i < coOccurrences.length; i++) {
    const co = coOccurrences[i];

    // Get sample contexts from shared documents
    const evidence = await gatherEvidence(
      co.entityA.id,
      co.entityB.id,
      co.sharedDocIds.slice(0, 3) // limit to 3 docs for prompt size
    );

    let pairText = `PAIR ${i + 1}:\n`;
    pairText += `  Entity A: "${co.entityA.name}" (${co.entityA.entityType})`;
    if (co.entityA.aliases.length > 0) {
      pairText += ` [aliases: ${co.entityA.aliases.slice(0, 3).join(", ")}]`;
    }
    pairText += `\n  Entity B: "${co.entityB.name}" (${co.entityB.entityType})`;
    if (co.entityB.aliases.length > 0) {
      pairText += ` [aliases: ${co.entityB.aliases.slice(0, 3).join(", ")}]`;
    }
    pairText += `\n  Shared documents: ${co.sharedDocCount}`;

    if (evidence.length > 0) {
      const contextLines = evidence
        .map((e) => `    - ${e.context}`)
        .join("\n");
      pairText += `\n  Document contexts:\n${contextLines}`;
    }

    pairTexts.push(pairText);
  }

  return `Analyze the relationship between each entity pair:\n\n${pairTexts.join("\n\n")}`;
}

/**
 * Use AI to label relationships for co-occurring entity pairs.
 * Only processes pairs with MIN_COOCCURRENCE_DOCS_FOR_AI or more shared docs.
 * Updates or creates relationships with AI-determined type and label.
 *
 * On AI failure: graceful fallback — co_occurrence relationships already exist.
 */
async function aiLabelRelationships(
  coOccurrences: CoOccurrence[],
  workspaceId: string
): Promise<{ aiLabeled: number; created: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let aiLabeled = 0;
  let created = 0;
  let updated = 0;

  // Filter to pairs with sufficient shared docs for meaningful AI labeling
  const aiCandidates = coOccurrences.filter(
    (co) => co.sharedDocCount >= MIN_COOCCURRENCE_DOCS_FOR_AI
  );

  if (aiCandidates.length === 0) {
    return { aiLabeled, created, updated, errors };
  }

  // Process in batches
  for (
    let batchStart = 0;
    batchStart < aiCandidates.length;
    batchStart += MAX_AI_BATCH
  ) {
    const batch = aiCandidates.slice(batchStart, batchStart + MAX_AI_BATCH);
    const userPrompt = await buildAiPrompt(batch);

    try {
      const aiResult = await withTimeout(
        composeText(userPrompt, {
          systemPrompt: SYSTEM_PROMPT,
          maxTokens: MAX_AI_TOKENS,
        }),
        DETECTOR_TIMEOUT_MS,
        `Relationship detection AI timed out after ${DETECTOR_TIMEOUT_MS / 1000}s`
      );

      const parsed = parseAiRelationshipResponse(aiResult.text, batch.length);

      for (let i = 0; i < batch.length; i++) {
        const co = batch[i];
        const aiScore = parsed.get(i + 1); // 1-indexed

        if (!aiScore) continue;

        // Skip if AI says it's just co_occurrence with low confidence
        if (
          aiScore.type === "co_occurrence" &&
          aiScore.confidence < 50
        ) {
          continue;
        }

        aiLabeled++;

        // Calculate blended strength: co-occurrence frequency + AI confidence
        const baseStrength = calculateBaseStrength(co.sharedDocCount);
        const blendedStrength =
          baseStrength * 0.4 + (aiScore.confidence / 100) * 0.6;

        const evidence = await gatherEvidence(
          co.entityA.id,
          co.entityB.id,
          co.sharedDocIds
        );

        // Check if this typed relationship already exists
        const existing = await EntityRelationshipsStore.getByPair(
          co.entityA.id,
          co.entityB.id,
          aiScore.type
        );

        if (existing) {
          await EntityRelationshipsStore.update(existing.id, {
            label: aiScore.label,
            strength: blendedStrength,
            evidence,
          });
          updated++;
        } else {
          const result = await EntityRelationshipsStore.create({
            workspaceId,
            fromEntityId: co.entityA.id,
            toEntityId: co.entityB.id,
            relationshipType: aiScore.type,
            label: aiScore.label,
            strength: blendedStrength,
            evidence,
          });

          if (result) {
            created++;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[relationshipDetector] AI labeling failed:", message);
      errors.push(`AI batch labeling failed: ${message}`);
      // Graceful fallback: co_occurrence relationships already exist from step 1
    }
  }

  return { aiLabeled, created, updated, errors };
}

/* ============= Full Workspace Detection ============= */

/**
 * Run full relationship detection for a workspace.
 *
 * Pipeline:
 *   1. Find all entity co-occurrences (SQL, no AI)
 *   2. Create/update co_occurrence relationships (deterministic)
 *   3. AI-label pairs with 2+ shared documents (async, fallback-safe)
 *
 * Returns a summary of actions taken.
 */
export async function detectWorkspaceRelationships(
  workspaceId: string
): Promise<RelationshipDetectionResult> {
  const result: RelationshipDetectionResult = {
    workspaceId,
    coOccurrencesFound: 0,
    aiLabeled: 0,
    relationshipsCreated: 0,
    relationshipsUpdated: 0,
    errors: [],
  };

  try {
    // Stage 1: Find co-occurrences
    const coOccurrences = await findCoOccurrences(workspaceId);
    result.coOccurrencesFound = coOccurrences.length;

    if (coOccurrences.length === 0) {
      return result;
    }

    // Stage 2a: Create/update co_occurrence relationships (deterministic)
    const coResult = await createCoOccurrenceRelationships(
      coOccurrences,
      workspaceId
    );
    result.relationshipsCreated += coResult.created;
    result.relationshipsUpdated += coResult.updated;

    // Stage 2b: AI relationship labeling for pairs with sufficient shared docs
    const aiResult = await aiLabelRelationships(coOccurrences, workspaceId);
    result.aiLabeled = aiResult.aiLabeled;
    result.relationshipsCreated += aiResult.created;
    result.relationshipsUpdated += aiResult.updated;
    result.errors.push(...aiResult.errors);

    return result;
  } catch (err) {
    console.error(
      "[relationshipDetector] Workspace detection failed:",
      err
    );
    return {
      ...result,
      errors: [...result.errors, `Detection failed: ${String(err)}`],
    };
  }
}

/* ============= Incremental Update ============= */

/**
 * Update relationships for a specific entity after a new mention is created.
 * Finds new co-occurrences involving this entity and creates/updates relationships.
 * Also triggers AI labeling for pairs that now have 2+ shared docs.
 *
 * This is the incremental path — avoids full workspace rebuild.
 */
export async function updateRelationshipsForEntity(
  entityId: string,
  workspaceId: string
): Promise<RelationshipDetectionResult> {
  const result: RelationshipDetectionResult = {
    workspaceId,
    coOccurrencesFound: 0,
    aiLabeled: 0,
    relationshipsCreated: 0,
    relationshipsUpdated: 0,
    errors: [],
  };

  try {
    // Find co-occurrences involving this entity
    const coOccurrences = await findCoOccurrencesForEntity(entityId, workspaceId);
    result.coOccurrencesFound = coOccurrences.length;

    if (coOccurrences.length === 0) {
      return result;
    }

    // Create/update co_occurrence relationships
    for (const co of coOccurrences) {
      try {
        const strength = calculateBaseStrength(co.sharedDocCount);
        const evidence = await gatherEvidence(
          co.entityA.id,
          co.entityB.id,
          co.sharedDocIds
        );

        // Normalize pair direction: smaller ID = fromEntityId
        const fromId =
          co.entityA.id < co.entityB.id ? co.entityA.id : co.entityB.id;
        const toId =
          co.entityA.id < co.entityB.id ? co.entityB.id : co.entityA.id;

        const existing = await EntityRelationshipsStore.getByPair(
          fromId,
          toId,
          "co_occurrence"
        );

        if (existing) {
          await EntityRelationshipsStore.update(existing.id, {
            strength,
            evidence,
          });
          result.relationshipsUpdated++;
        } else {
          const created = await EntityRelationshipsStore.create({
            workspaceId,
            fromEntityId: fromId,
            toEntityId: toId,
            relationshipType: "co_occurrence",
            label: undefined,
            strength,
            evidence,
          });

          if (created) {
            result.relationshipsCreated++;
          }
        }
      } catch (err) {
        result.errors.push(
          `Failed to process co-occurrence for ${co.entityA.name} <-> ${co.entityB.name}: ${String(err)}`
        );
      }
    }

    // AI-label pairs that now have 2+ shared docs
    // Normalize co-occurrences to consistent direction for AI labeling
    const normalizedForAi = coOccurrences.map((co) => {
      if (co.entityA.id < co.entityB.id) return co;
      return {
        entityA: co.entityB,
        entityB: co.entityA,
        sharedDocIds: co.sharedDocIds,
        sharedDocCount: co.sharedDocCount,
      };
    });

    const aiResult = await aiLabelRelationships(normalizedForAi, workspaceId);
    result.aiLabeled = aiResult.aiLabeled;
    result.relationshipsCreated += aiResult.created;
    result.relationshipsUpdated += aiResult.updated;
    result.errors.push(...aiResult.errors);

    return result;
  } catch (err) {
    console.error(
      "[relationshipDetector] Incremental update failed:",
      err
    );
    return {
      ...result,
      errors: [...result.errors, `Incremental update failed: ${String(err)}`],
    };
  }
}

/* ============= Export Aggregated Object ============= */

export const RelationshipDetector = {
  findCoOccurrences,
  detectWorkspaceRelationships,
  updateRelationshipsForEntity,
  // Exposed for testing
  gatherEvidence,
  calculateBaseStrength,
  parseAiRelationshipResponse,
};
