// KACHERI BACKEND/src/negotiation/historicalAnalyzer.ts
// Negotiation: Historical deal analysis engine
//
// Queries knowledge graph, past negotiation sessions, extraction data,
// and clause library to provide historical context for the Change Analyzer.
//
// Main entry: getHistoricalContext(change, ctx) → HistoricalContext
//
// Data sources:
//   - Knowledge graph entities + relationships (counterparty entity)
//   - Past negotiation sessions (same counterparty)
//   - Negotiation change outcomes (acceptance rates)
//   - Extraction data (amounts, dates, terms from related documents)
//
// All queries are individually caught — graceful degradation when no
// historical data exists. Overall target: <3s per query.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 9

import { db } from "../db";
import {
  NegotiationSessionsStore,
  type NegotiationSession,
  type NegotiationStatus,
} from "../store/negotiationSessions";
import {
  type NegotiationChange,
  type ChangeCategory,
  type ChangeStatus,
  type RiskLevel,
} from "../store/negotiationChanges";
import {
  WorkspaceEntitiesStore,
  type WorkspaceEntity,
} from "../store/workspaceEntities";
import { EntityRelationshipsStore } from "../store/entityRelationships";
import { ExtractionsStore } from "../store/extractions";

/* ============= Constants ============= */

/** Maximum past sessions to include in counterparty history */
const MAX_PAST_SESSIONS = 20;

/** Maximum past changes to scan for similarity */
const MAX_PAST_CHANGES_SEARCH = 100;

/** Maximum similar past changes to return */
const MAX_SIMILAR_CHANGES = 5;

/** Maximum amount trends to return */
const MAX_AMOUNT_TRENDS = 10;

/** Minimum Jaccard similarity threshold for "similar" match */
const SIMILARITY_THRESHOLD = 0.3;

/** Maximum entity search terms */
const MAX_ENTITY_SEARCH_TERMS = 3;

/** Maximum entity results */
const MAX_ENTITY_RESULTS = 10;

/* ============= Types ============= */

/** Context input for historical analysis */
export interface HistoricalAnalysisContext {
  workspaceId: string;
  sessionId: string;
  counterpartyName: string;
}

/** Complete historical context for a negotiation change */
export interface HistoricalContext {
  counterpartyHistory: CounterpartyHistory | null;
  acceptanceRates: AcceptanceRateResult | null;
  amountTrends: AmountTrend[];
  similarPastChanges: SimilarPastChange[];
  entities: WorkspaceEntity[];
  /** Human-readable summary of historical context */
  summary: string;
}

/** History of negotiations with a specific counterparty */
export interface CounterpartyHistory {
  counterpartyName: string;
  totalSessions: number;
  settledSessions: number;
  abandonedSessions: number;
  activeSessions: number;
  avgRoundsPerSession: number;
  sessions: PastSessionSummary[];
}

/** Compact summary of a past negotiation session */
export interface PastSessionSummary {
  sessionId: string;
  docId: string;
  title: string;
  status: NegotiationStatus;
  currentRound: number;
  totalChanges: number;
  acceptedChanges: number;
  rejectedChanges: number;
  settledAt: string | null;
  createdAt: string;
}

/** Acceptance rates aggregated across past negotiations */
export interface AcceptanceRateResult {
  /** Overall acceptance rate 0-100, null if no resolved changes */
  overallRate: number | null;
  byCategory: {
    substantive: number | null;
    editorial: number | null;
    structural: number | null;
  };
  byRiskLevel: {
    low: number | null;
    medium: number | null;
    high: number | null;
    critical: number | null;
  };
  totalChangesAnalyzed: number;
}

/** A monetary amount trend across negotiations */
export interface AmountTrend {
  /** What the amount refers to (e.g. "payment amount", "liability cap") */
  term: string;
  values: AmountTrendValue[];
  direction: "increasing" | "decreasing" | "stable" | "mixed";
}

export interface AmountTrendValue {
  sessionTitle: string;
  amount: string;
  numericAmount: number;
  createdAt: string;
}

