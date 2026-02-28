// KACHERI BACKEND/src/ai/extractors/contractExtractor.ts
// Document Intelligence: Contract-specific data extraction
//
// Extracts: parties, dates, terms, obligations, signatures, etc.

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
  type ContractExtraction,
  type Party,
  type Signature,
  type PaymentTerms,
  type TerminationClause,
  type LiabilityLimit,
  type FieldConfidence,
  type GenericExtraction,
} from './types';

/* ============= System Prompt ============= */

const CONTRACT_SYSTEM_PROMPT = `You are Kacheri's contract data extractor.

Extract the following fields from the contract:
- title: The contract title or name (e.g., "Service Agreement", "Non-Disclosure Agreement")
- parties: Array of parties with {name, role: "party_a"|"party_b"|"other", address?}
- effectiveDate: When the contract begins (YYYY-MM-DD format or null)
- expirationDate: When the contract ends (YYYY-MM-DD format or null)
- termLength: Duration description (e.g., "2 years", "36 months", "indefinite")
- autoRenewal: Boolean if contract auto-renews (true/false/null)
- paymentTerms: Object with {amount?, currency?, frequency?, netDays?}
- terminationClause: Object with {noticePeriod?, conditions?: string[]}
- liabilityLimit: Object with {amount?, currency?}
- governingLaw: Jurisdiction (e.g., "State of California", "England and Wales")
- keyObligations: Array of main obligations/responsibilities
- signatures: Array of {party, signedDate?}

IMPORTANT:
1. Return ONLY valid JSON, no explanations outside the markers
2. Use null for fields you cannot find or extract
3. Use YYYY-MM-DD format for all dates
4. Include confidence scores (0.0 to 1.0) for each extracted field
5. The document may be in any language. Extract field values in the original language. Normalize dates to YYYY-MM-DD and amounts to numbers regardless of language.

Return your response wrapped in markers:
${OUT_START}
{
  "extraction": {
    "title": "Service Agreement",
    "parties": [{"name": "Acme Corp", "role": "party_a"}, {"name": "Client Inc", "role": "party_b"}],
    "effectiveDate": "2026-01-01",
    ...
  },
  "confidences": {
    "title": 0.95,
    "parties": 0.88,
    "effectiveDate": 0.92,
    ...
  }
}
${OUT_END}`;

/* ============= Field List for Confidence Tracking ============= */

const CONTRACT_FIELDS = [
  'title',
  'parties',
  'effectiveDate',
  'expirationDate',
  'termLength',
  'autoRenewal',
  'paymentTerms',
  'terminationClause',
  'liabilityLimit',
  'governingLaw',
  'keyObligations',
  'signatures',
];

/* ============= Normalization Functions ============= */

function normalizePartyRole(role: unknown): 'party_a' | 'party_b' | 'other' {
  if (role === 'party_a' || role === 'party_b') return role;
  return 'other';
}

function normalizeParties(raw: unknown): Party[] {
  if (!Array.isArray(raw)) return [];
  const result: Party[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const obj = p as Record<string, unknown>;
    if (typeof obj.name !== 'string' || !obj.name.trim()) continue;
    const party: Party = {
      name: obj.name.trim(),
      role: normalizePartyRole(obj.role),
    };
    if (typeof obj.address === 'string') party.address = obj.address;
    result.push(party);
  }
  return result;
}

function normalizeSignatures(raw: unknown): Signature[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: Signature[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const obj = s as Record<string, unknown>;
    if (typeof obj.party !== 'string' || !obj.party.trim()) continue;
    const sig: Signature = { party: obj.party.trim() };
    const date = normalizeDate(obj.signedDate);
    if (date) sig.signedDate = date;
    result.push(sig);
  }
  return result.length > 0 ? result : undefined;
}

function normalizePaymentTerms(raw: unknown): PaymentTerms | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const terms: PaymentTerms = {};
  if (typeof obj.amount === 'number') terms.amount = obj.amount;
  if (typeof obj.currency === 'string') terms.currency = obj.currency;
  if (typeof obj.frequency === 'string') terms.frequency = obj.frequency;
  if (typeof obj.dueDate === 'string') terms.dueDate = obj.dueDate;
  if (typeof obj.netDays === 'number') terms.netDays = obj.netDays;

  return Object.keys(terms).length > 0 ? terms : undefined;
}

function normalizeTerminationClause(raw: unknown): TerminationClause | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const clause: TerminationClause = {};
  if (typeof obj.noticePeriod === 'string') clause.noticePeriod = obj.noticePeriod;
  if (Array.isArray(obj.conditions)) {
    clause.conditions = obj.conditions.filter((c): c is string => typeof c === 'string');
  }

  return Object.keys(clause).length > 0 ? clause : undefined;
}

function normalizeLiabilityLimit(raw: unknown): LiabilityLimit | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const limit: LiabilityLimit = {};
  if (typeof obj.amount === 'number') limit.amount = obj.amount;
  if (typeof obj.currency === 'string') limit.currency = obj.currency;

  return Object.keys(limit).length > 0 ? limit : undefined;
}

function normalizeContractExtraction(raw: unknown): ContractExtraction {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  return {
    documentType: 'contract',
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Untitled Contract',
    parties: normalizeParties(obj.parties),
    effectiveDate: normalizeDate(obj.effectiveDate),
    expirationDate: normalizeDate(obj.expirationDate),
    termLength: typeof obj.termLength === 'string' ? obj.termLength : undefined,
    autoRenewal: typeof obj.autoRenewal === 'boolean' ? obj.autoRenewal : undefined,
    paymentTerms: normalizePaymentTerms(obj.paymentTerms),
    terminationClause: normalizeTerminationClause(obj.terminationClause),
    liabilityLimit: normalizeLiabilityLimit(obj.liabilityLimit),
    governingLaw: typeof obj.governingLaw === 'string' ? obj.governingLaw : undefined,
    keyObligations: normalizeStringArray(obj.keyObligations),
    signatures: normalizeSignatures(obj.signatures),
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
 * Extract contract data from text using AI.
 *
 * @param text - The contract text to extract from
 * @param options - Provider, model, seed options
 * @returns Extraction result with contract data and confidence scores
 */
export async function extractContract(
  text: string,
  options: ExtractorOptions = {}
): Promise<ExtractorResult> {
  const notes: string[] = [];

  const prompt = `Extract contract data from this document:\n\n---\n${text}\n---`;

  try {
    const result = await composeText(prompt, {
      systemPrompt: CONTRACT_SYSTEM_PROMPT,
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

    const extraction = normalizeContractExtraction(rawExtraction);
    const fieldConfidences = buildFieldConfidences(
      extraction as unknown as Record<string, unknown>,
      rawConfidences,
      CONTRACT_FIELDS
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
