// KACHERI FRONTEND/src/components/knowledge/EntityMentionsList.tsx
// Paginated list of entity mentions grouped by product source,
// with document/canvas/research navigation links and context snippets.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 16
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice P6

import { useState, useMemo, type CSSProperties } from 'react';
import type { EntityMention, ProductSource } from '../../types/knowledge';
import { isFeatureEnabled } from '../../modules/registry';
import './knowledge.css';

type Props = {
  mentions: EntityMention[];
  workspaceId?: string;
};

const PAGE_SIZE = 10;

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

/** Get the display title for a mention based on its product source */
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

/** Get the navigation URL for a mention based on its product source */
function getMentionHref(m: EntityMention, workspaceId?: string): string | null {
  const source = m.productSource || 'docs';
  if (source === 'docs' && m.docId) {
    return `/doc/${m.docId}`;
  }
  if (source === 'design-studio' && m.sourceRef && workspaceId) {
    return `/workspaces/${workspaceId}/studio/${m.sourceRef}`;
  }
  // Research, notes, sheets — no in-app navigation
  return null;
}

export default function EntityMentionsList({ mentions, workspaceId }: Props) {
  const [page, setPage] = useState(0);
  const memoryGraphEnabled = isFeatureEnabled('memoryGraph');

  // Group mentions by product source when memory graph is enabled
  const grouped = useMemo(() => {
    if (!memoryGraphEnabled) return null;

    const groups: Record<string, EntityMention[]> = {};
    for (const m of mentions) {
      const source = m.productSource || 'docs';
      if (!groups[source]) groups[source] = [];
      groups[source].push(m);
    }
    // Only show grouping if there are mentions from multiple products
    const keys = Object.keys(groups);
    if (keys.length <= 1) return null;
    return groups;
  }, [mentions, memoryGraphEnabled]);

  if (mentions.length === 0) {
    return (
      <div className="entity-detail-empty">
        No mentions found.
      </div>
    );
  }

  // Ungrouped view (single product or memory graph disabled) — paginated flat list
  if (!grouped) {
    const totalPages = Math.ceil(mentions.length / PAGE_SIZE);
    const start = page * PAGE_SIZE;
    const visible = mentions.slice(start, start + PAGE_SIZE);

    return (
      <div className="entity-mentions-list">
        {visible.map((m, i) => (
          <MentionRow key={`${m.docId ?? m.sourceRef ?? ''}-${m.fieldPath ?? i}`} mention={m} workspaceId={workspaceId} />
        ))}

        {totalPages > 1 && (
          <div className="entity-mentions-pagination">
            <button
              type="button"
              className="entity-mentions-page-btn"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Prev
            </button>
            <span className="entity-mentions-page-info">
              {start + 1}&ndash;{Math.min(start + PAGE_SIZE, mentions.length)} of {mentions.length}
            </span>
            <button
              type="button"
              className="entity-mentions-page-btn"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  }

  // Grouped view — sections per product source
  const sourceOrder: string[] = ['docs', 'design-studio', 'research', 'notes', 'sheets'];
  const sortedSources = sourceOrder.filter((s) => grouped[s] && grouped[s].length > 0);

  return (
    <div className="entity-mentions-list">
      {sortedSources.map((source) => {
        const items = grouped[source];
        const color = PRODUCT_SOURCE_COLORS[source] || '#94a3b8';
        const label = PRODUCT_SOURCE_LABELS[source] || source;

        return (
          <div key={source} style={{ marginBottom: 12 }}>
            {/* Product source section header */}
            <div style={sectionHeaderStyle}>
              <span style={{
                ...productBadgeStyle,
                background: `${color}20`,
                color,
                borderColor: `${color}50`,
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: color,
                  marginRight: 5,
                }} />
                {label}
              </span>
              <span style={{ fontSize: 10, color: '#9ca3c7', marginLeft: 6 }}>
                {items.length} mention{items.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Mentions for this product source */}
            {items.slice(0, 5).map((m, i) => (
              <MentionRow
                key={`${source}-${m.docId ?? m.sourceRef ?? ''}-${m.fieldPath ?? i}`}
                mention={m}
                workspaceId={workspaceId}
              />
            ))}
            {items.length > 5 && (
              <div style={{ fontSize: 10, color: '#9ca3c7', padding: '4px 8px' }}>
                +{items.length - 5} more mention{items.length - 5 !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- MentionRow sub-component ---------- */

function MentionRow({ mention: m, workspaceId }: { mention: EntityMention; workspaceId?: string }) {
  const href = getMentionHref(m, workspaceId);
  const title = getMentionTitle(m);
  const source = m.productSource || 'docs';
  const color = PRODUCT_SOURCE_COLORS[source] || '#94a3b8';
  const isResearch = source === 'research';

  const content = (
    <>
      <div className="entity-mention-row-header">
        <span className="entity-mention-doc-title">
          {title}
        </span>
        {/* Product source badge (inline, small) */}
        {m.productSource && m.productSource !== 'docs' && (
          <span style={{
            fontSize: 9,
            padding: '1px 6px',
            borderRadius: 4,
            background: `${color}18`,
            color,
            fontWeight: 600,
            marginLeft: 6,
            flexShrink: 0,
          }}>
            {PRODUCT_SOURCE_LABELS[m.productSource] || m.productSource}
          </span>
        )}
        <span
          className={`entity-mention-confidence ${
            m.confidence >= 0.8 ? 'high' : m.confidence >= 0.5 ? 'medium' : 'low'
          }`}
        >
          {Math.round(m.confidence * 100)}%
        </span>
      </div>
      {m.context && (
        <div className="entity-mention-context">
          {m.context}
        </div>
      )}
      {m.fieldPath && (
        <div className="entity-mention-field">
          {m.fieldPath}
        </div>
      )}
    </>
  );

  // Research mentions: no in-app navigation — render as div with tooltip
  if (isResearch || !href) {
    return (
      <div
        className="entity-mention-row"
        title={isResearch ? 'View in JAAL Research Browser' : undefined}
        style={{ cursor: isResearch ? 'default' : undefined }}
      >
        {content}
      </div>
    );
  }

  // Docs and Design Studio: clickable links
  return (
    <a
      className="entity-mention-row"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {content}
    </a>
  );
}

/* ---------- Styles ---------- */

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 0 4px',
  borderBottom: '1px solid rgba(30,64,175,0.25)',
  marginBottom: 4,
};

const productBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 6,
  border: '1px solid',
  fontSize: 11,
  fontWeight: 600,
};
