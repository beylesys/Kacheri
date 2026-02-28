// KACHERI FRONTEND/src/components/negotiation/CounterproposalModal.tsx
// Modal dialog for generating, viewing, editing, and accepting AI counterproposals.
//
// Shows original vs proposed text diff, mode selector (balanced/favorable/minimal_change),
// AI-generated compromise text (editable), rationale sections, clause library match,
// and list of past counterproposals.
//
// Follows CreateNegotiationDialog.tsx + ImportRoundDialog.tsx patterns.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 14

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  NegotiationChange,
  NegotiationSession,
  NegotiationCounterproposal,
  CounterproposalMode,
  ClauseMatchRef,
} from '../../types/negotiation';
import { negotiationChangesApi } from '../../api/negotiations';
import CounterproposalCard from './CounterproposalCard';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './negotiation.css';

type Props = {
  open: boolean;
  sessionId: string;
  change: NegotiationChange;
  onClose: () => void;
  onAccepted: (change: NegotiationChange, session: NegotiationSession) => void;
};

const MODE_DESCRIPTIONS: Record<CounterproposalMode, { label: string; desc: string }> = {
  balanced: {
    label: 'Balanced',
    desc: 'Fair compromise for both parties',
  },
  favorable: {
    label: 'Favorable',
    desc: 'Lean toward your original position',
  },
  minimal_change: {
    label: 'Minimal Change',
    desc: 'Smallest acceptable modification',
  },
};

const MODES: CounterproposalMode[] = ['balanced', 'favorable', 'minimal_change'];