/** A similar change from a past negotiation */
export interface SimilarPastChange {
  changeId: string;
  sessionId: string;
  sessionTitle: string;
  counterpartyName: string;
  originalText: string | null;
  proposedText: string | null;
  category: ChangeCategory;
  status: ChangeStatus;
  riskLevel: RiskLevel | null;
  /** 0-1 text similarity score */
  similarity: number;
}

/* ============= Stopwords (for similarity) ============= */

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must", "in", "on",
  "at", "to", "for", "of", "with", "by", "from", "as", "into", "about",
  "between", "through", "during", "before", "after", "above", "below",
  "and", "or", "but", "nor", "not", "no", "if", "then", "than", "so",
  "that", "this", "these", "those", "it", "its",
]);

/* ============= Main Entry Point ============= */

/**
 * Get full historical context for a negotiation change.
 *
 * Runs all sub-queries in parallel with individual error handling.
 * Returns partial results if some queries fail — never throws.
 *
 * @param change - The negotiation change to analyze
 * @param ctx - Context with workspace, session, and counterparty info
 * @returns HistoricalContext with all available historical data
 */
async function getHistoricalContext(
  change: NegotiationChange,
  ctx: HistoricalAnalysisContext
): Promise<HistoricalContext> {
  // Run all queries with individual error handling
  const counterpartyHistory = await safeQuery(
    () => findCounterpartyHistory(ctx.workspaceId, ctx.counterpartyName, ctx.sessionId),
    null,
    "counterpartyHistory"
  );

  const acceptanceRates = await safeQuery(
    () => calculateAcceptanceRates(ctx.workspaceId, ctx.counterpartyName, ctx.sessionId),
    null,
    "acceptanceRates"
  );

  const amountTrends = await safeQuery(
    () => findAmountTrends(ctx.workspaceId, ctx.counterpartyName, ctx.sessionId),
    [],
    "amountTrends"
  );

  const changeText = (change.originalText ?? "") + " " + (change.proposedText ?? "");
  const similarPastChanges = await safeQuery(
    () => findSimilarPastChanges(ctx.workspaceId, changeText, ctx.sessionId),
    [],
    "similarPastChanges"
  );

  const entities = await safeQuery(
    () => findRelatedEntities(ctx.workspaceId, changeText, ctx.counterpartyName),
    [],
    "entities"
  );

  const summary = buildSummary(counterpartyHistory, acceptanceRates, amountTrends, similarPastChanges);

  return {
    counterpartyHistory,
    acceptanceRates,
    amountTrends,
    similarPastChanges,
    entities,
    summary,
  };
}

/* ============= 1. Counterparty History ============= */

/**
 * Find past negotiation sessions with the same counterparty.
 *
 * Uses the NegotiationSessionsStore's built-in search filter
 * to find sessions where counterparty_name matches.
 *
 * @param workspaceId - Workspace scope
 * @param counterpartyName - Name to search for
 * @param excludeSessionId - Current session to exclude
 * @returns History summary or null if no past sessions
 */
async function findCounterpartyHistory(
  workspaceId: string,
  counterpartyName: string,
  excludeSessionId: string
): Promise<CounterpartyHistory | null> {
  // Use store search which does LIKE match on counterparty_name
  const allSessions = await NegotiationSessionsStore.getByWorkspace(workspaceId, {
    search: counterpartyName,
    limit: MAX_PAST_SESSIONS + 1, // +1 to account for excluding current
  });

  // Exclude current session
  const pastSessions = allSessions.filter((s) => s.id !== excludeSessionId);

  if (pastSessions.length === 0) return null;

  // Compute stats
  let settledCount = 0;
  let abandonedCount = 0;
  let activeCount = 0;
  let totalRounds = 0;

  for (const session of pastSessions) {
    totalRounds += session.currentRound;

    if (session.status === "settled") settledCount++;
    else if (session.status === "abandoned") abandonedCount++;
    else activeCount++; // draft, active, awaiting_response, reviewing
  }

  const sessions: PastSessionSummary[] = pastSessions
    .slice(0, MAX_PAST_SESSIONS)
    .map(sessionToSummary);

  return {
    counterpartyName,
    totalSessions: pastSessions.length,
    settledSessions: settledCount,
    abandonedSessions: abandonedCount,
    activeSessions: activeCount,
    avgRoundsPerSession: pastSessions.length > 0
      ? Math.round((totalRounds / pastSessions.length) * 10) / 10
      : 0,
    sessions,
  };
}

