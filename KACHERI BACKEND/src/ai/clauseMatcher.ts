// KACHERI BACKEND/src/ai/clauseMatcher.ts
// Clause Library: AI-powered similarity detection engine
//
// Two-stage pipeline:
//   1. Fast keyword overlap pre-filter (no AI call for obvious mismatches)
//   2. AI comparison for top candidates using composeText() with similarity scoring
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice B5

import type { Clause } from "../store/clauses";
import { ClausesStore } from "../store/clauses";
import { composeText } from "./modelRouter";
import { withTimeout } from "./extractors/index";

/* ============= Constants ============= */

const SIMILARITY_TIMEOUT_MS = 15_000; // 15 seconds
const MAX_CANDIDATES = 5; // max clauses sent to AI
const MIN_KEYWORD_OVERLAP = 0.05; // permissive pre-filter threshold
const MIN_SIMILARITY_SCORE = 20; // minimum AI score to include in results
const MAX_CLAUSE_TEXT_CHARS = 4_000; // truncation per clause for AI prompt
const MAX_INPUT_TEXT_CHARS = 4_000; // truncation for input text
const MAX_AI_TOKENS = 500; // response token limit

const SYSTEM_PROMPT =
  "You are a clause similarity detector for a document management system. " +
  "Compare the INPUT TEXT to each numbered CLAUSE below. " +
  "Rate the semantic similarity of each clause to the input text on a scale of 0 to 100. " +
  "Output EXACTLY one line per clause in this format: N: SCORE - REASON\n" +
  "Where N is the clause number, SCORE is 0-100, and REASON is a brief explanation.\n" +
  "Example: 1: 85 - Both clauses address limitation of liability with similar scope";

/* ============= Types ============= */

export interface ClauseMatch {
  clause: Clause;
  similarity: number; // 0-100 AI-rated similarity score
  keywordScore: number; // 0-1 keyword overlap score (pre-filter)
  matchReason: string; // brief explanation from AI
}

export interface FindSimilarResult {
  suggestions: ClauseMatch[];
  totalCandidates: number; // how many clauses were pre-filtered
  aiCompared: number; // how many went to AI scoring
  provider?: string;
  model?: string;
}

/* ============= Stopwords ============= */

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "into",
  "about",
  "between",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "and",
  "or",
  "but",
  "nor",
  "not",
  "no",
  "if",
  "then",
  "than",
  "so",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "he",
  "she",
  "they",
  "we",
  "you",
  "i",
  "me",
  "my",
  "your",
  "his",
  "her",
  "our",
  "their",
  "which",
  "what",
  "who",
  "whom",
  "where",
  "when",
  "how",
  "all",
  "each",
  "any",
  "both",
  "such",
  "other",
]);

/* ============= Keyword Extraction ============= */

/**
 * Extract significant keywords from text.
 * Lowercases, splits on non-alphanumeric, removes stopwords and short words.
 */
export function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  return new Set(words);
}

/**
 * Compute Jaccard similarity between two keyword sets.
 * Returns 0-1 where 1 = identical keyword sets.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of a) {
    if (b.has(word)) intersectionSize++;
  }

  const unionSize = a.size + b.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

/* ============= Text Truncation ============= */

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n...[truncated]";
}

/* ============= AI Response Parsing ============= */

/**
 * Parse AI response to extract per-clause similarity scores.
 * Expected format: "N: SCORE - REASON" per line.
 * Returns a map of clauseIndex -> { score, reason }.
 */
export function parseAiSimilarityResponse(
  response: string,
  expectedCount: number
): Map<number, { score: number; reason: string }> {
  const results = new Map<number, { score: number; reason: string }>();
  const lines = response.trim().split("\n");

  for (const line of lines) {
    // Match patterns like "1: 85 - Both clauses address..." or "1: 85 – reason"
    const match = line.match(/^(\d+)\s*:\s*(\d+)\s*[-–—]\s*(.+)/);
    if (match) {
      const index = parseInt(match[1], 10);
      const score = parseInt(match[2], 10);
      const reason = match[3].trim();

      if (index >= 1 && index <= expectedCount && score >= 0 && score <= 100) {
        results.set(index, { score, reason });
      }
    }
  }

  return results;
}

/* ============= Main Entry Point ============= */

