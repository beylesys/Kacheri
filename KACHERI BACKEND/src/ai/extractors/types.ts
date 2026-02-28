// KACHERI BACKEND/src/ai/extractors/types.ts
// Document Intelligence: Type definitions for extraction schemas
//
// See: Docs/Roadmap/document-intelligence-work-scope.md

// Re-export base types from store
export type { DocumentType, Anomaly, AnomalySeverity } from '../../store/extractions';
import type { DocumentType, Anomaly } from '../../store/extractions';

/* ============= Output Markers ============= */

export const OUT_START = '<<<KACHERI_OUTPUT_START>>>';
export const OUT_END = '<<<KACHERI_OUTPUT_END>>>';

/* ============= Shared / Common Types ============= */

export interface Party {
  name: string;
  role: 'party_a' | 'party_b' | 'other';
  address?: string;
}

export interface Signature {
  party: string;
  signedDate?: string;
}

export interface PaymentTerms {
  amount?: number;
  currency?: string;
  frequency?: string;
  dueDate?: string;
  netDays?: number;
}

export interface TerminationClause {
  noticePeriod?: string;
  conditions?: string[];
}

export interface LiabilityLimit {
  amount?: number;
  currency?: string;
}

/* ============= Contract Schema ============= */

export interface ContractExtraction {
  documentType: 'contract';
  title: string;
  parties: Party[];
  effectiveDate?: string;
  expirationDate?: string;
  termLength?: string;
  autoRenewal?: boolean;
  paymentTerms?: PaymentTerms;
  terminationClause?: TerminationClause;
  liabilityLimit?: LiabilityLimit;
  governingLaw?: string;
  keyObligations?: string[];
  signatures?: Signature[];
}

/* ============= Invoice Schema ============= */

export interface InvoiceVendor {
  name: string;
  address?: string;
  taxId?: string;
}

export interface InvoiceCustomer {
  name: string;
  address?: string;
}

export interface LineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
}

export interface InvoiceExtraction {
  documentType: 'invoice';
  invoiceNumber: string;
  vendor: InvoiceVendor;
  customer: InvoiceCustomer;
  issueDate: string;
  dueDate: string;
  lineItems: LineItem[];
  subtotal: number;
  tax?: number;
  total: number;
  currency: string;
  paymentInstructions?: string;
}

/* ============= Proposal Schema ============= */

export interface ProposalDeliverable {
  name: string;
  description?: string;
  timeline?: string;
}

export interface ProposalPricingBreakdown {
  item: string;
  amount: number;
}

export interface ProposalPricing {
  total?: number;
  currency?: string;
  breakdown?: ProposalPricingBreakdown[];
  paymentSchedule?: string;
}

export interface ProposalMilestone {
  name: string;
  date: string;
}

export interface ProposalTimeline {
  startDate?: string;
  endDate?: string;
  milestones?: ProposalMilestone[];
}

export interface ProposalExtraction {
  documentType: 'proposal';
  title: string;
  vendor: string;
  client: string;
  date: string;
  validUntil?: string;
  executiveSummary?: string;
  scope: string[];
  deliverables: ProposalDeliverable[];
  pricing: ProposalPricing;
  timeline?: ProposalTimeline;
  assumptions?: string[];
  exclusions?: string[];
}

/* ============= Meeting Notes Schema ============= */

export interface MeetingDiscussion {
  topic: string;
  summary: string;
  decisions?: string[];
}

export interface MeetingActionItem {
  task: string;
  assignee?: string;
  dueDate?: string;
  status?: string;
}

export interface NextMeeting {
  date?: string;
  agenda?: string[];
}

export interface MeetingNotesExtraction {
  documentType: 'meeting_notes';
  title: string;
  date: string;
  attendees: string[];
  absentees?: string[];
  agenda?: string[];
  discussions: MeetingDiscussion[];
  actionItems: MeetingActionItem[];
  nextMeeting?: NextMeeting;
}

/* ============= Report Schema ============= */

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface ReportMetric {
  name: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'stable';
}

export interface ReportRisk {
  description: string;
  severity?: 'low' | 'medium' | 'high';
  mitigation?: string;
}

export interface ReportExtraction {
  documentType: 'report';
  title: string;
  author?: string;
  date: string;
  period?: ReportPeriod;
  executiveSummary?: string;
  keyFindings: string[];
  metrics?: ReportMetric[];
  recommendations?: string[];
  risks?: ReportRisk[];
}

/* ============= Generic/Other Schema ============= */

export interface GenericEntity {
  type: 'person' | 'organization' | 'date' | 'amount' | 'location' | 'other';
  value: string;
  context?: string;
}

export interface GenericDate {
  date: string;
  context: string;
}

export interface GenericAmount {
  value: number;
  currency?: string;
  context: string;
}