/** Convert a NegotiationSession to a compact PastSessionSummary */
function sessionToSummary(session: NegotiationSession): PastSessionSummary {
  return {
    sessionId: session.id,
    docId: session.docId,
    title: session.title,
    status: session.status,
    currentRound: session.currentRound,
    totalChanges: session.totalChanges,
    acceptedChanges: session.acceptedChanges,
    rejectedChanges: session.rejectedChanges,
    settledAt: session.settledAt,
    createdAt: session.createdAt,
  };
}

/* ============= 2. Acceptance Rates ============= */

/**
 * Calculate acceptance rates for changes across past negotiations
 * with the same counterparty.
 *
 * Aggregates by overall rate, by category, and by risk level.
 * Uses raw SQL for efficient cross-session aggregation.
 *
 * @param workspaceId - Workspace scope
 * @param counterpartyName - Counterparty to filter by
 * @param excludeSessionId - Current session to exclude
 * @returns Acceptance rates or null if no resolved changes
 */
async function calculateAcceptanceRates(
  workspaceId: string,
  counterpartyName: string,
  excludeSessionId: string
): Promise<AcceptanceRateResult | null> {
  // Find past session IDs for this counterparty
  const pastSessionIds = await findPastSessionIds(workspaceId, counterpartyName, excludeSessionId);
  if (pastSessionIds.length === 0) return null;

  // Build SQL placeholder string
  const placeholders = pastSessionIds.map(() => "?").join(",");

  // Overall acceptance rate
  const overallRows = await db.queryAll<{ status: string; count: number }>(`
    SELECT status, COUNT(*) as count
    FROM negotiation_changes
    WHERE session_id IN (${placeholders})
      AND status != 'pending'
    GROUP BY status
  `, pastSessionIds);

  const overall = aggregateAcceptanceRate(overallRows);

  // By category
  const categoryRows = await db.queryAll<{ category: string; status: string; count: number }>(`
    SELECT category, status, COUNT(*) as count
    FROM negotiation_changes
    WHERE session_id IN (${placeholders})
      AND status != 'pending'
    GROUP BY category, status
  `, pastSessionIds);

  const byCategory = {
    substantive: computeRateForGroup(categoryRows, "category", "substantive"),
    editorial: computeRateForGroup(categoryRows, "category", "editorial"),
    structural: computeRateForGroup(categoryRows, "category", "structural"),
  };

  // By risk level
  const riskRows = await db.queryAll<{ risk_level: string; status: string; count: number }>(`
    SELECT risk_level, status, COUNT(*) as count
    FROM negotiation_changes
    WHERE session_id IN (${placeholders})
      AND status != 'pending'
      AND risk_level IS NOT NULL
    GROUP BY risk_level, status
  `, pastSessionIds);

  const byRiskLevel = {
    low: computeRateForGroup(riskRows, "risk_level", "low"),
    medium: computeRateForGroup(riskRows, "risk_level", "medium"),
    high: computeRateForGroup(riskRows, "risk_level", "high"),
    critical: computeRateForGroup(riskRows, "risk_level", "critical"),
  };

  const totalChangesAnalyzed = overallRows.reduce((sum, r) => sum + r.count, 0);

  if (totalChangesAnalyzed === 0) return null;

  return {
    overallRate: overall,
    byCategory,
    byRiskLevel,
    totalChangesAnalyzed,
  };
}

/**
 * Find past session IDs for a counterparty within a workspace.
 * Reuses the store's search but only extracts IDs for SQL queries.
 */
async function findPastSessionIds(
  workspaceId: string,
  counterpartyName: string,
  excludeSessionId: string
): Promise<string[]> {
  const sessions = await NegotiationSessionsStore.getByWorkspace(workspaceId, {
    search: counterpartyName,
    limit: MAX_PAST_SESSIONS,
  });

  return sessions
    .filter((s) => s.id !== excludeSessionId)
    .map((s) => s.id);
}

