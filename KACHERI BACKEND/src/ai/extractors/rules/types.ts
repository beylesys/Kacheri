// KACHERI BACKEND/src/ai/extractors/rules/types.ts
// Document Intelligence: Rule system type definitions
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 3

import type { Anomaly, AnomalySeverity, DocumentType } from '../../../store/extractions';
import type { ExtractionResult, FieldConfidence } from '../types';

/* ============= Rule Context ============= */

/**
 * Context provided to each rule function for evaluation.
 * Contains the extraction data, confidence scores, and optional workspace standards.
 */
export interface RuleContext {
  extraction: ExtractionResult;
  fieldConfidences: FieldConfidence;
  workspaceStandards?: WorkspaceStandard[];
}

/* ============= Rule Function Types ============= */

/**
 * A rule function that evaluates an extraction and returns zero or more anomalies.
 * Pure function - no side effects.
 */
export type RuleFunction = (context: RuleContext) => Anomaly[];

/**
 * Metadata about a rule for registration and filtering.
 */
export interface RuleMetadata {
  /** Unique machine-readable code (e.g., "MISSING_TITLE") */
  code: string;
  /** Human-readable name */
  name: string;
  /** Description of what this rule checks */
  description: string;
  /** Which document types this rule applies to ('all' for universal rules) */
  documentTypes: DocumentType[] | 'all';
  /** Default severity when rule triggers */
  defaultSeverity: AnomalySeverity;
}

/**
 * A complete rule with its metadata and evaluation function.
 */
export interface Rule {
  meta: RuleMetadata;
  evaluate: RuleFunction;
}

/* ============= Workspace Standards (Slice 7 Placeholder) ============= */

/**
 * Workspace custom standard rule (loaded from DB).
 * This is a placeholder for Slice 7 integration.
 */
export interface WorkspaceStandard {
  id: string;
  workspaceId: string;
  documentType: DocumentType;
  ruleType: 'required_field' | 'value_range' | 'comparison' | 'custom';
  config: Record<string, unknown>;
  severity: AnomalySeverity;
  enabled: boolean;
}

/* ============= Helper Types ============= */

/**
 * Helper function type for creating anomalies consistently.
 */
export type CreateAnomalyFn = (
  code: string,
  severity: AnomalySeverity,
  message: string,
  suggestion?: string
) => Anomaly;

/**
 * Helper to check if a value is present (not null, undefined, or empty).
 */
export function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Helper to create an Anomaly object.
 */
export function createAnomaly(
  code: string,
  severity: AnomalySeverity,
  message: string,
  suggestion?: string
): Anomaly {
  const anomaly: Anomaly = { code, severity, message };
  if (suggestion) {
    anomaly.suggestion = suggestion;
  }
  return anomaly;
}
