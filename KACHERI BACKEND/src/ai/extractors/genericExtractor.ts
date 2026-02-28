// KACHERI BACKEND/src/ai/extractors/genericExtractor.ts
// Document Intelligence: Generic/other document extraction
//
// Fallback extractor for documents that don't fit other categories.
// Extracts: title, summary, key points, entities, dates, amounts.

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
  type GenericExtraction,
  type GenericEntity,
  type GenericDate,
  type GenericAmount,
} from './types';

/* ============= System Prompt ============= */

const GENERIC_SYSTEM_PROMPT = `You are Kacheri's document data extractor.

This document doesn't fit standard categories. Extract general information:
- title: The document title or main heading
- date: Document date if present (YYYY-MM-DD format)
- author: Author or creator if mentioned
- summary: A brief 2-3 sentence summary of the document
- keyPoints: Array of main points or takeaways
- entities: Array of {type: "person"|"organization"|"date"|"amount"|"location"|"other", value, context?}
- dates: Array of {date, context} for important dates mentioned
- amounts: Array of {value, currency?, context} for monetary values mentioned

IMPORTANT:
1. Return ONLY valid JSON, no explanations outside the markers
2. Use null for fields you cannot find or extract
3. Use YYYY-MM-DD format for all dates
4. Amounts should be numbers (not strings with currency symbols)
5. Include confidence scores (0.0 to 1.0) for each extracted field
6. Extract any notable entities, dates, or amounts even if the document type is unclear
7. The document may be in any language. Extract field values in the original language. Normalize dates to YYYY-MM-DD and amounts to numbers regardless of language.

Return your response wrapped in markers:
${OUT_START}
{
  "extraction": {
    "title": "Document Title",
    "date": "2026-01-15",
    "author": "John Smith",
    "summary": "This document discusses...",
    "keyPoints": ["Point 1", "Point 2"],
    "entities": [{"type": "organization", "value": "Acme Corp", "context": "mentioned as partner"}],
    "dates": [{"date": "2026-02-01", "context": "deadline for submission"}],
    "amounts": [{"value": 10000, "currency": "USD", "context": "project budget"}]
  },
  "confidences": {
    "title": 0.90,
    "summary": 0.85,
    "keyPoints": 0.80,
    ...
  }
}
${OUT_END}`;

/* ============= Field List for Confidence Tracking ============= */

const GENERIC_FIELDS = [
  'title',
  'date',
  'author',
  'summary',
  'keyPoints',
  'entities',
  'dates',
  'amounts',
];

/* ============= Normalization Functions ============= */

function normalizeEntityType(
  value: unknown
): 'person' | 'organization' | 'date' | 'amount' | 'location' | 'other' {
  const validTypes = ['person', 'organization', 'date', 'amount', 'location', 'other'];
  if (typeof value === 'string' && validTypes.includes(value)) {
    return value as GenericEntity['type'];
  }
  return 'other';
}

function normalizeEntities(raw: unknown): GenericEntity[] {
  if (!Array.isArray(raw)) return [];
  const result: GenericEntity[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const value = typeof obj.value === 'string' ? obj.value.trim() : '';
    if (!value) continue;

    const entity: GenericEntity = {
      type: normalizeEntityType(obj.type),
      value,
    };
    if (typeof obj.context === 'string') entity.context = obj.context;
    result.push(entity);
  }
  return result;
}

function normalizeDates(raw: unknown): GenericDate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;

      const date = normalizeDate(obj.date);
      const context = typeof obj.context === 'string' ? obj.context : '';

      if (!date) return null;

      return {
        date,
        context: context || 'mentioned in document',
      };
    })
    .filter((item): item is GenericDate => item !== null);
}

function normalizeAmounts(raw: unknown): GenericAmount[] {
  if (!Array.isArray(raw)) return [];
  const result: GenericAmount[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const value = typeof obj.value === 'number' ? obj.value : NaN;
    const context = typeof obj.context === 'string' ? obj.context : '';

    if (isNaN(value)) continue;

    const amount: GenericAmount = {
      value,
      context: context || 'mentioned in document',
    };
    if (typeof obj.currency === 'string') amount.currency = obj.currency;
    result.push(amount);
  }
  return result;
}

function normalizeGenericExtraction(raw: unknown): GenericExtraction {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  return {
    documentType: 'other',
    title:
      typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Untitled Document',
    date: normalizeDate(obj.date),
    author: typeof obj.author === 'string' ? obj.author : undefined,
    summary:
      typeof obj.summary === 'string' && obj.summary.trim()
        ? obj.summary.trim()
        : 'No summary available',
    keyPoints: normalizeStringArray(obj.keyPoints) || [],
    entities: normalizeEntities(obj.entities),
    dates: normalizeDates(obj.dates),
    amounts: normalizeAmounts(obj.amounts),
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
 * Extract generic document data from text using AI.
 *
 * This is the fallback extractor for documents that don't fit other categories.
 *
 * @param text - The document text to extract from
 * @param options - Provider, model, seed options
 * @returns Extraction result with generic data and confidence scores
 */
export async function extractGeneric(
  text: string,
  options: ExtractorOptions = {}
): Promise<ExtractorResult> {
  const notes: string[] = [];

  const prompt = `Extract data from this document:\n\n---\n${text}\n---`;

  try {
    const result = await composeText(prompt, {
      systemPrompt: GENERIC_SYSTEM_PROMPT,
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

    const extraction = normalizeGenericExtraction(rawExtraction);
    const fieldConfidences = buildFieldConfidences(
      extraction as unknown as Record<string, unknown>,
      rawConfidences,
      GENERIC_FIELDS
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
