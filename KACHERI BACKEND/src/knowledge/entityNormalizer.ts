// KACHERI BACKEND/src/knowledge/entityNormalizer.ts
// Cross-Document Intelligence: AI-assisted entity normalization / deduplication
//
// Two-stage pipeline (same pattern as clauseMatcher.ts):
//   1. Fast string similarity pre-filter (Levenshtein + Jaccard, no AI)
//   2. AI comparison for ambiguous cases using composeText()
//
// Produces merge suggestions. Auto-merges above high-confidence threshold,
// presents remaining suggestions for user approval.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 4

import { WorkspaceEntitiesStore } from "../store/workspaceEntities";
import type { WorkspaceEntity, EntityType } from "../store/workspaceEntities";
import { EntityMentionsStore } from "../store/entityMentions";
import { FtsSync } from "./ftsSync";
import { composeText } from "../ai/modelRouter";
import { withTimeout } from "../ai/extractors/index";
import { extractKeywords, jaccardSimilarity } from "../ai/clauseMatcher";

/* ============= Constants ============= */

const NORMALIZER_TIMEOUT_MS = 15_000; // 15 seconds per AI call
const MAX_AI_BATCH = 10; // max pairs sent to AI per call
const MIN_STRING_SIMILARITY = 0.3; // pre-filter threshold
const AUTO_MERGE_THRESHOLD = 90; // auto-merge at >= this confidence
const SUGGEST_THRESHOLD = 50; // suggest merge at >= this confidence
const MAX_AI_TOKENS = 400; // response token limit
const MIN_NAME_LENGTH = 3; // skip Levenshtein for names shorter than this
const BLOCK_PREFIX_LEN = 3; // blocking key length for normalizedName prefix
const ALIAS_MATCH_BOOST = 0.85; // similarity boost when alias matches name

const SYSTEM_PROMPT =
  "You are an entity deduplication expert for a document management system. " +
  "For each numbered PAIR below, determine if the two names refer to the same real-world entity. " +
  "Consider abbreviations, alternative spellings, and formal vs informal names. " +
  "Output EXACTLY one line per pair in this format: N: SCORE - CANONICAL_NAME - REASON\n" +
  "Where N is the pair number, SCORE is 0-100 confidence they are the same entity, " +
  "CANONICAL_NAME is the preferred/formal name to keep, and REASON is a brief explanation.\n" +
  "Example: 1: 95 - Acme Corporation - Both refer to the same company; formal name preferred";

/* ============= Types ============= */

/** A pair of entities that might be duplicates, from string-similarity pre-filter */
export interface DuplicateCandidate {
  entityA: WorkspaceEntity;
  entityB: WorkspaceEntity;
  stringSimilarity: number; // 0-1 combined score from pre-filter
}

/** AI-scored merge suggestion */
export interface NormalizationSuggestion {
  entityA: WorkspaceEntity;
  entityB: WorkspaceEntity;
  confidence: number; // 0-100 from AI
  recommendedName: string; // AI-recommended canonical name
  reason: string; // explanation from AI
  autoMerge: boolean; // true if confidence >= AUTO_MERGE_THRESHOLD
}

/** Result summary of a normalization pass */
export interface NormalizationResult {
  workspaceId: string;
  candidatesFound: number; // pairs from pre-filter
  aiCompared: number; // pairs sent to AI
  suggestionsGenerated: number;
  autoMerged: number;
  errors: string[];
  suggestions: NormalizationSuggestion[];
}

/* ============= String Similarity (Stage 1) ============= */

