// KACHERI FRONTEND/src/components/negotiation/RedlineView.tsx
// Full-width modal showing side-by-side redline comparison of two negotiation rounds.
//
// Left pane: Previous round (your version / prior proposal)
// Right pane: Current round (their version / incoming proposal)
// Optional center pane: Compromise version (togglable)
//
// Features:
//  - Synchronized scrolling between panes
//  - Changes highlighted inline (red=deleted, green=inserted, yellow=modified)
//  - Change markers in gutter (clickable → scrolls to change, shows analysis)
//  - Navigation controls: next/previous change, change counter
//  - Summary bar: total changes, by category, by risk level
//  - Keyboard: Escape=close, ArrowUp/Down=navigate changes
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 15

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type {
  NegotiationChange,
  NegotiationRound,
  RoundSummary,
  ChangeCategory,
  RiskLevel,
} from '../../types/negotiation';
import { negotiationRoundsApi, negotiationChangesApi } from '../../api/negotiations';
import RedlinePaneSide from './RedlinePaneSide';
import './negotiation.css';

type Props = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  roundId: string;
  rounds: RoundSummary[];
};

/** Sort changes by position for navigation. */
function sortByPosition(changes: NegotiationChange[]): NegotiationChange[] {
  return [...changes].sort((a, b) => a.fromPos - b.fromPos);
}

