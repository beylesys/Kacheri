// KACHERI FRONTEND/src/components/knowledge/RelatedDocCard.tsx
// Card component for a single related document, showing title, relevance,
// and shared entities as colored chips.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 13

import type { RelatedDoc } from '../../types/knowledge.ts';
import EntityChip from './EntityChip.tsx';
import './knowledge.css';

type Props = {
  doc: RelatedDoc;
};

const MAX_VISIBLE_ENTITIES = 4;

function relevanceClass(relevance: number): string {
  if (relevance >= 0.7) return 'high';
  if (relevance >= 0.4) return 'medium';
  return 'low';
}

export default function RelatedDocCard({ doc }: Props) {
  const visibleEntities = doc.sharedEntities.slice(0, MAX_VISIBLE_ENTITIES);
  const overflowCount = doc.sharedEntities.length - MAX_VISIBLE_ENTITIES;
  const pct = Math.round(doc.relevance * 100);

  return (
    <a
      className="related-doc-card"
      href={`/doc/${doc.docId}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open "${doc.title || 'Untitled'}" in a new tab`}
    >
      {/* Header: title + relevance badge */}
      <div className="related-doc-card-header">
        <span className="related-doc-card-title">
          {doc.title || 'Untitled'}
        </span>
        <span className={`related-doc-card-relevance ${relevanceClass(doc.relevance)}`}>
          {pct}%
        </span>
      </div>

      {/* Shared entities as chips */}
      {visibleEntities.length > 0 && (
        <div className="related-doc-card-entities">
          {visibleEntities.map((entity, i) => (
            <EntityChip
              key={`${entity.name}-${entity.entityType}-${i}`}
              name={entity.name}
              entityType={entity.entityType}
            />
          ))}
          {overflowCount > 0 && (
            <span className="entity-chip-overflow">+{overflowCount}</span>
          )}
        </div>
      )}

      {/* Footer: shared entity count */}
      <div className="related-doc-card-footer">
        <span className="related-doc-card-meta">
          {doc.sharedEntityCount} shared {doc.sharedEntityCount === 1 ? 'entity' : 'entities'}
        </span>
      </div>
    </a>
  );
}
