// KACHERI BACKEND/src/negotiation/counterproposalGenerator.ts
// Negotiation: AI-powered counterproposal generation engine
//
// Given a specific negotiation change + mode, generates compromise language.
// Three modes:
//   - balanced: split the difference, fair to both parties
//   - favorable: lean toward user's original position
//   - minimal_change: smallest modification to counterparty's text that protects key terms
//
// Context gathering (parallel, non-blocking):
//   - Clause library search (standard clause alternatives)
//   - Knowledge graph entities (historical deal data)
//   - Compliance policies (applicable restrictions)
//
// Uses composeText() from modelRouter — no new AI infrastructure.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 4

import { composeText } from "../ai/modelRouter";
import { withTimeout } from "../ai/extractors/index";
import { findSimilarClauses, type ClauseMatch } from "../ai/clauseMatcher";
import type { NegotiationChange } from "../store/negotiationChanges";
import {
  NegotiationCounterproposalsStore,
  type NegotiationCounterproposal,
  type CounterproposalMode,
} from "../store/negotiationCounterproposals";
import { WorkspaceEntitiesStore, type WorkspaceEntity } from "../store/workspaceEntities";
import { CompliancePoliciesStore, type CompliancePolicy } from "../store/compliancePolicies";
import { HistoricalAnalyzer, type HistoricalContext } from "./historicalAnalyzer";
import { NegotiationSessionsStore } from "../store/negotiationSessions";

/* ============= Constants ============= */

const GENERATION_TIMEOUT_MS = 15_000; // 15 seconds per generation
const CONTEXT_QUERY_TIMEOUT_MS = 5_000; // 5s for each context query
const MAX_CHANGE_TEXT_CHARS = 2_000; // truncation for AI prompt
const GENERATION_MAX_TOKENS = 800; // AI response limit (more than analysis — generates full text)

/* ============= Types ============= */

/** Context needed for generating a counterproposal */
export interface CounterproposalContext {
  workspaceId: string;
  sessionId: string;
  /** Document type from extraction (e.g. "contract", "proposal") */
  documentType?: string;
  /** User ID creating the counterproposal */
  createdBy: string;
}

/** Result of a counterproposal generation */
export interface CounterproposalResult {
  counterproposal: NegotiationCounterproposal;
  provider?: string;
  model?: string;
  /** The clause library match used as reference (if any) */
  clauseMatch?: ClauseMatch;
}

/** AI response shape for counterproposal generation */
interface CounterproposalAIResponse {
  proposedText: string;
  rationale: string;
  changesFromYours: string;
  changesFromTheirs: string;
  preserves: string;
}

/** Gathered context from knowledge graph, clause library, compliance policies, historical analysis */
interface GatheredContext {
  historicalEntities: WorkspaceEntity[];
  clauseMatches: ClauseMatch[];
  compliancePolicies: CompliancePolicy[];
  /** Rich historical deal context (Slice 19: Cross-Feature Integration) */
  historicalContext: HistoricalContext | null;
}

/* ============= Mode Descriptions ============= */

const MODE_DESCRIPTIONS: Record<CounterproposalMode, string> = {
  balanced:
    "Generate a fair compromise that splits the difference between both positions. " +
    "Both sides should make roughly equal concessions. The result should be acceptable to a reasonable party on either side.",
  favorable:
    "Generate language that leans toward the user's original position while making minimal acceptable concessions. " +
    "Preserve the user's key protections and terms. Only concede where necessary to keep the counterparty engaged.",
  minimal_change:
    "Make the smallest possible modification to the counterparty's proposed text that preserves the user's key terms and protections. " +
    "Keep as much of the counterparty's language as possible while re-inserting critical terms they removed or weakened.",
};

/* ============= AI System Prompt ============= */

