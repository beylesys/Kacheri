// KACHERI BACKEND/src/negotiation/changeAnalyzer.ts
// Negotiation: AI-powered change analysis engine
//
// For a given negotiation change, produces structured AI analysis:
//   - Risk level assessment (low/medium/high/critical)
//   - Business/legal impact description
//   - Historical context from knowledge graph
//   - Clause library comparison
//   - Compliance policy check
//   - Recommendation (accept/reject/counter/review) with reasoning
//
// Two modes:
//   - analyzeSingle(): deep-dive on one change (full context, thorough)
//   - batchAnalyze(): all changes in a round (grouped, max 10 AI calls)
//
// Uses composeText() from modelRouter — no new AI infrastructure.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 3

import { composeText } from "../ai/modelRouter";
import { withTimeout } from "../ai/extractors/index";
import { findSimilarClauses, type ClauseMatch } from "../ai/clauseMatcher";
import {
  NegotiationChangesStore,
  type AnalysisResult,
  type RiskLevel,
  type ChangeCategory,
  type NegotiationChange,
} from "../store/negotiationChanges";
import { WorkspaceEntitiesStore, type WorkspaceEntity } from "../store/workspaceEntities";
import { CompliancePoliciesStore, type CompliancePolicy } from "../store/compliancePolicies";
import { HistoricalAnalyzer, type HistoricalContext } from "./historicalAnalyzer";
import { NegotiationSessionsStore } from "../store/negotiationSessions";

/* ============= Constants ============= */

const SINGLE_ANALYSIS_TIMEOUT_MS = 15_000; // 15 seconds per single analysis
const BATCH_ANALYSIS_TIMEOUT_MS = 30_000; // 30 seconds for entire batch
const MAX_AI_CALLS_PER_BATCH = 10;
const MAX_EDITORIAL_PER_GROUP = 8; // editorial changes batched together
const MAX_CHANGE_TEXT_CHARS = 2_000; // truncation for AI prompt
const ANALYSIS_MAX_TOKENS = 600; // AI response limit
const CONTEXT_QUERY_TIMEOUT_MS = 5_000; // 5s for each context query

/* ============= Types ============= */

/** Context needed for analyzing a change */
export interface AnalysisContext {
  workspaceId: string;
  sessionId: string;
  /** Document type from extraction (e.g. "contract", "proposal") */
  documentType?: string;
}

/** Result of a single change analysis */
export interface AnalyzeResult {
  changeId: string;
  analysis: AnalysisResult;
  provider?: string;
  model?: string;
  /** true if the change already had analysis (skipped AI call) */
  fromCache: boolean;
}

/** Result of a batch analysis */
export interface BatchAnalyzeResult {
  analyzed: number;
  failed: number;
  /** Already had analysis, skipped */
  skipped: number;
  results: AnalyzeResult[];
  durationMs: number;
}

/** Gathered context from knowledge graph, clause library, compliance policies, historical analysis */
interface GatheredContext {
  historicalEntities: WorkspaceEntity[];
  clauseMatches: ClauseMatch[];
  compliancePolicies: CompliancePolicy[];
  /** Rich historical deal context (Slice 19: Cross-Feature Integration) */
  historicalContext: HistoricalContext | null;
}

/* ============= AI System Prompt ============= */

const ANALYSIS_SYSTEM_PROMPT =
  "You are a contract negotiation analyst. Given a specific change between two document versions, analyze its significance.\n\n" +
  "You MUST respond with valid JSON only (no markdown, no explanation outside JSON).\n\n" +
  "JSON schema:\n" +
  "{\n" +
  '  "category": "substantive" | "editorial" | "structural",\n' +
  '  "riskLevel": "low" | "medium" | "high" | "critical",\n' +
  '  "summary": "One-sentence description of what changed",\n' +
  '  "impact": "Explanation of business/legal impact",\n' +
  '  "historicalContext": "How this compares to past deals (if available)" | null,\n' +
  '  "clauseComparison": "How this differs from standard language (if available)" | null,\n' +
  '  "complianceFlags": ["Any policy violations"] | [],\n' +
  '  "recommendation": "accept" | "reject" | "counter" | "review",\n' +
  '  "recommendationReason": "Why this recommendation"\n' +
  "}";

