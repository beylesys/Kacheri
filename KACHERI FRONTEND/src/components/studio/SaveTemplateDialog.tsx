// KACHERI FRONTEND/src/components/studio/SaveTemplateDialog.tsx
// Dialog for saving a frame as a reusable template.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D10

import { useState, useRef, useCallback } from 'react';
import { canvasTemplateApi } from '../../api/canvasTemplates';
import type { CompositionMode } from '../../types/canvas';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './templateGallery.css';

export interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  frameCode: string;
  compositionMode: CompositionMode;
  onSaved: () => void;
}

export function SaveTemplateDialog({
  open,
  onClose,
  workspaceId,
  frameCode,
  compositionMode,
  onSaved,
}: SaveTemplateDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setTagsInput('');
    setError(null);
    setSaving(false);
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    resetForm();
    onClose();
  }, [saving, resetForm, onClose]);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Template name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await canvasTemplateApi.create(workspaceId, {
        title: trimmedTitle,
        code: frameCode,
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        compositionMode,
      });

      resetForm();
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save template.');
      setSaving(false);
    }
  }, [title, description, tagsInput, workspaceId, frameCode, compositionMode, resetForm, onSaved, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
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
        aria-label="Save frame as template"
      >
        <div className="save-template-header">
          <span className="save-template-title">Save as Template</span>
          <button
            className="save-template-close"
            onClick={handleClose}
            aria-label="Close"
            disabled={saving}
          >
            &#x2715;
          </button>
        </div>

        <div className="save-template-body">
          <div className="save-template-field">
            <label className="save-template-label" htmlFor="tpl-name">
              Name *
            </label>
            <input
              id="tpl-name"
              className="save-template-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Title Slide, Chart Layout"
              autoFocus
              disabled={saving}
              maxLength={120}
            />
          </div>

          <div className="save-template-field">
            <label className="save-template-label" htmlFor="tpl-desc">
              Description
            </label>
            <input
              id="tpl-desc"
              className="save-template-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional short description"
              disabled={saving}
              maxLength={500}
            />
          </div>

          <div className="save-template-field">
            <label className="save-template-label" htmlFor="tpl-tags">
              Tags
            </label>
            <input
              id="tpl-tags"
              className="save-template-input"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. chart, layout, intro"
              disabled={saving}
              maxLength={300}
            />
            <span className="save-template-hint">Comma-separated</span>
          </div>
        </div>

        {error && <div className="save-template-error">{error}</div>}

        <div className="save-template-footer">
          <button
            className="save-template-btn save-template-btn--cancel"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="save-template-btn save-template-btn--save"
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SaveTemplateDialog;
