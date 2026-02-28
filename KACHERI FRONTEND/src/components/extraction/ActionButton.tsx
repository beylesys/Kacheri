// KACHERI FRONTEND/src/components/extraction/ActionButton.tsx
// Small icon button for extraction actions (set reminder, flag for review).
//
// - reminder: opens ReminderDialog
// - flag_review: directly creates flag action via API
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 11

import { useState, useCallback } from 'react';
import { extractionApi } from '../../api/extraction.ts';
import ReminderDialog from './ReminderDialog.tsx';

type Props = {
  kind: 'reminder' | 'flag_review';
  docId: string;
  fieldPath: string;
  fieldValue?: unknown;
  onActionCreated: () => void;
};

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
}

export default function ActionButton({
  kind,
  docId,
  fieldPath,
  fieldValue,
  onActionCreated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  const handleFlag = useCallback(async () => {
    setLoading(true);
    try {
      await extractionApi.createAction(docId, {
        type: 'flag_review',
        field: fieldPath,
        config: {
          message: `Flagged "${formatLabel(fieldPath)}" for review`,
        },
      });
      onActionCreated();
    } catch {
      // Silently fail — actions panel will show current state
    } finally {
      setLoading(false);
    }
  }, [docId, fieldPath, onActionCreated]);

  const handleClick = useCallback(() => {
    if (kind === 'reminder') {
      setReminderOpen(true);
    } else {
      handleFlag();
    }
  }, [kind, handleFlag]);

  const handleReminderCreated = useCallback(() => {
    setReminderOpen(false);
    onActionCreated();
  }, [onActionCreated]);

  return (
    <>
      <button
        className="action-btn"
        onClick={handleClick}
        disabled={loading}
        title={kind === 'reminder' ? 'Set Reminder' : 'Flag for Review'}
      >
        {kind === 'reminder' ? '\u23F0' : '\u2691'}
      </button>

      {reminderOpen && (
        <ReminderDialog
          open={reminderOpen}
          docId={docId}
          fieldPath={fieldPath}
          fieldValue={fieldValue}
          onClose={() => setReminderOpen(false)}
          onCreated={handleReminderCreated}
        />
      )}
    </>
  );
}
