// KACHERI FRONTEND/src/components/negotiation/RoundCard.tsx
// Detailed view of a single negotiation round, rendered inline in the timeline.
//
// Shows: type badge, proposer, import source, notes (read-only),
// action buttons (View Changes, Compare with Previous),
// and an expandable snapshot preview.
//
// Follows NegotiationSessionCard.tsx pattern.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 12

import { useState, useEffect, useCallback } from 'react';
import type { RoundSummary, RoundType, NegotiationRound, ChangeSummary } from '../../types/negotiation';
import { negotiationRoundsApi } from '../../api/negotiations';
import { sanitizeHtml } from '../../utils/sanitize';
import './negotiation.css';

type Props = {
  sessionId: string;
  round: RoundSummary;
  onViewChanges: () => void;
  onCompareWithPrevious: () => void;
  /** When true, "Compare with Previous" button is hidden (no previous round). */
  isFirstRound: boolean;
};

const TYPE_LABELS: Record<RoundType, string> = {
  initial_proposal: 'Initial Proposal',
  counterproposal: 'Counterproposal',
  revision: 'Revision',
  final: 'Final',
};

export default function RoundCard({
  sessionId,
  round,
  onViewChanges,
  onCompareWithPrevious,
  isFirstRound,
}: Props) {
  const [detail, setDetail] = useState<NegotiationRound | null>(null);
  const [changeSummary, setChangeSummary] = useState<ChangeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotExpanded, setSnapshotExpanded] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await negotiationRoundsApi.get(sessionId, round.id);
      setDetail(res.round);
      setChangeSummary(res.changeSummary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load round details';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [sessionId, round.id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return (
    <div className="round-card">
      {/* Loading state */}
      {loading && (
        <div className="round-card-loading">Loading round details...</div>
      )}

      {/* Error state */}
      {error && (
        <div className="round-card-error">
          {error}
          <br />
          <button className="round-card-error-retry" onClick={fetchDetail}>
            Retry
          </button>
        </div>
      )}

      {/* Loaded content */}
      {!loading && !error && (
        <>
          {/* Metadata */}
          <div className="round-card-meta">
            <div className="round-card-meta-row">
              <span className="round-card-label">Type</span>
              <span className={`round-card-type-badge ${round.roundType}`}>
                {TYPE_LABELS[round.roundType]}
              </span>
            </div>
            <div className="round-card-meta-row">
              <span className="round-card-label">Proposer</span>
              <span>
                {round.proposerLabel || (round.proposedBy === 'internal' ? 'You' : 'External')}
              </span>
            </div>
            {round.importSource && (
              <div className="round-card-meta-row">
                <span className="round-card-label">Source</span>
                <span>{round.importSource}</span>
              </div>
            )}
          </div>

          {/* Notes (read-only) */}
          <div className="round-card-notes">
            <span className="round-card-label">Notes</span>
            <span className="round-card-notes-text">
              {round.notes || 'No notes for this round.'}
            </span>
          </div>

          {/* Change summary (if detail loaded) */}
          {changeSummary && (
            <div className="round-card-change-summary">
              <span>{round.changeCount} change{round.changeCount !== 1 ? 's' : ''}</span>
              {round.changeCount > 0 && (
                <span className="round-card-change-breakdown">
                  <span className="round-card-change-stat accepted">{changeSummary.accepted} accepted</span>
                  <span className="round-card-change-stat rejected">{changeSummary.rejected} rejected</span>
                  <span className="round-card-change-stat pending">{changeSummary.pending} pending</span>
                </span>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="round-card-actions">
            <button
              className="round-card-btn primary"
              onClick={onViewChanges}
            >
              View Changes
            </button>
            {!isFirstRound && (
              <button
                className="round-card-btn ghost"
                onClick={onCompareWithPrevious}
              >
                Compare with Previous
              </button>
            )}
          </div>

          {/* Snapshot preview (collapsed / expandable) */}
          {detail?.snapshotHtml && (
            <div className="round-card-snapshot">
              <button
                className="round-card-snapshot-toggle"
                onClick={() => setSnapshotExpanded(prev => !prev)}
              >
                {snapshotExpanded ? 'Hide Preview' : 'Show Preview'}
              </button>
              {snapshotExpanded && (
                <div
                  className="round-card-snapshot-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.snapshotHtml) }}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
