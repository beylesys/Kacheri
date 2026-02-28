// KACHERI FRONTEND/src/components/knowledge/RelatedDocsPanel.tsx
// Sidebar panel showing documents related to the current document
// via shared entities in the knowledge graph.
//
// Follows ExtractionPanel.tsx patterns (props, state, loading/error/empty states).
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 13

import { memo, useState, useEffect, useCallback } from 'react';
import type { RelatedDocsResponse } from '../../types/knowledge.ts';
import { knowledgeApi } from '../../api/knowledge.ts';
import RelatedDocCard from './RelatedDocCard.tsx';
import './knowledge.css';

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  /** When true, renders as embedded content (no fixed positioning). */
  embedded?: boolean;
};

const RELATED_DOCS_LIMIT = 10;

function RelatedDocsPanelInner({
  docId,
  open,
  onClose,
  refreshKey = 0,
  embedded = false,
}: Props) {
  const [data, setData] = useState<RelatedDocsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRelated = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await knowledgeApi.getRelatedDocs(docId, RELATED_DOCS_LIMIT);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load related documents';
      if (msg.includes('404')) {
        // No related docs endpoint or doc not found — not an error state
        setData(null);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (open || embedded) {
      fetchRelated();
    }
  }, [open, embedded, fetchRelated, refreshKey]);

  const hasRelatedDocs = data && data.relatedDocs.length > 0;
  const hasNoEntities = data && data.entityCount === 0;

  const panelClasses = [
    'related-docs-panel',
    open ? 'open' : '',
    embedded ? 'embedded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={panelClasses}>
      {/* Header (hidden when embedded in drawer) */}
      {!embedded && (
        <div className="related-docs-header">
          <span className="related-docs-title">Related Documents</span>
          <button className="related-docs-close" onClick={onClose} title="Close">
            {'\u2715'}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="related-docs-content">
        {/* Loading state — skeleton shimmer */}
        {loading && (
          <div className="related-docs-skeleton">
            <div className="related-docs-skeleton-card" />
            <div className="related-docs-skeleton-card" />
            <div className="related-docs-skeleton-card" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="related-docs-error">
            {error.includes('timed out') || error.includes('timeout')
              ? 'Request timed out. The document may be too large or the server is busy.'
              : error.includes('429') || error.includes('rate limit')
                ? 'Rate limited. Please wait a moment before retrying.'
                : error}
            <br />
            <button className="related-docs-error-retry" onClick={fetchRelated}>
              Retry
            </button>
          </div>
        )}

        {/* Empty state: no entities harvested yet */}
        {!loading && !error && data && hasNoEntities && (
          <div className="related-docs-empty">
            <div className="related-docs-empty-icon">{'\uD83D\uDD17'}</div>
            <div className="related-docs-empty-text">
              No entities yet — extract this document first to discover related documents.
            </div>
          </div>
        )}

        {/* Empty state: entities exist but no related docs found */}
        {!loading && !error && data && !hasNoEntities && !hasRelatedDocs && (
          <div className="related-docs-empty">
            <div className="related-docs-empty-icon">{'\uD83D\uDCC2'}</div>
            <div className="related-docs-empty-text">
              No related documents found. Other documents in your workspace may not share entities with this one.
            </div>
          </div>
        )}

        {/* Data state */}
        {!loading && hasRelatedDocs && (
          <>
            {/* Summary bar */}
            <div className="related-docs-summary">
              <span className="related-docs-summary-count">
                {data!.totalRelated}
              </span>
              {' related '}
              {data!.totalRelated === 1 ? 'document' : 'documents'}
              {' via '}
              <span className="related-docs-summary-count">
                {data!.entityCount}
              </span>
              {' '}
              {data!.entityCount === 1 ? 'entity' : 'entities'}
            </div>

            {/* Related doc cards */}
            {data!.relatedDocs.map((doc) => (
              <RelatedDocCard key={doc.docId} doc={doc} />
            ))}
          </>
        )}
      </div>

      {/* Footer: refresh button */}
      {!loading && data && (
        <div className="related-docs-footer">
          <button
            className="related-docs-btn ghost"
            onClick={fetchRelated}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(RelatedDocsPanelInner);
