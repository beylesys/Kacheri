// KACHERI FRONTEND/src/components/compliance/PolicyViolation.tsx
// Displays a single policy result (violation, warning, or error) with severity styling.
//
// Severity styling:
//   info    -> blue border/bg
//   warning -> amber border/bg
//   error   -> red border/bg
//
// Follows AnomalyAlert pattern from extraction.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A9

import type { PolicyResult } from '../../types/compliance.ts';

type Props = {
  result: PolicyResult;
};

const SEVERITY_ICONS: Record<string, string> = {
  info: '\u2139',     // i
  warning: '\u26A0',  // warning sign
  error: '\u2716',    // x mark
};

const RULE_TYPE_LABELS: Record<string, string> = {
  text_match: 'Text Match',
  regex_pattern: 'Regex',
  required_section: 'Required Section',
  forbidden_term: 'Forbidden Term',
  numeric_constraint: 'Numeric',
  ai_check: 'AI Check',
};

export default function PolicyViolation({ result }: Props) {
  const icon = SEVERITY_ICONS[result.severity] ?? '\u2139';
  const ruleLabel = RULE_TYPE_LABELS[result.ruleType] ?? result.ruleType;

  return (
    <div className={`policy-violation ${result.severity}`}>
      <div className="policy-violation-header">
        <span className="policy-violation-severity">
          {icon} {result.severity}
        </span>
      </div>
      <div className="policy-violation-name">{result.policyName}</div>
      <div className="policy-violation-message">{result.message}</div>
      {result.suggestion && (
        <div className="policy-violation-suggestion">{result.suggestion}</div>
      )}
      {result.location && (
        <div className="policy-violation-location">{result.location}</div>
      )}
      <span className="policy-violation-rule-type">{ruleLabel}</span>
    </div>
  );
}
