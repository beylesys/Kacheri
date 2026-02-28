// KACHERI BACKEND/src/compliance/types.ts
// Compliance Checker: Type definitions for the compliance rule engine
//
// Defines evaluator interface, typed rule configs, evaluation context, and engine I/O.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A2

import type { CompliancePolicy, PolicyRuleType } from "../store/compliancePolicies";
import type { PolicyResult } from "../store/complianceChecks";

/* ============= Rule Config Types ============= */

/** Config for text_match rule: check if document contains/matches a text pattern */
export interface TextMatchConfig {
  pattern: string;
  matchType: "contains" | "exact" | "startsWith";
  caseSensitive: boolean;
}

/** Config for regex_pattern rule: check document against a regular expression */
export interface RegexPatternConfig {
  pattern: string;
  flags: string;
  mustMatch: boolean; // true = text must match, false = text must NOT match
}

/** Config for required_section rule: check for a heading section in the document */
export interface RequiredSectionConfig {
  heading: string;
  minWords?: number;
}

/** Config for forbidden_term rule: scan for disallowed terms */
export interface ForbiddenTermConfig {
  terms: string[];
  caseSensitive: boolean;
}

/** Config for numeric_constraint rule: check a numeric value against a threshold */
export interface NumericConstraintConfig {
  fieldPath: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
}

/** Config for ai_check rule: AI-powered compliance evaluation via natural language */
export interface AiCheckConfig {
  instruction: string;
  failIf: "yes" | "no";
}

/* ============= Evaluation Context ============= */

/**
 * A parsed section from the document HTML.
 * Used by the requiredSection evaluator.
 */
export interface Section {
  level: number;
  heading: string;
  body: string;
  wordCount: number;
}

/**
 * Context passed to each evaluator function.
 * Pre-processed once by the engine orchestrator, shared across all evaluators.
 */
export interface EvaluationContext {
  /** Plain text content of the document (HTML stripped) */
  text: string;
  /** Original HTML content */
  html: string;
  /** Extracted section headings with their content */
  sections: Section[];
  /** Optional metadata object (e.g. from extraction) for numeric field paths */
  metadata?: Record<string, unknown>;
}

/* ============= Evaluator Interface ============= */

/**
 * A pure function evaluator that checks a document against a single policy.
 * Returns a PolicyResult.
 *
 * Must not throw -- errors should be caught by the engine orchestrator.
 * May return a Promise for async evaluators (e.g. ai_check).
 */
export type PolicyEvaluator = (
  ctx: EvaluationContext,
  policy: CompliancePolicy
) => PolicyResult | Promise<PolicyResult>;

/* ============= Engine I/O Types ============= */

/** Input to the compliance engine orchestrator */
export interface ComplianceEngineInput {
  /** Document HTML content (from Tiptap editor) */
  html: string;
  /** Policies to evaluate (typically the enabled policies for the workspace) */
  policies: CompliancePolicy[];
  /** Optional metadata from extraction (for numeric_constraint fieldPath) */
  metadata?: Record<string, unknown>;
}

/** Output from the compliance engine orchestrator */
export interface ComplianceEngineResult {
  results: PolicyResult[];
  totalPolicies: number;
  passed: number;
  warnings: number;
  violations: number;
  errors: number;
}
