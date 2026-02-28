// KACHERI FRONTEND/src/components/extraction/FieldEditor.tsx
// Wraps FieldDisplay with inline editing capability.
//
// Show mode: renders FieldDisplay + pencil edit button + action buttons
// Edit mode: type-appropriate input + Save/Cancel
// Saves corrections via extractionApi.update()
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 10

import { useState, useCallback } from 'react';
import type { GetExtractionResponse } from '../../types/extraction.ts';
import { extractionApi } from '../../api/extraction.ts';
import FieldDisplay from './FieldDisplay.tsx';
import ActionButton from './ActionButton.tsx';

type ValueType = 'string' | 'number' | 'boolean' | 'date' | 'longtext' | 'complex';

type Props = {
  fieldPath: string;
  label: string;
  value: unknown;
  confidence?: number;
  docId: string;
  wasCorrected?: boolean;
  onSaved: () => void;
  onActionCreated?: () => void;
  depth?: number;
};

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

function coerceValue(editValue: string, valueType: ValueType): unknown {
  if (valueType === 'number') {
    const n = Number(editValue);
    return Number.isNaN(n) ? editValue : n;
  }
  if (valueType === 'boolean') return editValue === 'true';
  return editValue;
}

export default function FieldEditor({
  fieldPath,
  label,
  value,
  confidence,
  docId,
  wasCorrected = false,
  onSaved,
  onActionCreated,
  depth = 0,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valueType = detectValueType(value);
  const isEditable = valueType !== 'complex';
  const isDate = valueType === 'date';

  const enterEdit = useCallback(() => {
    if (!isEditable) return;
    if (typeof value === 'boolean') {
      setEditValue(value ? 'true' : 'false');
    } else {
      setEditValue(value != null ? String(value) : '');
    }
    setError(null);
    setEditing(true);
  }, [isEditable, value]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const coerced = coerceValue(editValue, valueType);
      await extractionApi.update(docId, {
        corrections: { [fieldPath]: coerced },
      });
      setEditing(false);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [editValue, valueType, docId, fieldPath, onSaved]);

  const handleActionCreated = useCallback(() => {
    if (onActionCreated) onActionCreated();
  }, [onActionCreated]);

  // Edit mode
  if (editing) {
    return (
      <div className="field-editor editing">
        <span className="field-label">{formatLabel(label)}</span>
        <div className="field-editor-input-area">
          {valueType === 'boolean' ? (
            <label className="field-editor-toggle">
              <input
                type="checkbox"
                checked={editValue === 'true'}
                onChange={(e) => setEditValue(e.target.checked ? 'true' : 'false')}
              />
              <span>{editValue === 'true' ? 'Yes' : 'No'}</span>
            </label>
          ) : valueType === 'longtext' ? (
            <textarea
              className="field-editor-textarea"
              rows={3}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              type={valueType === 'number' ? 'number' : valueType === 'date' ? 'date' : 'text'}
              className="field-editor-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
            />
          )}
          {error && <div className="field-editor-error">{error}</div>}
          <div className="field-editor-actions">
            <button
              className="extraction-btn ghost sm"
              onClick={handleCancel}
              disabled={saving}
              style={{ width: 'auto', padding: '3px 10px', fontSize: 11 }}
            >
              Cancel
            </button>
            <button
              className="extraction-btn primary sm"
              onClick={handleSave}
              disabled={saving}
              style={{ width: 'auto', padding: '3px 10px', fontSize: 11 }}
            >
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show mode
  return (
    <div className="field-editor">
      <div className="field-editor-row">
        <FieldDisplay label={label} value={value} confidence={confidence} depth={depth} />
        <div className="field-editor-buttons">
          {wasCorrected && (
            <span className="field-editor-corrected" title="Manually corrected">
              {'\u2022'}
            </span>
          )}
          {isEditable && (
            <button
              className="field-editor-edit-btn"
              onClick={enterEdit}
              title="Edit field"
            >
              {'\u270E'}
            </button>
          )}
          {isDate && onActionCreated && (
            <ActionButton
              kind="reminder"
              docId={docId}
              fieldPath={fieldPath}
              fieldValue={value}
              onActionCreated={handleActionCreated}
            />
          )}
          {onActionCreated && (
            <ActionButton
              kind="flag_review"
              docId={docId}
              fieldPath={fieldPath}
              onActionCreated={handleActionCreated}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Convert camelCase/snake_case key to Title Case label. */
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
}
