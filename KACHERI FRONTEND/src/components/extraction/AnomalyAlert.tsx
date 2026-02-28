// KACHERI FRONTEND/src/components/extraction/AnomalyAlert.tsx
// Displays a single anomaly with severity styling, message, and optional suggestion.
//
// Severity styling:
//   info    → blue border/bg
//   warning → amber border/bg
//   error   → red border/bg
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 9

import type { Anomaly } from '../../types/extraction.ts';

type Props = {
  anomaly: Anomaly;
};

const SEVERITY_ICONS: Record<string, string> = {
  info: '\u2139',     // ℹ
  warning: '\u26A0',  // ⚠
  error: '\u2716',    // ✖
};

export default function AnomalyAlert({ anomaly }: Props) {
  const icon = SEVERITY_ICONS[anomaly.severity] ?? '\u2139';
  return (
    <div className={`anomaly-alert ${anomaly.severity}`}>
      <div className="anomaly-alert-header">
        <span className="anomaly-alert-severity">
          {icon} {anomaly.severity}
        </span>
      </div>
      <div className="anomaly-alert-message">{anomaly.message}</div>
      {anomaly.suggestion && (
        <div className="anomaly-alert-suggestion">{anomaly.suggestion}</div>
      )}
    </div>
  );
}
