// KACHERI FRONTEND/src/components/extraction/ConfidenceBadge.tsx
// Displays a confidence score (0–1) as a colored percentage badge.
//
// Color mapping:
//   >= 0.85  →  green  (high confidence)
//   >= 0.60  →  amber  (medium confidence)
//   <  0.60  →  red    (low confidence)
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 9

type Props = {
  confidence: number;
};

function getLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.60) return 'medium';
  return 'low';
}

export default function ConfidenceBadge({ confidence }: Props) {
  const level = getLevel(confidence);
  const pct = Math.round(confidence * 100);
  return (
    <span className={`confidence-badge ${level}`} title={`Confidence: ${pct}%`}>
      {pct}%
    </span>
  );
}
