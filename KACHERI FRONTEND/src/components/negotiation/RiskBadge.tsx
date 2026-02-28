// KACHERI FRONTEND/src/components/negotiation/RiskBadge.tsx
// Reusable color-coded risk level indicator badge.
// Used by ChangeCard and ChangeAnalysisPanel.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 13

import type { RiskLevel } from '../../types/negotiation';

type Props = {
  level: RiskLevel | null;
};

const LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export default function RiskBadge({ level }: Props) {
  const label = level ? LABELS[level] ?? level : 'Unassessed';
  const cls = level ?? 'unassessed';

  return (
    <span className={`risk-badge ${cls}`} title={`Risk: ${label}`}>
      {label}
    </span>
  );
}
