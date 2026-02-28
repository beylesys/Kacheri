// KACHERI FRONTEND/src/components/knowledge/EntityChip.tsx
// Small colored badge displaying an entity name with type-specific color.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 13

import type { EntityType } from '../../types/knowledge.ts';
import './knowledge.css';

type Props = {
  name: string;
  entityType: EntityType;
};

export default function EntityChip({ name, entityType }: Props) {
  return (
    <span
      className={`entity-chip ${entityType}`}
      title={`${name} (${entityType})`}
    >
      <span className="entity-chip-dot" />
      <span className="entity-chip-name">{name}</span>
    </span>
  );
}