/**
 * Find clauses in the workspace library that are similar to the given text.
 *
 * Two-stage pipeline:
 *   1. Fast keyword overlap pre-filter (no AI call for obvious mismatches)
 *   2. AI comparison for top candidates using composeText() with similarity scoring
 *
 * @param text - The text selection to find similar clauses for
 * @param workspaceId - The workspace to search clauses in
 * @returns Ranked list of matching clauses with similarity scores
 */
export async function findSimilarClauses(
  text: string,
  workspaceId: string
): Promise<FindSimilarResult> {
  const emptyResult: FindSimilarResult = {
    suggestions: [],
    totalCandidates: 0,
    aiCompared: 0,
  };

  // Guard: empty or very short input
  if (!text || text.trim().length < 20) {
    return emptyResult;
  }

  // Step 1: Fetch all active clauses for the workspace
  const allClauses = await ClausesStore.getByWorkspace(workspaceId);
  if (allClauses.length === 0) {
    return emptyResult;
  }

  // Step 2: Keyword pre-filter
  const inputKeywords = extractKeywords(text);
  if (inputKeywords.size === 0) {
    return emptyResult;
  }

  const scored: Array<{ clause: Clause; keywordScore: number }> = [];

  for (const clause of allClauses) {
    const clauseKeywords = extractKeywords(clause.contentText);
    const score = jaccardSimilarity(inputKeywords, clauseKeywords);

    if (score >= MIN_KEYWORD_OVERLAP) {
      scored.push({ clause, keywordScore: score });
    }
  }

  if (scored.length === 0) {
    return { ...emptyResult, totalCandidates: allClauses.length };
  }

  // Sort by keyword score descending and take top N
  scored.sort((a, b) => b.keywordScore - a.keywordScore);
  const candidates = scored.slice(0, MAX_CANDIDATES);

  // Step 3: AI similarity scoring for top candidates
  const truncatedInput = truncateText(text, MAX_INPUT_TEXT_CHARS);

  const clauseTexts = candidates.map((c, i) => {
    const truncated = truncateText(c.clause.contentText, MAX_CLAUSE_TEXT_CHARS);
    return `CLAUSE ${i + 1} (${c.clause.title}):\n${truncated}`;
  });

  const userPrompt =
    `INPUT TEXT:\n---\n${truncatedInput}\n---\n\n` +
    `CLAUSES TO COMPARE:\n\n${clauseTexts.join("\n\n")}`;

  try {
    const aiResult = await withTimeout(
      composeText(userPrompt, {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: MAX_AI_TOKENS,
      }),
      SIMILARITY_TIMEOUT_MS,
      `Clause similarity detection timed out after ${SIMILARITY_TIMEOUT_MS / 1000}s`
    );

    const parsed = parseAiSimilarityResponse(aiResult.text, candidates.length);

    // Build results combining AI scores with clause data
    const suggestions: ClauseMatch[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const aiScore = parsed.get(i + 1); // 1-indexed

      const similarity = aiScore ? aiScore.score : Math.round(candidate.keywordScore * 100);
      const matchReason = aiScore
        ? aiScore.reason
        : "Matched by keyword overlap (AI score unavailable)";

      if (similarity >= MIN_SIMILARITY_SCORE) {
        suggestions.push({
          clause: candidate.clause,
          similarity,
          keywordScore: candidate.keywordScore,
          matchReason,
        });
      }
    }

    // Sort by similarity score descending
    suggestions.sort((a, b) => b.similarity - a.similarity);

    return {
      suggestions,
      totalCandidates: allClauses.length,
      aiCompared: candidates.length,
      provider: aiResult.provider,
      model: aiResult.model,
    };
  } catch (err) {
    // AI call failed — graceful fallback to keyword-only scores
    const message = err instanceof Error ? err.message : String(err);
    console.error("[clauseMatcher] AI similarity scoring failed:", message);

    const suggestions: ClauseMatch[] = candidates
      .map((c) => ({
        clause: c.clause,
        similarity: Math.round(c.keywordScore * 100),
        keywordScore: c.keywordScore,
        matchReason: "Matched by keyword overlap (AI unavailable)",
      }))
      .filter((s) => s.similarity >= MIN_SIMILARITY_SCORE);

    suggestions.sort((a, b) => b.similarity - a.similarity);

    return {
      suggestions,
      totalCandidates: allClauses.length,
      aiCompared: 0,
    };
  }
}
