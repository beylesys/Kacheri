// KACHERI BACKEND/src/knowledge/relatedDocs.ts
// Cross-Document Intelligence: Related Documents Engine
//
// Given a document, find other documents that share entities with it.
// 4-step pipeline:
//   1. Get all entity mentions for the source document
//   2. Find other documents with mentions of the same entities
//   3. Rank by shared entity count + entity importance (inverse doc_count)
//   4. Optional AI re-ranking for top candidates
//
// Returns ranked list with shared entities as "connection reasons".
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 7

import { composeText } from "../ai/modelRouter";
import { withTimeout } from "../ai/extractors/index";
import { EntityMentionsStore } from "../store/entityMentions";
import { WorkspaceEntitiesStore } from "../store/workspaceEntities";
import type { WorkspaceEntity, EntityType } from "../store/workspaceEntities";
import { ExtractionsStore } from "../store/extractions";
import { getDoc } from "../store/docs";
import { SemanticSearch } from "./semanticSearch";

/* ============= Constants ============= */

const DEFAULT_LIMIT = 10;
const MAX_CANDIDATES_FOR_AI = 10;
const AI_RERANK_TIMEOUT_MS = 5_000;
const AI_RERANK_MAX_TOKENS = 400;
const MIN_CANDIDATES_FOR_AI = 3;
const MAX_MENTIONS_PER_ENTITY = 50; // cap entity mention lookups

/* ============= AI System Prompt ============= */

const AI_RERANK_SYSTEM_PROMPT =
  "You are a document relationship analyzer for a legal/business document management system. " +
  "Given a source document and a list of candidate related documents with their shared entities and summaries, " +
  "re-rank the candidates by how closely related they are to the source document.\n\n" +
  "For each candidate, output a RANK line in this format:\n" +
  "  RANK N: RELEVANCE - REASON\n" +
  "Where N=candidate number (from the list), RELEVANCE=0.00-1.00, " +
  "REASON=brief explanation of the relationship.\n\n" +
  "Order by relevance (highest first). Only include candidates that are genuinely related.\n\n" +
  "Example:\n" +
  "RANK 1: 0.92 - Same vendor and overlapping payment terms\n" +
  "RANK 3: 0.75 - References same project deliverables";

/* ============= Types ============= */

export interface SharedEntity {
  name: string;
  entityType: EntityType;
}

export interface RelatedDoc {
  docId: string;
  title: string;
  relevance: number;
  sharedEntities: SharedEntity[];
  sharedEntityCount: number;
}

export interface RelatedDocsResult {
  relatedDocs: RelatedDoc[];
  entityCount: number;
  totalRelated: number;
}

export interface RelatedDocsOptions {
  limit?: number;
  aiRerank?: boolean;
  timeoutMs?: number;
}

/** Internal: intermediate candidate before final ranking */
interface RelatedDocCandidate {
  docId: string;
  title: string;
  sharedEntities: SharedEntity[];
  /** Sum of per-entity importance weights */
  weightedScore: number;
}

/* ============= Step 1 & 2: Build Related Docs Map ============= */

/**
 * Get all entity mentions for the source document, look up each entity,
 * then find other documents sharing those entities.
 * Returns a map of docId → candidate with aggregated shared entities and weight.
 */