/**
 * Compute Levenshtein edit distance between two strings.
 * Uses Wagner-Fischer dynamic programming algorithm.
 * Returns the minimum number of single-character edits (insert, delete, substitute).
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Edge cases
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single array optimization (O(min(m,n)) space)
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
    }
    // Swap rows
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }

  return prev[n];
}

/**
 * Normalized Levenshtein similarity: 1 - (distance / max(len_a, len_b)).
 * Returns 0-1 where 1 = identical strings.
 * Returns 0 for names shorter than MIN_NAME_LENGTH (too many false positives).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < MIN_NAME_LENGTH || b.length < MIN_NAME_LENGTH) return 0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Check if any alias of entity A matches the name or any alias of entity B.
 * Returns true if a match is found (case-insensitive via normalized comparison).
 */
function hasAliasOverlap(a: WorkspaceEntity, b: WorkspaceEntity): boolean {
  const aNamesSet = new Set<string>();
  aNamesSet.add(a.normalizedName);
  for (const alias of a.aliases) {
    aNamesSet.add(alias.toLowerCase().trim());
  }

  // Check B's name and aliases against A's set
  if (aNamesSet.has(b.normalizedName)) return true;
  for (const alias of b.aliases) {
    if (aNamesSet.has(alias.toLowerCase().trim())) return true;
  }

  // Check A's aliases against B's normalized name
  const bNamesSet = new Set<string>();
  bNamesSet.add(b.normalizedName);
  for (const alias of b.aliases) {
    bNamesSet.add(alias.toLowerCase().trim());
  }
  for (const alias of a.aliases) {
    if (bNamesSet.has(alias.toLowerCase().trim())) return true;
  }

  return false;
}

/**
 * Compute combined string similarity between two entities.
 * Uses max of:
 *   - Levenshtein similarity on normalized names
 *   - Jaccard similarity on keywords
 *   - Alias match boost (0.85) if any alias overlaps
 *
 * Applies Unicode NFC normalization before comparison.
 */
export function combinedSimilarity(
  a: WorkspaceEntity,
  b: WorkspaceEntity
): number {
  // Unicode normalization for consistent comparison
  const nameA = a.normalizedName.normalize("NFC");
  const nameB = b.normalizedName.normalize("NFC");

  // Skip if names are identical (already handled by harvester dedup)
  if (nameA === nameB) return 1;

  // Levenshtein on normalized names
  const levSim = levenshteinSimilarity(nameA, nameB);

  // Jaccard on keyword sets (reused from clauseMatcher)
  const keywordsA = extractKeywords(a.name);
  const keywordsB = extractKeywords(b.name);
  const jacSim = jaccardSimilarity(keywordsA, keywordsB);

  // Alias overlap check
  const aliasBoost = hasAliasOverlap(a, b) ? ALIAS_MATCH_BOOST : 0;

  return Math.max(levSim, jacSim, aliasBoost);
}

/* ============= Pre-Filter: Find Duplicate Candidates ============= */

/**
 * Find potential duplicate entity pairs within a workspace.
 * Compares all entities of the same type using string similarity.
 * Returns pairs above MIN_STRING_SIMILARITY threshold.
 *
 * Only compares within same entity type (person vs person, org vs org, etc.).
 * Uses blocking strategy (first 3 chars of normalizedName) to reduce O(n²) to O(n²/k).
 * Scales to 500–10,000 entities per type without hard cap.
 */