export default function CounterproposalModal({
  open,
  sessionId,
  change,
  onClose,
  onAccepted,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // --- Mode ---
  const [selectedMode, setSelectedMode] = useState<CounterproposalMode>('balanced');

  // --- Generation state ---
  const [generating, setGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [rationale, setRationale] = useState('');
  const [clauseMatch, setClauseMatch] = useState<ClauseMatchRef | null>(null);
  const [hasResult, setHasResult] = useState(false);

  // --- Accept state ---
  const [accepting, setAccepting] = useState(false);

  // --- Past counterproposals ---
  const [pastProposals, setPastProposals] = useState<NegotiationCounterproposal[]>([]);
  const [loadingPast, setLoadingPast] = useState(false);

  // --- Errors ---
  const [error, setError] = useState<string | null>(null);

  // --- Reset on open ---
  useEffect(() => {
    if (open) {
      setSelectedMode('balanced');
      setGenerating(false);
      setGeneratedText('');
      setRationale('');
      setClauseMatch(null);
      setHasResult(false);
      setAccepting(false);
      setError(null);
      fetchPastProposals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, change.id]);

  // --- Fetch past counterproposals ---
  const fetchPastProposals = useCallback(async () => {
    setLoadingPast(true);
    try {
      const res = await negotiationChangesApi.listCounterproposals(sessionId, change.id);
      setPastProposals(res.counterproposals);
    } catch {
      // Non-critical — past proposals are supplementary
    } finally {
      setLoadingPast(false);
    }
  }, [sessionId, change.id]);

  // --- Generate counterproposal ---
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setHasResult(false);
    try {
      const res = await negotiationChangesApi.generateCounterproposal(
        sessionId,
        change.id,
        { mode: selectedMode }
      );
      setGeneratedText(res.counterproposal.proposedText);
      setRationale(res.counterproposal.rationale);
      setClauseMatch(res.clauseMatch);
      setHasResult(true);
      // Refresh past proposals to include the newly generated one
      fetchPastProposals();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate counterproposal';
      if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
        setError('Rate limited. Please wait before generating more counterproposals.');
      } else {
        setError(msg);
      }
    } finally {
      setGenerating(false);
    }
  }, [sessionId, change.id, selectedMode, fetchPastProposals]);

  // --- Accept counterproposal (updates change status to "countered") ---
  const handleAccept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await negotiationChangesApi.updateStatus(sessionId, change.id, {
        status: 'countered',
      });
      onAccepted(res.change, res.session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept counterproposal');
    } finally {
      setAccepting(false);
    }
  }, [sessionId, change.id, onAccepted]);

  // --- Accept a past counterproposal ---
  const handleAcceptPast = useCallback(async (_cp: NegotiationCounterproposal) => {
    setAccepting(true);
    setError(null);
    try {
      const res = await negotiationChangesApi.updateStatus(sessionId, change.id, {
        status: 'countered',
      });
      onAccepted(res.change, res.session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to accept counterproposal');
    } finally {
      setAccepting(false);
    }
  }, [sessionId, change.id, onAccepted]);

  // --- Keyboard / backdrop ---
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !generating && !accepting) {
      onClose();
    }
  }, [onClose, generating, accepting]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !generating && !accepting) {
      e.stopPropagation();
      onClose();
    }
  }, [onClose, generating, accepting]);

  if (!open) return null;

  const isBusy = generating || accepting;

  return (
    <div
      ref={dialogRef}
      className="cp-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cp-modal-title"
    >
      <div className="cp-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cp-header">
          <span id="cp-modal-title" className="cp-heading">
            Generate Counterproposal
          </span>
          <button
            className="cp-close"
            onClick={onClose}
            disabled={isBusy}
            title="Close"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Body */}
        <div className="cp-body">
          {/* Diff display: original vs proposed */}
          <div className="cp-diff-section">
            <div className="cp-diff-label">Current Change</div>
            <div className="cp-diff">
              {change.originalText && (
                <div className="cp-diff-original">
                  <del aria-label="Your original text">{change.originalText}</del>
                </div>
              )}
              {change.proposedText && (
                <div className="cp-diff-proposed">
                  <ins aria-label="Their proposed text">{change.proposedText}</ins>
                </div>
              )}
            </div>
          </div>

          {/* Mode selector */}
          <div className="cp-mode-section">
            <div className="cp-mode-label">Compromise Mode</div>
            <div className="cp-modes">
              {MODES.map(mode => (
                <button
                  key={mode}
                  className={`cp-mode-btn ${selectedMode === mode ? 'active' : ''}`}
                  onClick={() => setSelectedMode(mode)}
                  disabled={isBusy}
                  title={MODE_DESCRIPTIONS[mode].desc}
                >
                  <span className="cp-mode-btn-label">{MODE_DESCRIPTIONS[mode].label}</span>
                  <span className="cp-mode-btn-desc">{MODE_DESCRIPTIONS[mode].desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          {!hasResult && (
            <button
              className="cp-generate-btn"
              onClick={handleGenerate}
              disabled={isBusy}
            >
              {generating ? (
                <>
                  <span className="cp-spinner" />
                  Generating...
                </>
              ) : (
                'Generate Counterproposal'
              )}
            </button>
          )}

          {/* Loading spinner during generation */}
          {generating && !hasResult && (
            <div className="cp-generating">
              <span className="cp-spinner" />
              <span>Generating AI compromise language...</span>
            </div>
          )}

          {/* Result */}
          {hasResult && (
            <div className="cp-result">
              <div className="cp-result-label">Compromise Text</div>
              <textarea
                className="cp-result-textarea"
                value={generatedText}
                onChange={e => setGeneratedText(e.target.value)}
                disabled={accepting}
                rows={4}
                aria-label="Editable counterproposal text"
              />

              {/* Rationale */}
              {rationale && (
                <div className="cp-rationale">
                  <div className="cp-rationale-label">Rationale</div>
                  <div className="cp-rationale-text">{rationale}</div>
                </div>
              )}

              {/* Clause library match */}
              {clauseMatch && (
                <div className="cp-clause-match">
                  <span className="cp-clause-match-label">Clause Library Match:</span>
                  <span className="cp-clause-match-title">{clauseMatch.title}</span>
                  <span className="cp-clause-match-similarity">
                    {Math.round(clauseMatch.similarity * 100)}%
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="cp-result-actions">
                <button
                  className="cp-accept-btn"
                  onClick={handleAccept}
                  disabled={isBusy}
                >
                  {accepting ? 'Accepting...' : 'Accept Counterproposal'}
                </button>
                <button
                  className="cp-regenerate-btn"
                  onClick={handleGenerate}
                  disabled={isBusy}
                >
                  {generating ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="cp-error">{error}</div>
          )}

          {/* Past counterproposals */}
          {pastProposals.length > 0 && (
            <div className="cp-past-section">
              <div className="cp-past-label">
                Previous Counterproposals ({pastProposals.length})
              </div>
              {pastProposals.map(cp => (
                <CounterproposalCard
                  key={cp.id}
                  counterproposal={cp}
                  onAccept={handleAcceptPast}
                  disabled={isBusy}
                />
              ))}
            </div>
          )}

          {/* Loading past proposals */}
          {loadingPast && pastProposals.length === 0 && (
            <div className="cp-past-loading">Loading past counterproposals...</div>
          )}
        </div>

        {/* Footer */}
        <div className="cp-footer">
          <button
            className="cp-footer-btn ghost"
            onClick={onClose}
            disabled={isBusy}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
