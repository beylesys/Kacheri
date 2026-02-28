// KACHERI BACKEND/src/ai/extractors/index.ts
// Document Intelligence: Main orchestrator for extraction
//
// Entry point: extractDocument() - detects type and extracts data
// See: Docs/Roadmap/document-intelligence-work-scope.md

import type { DocumentType } from '../../store/extractions';
import type {
  ExtractDocumentInput,
  ExtractDocumentResult,
  ExtractorOptions,
  ExtractorResult,
} from './types';
import { extractTitleHeuristic } from './types';
import { detectDocumentType } from './documentTypeDetector';
import { extractContract } from './contractExtractor';
import { extractInvoice } from './invoiceExtractor';
import { extractProposal } from './proposalExtractor';
import { extractMeetingNotes } from './meetingNotesExtractor';
import { extractReport } from './reportExtractor';
import { extractGeneric } from './genericExtractor';
import { detectAnomalies } from './anomalyDetector';

/* ============= Timeout Utility (Slice 18) ============= */

const DETECTION_TIMEOUT_MS = 10_000; // 10 seconds for type detection
const EXTRACTION_TIMEOUT_MS = 20_000; // 20 seconds for data extraction

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/* ============= Large Document Truncation (Slice 18) ============= */

const MAX_EXTRACTION_CHARS = 60_000;
const MAX_EXTRACTION_CHARS_OLLAMA = 12_000;

export function truncateForExtraction(
  text: string,
  provider?: string
): { text: string; truncated: boolean; originalLength: number } {
  const limit = provider === 'ollama' ? MAX_EXTRACTION_CHARS_OLLAMA : MAX_EXTRACTION_CHARS;
  if (text.length <= limit) {
    return { text, truncated: false, originalLength: text.length };
  }
  return {
    text: text.slice(0, limit) + '\n\n[...document truncated for extraction, showing first ' + limit + ' of ' + text.length + ' characters...]',
    truncated: true,
    originalLength: text.length,
  };
}

/* ============= Empty Content Guard (Slice 18) ============= */

export function isExtractableText(text: string): { extractable: boolean; reason?: string } {
  const stripped = text.replace(/\s+/g, ' ').trim();
  if (stripped.length < 50) {
    return { extractable: false, reason: 'text_too_short' };
  }
  // Check for meaningful alphanumeric content (Unicode-aware: Latin, Cyrillic, Arabic, CJK, Devanagari, Thai, etc.)
  const alphanumeric = stripped.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3000-\u9FFF\uAC00-\uD7AF]/g, '');
  if (alphanumeric.length < 20) {
    return { extractable: false, reason: 'insufficient_meaningful_content' };
  }
  return { extractable: true };
}

/* ============= Extractor Registry ============= */

type ExtractorFn = (text: string, options: ExtractorOptions) => Promise<ExtractorResult>;

const EXTRACTOR_MAP: Record<DocumentType, ExtractorFn> = {
  contract: extractContract,
  invoice: extractInvoice,
  proposal: extractProposal,
  meeting_notes: extractMeetingNotes,
  report: extractReport,
  other: extractGeneric,
};

/* ============= Main Orchestrator ============= */

/**
 * Extract structured data from a document.
 *
 * This is the main entry point for document intelligence extraction.
 *
 * Flow:
 * 1. Detect document type (or use forced type)
 * 2. Route to appropriate type-specific extractor
 * 3. Return unified result with confidence scores
 *
 * @param input - Document text and options
 * @returns Extraction result with document type, extracted data, and confidence scores
 *
 * @example
 * ```typescript
 * const result = await extractDocument({
 *   text: contractText,
 *   provider: 'openai',
 *   model: 'gpt-4o-mini'
 * });
 *
 * console.log(result.documentType);      // 'contract'
 * console.log(result.typeConfidence);    // 0.92
 * console.log(result.extraction.title);  // 'Service Agreement'
 * ```
 */
