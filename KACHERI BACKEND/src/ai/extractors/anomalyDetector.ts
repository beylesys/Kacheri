// KACHERI BACKEND/src/ai/extractors/anomalyDetector.ts
// Document Intelligence: Anomaly Detection Engine
//
// Orchestrates rule evaluation across all document types.
// Supports universal rules, type-specific rules, and workspace custom rules.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 3

import type { Anomaly, DocumentType } from '../../store/extractions';
import type { ExtractionResult, FieldConfidence } from './types';
import type { Rule, RuleContext, WorkspaceStandard } from './rules/types';
import { createAnomaly } from './rules/types';

// Import all rule sets
import { universalRules } from './rules/universalRules';
import { contractRules } from './rules/contractRules';
import { invoiceRules } from './rules/invoiceRules';
import { proposalRules } from './rules/proposalRules';
import { meetingNotesRules } from './rules/meetingNotesRules';

/* ============= Rule Registry ============= */

/**
 * Map of document types to their specific rules.
 * Note: 'report' and 'other' use only universal rules for now.
 */
const TYPE_SPECIFIC_RULES: Partial<Record<DocumentType, Rule[]>> = {
  contract: contractRules,
  invoice: invoiceRules,
  proposal: proposalRules,
  meeting_notes: meetingNotesRules,
  // report: [], // Could add reportRules.ts later
  // other: [],  // Generic uses only universal rules
};

/* ============= Workspace Custom Rules (Slice 7 placeholder) ============= */

/**
 * Helper to access nested object properties via dot notation.
 * e.g., getNestedValue(obj, 'paymentTerms.netDays')
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate a workspace custom standard rule.
 * This is a placeholder implementation for Slice 7.
 *
 * @param standard - The workspace standard configuration
 * @param ctx - Rule evaluation context
 * @returns Anomaly if rule triggers, null otherwise
 */
function evaluateWorkspaceStandard(
  standard: WorkspaceStandard,
  ctx: RuleContext
): Anomaly | null {
  const ext = ctx.extraction as unknown as Record<string, unknown>;

  switch (standard.ruleType) {
    case 'required_field': {
      // Config: { fieldPath: string }
      const fieldPath = standard.config.fieldPath as string;
      if (!fieldPath) return null;

      // Simple dot-notation path access
      const value = getNestedValue(ext, fieldPath);
      if (value === undefined || value === null || value === '') {
        return createAnomaly(
          `CUSTOM_REQUIRED_${fieldPath.toUpperCase().replace(/\./g, '_')}`,
          standard.severity,
          `Required field "${fieldPath}" is missing or empty`,
          'This field is required by your workspace standards'
        );
      }
      break;
    }

    case 'value_range': {
      // Config: { fieldPath: string, min?: number, max?: number }
      const fieldPath = standard.config.fieldPath as string;
      const min = standard.config.min as number | undefined;
      const max = standard.config.max as number | undefined;
      if (!fieldPath) return null;

      const value = getNestedValue(ext, fieldPath);
      if (typeof value === 'number') {
        if (min !== undefined && value < min) {
          return createAnomaly(
            `CUSTOM_BELOW_MIN_${fieldPath.toUpperCase().replace(/\./g, '_')}`,
            standard.severity,
            `Field "${fieldPath}" value (${value}) is below minimum (${min})`,
            `Your workspace standards require this value to be at least ${min}`
          );
        }
        if (max !== undefined && value > max) {
          return createAnomaly(
            `CUSTOM_ABOVE_MAX_${fieldPath.toUpperCase().replace(/\./g, '_')}`,
            standard.severity,
            `Field "${fieldPath}" value (${value}) exceeds maximum (${max})`,
            `Your workspace standards require this value to be at most ${max}`
          );
        }
      }
      break;
    }

    case 'comparison': {
      // Config: { field1: string, operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq', field2: string }
      // For comparing two date fields, numeric fields, etc.
      // Full implementation deferred to Slice 7
      break;
    }

    case 'custom': {
      // Config: { expression: string } - Custom validation expression
      // Full implementation deferred to Slice 7
      break;
    }
  }

  return null;
}

/* ============= Main Detection Function ============= */

export interface DetectAnomaliesInput {
  extraction: ExtractionResult;
  fieldConfidences: FieldConfidence;
  workspaceStandards?: WorkspaceStandard[];
}