async function buildRelatedDocsMap(
  docId: string,
  workspaceId: string
): Promise<{ candidates: Map<string, RelatedDocCandidate>; entityCount: number; maxPossibleScore: number }> {
  // Step 1: Get all entity mentions for the source document
  const docMentions = await EntityMentionsStore.getByDoc(docId);
  if (docMentions.length === 0) {
    return { candidates: new Map(), entityCount: 0, maxPossibleScore: 0 };
  }

  // Collect unique entity IDs and look up each entity
  const entityMap = new Map<string, WorkspaceEntity>();
  for (const mention of docMentions) {
    if (!entityMap.has(mention.entityId)) {
      const entity = await WorkspaceEntitiesStore.getById(mention.entityId);
      if (entity) {
        entityMap.set(mention.entityId, entity);
      }
    }
  }

  const entityCount = entityMap.size;
  if (entityCount === 0) {
    return { candidates: new Map(), entityCount: 0, maxPossibleScore: 0 };
  }

  // Calculate max possible score (sum of all entity weights)
  let maxPossibleScore = 0;
  for (const entity of entityMap.values()) {
    maxPossibleScore += entityWeight(entity.docCount);
  }

  // Step 2: For each entity, find other documents mentioning it
  const candidateMap = new Map<string, RelatedDocCandidate>();

  for (const [entityId, entity] of entityMap) {
    const mentions = await EntityMentionsStore.getByEntity(entityId, {
      limit: MAX_MENTIONS_PER_ENTITY,
    });

    const weight = entityWeight(entity.docCount);

    for (const mention of mentions) {
      // Skip non-doc mentions (from other products like research, design-studio)
      if (!mention.docId) continue;
      // Skip the source document itself
      if (mention.docId === docId) continue;

      let candidate = candidateMap.get(mention.docId);
      if (!candidate) {
        // Look up doc title
        const docRecord = await getDoc(mention.docId);
        const title = mention.docTitle ?? docRecord?.title ?? "Untitled";
        candidate = {
          docId: mention.docId,
          title,
          sharedEntities: [],
          weightedScore: 0,
        };
        candidateMap.set(mention.docId, candidate);
      }

      // Check if this entity is already recorded for this candidate
      const alreadyRecorded = candidate.sharedEntities.some(
        (se) => se.name === entity.name && se.entityType === entity.entityType
      );
      if (!alreadyRecorded) {
        candidate.sharedEntities.push({
          name: entity.name,
          entityType: entity.entityType,
        });
        candidate.weightedScore += weight;
      }
    }
  }

  return { candidates: candidateMap, entityCount, maxPossibleScore };
}

/* ============= Step 3: Relevance Calculation ============= */

/**
 * Calculate the importance weight for an entity based on its doc_count.
 * Entities appearing in fewer documents are more discriminating.
 * Uses inverse log: 1 / log2(docCount + 1)
 */
function entityWeight(docCount: number): number {
  return 1 / Math.log2(Math.max(docCount, 1) + 1);
}

/**
 * Calculate normalized relevance for a candidate.
 * relevance = weightedScore / maxPossibleScore, clamped to [0, 1]
 */
function calculateRelevance(weightedScore: number, maxPossibleScore: number): number {
  if (maxPossibleScore <= 0) return 0;
  return Math.min(1, Math.max(0, weightedScore / maxPossibleScore));
}

/* ============= Step 4: AI Re-ranking ============= */

/**
 * Format source doc + candidates as a prompt for AI re-ranking.
 */
