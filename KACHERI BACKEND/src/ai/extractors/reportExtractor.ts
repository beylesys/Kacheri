// KACHERI BACKEND/src/ai/extractors/reportExtractor.ts
// Document Intelligence: Report-specific data extraction
//
// Extracts: author, period, findings, metrics, recommendations, risks, etc.

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
  type ReportExtraction,
  type ReportPeriod,
  type ReportMetric,
  type ReportRisk,
  type GenericExtraction,
} from './types';

/* ============= System Prompt ============= */

const REPORT_SYSTEM_PROMPT = `You are Kacheri's report data extractor.

Extract the following fields from the report:
- title: The report title
- author: Who wrote/prepared the report
- date: Report date (YYYY-MM-DD format)
- period: Object with {from, to} dates if the report covers a specific period
- executiveSummary: Brief overview or summary
- keyFindings: Array of main findings/conclusions
- metrics: Array of {name, value, change?, trend?: "up"|"down"|"stable"}
- recommendations: Array of recommended actions
- risks: Array of {description, severity?: "low"|"medium"|"high", mitigation?}

IMPORTANT:
1. Return ONLY valid JSON, no explanations outside the markers
2. Use null for fields you cannot find or extract
3. Use YYYY-MM-DD format for all dates
4. Include confidence scores (0.0 to 1.0) for each extracted field
5. Metrics can have string or number values
6. The document may be in any language. Extract field values in the original language. Normalize dates to YYYY-MM-DD and amounts to numbers regardless of language.

Return your response wrapped in markers:
${OUT_START}
{
  "extraction": {
    "title": "Q1 2026 Performance Report",
    "author": "Analytics Team",
    "date": "2026-04-01",
    "period": {"from": "2026-01-01", "to": "2026-03-31"},
    "executiveSummary": "Strong growth in Q1 with 25% revenue increase...",
    "keyFindings": ["Revenue up 25%", "Customer churn reduced to 2%"],
    "metrics": [{"name": "Revenue", "value": 1500000, "change": "+25%", "trend": "up"}],
    "recommendations": ["Increase marketing spend in Q2"],
    "risks": [{"description": "Market volatility", "severity": "medium", "mitigation": "Diversify product line"}],
    ...
  },
  "confidences": {
    "title": 0.95,
    "keyFindings": 0.88,
    "metrics": 0.85,
    ...
  }
}
${OUT_END}`;

/* ============= Field List for Confidence Tracking ============= */

const REPORT_FIELDS = [
  'title',
  'author',
  'date',
  'period',
  'executiveSummary',
  'keyFindings',
  'metrics',
  'recommendations',
  'risks',
];

/* ============= Normalization Functions ============= */

function normalizePeriod(raw: unknown): ReportPeriod | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const from = normalizeDate(obj.from);
  const to = normalizeDate(obj.to);

  if (!from || !to) return undefined;
  return { from, to };
}

function normalizeTrend(value: unknown): 'up' | 'down' | 'stable' | undefined {
  if (value === 'up' || value === 'down' || value === 'stable') {
    return value;
  }
  return undefined;
}

function normalizeMetrics(raw: unknown): ReportMetric[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: ReportMetric[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;

    // Value can be string or number
    let value: string | number;
    if (typeof obj.value === 'number') {
      value = obj.value;
    } else if (typeof obj.value === 'string') {
      value = obj.value;
    } else {
      value = 'N/A';
    }

    const metric: ReportMetric = { name, value };
    if (typeof obj.change === 'string') metric.change = obj.change;
    const trend = normalizeTrend(obj.trend);
    if (trend) metric.trend = trend;
    result.push(metric);
  }
  return result.length > 0 ? result : undefined;
}

function normalizeSeverity(value: unknown): 'low' | 'medium' | 'high' | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return undefined;
}

function normalizeRisks(raw: unknown): ReportRisk[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: ReportRisk[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const description = typeof obj.description === 'string' ? obj.description.trim() : '';
    if (!description) continue;

    const risk: ReportRisk = { description };
    const severity = normalizeSeverity(obj.severity);
    if (severity) risk.severity = severity;
    if (typeof obj.mitigation === 'string') risk.mitigation = obj.mitigation;
    result.push(risk);
  }
  return result.length > 0 ? result : undefined;
}

function normalizeReportExtraction(raw: unknown): ReportExtraction {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  return {
    documentType: 'report',
    title:
      typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Untitled Report',
    author: typeof obj.author === 'string' ? obj.author : undefined,
    date: normalizeDate(obj.date) || 'Unknown',
    period: normalizePeriod(obj.period),
    executiveSummary: typeof obj.executiveSummary === 'string' ? obj.executiveSummary : undefined,
    keyFindings: normalizeStringArray(obj.keyFindings) || [],
    metrics: normalizeMetrics(obj.metrics),
    recommendations: normalizeStringArray(obj.recommendations),
    risks: normalizeRisks(obj.risks),
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
 * Extract report data from text using AI.
 *
 * @param text - The report text to extract from
 * @param options - Provider, model, seed options
 * @returns Extraction result with report data and confidence scores
 */
export async function extractReport(
  text: string,
  options: ExtractorOptions = {}
): Promise<ExtractorResult> {
  const notes: string[] = [];

  const prompt = `Extract report data from this document:\n\n---\n${text}\n---`;

  try {
    const result = await composeText(prompt, {
      systemPrompt: REPORT_SYSTEM_PROMPT,
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

    const extraction = normalizeReportExtraction(rawExtraction);
    const fieldConfidences = buildFieldConfidences(
      extraction as unknown as Record<string, unknown>,
      rawConfidences,
      REPORT_FIELDS
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
