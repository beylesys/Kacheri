// KACHERI FRONTEND/src/components/negotiation/RedlineChangeMarker.tsx
// Gutter indicator for a change location in the RedlineView.
//
// Renders a colored circle representing a detected change. Color by category,
// outline ring by risk level. Clickable — scrolls to change position in the pane.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 15

import type { NegotiationChange, ChangeCategory, RiskLevel } from '../../types/negotiation';
import './negotiation.css';

type Props = {
  index: number;
  change: NegotiationChange;
  isActive: boolean;
  onClick: (index: number) => void;
};

const CATEGORY_COLORS: Record<ChangeCategory, string> = {
  substantive: '#f59e0b', // amber
  editorial: '#64748b',   // slate
  structural: '#8b5cf6',  // purple
};

const RISK_RING_COLORS: Record<RiskLevel, string> = {
  critical: '#ef4444', // red
  high: '#f97316',     // orange
  medium: '#eab308',   // yellow
  low: '#22c55e',      // green
};

export default function RedlineChangeMarker({ index, change, isActive, onClick }: Props) {
  const bgColor = CATEGORY_COLORS[change.category] ?? '#94a3b8';
  const ringColor = change.riskLevel ? RISK_RING_COLORS[change.riskLevel] : undefined;
  const tooltip = change.aiAnalysis?.summary
    ?? `${change.category} ${change.changeType}`;

  const classes = ['redline-marker', isActive ? 'active' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classes}
      onClick={() => onClick(index)}
      title={tooltip}
      aria-label={`Change ${index + 1}: ${tooltip}`}
      style={{
        '--marker-bg': bgColor,
        '--marker-ring': ringColor ?? 'transparent',
      } as React.CSSProperties}
    >
      <span className="redline-marker-dot" />
    </button>
  );
}
