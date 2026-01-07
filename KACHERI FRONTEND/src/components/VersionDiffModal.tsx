// KACHERI FRONTEND/src/components/VersionDiffModal.tsx
// Modal to display diff between two document versions.

import { useState, useEffect } from 'react';
import { versionsApi, type VersionDiff, type DiffHunk } from '../api/versions';

type Props = {
  docId: string;
  versionId: number;
  compareWithId: number;
  onClose: () => void;
};

export function VersionDiffModal({
  docId,
  versionId,
  compareWithId,
  onClose,
}: Props) {
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDiff() {
      setLoading(true);
      setError(null);

      try {
        const result = await versionsApi.getDiff(docId, versionId, compareWithId);
        if (!cancelled) {
          setDiff(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load diff');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDiff();

    return () => {
      cancelled = true;
    };
  }, [docId, versionId, compareWithId]);

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const renderHunk = (hunk: DiffHunk, index: number) => {
    return (
      <div key={index} className="diff-hunk">
        <div className="diff-hunk-header">
          Line {hunk.lineStart}
        </div>
        <div className="diff-hunk-content">
          {hunk.content.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className={`diff-line diff-line-${hunk.type}`}
            >
              <span className="diff-line-prefix">
                {hunk.type === 'add' ? '+' : hunk.type === 'remove' ? '-' : ' '}
              </span>
              <span className="diff-line-text">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="diff-modal-overlay" onClick={onClose}>
      <div className="diff-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="diff-modal-header">
          <h3 className="diff-modal-title">
            Comparing v{diff?.fromVersion ?? '?'} to v{diff?.toVersion ?? '?'}
          </h3>
          <button className="diff-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Stats */}
        {diff && !loading && (
          <div className="diff-stats">
            <span className="diff-stat additions">+{diff.additions} lines</span>
            <span className="diff-stat deletions">-{diff.deletions} lines</span>
          </div>
        )}

        {/* Content */}
        <div className="diff-modal-content">
          {loading && (
            <div className="diff-loading">Loading diff...</div>
          )}

          {error && (
            <div className="diff-error">{error}</div>
          )}

          {!loading && !error && diff && (
            <>
              {diff.hunks.length === 0 ? (
                <div className="diff-no-changes">No changes between versions</div>
              ) : (
                <div className="diff-hunks">
                  {diff.hunks.map((hunk, index) => renderHunk(hunk, index))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="diff-modal-footer">
          <button className="diff-modal-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