export interface DetectAnomaliesResult {
  anomalies: Anomaly[];
  rulesEvaluated: number;
  customRulesEvaluated: number;
}

/**
 * Detect anomalies in an extraction result.
 *
 * Evaluates:
 * 1. Universal rules (apply to all document types)
 * 2. Type-specific rules (based on documentType)
 * 3. Workspace custom rules (if provided)
 *
 * @param input - Extraction data and optional workspace standards
 * @returns List of detected anomalies with evaluation stats
 *
 * @example
 * ```typescript
 * const result = detectAnomalies({
 *   extraction: contractExtraction,
 *   fieldConfidences: { title: 0.95, parties: 0.88 },
 *   workspaceStandards: [] // optional custom rules
 * });
 *
 * console.log(result.anomalies);
 * // [{ code: 'NO_TERMINATION_CLAUSE', severity: 'warning', ... }]
 * ```
 */
export function detectAnomalies(input: DetectAnomaliesInput): DetectAnomaliesResult {
  const { extraction, fieldConfidences, workspaceStandards = [] } = input;
  const anomalies: Anomaly[] = [];
  let rulesEvaluated = 0;
  let customRulesEvaluated = 0;

  // Build evaluation context
  const ctx: RuleContext = {
    extraction,
    fieldConfidences,
    workspaceStandards,
  };

  // 1. Evaluate universal rules
  for (const rule of universalRules) {
    try {
      const results = rule.evaluate(ctx);
      anomalies.push(...results);
      rulesEvaluated++;
    } catch (err) {
      console.error(`[anomalyDetector] Rule ${rule.meta.code} failed:`, err);
    }
  }

  // 2. Evaluate type-specific rules
  const docType = extraction.documentType;
  const typeRules = TYPE_SPECIFIC_RULES[docType] || [];

  for (const rule of typeRules) {
    try {
      const results = rule.evaluate(ctx);
      anomalies.push(...results);
      rulesEvaluated++;
    } catch (err) {
      console.error(`[anomalyDetector] Rule ${rule.meta.code} failed:`, err);
    }
  }

  // 3. Evaluate workspace custom rules (Slice 7 integration)
  const enabledStandards = workspaceStandards.filter(
    (s) => s.enabled && (s.documentType === docType || s.documentType === 'other')
  );

  for (const standard of enabledStandards) {
    try {
      const result = evaluateWorkspaceStandard(standard, ctx);
      if (result) {
        anomalies.push(result);
      }
      customRulesEvaluated++;
    } catch (err) {
      console.error(`[anomalyDetector] Custom rule ${standard.id} failed:`, err);
    }
  }

  return {
    anomalies,
    rulesEvaluated,
    customRulesEvaluated,
  };
}

/* ============= Utility Functions ============= */

/**
 * Get all registered rules for a document type.
 * Useful for UI display of what rules are available.
 */
export function getRulesForDocumentType(docType: DocumentType): Rule[] {
  const typeRules = TYPE_SPECIFIC_RULES[docType] || [];
  return [...universalRules, ...typeRules];
}

/**
 * Get all rule codes that could potentially trigger.
 * Useful for filtering/searching anomalies.
 */
export function getAllRuleCodes(): string[] {
  const codes: string[] = [];

  for (const rule of universalRules) {
    codes.push(rule.meta.code);
  }

  for (const rules of Object.values(TYPE_SPECIFIC_RULES)) {
    if (rules) {
      for (const rule of rules) {
        codes.push(rule.meta.code);
      }
    }
  }

  return codes;
}

/**
 * Get rule metadata by code.
 * Useful for displaying rule info in UI.
 */
export function getRuleByCode(code: string): Rule | undefined {
  // Check universal rules
  const universalMatch = universalRules.find((r) => r.meta.code === code);
  if (universalMatch) return universalMatch;

  // Check type-specific rules
  for (const rules of Object.values(TYPE_SPECIFIC_RULES)) {
    if (rules) {
      const match = rules.find((r) => r.meta.code === code);
      if (match) return match;
    }
  }

  return undefined;
}

/* ============= Re-exports ============= */

export type {
  Rule,
  RuleContext,
  RuleFunction,
  RuleMetadata,
  WorkspaceStandard,
} from './rules/types';
