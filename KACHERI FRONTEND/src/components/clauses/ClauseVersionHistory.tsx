// KACHERI FRONTEND/src/components/clauses/ClauseVersionHistory.tsx
// Clause version history: list versions, view content, compare (diff), and restore.
//
// Reuses existing API client from api/clauses.ts (listVersions, getVersion, update).
// Restore creates a new version (append-only) via PATCH.
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B13

import { useState, useEffect, useCallback } from 'react';
import type { Clause, ClauseVersion } from '../../types/clause';
import { clausesApi } from '../../api/clauses';

type Props = {
  /** The current clause being previewed */
  clause: Clause;
  /** Called after a successful restore so parent can refresh clause data */
  onClauseUpdated?: () => void;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ClauseVersionHistory({ clause, onClauseUpdated }: Props) {
  const [versions, setVersions] = useState<ClauseVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected version for content viewing
  const [selectedVersion, setSelectedVersion] = useState<ClauseVersion | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Diff mode: compare a version against current
  const [diffVersion, setDiffVersion] = useState<ClauseVersion | null>(null);

  // Restore state
  const [restoring, setRestoring] = useState(false);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await clausesApi.listVersions(clause.workspaceId, clause.id);
      setVersions(res.versions);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [clause.workspaceId, clause.id]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Reset selections when clause changes
  useEffect(() => {
    setSelectedVersion(null);
    setDiffVersion(null);
  }, [clause.id]);

  const handleViewVersion = useCallback(
    async (version: ClauseVersion) => {
      // If already selected, deselect
      if (selectedVersion?.id === version.id) {
        setSelectedVersion(null);
        setDiffVersion(null);
        return;
      }
      setDiffVersion(null);
      setLoadingContent(true);
      try {
        const res = await clausesApi.getVersion(
          clause.workspaceId,
          clause.id,
          version.version
        );
        setSelectedVersion(res.version);
      } catch {
        setSelectedVersion(version); // fallback to list data
      } finally {
        setLoadingContent(false);
      }
    },
    [clause.workspaceId, clause.id, selectedVersion]
  );

  const handleDiff = useCallback(
    async (version: ClauseVersion) => {
      // Toggle diff off
      if (diffVersion?.id === version.id) {
        setDiffVersion(null);
        return;
      }
      setLoadingContent(true);
      try {
        const res = await clausesApi.getVersion(
          clause.workspaceId,
          clause.id,
          version.version
        );
        setDiffVersion(res.version);
        setSelectedVersion(null);
      } catch {
        setDiffVersion(version); // fallback
      } finally {
        setLoadingContent(false);
      }
    },
    [clause.workspaceId, clause.id, diffVersion]
  );

  const handleRestore = useCallback(
    async (version: ClauseVersion) => {
      const confirmed = window.confirm(
        `Restore clause to version ${version.version}?\n\nThis will create a new version with the content from v${version.version}. The current content will still be available in version history.`
      );
      if (!confirmed) return;

      setRestoring(true);
      try {
        await clausesApi.update(clause.workspaceId, clause.id, {
          contentHtml: version.contentHtml,
          contentText: version.contentText,
          changeNote: `Restored from v${version.version}`,
        });
        setSelectedVersion(null);
        setDiffVersion(null);
        onClauseUpdated?.();
        await fetchVersions();
      } catch (err: any) {
        alert(err?.message ?? 'Failed to restore version');
      } finally {
        setRestoring(false);
      }
    },
    [clause.workspaceId, clause.id, onClauseUpdated, fetchVersions]
  );

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <div className="clause-version-history">
        <div className="clause-version-loading">Loading version history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="clause-version-history">
        <div className="clause-version-error">
          {error}
          <button className="clause-version-error-retry" onClick={fetchVersions}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (versions.length <= 1) {
    return (
      <div className="clause-version-history">
        <div className="clause-version-empty">
          No version history available. Edit the clause to create new versions.
        </div>
      </div>
    );
  }

  return (
    <div className="clause-version-history">
      {/* Version list */}
      <div className="clause-version-list">
        {versions.map((v) => {
          const isCurrent = v.version === clause.version;
          const isSelected = selectedVersion?.id === v.id;
          const isDiffing = diffVersion?.id === v.id;

          return (
            <div
              key={v.id}
              className={[
                'clause-version-item',
                isCurrent ? 'current' : '',
                isSelected || isDiffing ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="clause-version-item-header">
                <span className="clause-version-number">
                  v{v.version}
                  {isCurrent && (
                    <span className="clause-version-current-badge">current</span>
                  )}
                </span>
                <span className="clause-version-date">{formatDate(v.createdAt)}</span>
              </div>

              <div className="clause-version-item-meta">
                <span className="clause-version-author">{v.createdBy}</span>
                {v.changeNote && (
                  <span className="clause-version-note">{v.changeNote}</span>
                )}
              </div>

              <div className="clause-version-item-actions">
                <button
                  className="clause-version-btn view"
                  onClick={() => handleViewVersion(v)}
                  disabled={loadingContent}
                >
                  {isSelected ? 'Hide' : 'View'}
                </button>
                {!isCurrent && (
                  <>
                    <button
                      className="clause-version-btn diff"
                      onClick={() => handleDiff(v)}
                      disabled={loadingContent}
                    >
                      {isDiffing ? 'Close Diff' : 'Compare'}
                    </button>
                    <button
                      className="clause-version-btn restore"
                      onClick={() => handleRestore(v)}
                      disabled={restoring || loadingContent}
                    >
                      {restoring ? 'Restoring...' : 'Restore'}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail area: version content view */}
      {selectedVersion && !diffVersion && (
        <div className="clause-version-detail">
          <div className="clause-version-detail-header">
            Version {selectedVersion.version} content
          </div>
          <div className="clause-version-detail-content">
            {selectedVersion.contentText || '(empty)'}
          </div>
        </div>
      )}

      {/* Detail area: diff view */}
      {diffVersion && (
        <div className="clause-version-detail">
          <div className="clause-version-detail-header">
            Comparing v{diffVersion.version} with current (v{clause.version})
          </div>
          <div className="clause-version-diff">
            <div className="clause-version-diff-panel">
              <div className="clause-version-diff-label">
                Version {diffVersion.version}
              </div>
              <textarea
                className="clause-version-diff-text"
                readOnly
                value={diffVersion.contentText || '(empty)'}
              />
            </div>
            <div className="clause-version-diff-panel">
              <div className="clause-version-diff-label">
                Current (v{clause.version})
              </div>
              <textarea
                className="clause-version-diff-text"
                readOnly
                value={clause.contentText || '(empty)'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
