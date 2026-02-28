// KACHERI FRONTEND/src/components/negotiation/CounterproposalCard.tsx
// Compact card for displaying a stored AI-generated counterproposal.
//
// Shows mode badge, proposed text preview, rationale preview,
// and accept/discard buttons.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 14

import type { NegotiationCounterproposal, CounterproposalMode } from '../../types/negotiation';

type Props = {
  counterproposal: NegotiationCounterproposal;
  onAccept: (counterproposal: NegotiationCounterproposal) => void;
  disabled: boolean;
};

const MODE_LABELS: Record<CounterproposalMode, string> = {
  balanced: 'Balanced',
  favorable: 'Favorable',
  minimal_change: 'Minimal',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function CounterproposalCard({
  counterproposal,
  onAccept,
  disabled,
}: Props) {
  const isAccepted = counterproposal.accepted;

  return (
    <div className={`cp-card ${isAccepted ? 'accepted' : ''}`}>
      {/* Header: mode badge + timestamp */}
      <div className="cp-card-header">
        <span className={`cp-card-mode ${counterproposal.mode}`}>
          {MODE_LABELS[counterproposal.mode]}
        </span>
        {isAccepted && (
          <span className="cp-card-accepted-badge">Accepted</span>
        )}
        <span className="cp-card-time">
          {formatTimestamp(counterproposal.createdAt)}
        </span>
      </div>

      {/* Proposed text preview */}
      <div className="cp-card-text">{counterproposal.proposedText}</div>

      {/* Rationale preview */}
      {counterproposal.rationale && (
        <div className="cp-card-rationale">{counterproposal.rationale}</div>
      )}

      {/* Actions */}
      {!isAccepted && (
        <div className="cp-card-actions">
          <button
            className="cp-card-btn accept"
            onClick={() => onAccept(counterproposal)}
            disabled={disabled}
            title="Accept this counterproposal"
          >
            Accept
          </button>
        </div>
      )}
    </div>
  );
}