const BATCH_ANALYSIS_SYSTEM_PROMPT =
  "You are a contract negotiation analyst. Given multiple changes between two document versions, analyze each one.\n\n" +
  "You MUST respond with a JSON array only (no markdown, no explanation outside JSON).\n" +
  "Each element must have the same schema:\n" +
  "{\n" +
  '  "changeIndex": <number (0-based index matching the input order)>,\n' +
  '  "category": "substantive" | "editorial" | "structural",\n' +
  '  "riskLevel": "low" | "medium" | "high" | "critical",\n' +
  '  "summary": "One-sentence description",\n' +
  '  "impact": "Business/legal impact",\n' +
  '  "historicalContext": null,\n' +
  '  "clauseComparison": null,\n' +
  '  "complianceFlags": [],\n' +
  '  "recommendation": "accept" | "reject" | "counter" | "review",\n' +
  '  "recommendationReason": "Why"\n' +
  "}";

/* ============= Context Gathering ============= */

/**
 * Gather context from knowledge graph, clause library, and compliance policies.
 * Each source is non-blocking — failures return empty results.
 */
async function gatherContext(
  change: NegotiationChange,
  ctx: AnalysisContext
): Promise<GatheredContext> {
  const changeText = (change.originalText ?? "") + " " + (change.proposedText ?? "");
  const queryTerms = extractQueryTerms(changeText);

  // Look up session for counterparty name (Slice 19: HistoricalAnalyzer integration)
  const session = await NegotiationSessionsStore.getById(ctx.sessionId);
  const counterpartyName = session?.counterpartyName ?? "";

  // Run all four context queries in parallel with individual timeouts
  const [historicalEntities, clauseMatches, compliancePolicies, historicalContext] = await Promise.all([
    gatherHistoricalContext(ctx.workspaceId, queryTerms),
    gatherClauseContext(change, ctx.workspaceId),
    gatherCompliancePolicies(ctx.workspaceId),
    gatherHistoricalAnalysis(change, ctx, counterpartyName),
  ]);

  return { historicalEntities, clauseMatches, compliancePolicies, historicalContext };
}

/**
 * Search knowledge graph for entities mentioned in the change text.
 * Returns entities related to the change (counterparty names, amounts, terms).
 */
async function gatherHistoricalContext(
  workspaceId: string,
  queryTerms: string[]
): Promise<WorkspaceEntity[]> {
  try {
    const entities: WorkspaceEntity[] = [];
    const seenIds = new Set<string>();

    // Search for each significant term (cap at 3 searches to limit load)
    for (const term of queryTerms.slice(0, 3)) {
      if (term.length < 3) continue;
      const found = await WorkspaceEntitiesStore.search(workspaceId, term);
      for (const entity of found) {
        if (!seenIds.has(entity.id)) {
          seenIds.add(entity.id);
          entities.push(entity);
        }
      }
      if (entities.length >= 10) break; // cap results
    }

    return entities;
  } catch (err) {
    console.warn("[changeAnalyzer] Historical context gathering failed:", err);
    return [];
  }
}

/**
 * Find similar clauses in the clause library for the change text.
 * Uses the two-stage clauseMatcher (keyword pre-filter + AI scoring).
 */
async function gatherClauseContext(
  change: NegotiationChange,
  workspaceId: string
): Promise<ClauseMatch[]> {
  try {
    // Use the proposed text (or original) for clause matching
    const searchText = change.proposedText ?? change.originalText ?? "";
    if (searchText.length < 20) return [];

    const result = await withTimeout(
      findSimilarClauses(searchText, workspaceId),
      CONTEXT_QUERY_TIMEOUT_MS,
      "Clause search timed out"
    );

    return result.suggestions;
  } catch (err) {
    console.warn("[changeAnalyzer] Clause context gathering failed:", err);
    return [];
  }
}

/**
 * Fetch enabled compliance policies for the workspace.
 * Synchronous (SQLite), but wrapped for consistency.
 */
async function gatherCompliancePolicies(
  workspaceId: string
): Promise<CompliancePolicy[]> {
  try {
    return await CompliancePoliciesStore.getEnabled(workspaceId);
  } catch (err) {
    console.warn("[changeAnalyzer] Compliance policy fetch failed:", err);
    return [];
  }
}

