// KACHERI FRONTEND/src/components/compliance/ComplianceResultCard.tsx
// Summary card showing compliance check status, counts, and timestamp.
//
// Follows ExtractionSummaryCard pattern.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice A9

import type { GetLatestCheckResponse } from '../../types/compliance.ts';

type Props = {
  data: GetLatestCheckResponse;
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  auto_save: 'Auto',
  pre_export: 'Pre-Export',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ComplianceResultCard({ data }: Props) {
  const overallStatus = data.status === 'passed' ? 'passed' : data.status === 'failed' ? 'failed' : 'error';
  const statusIcon = overallStatus === 'passed' ? '\u2714' : overallStatus === 'failed' ? '\u2716' : '\u26A0';
  const statusLabel = overallStatus === 'passed' ? 'All Checks Passed' : overallStatus === 'failed' ? 'Issues Found' : 'Check Error';

  const triggerLabel = TRIGGER_LABELS[data.triggeredBy] ?? data.triggeredBy;
  const timestamp = data.completedAt ?? data.createdAt;

  return (
    <div className="compliance-result-card">
      <div className="compliance-result-card-row">
        <span className={`compliance-result-status ${overallStatus}`}>
          {statusIcon} {statusLabel}
        </span>
        <span className="compliance-result-trigger">{triggerLabel}</span>
      </div>
      <div className="compliance-result-card-row">
        <span className="compliance-result-timestamp">
          {formatTimestamp(timestamp)}
        </span>
      </div>
      <div className="compliance-stats">
        <span className="compliance-stat">
          <span className="compliance-stat-value">{data.passed}</span>/{data.totalPolicies} passed
        </span>
        {data.violations > 0 && (
          <span className="compliance-stat" style={{ color: '#fecaca' }}>
            <span className="compliance-stat-value">{data.violations}</span> violations
          </span>
        )}
        {data.warnings > 0 && (
          <span className="compliance-stat" style={{ color: '#fde047' }}>
            <span className="compliance-stat-value">{data.warnings}</span> warnings
          </span>
        )}
      </div>
    </div>
  );
}