export async function findDuplicateCandidates(
  workspaceId: string,
  entityType?: EntityType
): Promise<DuplicateCandidate[]> {
  const candidates: DuplicateCandidate[] = [];

  // Entity types to check (all if not specified)
  const typesToCheck: EntityType[] = entityType
    ? [entityType]
    : ["person", "organization", "date", "amount", "location", "product", "term", "concept"];

  for (const type of typesToCheck) {
    let entities = await WorkspaceEntitiesStore.getByWorkspace(workspaceId, {
      entityType: type,
      sort: "mention_count",
      order: "desc",
    });

    // Blocking strategy: group by first BLOCK_PREFIX_LEN chars of normalizedName.
    // Only compare within blocks → O(n²/k) where k = number of blocks.
    // Adequate for 500–10,000 entities per workspace type.
    const blocks = new Map<string, typeof entities>();
    for (const entity of entities) {
      const key = (entity.normalizedName || "").slice(0, BLOCK_PREFIX_LEN).toLowerCase();
      const block = blocks.get(key);
      if (block) {
        block.push(entity);
      } else {
        blocks.set(key, [entity]);
      }
    }

    for (const block of blocks.values()) {
      for (let i = 0; i < block.length; i++) {
        for (let j = i + 1; j < block.length; j++) {
          const entityA = block[i];
          const entityB = block[j];

          // Skip exact normalized name matches (already deduped by harvester)
          if (entityA.normalizedName === entityB.normalizedName) continue;

          const similarity = combinedSimilarity(entityA, entityB);

          if (similarity >= MIN_STRING_SIMILARITY) {
            candidates.push({
              entityA,
              entityB,
              stringSimilarity: similarity,
            });
          }
        }
      }
    }
  }

  // Sort by similarity descending (most likely duplicates first)
  candidates.sort((a, b) => b.stringSimilarity - a.stringSimilarity);

  return candidates;
}

/* ============= AI Comparison (Stage 2) ============= */

/**
 * Parse AI response for entity normalization.
 * Expected format: "N: SCORE - CANONICAL_NAME - REASON" per line.
 * Returns a map of pairIndex -> { score, canonicalName, reason }.
 */
export function parseAiNormalizationResponse(
  response: string,
  expectedCount: number
): Map<number, { score: number; canonicalName: string; reason: string }> {
  const results = new Map<
    number,
    { score: number; canonicalName: string; reason: string }
  >();
  const lines = response.trim().split("\n");

  for (const line of lines) {
    // Match: "N: SCORE - CANONICAL_NAME - REASON"
    const match = line.match(
      /^(\d+)\s*:\s*(\d+)\s*[-–—]\s*(.+?)\s*[-–—]\s*(.+)/
    );
    if (match) {
      const index = parseInt(match[1], 10);
      const score = parseInt(match[2], 10);
      const canonicalName = match[3].trim();
      const reason = match[4].trim();

      if (index >= 1 && index <= expectedCount && score >= 0 && score <= 100) {
        results.set(index, { score, canonicalName, reason });
      }
    }
  }

  return results;
}

/**
 * Build the AI user prompt for a batch of candidate pairs.
 * Includes entity names, types, aliases, and sample mention contexts.
 */
async function buildAiPrompt(candidates: DuplicateCandidate[]): Promise<string> {
  const pairTexts: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const { entityA, entityB } = candidates[i];

    // Get sample contexts from mentions (up to 2 per entity)
    const mentionsA = (await EntityMentionsStore.getByEntity(entityA.id)).slice(0, 2);
    const mentionsB = (await EntityMentionsStore.getByEntity(entityB.id)).slice(0, 2);

    const contextA = mentionsA
      .map((m) => m.context)
      .filter(Boolean)
      .join("; ");
    const contextB = mentionsB
      .map((m) => m.context)
      .filter(Boolean)
      .join("; ");

    let pairText = `PAIR ${i + 1} (${entityA.entityType}):\n`;
    pairText += `  Name A: "${entityA.name}"`;
    if (entityA.aliases.length > 0) {
      pairText += ` (aliases: ${entityA.aliases.join(", ")})`;
    }
    if (contextA) pairText += `\n  Context A: ${contextA}`;

    pairText += `\n  Name B: "${entityB.name}"`;
    if (entityB.aliases.length > 0) {
      pairText += ` (aliases: ${entityB.aliases.join(", ")})`;
    }
    if (contextB) pairText += `\n  Context B: ${contextB}`;

    pairTexts.push(pairText);
  }

  return `Determine if each pair refers to the same entity:\n\n${pairTexts.join("\n\n")}`;
}

/**
 * Score candidate pairs using AI comparison.
 * Sends batches of up to MAX_AI_BATCH pairs to composeText().
 * Returns suggestions for pairs above SUGGEST_THRESHOLD.
 */
