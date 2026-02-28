// KACHERI FRONTEND/src/components/clauses/ClauseEditor.tsx
// Modal form for creating / editing a workspace clause.
// Follows the same pattern as PolicyEditor.tsx (compliance).
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B14

import { useState, useEffect, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { clausesApi } from '../../api/clauses';
import type {
  Clause,
  ClauseCategory,
  CreateClauseParams,
  UpdateClauseParams,
} from '../../types/clause';
import './clauses.css';

/* ---------- Types ---------- */

interface ClauseEditorProps {
  workspaceId: string;
  existing?: Clause;           // undefined = create mode
  onSaved: () => void;
  onClose: () => void;
}

/* ---------- Constants ---------- */

const CATEGORIES: { value: ClauseCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'legal', label: 'Legal' },
  { value: 'financial', label: 'Financial' },
  { value: 'boilerplate', label: 'Boilerplate' },
  { value: 'custom', label: 'Custom' },
];

/* ---------- Component ---------- */

export default function ClauseEditor({
  workspaceId,
  existing,
  onSaved,
  onClose,
}: ClauseEditorProps) {
  const isEdit = !!existing;

  // Core form state
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState<ClauseCategory>(existing?.category ?? 'general');
  const [content, setContent] = useState(existing?.contentText ?? '');
  const [language, setLanguage] = useState(existing?.language ?? 'en');
  const [changeNote, setChangeNote] = useState('');

  // Tags — managed as array with add/remove
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [tagInput, setTagInput] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tag add handler
  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }

  // Client-side validation
  function validate(): string | null {
    if (!title.trim()) return 'Clause title is required';
    if (!content.trim()) return 'Clause content is required';
    return null;
  }

  // Save handler
  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSaving(true);

    try {
      // Wrap plain text content in paragraph tags for HTML
      const contentText = content.trim();
      const contentHtml = contentText
        .split('\n')
        .filter(Boolean)
        .map((line) => `<p>${line}</p>`)
        .join('');

      if (isEdit && existing) {
        const params: UpdateClauseParams = {
          title: title.trim(),
          description: description.trim() || null,
          category,
          contentHtml,
          contentText,
          tags,
          language: language.trim() || 'en',
          changeNote: changeNote.trim() || undefined,
        };
        await clausesApi.update(workspaceId, existing.id, params);
      } else {
        const params: CreateClauseParams = {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          contentHtml,
          contentText,
          tags,
          language: language.trim() || 'en',
        };
        await clausesApi.create(workspaceId, params);
      }

      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save clause';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  return (
    <div
      className="clause-editor-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="clause-editor" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="clause-editor-title" ref={dialogRef}>
        {/* Header */}
        <div className="clause-editor-header">
          <h2 id="clause-editor-title">{isEdit ? 'Edit Clause' : 'Create Clause'}</h2>
          <p>
            {isEdit
              ? 'Modify this clause. Content changes create a new version.'
              : 'Add a reusable clause to your workspace library.'}
          </p>
        </div>

        {/* Body */}
        <div className="clause-editor-body">
          {error && <div className="clause-editor-error">{error}</div>}

          {/* Title */}
          <div className="clause-editor-field">
            <label className="clause-editor-label">Title</label>
            <input
              className="clause-editor-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Standard Liability Cap"
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div className="clause-editor-field">
            <label className="clause-editor-label">Description (optional)</label>
            <input
              className="clause-editor-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Limits liability to the total contract value"
              disabled={saving}
            />
          </div>

          {/* Category */}
          <div className="clause-editor-field">
            <label className="clause-editor-label">Category</label>
            <select
              className="clause-editor-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as ClauseCategory)}
              disabled={saving}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="clause-editor-field">
            <label className="clause-editor-label">Tags</label>
            <div className="clause-editor-tags-area">
              {tags.map((tag) => (
                <span key={tag} className="clause-editor-tag">
                  {tag}
                  <button
                    type="button"
                    className="clause-editor-tag-remove"
                    onClick={() => removeTag(tag)}
                    disabled={saving}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                className="clause-editor-tag-input"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder={tags.length === 0 ? 'Type and press Enter to add tags' : 'Add tag...'}
                disabled={saving}
              />
            </div>
          </div>

          {/* Language */}
          <div className="clause-editor-field">
            <label className="clause-editor-label">Language</label>
            <input
              className="clause-editor-input"
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. en, hi, fr"
              style={{ maxWidth: 120 }}
              disabled={saving}
            />
          </div>

          {/* Content */}
          <div className="clause-editor-field">
            <label className="clause-editor-label">
              Content
              <span className="clause-editor-hint">Plain text. Each line becomes a paragraph.</span>
            </label>
            <textarea
              className="clause-editor-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter clause text..."
              rows={8}
              disabled={saving}
            />
          </div>

          {/* Change Note (edit mode only) */}
          {isEdit && (
            <div className="clause-editor-field">
              <label className="clause-editor-label">
                Change Note (optional)
                <span className="clause-editor-hint">Describe what changed in this version.</span>
              </label>
              <input
                className="clause-editor-input"
                type="text"
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="e.g. Updated liability cap from $1M to $2M"
                disabled={saving}
              />
            </div>
          )}
        </div>

        {/* Footer / Actions */}
        <div className="clause-editor-actions">
          <button
            type="button"
            className="clause-library-btn ghost"
            onClick={onClose}
            disabled={saving}
            style={{ width: 'auto' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="clause-library-btn primary"
            onClick={handleSave}
            disabled={saving}
            style={{ width: 'auto' }}
          >
            {saving ? 'Saving...' : isEdit ? 'Update Clause' : 'Create Clause'}
          </button>
        </div>
      </div>
    </div>
  );
}