/**
 * Aggregate status counts into a single acceptance rate (0-100).
 * Returns null if no resolved changes exist.
 */
function aggregateAcceptanceRate(
  rows: { status: string; count: number }[]
): number | null {
  let accepted = 0;
  let total = 0;

  for (const row of rows) {
    total += row.count;
    if (row.status === "accepted") accepted += row.count;
  }

  if (total === 0) return null;
  return Math.round((accepted / total) * 100);
}

/**
 * Compute acceptance rate for a specific group value (e.g., category=substantive).
 * Filters the rows to the matching group and computes rate.
 */
function computeRateForGroup(
  rows: { status: string; count: number; [key: string]: unknown }[],
  groupField: string,
  groupValue: string
): number | null {
  const filtered = rows.filter((r) => r[groupField] === groupValue);
  return aggregateAcceptanceRate(filtered);
}

/* ============= 3. Amount Trends ============= */

/** Row shape from the amount extraction query */
interface AmountExtractionRow {
  session_id: string;
  session_title: string;
  doc_id: string;
  created_at: number;
}

/**
 * Find monetary amount trends across past negotiations with the same counterparty.
 *
 * Data sources:
 *   1. Extraction data from documents linked to past sessions (structured amounts)
 *   2. Negotiation change text (monetary patterns scanned via regex)
 *
 * @param workspaceId - Workspace scope
 * @param counterpartyName - Counterparty to filter by
 * @param excludeSessionId - Current session to exclude
 * @returns Array of amount trends, sorted by number of data points
 */
async function findAmountTrends(
  workspaceId: string,
  counterpartyName: string,
  excludeSessionId: string
): Promise<AmountTrend[]> {
  const pastSessionIds = await findPastSessionIds(workspaceId, counterpartyName, excludeSessionId);
  if (pastSessionIds.length === 0) return [];

  const trends = new Map<string, AmountTrendValue[]>();

  // Source 1: Extraction data (structured amounts from document intelligence)
  await gatherExtractionAmounts(pastSessionIds, trends);

  // Source 2: Monetary patterns in negotiation change text
  await gatherChangeTextAmounts(pastSessionIds, trends);

  // Convert to array, sort each trend chronologically, determine direction
  const result: AmountTrend[] = [];

  for (const [term, values] of trends) {
    if (values.length === 0) continue;

    // Sort by creation date
    values.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    // Determine direction
    const direction = determineDirection(values);

    result.push({ term, values, direction });
  }

  // Sort by number of data points (most data first), cap at limit
  result.sort((a, b) => b.values.length - a.values.length);
  return result.slice(0, MAX_AMOUNT_TRENDS);
}

/**
 * Gather structured amounts from extraction data.
 * Looks for common monetary fields in extraction JSON.
 */
async function gatherExtractionAmounts(
  sessionIds: string[],
  trends: Map<string, AmountTrendValue[]>
): Promise<void> {
  // Get doc_ids linked to these sessions
  const placeholders = sessionIds.map(() => "?").join(",");

  const sessionDocs = await db.queryAll<AmountExtractionRow>(`
    SELECT DISTINCT ns.id as session_id, ns.title as session_title,
           ns.doc_id, ns.created_at
    FROM negotiation_sessions ns
    WHERE ns.id IN (${placeholders})
  `, sessionIds);

  for (const row of sessionDocs) {
    const extraction = await ExtractionsStore.getByDocId(row.doc_id);
    if (!extraction) continue;

    const data = extraction.extraction;
    const sessionTitle = row.session_title;
    const createdAt = new Date(row.created_at).toISOString();

    // Extract known monetary fields based on document type
    extractAmountField(data, "paymentTerms.amount", "payment amount", sessionTitle, createdAt, trends);
    extractAmountField(data, "total", "total amount", sessionTitle, createdAt, trends);
    extractAmountField(data, "pricing.total", "pricing total", sessionTitle, createdAt, trends);
    extractAmountField(data, "liabilityCap", "liability cap", sessionTitle, createdAt, trends);
    extractAmountField(data, "penaltyAmount", "penalty amount", sessionTitle, createdAt, trends);
    extractAmountField(data, "terminationFee", "termination fee", sessionTitle, createdAt, trends);
  }
}

