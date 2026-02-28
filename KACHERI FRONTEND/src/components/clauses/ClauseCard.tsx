// KACHERI FRONTEND/src/components/clauses/ClauseCard.tsx
// Clause card component for the Clause Library panel.
//
// Shows: title, category badge, description/preview, tags, version, usage count,
// and optional "Insert" button.
//
// Follows template-card pattern from TemplateGalleryModal.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B9

import type { Clause } from '../../types/clause.ts';

type Props = {
  clause: Clause;
  /** Called when user clicks the card to preview full details. */
  onPreview: (clause: Clause) => void;
  /** Called when user clicks "Insert". Omit to hide the button. */
  onInsert?: (clauseId: string) => void;
};

/** Max characters for the description/content preview. */
const PREVIEW_MAX = 120;
/** Max tags to show before "+N more". */
const MAX_TAGS = 3;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '\u2026';
}

export default function ClauseCard({ clause, onPreview, onInsert }: Props) {
  const preview = clause.description
    ? truncate(clause.description, PREVIEW_MAX)
    : truncate(clause.contentText, PREVIEW_MAX);

  const visibleTags = clause.tags.slice(0, MAX_TAGS);
  const extraTagCount = clause.tags.length - MAX_TAGS;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPreview(clause);
    }
  };

  const handleInsertClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInsert) {
      onInsert(clause.id);
    }
  };

  return (
    <div
      className="clause-card"
      onClick={() => onPreview(clause)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {/* Header: title + category badge */}
      <div className="clause-card-header">
        <span className="clause-card-title">{clause.title}</span>
        <span className={`clause-card-category ${clause.category}`}>
          {clause.category}
        </span>
      </div>

      {/* Body: description or content preview */}
      {preview && (
        <div className="clause-card-body">
          <div className="clause-card-description">{preview}</div>
        </div>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="clause-card-tags">
          {visibleTags.map(tag => (
            <span key={tag} className="clause-card-tag">{tag}</span>
          ))}
          {extraTagCount > 0 && (
            <span className="clause-card-tag more">+{extraTagCount} more</span>
          )}
        </div>
      )}

      {/* Footer: meta + insert */}
      <div className="clause-card-footer">
        <div className="clause-card-meta">
          <span className="clause-card-meta-item">v{clause.version}</span>
          <span className="clause-card-meta-item">
            {clause.usageCount} {clause.usageCount === 1 ? 'use' : 'uses'}
          </span>
        </div>
        {onInsert && (
          <button
            className="clause-card-insert-btn"
            onClick={handleInsertClick}
            title={`Insert "${clause.title}" into document`}
          >
            Insert
          </button>
        )}
      </div>
    </div>
  );
}
