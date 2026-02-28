// KACHERI FRONTEND/src/components/extraction/EditExtractionModal.tsx
// Modal for bulk editing all extracted fields + viewing correction history.
//
// Opens from "Edit All" button in ExtractionPanel.
// Lists all fields with type-appropriate inputs.
// Complex fields (objects/arrays) shown read-only.
// Sends all changes in one PATCH call.
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 10

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type {
  GetExtractionResponse,
  ExtractionCorrection,
} from '../../types/extraction.ts';
import { extractionApi } from '../../api/extraction.ts';
import ConfidenceBadge from './ConfidenceBadge.tsx';

type Props = {
  open: boolean;
  docId: string;
  data: GetExtractionResponse;
  corrections: ExtractionCorrection[];
  onClose: () => void;
  onSaved: () => void;
};

/** Fields skipped from editing (shown in summary card instead). */
const SKIP_FIELDS = new Set(['documentType']);

type ValueType = 'string' | 'number' | 'boolean' | 'date' | 'longtext' | 'complex';

function detectValueType(value: unknown): ValueType {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (value.length > 80) return 'longtext';
    return 'string';
  }
  return 'complex';
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function EditExtractionModal({
  open,
  docId,
  data,
  corrections,
  onClose,
  onSaved,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setEdits({});
      setError(null);
      setSaving(false);
      setShowHistory(false);
    }
  }, [open]);

  // Escape key handler
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

  // Build field list
  const fieldEntries: Array<{
    key: string;
    value: unknown;
    confidence?: number;
    valueType: ValueType;
  }> = [];
  if (data?.extraction) {
    for (const [key, value] of Object.entries(data.extraction)) {
      if (SKIP_FIELDS.has(key)) continue;
      const confidence =
        data.fieldConfidences != null ? data.fieldConfidences[key] : undefined;
      fieldEntries.push({ key, value, confidence, valueType: detectValueType(value) });
    }
  }

  const handleFieldChange = useCallback(
    (fieldPath: string, rawValue: string, valueType: ValueType) => {
      let coerced: unknown = rawValue;
      if (valueType === 'number') {
        const n = Number(rawValue);
        coerced = Number.isNaN(n) ? rawValue : n;
      }
      if (valueType === 'boolean') coerced = rawValue === 'true';
      setEdits((prev) => ({ ...prev, [fieldPath]: coerced }));
    },
    []
  );

  const handleSaveAll = useCallback(async () => {
    const changedKeys = Object.keys(edits);
    if (changedKeys.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await extractionApi.update(docId, { corrections: edits });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [edits, docId, onSaved, onClose]);

  const changedCount = Object.keys(edits).length;

  /** Get current value for a field (edited or original). */
  function getCurrentValue(key: string, originalValue: unknown): string {
    if (key in edits) {
      const v = edits[key];
      return v != null ? String(v) : '';
    }
    if (originalValue == null) return '';
    if (typeof originalValue === 'boolean') return originalValue ? 'true' : 'false';
    return String(originalValue);
  }

  if (!open) return null;

  return (
    <div className="bk-modal-backdrop" onClick={onClose}>
      <div
        className="edit-extraction-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-extraction-title"
      >
        {/* Header */}
        <div className="edit-extraction-header">
          <h3 id="edit-extraction-title" className="bk-modal-title">Edit Extracted Fields</h3>
          <p className="bk-modal-description">
            Document type: <strong style={{ textTransform: 'capitalize' }}>{data.documentType}</strong>
            {' '}&middot;{' '}
            {fieldEntries.length} fields
          </p>
        </div>

        {/* Scrollable field list */}
        <div className="edit-extraction-body">
          {fieldEntries.map((entry) => (
            <div key={entry.key} className="edit-extraction-field">
              <div className="edit-extraction-field-header">
                <label className="edit-extraction-label">{formatLabel(entry.key)}</label>
                {entry.confidence !== undefined && (
                  <ConfidenceBadge confidence={entry.confidence} />
                )}
              </div>
              {entry.valueType === 'complex' ? (
                <div className="edit-extraction-readonly">
                  {JSON.stringify(entry.value, null, 2)}
                </div>
              ) : entry.valueType === 'boolean' ? (
                <label className="field-editor-toggle">
                  <input
                    type="checkbox"
                    checked={getCurrentValue(entry.key, entry.value) === 'true'}
                    onChange={(e) =>
                      handleFieldChange(
                        entry.key,
                        e.target.checked ? 'true' : 'false',
                        'boolean'
                      )
                    }
                  />
                  <span>
                    {getCurrentValue(entry.key, entry.value) === 'true' ? 'Yes' : 'No'}
                  </span>
                </label>
              ) : entry.valueType === 'longtext' ? (
                <textarea
                  className="field-editor-textarea"
                  rows={3}
                  value={getCurrentValue(entry.key, entry.value)}
                  onChange={(e) =>
                    handleFieldChange(entry.key, e.target.value, entry.valueType)
                  }
                />
              ) : (
                <input
                  type={
                    entry.valueType === 'number'
                      ? 'number'
                      : entry.valueType === 'date'
                        ? 'date'
                        : 'text'
                  }
                  className="field-editor-input"
                  value={getCurrentValue(entry.key, entry.value)}
                  onChange={(e) =>
                    handleFieldChange(entry.key, e.target.value, entry.valueType)
                  }
                />
              )}
            </div>
          ))}
        </div>

        {/* Correction History */}
        {corrections.length > 0 && (
          <div className="edit-extraction-history">
            <button
              className="edit-extraction-history-toggle"
              onClick={() => setShowHistory(!showHistory)}
            >
              Correction History ({corrections.length}) {showHistory ? '\u25BE' : '\u25B8'}
            </button>
            {showHistory && (
              <ul className="edit-extraction-history-list">
                {corrections.map((c) => (
                  <li key={c.id} className="edit-extraction-history-item">
                    <span className="history-field">{formatLabel(c.fieldPath)}</span>
                    <span className="history-change">
                      {String(c.oldValue ?? '\u2014')} {'\u2192'} {String(c.newValue ?? '\u2014')}
                    </span>
                    <span className="history-meta">
                      by {c.correctedBy}, {formatTimestamp(c.correctedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Error */}
        {error && <div className="bk-modal-error" style={{ margin: '0 24px' }}>{error}</div>}

        {/* Actions */}
        <div className="edit-extraction-actions">
          <button
            className="extraction-btn ghost"
            onClick={onClose}
            disabled={saving}
            style={{ width: 'auto', padding: '6px 16px' }}
          >
            Cancel
          </button>
          <button
            className="extraction-btn primary"
            onClick={handleSaveAll}
            disabled={saving}
            style={{ width: 'auto', padding: '6px 16px' }}
          >
            {saving
              ? 'Saving\u2026'
              : changedCount > 0
                ? `Save ${changedCount} Change${changedCount > 1 ? 's' : ''}`
                : 'No Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