/**
 * Extract a monetary amount from nested extraction data by dot-path.
 * Adds to trends map if a numeric value is found.
 */
function extractAmountField(
  data: Record<string, unknown>,
  fieldPath: string,
  label: string,
  sessionTitle: string,
  createdAt: string,
  trends: Map<string, AmountTrendValue[]>
): void {
  const value = getNestedValue(data, fieldPath);
  if (value == null) return;

  const numericAmount = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(numericAmount) || numericAmount === 0) return;

  if (!trends.has(label)) trends.set(label, []);
  trends.get(label)!.push({
    sessionTitle,
    amount: formatAmount(numericAmount),
    numericAmount,
    createdAt,
  });
}

/**
 * Gather monetary amounts mentioned in negotiation change text.
 * Scans accepted/countered changes for dollar amounts.
 */
async function gatherChangeTextAmounts(
  sessionIds: string[],
  trends: Map<string, AmountTrendValue[]>
): Promise<void> {
  const placeholders = sessionIds.map(() => "?").join(",");

  // Fetch substantive changes with text that might contain amounts
  const changes = await db.queryAll<{
    original_text: string | null;
    proposed_text: string | null;
    section_heading: string | null;
    created_at: number;
    session_title: string;
  }>(`
    SELECT nc.original_text, nc.proposed_text, nc.section_heading,
           nc.created_at, ns.title as session_title
    FROM negotiation_changes nc
    JOIN negotiation_sessions ns ON ns.id = nc.session_id
    WHERE nc.session_id IN (${placeholders})
      AND nc.category = 'substantive'
      AND nc.status IN ('accepted', 'countered')
    ORDER BY nc.created_at ASC
    LIMIT 200
  `, sessionIds);

  // Regex for monetary amounts: $1,000 or $1000.00 or 1,000 dollars
  const amountRegex = /\$[\d,]+(?:\.\d{1,2})?|\b[\d,]+(?:\.\d{1,2})?\s*(?:dollars|USD|EUR|GBP)/gi;

  for (const change of changes) {
    const text = (change.proposed_text ?? change.original_text ?? "");
    const matches = text.match(amountRegex);
    if (!matches) continue;

    // Use section heading as the term label, or "negotiated amount"
    const term = change.section_heading
      ? `${change.section_heading.toLowerCase()} amount`
      : "negotiated amount";

    for (const match of matches) {
      const numericAmount = parseMonetaryString(match);
      if (numericAmount === 0) continue;

      if (!trends.has(term)) trends.set(term, []);
      trends.get(term)!.push({
        sessionTitle: change.session_title,
        amount: match.trim(),
        numericAmount,
        createdAt: new Date(change.created_at).toISOString(),
      });
    }
  }
}

/**
 * Determine direction of a trend (increasing, decreasing, stable, or mixed).
 */
function determineDirection(
  values: AmountTrendValue[]
): AmountTrend["direction"] {
  if (values.length < 2) return "stable";

  const first = values[0].numericAmount;
  const last = values[values.length - 1].numericAmount;

  // Check if all values trend one direction
  let increasing = true;
  let decreasing = true;

  for (let i = 1; i < values.length; i++) {
    if (values[i].numericAmount < values[i - 1].numericAmount) increasing = false;
    if (values[i].numericAmount > values[i - 1].numericAmount) decreasing = false;
  }

  if (increasing && last > first) return "increasing";
  if (decreasing && last < first) return "decreasing";
  if (first === last) return "stable";
  return "mixed";
}

/* ============= 4. Similar Past Changes ============= */

/**
 * Find similar changes from past negotiation sessions.
 *
 * Searches negotiation_changes across all past sessions in the workspace,
 * computes Jaccard text similarity, and returns the top matches with
 * their resolution status.
 *
 * @param workspaceId - Workspace scope
 * @param changeText - Combined original+proposed text of the current change
 * @param excludeSessionId - Current session to exclude
 * @returns Top similar past changes, sorted by similarity
 */
