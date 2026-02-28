// KACHERI BACKEND/src/ai/extractors/proposalExtractor.ts
// Document Intelligence: Proposal-specific data extraction
//
// Extracts: vendor, client, scope, deliverables, pricing, timeline, etc.

import { composeText } from '../modelRouter';
import {
  extractJsonFromResponse,
  normalizeDate,
  normalizeStringArray,
  buildFieldConfidences,
  extractTitleHeuristic,
  OUT_START,
  OUT_END,
  type ExtractorOptions,
  type ExtractorResult,
  type ProposalExtraction,
  type ProposalDeliverable,
  type ProposalPricing,
  type ProposalPricingBreakdown,
  type ProposalTimeline,
  type ProposalMilestone,
  type GenericExtraction,
} from './types';

/* ============= System Prompt ============= */

const PROPOSAL_SYSTEM_PROMPT = `You are Kacheri's proposal data extractor.

Extract the following fields from the proposal:
- title: The proposal title
- vendor: The company/person making the proposal
- client: The company/person the proposal is for
- date: Proposal date (YYYY-MM-DD format)
- validUntil: When the proposal expires (YYYY-MM-DD format)
- executiveSummary: Brief overview of the proposal
- scope: Array of scope items (what's included)
- deliverables: Array of {name, description?, timeline?}
- pricing: Object with {total?, currency?, breakdown?: [{item, amount}], paymentSchedule?}
- timeline: Object with {startDate?, endDate?, milestones?: [{name, date}]}
- assumptions: Array of assumptions made
- exclusions: Array of what's NOT included

IMPORTANT:
1. Return ONLY valid JSON, no explanations outside the markers
2. Use null for fields you cannot find or extract
3. Use YYYY-MM-DD format for all dates
4. All monetary amounts should be numbers
5. Include confidence scores (0.0 to 1.0) for each extracted field
6. The document may be in any language. Extract field values in the original language. Normalize dates to YYYY-MM-DD and amounts to numbers regardless of language.

Return your response wrapped in markers:
${OUT_START}
{
  "extraction": {
    "title": "Web Development Proposal",
    "vendor": "Dev Agency Inc",
    "client": "Startup Corp",
    "date": "2026-01-15",
    "scope": ["Website design", "Frontend development", "Backend API"],
    "deliverables": [{"name": "Website", "description": "Responsive marketing site", "timeline": "4 weeks"}],
    "pricing": {"total": 25000, "currency": "USD", "paymentSchedule": "50% upfront, 50% on completion"},
    ...
  },
  "confidences": {
    "title": 0.95,
    "vendor": 0.90,
    "pricing": 0.85,
    ...
  }
}
${OUT_END}`;

/* ============= Field List for Confidence Tracking ============= */

const PROPOSAL_FIELDS = [
  'title',
  'vendor',
  'client',
  'date',
  'validUntil',
  'executiveSummary',
  'scope',
  'deliverables',
  'pricing',
  'timeline',
  'assumptions',
  'exclusions',
];

/* ============= Normalization Functions ============= */

function normalizeDeliverables(raw: unknown): ProposalDeliverable[] {
  if (!Array.isArray(raw)) return [];
  const result: ProposalDeliverable[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;

    const deliverable: ProposalDeliverable = { name };
    if (typeof obj.description === 'string') deliverable.description = obj.description;
    if (typeof obj.timeline === 'string') deliverable.timeline = obj.timeline;
    result.push(deliverable);
  }
  return result;
}

function normalizePricingBreakdown(raw: unknown): ProposalPricingBreakdown[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const itemName = typeof obj.item === 'string' ? obj.item : '';
      const amount = typeof obj.amount === 'number' ? obj.amount : 0;
      if (!itemName) return null;
      return { item: itemName, amount };
    })
    .filter((item): item is ProposalPricingBreakdown => item !== null);
  return items.length > 0 ? items : undefined;
}

function normalizePricing(raw: unknown): ProposalPricing {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  return {
    total: typeof obj.total === 'number' ? obj.total : undefined,
    currency: typeof obj.currency === 'string' ? obj.currency : undefined,
    breakdown: normalizePricingBreakdown(obj.breakdown),
    paymentSchedule: typeof obj.paymentSchedule === 'string' ? obj.paymentSchedule : undefined,
  };
}

