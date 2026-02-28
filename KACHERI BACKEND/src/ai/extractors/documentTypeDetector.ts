// KACHERI BACKEND/src/ai/extractors/documentTypeDetector.ts
// Document Intelligence: AI-powered document type detection
//
// Classifies documents into: contract, invoice, proposal, meeting_notes, report, other

import { composeText } from '../modelRouter';
import type { DocumentType } from '../../store/extractions';
import {
  extractJsonFromResponse,
  OUT_START,
  OUT_END,
  type ExtractorOptions,
  type DetectionResult,
} from './types';

/* ============= System Prompt ============= */

const DETECT_SYSTEM_PROMPT = `You are Kacheri's document type classifier.

Analyze the document text and classify it into exactly ONE of these types:
- contract: Legal agreements, service contracts, NDAs, employment contracts, terms of service
- invoice: Bills, invoices, payment requests with line items and totals
- proposal: Business proposals, project proposals, RFPs, RFQs, quotes
- meeting_notes: Meeting minutes, agenda notes, action item lists from meetings
- report: Status reports, quarterly reports, analysis documents, research findings
- other: Any document that doesn't clearly fit the above categories

IMPORTANT:
1. Return ONLY valid JSON, no explanations outside the markers
2. Confidence should be 0.0 to 1.0
3. Keep reasoning brief (1-2 sentences)
4. The document may be in any language. Classify based on structure and content regardless of language.

Return your response as JSON wrapped in markers:
${OUT_START}
{
  "documentType": "contract",
  "confidence": 0.92,
  "reasoning": "Contains parties, effective date, termination clauses typical of legal agreements"
}
${OUT_END}`;

/* ============= Document Type Validation ============= */

const VALID_DOC_TYPES: DocumentType[] = [
  'contract',
  'invoice',
  'proposal',
  'meeting_notes',
  'report',
  'other',
];

function normalizeDocType(value: unknown): DocumentType {
  if (typeof value === 'string' && VALID_DOC_TYPES.includes(value as DocumentType)) {
    return value as DocumentType;
  }
  return 'other';
}

/* ============= Main Detection Function ============= */

/**
 * Detect the document type from text using AI.
 *
 * @param text - The document text to classify
 * @param options - Provider, model, seed options
 * @returns Detection result with document type, confidence, and reasoning
 */
export async function detectDocumentType(
  text: string,
  options: ExtractorOptions = {}
): Promise<DetectionResult> {
  // Truncate if very long (keep first 4000 chars for detection)
  const truncated =
    text.length > 4000 ? text.slice(0, 4000) + '\n\n[...document truncated for classification...]' : text;

  const prompt = `Classify this document into one of the supported types:\n\n---\n${truncated}\n---`;

  try {
    const result = await composeText(prompt, {
      systemPrompt: DETECT_SYSTEM_PROMPT,
      maxTokens: 200,
      provider: options.provider,
      model: options.model,
      seed: options.seed,
    });

    const { json, parseError, usedMarkers } = extractJsonFromResponse(result.text);

    // Handle parse error
    if (parseError || !json || typeof json !== 'object') {
      return {
        documentType: 'other',
        confidence: 0.5,
        reasoning: parseError || 'Could not parse AI response',
        rawResponse: result.text,
      };
    }

    const obj = json as Record<string, unknown>;
    const docType = normalizeDocType(obj.documentType);
    const confidence =
      typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.7;
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : undefined;

    // Add note if markers weren't used
    const notes: string[] = [];
    if (!usedMarkers) {
      notes.push('model_output_missing_markers');
    }

    return {
      documentType: docType,
      confidence,
      reasoning: notes.length > 0 ? `${reasoning || ''} [${notes.join(', ')}]`.trim() : reasoning,
      rawResponse: result.text,
    };
  } catch (err) {
    // Never crash - return fallback
    return {
      documentType: 'other',
      confidence: 0.3,
      reasoning: `Detection failed: ${String(err)}`,
    };
  }
}