/**
 * Query the HistoricalAnalyzer for rich historical deal context.
 * Provides acceptance rates, amount trends, similar past changes, and counterparty history.
 * Synchronous (all SQLite queries), wrapped in async for Promise.all compatibility.
 *
 * Slice 19: Cross-Feature Integration — feeds HistoricalAnalyzer data into AI prompts.
 */
async function gatherHistoricalAnalysis(
  change: NegotiationChange,
  ctx: AnalysisContext,
  counterpartyName: string
): Promise<HistoricalContext | null> {
  try {
    return HistoricalAnalyzer.getHistoricalContext(change, {
      workspaceId: ctx.workspaceId,
      sessionId: ctx.sessionId,
      counterpartyName,
    });
  } catch (err) {
    console.warn("[changeAnalyzer] Historical analysis failed:", err);
    return null;
  }
}

/* ============= Prompt Building ============= */

/**
 * Build the AI analysis prompt for a single change with full context.
 */
function buildAnalysisPrompt(
  change: NegotiationChange,
  ctx: AnalysisContext,
  gathered: GatheredContext
): string {
  const lines: string[] = [];

  // Document context
  lines.push(`Document type: ${ctx.documentType ?? "unknown"}`);
  if (change.sectionHeading) {
    lines.push(`Section: ${change.sectionHeading}`);
  }

  // Change details
  lines.push("");
  lines.push(`Change type: ${change.changeType}`);
  lines.push(`Current category (heuristic): ${change.category}`);

  if (change.originalText) {
    lines.push(`Previous text: ${truncateText(change.originalText, MAX_CHANGE_TEXT_CHARS)}`);
  }
  if (change.proposedText) {
    lines.push(`Proposed text: ${truncateText(change.proposedText, MAX_CHANGE_TEXT_CHARS)}`);
  }

  // Historical context from knowledge graph
  if (gathered.historicalEntities.length > 0) {
    lines.push("");
    lines.push("Historical data from knowledge graph:");
    for (const entity of gathered.historicalEntities.slice(0, 5)) {
      const meta = entity.metadata
        ? ` (${JSON.stringify(entity.metadata).slice(0, 100)})`
        : "";
      lines.push(
        `  - ${entity.name} [${entity.entityType}]: mentioned in ${entity.docCount} docs, ${entity.mentionCount} times${meta}`
      );
    }
  }

  // Clause library comparison
  if (gathered.clauseMatches.length > 0) {
    lines.push("");
    lines.push("Standard clauses from clause library:");
    for (const match of gathered.clauseMatches.slice(0, 3)) {
      lines.push(
        `  - "${match.clause.title}" (similarity: ${match.similarity}%): ${truncateText(match.clause.contentText, 200)}`
      );
    }
  }

  // Compliance policies
  if (gathered.compliancePolicies.length > 0) {
    lines.push("");
    lines.push("Active compliance policies:");
    for (const policy of gathered.compliancePolicies.slice(0, 5)) {
      lines.push(
        `  - ${policy.name} [${policy.severity}]: ${policy.description ?? policy.ruleType}`
      );
    }
  }

  // Rich historical context (Slice 19: Cross-Feature Integration — HistoricalAnalyzer)
  if (gathered.historicalContext?.summary) {
    lines.push("");
    lines.push("Historical deal context:");
    lines.push(gathered.historicalContext.summary);
  }

  return lines.join("\n");
}

/**
 * Build a batch analysis prompt for multiple editorial changes.
 */
function buildBatchPrompt(
  changes: NegotiationChange[],
  ctx: AnalysisContext
): string {
  const lines: string[] = [];
  lines.push(`Document type: ${ctx.documentType ?? "unknown"}`);
  lines.push(`Analyze the following ${changes.length} changes:\n`);

  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    lines.push(`--- Change ${i} ---`);
    lines.push(`Type: ${c.changeType} | Category (heuristic): ${c.category}`);
    if (c.sectionHeading) lines.push(`Section: ${c.sectionHeading}`);
    if (c.originalText) lines.push(`Previous: ${truncateText(c.originalText, 500)}`);
    if (c.proposedText) lines.push(`Proposed: ${truncateText(c.proposedText, 500)}`);
    lines.push("");
  }

  return lines.join("\n");
}