export async function extractDocument(input: ExtractDocumentInput): Promise<ExtractDocumentResult> {
  const { text, forceDocType, provider, model, seed } = input;
  const extractorOpts: ExtractorOptions = { provider, model, seed };

  // Collect all notes throughout the process
  const allNotes: string[] = [];

  // Step 0a: Empty content guard (Slice 18)
  const textCheck = isExtractableText(text);
  if (!textCheck.extractable) {
    return {
      documentType: 'other',
      typeConfidence: 0,
      extraction: {
        documentType: 'other',
        title: extractTitleHeuristic(text),
        summary: 'Document does not contain sufficient text for extraction.',
        keyPoints: [],
        entities: [],
        dates: [],
        amounts: [],
      },
      fieldConfidences: { title: 0.1, summary: 0.1 },
      anomalies: [{
        code: 'EMPTY_DOCUMENT',
        severity: 'info',
        message: 'This document does not contain enough extractable text.',
        suggestion: 'The document may be an image without OCR, or contains very little text content.',
      }],
      notes: [`skipped_extraction: ${textCheck.reason}`],
    };
  }

  // Step 1: Determine document type
  let documentType: DocumentType;
  let typeConfidence: number;
  let rawDetectionResponse: string | undefined;

  if (forceDocType) {
    // User override = 100% confidence
    documentType = forceDocType;
    typeConfidence = 1.0;
    allNotes.push('document_type_forced');
  } else {
    try {
      const detection = await withTimeout(
        detectDocumentType(text, extractorOpts),
        DETECTION_TIMEOUT_MS,
        'Document type detection timed out'
      );
      documentType = detection.documentType;
      typeConfidence = detection.confidence;
      rawDetectionResponse = detection.rawResponse;

      if (detection.reasoning) {
        allNotes.push(`detection_reasoning: ${detection.reasoning}`);
      }
    } catch (err) {
      // Timeout or other detection error — fall back to generic
      const msg = err instanceof Error ? err.message : String(err);
      allNotes.push(`detection_error: ${msg}`);
      documentType = 'other';
      typeConfidence = 0.3;
    }
  }

  // Step 1b: Truncate for extraction if too large (Slice 18)
  const { text: extractionText, truncated, originalLength } = truncateForExtraction(text, provider);
  if (truncated) {
    allNotes.push(`text_truncated: ${originalLength} chars → ${extractionText.length} chars`);
  }

  // Step 2: Route to appropriate extractor
  const extractor = EXTRACTOR_MAP[documentType] || extractGeneric;
  const extractorResult = await withTimeout(
    extractor(extractionText, extractorOpts),
    EXTRACTION_TIMEOUT_MS,
    'Data extraction timed out'
  );

  // Collect extractor notes
  if (extractorResult.notes) {
    allNotes.push(...extractorResult.notes);
  }

  // Step 3: Detect anomalies
  const anomalyResult = detectAnomalies({
    extraction: extractorResult.extraction,
    fieldConfidences: extractorResult.fieldConfidences,
    // workspaceStandards will be loaded and passed in Slice 7
  });

  // Note how many rules were evaluated
  if (anomalyResult.rulesEvaluated > 0) {
    allNotes.push(`anomaly_rules_evaluated: ${anomalyResult.rulesEvaluated}`);
  }
  if (anomalyResult.anomalies.length > 0) {
    allNotes.push(`anomalies_detected: ${anomalyResult.anomalies.length}`);
  }

  // Step 4: Build unified result
  return {
    documentType,
    typeConfidence,
    extraction: extractorResult.extraction as unknown as Record<string, unknown>,
    fieldConfidences: extractorResult.fieldConfidences,
    anomalies: anomalyResult.anomalies,
    rawDetectionResponse,
    rawExtractionResponse: extractorResult.rawResponse,
    notes: allNotes.length > 0 ? allNotes : undefined,
  };
}

/* ============= Re-exports ============= */

// Export individual components for testing and direct use
export { detectDocumentType } from './documentTypeDetector';
export { extractContract } from './contractExtractor';
export { extractInvoice } from './invoiceExtractor';
export { extractProposal } from './proposalExtractor';
export { extractMeetingNotes } from './meetingNotesExtractor';
export { extractReport } from './reportExtractor';
export { extractGeneric } from './genericExtractor';

// Export all types
export * from './types';

// Export anomaly detection
export { detectAnomalies, getRulesForDocumentType, getAllRuleCodes, getRuleByCode } from './anomalyDetector';
export type { DetectAnomaliesInput, DetectAnomaliesResult } from './anomalyDetector';
