// KACHERI BACKEND/src/compliance/evaluators/requiredSection.ts
// Compliance Checker: required_section evaluator
//
// Pure function - no side effects, no database access.
// Checks if the document contains a required heading section with optional minimum word count.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A2

import type { CompliancePolicy } from "../../store/compliancePolicies";
import type { PolicyResult } from "../../store/complianceChecks";
import type { EvaluationContext, RequiredSectionConfig } from "../types";

/* ============= Config Validation ============= */

function isValidConfig(config: unknown): config is RequiredSectionConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.heading !== "string" || c.heading.length === 0) return false;
  if (c.minWords !== undefined && (typeof c.minWords !== "number" || c.minWords < 0)) return false;
  return true;
}

/* ============= Evaluator ============= */

export function evaluateRequiredSection(
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
      message: "Invalid required_section config: requires heading (string), optional minWords (number >= 0)",
    };
  }

  const requiredHeading = config.heading.trim().toLowerCase();

  // Search pre-parsed sections for a matching heading (case-insensitive)
  const matchingSection = ctx.sections.find(
    (s) => s.heading.toLowerCase().trim() === requiredHeading
  );

  if (!matchingSection) {
    return {
      ...base,
      status: "failed",
      message: `Required section '${config.heading}' not found in document`,
      suggestion: `Add a section with the heading '${config.heading}' to the document.`,
    };
  }

  // Check minimum word count if specified
  if (config.minWords !== undefined && matchingSection.wordCount < config.minWords) {
    return {
      ...base,
      status: "failed",
      message: `Section '${config.heading}' found but contains only ${matchingSection.wordCount} word${matchingSection.wordCount === 1 ? "" : "s"} (minimum: ${config.minWords})`,
      suggestion: `Expand the '${config.heading}' section to contain at least ${config.minWords} words.`,
      location: matchingSection.heading,
      details: { wordCount: matchingSection.wordCount, minWords: config.minWords },
    };
  }

  return {
    ...base,
    status: "passed",
    message: `Required section '${config.heading}' found${config.minWords ? ` with ${matchingSection.wordCount} words (minimum: ${config.minWords})` : ""}`,
    location: matchingSection.heading,
  };
}
