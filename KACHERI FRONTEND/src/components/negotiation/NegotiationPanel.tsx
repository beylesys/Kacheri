// KACHERI FRONTEND/src/components/negotiation/NegotiationPanel.tsx
// Main sidebar panel for Negotiation sessions on the current document.
//
// Level 1: session list (active + terminal sessions with cards)
// Level 2: session detail (round timeline, import dialog, back navigation)
// Level 3: change list (filterable changes, AI analysis, bulk actions)
//
// Follows ExtractionPanel / CompliancePanel / ClauseLibraryPanel patterns.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slices 11 + 12 + 13

import { memo, useState, useEffect, useCallback, useRef } from 'react';
import type {
  NegotiationSession,
  NegotiationStatus,
  SessionDetailResponse,
  ImportRoundResponse,
} from '../../types/negotiation';
import { negotiationSessionsApi } from '../../api/negotiations';
import NegotiationSessionCard from './NegotiationSessionCard';
import CreateNegotiationDialog from './CreateNegotiationDialog';
import RoundTimeline from './RoundTimeline';
import ImportRoundDialog from './ImportRoundDialog';
import ChangeList from './ChangeList';
import RedlineView from './RedlineView';
import './negotiation.css';

/** Actions that can be triggered externally via command palette (Slice 16). */
export type NegotiationPanelAction = 'create' | 'import' | 'redline' | 'analyze' | null;

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  currentUserId?: string;
  /** When true, renders as embedded content (no fixed positioning). */
  embedded?: boolean;
  /** Navigate to the Proofs panel tab to view proof records. */
  onNavigateToProofs?: () => void;
  /** External action request (command palette / keyboard shortcut). */
  requestedAction?: NegotiationPanelAction;
  /** Called after the requested action has been handled (resets EditorPage state). */
  onActionHandled?: () => void;
};

/** Human-readable status labels (same as NegotiationSessionCard). */
const STATUS_LABELS: Record<NegotiationStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  awaiting_response: 'Awaiting',
  reviewing: 'Reviewing',
  settled: 'Settled',
  abandoned: 'Abandoned',
};

