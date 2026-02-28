// KACHERI FRONTEND/src/components/knowledge/EntityRelationshipsList.tsx
// List of entity relationships with strength indicators, type labels,
// pagination, and navigation.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slices 16, 19

import { useState } from 'react';
import EntityChip from './EntityChip';
import type { EntityRelationship } from '../../types/knowledge';
import './knowledge.css';

type Props = {
  relationships: EntityRelationship[];
  onEntityClick?: (entityId: string) => void;
};

const RELATIONSHIP_TYPE_LABELS: Record<string, string> = {
  co_occurrence: 'Co-occurrence',
  contractual: 'Contractual',
  financial: 'Financial',
  organizational: 'Organizational',
  temporal: 'Temporal',
  custom: 'Custom',
};

const PAGE_SIZE = 10;

export default function EntityRelationshipsList({ relationships, onEntityClick }: Props) {
  const [page, setPage] = useState(0);

  if (relationships.length === 0) {
    return (
      <div className="entity-detail-empty">
        No relationships detected yet.
      </div>
    );
  }

  const totalPages = Math.ceil(relationships.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const visible = relationships.slice(start, start + PAGE_SIZE);

  return (
    <div className="entity-relationships-list">
      {visible.map((rel) => (
        <div
          key={rel.id}
          className="entity-relationship-row"
          onClick={() => onEntityClick?.(rel.relatedEntity.id)}
          role={onEntityClick ? 'button' : undefined}
          tabIndex={onEntityClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (onEntityClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onEntityClick(rel.relatedEntity.id);
            }
          }}
        >
          <div className="entity-relationship-row-main">
            <EntityChip
              name={rel.relatedEntity.name}
              entityType={rel.relatedEntity.entityType}
            />
            <div className="entity-relationship-info">
              <span className="entity-relationship-type-badge">
                {RELATIONSHIP_TYPE_LABELS[rel.relationshipType] ?? rel.relationshipType}
              </span>
              {rel.label && (
                <span className="entity-relationship-label">
                  {rel.label}
                </span>
              )}
            </div>
          </div>
          <div className="entity-relationship-row-meta">
            <div className="entity-strength-bar-container">
              <div
                className="entity-strength-bar"
                style={{ width: `${Math.round(rel.strength * 100)}%` }}
              />
            </div>
            <span className="entity-strength-value">
              {Math.round(rel.strength * 100)}%
            </span>
            <span className="entity-relationship-evidence">
              {rel.evidenceCount} doc{rel.evidenceCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
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
            {start + 1}&ndash;{Math.min(start + PAGE_SIZE, relationships.length)} of {relationships.length}
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