async function formatForAiRerank(
  sourceTitle: string,
  sourceSummary: string,
  candidates: RelatedDoc[]
): Promise<string> {
  const lines: string[] = [];
  lines.push(`Source Document: "${sourceTitle}"`);
  if (sourceSummary) {
    lines.push(`  Summary: ${sourceSummary}`);
  }
  lines.push("");

  // Batch-fetch all extractions in a single query (N+1 → 1)
  const docIds = candidates.map((c) => c.docId);
  const extractionMap = await ExtractionsStore.getByDocIds(docIds);

  lines.push("Candidate Related Documents:");
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const entities = c.sharedEntities.map((e) => `${e.name} (${e.entityType})`).join(", ");
    lines.push(`[${i + 1}] "${c.title}" — Shared: ${entities} (score: ${c.relevance.toFixed(2)})`);

    // Add extraction summary if available
    const extraction = extractionMap.get(c.docId) ?? null;
    if (extraction) {
      const summary = SemanticSearch.summarizeExtraction(extraction.extraction, extraction.documentType);
      if (summary) {
        lines.push(`    Summary: ${summary}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Parse AI re-ranking response.
 * Expects format: RANK N: RELEVANCE - REASON
 * Returns map of candidate index (0-based) → new relevance.
 */
function parseAiRerankResponse(
  text: string,
  candidateCount: number
): Map<number, number> {
  const relevanceMap = new Map<number, number>();
  const regex = /^RANK\s+(\d+)\s*:\s*([\d.]+)\s*-\s*.+$/gim;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const candidateNum = parseInt(match[1], 10);
    const relevance = Math.min(1, Math.max(0, parseFloat(match[2]) || 0));

    // candidateNum is 1-based, convert to 0-based
    const index = candidateNum - 1;
    if (index >= 0 && index < candidateCount) {
      relevanceMap.set(index, relevance);
    }
  }

  return relevanceMap;
}

/**
 * AI re-ranking: send candidates to AI for refined relevance scoring.
 * On failure, returns the original candidates unchanged.
 */
async function aiRerank(
  sourceDocId: string,
  candidates: RelatedDoc[]
): Promise<RelatedDoc[]> {
  // Get source doc info
  const sourceDoc = await getDoc(sourceDocId);
  const sourceTitle = sourceDoc?.title ?? "Untitled";

  let sourceSummary = "";
  const sourceExtraction = await ExtractionsStore.getByDocId(sourceDocId);
  if (sourceExtraction) {
    sourceSummary = SemanticSearch.summarizeExtraction(
      sourceExtraction.extraction,
      sourceExtraction.documentType
    );
  }

  const prompt = await formatForAiRerank(sourceTitle, sourceSummary, candidates);

  const result = await withTimeout(
    composeText(prompt, {
      systemPrompt: AI_RERANK_SYSTEM_PROMPT,
      maxTokens: AI_RERANK_MAX_TOKENS,
    }),
    AI_RERANK_TIMEOUT_MS,
    "AI re-ranking timed out"
  );

  const newRelevances = parseAiRerankResponse(result.text, candidates.length);

  // Apply new relevances where AI provided them
  const reranked = candidates.map((c, i) => {
    const aiRelevance = newRelevances.get(i);
    if (aiRelevance !== undefined) {
      return { ...c, relevance: aiRelevance };
    }
    // AI didn't rank this candidate — reduce relevance slightly
    return { ...c, relevance: c.relevance * 0.8 };
  });

  // Sort by new relevance
  reranked.sort((a, b) => b.relevance - a.relevance);

  return reranked;
}

/* ============= Main Entry Point ============= */

/**
 * Find documents related to the given document via shared entities.
 *
 * Pipeline:
 * 1. Get entity mentions for source document
 * 2. Find other documents sharing those entities
 * 3. Rank by weighted entity overlap (rare entities count more)
 * 4. Optional AI re-ranking for top candidates
 *
 * Returns ranked list with shared entities as connection reasons.
 * Handles documents with no entities gracefully (empty result).
 * Performance target: <5s for typical workspace.
 */
async function findRelated(
  docId: string,
  workspaceId: string,
  opts: RelatedDocsOptions = {}
): Promise<RelatedDocsResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const shouldAiRerank = opts.aiRerank !== false;

  const emptyResult: RelatedDocsResult = {
    relatedDocs: [],
    entityCount: 0,
    totalRelated: 0,
  };

  try {
    // Steps 1 & 2: Build related docs map
    const { candidates, entityCount, maxPossibleScore } = await buildRelatedDocsMap(
      docId,
      workspaceId
    );

    if (candidates.size === 0) {
      return { ...emptyResult, entityCount };
    }

    // Step 3: Calculate relevance and sort
    let relatedDocs: RelatedDoc[] = [];

    for (const candidate of candidates.values()) {
      relatedDocs.push({
        docId: candidate.docId,
        title: candidate.title,
        relevance: calculateRelevance(candidate.weightedScore, maxPossibleScore),
        sharedEntities: candidate.sharedEntities,
        sharedEntityCount: candidate.sharedEntities.length,
      });
    }

    // Sort by relevance descending
    relatedDocs.sort((a, b) => b.relevance - a.relevance);

    const totalRelated = relatedDocs.length;

    // Cap at limit for AI re-ranking
    const topCandidates = relatedDocs.slice(0, Math.min(limit, MAX_CANDIDATES_FOR_AI));

    // Step 4: Optional AI re-ranking
    if (shouldAiRerank && topCandidates.length >= MIN_CANDIDATES_FOR_AI) {
      try {
        const reranked = await aiRerank(docId, topCandidates);
        relatedDocs = [
          ...reranked,
          ...relatedDocs.slice(topCandidates.length),
        ];
      } catch (err) {
        // AI re-ranking failed — keep deterministic ranking (no data loss)
        console.warn("[related_docs] AI re-ranking failed, using deterministic ranking:", err);
      }
    }

    // Apply final limit
    relatedDocs = relatedDocs.slice(0, limit);

    return {
      relatedDocs,
      entityCount,
      totalRelated,
    };
  } catch (err) {
    console.error("[related_docs] Failed to find related documents:", err);
    return emptyResult;
  }
}

/* ============= Export ============= */

export const RelatedDocs = {
  findRelated,
  // Exposed for testing
  calculateRelevance,
  buildRelatedDocsMap,
  aiRerank,
  parseAiRerankResponse,
  entityWeight,
};
