// KACHERI FRONTEND/src/components/compliance/ComplianceBadge.tsx
// Compact status badge for compliance check state.
// Used inline in drawer tabs and toolbar (Slice A10).
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A9

import type { CheckStatus } from '../../types/compliance.ts';

type Props = {
  status: CheckStatus | 'unchecked';
  violations?: number;
  warnings?: number;
};

function badgeLabel(status: CheckStatus | 'unchecked', violations?: number, warnings?: number): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      if (violations && violations > 0) return `${violations}`;
      return 'Failed';
    case 'running':
    case 'pending':
      return '';
    case 'error':
      return 'Error';
    case 'unchecked':
      return '';
    default:
      return '';
  }
}

export default function ComplianceBadge({ status, violations, warnings }: Props) {
  const label = badgeLabel(status, violations, warnings);

  return (
    <span className={`compliance-badge ${status}`} title={`Compliance: ${status}`}>
      <span className="compliance-badge-dot" />
      {label && <span className="compliance-badge-label">{label}</span>}
    </span>
  );
}