async function findSimilarPastChanges(
  workspaceId: string,
  changeText: string,
  excludeSessionId: string
): Promise<SimilarPastChange[]> {
  if (!changeText || changeText.trim().length < 10) return [];

  const inputKeywords = extractKeywords(changeText);
  if (inputKeywords.size === 0) return [];

  // Fetch substantive past changes from all workspace sessions (excluding current)
  const pastChanges = await db.queryAll<{
    id: string;
    session_id: string;
    original_text: string | null;
    proposed_text: string | null;
    category: string;
    status: string;
    risk_level: string | null;
    session_title: string;
    counterparty_name: string;
  }>(`
    SELECT nc.id, nc.session_id, nc.original_text, nc.proposed_text,
           nc.category, nc.status, nc.risk_level,
           ns.title as session_title, ns.counterparty_name
    FROM negotiation_changes nc
    JOIN negotiation_sessions ns ON ns.id = nc.session_id
    WHERE ns.workspace_id = ?
      AND nc.session_id != ?
      AND nc.category IN ('substantive', 'structural')
      AND nc.status != 'pending'
    ORDER BY nc.created_at DESC
    LIMIT ?
  `, [workspaceId, excludeSessionId, MAX_PAST_CHANGES_SEARCH]);

  // Score each past change by text similarity
  const scored: SimilarPastChange[] = [];

  for (const row of pastChanges) {
    const pastText = (row.original_text ?? "") + " " + (row.proposed_text ?? "");
    const pastKeywords = extractKeywords(pastText);

    const similarity = jaccardSimilarity(inputKeywords, pastKeywords);
    if (similarity < SIMILARITY_THRESHOLD) continue;

    scored.push({
      changeId: row.id,
      sessionId: row.session_id,
      sessionTitle: row.session_title,
      counterpartyName: row.counterparty_name,
      originalText: row.original_text,
      proposedText: row.proposed_text,
      category: row.category as ChangeCategory,
      status: row.status as ChangeStatus,
      riskLevel: row.risk_level as RiskLevel | null,
      similarity,
    });
  }

  // Sort by similarity descending, take top N
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, MAX_SIMILAR_CHANGES);
}

/* ============= 5. Related Entities ============= */

/**
 * Find related entities from the knowledge graph.
 *
 * Searches by:
 *   1. Counterparty name (organization entity)
 *   2. Significant terms from the change text
 *   3. Relationships of found entities (for context enrichment)
 *
 * @param workspaceId - Workspace scope
 * @param changeText - Combined text from the change
 * @param counterpartyName - Counterparty name for direct entity lookup
 * @returns Related workspace entities
 */
async function findRelatedEntities(
  workspaceId: string,
  changeText: string,
  counterpartyName: string
): Promise<WorkspaceEntity[]> {
  const entities: WorkspaceEntity[] = [];
  const seenIds = new Set<string>();

  // 1. Search for the counterparty entity directly
  const counterpartyEntities = await WorkspaceEntitiesStore.search(workspaceId, counterpartyName);
  for (const entity of counterpartyEntities) {
    if (!seenIds.has(entity.id)) {
      seenIds.add(entity.id);
      entities.push(entity);
    }
  }

  // 2. Search for terms from the change text
  const queryTerms = extractQueryTerms(changeText);
  for (const term of queryTerms.slice(0, MAX_ENTITY_SEARCH_TERMS)) {
    if (term.length < 3) continue;
    const found = await WorkspaceEntitiesStore.search(workspaceId, term);
    for (const entity of found) {
      if (!seenIds.has(entity.id)) {
        seenIds.add(entity.id);
        entities.push(entity);
      }
    }
    if (entities.length >= MAX_ENTITY_RESULTS) break;
  }

  // 3. Follow relationships of counterparty entities for enrichment
  // (only if we found counterparty entities and have room)
  if (counterpartyEntities.length > 0 && entities.length < MAX_ENTITY_RESULTS) {
    const primaryEntity = counterpartyEntities[0];
    const relationships = await EntityRelationshipsStore.getByEntity(primaryEntity.id);

    for (const rel of relationships.slice(0, 5)) {
      const relatedId = rel.fromEntityId === primaryEntity.id
        ? rel.toEntityId
        : rel.fromEntityId;

      if (!seenIds.has(relatedId)) {
        const relatedEntity = await WorkspaceEntitiesStore.getById(relatedId);
        if (relatedEntity) {
          seenIds.add(relatedEntity.id);
          entities.push(relatedEntity);
        }
      }
      if (entities.length >= MAX_ENTITY_RESULTS) break;
    }
  }

  return entities;
}