async function aiScoreCandidates(
  candidates: DuplicateCandidate[]
): Promise<{
  suggestions: NormalizationSuggestion[];
  aiCompared: number;
  errors: string[];
}> {
  const suggestions: NormalizationSuggestion[] = [];
  const errors: string[] = [];
  let aiCompared = 0;

  // Process in batches
  for (let batchStart = 0; batchStart < candidates.length; batchStart += MAX_AI_BATCH) {
    const batch = candidates.slice(batchStart, batchStart + MAX_AI_BATCH);
    const userPrompt = await buildAiPrompt(batch);

    try {
      const aiResult = await withTimeout(
        composeText(userPrompt, {
          systemPrompt: SYSTEM_PROMPT,
          maxTokens: MAX_AI_TOKENS,
        }),
        NORMALIZER_TIMEOUT_MS,
        `Entity normalization AI timed out after ${NORMALIZER_TIMEOUT_MS / 1000}s`
      );

      const parsed = parseAiNormalizationResponse(aiResult.text, batch.length);
      aiCompared += batch.length;

      for (let i = 0; i < batch.length; i++) {
        const candidate = batch[i];
        const aiScore = parsed.get(i + 1); // 1-indexed

        if (aiScore && aiScore.score >= SUGGEST_THRESHOLD) {
          suggestions.push({
            entityA: candidate.entityA,
            entityB: candidate.entityB,
            confidence: aiScore.score,
            recommendedName: aiScore.canonicalName,
            reason: aiScore.reason,
            autoMerge: aiScore.score >= AUTO_MERGE_THRESHOLD,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[entityNormalizer] AI scoring failed:", message);
      errors.push(`AI batch scoring failed: ${message}`);

      // Fallback: convert string similarity to 0-100 score and suggest if high enough
      for (const candidate of batch) {
        const fallbackScore = Math.round(candidate.stringSimilarity * 100);
        if (fallbackScore >= SUGGEST_THRESHOLD) {
          const targetEntity =
            candidate.entityA.docCount >= candidate.entityB.docCount
              ? candidate.entityA
              : candidate.entityB;
          suggestions.push({
            entityA: candidate.entityA,
            entityB: candidate.entityB,
            confidence: fallbackScore,
            recommendedName: targetEntity.name,
            reason: "Matched by string similarity (AI unavailable)",
            autoMerge: false, // never auto-merge without AI confirmation
          });
        }
      }
    }
  }

  return { suggestions, aiCompared, errors };
}

/* ============= Merge Execution ============= */

/**
 * Execute a merge for a normalization suggestion.
 * Determines target (higher docCount, or alphabetically first), merges
 * source into target, and syncs FTS5 index.
 *
 * Returns true if merge succeeded, false otherwise.
 */
export async function executeMerge(suggestion: NormalizationSuggestion): Promise<boolean> {
  const { entityA, entityB, recommendedName } = suggestion;

  try {
    // Determine target: entity with higher docCount, or alphabetically first
    let target: WorkspaceEntity;
    let source: WorkspaceEntity;
    if (entityA.docCount > entityB.docCount) {
      target = entityA;
      source = entityB;
    } else if (entityB.docCount > entityA.docCount) {
      target = entityB;
      source = entityA;
    } else {
      // Same docCount: prefer the one matching the recommended name
      target = entityA.name === recommendedName ? entityA : entityB;
      source = target === entityA ? entityB : entityA;
    }

    // Collect merged aliases: union of all names and aliases, minus the canonical name
    const allNames = new Set<string>();
    allNames.add(target.name);
    allNames.add(source.name);
    for (const a of target.aliases) allNames.add(a);
    for (const a of source.aliases) allNames.add(a);

    // Remove the canonical name from aliases
    allNames.delete(recommendedName);

    const mergedAliases = Array.from(allNames);

    // Execute merge via store (transactional)
    const success = await WorkspaceEntitiesStore.merge(
      [source.id],
      target.id,
      recommendedName,
      mergedAliases
    );

    if (success) {
      // Sync FTS5: update target, remove source
      try {
        await FtsSync.syncEntity(
          target.id,
          target.workspaceId,
          recommendedName,
          mergedAliases
        );
      } catch (ftsErr) {
        console.error(
          "[entityNormalizer] FTS sync failed after merge:",
          ftsErr
        );
      }

      try {
        await FtsSync.removeEntity(source.id);
      } catch (ftsErr) {
        console.error(
          "[entityNormalizer] FTS remove failed after merge:",
          ftsErr
        );
      }
    }

    return success;
  } catch (err) {
    console.error("[entityNormalizer] Merge execution failed:", err);
    return false;
  }
}

/* ============= Main Entry Point ============= */

/**
 * Run a full entity normalization pass for a workspace.
 *
 * Two-stage pipeline:
 *   1. String similarity pre-filter (Levenshtein + Jaccard + alias matching)
 *   2. AI comparison for candidates above threshold
 *
 * Optionally auto-merges high-confidence duplicates (confidence >= 90).
 * Returns all suggestions and a summary of actions taken.
 *
 * @param workspaceId - The workspace to normalize entities in
 * @param opts.autoMerge - If true, auto-merge high-confidence duplicates (default: true)
 * @param opts.entityType - Optionally limit to a specific entity type
 */
export async function normalizeWorkspaceEntities(
  workspaceId: string,
  opts?: { autoMerge?: boolean; entityType?: EntityType }
): Promise<NormalizationResult> {
  const autoMerge = opts?.autoMerge !== false; // default true
  const result: NormalizationResult = {
    workspaceId,
    candidatesFound: 0,
    aiCompared: 0,
    suggestionsGenerated: 0,
    autoMerged: 0,
    errors: [],
    suggestions: [],
  };

  try {
    // Stage 1: Find duplicate candidates via string similarity
    const candidates = await findDuplicateCandidates(workspaceId, opts?.entityType);
    result.candidatesFound = candidates.length;

    if (candidates.length === 0) {
      return result;
    }

    // Stage 2: AI comparison for candidates
    const aiResult = await aiScoreCandidates(candidates);
    result.aiCompared = aiResult.aiCompared;
    result.errors.push(...aiResult.errors);

    // Sort suggestions by confidence descending
    aiResult.suggestions.sort((a, b) => b.confidence - a.confidence);

    // Auto-merge high-confidence suggestions if enabled
    if (autoMerge) {
      for (const suggestion of aiResult.suggestions) {
        if (suggestion.autoMerge) {
          const mergeSuccess = await executeMerge(suggestion);
          if (mergeSuccess) {
            result.autoMerged++;
          } else {
            result.errors.push(
              `Auto-merge failed for "${suggestion.entityA.name}" + "${suggestion.entityB.name}"`
            );
            // Still include as a suggestion (user can retry manually)
            result.suggestions.push({ ...suggestion, autoMerge: false });
          }
        } else {
          result.suggestions.push(suggestion);
        }
      }
    } else {
      result.suggestions = aiResult.suggestions;
    }

    result.suggestionsGenerated = result.suggestions.length + result.autoMerged;

    return result;
  } catch (err) {
    console.error("[entityNormalizer] Normalization failed:", err);
    return {
      ...result,
      errors: [...result.errors, `Normalization failed: ${String(err)}`],
    };
  }
}

/* ============= Export Aggregated Object ============= */

export const EntityNormalizer = {
  findDuplicateCandidates,
  normalizeWorkspaceEntities,
  executeMerge,
  // Exposed for testing
  levenshteinDistance,
  levenshteinSimilarity,
  combinedSimilarity,
  parseAiNormalizationResponse,
};
