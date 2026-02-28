// KACHERI FRONTEND/src/components/jaal/MemoryContextPanel.tsx
// "Known Context" sidebar — Slices S4 (Phase B) + S13 (Phase D)
//
// S4: Basic entity list from URL domain search.
// S13: useMemoryContext hook, manual search, entity expansion with
//      product source badges, click-to-navigate to actual source,
//      "Memory Graph unavailable" state.
//
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice S13

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMemoryContext } from '../../hooks/useMemoryContext';
import type { EntityMention } from '../../types/knowledge';

/* ---------- Constants (reuse EntityMentionsList pattern) ---------- */

const PRODUCT_SOURCE_LABELS: Record<string, string> = {
  docs: 'Docs',
  'design-studio': 'Design Studio',
  research: 'Research',
  notes: 'Notes',
  sheets: 'Sheets',
};

const PRODUCT_SOURCE_COLORS: Record<string, string> = {
  docs: '#3b82f6',
  'design-studio': '#8b5cf6',
  research: '#10b981',
  notes: '#f59e0b',
  sheets: '#14b8a6',
};

/* ---------- Helpers ---------- */

function formatLastSeen(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Get display title for a mention based on its product source */
function getMentionTitle(m: EntityMention): string {
  if (m.productSource === 'docs' || !m.productSource) {
    return m.docTitle || 'Untitled Document';
  }
  if (m.productSource === 'design-studio') {
    return m.docTitle || 'Canvas';
  }
  if (m.productSource === 'research') {
    return m.docTitle || 'Research Session';
  }
  return m.docTitle || 'Source';
}

/** Get navigation URL for a mention based on its product source */
function getMentionHref(m: EntityMention, workspaceId: string | null): string | null {
  const source = m.productSource || 'docs';
  if (source === 'docs' && m.docId) {
    return `/doc/${m.docId}`;
  }
  if (source === 'design-studio' && m.sourceRef && workspaceId) {
    return `/workspaces/${workspaceId}/studio/${m.sourceRef}`;
  }
  if (source === 'research' && m.sourceRef) {
    return `/jaal/session/${m.sourceRef}`;
  }
  return null;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/* ---------- Sub-components ---------- */

/** Mentions grouped by product source with badges and navigation links */
function MentionsBySource({
  mentions,
  workspaceId,
  onNavigate,
}: {
  mentions: EntityMention[];
  workspaceId: string | null;
  onNavigate: (path: string) => void;
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, EntityMention[]> = {};
    for (const m of mentions) {
      const key = m.productSource || 'docs';
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    return groups;
  }, [mentions]);

  const sourceKeys = Object.keys(grouped);
  if (sourceKeys.length === 0) {
    return <div className="jaal-empty" style={{ padding: '0.5rem 0' }}>No mentions found.</div>;
  }

  return (
    <div className="entity-mentions-by-source">
      {sourceKeys.map((source) => {
        const group = grouped[source];
        const color = PRODUCT_SOURCE_COLORS[source] || '#6b7280';
        const label = PRODUCT_SOURCE_LABELS[source] || source;

        return (
          <div key={source} className="memory-source-group">
            <div className="memory-source-header">
              <span
                className="memory-source-badge"
                style={{
                  borderColor: `${color}40`,
                  background: `${color}18`,
                  color,
                }}
              >
                <span
                  className="memory-source-badge-dot"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                {label}
              </span>
              <span className="memory-source-count">
                {group.length} mention{group.length !== 1 ? 's' : ''}
              </span>
            </div>

            {group.map((m, i) => {
              const href = getMentionHref(m, workspaceId);
              const title = getMentionTitle(m);

              return (
                <div
                  key={`${source}-${m.docId || m.sourceRef || i}`}
                  className={`memory-mention-row${href ? '' : ' disabled'}`}
                  onClick={() => {
                    if (href) onNavigate(href);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && href) {
                      e.preventDefault();
                      onNavigate(href);
                    }
                  }}
                  tabIndex={href ? 0 : -1}
                  role={href ? 'link' : 'note'}
                  aria-label={`${title}${m.context ? `, ${m.context}` : ''}`}
                >
                  <div className="memory-mention-title">
                    {title}
                    {href && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ opacity: 0.4, flexShrink: 0 }}
                        aria-hidden="true"
                      >
                        <path d="M7 17L17 7M7 7h10v10" />
                      </svg>
                    )}
                  </div>
                  {m.context && (
                    <div className="memory-mention-context">{m.context}</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Main Component ---------- */

interface MemoryContextPanelProps {
  currentUrl: string | null;
  workspaceId: string | null;
}

export function MemoryContextPanel({
  currentUrl,
  workspaceId,
}: MemoryContextPanelProps) {
  const navigate = useNavigate();
  const ctx = useMemoryContext(currentUrl, workspaceId);
  const [searchInput, setSearchInput] = useState('');

  // Destructure stable callbacks from ctx to avoid re-creating handlers every render.
  // The hook's useCallback-wrapped functions have stable references.
  const {
    search: ctxSearch,
    clearSearch: ctxClearSearch,
    expandEntity: ctxExpandEntity,
    collapseEntity: ctxCollapseEntity,
  } = ctx;

  /* ---- Search handlers ---- */

  const handleSearchSubmit = useCallback(() => {
    const trimmed = searchInput.trim();
    if (trimmed) {
      ctxSearch(trimmed);
    }
  }, [searchInput, ctxSearch]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearchSubmit();
      }
    },
    [handleSearchSubmit],
  );

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    ctxClearSearch();
  }, [ctxClearSearch]);

  /* ---- Entity expand/collapse ---- */

  const handleEntityToggle = useCallback(
    (entityId: string) => {
      if (ctx.expandedEntity?.entityId === entityId) {
        ctxCollapseEntity();
      } else {
        ctxExpandEntity(entityId);
      }
    },
    [ctx.expandedEntity?.entityId, ctxCollapseEntity, ctxExpandEntity],
  );

  /* ---- Navigation from mention click ---- */

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  /* ---- Feature disabled state ---- */

  if (!ctx.memoryGraphEnabled) {
    return (
      <div className="memory-context" role="region" aria-label="Known context">
        <div className="memory-context-header">Memory Graph</div>
        <div className="jaal-empty">
          <svg
            className="memory-unavailable-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M4.93 4.93l14.14 14.14" />
          </svg>
          <div>Memory Graph unavailable.</div>
          <div style={{ marginTop: '0.25rem', opacity: 0.7, fontSize: '0.75rem' }}>
            Enable the Memory Graph feature to see cross-product context while browsing.
          </div>
        </div>
      </div>
    );
  }

  /* ---- Main render ---- */

  return (
    <div className="memory-context" role="region" aria-label="Known context">
      {/* Header */}
      <div className="memory-context-header">
        Known Context
        {!ctx.searchQuery && currentUrl && (
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
            {' '}&mdash; {extractDomain(currentUrl)}
          </span>
        )}
        {ctx.searchQuery && (
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
            {' '}&mdash; search: {ctx.searchQuery}
          </span>
        )}
      </div>

      {/* Search Input */}
      <div className="memory-search-row">
        <input
          className="guide-input memory-search-input"
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search Memory Graph..."
          aria-label="Search Memory Graph"
          spellCheck={false}
          autoComplete="off"
        />
        {searchInput.trim() && !ctx.searchQuery && (
          <button
            className="jaal-action-btn memory-search-btn"
            onClick={handleSearchSubmit}
            type="button"
            aria-label="Search"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        )}
        {ctx.searchQuery && (
          <button
            className="jaal-action-btn memory-search-clear"
            onClick={handleClearSearch}
            type="button"
            aria-label="Clear search and return to URL context"
          >
            Clear
          </button>
        )}
      </div>

      {/* Loading */}
      {ctx.loading && (
        <div className="jaal-skeleton">
          {[1, 2, 3].map((i) => (
            <div className="jaal-skeleton-row" key={i}>
              <div className="jaal-skeleton-bar" style={{ width: 48, height: 14 }} />
              <div className="jaal-skeleton-bar" style={{ width: '60%', height: 12 }} />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {ctx.error && (
        <div className="jaal-error" role="alert">
          {ctx.error}
          <button
            className="jaal-action-btn"
            onClick={ctx.retry}
            type="button"
            style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!ctx.loading && ctx.entities.length === 0 && !ctx.error && (
        <div className="jaal-empty">
          {ctx.searchQuery
            ? `No entities found for "${ctx.searchQuery}".`
            : currentUrl
              ? 'No known entities for this domain.'
              : 'Navigate to a page to see known context.'}
        </div>
      )}

      {/* Entity List */}
      {!ctx.loading && ctx.entities.length > 0 && (
        <div role="list">
          {ctx.entities.map((entity) => {
            const isExpanded = ctx.expandedEntity?.entityId === entity.id;
            const hasDetail = isExpanded && ctx.expandedEntity?.entity;
            const isDetailLoading = isExpanded && ctx.detailLoading;

            return (
              <div key={entity.id}>
                {/* Entity card row */}
                <div
                  className={`entity-card${isExpanded ? ' expanded' : ''}`}
                  onClick={() => handleEntityToggle(entity.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEntityToggle(entity.id);
                    }
                  }}
                  tabIndex={0}
                  role="listitem"
                  aria-expanded={isExpanded}
                  aria-label={`${entity.name}, ${entity.entityType}${entity.lastSeenAt ? `, last seen ${formatLastSeen(entity.lastSeenAt)}` : ''}, ${entity.mentionCount} mentions`}
                >
                  <span className="entity-type-badge">{entity.entityType}</span>
                  <span className="entity-name" title={entity.name}>
                    {entity.name}
                  </span>
                  {entity.lastSeenAt && (
                    <span className="entity-seen">
                      {formatLastSeen(entity.lastSeenAt)}
                    </span>
                  )}
                  <span className="entity-expand-icon" aria-hidden="true">
                    {isExpanded ? '\u25BE' : '\u25B8'}
                  </span>
                </div>

                {/* Expanded entity detail */}
                {isExpanded && (
                  <div className="entity-detail-expanded">
                    {isDetailLoading && (
                      <div className="jaal-skeleton">
                        <div className="jaal-skeleton-row">
                          <div className="jaal-skeleton-bar" style={{ width: 60, height: 14 }} />
                          <div className="jaal-skeleton-bar" style={{ width: '50%', height: 12 }} />
                        </div>
                        <div className="jaal-skeleton-row">
                          <div className="jaal-skeleton-bar" style={{ width: 60, height: 14 }} />
                          <div className="jaal-skeleton-bar" style={{ width: '40%', height: 12 }} />
                        </div>
                      </div>
                    )}

                    {hasDetail && ctx.expandedEntity && (
                      <MentionsBySource
                        mentions={ctx.expandedEntity.mentions}
                        workspaceId={workspaceId}
                        onNavigate={handleNavigate}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
