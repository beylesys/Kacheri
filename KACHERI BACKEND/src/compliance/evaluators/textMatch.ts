// KACHERI BACKEND/src/compliance/evaluators/textMatch.ts
// Compliance Checker: text_match evaluator
//
// Pure function - no side effects, no database access.
// Checks if document text contains/matches a required text pattern.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A2

import type { CompliancePolicy } from "../../store/compliancePolicies";
import type { PolicyResult } from "../../store/complianceChecks";
import type { EvaluationContext, TextMatchConfig } from "../types";

/* ============= Config Validation ============= */

const VALID_MATCH_TYPES = ["contains", "exact", "startsWith"] as const;

function isValidConfig(config: unknown): config is TextMatchConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.pattern !== "string" || c.pattern.length === 0) return false;
  if (!VALID_MATCH_TYPES.includes(c.matchType as typeof VALID_MATCH_TYPES[number])) return false;
  if (typeof c.caseSensitive !== "boolean") return false;
  return true;
}

/* ============= Evaluator ============= */

export function evaluateTextMatch(
  ctx: EvaluationContext,
  policy: CompliancePolicy
): PolicyResult {
  const base = {
    policyId: policy.id,
    policyName: policy.name,
    ruleType: policy.ruleType,
    severity: policy.severity,
  };

  const config = policy.ruleConfig as Record<string, unknown>;
  if (!isValidConfig(config)) {
    return {
      ...base,
      status: "error",
      message: "Invalid text_match config: requires pattern (string), matchType (contains|exact|startsWith), caseSensitive (boolean)",
    };
  }

  let text = ctx.text;
  let pattern = config.pattern;

  if (!config.caseSensitive) {
    text = text.toLowerCase();
    pattern = pattern.toLowerCase();
  }

  let matched = false;

  switch (config.matchType) {
    case "contains":
      matched = text.includes(pattern);
      break;
    case "exact":
      matched = text.trim() === pattern.trim();
      break;
    case "startsWith":
      matched = text.trimStart().startsWith(pattern);
      break;
  }

  if (matched) {
    return {
      ...base,
      status: "passed",
      message: `Text match check passed: document ${config.matchType} '${config.pattern}'`,
    };
  }

  return {
    ...base,
    status: "failed",
    message: `Document does not ${config.matchType === "contains" ? "contain" : config.matchType === "exact" ? "match exactly" : "start with"} required text: '${config.pattern}'`,
    suggestion: `Add the required text '${config.pattern}' to the document.`,
  };
}
