// KACHERI FRONTEND/src/components/jaal/ResearchSessionControls.tsx
// Research session management — Slice S4 (Phase B)
//
// Start/stop sessions, view history, session actions.
// All session lifecycle calls go to backend API (S5).

import { useState, useEffect, useCallback } from 'react';
import { jaalApi } from '../../api/jaal';
import type { JaalSession } from '../../api/jaal';

/* ---------- Helpers ---------- */

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

/* ---------- Component ---------- */

interface ResearchSessionControlsProps {
  workspaceId: string | null;
  onSessionChange?: (session: JaalSession | null) => void;
}

export function ResearchSessionControls({
  workspaceId,
  onSessionChange,
}: ResearchSessionControlsProps) {
  const [activeSession, setActiveSession] = useState<JaalSession | null>(null);
  const [sessions, setSessions] = useState<JaalSession[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- Fetch session history ---- */

  const loadSessions = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const list = await jaalApi.listSessions();
      setSessions(list);

      // Check if there's an active (un-ended) session
      const active = list.find((s) => s.endedAt === null);
      if (active) {
        setActiveSession(active);
        onSessionChange?.(active);
      }
    } catch {
      // S5 not implemented — sessions will be empty
    }
  }, [workspaceId, onSessionChange]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  /* ---- Start session ---- */

  const startSession = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const session = await jaalApi.createSession(workspaceId);
      setActiveSession(session);
      setSessions((prev) => [session, ...prev]);
      onSessionChange?.(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onSessionChange]);

  /* ---- End session ---- */

  const endSession = useCallback(async () => {
    if (!activeSession) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await jaalApi.updateSession(activeSession.id, { ended: true });
      setActiveSession(null);
      setSessions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
      onSessionChange?.(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session');
    } finally {
      setLoading(false);
    }
  }, [activeSession, onSessionChange]);

  if (!workspaceId) {
    return (
      <div className="research-controls">
        <div className="jaal-empty">Select a workspace to start research sessions.</div>
      </div>
    );
  }

  return (
    <div className="research-controls" role="region" aria-label="Research sessions">
      {/* Active Session Status */}
      <div className={`research-session-status${activeSession ? ' active' : ''}`}>
        <span
          className={`research-session-indicator ${activeSession ? 'active' : 'inactive'}`}
          aria-hidden="true"
        />
        {activeSession ? (
          <div className="research-session-info">
            <span className="research-session-id" title={activeSession.id}>
              Session: {activeSession.id.slice(0, 16)}...
            </span>
            <span className="research-session-meta">
              {formatDuration(activeSession.startedAt, activeSession.endedAt)} ·{' '}
              {activeSession.actionCount} action{activeSession.actionCount !== 1 ? 's' : ''}
            </span>
          </div>
        ) : (
          <div className="research-session-info">
            <span className="research-session-id">No active session</span>
            <span className="research-session-meta">Start a session to begin research</span>
          </div>
        )}
      </div>

      {/* Session Controls */}
      <div className="guide-actions">
        {!activeSession ? (
          <button
            className="jaal-action-btn primary"
            onClick={startSession}
            disabled={loading}
            type="button"
          >
            {loading ? 'Starting...' : 'Start Session'}
          </button>
        ) : (
          <button
            className="jaal-action-btn"
            onClick={endSession}
            disabled={loading}
            type="button"
          >
            {loading ? 'Ending...' : 'End Session'}
          </button>
        )}
      </div>

      {/* Research Config */}
      <div className="guide-section">
        <div className="guide-section-title">Research Config</div>
        <div className="research-config">
          <div className="research-config-row">
            <span className="research-config-label">Engine</span>
            <select className="research-config-select" aria-label="Search engine">
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="startpage">Startpage</option>
              <option value="bing">Bing</option>
              <option value="google">Google</option>
            </select>
          </div>
          <div className="research-config-row">
            <span className="research-config-label">Depth</span>
            <select className="research-config-select" aria-label="Research depth">
              <option value="standard">Standard (15–20 pages)</option>
              <option value="deep">Deep Research (50+)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="jaal-error" role="alert">{error}</div>}

      {/* Session History */}
      <div className="guide-section">
        <div className="guide-section-title">
          History ({sessions.length})
        </div>
        {sessions.length === 0 ? (
          <div className="jaal-empty">No research sessions yet.</div>
        ) : (
          <div className="research-history">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`research-history-item${
                  selectedHistoryId === session.id ? ' selected' : ''
                }`}
                onClick={() =>
                  setSelectedHistoryId(
                    selectedHistoryId === session.id ? null : session.id,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedHistoryId(
                      selectedHistoryId === session.id ? null : session.id,
                    );
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={selectedHistoryId === session.id}
                aria-label={`Session from ${formatSessionDate(session.startedAt)}, ${session.actionCount} actions`}
              >
                <span
                  className={`research-session-indicator ${
                    session.endedAt === null ? 'active' : 'inactive'
                  }`}
                  aria-hidden="true"
                />
                <div className="research-session-info">
                  <span className="research-session-id" title={session.id}>
                    {session.id.slice(0, 16)}...
                  </span>
                  <span className="research-session-meta">
                    {formatSessionDate(session.startedAt)} ·{' '}
                    {formatDuration(session.startedAt, session.endedAt)}
                  </span>
                </div>
                <span className="research-history-actions">
                  {session.actionCount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