const SYSTEM_PROMPT =
  "You are a contract negotiation expert. Generate compromise language for a disputed clause.\n\n" +
  "You MUST respond with valid JSON only (no markdown, no explanation outside JSON).\n\n" +
  "JSON schema:\n" +
  "{\n" +
  '  "proposedText": "The compromise language",\n' +
  '  "rationale": "Why this compromise is appropriate",\n' +
  '  "changesFromYours": "What the user is conceding from their original",\n' +
  '  "changesFromTheirs": "What the counterparty is conceding from their proposal",\n' +
  '  "preserves": "Key terms preserved from the user\'s original"\n' +
  "}\n\n" +
  "Guidelines:\n" +
  "- The proposed text must be grammatically correct and legally reasonable.\n" +
  "- For monetary amounts, propose a specific middle-ground number.\n" +
  "- For dates or deadlines, propose a specific compromise date.\n" +
  "- For percentages, propose a specific middle-ground percentage.\n" +
  "- Keep the language professional and appropriate for a legal document.\n" +
  "- The rationale should explain why this compromise protects both parties.";

/* ============= Context Gathering ============= */

/**
 * Gather context from knowledge graph, clause library, and compliance policies.
 * Each source is non-blocking — failures return empty results.
 */
async function gatherContext(
  change: NegotiationChange,
  ctx: CounterproposalContext
): Promise<GatheredContext> {
  // Look up session for counterparty name (Slice 19: HistoricalAnalyzer integration)
  const session = await NegotiationSessionsStore.getById(ctx.sessionId);
  const counterpartyName = session?.counterpartyName ?? "";

  const [clauseMatches, historicalEntities, compliancePolicies, historicalContext] = await Promise.all([
    gatherClauseContext(change, ctx.workspaceId),
    gatherHistoricalContext(change, ctx.workspaceId),
    gatherCompliancePolicies(ctx.workspaceId),
    gatherHistoricalAnalysis(change, ctx, counterpartyName),
  ]);

  return { historicalEntities, clauseMatches, compliancePolicies, historicalContext };
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
    // Use the original text (user's version) for clause matching — find standard alternatives
    const searchText = change.originalText ?? change.proposedText ?? "";
    if (searchText.length < 20) return [];

    const result = await withTimeout(
      findSimilarClauses(searchText, workspaceId),
      CONTEXT_QUERY_TIMEOUT_MS,
      "Clause search timed out"
    );

    return result.suggestions;
  } catch (err) {
    console.warn("[counterproposalGenerator] Clause context gathering failed:", err);
    return [];
  }
}

/**
 * Search knowledge graph for entities mentioned in the change text.
 * Returns entities related to the change (counterparty names, amounts, terms).
 */
async function gatherHistoricalContext(
  change: NegotiationChange,
  workspaceId: string
): Promise<WorkspaceEntity[]> {
  try {
    const changeText = (change.originalText ?? "") + " " + (change.proposedText ?? "");
    const queryTerms = extractQueryTerms(changeText);
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
      if (entities.length >= 10) break;
    }

    return entities;
  } catch (err) {
    console.warn("[counterproposalGenerator] Historical context gathering failed:", err);
    return [];
  }
}

/**
 * Fetch enabled compliance policies for the workspace.
 */
