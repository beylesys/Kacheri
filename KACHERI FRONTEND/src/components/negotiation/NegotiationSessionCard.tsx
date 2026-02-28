// KACHERI FRONTEND/src/components/negotiation/NegotiationSessionCard.tsx
// Compact card component for displaying a negotiation session.
//
// Shows counterparty name, status badge, round indicator, change stats,
// and a progress bar for resolution progress.
//
// Follows ClauseCard.tsx pattern.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 11

import type { NegotiationSession, NegotiationStatus } from '../../types/negotiation';

type Props = {
  session: NegotiationSession;
  onSelect: (nid: string) => void;
};

/** Human-readable status labels. */
const STATUS_LABELS: Record<NegotiationStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  awaiting_response: 'Awaiting',
  reviewing: 'Reviewing',
  settled: 'Settled',
  abandoned: 'Abandoned',
};

export default function NegotiationSessionCard({ session, onSelect }: Props) {
  const resolved = session.acceptedChanges + session.rejectedChanges;
  const total = session.totalChanges;
  const progressPct = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <div
      className="neg-card"
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
    >
      {/* Header: counterparty + status badge */}
      <div className="neg-card-header">
        <span className="neg-card-counterparty">{session.counterpartyName}</span>
        <span className={`neg-card-status ${session.status}`}>
          {STATUS_LABELS[session.status]}
        </span>
      </div>

      {/* Title */}
      <div className="neg-card-title" title={session.title}>{session.title}</div>

      {/* Change stats */}
      {total > 0 && (
        <div className="neg-card-stats">
          <span>
            <span className="neg-card-stat-value accepted">{session.acceptedChanges}</span> accepted
          </span>
          <span>
            <span className="neg-card-stat-value rejected">{session.rejectedChanges}</span> rejected
          </span>
          <span>
            <span className="neg-card-stat-value pending">{session.pendingChanges}</span> pending
          </span>
        </div>
      )}

      {/* Round indicator */}
      <div className="neg-card-round">
        Round {session.currentRound}{total > 0 ? ` \u00B7 ${total} change${total !== 1 ? 's' : ''}` : ''}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="neg-card-progress-bar">
          <div
            className="neg-card-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
