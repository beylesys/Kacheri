// KACHERI FRONTEND/src/components/negotiation/ChangeCard.tsx
// Individual negotiation change card with diff display, badges, and action buttons.
//
// Renders: section heading, category + risk badges, before/after diff,
// accept/reject/counter/analyze actions, and expandable AI analysis section.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 13

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  NegotiationChange,
  NegotiationSession,
  ChangeCategory,
  ChangeStatus,
} from '../../types/negotiation';
import { negotiationChangesApi } from '../../api/negotiations';
import RiskBadge from './RiskBadge';
import ChangeAnalysisPanel from './ChangeAnalysisPanel';

type Props = {
  change: NegotiationChange;
  sessionId: string;
  onStatusUpdated: (change: NegotiationChange, session: NegotiationSession) => void;
  onAnalyzed: (change: NegotiationChange) => void;
  onCounter: (changeId: string) => void;
  isTerminal: boolean;
  isFocused?: boolean;
};

const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  substantive: 'Substantive',
  editorial: 'Editorial',
  structural: 'Structural',
};

const STATUS_LABELS: Record<ChangeStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  countered: 'Countered',
};

export default function ChangeCard({
  change,
  sessionId,
  onStatusUpdated,
  onAnalyzed,
  onCounter,
  isTerminal,
  isFocused,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-focus and scroll into view when card becomes focused
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.focus();
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocused]);

  const isPending = change.status === 'pending';
  const actionsDisabled = isTerminal || !isPending;

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await negotiationChangesApi.updateStatus(sessionId, change.id, {
        status: 'accepted',
      });
      onStatusUpdated(res.change, res.session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept change');
    } finally {
      setAccepting(false);
    }
  }, [sessionId, change.id, onStatusUpdated]);

  const handleReject = useCallback(async () => {
    setRejecting(true);
    setError(null);
    try {
      const res = await negotiationChangesApi.updateStatus(sessionId, change.id, {
        status: 'rejected',
      });
      onStatusUpdated(res.change, res.session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject change');
    } finally {
      setRejecting(false);
    }
  }, [sessionId, change.id, onStatusUpdated]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await negotiationChangesApi.analyze(sessionId, change.id);
      onAnalyzed(res.change);
      setAnalysisExpanded(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
        setError('Rate limited. Please wait before analyzing more changes.');
      } else {
        setError(msg);
      }
    } finally {
      setAnalyzing(false);
    }
  }, [sessionId, change.id, onAnalyzed]);

  const toggleAnalysis = useCallback(() => {
    setAnalysisExpanded(prev => !prev);
  }, []);

  return (
    <div
      ref={cardRef}
      className={`change-card${isFocused ? ' change-card-focused' : ''}`}
      role="listitem"
      tabIndex={isFocused ? 0 : -1}
      aria-label={`${change.category} ${change.changeType} change, ${change.status}${change.riskLevel ? `, ${change.riskLevel} risk` : ''}`}
    >
      {/* Section heading */}
      {change.sectionHeading && (
        <div className="change-card-section">{change.sectionHeading}</div>
      )}

      {/* Badge row: category + risk + status (if resolved) */}
      <div className="change-card-badges">
        <span className={`change-card-category ${change.category}`}>
          {CATEGORY_LABELS[change.category]}
        </span>
        <RiskBadge level={change.riskLevel} />
        {!isPending && (
          <span className={`change-card-status ${change.status}`}>
            {STATUS_LABELS[change.status]}
          </span>
        )}
      </div>

      {/* Diff display */}
      <div className="change-card-diff">
        {change.originalText && (
          <div className="change-card-original">
            <del aria-label="Original text">{change.originalText}</del>
          </div>
        )}
        {change.proposedText && (
          <div className="change-card-proposed">
            <ins aria-label="Proposed text">{change.proposedText}</ins>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!actionsDisabled && (
        <div className="change-card-actions">
          <button
            className="change-card-action-btn accept"
            onClick={handleAccept}
            disabled={accepting || rejecting || analyzing}
            title="Accept this change"
            aria-label="Accept this change"
          >
            {accepting ? '...' : 'Accept'}
          </button>
          <button
            className="change-card-action-btn reject"
            onClick={handleReject}
            disabled={accepting || rejecting || analyzing}
            title="Reject this change"
            aria-label="Reject this change"
          >
            {rejecting ? '...' : 'Reject'}
          </button>
          <button
            className="change-card-action-btn counter"
            onClick={() => onCounter(change.id)}
            disabled={accepting || rejecting || analyzing}
            title="Generate counterproposal"
            aria-label="Generate counterproposal"
          >
            Counter
          </button>
          <button
            className="change-card-action-btn analyze"
            onClick={handleAnalyze}
            disabled={accepting || rejecting || analyzing}
            title={analyzing ? 'Running analysis' : 'Trigger AI analysis'}
            aria-label={analyzing ? 'Running analysis' : 'Trigger AI analysis'}
          >
            {analyzing ? '...' : 'Analyze'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="change-card-error">{error}</div>}

      {/* AI Analysis expandable section */}
      {change.aiAnalysis && (
        <>
          <button
            className="change-card-analysis-toggle"
            onClick={toggleAnalysis}
            aria-expanded={analysisExpanded}
          >
            <span
              className={`change-card-analysis-arrow ${analysisExpanded ? 'expanded' : ''}`}
            >
              {'\u25B6'}
            </span>
            AI Analysis
          </button>
          {analysisExpanded && (
            <ChangeAnalysisPanel
              analysis={change.aiAnalysis}
              changeId={change.id}
              onGenerateCounterproposal={onCounter}
              isTerminal={isTerminal}
            />
          )}
        </>
      )}
    </div>
  );
}
