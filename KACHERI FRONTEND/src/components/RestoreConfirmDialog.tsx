// KACHERI FRONTEND/src/components/RestoreConfirmDialog.tsx
// Confirmation dialog for restoring a document to a previous version.

import { useEffect } from 'react';
import type { DocVersionMeta } from '../api/versions';

type Props = {
  version: DocVersionMeta;
  onConfirm: () => void;
  onCancel: () => void;
  restoring: boolean;
};

export function RestoreConfirmDialog({
  version,
  onConfirm,
  onCancel,
  restoring,
}: Props) {
  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !restoring) {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, restoring]);

  const versionLabel = version.name
    ? `"${version.name}" (v${version.versionNumber})`
    : `version v${version.versionNumber}`;

  return (
    <div className="restore-dialog-overlay" onClick={restoring ? undefined : onCancel}>
      <div className="restore-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="restore-dialog-header">
          <h3 className="restore-dialog-title">Restore Version?</h3>
        </div>

        {/* Content */}
        <div className="restore-dialog-content">
          <p className="restore-dialog-message">
            Restore document to {versionLabel}?
          </p>
          <p className="restore-dialog-info">
            Your current content will be automatically backed up before restoring.
          </p>
        </div>

        {/* Footer */}
        <div className="restore-dialog-footer">
          <button
            className="restore-dialog-btn cancel"
            onClick={onCancel}
            disabled={restoring}
          >
            Cancel
          </button>
          <button
            className="restore-dialog-btn confirm"
            onClick={onConfirm}
            disabled={restoring}
          >
            {restoring ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}