async function gatherCompliancePolicies(
  workspaceId: string
): Promise<CompliancePolicy[]> {
  try {
    return await CompliancePoliciesStore.getEnabled(workspaceId);
  } catch (err) {
    console.warn("[counterproposalGenerator] Compliance policy fetch failed:", err);
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
  ctx: CounterproposalContext,
  counterpartyName: string
): Promise<HistoricalContext | null> {
  try {
    return HistoricalAnalyzer.getHistoricalContext(change, {
      workspaceId: ctx.workspaceId,
      sessionId: ctx.sessionId,
      counterpartyName,
    });
  } catch (err) {
    console.warn("[counterproposalGenerator] Historical analysis failed:", err);
    return null;
  }
}

/* ============= Prompt Building ============= */

/**
 * Build the AI generation prompt for a counterproposal.
 */
function buildPrompt(
  change: NegotiationChange,
  mode: CounterproposalMode,
  ctx: CounterproposalContext,
  gathered: GatheredContext
): string {
  const lines: string[] = [];

  // Mode directive
  lines.push(`Mode: ${mode}`);
  lines.push(MODE_DESCRIPTIONS[mode]);
  lines.push("");

  // Document context
  lines.push(`Document type: ${ctx.documentType ?? "unknown"}`);
  if (change.sectionHeading) {
    lines.push(`Section: ${change.sectionHeading}`);
  }
  lines.push("");

  // The two versions
  if (change.originalText) {
    lines.push(`Your version (original):`);
    lines.push(truncateText(change.originalText, MAX_CHANGE_TEXT_CHARS));
    lines.push("");
  }

  if (change.proposedText) {
    lines.push(`Their version (proposed):`);
    lines.push(truncateText(change.proposedText, MAX_CHANGE_TEXT_CHARS));
    lines.push("");
  }

  // Short clause handling
  const textLength = Math.max(
    (change.originalText ?? "").length,
    (change.proposedText ?? "").length
  );
  if (textLength < 50) {
    lines.push("Note: The text is very short. Generate a proportionally concise compromise.");
    lines.push("");
  }

  // Standard clause from clause library
  if (gathered.clauseMatches.length > 0) {
    lines.push("Your standard clause from clause library (use as reference for standard language):");
    const topMatch = gathered.clauseMatches[0];
    lines.push(`  "${topMatch.clause.title}" (similarity: ${topMatch.similarity}%):`);
    lines.push(`  ${truncateText(topMatch.clause.contentText, 500)}`);
    lines.push("");
  }

  // Historical context from knowledge graph
  if (gathered.historicalEntities.length > 0) {
    lines.push("Historical data from knowledge graph:");
    for (const entity of gathered.historicalEntities.slice(0, 5)) {
      const meta = entity.metadata
        ? ` (${JSON.stringify(entity.metadata).slice(0, 100)})`
        : "";
      lines.push(
        `  - ${entity.name} [${entity.entityType}]: mentioned in ${entity.docCount} docs, ${entity.mentionCount} times${meta}`
      );
    }
    lines.push("");
  }

  // Compliance policies
  if (gathered.compliancePolicies.length > 0) {
    lines.push("Active compliance policies (the compromise must not violate these):");
    for (const policy of gathered.compliancePolicies.slice(0, 5)) {
      lines.push(
        `  - ${policy.name} [${policy.severity}]: ${policy.description ?? policy.ruleType}`
      );
    }
    lines.push("");
  }

  // Rich historical context (Slice 19: Cross-Feature Integration — HistoricalAnalyzer)
  if (gathered.historicalContext?.summary) {
    lines.push("Historical deal context:");
    lines.push(gathered.historicalContext.summary);
    lines.push("");
  }

  return lines.join("\n");
}

/* ============= Response Parsing ============= */

/**
 * Parse AI JSON response into CounterproposalAIResponse.
 * Three-level fallback: direct parse → extract from code block → error.
 * No heuristic fallback — cannot fabricate legal compromise text.
 */
function parseResponse(responseText: string): CounterproposalAIResponse {
  // Attempt 1: Direct JSON parse
  const parsed = tryParseJson(responseText);
  if (parsed && isValidCounterproposalResponse(parsed)) {
    return normalizeResponse(parsed);
  }

  // Attempt 2: Extract JSON from markdown code blocks
  const codeBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const extracted = tryParseJson(codeBlockMatch[1]);
    if (extracted && isValidCounterproposalResponse(extracted)) {
      return normalizeResponse(extracted);
    }
  }

  // No heuristic fallback — cannot auto-generate legal compromise text
  throw new Error(
    "AI response could not be parsed as a valid counterproposal. " +
    "Expected JSON with proposedText and rationale fields."
  );
}

/* ============= Main Generation ============= */

/**
 * Generate a counterproposal for a specific negotiation change.
 *
 * @param change - The negotiation change to generate a counterproposal for
 * @param mode - Generation mode: balanced, favorable, or minimal_change
 * @param ctx - Context (workspace, session, document type, user)
 * @returns CounterproposalResult with the stored counterproposal and AI metadata
 */
