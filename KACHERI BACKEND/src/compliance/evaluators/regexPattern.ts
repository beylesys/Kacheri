// KACHERI BACKEND/src/compliance/evaluators/regexPattern.ts
// Compliance Checker: regex_pattern evaluator
//
// Pure function - no side effects, no database access.
// Checks document text against a regular expression pattern.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A2

import type { CompliancePolicy } from "../../store/compliancePolicies";
import type { PolicyResult } from "../../store/complianceChecks";
import type { EvaluationContext, RegexPatternConfig } from "../types";

/* ============= Config Validation ============= */

function isValidConfig(config: unknown): config is RegexPatternConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.pattern !== "string" || c.pattern.length === 0) return false;
  if (typeof c.flags !== "string") return false;
  if (typeof c.mustMatch !== "boolean") return false;
  return true;
}

/* ============= Evaluator ============= */

export function evaluateRegexPattern(
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
      message: "Invalid regex_pattern config: requires pattern (string), flags (string), mustMatch (boolean)",
    };
  }

  // Attempt to construct the regex — user-provided patterns may be invalid
  let regex: RegExp;
  try {
    regex = new RegExp(config.pattern, config.flags);
  } catch (err) {
    return {
      ...base,
      status: "error",
      message: `Invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const matched = regex.test(ctx.text);

  if (config.mustMatch) {
    // Pattern MUST be found in the document
    if (matched) {
      return {
        ...base,
        status: "passed",
        message: `Required pattern found in document: /${config.pattern}/${config.flags}`,
      };
    }
    return {
      ...base,
      status: "failed",
      message: `Required pattern not found in document: /${config.pattern}/${config.flags}`,
      suggestion: "Ensure the document contains text matching the required pattern.",
    };
  }

  // Pattern must NOT be found in the document
  if (!matched) {
    return {
      ...base,
      status: "passed",
      message: `Forbidden pattern not found in document: /${config.pattern}/${config.flags}`,
    };
  }

  // Find all matches for detailed reporting
  const globalRegex = new RegExp(config.pattern, config.flags.includes("g") ? config.flags : config.flags + "g");
  const allMatches = ctx.text.match(globalRegex) || [];

  return {
    ...base,
    status: "failed",
    message: `Forbidden pattern found in document (${allMatches.length} occurrence${allMatches.length === 1 ? "" : "s"}): /${config.pattern}/${config.flags}`,
    suggestion: "Remove or replace the text matching the forbidden pattern.",
    details: { matches: allMatches.slice(0, 10) }, // cap at 10 for payload size
  };
}
