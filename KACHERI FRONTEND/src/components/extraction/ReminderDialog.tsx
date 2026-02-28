// KACHERI FRONTEND/src/components/extraction/ReminderDialog.tsx
// Modal dialog for configuring a reminder on an extracted date field.
//
// Pre-fills date 14 days before the field value (or today if past).
// Pre-fills message with the field name.
// Creates reminder via extractionApi.createAction().
//
// Follows bk-modal dark theme pattern from promptDialog.css.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 11

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { extractionApi } from '../../api/extraction.ts';

type Props = {
  open: boolean;
  docId: string;
  fieldPath: string;
  fieldValue?: unknown;
  onClose: () => void;
  onCreated: () => void;
};

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ReminderDialog({
  open,
  docId,
  fieldPath,
  fieldValue,
  onClose,
  onCreated,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [reminderDate, setReminderDate] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize on open
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);

    // Pre-fill date: 14 days before fieldValue, or today
    if (typeof fieldValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fieldValue)) {
      const target = new Date(fieldValue);
      const offset = new Date(target.getTime() - 14 * 24 * 60 * 60 * 1000);
      const today = new Date();
      const prefill = offset > today ? offset : today;
      setReminderDate(toYMD(prefill));
    } else {
      // Default to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setReminderDate(toYMD(tomorrow));
    }

    setMessage(`Reminder for ${formatLabel(fieldPath)}`);
  }, [open, fieldValue, fieldPath]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent background scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSave = useCallback(async () => {
    if (!reminderDate) {
      setError('Reminder date is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await extractionApi.createAction(docId, {
        type: 'reminder',
        field: fieldPath,
        config: {
          reminderDate: new Date(reminderDate).toISOString(),
          message: message || undefined,
        },
      });
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create reminder');
    } finally {
      setSaving(false);
    }
  }, [reminderDate, message, docId, fieldPath, onCreated]);

  if (!open) return null;

  return (
    <div className="bk-modal-backdrop" onClick={onClose}>
      <div
        className="bk-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-dialog-title"
      >
        <div style={{ marginBottom: 16 }}>
          <h3 id="reminder-dialog-title" className="bk-modal-title">Set Reminder</h3>
          <p className="bk-modal-description">
            Create a reminder for: <strong>{formatLabel(fieldPath)}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="reminder-field-label">Reminder Date *</label>
            <input
              type="date"
              className="bk-modal-input"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
            />
          </div>

          <div>
            <label className="reminder-field-label">Message</label>
            <textarea
              className="bk-modal-input"
              rows={3}
              placeholder="Optional reminder message\u2026"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {error && (
          <div className="bk-modal-error" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <div className="bk-modal-actions" style={{ marginTop: 16 }}>
          <button
            className="bk-button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="bk-button bk-button-primary"
            onClick={handleSave}
            disabled={saving || !reminderDate}
          >
            {saving ? 'Creating\u2026' : 'Set Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}