/* ============= Summary Builder ============= */

/**
 * Build a human-readable summary of the historical context.
 * Compact enough for AI prompt inclusion.
 */
function buildSummary(
  history: CounterpartyHistory | null,
  rates: AcceptanceRateResult | null,
  trends: AmountTrend[],
  similar: SimilarPastChange[]
): string {
  const parts: string[] = [];

  if (history) {
    parts.push(
      `${history.counterpartyName}: ${history.totalSessions} past negotiation(s) ` +
      `(${history.settledSessions} settled, ${history.abandonedSessions} abandoned). ` +
      `Avg ${history.avgRoundsPerSession} rounds per session.`
    );
  }

  if (rates && rates.overallRate !== null) {
    parts.push(
      `Historical acceptance rate: ${rates.overallRate}% across ${rates.totalChangesAnalyzed} resolved changes.`
    );

    // Highlight category-specific rates if notably different from overall
    if (rates.byCategory.substantive !== null && rates.byCategory.substantive !== rates.overallRate) {
      parts.push(`Substantive changes acceptance: ${rates.byCategory.substantive}%.`);
    }
  }

  if (trends.length > 0) {
    const trendParts: string[] = [];
    for (const trend of trends.slice(0, 3)) {
      const values = trend.values.map((v) => v.amount).join(" → ");
      trendParts.push(`${trend.term}: ${values} (${trend.direction})`);
    }
    parts.push(`Amount trends: ${trendParts.join("; ")}.`);
  }

  if (similar.length > 0) {
    const acceptedCount = similar.filter((s) => s.status === "accepted").length;
    const rejectedCount = similar.filter((s) => s.status === "rejected").length;
    parts.push(
      `${similar.length} similar past change(s) found: ` +
      `${acceptedCount} accepted, ${rejectedCount} rejected.`
    );
  }

  if (parts.length === 0) {
    return "No historical data available for this counterparty or change type.";
  }

  return parts.join(" ");
}

/* ============= Utilities ============= */

/**
 * Execute an async query function with error handling.
 * Returns fallback on any error, logs the failure.
 */
async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label: string
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[historicalAnalyzer] ${label} query failed:`, err);
    return fallback;
  }
}

/**
 * Get a nested value from an object by dot-path.
 * e.g., getNestedValue({ a: { b: 5 } }, "a.b") → 5
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Parse a monetary string like "$1,000.50" or "1000 dollars" into a number.
 * Returns 0 if parsing fails.
 */
function parseMonetaryString(text: string): number {
  // Strip currency symbols and words
  const cleaned = text
    .replace(/[$€£]/g, "")
    .replace(/\b(dollars|USD|EUR|GBP)\b/gi, "")
    .replace(/,/g, "")
    .trim();

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Format a numeric amount as a human-readable currency string.
 */
function formatAmount(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Extract significant keywords from text for similarity comparison.
 * Lowercases, splits on non-alphanumeric, removes stopwords and short words.
 */
function extractKeywords(text: string): Set<string> {
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
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of a) {
    if (b.has(word)) intersectionSize++;
  }

  const unionSize = a.size + b.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

/**
 * Extract significant query terms from text for entity search.
 * Deduplicates and sorts by length (longer = more specific).
 */
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

/* ============= Export ============= */

export const HistoricalAnalyzer = {
  getHistoricalContext,
  findCounterpartyHistory,
  calculateAcceptanceRates,
  findAmountTrends,
  findSimilarPastChanges,
  // Exposed for testing
  findRelatedEntities,
  buildSummary,
  extractKeywords,
  jaccardSimilarity,
  extractQueryTerms,
  parseMonetaryString,
  getNestedValue,
  determineDirection,
};
