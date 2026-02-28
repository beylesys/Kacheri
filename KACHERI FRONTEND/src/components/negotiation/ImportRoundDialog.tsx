// KACHERI FRONTEND/src/components/negotiation/ImportRoundDialog.tsx
// Modal dialog for importing an external DOCX/PDF document as a new negotiation round.
//
// Features: drag-and-drop file upload, proposer name, notes, progress indicator,
// and a result preview with detected change count.
//
// Follows CreateNegotiationDialog.tsx pattern exactly.
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 12

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ImportRoundResponse } from '../../types/negotiation';
import { negotiationRoundsApi } from '../../api/negotiations';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './negotiation.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (response: ImportRoundResponse) => void;
  sessionId: string;
};

const ACCEPTED_EXTENSIONS = ['docx', 'pdf'];
const ACCEPTED_MIME = '.docx,.pdf';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function ImportRoundDialog({
  open,
  onClose,
  onImported,
  sessionId,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [proposerLabel, setProposerLabel] = useState('');
  const [notes, setNotes] = useState('');

  // UI state
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportRoundResponse | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFile(null);
      setProposerLabel('');
      setNotes('');
      setDragOver(false);
      setUploading(false);
      setError(null);
      setResult(null);
    }
  }, [open]);

  // --- File validation ---
  function validateAndSetFile(f: File) {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !ACCEPTED_EXTENSIONS.includes(ext)) {
      setError('Only DOCX and PDF files are supported.');
      return;
    }
    setFile(f);
    setError(null);
  }

  // --- Drag-and-drop handlers ---
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  // --- File input change ---
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      validateAndSetFile(selected);
    }
  }, []);

  // --- Import handler ---
  const handleImport = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await negotiationRoundsApi.importFile(sessionId, file, {
        proposerLabel: proposerLabel.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed. Please try again.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  }, [sessionId, file, proposerLabel, notes]);

  // --- Keyboard / backdrop ---
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !uploading) {
      onClose();
    }
  }, [onClose, uploading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !uploading) {
      e.stopPropagation();
      onClose();
    }
  }, [onClose, uploading]);

  // --- Done handler (result phase) ---
  const handleDone = useCallback(() => {
    if (result) {
      onImported(result);
    }
  }, [result, onImported]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="import-round-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-round-title"
    >
      <div className="import-round-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="import-round-header">
          <span id="import-round-title" className="import-round-heading">
            Import External Document
          </span>
          <button
            className="import-round-close"
            onClick={onClose}
            disabled={uploading}
            title="Close"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Body */}
        <div className="import-round-body">
          {!result ? (
            <>
              {/* Drop zone */}
              <div
                className={[
                  'import-round-dropzone',
                  dragOver ? 'drag-over' : '',
                  file ? 'has-file' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="import-round-file-info">
                    <span className="import-round-filename">{file.name}</span>
                    <span className="import-round-filesize">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      className="import-round-file-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="import-round-drop-content">
                    <div className="import-round-drop-icon">{'\uD83D\uDCC4'}</div>
                    <p>Drop a DOCX or PDF here, or click to select</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_MIME}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Info note */}
              <div className="import-round-info">
                External documents are imported as counterproposals. Changes are
                automatically detected by comparing against the previous round.
              </div>

              {/* Proposer name */}
              <div className="import-round-field">
                <label className="import-round-label" htmlFor="import-round-proposer">
                  Proposer Name
                  <span className="import-round-hint">Optional</span>
                </label>
                <input
                  id="import-round-proposer"
                  className="import-round-input"
                  type="text"
                  value={proposerLabel}
                  onChange={e => setProposerLabel(e.target.value)}
                  placeholder="e.g. Acme Corp Legal"
                  disabled={uploading}
                />
              </div>

              {/* Notes */}
              <div className="import-round-field">
                <label className="import-round-label" htmlFor="import-round-notes">
                  Notes
                  <span className="import-round-hint">Optional</span>
                </label>
                <input
                  id="import-round-notes"
                  className="import-round-input"
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Counter-draft received Jan 20"
                  disabled={uploading}
                />
              </div>

              {/* Upload progress */}
              {uploading && (
                <div className="import-round-progress">
                  <div className="import-round-spinner" />
                  Uploading &amp; analyzing...
                </div>
              )}
            </>
          ) : (
            /* Result preview */
            <div className="import-round-result">
              <div className="import-round-result-icon">{'\u2713'}</div>
              <div className="import-round-result-text">
                Imported <strong>{result.import.filename}</strong>
              </div>
              <div className="import-round-result-changes">
                {result.changeCount} change{result.changeCount !== 1 ? 's' : ''} detected
              </div>
              <div className="import-round-result-meta">
                Round {result.round.roundNumber} {'\u00B7'}{' '}
                {result.import.format.toUpperCase()} {'\u00B7'}{' '}
                {formatBytes(result.import.bytes)}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && <div className="import-round-error">{error}</div>}

        {/* Footer */}
        <div className="import-round-footer">
          {!result ? (
            <>
              <button
                className="import-round-btn ghost"
                onClick={onClose}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className="import-round-btn primary"
                onClick={handleImport}
                disabled={uploading || !file}
              >
                {uploading ? 'Importing...' : 'Import Document'}
              </button>
            </>
          ) : (
            <button className="import-round-btn primary" onClick={handleDone}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
