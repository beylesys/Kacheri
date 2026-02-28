// KACHERI BACKEND/src/knowledge/semanticSearch.ts
// Cross-Document Intelligence: Semantic search engine
//
// Accepts natural language queries and produces AI-ranked results with citations.
// 4-step pipeline:
//   1. AI term extraction (parse query into search terms)
//   2. FTS5 candidate search (docs_fts + entities_fts)
//   3. Context gathering (load extraction summaries + entity mentions)
//   4. AI synthesis (ranked results with answer and citations)
//
// Overall timeout: 20s with graceful fallback at every stage.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 6

import { composeText } from "../ai/modelRouter";
import { withTimeout } from "../ai/extractors/index";
import { FtsSync, type DocFtsResult } from "./ftsSync";
import { ExtractionsStore } from "../store/extractions";
import { EntityMentionsStore } from "../store/entityMentions";
import { WorkspaceEntitiesStore } from "../store/workspaceEntities";
import { KnowledgeQueriesStore } from "../store/knowledgeQueries";

/* ============= Constants ============= */

const OVERALL_TIMEOUT_MS = 20_000; // 20 seconds for full pipeline
const TERM_EXTRACTION_TIMEOUT_MS = 5_000; // 5 seconds for term extraction
const SYNTHESIS_TIMEOUT_MS = 12_000; // 12 seconds for AI synthesis
const MAX_CANDIDATES = 10; // max docs sent to AI for synthesis
const MAX_FTS_RESULTS = 20; // FTS5 fetch limit before dedup
const MAX_EXTRACTION_SUMMARY_LENGTH = 500; // chars per doc in context
const MAX_MENTIONS_PER_DOC = 5; // entity mentions included per doc
const TERM_EXTRACTION_MAX_TOKENS = 200; // AI response limit for term extraction
const SYNTHESIS_MAX_TOKENS = 800; // AI response limit for synthesis
const DEFAULT_RELEVANCE = 0.5; // fallback relevance when AI parsing fails

/**
 * Convert an FTS5 BM25 rank score to a 0-1 relevance value.
 * FTS5 ranks are negative (more negative = more relevant).
 * Maps: rank 0 → 0.1, rank -10 → 1.0.
 */
function ftsRankToRelevance(rank: number): number {
  if (rank >= 0) return 0.1;
  return Math.min(1, Math.max(0.1, -rank / 10));
}

/* ============= AI System Prompts ============= */

const TERM_EXTRACTION_SYSTEM_PROMPT =
  "You are a search query analyzer for a document management system. " +
  "Given a natural language query, extract the key search terms and entity names. " +
  "Output one term per line. Include entity names (people, organizations, amounts, dates) " +
  "and important keywords. Do NOT include common words (the, is, what, are, how, do, etc.). " +
  "Do NOT include explanations — only output search terms, one per line.";

const SYNTHESIS_SYSTEM_PROMPT =
  "You are a document search assistant for a legal/business document management system. " +
  "Given a user query and candidate documents with their extraction summaries and entity data, produce:\n\n" +
  "1. First line: ANSWER: A concise answer (1-3 sentences) citing specific documents by their [Doc N] number.\n" +
  "2. Then for each relevant document, output a RESULT line in this format:\n" +
  "   RESULT N: RELEVANCE - ENTITIES - REASON\n" +
  "   Where N=document number (from the candidate list), RELEVANCE=0.00-1.00, " +
  "ENTITIES=comma-separated matched entity names, REASON=brief explanation of relevance.\n\n" +
  "Only include documents that are actually relevant to the query. Order by relevance (highest first).\n" +
  "If no documents are relevant, output: ANSWER: No relevant documents found for this query.\n\n" +
  "Example:\n" +
  "ANSWER: Based on [Doc 1] and [Doc 3], your payment terms with Acme Corp are Net-30 at $150,000/year.\n" +
  "RESULT 1: 0.95 - Acme Corp, $150,000 - Services agreement specifying payment terms\n" +
  "RESULT 3: 0.72 - Acme Corp - Invoice referencing the same payment schedule";

/* ============= Types ============= */

/** Options for semantic search */
export interface SemanticSearchOptions {
  /** Max results to return (default 10) */
  limit?: number;
  /** User ID for query logging */
  queriedBy: string;
  /** Overall timeout in ms (default 20000) */
  timeoutMs?: number;
}

/** A snippet from a search result */
export interface SearchResultSnippet {
  text: string;
  fieldPath?: string;
  highlightRanges?: [number, number][];
}

