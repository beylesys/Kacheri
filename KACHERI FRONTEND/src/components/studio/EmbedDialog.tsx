// KACHERI FRONTEND/src/components/studio/EmbedDialog.tsx
// Dialog for publishing a canvas and generating embed code snippets.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 7, Slice E5

import { useState, useRef, useCallback } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  getPublicCanvasEmbedUrl,
  getPublicFrameEmbedUrl,
} from '../../api/canvas';
import type { CanvasFrame } from '../../types/canvas';

export interface EmbedDialogProps {
  open: boolean;
  onClose: () => void;
  canvasId: string;
  canvasTitle: string;
  isPublished: boolean;
  frames: CanvasFrame[];
  onPublishToggle: (published: boolean) => Promise<void>;
}

export function EmbedDialog({
  open,
  onClose,
  canvasId,
  canvasTitle,
  isPublished,
  frames,
  onPublishToggle,
}: EmbedDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedFrameId, setSelectedFrameId] = useState<string>('canvas');

  const handleClose = useCallback(() => {
    if (toggling) return;
    setError(null);
    setCopied(null);
    onClose();
  }, [toggling, onClose]);

  const handleTogglePublish = useCallback(async () => {
    setToggling(true);
    setError(null);
    try {
      await onPublishToggle(!isPublished);
    } catch (err: any) {
      setError(err?.message || 'Failed to update publish state.');
    } finally {
      setToggling(false);
    }
  }, [isPublished, onPublishToggle]);

  const getEmbedSnippet = useCallback((): string => {
    const url =
      selectedFrameId === 'canvas'
        ? getPublicCanvasEmbedUrl(canvasId)
        : getPublicFrameEmbedUrl(selectedFrameId);

    const title =
      selectedFrameId === 'canvas'
        ? canvasTitle
        : frames.find((f) => f.id === selectedFrameId)?.title || 'Frame';

    return `<iframe src="${url}" title="${title}" style="width:100%;height:600px;border:none;" loading="lazy" allowfullscreen></iframe>`;
  }, [selectedFrameId, canvasId, canvasTitle, frames]);

  const handleCopy = useCallback(async () => {
    const snippet = getEmbedSnippet();
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(selectedFrameId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Failed to copy to clipboard.');
    }
  }, [getEmbedSnippet, selectedFrameId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    },
    [handleClose],
  );

  if (!open) return null;

  return (
    <div
      className="template-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="save-template-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Embed canvas"
        style={{ maxWidth: 520 }}
      >
        {/* Header */}
        <div className="save-template-header">
          <span className="save-template-title">Embed Canvas</span>
          <button
            className="save-template-close"
            onClick={handleClose}
            aria-label="Close"
            disabled={toggling}
          >
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div className="save-template-body">
          {/* Publish toggle */}
          <div className="save-template-field">
            <label className="save-template-label">
              Public embed
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={handleTogglePublish}
                disabled={toggling}
                style={{
                  padding: '6px 16px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: toggling ? 'wait' : 'pointer',
                  background: isPublished ? '#dc3545' : '#28a745',
                  color: '#fff',
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                {toggling
                  ? 'Updating...'
                  : isPublished
                    ? 'Unpublish'
                    : 'Publish'}
              </button>
              <span style={{ fontSize: 13, color: '#999' }}>
                {isPublished
                  ? 'This canvas is publicly embeddable.'
                  : 'Publish to allow embedding on external sites.'}
              </span>
            </div>
          </div>

          {/* Embed snippets (only when published) */}
          {isPublished && (
            <>
              {/* Frame selector */}
              <div className="save-template-field">
                <label className="save-template-label" htmlFor="embed-target">
                  Embed target
                </label>
                <select
                  id="embed-target"
                  className="save-template-input"
                  value={selectedFrameId}
                  onChange={(e) => {
                    setSelectedFrameId(e.target.value);
                    setCopied(null);
                  }}
                >
                  <option value="canvas">Full Canvas</option>
                  {frames.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title || `Frame ${f.sortOrder + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Embed code */}
              <div className="save-template-field">
                <label className="save-template-label">Embed code</label>
                <textarea
                  className="save-template-input"
                  readOnly
                  value={getEmbedSnippet()}
                  rows={3}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    resize: 'vertical',
                  }}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
                <span className="save-template-hint">
                  Paste this HTML snippet where you want the embed to appear.
                </span>
              </div>
            </>
          )}
        </div>

        {error && <div className="save-template-error">{error}</div>}

        {/* Footer */}
        <div className="save-template-footer">
          <button
            className="save-template-btn save-template-btn--cancel"
            onClick={handleClose}
            disabled={toggling}
          >
            Close
          </button>
          {isPublished && (
            <button
              className="save-template-btn save-template-btn--save"
              onClick={handleCopy}
            >
              {copied === selectedFrameId ? 'Copied!' : 'Copy Embed Code'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmbedDialog;