/* ============= Response Parsing ============= */

/**
 * Parse AI JSON response into AnalysisResult.
 * Three-level fallback: direct parse → extract from code block → heuristic.
 */
function parseAnalysisResponse(
  responseText: string,
  change: NegotiationChange
): AnalysisResult {
  // Attempt 1: Direct JSON parse
  const parsed = tryParseJson(responseText);
  if (parsed && !Array.isArray(parsed) && isValidAnalysisResult(parsed)) {
    return normalizeAnalysisResult(parsed);
  }

  // Attempt 2: Extract JSON from markdown code blocks
  const codeBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const extracted = tryParseJson(codeBlockMatch[1]);
    if (extracted && !Array.isArray(extracted) && isValidAnalysisResult(extracted)) {
      return normalizeAnalysisResult(extracted);
    }
  }

  // Attempt 3: Heuristic fallback
  console.warn("[changeAnalyzer] AI response could not be parsed as JSON, using heuristic fallback");
  return buildHeuristicAnalysis(change);
}

/**
 * Parse batch AI response into an array of AnalysisResult objects.
 * Maps by changeIndex back to the original change array.
 */
function parseBatchResponse(
  responseText: string,
  changes: NegotiationChange[]
): Map<number, AnalysisResult> {
  const results = new Map<number, AnalysisResult>();

  // Attempt: parse as JSON array
  let parsed: unknown[] | null = null;

  const directParsed = tryParseJson(responseText);
  if (Array.isArray(directParsed)) {
    parsed = directParsed;
  } else {
    // Try extracting from code block
    const codeBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const extracted = tryParseJson(codeBlockMatch[1]);
      if (Array.isArray(extracted)) {
        parsed = extracted;
      }
    }
  }

  if (!parsed) {
    // All parsing failed — return heuristic results for all changes
    for (let i = 0; i < changes.length; i++) {
      results.set(i, buildHeuristicAnalysis(changes[i]));
    }
    return results;
  }

  // Map parsed results by changeIndex
  for (const item of parsed) {
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const idx = typeof obj.changeIndex === "number" ? obj.changeIndex : -1;
      if (idx >= 0 && idx < changes.length && isValidAnalysisResult(obj)) {
        results.set(idx, normalizeAnalysisResult(obj));
      }
    }
  }

  // Fill in any missing results with heuristics
  for (let i = 0; i < changes.length; i++) {
    if (!results.has(i)) {
      results.set(i, buildHeuristicAnalysis(changes[i]));
    }
  }

  return results;
}

/* ============= Single Change Analysis ============= */

/**
 * Analyze a single negotiation change in depth.
 * Full context gathering + AI analysis + storage.
 *
 * @param change - The negotiation change to analyze
 * @param ctx - Context (workspace, session, document type)
 * @returns AnalyzeResult with the analysis and AI metadata
 */
async function analyzeSingleChange(
  change: NegotiationChange,
  ctx: AnalysisContext
): Promise<AnalyzeResult> {
  // Skip if already analyzed
  if (change.aiAnalysis) {
    return {
      changeId: change.id,
      analysis: change.aiAnalysis,
      fromCache: true,
    };
  }

  try {
    // Step 1: Gather context (parallel, non-blocking)
    const gathered = await gatherContext(change, ctx);

    // Step 2: Build prompt
    const prompt = buildAnalysisPrompt(change, ctx, gathered);

    // Step 3: Call AI with timeout
    const aiResult = await withTimeout(
      composeText(prompt, {
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        maxTokens: ANALYSIS_MAX_TOKENS,
      }),
      SINGLE_ANALYSIS_TIMEOUT_MS,
      "Change analysis timed out"
    );

    // Step 4: Parse response
    const analysis = parseAnalysisResponse(aiResult.text, change);

    // Step 5: Store result
    await NegotiationChangesStore.updateAnalysis(
      change.id,
      analysis,
      analysis.riskLevel
    );

    return {
      changeId: change.id,
      analysis,
      provider: aiResult.provider,
      model: aiResult.model,
      fromCache: false,
    };
  } catch (err) {
    console.error("[changeAnalyzer] Single analysis failed for change", change.id, ":", err);

    // Fallback: store heuristic result so the change has *some* analysis
    const fallback = buildHeuristicAnalysis(change);
    await NegotiationChangesStore.updateAnalysis(
      change.id,
      fallback,
      fallback.riskLevel
    );

    return {
      changeId: change.id,
      analysis: fallback,
      fromCache: false,
    };
  }
}

