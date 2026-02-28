// KACHERI BACKEND/src/compliance/evaluators/forbiddenTerm.ts
// Compliance Checker: forbidden_term evaluator
//
// Pure function - no side effects, no database access.
// Scans document text for disallowed terms.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A2

import type { CompliancePolicy } from "../../store/compliancePolicies";
import type { PolicyResult } from "../../store/complianceChecks";
import type { EvaluationContext, ForbiddenTermConfig } from "../types";

/* ============= Config Validation ============= */

function isValidConfig(config: unknown): config is ForbiddenTermConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.terms) || c.terms.length === 0) return false;
  if (!c.terms.every((t: unknown) => typeof t === "string" && t.length > 0)) return false;
  if (typeof c.caseSensitive !== "boolean") return false;
  return true;
}

/** Count non-overlapping occurrences of a substring in text */
function countOccurrences(text: string, term: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    count++;
    pos += term.length;
  }
  return count;
}

/* ============= Evaluator ============= */

export function evaluateForbiddenTerm(
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
      message: "Invalid forbidden_term config: requires terms (non-empty string[]), caseSensitive (boolean)",
    };
  }

  const text = config.caseSensitive ? ctx.text : ctx.text.toLowerCase();
  const foundTerms: string[] = [];
  const occurrences: Record<string, number> = {};

  for (const term of config.terms) {
    const searchTerm = config.caseSensitive ? term : term.toLowerCase();
    const count = countOccurrences(text, searchTerm);
    if (count > 0) {
      foundTerms.push(term); // report with original casing
      occurrences[term] = count;
    }
  }

  if (foundTerms.length === 0) {
    return {
      ...base,
      status: "passed",
      message: `No forbidden terms found in document (checked ${config.terms.length} term${config.terms.length === 1 ? "" : "s"})`,
    };
  }

  const termList = foundTerms.map((t) => `'${t}'`).join(", ");
  const totalCount = Object.values(occurrences).reduce((sum, n) => sum + n, 0);

  return {
    ...base,
    status: "failed",
    message: `Forbidden term${foundTerms.length === 1 ? "" : "s"} found: ${termList} (${totalCount} total occurrence${totalCount === 1 ? "" : "s"})`,
    suggestion: "Remove or replace the forbidden terms.",
    details: { foundTerms, occurrences },
  };
}
