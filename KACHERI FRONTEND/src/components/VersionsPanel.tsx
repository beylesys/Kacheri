// KACHERI FRONTEND/src/components/VersionsPanel.tsx
// Main versions panel drawer for document version history.

import { useState, useCallback } from 'react';
import { useVersions, type VersionFilter } from '../hooks/useVersions';
import { versionsApi, type DocVersionMeta } from '../api/versions';
import { VersionItem } from './VersionItem';
import { VersionDiffModal } from './VersionDiffModal';
import { RestoreConfirmDialog } from './RestoreConfirmDialog';
import './versionsPanel.css';

type EditorApi = {
  getHTML?: () => string;
  getPlainText?: () => string;
  setHTML?: (html: string) => void;
};

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  editorApi: EditorApi | null;
  currentUserId?: string;
  onVersionCreated?: () => void;
  onVersionRestored?: () => void;
};

export function VersionsPanel({
  docId,
  open,
  onClose,
  refreshKey = 0,
  editorApi,
  currentUserId = '',
  onVersionCreated,
  onVersionRestored,
}: Props) {
  const { versions, loading, error, refetch, filterVersions, stats, latestVersion } =
    useVersions(docId, refreshKey);

  const [filter, setFilter] = useState<VersionFilter>('all');
  const [versionName, setVersionName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Diff modal state
  const [diffModal, setDiffModal] = useState<{
    versionId: number;
    compareWith: number;
  } | null>(null);

  // Restore dialog state
  const [restoreVersion, setRestoreVersion] = useState<DocVersionMeta | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Get user ID from localStorage if not provided
  const userId = currentUserId || (() => {
    try {
      return localStorage.getItem('devUser') || localStorage.getItem('userId') || 'unknown';
    } catch {
      return 'unknown';
    }
  })();

  const filteredVersions = filterVersions(filter);

  const handleCreateVersion = useCallback(async () => {
    if (submitting || !editorApi) return;

    const html = editorApi.getHTML?.() ?? '';
    const text = editorApi.getPlainText?.() ?? '';

    if (!html && !text) {
      console.warn('No content to save as version');
      return;
    }

    setSubmitting(true);
    try {
      // Calculate word count
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      const charCount = text.length;

      await versionsApi.create(docId, {
        name: versionName.trim() || undefined,
        snapshotHtml: html,
        snapshotText: text,
        metadata: { wordCount, charCount },
      });

      setVersionName('');
      onVersionCreated?.();
      refetch();
    } catch (err) {
      console.error('Failed to create version:', err);
    } finally {
      setSubmitting(false);
    }
  }, [docId, editorApi, versionName, submitting, onVersionCreated, refetch]);

  const handleCompare = useCallback((versionId: number, compareWith: number) => {
    setDiffModal({ versionId, compareWith });
  }, []);

  const handleRestoreRequest = useCallback((version: DocVersionMeta) => {
    setRestoreVersion(version);
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!restoreVersion || !editorApi?.setHTML) return;

    setRestoring(true);
    try {
      const result = await versionsApi.restore(docId, {
        fromVersionId: restoreVersion.id,
        backupName: `Backup before restoring to v${restoreVersion.versionNumber}`,
      });

      // Apply restored content to editor
      editorApi.setHTML(result.snapshotHtml);

      setRestoreVersion(null);
      onVersionRestored?.();
      refetch();
    } catch (err) {
      console.error('Failed to restore version:', err);
    } finally {
      setRestoring(false);
    }
  }, [docId, restoreVersion, editorApi, onVersionRestored, refetch]);

  const handleRestoreCancel = useCallback(() => {
    if (!restoring) {
      setRestoreVersion(null);
    }
  }, [restoring]);

  return (
    <>
      {/* Main panel */}
      <div
        className={`versions-panel ${open ? 'open' : ''}`}
        role="complementary"
        aria-label="Version History"
        aria-expanded={open}
      >
        {/* Header */}
        <div className="versions-header">
          <div className="versions-title">Version History</div>
          <button className="versions-close" onClick={onClose} title="Close">
            x
          </button>
        </div>

        {/* Filter tabs */}
        <div className="versions-tabs">
          <button
            className={`versions-tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All<span className="versions-tab-count">({stats.total})</span>
          </button>
          <button
            className={`versions-tab-btn ${filter === 'named' ? 'active' : ''}`}
            onClick={() => setFilter('named')}
          >
            Named<span className="versions-tab-count">({stats.named})</span>
          </button>
          <button
            className={`versions-tab-btn ${filter === 'unnamed' ? 'active' : ''}`}
            onClick={() => setFilter('unnamed')}
          >
            Unnamed<span className="versions-tab-count">({stats.unnamed})</span>
          </button>
        </div>

        {/* Version list */}
        <div className="versions-list">
          {loading && <div className="versions-loading">Loading versions...</div>}

          {error && <div className="versions-error">{error}</div>}

          {!loading && !error && filteredVersions.length === 0 && (
            <div className="versions-empty">
              {filter === 'all'
                ? 'No versions yet. Save a version to track changes.'
                : filter === 'named'
                ? 'No named versions.'
                : 'No unnamed versions.'}
            </div>
          )}

          {!loading &&
            !error &&
            filteredVersions.map((version) => (
              <VersionItem
                key={version.id}
                version={version}
                allVersions={versions}
                isLatest={latestVersion?.id === version.id}
                currentUserId={userId}
                onRefresh={refetch}
                onCompare={handleCompare}
                onRestore={handleRestoreRequest}
              />
            ))}
        </div>

        {/* Create version section */}
        <div className="versions-create-section">
          <div className="versions-create-header">Save New Version</div>
          <div className="version-input-wrapper">
            <input
              type="text"
              className="version-name-input"
              placeholder="Version name (optional)"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateVersion();
                }
              }}
            />
          </div>
          <div className="version-input-actions">
            <button
              className="version-submit-btn primary"
              onClick={handleCreateVersion}
              disabled={submitting || !editorApi}
            >
              {submitting ? 'Saving...' : 'Save Version'}
            </button>
          </div>
        </div>
      </div>

      {/* Diff Modal */}
      {diffModal && (
        <VersionDiffModal
          docId={docId}
          versionId={diffModal.versionId}
          compareWithId={diffModal.compareWith}
          onClose={() => setDiffModal(null)}
        />
      )}

      {/* Restore Confirm Dialog */}
      {restoreVersion && (
        <RestoreConfirmDialog
          version={restoreVersion}
          onConfirm={handleRestoreConfirm}
          onCancel={handleRestoreCancel}
          restoring={restoring}
        />
      )}
    </>
  );
}