/* ============= Batch Analysis ============= */

/**
 * Analyze all changes in a negotiation round.
 * Groups changes to minimize AI calls (max 10 per batch).
 *
 * Strategy:
 * - Substantive/structural changes: individual AI calls (most important)
 * - Editorial changes: grouped together (up to MAX_EDITORIAL_PER_GROUP per call)
 * - Already-analyzed changes: skipped
 * - Cap total AI calls at MAX_AI_CALLS_PER_BATCH
 *
 * @param changes - All changes in the round
 * @param ctx - Context (workspace, session, document type)
 * @returns BatchAnalyzeResult with aggregate stats and per-change results
 */
async function batchAnalyzeChanges(
  changes: NegotiationChange[],
  ctx: AnalysisContext
): Promise<BatchAnalyzeResult> {
  const startTime = Date.now();
  const results: AnalyzeResult[] = [];
  let analyzed = 0;
  let failed = 0;
  let skipped = 0;
  let aiCallsUsed = 0;

  // Separate changes by priority
  const alreadyAnalyzed: NegotiationChange[] = [];
  const substantive: NegotiationChange[] = [];
  const structural: NegotiationChange[] = [];
  const editorial: NegotiationChange[] = [];

  for (const change of changes) {
    if (change.aiAnalysis) {
      alreadyAnalyzed.push(change);
    } else if (change.category === "substantive") {
      substantive.push(change);
    } else if (change.category === "structural") {
      structural.push(change);
    } else {
      editorial.push(change);
    }
  }

  // Report already-analyzed as skipped
  for (const change of alreadyAnalyzed) {
    skipped++;
    results.push({
      changeId: change.id,
      analysis: change.aiAnalysis!,
      fromCache: true,
    });
  }

  // Phase 1: Analyze substantive changes individually (highest priority)
  for (const change of substantive) {
    if (aiCallsUsed >= MAX_AI_CALLS_PER_BATCH) break;
    if (Date.now() - startTime > BATCH_ANALYSIS_TIMEOUT_MS) break;

    try {
      const result = await analyzeSingleWithinBatch(change, ctx);
      results.push(result);
      analyzed++;
      aiCallsUsed++;
    } catch {
      failed++;
    }
  }

  // Phase 2: Analyze structural changes individually
  for (const change of structural) {
    if (aiCallsUsed >= MAX_AI_CALLS_PER_BATCH) break;
    if (Date.now() - startTime > BATCH_ANALYSIS_TIMEOUT_MS) break;

    try {
      const result = await analyzeSingleWithinBatch(change, ctx);
      results.push(result);
      analyzed++;
      aiCallsUsed++;
    } catch {
      failed++;
    }
  }

  // Phase 3: Batch-analyze editorial changes in groups
  const editorialGroups = chunkArray(editorial, MAX_EDITORIAL_PER_GROUP);

  for (const group of editorialGroups) {
    if (aiCallsUsed >= MAX_AI_CALLS_PER_BATCH) break;
    if (Date.now() - startTime > BATCH_ANALYSIS_TIMEOUT_MS) break;

    try {
      const groupResults = await analyzeEditorialGroup(group, ctx);
      for (const result of groupResults) {
        results.push(result);
        analyzed++;
      }
      aiCallsUsed++;
    } catch {
      failed += group.length;
    }
  }

  // Any remaining un-analyzed changes get heuristic fallback
  const analyzedIds = new Set(results.map((r) => r.changeId));
  for (const change of changes) {
    if (!analyzedIds.has(change.id)) {
      const fallback = buildHeuristicAnalysis(change);
      await NegotiationChangesStore.updateAnalysis(change.id, fallback, fallback.riskLevel);
      results.push({
        changeId: change.id,
        analysis: fallback,
        fromCache: false,
      });
      failed++;
    }
  }

  return {
    analyzed,
    failed,
    skipped,
    results,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Analyze a single change within a batch context (reduced context gathering).
 * Skips clause library search to save time; uses fast entity lookup only.
 */
async function analyzeSingleWithinBatch(
  change: NegotiationChange,
  ctx: AnalysisContext
): Promise<AnalyzeResult> {
  try {
    // Lighter context gathering (skip clause search for batch speed)
    const changeText = (change.originalText ?? "") + " " + (change.proposedText ?? "");
    const queryTerms = extractQueryTerms(changeText);
    const historicalEntities = await gatherHistoricalContext(ctx.workspaceId, queryTerms);

    const gathered: GatheredContext = {
      historicalEntities,
      clauseMatches: [], // skipped for batch speed
      compliancePolicies: [], // already fetched at batch level if needed
      historicalContext: null, // skipped for batch speed
    };

    const prompt = buildAnalysisPrompt(change, ctx, gathered);

    const aiResult = await withTimeout(
      composeText(prompt, {
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        maxTokens: ANALYSIS_MAX_TOKENS,
      }),
      SINGLE_ANALYSIS_TIMEOUT_MS,
      "Batch single analysis timed out"
    );

    const analysis = parseAnalysisResponse(aiResult.text, change);
    await NegotiationChangesStore.updateAnalysis(change.id, analysis, analysis.riskLevel);

    return {
      changeId: change.id,
      analysis,
      provider: aiResult.provider,
      model: aiResult.model,
      fromCache: false,
    };
  } catch (err) {
    console.error("[changeAnalyzer] Batch single analysis failed for", change.id, ":", err);

    const fallback = buildHeuristicAnalysis(change);
    await NegotiationChangesStore.updateAnalysis(change.id, fallback, fallback.riskLevel);

    return {
      changeId: change.id,
      analysis: fallback,
      fromCache: false,
    };
  }
}

/**
 * Analyze a group of editorial changes in a single AI call.
 * Returns one AnalyzeResult per change in the group.
 */
async function analyzeEditorialGroup(
  changes: NegotiationChange[],
  ctx: AnalysisContext
): Promise<AnalyzeResult[]> {
  const prompt = buildBatchPrompt(changes, ctx);

  const aiResult = await withTimeout(
    composeText(prompt, {
      systemPrompt: BATCH_ANALYSIS_SYSTEM_PROMPT,
      maxTokens: ANALYSIS_MAX_TOKENS * 2, // more tokens for multiple results
    }),
    SINGLE_ANALYSIS_TIMEOUT_MS,
    "Editorial batch analysis timed out"
  );

  const analysisMap = parseBatchResponse(aiResult.text, changes);
  const results: AnalyzeResult[] = [];

  for (let i = 0; i < changes.length; i++) {
    const analysis = analysisMap.get(i) ?? buildHeuristicAnalysis(changes[i]);
    await NegotiationChangesStore.updateAnalysis(changes[i].id, analysis, analysis.riskLevel);

    results.push({
      changeId: changes[i].id,
      analysis,
      provider: aiResult.provider,
      model: aiResult.model,
      fromCache: false,
    });
  }

  return results;
}

/* ============= Heuristic Fallback ============= */

/**
 * Build a minimal analysis result from heuristics when AI is unavailable.
 * Uses the change's existing category and text to produce a reasonable fallback.
 */
function buildHeuristicAnalysis(change: NegotiationChange): AnalysisResult {
  const riskLevel = estimateRiskLevel(change);
  const summary = buildHeuristicSummary(change);

  return {
    category: change.category,
    riskLevel,
    summary,
    impact: `${change.changeType === "delete" ? "Removal" : change.changeType === "insert" ? "Addition" : "Modification"} of ${change.category} content${change.sectionHeading ? ` in "${change.sectionHeading}"` : ""}.`,
    historicalContext: null,
    clauseComparison: null,
    complianceFlags: [],
    recommendation: riskLevel === "critical" || riskLevel === "high" ? "review" : "accept",
    recommendationReason: `Heuristic analysis: ${change.category} change with ${riskLevel} risk. AI analysis was unavailable.`,
  };
}

/**
 * Estimate risk level from change text using simple heuristics.
 * Matches the substantive scoring logic from redlineComparator but mapped to risk levels.
 */
function estimateRiskLevel(change: NegotiationChange): RiskLevel {
  const text = (change.originalText ?? "") + " " + (change.proposedText ?? "");

  if (change.category === "editorial") return "low";
  if (change.category === "structural") return "medium";

  // Substantive: check for high-risk indicators
  if (/\$[\d,.]+|\b\d+[\d,.]*\s*(dollars|USD|EUR|GBP)/i.test(text)) return "high";
  if (/\b(liability|indemnity|indemnification|termination|penalty)\b/i.test(text)) return "high";
  if (/\b(shall not|must not|may not|cannot|prohibited)\b/i.test(text)) return "high";
  if (/\d+(\.\d+)?%/.test(text)) return "medium";
  if (/\b(shall|must|will|required to|obligated to)\b/i.test(text)) return "medium";

  return "medium";
}

/**
 * Build a human-readable summary from the change text.
 */
function buildHeuristicSummary(change: NegotiationChange): string {
  const action =
    change.changeType === "delete"
      ? "Deleted"
      : change.changeType === "insert"
        ? "Added"
        : "Modified";

  const textPreview = truncateText(
    change.proposedText ?? change.originalText ?? "",
    80
  );

  const section = change.sectionHeading ? ` in "${change.sectionHeading}"` : "";

  return `${action} ${change.category} text${section}: "${textPreview}"`;
}

/* ============= Utilities ============= */

/** Truncate text to a maximum length with ellipsis. */
function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...";
}

/** Extract significant query terms from change text for entity search. */
function extractQueryTerms(text: string): string[] {
  // Split on whitespace and non-alphanumeric, filter short/common words
  const words = text
    .replace(/[^a-zA-Z0-9\s$%]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  // Deduplicate and take top terms (by length as a rough importance proxy)
  const unique = [...new Set(words)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 10);
}

/** Split an array into chunks of the given size. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Safely parse JSON, returning null on failure. */
function tryParseJson(text: string): Record<string, unknown> | unknown[] | null {
  try {
    const trimmed = text.trim();
    const result = JSON.parse(trimmed);
    if (result && typeof result === "object") return result;
    return null;
  } catch {
    return null;
  }
}

/** Type guard: check if a parsed object has the required AnalysisResult fields. */
function isValidAnalysisResult(obj: Record<string, unknown> | unknown[]): boolean {
  if (Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  return (
    typeof record.summary === "string" &&
    typeof record.riskLevel === "string" &&
    typeof record.recommendation === "string"
  );
}

/** Normalize a parsed object into a properly typed AnalysisResult. */
function normalizeAnalysisResult(obj: Record<string, unknown>): AnalysisResult {
  const validCategories: ChangeCategory[] = ["substantive", "editorial", "structural"];
  const validRiskLevels: RiskLevel[] = ["low", "medium", "high", "critical"];
  const validRecommendations = ["accept", "reject", "counter", "review"];

  const category = validCategories.includes(obj.category as ChangeCategory)
    ? (obj.category as ChangeCategory)
    : "substantive";

  const riskLevel = validRiskLevels.includes(obj.riskLevel as RiskLevel)
    ? (obj.riskLevel as RiskLevel)
    : "medium";

  const recommendation = validRecommendations.includes(obj.recommendation as string)
    ? (obj.recommendation as AnalysisResult["recommendation"])
    : "review";

  return {
    category,
    riskLevel,
    summary: typeof obj.summary === "string" ? obj.summary : "Analysis summary unavailable.",
    impact: typeof obj.impact === "string" ? obj.impact : "Impact assessment unavailable.",
    historicalContext:
      typeof obj.historicalContext === "string" ? obj.historicalContext : null,
    clauseComparison:
      typeof obj.clauseComparison === "string" ? obj.clauseComparison : null,
    complianceFlags: Array.isArray(obj.complianceFlags)
      ? (obj.complianceFlags as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    recommendation,
    recommendationReason:
      typeof obj.recommendationReason === "string"
        ? obj.recommendationReason
        : "No specific reasoning provided.",
  };
}

/* ============= Export ============= */

export const ChangeAnalyzer = {
  analyzeSingle: analyzeSingleChange,
  batchAnalyze: batchAnalyzeChanges,
  // Exposed for testing
  buildAnalysisPrompt,
  buildBatchPrompt,
  parseAnalysisResponse,
  parseBatchResponse,
  gatherContext,
  buildHeuristicAnalysis,
  estimateRiskLevel,
  extractQueryTerms,
};
