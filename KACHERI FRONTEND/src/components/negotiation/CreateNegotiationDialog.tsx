// KACHERI FRONTEND/src/components/negotiation/CreateNegotiationDialog.tsx
// Modal dialog for creating a new negotiation session on the current document.
//
// Collects: title, counterparty name (required), counterparty label (optional).
// Uses negotiationSessionsApi.create() from the Slice 10 API layer.
//
// Follows SaveClauseDialog.tsx pattern exactly.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 11

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NegotiationSession } from '../../types/negotiation';
import { negotiationSessionsApi } from '../../api/negotiations';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './negotiation.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (session: NegotiationSession) => void;
  docId: string;
};

export default function CreateNegotiationDialog({
  open,
  onClose,
  onCreated,
  docId,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Form state
  const [title, setTitle] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyLabel, setCounterpartyLabel] = useState('');

  // Async state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle('');
      setCounterpartyName('');
      setCounterpartyLabel('');
      setError(null);
      setSaving(false);
    }
  }, [open]);

  // --- Validation ---
  function validate(): string | null {
    if (!counterpartyName.trim()) {
      return 'Counterparty name is required.';
    }
    return null;
  }

  // --- Create handler ---
  const handleCreate = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const session = await negotiationSessionsApi.create(docId, {
        title: title.trim() || `${counterpartyName.trim()} Negotiation`,
        counterpartyName: counterpartyName.trim(),
        counterpartyLabel: counterpartyLabel.trim() || undefined,
      });

      onCreated(session);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create negotiation session';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [docId, title, counterpartyName, counterpartyLabel, onCreated]);

  // --- Keyboard / backdrop ---
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !saving) {
      onClose();
    }
  }, [onClose, saving]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) {
      e.stopPropagation();
      onClose();
    }
  }, [onClose, saving]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="create-neg-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-neg-title"
    >
      <div className="create-neg-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="create-neg-header">
          <span id="create-neg-title" className="create-neg-heading">
            Start Negotiation
          </span>
          <button
            className="create-neg-close"
            onClick={onClose}
            disabled={saving}
            title="Close"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Body */}
        <div className="create-neg-body">
          {/* Counterparty Name (required) */}
          <div className="create-neg-field">
            <label className="create-neg-label" htmlFor="create-neg-counterparty">
              Counterparty Name
              <span className="create-neg-hint">(required)</span>
            </label>
            <input
              id="create-neg-counterparty"
              className="create-neg-input"
              type="text"
              value={counterpartyName}
              onChange={e => setCounterpartyName(e.target.value)}
              placeholder="e.g. Acme Corp Legal Team"
              disabled={saving}
              autoFocus
            />
          </div>

          {/* Title */}
          <div className="create-neg-field">
            <label className="create-neg-label" htmlFor="create-neg-session-title">
              Session Title
              <span className="create-neg-hint">Auto-generated if blank</span>
            </label>
            <input
              id="create-neg-session-title"
              className="create-neg-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Services Agreement Negotiation"
              disabled={saving}
            />
          </div>

          {/* Counterparty Label (optional) */}
          <div className="create-neg-field">
            <label className="create-neg-label" htmlFor="create-neg-label">
              Counterparty Label
              <span className="create-neg-hint">Optional</span>
            </label>
            <input
              id="create-neg-label"
              className="create-neg-input"
              type="text"
              value={counterpartyLabel}
              onChange={e => setCounterpartyLabel(e.target.value)}
              placeholder="e.g. External Counsel, Procurement"
              disabled={saving}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="create-neg-error">{error}</div>
        )}

        {/* Footer */}
        <div className="create-neg-footer">
          <button
            className="create-neg-btn ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="create-neg-btn primary"
            onClick={handleCreate}
            disabled={saving || !counterpartyName.trim()}
          >
            {saving ? 'Creating...' : 'Start Negotiation'}
          </button>
        </div>
      </div>
    </div>
  );
}