function normalizeMilestones(raw: unknown): ProposalMilestone[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const milestones = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === 'string' ? obj.name : '';
      const date = normalizeDate(obj.date);
      if (!name || !date) return null;
      return { name, date };
    })
    .filter((item): item is ProposalMilestone => item !== null);
  return milestones.length > 0 ? milestones : undefined;
}

function normalizeTimeline(raw: unknown): ProposalTimeline | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const timeline: ProposalTimeline = {};
  const startDate = normalizeDate(obj.startDate);
  const endDate = normalizeDate(obj.endDate);
  const milestones = normalizeMilestones(obj.milestones);

  if (startDate) timeline.startDate = startDate;
  if (endDate) timeline.endDate = endDate;
  if (milestones) timeline.milestones = milestones;

  return Object.keys(timeline).length > 0 ? timeline : undefined;
}

function normalizeProposalExtraction(raw: unknown): ProposalExtraction {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  return {
    documentType: 'proposal',
    title:
      typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Untitled Proposal',
    vendor: typeof obj.vendor === 'string' && obj.vendor.trim() ? obj.vendor.trim() : 'Unknown',
    client: typeof obj.client === 'string' && obj.client.trim() ? obj.client.trim() : 'Unknown',
    date: normalizeDate(obj.date) || 'Unknown',
    validUntil: normalizeDate(obj.validUntil),
    executiveSummary: typeof obj.executiveSummary === 'string' ? obj.executiveSummary : undefined,
    scope: normalizeStringArray(obj.scope) || [],
    deliverables: normalizeDeliverables(obj.deliverables),
    pricing: normalizePricing(obj.pricing),
    timeline: normalizeTimeline(obj.timeline),
    assumptions: normalizeStringArray(obj.assumptions),
    exclusions: normalizeStringArray(obj.exclusions),
  };
}

/* ============= Fallback Extraction ============= */

function createFallbackResult(text: string, rawResponse?: string, error?: string): ExtractorResult {
  const title = extractTitleHeuristic(text);

  const fallback: GenericExtraction = {
    documentType: 'other',
    title,
    summary: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
    keyPoints: [],
    entities: [],
    dates: [],
    amounts: [],
  };

  return {
    extraction: fallback,
    fieldConfidences: { title: 0.3, summary: 0.2 },
    rawResponse,
    notes: error ? [`error: ${error}`] : undefined,
  };
}

/* ============= Main Extraction Function ============= */

/**
 * Extract proposal data from text using AI.
 *
 * @param text - The proposal text to extract from
 * @param options - Provider, model, seed options
 * @returns Extraction result with proposal data and confidence scores
 */
export async function extractProposal(
  text: string,
  options: ExtractorOptions = {}
): Promise<ExtractorResult> {
  const notes: string[] = [];

  const prompt = `Extract proposal data from this document:\n\n---\n${text}\n---`;

  try {
    const result = await composeText(prompt, {
      systemPrompt: PROPOSAL_SYSTEM_PROMPT,
      maxTokens: 2000,
      provider: options.provider,
      model: options.model,
      seed: options.seed,
    });

    const { json, parseError, usedMarkers } = extractJsonFromResponse(result.text);

    if (!usedMarkers) {
      notes.push('model_output_missing_markers');
    }

    if (parseError || !json) {
      notes.push(`parse_error: ${parseError}`);
      return createFallbackResult(text, result.text, parseError);
    }

    const obj = json as Record<string, unknown>;
    const rawExtraction = obj.extraction || obj;
    const rawConfidences = (obj.confidences || {}) as Record<string, number>;

    const extraction = normalizeProposalExtraction(rawExtraction);
    const fieldConfidences = buildFieldConfidences(
      extraction as unknown as Record<string, unknown>,
      rawConfidences,
      PROPOSAL_FIELDS
    );

    return {
      extraction,
      fieldConfidences,
      rawResponse: result.text,
      notes: notes.length > 0 ? notes : undefined,
    };
  } catch (err) {
    notes.push(`extraction_error: ${String(err)}`);
    return createFallbackResult(text, undefined, String(err));
  }
}