/** A single ranked search result */
export interface SearchResult {
  docId: string;
  docTitle: string;
  relevance: number;
  snippets: SearchResultSnippet[];
  matchedEntities: string[];
}

/** Complete semantic search response */
export interface SemanticSearchResult {
  queryId: string;
  query: string;
  answer: string;
  results: SearchResult[];
  resultCount: number;
  proofId?: string;
  durationMs: number;
}

/** Internal: candidate document with gathered context */
interface CandidateDoc {
  docId: string;
  title: string;
  ftsSnippet: string;
  ftsRank: number;
  extractionSummary: string;
  documentType: string;
  entities: Array<{ name: string; entityType: string; context: string | null }>;
}

/* ============= Step 1: Term Extraction ============= */

/**
 * Extract key search terms from a natural language query using AI.
 * Falls back to raw whitespace-split tokens on failure/timeout.
 */
async function extractSearchTerms(query: string): Promise<string[]> {
  // Fallback: split query into words, filter short/common ones
  const fallbackTerms = query
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .map((t) => t.replace(/[?!.,;:'"()[\]{}]/g, "").trim())
    .filter((t) => t.length > 0);

  try {
    const result = await withTimeout(
      composeText(query, {
        systemPrompt: TERM_EXTRACTION_SYSTEM_PROMPT,
        maxTokens: TERM_EXTRACTION_MAX_TOKENS,
      }),
      TERM_EXTRACTION_TIMEOUT_MS,
      "Term extraction timed out"
    );

    const terms = result.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.length < 100);

    // If AI returned valid terms, use them; otherwise fall back
    return terms.length > 0 ? terms : fallbackTerms;
  } catch (err) {
    console.warn("[semantic_search] Term extraction failed, using fallback:", err);
    return fallbackTerms;
  }
}

/* ============= Step 2: FTS5 Candidate Search ============= */

/**
 * Search FTS5 indexes for candidate documents matching search terms.
 * Searches both docs_fts and entities_fts, deduplicates by docId.
 * Returns up to `limit` unique candidate doc IDs with FTS snippets.
 */
async function gatherFtsCandidates(
  workspaceId: string,
  terms: string[],
  limit: number
): Promise<{ docId: string; title: string; snippet: string; rank: number }[]> {
  // Build a combined search query from all terms
  const searchQuery = terms.join(" ");
  if (!searchQuery.trim()) return [];

  // Search docs
  const docResults = await FtsSync.searchDocs(workspaceId, searchQuery, {
    limit: MAX_FTS_RESULTS,
  });

  // Search entities to find additional docs via their mentions
  const entityResults = await FtsSync.searchEntities(workspaceId, searchQuery, {
    limit: MAX_FTS_RESULTS,
  });

  // Collect doc IDs from direct doc search (preserving BM25 rank)
  const docMap = new Map<string, { title: string; snippet: string; rank: number }>();
  for (const doc of docResults) {
    if (!docMap.has(doc.docId)) {
      docMap.set(doc.docId, { title: doc.title, snippet: doc.snippet, rank: doc.rank });
    }
  }

  // For entity matches, look up their document mentions
  // These don't have a direct FTS rank, so assign a neutral rank
  for (const entityResult of entityResults) {
    const mentions = await EntityMentionsStore.getByEntity(entityResult.entityId, {
      limit: 10,
    });
    for (const mention of mentions) {
      // Skip non-doc mentions (from other products like research, design-studio)
      if (!mention.docId) continue;
      if (!docMap.has(mention.docId)) {
        docMap.set(mention.docId, {
          title: mention.docTitle ?? "Untitled",
          snippet: mention.context ?? "",
          rank: -1,
        });
      }
    }
  }

  // Convert to array, cap at limit
  const candidates: { docId: string; title: string; snippet: string; rank: number }[] = [];
  for (const [docId, info] of docMap) {
    if (candidates.length >= limit) break;
    candidates.push({ docId, title: info.title, snippet: info.snippet, rank: info.rank });
  }

  return candidates;
}

/* ============= Step 3: Context Gathering ============= */

/**
 * Load extraction summaries and entity mentions for each candidate document.
 * Builds structured CandidateDoc objects for AI synthesis.
 */
async function buildCandidateContext(
  candidates: { docId: string; title: string; snippet: string; rank: number }[]
): Promise<CandidateDoc[]> {
  const enriched: CandidateDoc[] = [];

  // Batch-fetch all extractions in a single query (N+1 → 1)
  const docIds = candidates.map((c) => c.docId);
  const extractionMap = await ExtractionsStore.getByDocIds(docIds);

  for (const candidate of candidates) {
    // Load extraction summary
    let extractionSummary = "";
    let documentType = "unknown";

    const extraction = extractionMap.get(candidate.docId) ?? null;
    if (extraction) {
      documentType = extraction.documentType;
      // Build a concise summary from extraction data
      extractionSummary = summarizeExtraction(extraction.extraction, extraction.documentType);
    }

    // Load entity mentions for this doc
    const mentions = await EntityMentionsStore.getByDoc(candidate.docId);
    const entities: CandidateDoc["entities"] = [];

    for (const mention of mentions.slice(0, MAX_MENTIONS_PER_DOC)) {
      const entity = await WorkspaceEntitiesStore.getById(mention.entityId);
      if (entity) {
        entities.push({
          name: entity.name,
          entityType: entity.entityType,
          context: mention.context,
        });
      }
    }

    enriched.push({
      docId: candidate.docId,
      title: candidate.title,
      ftsSnippet: candidate.snippet,
      ftsRank: candidate.rank,
      extractionSummary,
      documentType,
      entities,
    });
  }

  return enriched;
}

/**
 * Create a concise text summary from extraction data for AI context.
 * Caps output at MAX_EXTRACTION_SUMMARY_LENGTH chars.
 */
function summarizeExtraction(
  data: Record<string, unknown>,
  documentType: string
): string {
  const parts: string[] = [`Type: ${documentType}`];

  // Extract key fields based on document type
  if (documentType === "contract") {
    const parties = data.parties as Array<{ name?: string; role?: string }> | undefined;
    if (parties?.length) {
      parts.push(`Parties: ${parties.map((p) => p.name).filter(Boolean).join(", ")}`);
    }
    if (data.effectiveDate) parts.push(`Effective: ${data.effectiveDate}`);
    if (data.expirationDate) parts.push(`Expires: ${data.expirationDate}`);
    if (data.governingLaw) parts.push(`Governing Law: ${data.governingLaw}`);
    const payment = data.paymentTerms as { amount?: number; currency?: string } | undefined;
    if (payment?.amount != null) parts.push(`Payment: ${payment.currency ?? "$"}${payment.amount}`);
  } else if (documentType === "invoice") {
    const vendor = data.vendor as { name?: string } | undefined;
    const customer = data.customer as { name?: string } | undefined;
    if (vendor?.name) parts.push(`Vendor: ${vendor.name}`);
    if (customer?.name) parts.push(`Customer: ${customer.name}`);
    if (data.total != null) parts.push(`Total: ${data.total}`);
    if (data.issueDate) parts.push(`Issued: ${data.issueDate}`);
    if (data.dueDate) parts.push(`Due: ${data.dueDate}`);
  } else if (documentType === "proposal") {
    if (data.vendor) parts.push(`Vendor: ${data.vendor}`);
    if (data.client) parts.push(`Client: ${data.client}`);
    const pricing = data.pricing as { total?: number } | undefined;
    if (pricing?.total != null) parts.push(`Total: ${pricing.total}`);
  } else if (documentType === "meeting_notes") {
    if (data.date) parts.push(`Date: ${data.date}`);
    const attendees = data.attendees as string[] | undefined;
    if (attendees?.length) parts.push(`Attendees: ${attendees.join(", ")}`);
  } else if (documentType === "report") {
    if (data.author) parts.push(`Author: ${data.author}`);
    if (data.date) parts.push(`Date: ${data.date}`);
  }

  // Add summary field if present
  if (typeof data.summary === "string" && data.summary.length > 0) {
    parts.push(`Summary: ${data.summary}`);
  }

  const full = parts.join("; ");
  return full.length > MAX_EXTRACTION_SUMMARY_LENGTH
    ? full.substring(0, MAX_EXTRACTION_SUMMARY_LENGTH) + "..."
    : full;
}

/**
 * Format candidate documents as a text prompt for AI synthesis.
 */
function formatCandidatesForAI(candidates: CandidateDoc[]): string {
  const lines: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const docNum = i + 1;
    lines.push(`[Doc ${docNum}] "${c.title}" (${c.documentType})`);

    if (c.extractionSummary) {
      lines.push(`  Extraction: ${c.extractionSummary}`);
    }

    if (c.ftsSnippet) {
      lines.push(`  Snippet: ${c.ftsSnippet}`);
    }

    if (c.entities.length > 0) {
      const entityList = c.entities
        .map((e) => `${e.name} (${e.entityType})`)
        .join(", ");
      lines.push(`  Entities: ${entityList}`);
    }

    lines.push(""); // blank line between docs
  }

  return lines.join("\n");
}

/* ============= Step 4: AI Synthesis ============= */

/** Parsed result from AI synthesis response */
interface AISynthesisResult {
  answer: string;
  results: Array<{
    docIndex: number; // 0-based index into candidates array
    relevance: number;
    matchedEntities: string[];
    reason: string;
  }>;
}

/**
 * Send query + candidate context to AI for ranked synthesis.
 * Returns structured answer and per-document relevance.
 */
async function synthesizeAnswer(
  query: string,
  candidates: CandidateDoc[]
): Promise<AISynthesisResult> {
  const candidateText = formatCandidatesForAI(candidates);
  const userPrompt = `Query: "${query}"\n\nCandidate Documents:\n${candidateText}`;

  const result = await withTimeout(
    composeText(userPrompt, {
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      maxTokens: SYNTHESIS_MAX_TOKENS,
    }),
    SYNTHESIS_TIMEOUT_MS,
    "Synthesis timed out"
  );

  return parseSynthesisResponse(result.text, candidates);
}

/**
 * Parse the AI synthesis response into structured results.
 * Expects format:
 *   ANSWER: <text>
 *   RESULT N: RELEVANCE - ENTITIES - REASON
 */
function parseSynthesisResponse(
  text: string,
  candidates: CandidateDoc[]
): AISynthesisResult {
  const lines = text.split("\n").map((l) => l.trim());

  // Extract answer (everything after ANSWER: until first RESULT line)
  let answer = "";
  const answerLines: string[] = [];
  let pastAnswer = false;

  for (const line of lines) {
    if (line.toUpperCase().startsWith("ANSWER:")) {
      answerLines.push(line.substring("ANSWER:".length).trim());
      pastAnswer = true;
    } else if (pastAnswer && !line.toUpperCase().startsWith("RESULT")) {
      if (line.length > 0) answerLines.push(line);
    } else if (line.toUpperCase().startsWith("RESULT")) {
      break;
    }
  }
  answer = answerLines.join(" ").trim();

  // If no structured answer found, use the whole text as the answer
  if (!answer) {
    answer = text.trim();
  }

  // Parse RESULT lines
  // Format: RESULT N: RELEVANCE - ENTITIES - REASON
  const resultRegex = /^RESULT\s+(\d+)\s*:\s*([\d.]+)\s*-\s*([^-]*?)\s*-\s*(.+)$/i;
  const results: AISynthesisResult["results"] = [];

  for (const line of lines) {
    const match = resultRegex.exec(line);
    if (!match) continue;

    const docNum = parseInt(match[1], 10);
    const relevance = Math.min(1, Math.max(0, parseFloat(match[2]) || DEFAULT_RELEVANCE));
    const entitiesStr = match[3].trim();
    const reason = match[4].trim();

    // docNum is 1-based, convert to 0-based index
    const docIndex = docNum - 1;
    if (docIndex < 0 || docIndex >= candidates.length) continue;

    const matchedEntities = entitiesStr
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    results.push({ docIndex, relevance, matchedEntities, reason });
  }

  // Sort by relevance descending
  results.sort((a, b) => b.relevance - a.relevance);

  return { answer, results };
}

/* ============= Main Entry Point ============= */

/**
 * Execute a semantic search across workspace documents.
 *
 * Pipeline:
 * 1. AI term extraction from query
 * 2. FTS5 keyword search for candidate documents
 * 3. Context gathering (extraction summaries + entity mentions)
 * 4. AI synthesis (ranked answer with citations)
 *
 * Logs query and results to knowledge_queries for provenance.
 * 20s overall timeout with graceful fallback at every stage.
 */
async function semanticSearch(
  workspaceId: string,
  query: string,
  opts: SemanticSearchOptions
): Promise<SemanticSearchResult> {
  const startTime = Date.now();
  const limit = opts.limit ?? MAX_CANDIDATES;
  const overallTimeout = opts.timeoutMs ?? OVERALL_TIMEOUT_MS;

  // Wrap the entire pipeline in a timeout
  try {
    const result = await withTimeout(
      runSearchPipeline(workspaceId, query, limit, opts.queriedBy, startTime),
      overallTimeout,
      "Semantic search pipeline timed out"
    );
    return result;
  } catch (err) {
    // Overall timeout hit — return whatever we can
    console.warn("[semantic_search] Overall timeout, returning fallback:", err);
    const durationMs = Date.now() - startTime;

    // Attempt a quick FTS5-only search as fallback
    const fallbackTerms = query.split(/\s+/).filter((t) => t.length > 2);
    const fallbackCandidates = await gatherFtsCandidates(workspaceId, fallbackTerms, limit);
    const fallbackResults: SearchResult[] = fallbackCandidates.map((c) => ({
      docId: c.docId,
      docTitle: c.title,
      relevance: ftsRankToRelevance(c.rank),
      snippets: c.snippet ? [{ text: c.snippet }] : [],
      matchedEntities: [],
    }));

    // Log the timed-out query
    const queryRecord = await KnowledgeQueriesStore.create({
      workspaceId,
      queryText: query,
      queryType: "semantic_search",
      results: fallbackResults,
      resultCount: fallbackResults.length,
      queriedBy: opts.queriedBy,
      durationMs,
    });

    return {
      queryId: queryRecord.id,
      query,
      answer: "Search timed out. Showing keyword-matched results only.",
      results: fallbackResults,
      resultCount: fallbackResults.length,
      durationMs,
    };
  }
}

/**
 * Internal: runs the full 4-step search pipeline.
 * Separated from semanticSearch() to allow wrapping in withTimeout.
 */
async function runSearchPipeline(
  workspaceId: string,
  query: string,
  limit: number,
  queriedBy: string,
  startTime: number
): Promise<SemanticSearchResult> {
  // Step 1: Extract search terms (AI-assisted, with fallback)
  const terms = await extractSearchTerms(query);

  // Step 2: FTS5 candidate search
  const rawCandidates = await gatherFtsCandidates(workspaceId, terms, limit);

  // If no candidates found, return empty result immediately
  if (rawCandidates.length === 0) {
    const durationMs = Date.now() - startTime;
    const queryRecord = await KnowledgeQueriesStore.create({
      workspaceId,
      queryText: query,
      queryType: "semantic_search",
      results: [],
      resultCount: 0,
      queriedBy,
      durationMs,
    });

    return {
      queryId: queryRecord.id,
      query,
      answer: "No matching documents found for this query.",
      results: [],
      resultCount: 0,
      durationMs,
    };
  }

  // Step 3: Context gathering
  const candidates = await buildCandidateContext(rawCandidates);

  // Step 4: AI synthesis (with fallback to FTS5 results on failure)
  let answer: string;
  let searchResults: SearchResult[];

  try {
    const synthesis = await synthesizeAnswer(query, candidates);
    answer = synthesis.answer;

    // Map AI results back to SearchResult format
    searchResults = synthesis.results.map((r) => {
      const candidate = candidates[r.docIndex];
      return {
        docId: candidate.docId,
        docTitle: candidate.title,
        relevance: r.relevance,
        snippets: candidate.ftsSnippet
          ? [{ text: candidate.ftsSnippet }]
          : [],
        matchedEntities: r.matchedEntities,
      };
    });

    // Add any candidates not mentioned by AI with low relevance
    const mentionedDocIds = new Set(searchResults.map((r) => r.docId));
    for (const candidate of candidates) {
      if (!mentionedDocIds.has(candidate.docId) && searchResults.length < limit) {
        searchResults.push({
          docId: candidate.docId,
          docTitle: candidate.title,
          relevance: 0.1,
          snippets: candidate.ftsSnippet
            ? [{ text: candidate.ftsSnippet }]
            : [],
          matchedEntities: candidate.entities.map((e) => e.name),
        });
      }
    }
  } catch (err) {
    // AI synthesis failed — fall back to FTS5 results with BM25-based relevance
    console.warn("[semantic_search] AI synthesis failed, using FTS5 fallback:", err);
    answer = "Results found but AI summarization was unavailable. Showing keyword-matched results.";
    searchResults = candidates.map((c) => ({
      docId: c.docId,
      docTitle: c.title,
      relevance: ftsRankToRelevance(c.ftsRank),
      snippets: c.ftsSnippet ? [{ text: c.ftsSnippet }] : [],
      matchedEntities: c.entities.map((e) => e.name),
    }));
  }

  // Log the query for provenance
  const durationMs = Date.now() - startTime;
  const queryRecord = await KnowledgeQueriesStore.create({
    workspaceId,
    queryText: query,
    queryType: "semantic_search",
    results: searchResults,
    resultCount: searchResults.length,
    queriedBy,
    durationMs,
  });

  return {
    queryId: queryRecord.id,
    query,
    answer,
    results: searchResults,
    resultCount: searchResults.length,
    durationMs,
  };
}

/* ============= Export ============= */

export const SemanticSearch = {
  search: semanticSearch,
  // Exposed for testing
  extractSearchTerms,
  gatherFtsCandidates,
  buildCandidateContext,
  synthesizeAnswer,
  parseSynthesisResponse,
  summarizeExtraction,
  formatCandidatesForAI,
};
