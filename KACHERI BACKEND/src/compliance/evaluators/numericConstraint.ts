// KACHERI BACKEND/src/compliance/evaluators/numericConstraint.ts
// Compliance Checker: numeric_constraint evaluator
//
// Pure function - no side effects, no database access.
// Checks a numeric value (from metadata or document text) against a threshold.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A2

import type { CompliancePolicy } from "../../store/compliancePolicies";
import type { PolicyResult } from "../../store/complianceChecks";
import type { EvaluationContext, NumericConstraintConfig } from "../types";

/* ============= Config Validation ============= */

const VALID_OPERATORS = ["lt", "lte", "gt", "gte", "eq"] as const;

function isValidConfig(config: unknown): config is NumericConstraintConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.fieldPath !== "string" || c.fieldPath.length === 0) return false;
  if (!VALID_OPERATORS.includes(c.operator as typeof VALID_OPERATORS[number])) return false;
  if (typeof c.value !== "number" || isNaN(c.value)) return false;
  return true;
}

/* ============= Helpers ============= */

const OPERATOR_LABELS: Record<string, string> = {
  lt: "less than",
  lte: "at most",
  gt: "greater than",
  gte: "at least",
  eq: "equal to",
};

/** Resolve a dot-notation path in a nested object */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Evaluate a numeric comparison */
function evaluateOperator(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case "lt":  return actual < expected;
    case "lte": return actual <= expected;
    case "gt":  return actual > expected;
    case "gte": return actual >= expected;
    case "eq":  return actual === expected;
    default:    return false;
  }
}

/** Try to extract a numeric value from text near the fieldPath label */
function findNumericInText(text: string, fieldPath: string): number | null {
  // Escape special regex chars in fieldPath, then look for nearby numbers
  const escaped = fieldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped + "\\s*[:=]?\\s*([0-9]+\\.?[0-9]*%?)", "i");
  const match = text.match(pattern);
  if (!match) return null;

  // Strip trailing % and parse
  const raw = match[1].replace(/%$/, "");
  const num = parseFloat(raw);
  return isNaN(num) ? null : num;
}

/* ============= Evaluator ============= */

export function evaluateNumericConstraint(
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
      message: "Invalid numeric_constraint config: requires fieldPath (string), operator (lt|lte|gt|gte|eq), value (number)",
    };
  }

  // Try 1: Resolve from metadata (e.g. extraction results)
  let actualValue: number | null = null;
  let source = "metadata";

  if (ctx.metadata) {
    const metaValue = getNestedValue(ctx.metadata, config.fieldPath);
    if (typeof metaValue === "number" && !isNaN(metaValue)) {
      actualValue = metaValue;
    } else if (typeof metaValue === "string") {
      const parsed = parseFloat(metaValue.replace(/%$/, ""));
      if (!isNaN(parsed)) actualValue = parsed;
    }
  }

  // Try 2: Scan document text for the field label near a number
  if (actualValue === null) {
    actualValue = findNumericInText(ctx.text, config.fieldPath);
    source = "text";
  }

  // Field not found — pass (absence is not a violation)
  if (actualValue === null) {
    return {
      ...base,
      status: "passed",
      message: `Numeric field '${config.fieldPath}' not found in document — check not applicable`,
      details: { fieldNotFound: true },
    };
  }

  const label = OPERATOR_LABELS[config.operator] || config.operator;
  const satisfied = evaluateOperator(actualValue, config.operator, config.value);

  if (satisfied) {
    return {
      ...base,
      status: "passed",
      message: `'${config.fieldPath}' value (${actualValue}) is ${label} ${config.value}`,
      details: { actualValue, source },
    };
  }

  return {
    ...base,
    status: "failed",
    message: `'${config.fieldPath}' value (${actualValue}) must be ${label} ${config.value}`,
    suggestion: `Adjust the '${config.fieldPath}' value to be ${label} ${config.value}.`,
    details: { actualValue, expectedOperator: config.operator, expectedValue: config.value, source },
  };
}