export default function RedlineView({
  open,
  onClose,
  sessionId,
  roundId,
  rounds,
}: Props) {
  // --- Data state ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevRound, setPrevRound] = useState<NegotiationRound | null>(null);
  const [currentRound, setCurrentRound] = useState<NegotiationRound | null>(null);
  const [changes, setChanges] = useState<NegotiationChange[]>([]);

  // --- UI state ---
  const [activeChangeIndex, setActiveChangeIndex] = useState(-1);
  const [showCompromise, setShowCompromise] = useState(false);

  // --- Refs ---
  const overlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(overlayRef, open);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  // Sorted changes for navigation
  const sortedChanges = useMemo(() => sortByPosition(changes), [changes]);

  // --- Summary stats ---
  const stats = useMemo(() => {
    const byCategory: Record<ChangeCategory, number> = { substantive: 0, editorial: 0, structural: 0 };
    const byRisk: Record<RiskLevel | 'unassessed', number> = { low: 0, medium: 0, high: 0, critical: 0, unassessed: 0 };
    for (const c of changes) {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
      const rk = c.riskLevel ?? 'unassessed';
      byRisk[rk] = (byRisk[rk] || 0) + 1;
    }
    return { total: changes.length, byCategory, byRisk };
  }, [changes]);

  // --- Identify rounds ---
  const currentRoundSummary = useMemo(
    () => rounds.find(r => r.id === roundId),
    [rounds, roundId]
  );

  const prevRoundSummary = useMemo(() => {
    if (!currentRoundSummary) return null;
    const currentNum = currentRoundSummary.roundNumber;
    // Find the round with the next-lower round number
    return rounds
      .filter(r => r.roundNumber < currentNum)
      .sort((a, b) => b.roundNumber - a.roundNumber)[0] ?? null;
  }, [rounds, currentRoundSummary]);

  // --- Fetch data ---
  useEffect(() => {
    if (!open || !currentRoundSummary || !prevRoundSummary) return;

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setActiveChangeIndex(-1);
      try {
        const [currentRes, prevRes, changesRes] = await Promise.all([
          negotiationRoundsApi.get(sessionId, currentRoundSummary.id),
          negotiationRoundsApi.get(sessionId, prevRoundSummary.id),
          negotiationChangesApi.list(sessionId, { roundId: currentRoundSummary.id, limit: 500 }),
        ]);
        if (cancelled) return;
        setCurrentRound(currentRes.round);
        setPrevRound(prevRes.round);
        setChanges(changesRes.changes);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load comparison data';
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [open, sessionId, currentRoundSummary, prevRoundSummary]);

  // --- Prevent body scroll ---
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // --- Auto-focus overlay on open (Slice 20) ---
  useEffect(() => {
    if (open && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [open]);

  // --- Synchronized scrolling ---
  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (isScrolling.current) return;
    isScrolling.current = true;

    const sourceRef = source === 'left' ? leftPaneRef : rightPaneRef;
    const targetRef = source === 'left' ? rightPaneRef : leftPaneRef;

    if (sourceRef.current && targetRef.current) {
      const maxScroll = sourceRef.current.scrollHeight - sourceRef.current.clientHeight;
      const ratio = maxScroll > 0 ? sourceRef.current.scrollTop / maxScroll : 0;
      const targetMax = targetRef.current.scrollHeight - targetRef.current.clientHeight;
      targetRef.current.scrollTop = ratio * targetMax;
    }

    // Release the flag after the current frame
    requestAnimationFrame(() => { isScrolling.current = false; });
  }, []);

  // --- Navigation ---
  const handlePrevChange = useCallback(() => {
    setActiveChangeIndex(prev => {
      const next = prev <= 0 ? sortedChanges.length - 1 : prev - 1;
      return next;
    });
  }, [sortedChanges.length]);

  const handleNextChange = useCallback(() => {
    setActiveChangeIndex(prev => {
      const next = prev >= sortedChanges.length - 1 ? 0 : prev + 1;
      return next;
    });
  }, [sortedChanges.length]);

  const handleMarkerClick = useCallback((index: number) => {
    setActiveChangeIndex(index);
  }, []);

  // Scroll to active change when it changes
  useEffect(() => {
    if (activeChangeIndex < 0) return;
    // Find the highlighted element in the left pane and scroll to it
    const el = leftPaneRef.current?.querySelector(
      `[data-change-index="${activeChangeIndex}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeChangeIndex]);

  // --- Keyboard handling ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevChange();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextChange();
      }
    },
    [onClose, handlePrevChange, handleNextChange]
  );

  // --- Compromise pane text ---
  const compromiseText = useMemo(() => {
    if (!showCompromise || !prevRound) return '';
    // Build compromise text: original text with accepted changes applied
    const sorted = sortByPosition(changes);
    let result = prevRound.snapshotText;
    let offset = 0;
    for (const change of sorted) {
      if (change.status === 'accepted' || change.status === 'countered') {
        const newText = change.proposedText ?? '';
        const from = change.fromPos + offset;
        const to = change.toPos + offset;
        result = result.slice(0, from) + newText + result.slice(to);
        offset += newText.length - (change.toPos - change.fromPos);
      }
    }
    return result;
  }, [showCompromise, prevRound, changes]);

  if (!open) return null;

  const roundLabel = currentRoundSummary
    ? `Round ${prevRoundSummary?.roundNumber ?? '?'} vs Round ${currentRoundSummary.roundNumber}`
    : 'Redline Comparison';

  return (
    <div
      ref={overlayRef}
      className="redline-view-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Redline comparison view"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Screen reader announcement for change navigation (Slice 20) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {activeChangeIndex >= 0 && sortedChanges[activeChangeIndex] &&
          `Viewing change ${activeChangeIndex + 1} of ${sortedChanges.length}: ${sortedChanges[activeChangeIndex].category} ${sortedChanges[activeChangeIndex].changeType}`
        }
      </div>

      <div className="redline-view-container">
        {/* Header */}
        <div className="redline-view-header">
          <div className="redline-view-title">{roundLabel}</div>

          {/* Navigation controls */}
          {sortedChanges.length > 0 && (
            <div className="redline-nav">
              <button
                className="redline-nav-btn"
                onClick={handlePrevChange}
                title="Previous change (Arrow Up)"
                aria-label="Previous change"
              >
                {'\u2191'}
              </button>
              <span className="redline-nav-counter">
                {activeChangeIndex >= 0
                  ? `${activeChangeIndex + 1} / ${sortedChanges.length}`
                  : `${sortedChanges.length} changes`}
              </span>
              <button
                className="redline-nav-btn"
                onClick={handleNextChange}
                title="Next change (Arrow Down)"
                aria-label="Next change"
              >
                {'\u2193'}
              </button>
            </div>
          )}

          {/* Compromise toggle */}
          <button
            className={`redline-view-toggle ${showCompromise ? 'active' : ''}`}
            onClick={() => setShowCompromise(prev => !prev)}
            title={showCompromise ? 'Hide compromise pane' : 'Show compromise pane'}
          >
            {showCompromise ? 'Hide Compromise' : 'Show Compromise'}
          </button>

          {/* Close button */}
          <button
            className="redline-view-close"
            onClick={onClose}
            title="Close (Escape)"
            aria-label="Close"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Summary bar */}
        {!loading && !error && (
          <div className="redline-summary-bar">
            <span className="redline-summary-chip total">
              {stats.total} change{stats.total !== 1 ? 's' : ''}
            </span>
            {stats.byCategory.substantive > 0 && (
              <span className="redline-summary-chip substantive">
                {stats.byCategory.substantive} substantive
              </span>
            )}
            {stats.byCategory.editorial > 0 && (
              <span className="redline-summary-chip editorial">
                {stats.byCategory.editorial} editorial
              </span>
            )}
            {stats.byCategory.structural > 0 && (
              <span className="redline-summary-chip structural">
                {stats.byCategory.structural} structural
              </span>
            )}
            <span className="redline-summary-divider" />
            {stats.byRisk.critical > 0 && (
              <span className="redline-summary-chip risk-critical">
                {stats.byRisk.critical} critical
              </span>
            )}
            {stats.byRisk.high > 0 && (
              <span className="redline-summary-chip risk-high">
                {stats.byRisk.high} high
              </span>
            )}
            {stats.byRisk.medium > 0 && (
              <span className="redline-summary-chip risk-medium">
                {stats.byRisk.medium} medium
              </span>
            )}
            {stats.byRisk.low > 0 && (
              <span className="redline-summary-chip risk-low">
                {stats.byRisk.low} low
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="redline-view-body">
          {/* Loading state */}
          {loading && (
            <div className="redline-view-loading">
              <div className="negotiation-skeleton">
                <div className="negotiation-skeleton-line long" />
                <div className="negotiation-skeleton-line medium" />
                <div className="negotiation-skeleton-line short" />
                <div className="negotiation-skeleton-line long" />
                <div className="negotiation-skeleton-line medium" />
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="redline-view-error">
              {error}
            </div>
          )}

          {/* Comparison panes */}
          {!loading && !error && prevRound && currentRound && (
            <div className={`redline-view-panes ${showCompromise ? 'three-pane' : ''}`}>
              {/* Left pane: previous round */}
              <RedlinePaneSide
                label={`Round ${prevRound.roundNumber} — ${prevRound.proposedBy === 'internal' ? 'Your Version' : 'Their Version'}`}
                text={prevRound.snapshotText}
                changes={sortedChanges}
                side="left"
                activeChangeIndex={activeChangeIndex}
                onMarkerClick={handleMarkerClick}
                ref={leftPaneRef}
              />

              {/* Optional center pane: compromise */}
              {showCompromise && (
                <div className="redline-pane compromise">
                  <div className="redline-pane-label">Compromise</div>
                  <div className="redline-pane-body">
                    <div className="redline-pane-content">
                      <pre className="redline-pane-text">{compromiseText}</pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Right pane: current round */}
              <RedlinePaneSide
                label={`Round ${currentRound.roundNumber} — ${currentRound.proposedBy === 'internal' ? 'Your Version' : 'Their Version'}`}
                text={currentRound.snapshotText}
                changes={sortedChanges}
                side="right"
                activeChangeIndex={activeChangeIndex}
                onMarkerClick={handleMarkerClick}
                ref={rightPaneRef}
              />
            </div>
          )}

          {/* No previous round edge case */}
          {!loading && !error && !prevRoundSummary && (
            <div className="redline-view-empty">
              This is the first round — there is no previous round to compare against.
            </div>
          )}
        </div>
      </div>

      {/* Attach scroll listeners to pane refs via effect */}
      <ScrollSyncEffect
        leftRef={leftPaneRef}
        rightRef={rightPaneRef}
        onScroll={handleScroll}
      />
    </div>
  );
}

/**
 * Invisible component that attaches scroll listeners to the pane refs.
 * This avoids passing onScroll directly to the forwarded-ref pane content divs.
 */
function ScrollSyncEffect({
  leftRef,
  rightRef,
  onScroll,
}: {
  leftRef: React.RefObject<HTMLDivElement | null>;
  rightRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (source: 'left' | 'right') => void;
}) {
  useEffect(() => {
    const leftEl = leftRef.current;
    const rightEl = rightRef.current;
    if (!leftEl || !rightEl) return;

    const handleLeft = () => onScroll('left');
    const handleRight = () => onScroll('right');
    leftEl.addEventListener('scroll', handleLeft, { passive: true });
    rightEl.addEventListener('scroll', handleRight, { passive: true });
    return () => {
      leftEl.removeEventListener('scroll', handleLeft);
      rightEl.removeEventListener('scroll', handleRight);
    };
  }, [leftRef, rightRef, onScroll]);

  return null;
}
