// KACHERI FRONTEND/src/components/negotiation/RoundTimeline.tsx
// Vertical timeline showing all rounds in a negotiation session.
//
// Displays round number, type badge, proposer, timestamp, and change count.
// Internal/external rounds distinguished by colored dots (blue/amber).
// Click a timeline item to expand its RoundCard inline.
//
// Follows NegotiationSessionCard.tsx and ExtractionSummaryCard.tsx patterns.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 12

import { useCallback } from 'react';
import type { RoundSummary, RoundType } from '../../types/negotiation';
import RoundCard from './RoundCard';
import './negotiation.css';

type Props = {
  sessionId: string;
  rounds: RoundSummary[];
  expandedRoundId: string | null;
  onExpandRound: (roundId: string | null) => void;
  onViewChanges: (roundId: string) => void;
  onCompareWithPrevious: (roundId: string) => void;
};

const TYPE_LABELS: Record<RoundType, string> = {
  initial_proposal: 'Initial',
  counterproposal: 'Counter',
  revision: 'Revision',
  final: 'Final',
};

/** Format ISO timestamp for display (pattern from ExtractionSummaryCard.tsx). */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function RoundTimeline({
  sessionId,
  rounds,
  expandedRoundId,
  onExpandRound,
  onViewChanges,
  onCompareWithPrevious,
}: Props) {
  const handleToggle = useCallback(
    (roundId: string) => {
      onExpandRound(expandedRoundId === roundId ? null : roundId);
    },
    [expandedRoundId, onExpandRound]
  );

  // Empty state
  if (rounds.length === 0) {
    return (
      <div className="round-timeline-empty">
        <div className="round-timeline-empty-icon">{'\uD83D\uDCC4'}</div>
        <div className="round-timeline-empty-text">
          No rounds yet. Import a counterparty&apos;s document or create a round
          from the current document to begin.
        </div>
      </div>
    );
  }

  return (
    <div className="round-timeline">
      {/* Vertical connector line */}
      <div className="round-timeline-line" />

      {rounds.map((round, idx) => {
        const isExpanded = expandedRoundId === round.id;
        const isFirstRound = round.roundNumber === 1;
        const itemClasses = [
          'round-timeline-item',
          round.proposedBy,
          isExpanded ? 'expanded' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={round.id} className={itemClasses}>
            {/* Dot */}
            <div className={`round-timeline-dot ${round.proposedBy}`} />

            {/* Clickable content */}
            <div
              className="round-timeline-content"
              onClick={() => handleToggle(round.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggle(round.id);
                }
              }}
              aria-expanded={isExpanded}
            >
              {/* Header: round number + type badge */}
              <div className="round-timeline-header">
                <span className="round-timeline-number">
                  Round {round.roundNumber}
                </span>
                <span className={`round-timeline-type ${round.roundType}`}>
                  {TYPE_LABELS[round.roundType]}
                </span>
              </div>

              {/* Meta: proposer + timestamp */}
              <div className="round-timeline-meta">
                <span>
                  {round.proposerLabel ||
                    (round.proposedBy === 'internal' ? 'You' : 'External')}
                </span>
                <span>{formatTimestamp(round.createdAt)}</span>
              </div>

              {/* Change count */}
              {round.changeCount > 0 && (
                <div className="round-timeline-changes">
                  {round.changeCount} change
                  {round.changeCount !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Expanded RoundCard */}
            {isExpanded && (
              <RoundCard
                sessionId={sessionId}
                round={round}
                onViewChanges={() => onViewChanges(round.id)}
                onCompareWithPrevious={() => onCompareWithPrevious(round.id)}
                isFirstRound={isFirstRound}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