function NegotiationPanelInner({
  docId,
  open,
  onClose,
  refreshKey = 0,
  embedded = false,
  requestedAction = null,
  onActionHandled,
}: Props) {
  // --- Level 1: Session list state ---
  const [sessions, setSessions] = useState<NegotiationSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // --- Level 2: Session detail state ---
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // --- Level 3: Change list state ---
  const [viewingChangesForRound, setViewingChangesForRound] = useState<string | null>(null);

  // --- Level 1: Fetch sessions ---
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await negotiationSessionsApi.list(docId);
      setSessions(res.sessions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load negotiations';
      // 404 means no negotiations exist — not an error state
      if (msg.includes('404')) {
        setSessions([]);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (open || embedded) {
      fetchSessions();
    }
  }, [open, embedded, fetchSessions, refreshKey]);

  const handleSessionCreated = useCallback((session: NegotiationSession) => {
    setCreateDialogOpen(false);
    // Prepend the new session to the list
    setSessions(prev => [session, ...prev]);
  }, []);

  // --- Level 2: Session detail navigation ---
  const handleSelectSession = useCallback(async (nid: string) => {
    setSelectedSessionId(nid);
    setExpandedRoundId(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await negotiationSessionsApi.get(nid);
      setSessionDetail(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load session details';
      setDetailError(msg);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedSessionId(null);
    setSessionDetail(null);
    setDetailError(null);
    setExpandedRoundId(null);
    setImportDialogOpen(false);
    setViewingChangesForRound(null);
    setRedlineRoundId(null);
  }, []);

  // --- Level 2: Import completion ---
  const handleImported = useCallback((response: ImportRoundResponse) => {
    setImportDialogOpen(false);
    // Update session detail in-place: replace session + append new round
    setSessionDetail(prev =>
      prev
        ? {
            ...prev,
            session: response.session,
            rounds: [...prev.rounds, response.round],
          }
        : prev
    );
    // Also update the session in the list (so counts are correct when going back)
    setSessions(prev =>
      prev.map(s => (s.id === response.session.id ? response.session : s))
    );
  }, []);

  // --- Level 3: Change list navigation ---
  const handleViewChanges = useCallback((roundId: string) => {
    setViewingChangesForRound(roundId);
  }, []);

  const handleBackFromChanges = useCallback(() => {
    setViewingChangesForRound(null);
  }, []);

  const handleSessionUpdatedFromChanges = useCallback(
    (updatedSession: NegotiationSession) => {
      setSessionDetail(prev =>
        prev ? { ...prev, session: updatedSession } : prev
      );
      setSessions(prev =>
        prev.map(s => (s.id === updatedSession.id ? updatedSession : s))
      );
    },
    []
  );

  // --- Level 2: Redline comparison (Slice 15) ---
  const [redlineRoundId, setRedlineRoundId] = useState<string | null>(null);

  const handleCompareWithPrevious = useCallback((roundId: string) => {
    setRedlineRoundId(roundId);
  }, []);

  // --- External action handling (Slice 16: command palette / keyboard shortcut) ---
  // Two-phase approach: phase 1 sets up navigation, phase 2 executes action after detail loads.
  const pendingAction = useRef<'import' | 'redline' | 'analyze' | null>(null);

  // Phase 1: When requestedAction arrives, handle immediately (create) or navigate first
  useEffect(() => {
    if (!requestedAction) return;

    if (requestedAction === 'create') {
      setCreateDialogOpen(true);
      onActionHandled?.();
      return;
    }

    // For import/redline/analyze — need an active session
    const firstActive = sessions.find(s => !['settled', 'abandoned'].includes(s.status));
    if (!firstActive) {
      // No active session — just acknowledge the action
      onActionHandled?.();
      return;
    }

    // If already viewing this session's detail, execute directly
    if (selectedSessionId === firstActive.id && sessionDetail && !detailLoading) {
      executePendingAction(requestedAction, sessionDetail);
      onActionHandled?.();
      return;
    }

    // Otherwise, navigate to the session and defer action to phase 2
    pendingAction.current = requestedAction;
    handleSelectSession(firstActive.id);
    onActionHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedAction]);

  // Phase 2: When session detail loads and there's a pending action, execute it
  useEffect(() => {
    if (!pendingAction.current || !sessionDetail || detailLoading) return;
    executePendingAction(pendingAction.current, sessionDetail);
    pendingAction.current = null;
  }, [sessionDetail, detailLoading]);

  /** Execute the deferred action on the loaded session detail. */
  function executePendingAction(
    action: 'import' | 'redline' | 'analyze',
    detail: SessionDetailResponse,
  ) {
    if (action === 'import') {
      if (!['settled', 'abandoned'].includes(detail.session.status)) {
        setImportDialogOpen(true);
      }
    } else if (action === 'redline') {
      const latestRound = detail.rounds[detail.rounds.length - 1];
      if (latestRound && detail.rounds.length >= 2) {
        setRedlineRoundId(latestRound.id);
      }
    } else if (action === 'analyze') {
      const latestRound = detail.rounds[detail.rounds.length - 1];
      if (latestRound) {
        setViewingChangesForRound(latestRound.id);
      }
    }
  }

  // Separate active and terminal sessions
  const activeSessions = sessions.filter(s => !['settled', 'abandoned'].includes(s.status));
  const terminalSessions = sessions.filter(s => ['settled', 'abandoned'].includes(s.status));

  const panelClasses = [
    'negotiation-panel',
    open ? 'open' : '',
    embedded ? 'embedded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isTerminalSession =
    sessionDetail &&
    ['settled', 'abandoned'].includes(sessionDetail.session.status);

  return (
    <div className={panelClasses}>
      {/* Header — hidden when embedded in drawer */}
      {!embedded && (
        <div className="negotiation-header">
          <span className="negotiation-title">Negotiations</span>
          <button className="negotiation-close" onClick={onClose} title="Close">
            {'\u2715'}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="negotiation-content">
        {selectedSessionId === null ? (
          /* ===== Level 1: Session List View ===== */
          <>
            {/* Loading skeleton */}
            {loading && (
              <div className="negotiation-skeleton">
                <div className="negotiation-skeleton-line long" />
                <div className="negotiation-skeleton-line medium" />
                <div className="negotiation-skeleton-line short" />
                <div className="negotiation-skeleton-line long" />
                <div className="negotiation-skeleton-line medium" />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="negotiation-error">
                {error}
                <br />
                <button className="negotiation-error-retry" onClick={fetchSessions}>
                  Retry
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && sessions.length === 0 && (
              <div className="negotiation-empty">
                <div className="negotiation-empty-icon">{'\uD83E\uDD1D'}</div>
                <div className="negotiation-empty-text">
                  No active negotiations for this document. Start a negotiation to track
                  proposals, counterproposals, and AI-powered change analysis.
                </div>
                <button
                  className="negotiation-btn primary"
                  onClick={() => setCreateDialogOpen(true)}
                  style={{ width: 'auto', display: 'inline-block' }}
                >
                  Start Negotiation
                </button>
              </div>
            )}

            {/* Active sessions */}
            {!loading && activeSessions.length > 0 && (
              <>
                {activeSessions.map(session => (
                  <NegotiationSessionCard
                    key={session.id}
                    session={session}
                    onSelect={handleSelectSession}
                  />
                ))}
              </>
            )}

            {/* Terminal sessions (settled / abandoned) — collapsed section */}
            {!loading && terminalSessions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.05em',
                    marginBottom: 8,
                  }}
                >
                  Past ({terminalSessions.length})
                </div>
                {terminalSessions.map(session => (
                  <NegotiationSessionCard
                    key={session.id}
                    session={session}
                    onSelect={handleSelectSession}
                  />
                ))}
              </div>
            )}
          </>
        ) : viewingChangesForRound !== null ? (
          /* ===== Level 3: Change List View ===== */
          <>
            {/* Back button */}
            <button className="negotiation-back-btn" onClick={handleBackFromChanges}>
              {'\u2190'} Back to Rounds
            </button>

            <ChangeList
              sessionId={selectedSessionId}
              initialRoundId={viewingChangesForRound}
              rounds={sessionDetail?.rounds ?? []}
              onBack={handleBackFromChanges}
              onSessionUpdated={handleSessionUpdatedFromChanges}
              isTerminal={!!isTerminalSession}
            />
          </>
        ) : (
          /* ===== Level 2: Session Detail View ===== */
          <>
            {/* Back button */}
            <button className="negotiation-back-btn" onClick={handleBack}>
              {'\u2190'} Back to Sessions
            </button>

            {/* Detail loading */}
            {detailLoading && (
              <div className="negotiation-skeleton">
                <div className="negotiation-skeleton-line long" />
                <div className="negotiation-skeleton-line medium" />
                <div className="negotiation-skeleton-line short" />
              </div>
            )}

            {/* Detail error */}
            {detailError && (
              <div className="negotiation-error">
                {detailError}
                <br />
                <button
                  className="negotiation-error-retry"
                  onClick={() => handleSelectSession(selectedSessionId)}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Detail loaded */}
            {!detailLoading && !detailError && sessionDetail && (
              <>
                {/* Session header */}
                <div className="negotiation-detail-header">
                  <div
                    className="negotiation-detail-title"
                    title={sessionDetail.session.title}
                  >
                    {sessionDetail.session.title}
                  </div>
                  <div className="negotiation-detail-counterparty">
                    {sessionDetail.session.counterpartyName}
                    <span
                      className={`neg-card-status ${sessionDetail.session.status}`}
                    >
                      {STATUS_LABELS[sessionDetail.session.status]}
                    </span>
                  </div>
                </div>

                {/* Import button (only for non-terminal sessions) */}
                {!isTerminalSession && (
                  <button
                    className="negotiation-btn primary"
                    onClick={() => setImportDialogOpen(true)}
                    style={{ marginBottom: 12 }}
                  >
                    Import External Document
                  </button>
                )}

                {/* Round Timeline */}
                <RoundTimeline
                  sessionId={selectedSessionId}
                  rounds={sessionDetail.rounds}
                  expandedRoundId={expandedRoundId}
                  onExpandRound={setExpandedRoundId}
                  onViewChanges={handleViewChanges}
                  onCompareWithPrevious={handleCompareWithPrevious}
                />
              </>
            )}

            {/* Import Round Dialog */}
            <ImportRoundDialog
              open={importDialogOpen}
              onClose={() => setImportDialogOpen(false)}
              onImported={handleImported}
              sessionId={selectedSessionId}
            />
          </>
        )}
      </div>

      {/* Footer: Start Negotiation button (shown in list view when sessions exist) */}
      {selectedSessionId === null && !loading && sessions.length > 0 && (
        <div className="negotiation-footer">
          <button
            className="negotiation-btn primary"
            onClick={() => setCreateDialogOpen(true)}
          >
            Start Negotiation
          </button>
        </div>
      )}

      {/* Create Negotiation Dialog */}
      <CreateNegotiationDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleSessionCreated}
        docId={docId}
      />

      {/* Redline Comparison View (Slice 15) */}
      {redlineRoundId && selectedSessionId && sessionDetail && (
        <RedlineView
          open={redlineRoundId !== null}
          onClose={() => setRedlineRoundId(null)}
          sessionId={selectedSessionId}
          roundId={redlineRoundId}
          rounds={sessionDetail.rounds}
        />
      )}
    </div>
  );
}

export default memo(NegotiationPanelInner);
