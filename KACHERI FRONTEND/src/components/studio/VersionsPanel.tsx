// KACHERI FRONTEND/src/components/studio/VersionsPanel.tsx
// Canvas version history panel — slideout from right side.
// Create, list, and restore named version snapshots.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D7

import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { canvasApi } from '../../api/canvas';
import type { CanvasVersion, RestoreVersionResponse } from '../../types/canvas';
import { PromptDialog } from '../PromptDialog';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './versionsPanel.css';

/* ---------- Helpers ---------- */

function formatTime(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

function isAutoVersion(name: string): boolean {
  return name.startsWith('Auto:') || name.startsWith('auto:');
}

/* ---------- Types ---------- */

interface VersionsPanelProps {
  canvasId: string;
  open: boolean;
  onClose: () => void;
  onVersionRestored: (data: RestoreVersionResponse) => void;
}

/* ---------- Component ---------- */

function VersionsPanelInner({
  canvasId,
  open,
  onClose,
  onVersionRestored,
}: VersionsPanelProps) {
  // Data
  const [versions, setVersions] = useState<CanvasVersion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create version dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  // Restore confirmation
  const [restoreTarget, setRestoreTarget] = useState<CanvasVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  const restoreDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(restoreDialogRef, !!restoreTarget);

  // Fetch versions when panel opens
  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await canvasApi.listVersions(canvasId, { limit: 50 });
      setVersions(res.versions);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [canvasId]);

  useEffect(() => {
    if (open) {
      fetchVersions();
    }
  }, [open, fetchVersions]);

  // Create version
  const handleCreateVersion = useCallback(
    async (name?: string) => {
      if (!name?.trim()) return;
      setCreating(true);
      try {
        await canvasApi.createVersion(canvasId, { name: name.trim() });
        setShowCreateDialog(false);
        fetchVersions();
      } catch (err: any) {
        console.error('[VersionsPanel] Failed to create version:', err);
      } finally {
        setCreating(false);
      }
    },
    [canvasId, fetchVersions],
  );

  // Restore version — request
  const handleRestoreRequest = useCallback((version: CanvasVersion) => {
    setRestoreTarget(version);
  }, []);

  // Restore version — confirm
  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const data = await canvasApi.restoreVersion(canvasId, restoreTarget.id);
      onVersionRestored(data);
      setRestoreTarget(null);
      fetchVersions();
    } catch (err: any) {
      console.error('[VersionsPanel] Failed to restore version:', err);
    } finally {
      setRestoring(false);
    }
  }, [canvasId, restoreTarget, onVersionRestored, fetchVersions]);

  // Restore version — cancel
  const handleRestoreCancel = useCallback(() => {
    if (restoring) return;
    setRestoreTarget(null);
  }, [restoring]);

  // Escape to close restore dialog, or close panel
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (restoreTarget) {
          if (!restoring) setRestoreTarget(null);
        } else if (!showCreateDialog) {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, restoreTarget, restoring, showCreateDialog, onClose]);

  return (
    <>
      <div
        className={'canvas-versions-panel' + (open ? ' open' : '')}
        role="complementary"
        aria-label="Version history"
      >
        {/* Header */}
        <div className="canvas-versions-header">
          <span className="canvas-versions-title">Version History</span>
          <button
            className="canvas-versions-close"
            onClick={onClose}
            aria-label="Close version history"
            title="Close"
          >
            &#x2715;
          </button>
        </div>

        {/* Version List */}
        <div className="canvas-versions-list">
          {loading ? (
            <div className="canvas-versions-loading">
              <div className="canvas-versions-loading-spinner" />
              <span>Loading versions...</span>
            </div>
          ) : error ? (
            <div className="canvas-versions-error">
              <span className="canvas-versions-error-text">{error}</span>
              <button
                className="canvas-versions-error-retry"
                onClick={fetchVersions}
              >
                Retry
              </button>
            </div>
          ) : versions.length === 0 ? (
            <div className="canvas-versions-empty">
              <div className="canvas-versions-empty-icon" aria-hidden="true">
                &#x1F4CB;
              </div>
              <div className="canvas-versions-empty-title">No versions yet</div>
              <div className="canvas-versions-empty-desc">
                Versions are created automatically before AI edits. You can also
                create named versions manually.
              </div>
            </div>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="canvas-version-item">
                <div className="canvas-version-item-top">
                  <span className="canvas-version-item-name" title={v.name}>
                    {v.name}
                  </span>
                  {isAutoVersion(v.name) && (
                    <span className="canvas-version-item-badge">Auto</span>
                  )}
                </div>
                <div className="canvas-version-item-meta">
                  <span className="canvas-version-item-time">
                    {formatTime(v.createdAt)}
                  </span>
                  {v.createdBy && (
                    <>
                      <span aria-hidden="true">&middot;</span>
                      <span className="canvas-version-item-user">
                        {v.createdBy}
                      </span>
                    </>
                  )}
                </div>
                <div className="canvas-version-item-actions">
                  <button
                    className="canvas-version-item-btn canvas-version-item-btn--restore"
                    onClick={() => handleRestoreRequest(v)}
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))
          )}

          {!loading && !error && total > versions.length && (
            <div className="canvas-versions-loading" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                Showing {versions.length} of {total} versions
              </span>
            </div>
          )}
        </div>

        {/* Create Version Footer */}
        <div className="canvas-versions-create">
          <button
            className="canvas-versions-create-btn"
            onClick={() => setShowCreateDialog(true)}
            disabled={creating}
          >
            + Create Version
          </button>
        </div>
      </div>

      {/* Create Version Dialog (reuse PromptDialog) */}
      <PromptDialog
        open={showCreateDialog}
        mode="prompt"
        title="Save Version"
        description="Give this snapshot a name to identify it later."
        placeholder="e.g. Pre-client review"
        confirmLabel="Save"
        loading={creating}
        onConfirm={handleCreateVersion}
        onCancel={() => setShowCreateDialog(false)}
      />

      {/* Restore Confirmation Dialog */}
      {restoreTarget && (
        <div
          className="canvas-versions-restore-overlay"
          onClick={handleRestoreCancel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="canvas-restore-title"
        >
          <div
            ref={restoreDialogRef}
            className="canvas-versions-restore-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="canvas-versions-restore-header">
              <div
                className="canvas-versions-restore-title"
                id="canvas-restore-title"
              >
                Restore Version
              </div>
            </div>
            <div className="canvas-versions-restore-content">
              <div className="canvas-versions-restore-message">
                Are you sure you want to restore this canvas to{' '}
                <strong>{restoreTarget.name}</strong>?
              </div>
              <div className="canvas-versions-restore-info">
                This will replace all current frames with the version snapshot.
                A new auto-version of the current state will be created first.
              </div>
            </div>
            <div className="canvas-versions-restore-footer">
              <button
                className="canvas-versions-restore-btn canvas-versions-restore-btn--cancel"
                onClick={handleRestoreCancel}
                disabled={restoring}
              >
                Cancel
              </button>
              <button
                className="canvas-versions-restore-btn canvas-versions-restore-btn--confirm"
                onClick={handleRestoreConfirm}
                disabled={restoring}
              >
                {restoring ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const VersionsPanel = memo(VersionsPanelInner);
export default VersionsPanel;