async function generateCounterproposal(
  change: NegotiationChange,
  mode: CounterproposalMode,
  ctx: CounterproposalContext
): Promise<CounterproposalResult> {
  // Validate: need at least one version of the text to generate a counterproposal
  if (!change.originalText && !change.proposedText) {
    throw new Error("Cannot generate counterproposal: change has no original or proposed text.");
  }

  // Step 1: Gather context (parallel, non-blocking)
  const gathered = await gatherContext(change, ctx);

  // Step 2: Build prompt
  const prompt = buildPrompt(change, mode, ctx, gathered);

  // Step 3: Call AI with timeout
  const aiResult = await withTimeout(
    composeText(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: GENERATION_MAX_TOKENS,
    }),
    GENERATION_TIMEOUT_MS,
    "Counterproposal generation timed out"
  );

  // Step 4: Parse response
  const aiResponse = parseResponse(aiResult.text);

  // Step 5: Determine if a clause library match was used
  const topClauseMatch = gathered.clauseMatches.length > 0
    ? gathered.clauseMatches[0]
    : undefined;

  // Step 6: Build rationale including concession tracking
  const fullRationale = buildFullRationale(aiResponse, mode);

  // Step 7: Store counterproposal
  const counterproposal = await NegotiationCounterproposalsStore.create({
    changeId: change.id,
    mode,
    proposedText: aiResponse.proposedText,
    rationale: fullRationale,
    clauseId: topClauseMatch?.clause.id,
    // proofId linked at API route level (Slice 7)
    createdBy: ctx.createdBy,
  });

  return {
    counterproposal,
    provider: aiResult.provider,
    model: aiResult.model,
    clauseMatch: topClauseMatch,
  };
}

/* ============= Utilities ============= */

/**
 * Build a full rationale string that includes concession tracking.
 * Combines the AI rationale with what each side is conceding and what's preserved.
 */
function buildFullRationale(
  aiResponse: CounterproposalAIResponse,
  mode: CounterproposalMode
): string {
  const parts: string[] = [];

  parts.push(aiResponse.rationale);

  if (aiResponse.changesFromYours) {
    parts.push(`\nYou concede: ${aiResponse.changesFromYours}`);
  }
  if (aiResponse.changesFromTheirs) {
    parts.push(`They concede: ${aiResponse.changesFromTheirs}`);
  }
  if (aiResponse.preserves) {
    parts.push(`Preserved: ${aiResponse.preserves}`);
  }

  parts.push(`\nMode: ${mode}`);

  return parts.join("\n");
}

/** Truncate text to a maximum length with ellipsis. */
function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...";
}

/** Extract significant query terms from change text for entity search. */
function extractQueryTerms(text: string): string[] {
  const words = text
    .replace(/[^a-zA-Z0-9\s$%]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const unique = [...new Set(words)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 10);
}

/** Safely parse JSON, returning null on failure. */
function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const trimmed = text.trim();
    const result = JSON.parse(trimmed);
    if (result && typeof result === "object" && !Array.isArray(result)) return result;
    return null;
  } catch {
    return null;
  }
}

/** Type guard: check if a parsed object has the required counterproposal fields. */
function isValidCounterproposalResponse(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.proposedText === "string" &&
    obj.proposedText.length > 0 &&
    typeof obj.rationale === "string" &&
    obj.rationale.length > 0
  );
}

/** Normalize a parsed object into a properly typed CounterproposalAIResponse. */
function normalizeResponse(obj: Record<string, unknown>): CounterproposalAIResponse {
  return {
    proposedText: obj.proposedText as string,
    rationale: obj.rationale as string,
    changesFromYours:
      typeof obj.changesFromYours === "string"
        ? obj.changesFromYours
        : typeof obj.changes_from_yours === "string"
          ? obj.changes_from_yours
          : "",
    changesFromTheirs:
      typeof obj.changesFromTheirs === "string"
        ? obj.changesFromTheirs
        : typeof obj.changes_from_theirs === "string"
          ? obj.changes_from_theirs
          : "",
    preserves:
      typeof obj.preserves === "string" ? obj.preserves : "",
  };
}

/* ============= Export ============= */

export const CounterproposalGenerator = {
  generate: generateCounterproposal,
  // Exposed for testing
  buildPrompt,
  parseResponse,
  gatherContext,
};
