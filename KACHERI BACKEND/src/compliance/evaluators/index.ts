// KACHERI BACKEND/src/compliance/evaluators/index.ts
// Compliance Checker: Evaluator registry
//
// Maps PolicyRuleType -> PolicyEvaluator function.
// All 6 rule types registered: 5 sync + 1 async (ai_check).
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slices A2, A3

import type { PolicyRuleType } from "../../store/compliancePolicies";
import type { PolicyEvaluator } from "../types";

import { evaluateTextMatch } from "./textMatch";
import { evaluateRegexPattern } from "./regexPattern";
import { evaluateRequiredSection } from "./requiredSection";
import { evaluateForbiddenTerm } from "./forbiddenTerm";
import { evaluateNumericConstraint } from "./numericConstraint";
import { evaluateAiCheck } from "./aiCheck";

/**
 * Registry of evaluator functions keyed by PolicyRuleType.
 *
 * To add a new evaluator:
 * 1. Create the evaluator file in this directory
 * 2. Import it here
 * 3. Add it to this registry
 */
export const evaluatorRegistry: Partial<Record<PolicyRuleType, PolicyEvaluator>> = {
  text_match: evaluateTextMatch,
  regex_pattern: evaluateRegexPattern,
  required_section: evaluateRequiredSection,
  forbidden_term: evaluateForbiddenTerm,
  numeric_constraint: evaluateNumericConstraint,
  ai_check: evaluateAiCheck,
};
