// KACHERI FRONTEND/src/components/studio/TemplateGallery.tsx
// Modal gallery for browsing and inserting frame templates.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D10

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { canvasTemplateApi } from '../../api/canvasTemplates';
import type { CanvasTemplate } from '../../types/canvas';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './templateGallery.css';

export interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onInsertTemplate: (code: string) => void;
}

export function TemplateGallery({
  open,
  onClose,
  workspaceId,
  onInsertTemplate,
}: TemplateGalleryProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [templates, setTemplates] = useState<CanvasTemplate[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Fetch templates and tags when gallery opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [templatesRes, tagsRes] = await Promise.all([
          canvasTemplateApi.list(workspaceId, { limit: 200 }),
          canvasTemplateApi.listTags(workspaceId),
        ]);
        if (cancelled) return;
        setTemplates(templatesRes.templates);
        setTags(tagsRes.tags);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load templates');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  // Reset filters when gallery closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setActiveTag(null);
    }
  }, [open]);

  // Filter templates by search + tag
  const filtered = useMemo(() => {
    let result = templates;

    if (activeTag) {
      result = result.filter((t) => t.tags.includes(activeTag));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [templates, activeTag, searchQuery]);

  const handleInsert = useCallback(
    (template: CanvasTemplate) => {
      onInsertTemplate(template.code);
      onClose();
    },
    [onInsertTemplate, onClose],
  );

  const handleRetry = useCallback(() => {
    // Trigger re-fetch by toggling error
    setError(null);
    setLoading(true);
    Promise.all([
      canvasTemplateApi.list(workspaceId, { limit: 200 }),
      canvasTemplateApi.listTags(workspaceId),
    ])
      .then(([templatesRes, tagsRes]) => {
        setTemplates(templatesRes.templates);
        setTags(tagsRes.tags);
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to load templates');
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="template-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="template-gallery"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Frame template gallery"
      >
        {/* Header */}
        <div className="template-gallery-header">
          <span className="template-gallery-title">Frame Templates</span>
          <button
            className="template-gallery-close"
            onClick={onClose}
            aria-label="Close"
          >
            &#x2715;
          </button>
        </div>

        {/* Filters */}
        <div className="template-gallery-filters">
          <input
            className="template-gallery-search"
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search templates"
          />
          {tags.length > 0 && (
            <div className="template-gallery-tags">
              <button
                className={
                  'template-gallery-tag' + (activeTag === null ? ' active' : '')
                }
                onClick={() => setActiveTag(null)}
              >
                All
              </button>
              {tags.map((tag) => (
                <button
                  key={tag}
                  className={
                    'template-gallery-tag' +
                    (activeTag === tag ? ' active' : '')
                  }
                  onClick={() =>
                    setActiveTag((prev) => (prev === tag ? null : tag))
                  }
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="template-gallery-loading">
            <div className="template-gallery-spinner" />
            <span>Loading templates...</span>
          </div>
        ) : error ? (
          <div className="template-gallery-error">
            <div className="template-gallery-error-text">{error}</div>
            <button
              className="template-gallery-error-retry"
              onClick={handleRetry}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="template-gallery-empty">
            <div className="template-gallery-empty-icon" aria-hidden="true">
              &#x1F4CB;
            </div>
            <div className="template-gallery-empty-title">
              {templates.length === 0 ? 'No templates yet' : 'No matches'}
            </div>
            <div className="template-gallery-empty-desc">
              {templates.length === 0
                ? 'Save a frame as a template to reuse it across canvases.'
                : 'Try a different search or clear the tag filter.'}
            </div>
          </div>
        ) : (
          <div className="template-gallery-grid">
            {filtered.map((tpl) => (
              <div
                key={tpl.id}
                className="template-card"
                onClick={() => handleInsert(tpl)}
                role="button"
                tabIndex={0}
                aria-label={`Insert template: ${tpl.title}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleInsert(tpl);
                  }
                }}
              >
                <div className="template-card-preview" aria-hidden="true">
                  &#x1F5BC;
                </div>
                <div className="template-card-body">
                  <div className="template-card-title" title={tpl.title}>
                    {tpl.title}
                  </div>
                  {tpl.description && (
                    <div
                      className="template-card-desc"
                      title={tpl.description}
                    >
                      {tpl.description}
                    </div>
                  )}
                  {(tpl.tags.length > 0 || tpl.compositionMode) && (
                    <div className="template-card-tags">
                      {tpl.compositionMode && (
                        <span className="template-card-mode">
                          {tpl.compositionMode}
                        </span>
                      )}
                      {tpl.tags.map((tag) => (
                        <span key={tag} className="template-card-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="template-card-actions">
                  <button
                    className="template-card-insert"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInsert(tpl);
                    }}
                  >
                    Insert
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplateGallery;
