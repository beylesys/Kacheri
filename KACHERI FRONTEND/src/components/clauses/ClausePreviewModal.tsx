// KACHERI FRONTEND/src/components/clauses/ClausePreviewModal.tsx
// Full content preview modal for a clause.
//
// Shows: HTML content rendering, version info, usage stats, category, tags,
// timestamps, and optional "Insert" button.
//
// Follows TemplateGalleryModal pattern (backdrop, Escape, click-outside, ARIA).
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B9

import { useState, useRef } from 'react';
import type { Clause } from '../../types/clause.ts';
import ClauseVersionHistory from './ClauseVersionHistory.tsx';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { sanitizeHtml } from '../../utils/sanitize';

type Props = {
  /** The clause to preview. Null = modal closed. */
  clause: Clause | null;
  onClose: () => void;
  /** Called when user clicks "Insert". Omit to hide the button. */
  onInsert?: (clauseId: string) => void;
  /** Called after clause is updated (e.g. version restored). */
  onClauseUpdated?: () => void;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ClausePreviewModal({ clause, onClose, onInsert, onClauseUpdated }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, !!clause);

  const [activeTab, setActiveTab] = useState<'preview' | 'versions'>('preview');

  if (!clause) return null;

  const handleBackdropClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="clause-preview-backdrop"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clause-preview-title"
    >
      <div
        className="clause-preview-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="clause-preview-header">
          <span id="clause-preview-title" className="clause-preview-title">
            {clause.title}
          </span>
          <button
            className="clause-preview-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs (Slice B13) */}
        <div className="clause-preview-tabs" role="tablist" aria-label="Clause view" onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setActiveTab(activeTab === 'preview' ? 'versions' : 'preview'); }
        }}>
          <button
            role="tab"
            aria-selected={activeTab === 'preview'}
            aria-controls="clause-panel-preview"
            id="clause-tab-preview"
            tabIndex={activeTab === 'preview' ? 0 : -1}
            className={`clause-preview-tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'versions'}
            aria-controls="clause-panel-versions"
            id="clause-tab-versions"
            tabIndex={activeTab === 'versions' ? 0 : -1}
            className={`clause-preview-tab ${activeTab === 'versions' ? 'active' : ''}`}
            onClick={() => setActiveTab('versions')}
          >
            Versions (v{clause.version})
          </button>
        </div>

        {/* Body: Preview tab */}
        {activeTab === 'preview' && (
          <div className="clause-preview-body" role="tabpanel" id="clause-panel-preview" aria-labelledby="clause-tab-preview">
            {/* Rendered HTML content */}
            <div
              className="clause-preview-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(clause.contentHtml) }}
            />

            {/* Metadata */}
            <div className="clause-preview-meta">
              <div className="clause-preview-meta-row">
                <span className="clause-preview-meta-label">Category</span>
                <span className="clause-preview-meta-value">
                  <span className={`clause-card-category ${clause.category}`}>
                    {clause.category}
                  </span>
                </span>
              </div>

              <div className="clause-preview-meta-row">
                <span className="clause-preview-meta-label">Version</span>
                <span className="clause-preview-meta-value">v{clause.version}</span>
              </div>

              <div className="clause-preview-meta-row">
                <span className="clause-preview-meta-label">Usage</span>
                <span className="clause-preview-meta-value">
                  {clause.usageCount} {clause.usageCount === 1 ? 'time' : 'times'} used
                </span>
              </div>

              <div className="clause-preview-meta-row">
                <span className="clause-preview-meta-label">Language</span>
                <span className="clause-preview-meta-value">{clause.language}</span>
              </div>

              {clause.tags.length > 0 && (
                <div className="clause-preview-meta-row">
                  <span className="clause-preview-meta-label">Tags</span>
                  <span className="clause-preview-meta-value">
                    <div className="clause-preview-tags">
                      {clause.tags.map(tag => (
                        <span key={tag} className="clause-preview-tag">{tag}</span>
                      ))}
                    </div>
                  </span>
                </div>
              )}

              <div className="clause-preview-meta-row">
                <span className="clause-preview-meta-label">Created</span>
                <span className="clause-preview-meta-value">{formatDate(clause.createdAt)}</span>
              </div>

              <div className="clause-preview-meta-row">
                <span className="clause-preview-meta-label">Updated</span>
                <span className="clause-preview-meta-value">{formatDate(clause.updatedAt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Body: Versions tab (Slice B13) */}
        {activeTab === 'versions' && (
          <div role="tabpanel" id="clause-panel-versions" aria-labelledby="clause-tab-versions">
            <ClauseVersionHistory
              clause={clause}
              onClauseUpdated={onClauseUpdated}
            />
          </div>
        )}

        {/* Footer */}
        <div className="clause-preview-footer">
          <button
            className="clause-preview-cancel-btn"
            onClick={onClose}
          >
            Close
          </button>
          {onInsert && (
            <button
              className="clause-preview-insert-btn"
              onClick={() => onInsert(clause.id)}
            >
              Insert into Document
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