export interface GenericExtraction {
  documentType: 'other';
  title: string;
  date?: string;
  author?: string;
  summary: string;
  keyPoints: string[];
  entities: GenericEntity[];
  dates: GenericDate[];
  amounts: GenericAmount[];
}

/* ============= Union Type for All Extractions ============= */

export type ExtractionResult =
  | ContractExtraction
  | InvoiceExtraction
  | ProposalExtraction
  | MeetingNotesExtraction
  | ReportExtraction
  | GenericExtraction;

/* ============= Extractor Types ============= */

export interface FieldConfidence {
  [fieldPath: string]: number; // 0.0 to 1.0
}

export interface ExtractorOptions {
  provider?: string;
  model?: string;
  seed?: string | number;
}

export interface ExtractorResult {
  extraction: ExtractionResult;
  fieldConfidences: FieldConfidence;
  rawResponse?: string;
  notes?: string[];
}

export interface DetectionResult {
  documentType: DocumentType;
  confidence: number;
  reasoning?: string;
  rawResponse?: string;
}

/* ============= Orchestrator Types ============= */

export interface ExtractDocumentInput {
  text: string;
  forceDocType?: DocumentType;
  provider?: string;
  model?: string;
  seed?: string | number;
}

export interface ExtractDocumentResult {
  documentType: DocumentType;
  typeConfidence: number;
  extraction: Record<string, unknown>;
  fieldConfidences: FieldConfidence;
  anomalies: Anomaly[];
  rawDetectionResponse?: string;
  rawExtractionResponse?: string;
  notes?: string[];
}

/* ============= JSON Parsing Utilities ============= */

/**
 * Strip markdown code fences from a string.
 */
function stripCodeFences(s: string): string {
  let out = s.trim();
  if (out.startsWith('```')) {
    const firstNl = out.indexOf('\n');
    if (firstNl !== -1) out = out.slice(firstNl + 1);
    const lastFence = out.lastIndexOf('```');
    if (lastFence !== -1) out = out.slice(0, lastFence);
    out = out.trim();
  }
  return out;
}

/**
 * Extract JSON from an AI response that may be wrapped in markers.
 * Handles: markers, code fences, plain JSON, and fallback extraction.
 */
export function extractJsonFromResponse(raw: string): {
  json: unknown | null;
  parseError?: string;
  usedMarkers: boolean;
} {
  // 1. Strip code fences if present
  let text = stripCodeFences(raw);

  // 2. Extract between markers if present
  const startIdx = text.indexOf(OUT_START);
  const endIdx = text.indexOf(OUT_END);

  let usedMarkers = false;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    text = text.slice(startIdx + OUT_START.length, endIdx).trim();
    usedMarkers = true;
  }

  // 3. Try to parse as JSON
  try {
    const json = JSON.parse(text);
    return { json, usedMarkers };
  } catch (err) {
    // 4. Fallback: try to find JSON object in response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[0]);
        return { json, usedMarkers };
      } catch {
        // Fall through to error
      }
    }
    return {
      json: null,
      parseError: `Failed to parse JSON: ${String(err)}`,
      usedMarkers,
    };
  }
}

/* ============= Normalization Helpers ============= */

/**
 * Normalize a value to an ISO date string (YYYY-MM-DD) or undefined.
 */
export function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  // Try to extract ISO date pattern
  const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  return value; // Return as-is if can't normalize
}

/**
 * Normalize a value to a string array or undefined.
 */
export function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const arr = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return arr.length > 0 ? arr : undefined;
}

/**
 * Calculate heuristic confidence for a field value.
 */
export function calculateHeuristicConfidence(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (value === '' || (Array.isArray(value) && value.length === 0)) return 0.2;
  if (typeof value === 'string') {
    // Date patterns get higher confidence
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 0.85;
    // Amount patterns
    if (/^\d+(\.\d{2})?$/.test(value)) return 0.85;
    // Very short strings may be less reliable
    if (value.length < 3) return 0.5;
  }
  return 0.75;
}

/**
 * Build field confidences from AI-provided values with heuristic fallbacks.
 */
export function buildFieldConfidences(
  extraction: Record<string, unknown>,
  aiConfidences: Record<string, number>,
  fields: string[]
): FieldConfidence {
  const confidences: FieldConfidence = {};

  // Map AI-provided confidences (clamped to 0-1)
  for (const [field, conf] of Object.entries(aiConfidences)) {
    if (typeof conf === 'number') {
      confidences[field] = Math.max(0, Math.min(1, conf));
    }
  }

  // Fill in missing fields with heuristics
  for (const field of fields) {
    if (!(field in confidences)) {
      const value = extraction[field];
      confidences[field] = calculateHeuristicConfidence(value);
    }
  }

  return confidences;
}

/**
 * Extract the first line as a potential title.
 */
export function extractTitleHeuristic(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() || '';
  // Limit title length
  if (firstLine.length > 100) {
    return firstLine.slice(0, 97) + '...';
  }
  return firstLine || 'Untitled Document';
}
