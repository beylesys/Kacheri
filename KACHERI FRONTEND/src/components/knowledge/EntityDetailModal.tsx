// KACHERI FRONTEND/src/components/knowledge/EntityDetailModal.tsx
// Full modal showing entity detail: header, stats, metadata, mentions tab,
// relationships tab, with admin edit capability.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 16

import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { knowledgeApi } from '../../api/knowledge';
import EntityChip from './EntityChip';
import EntityMentionsList from './EntityMentionsList';
import EntityRelationshipsList from './EntityRelationshipsList';
import type {
  EntityDetail,
  EntityMention,
  EntityRelationship,
  EntityType,
  UpdateEntityParams,
} from '../../types/knowledge';
import './knowledge.css';

type Props = {
  entityId: string | null;
  workspaceId: string;
  isAdmin: boolean;
  onClose: () => void;
  onEntityChange?: () => void;
};

type Tab = 'mentions' | 'relationships';

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Person',
  organization: 'Organization',
  date: 'Date',
  amount: 'Amount',
  location: 'Location',
  product: 'Product',
  term: 'Term',
  concept: 'Concept',
  web_page: 'Web Page',
  research_source: 'Research Source',
  design_asset: 'Design Asset',
  event: 'Event',
  citation: 'Citation',
};

/* ---- Metadata field definitions per entity type ---- */

const METADATA_FIELDS: Partial<Record<EntityType, { key: string; label: string }[]>> = {
  person: [
    { key: 'title', label: 'Title' },
    { key: 'organization', label: 'Organization' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
  ],
  organization: [
    { key: 'type', label: 'Type' },
    { key: 'address', label: 'Address' },
    { key: 'taxId', label: 'Tax ID' },
    { key: 'industry', label: 'Industry' },
  ],
  amount: [
    { key: 'value', label: 'Value' },
    { key: 'currency', label: 'Currency' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'context', label: 'Context' },
  ],
  date: [
    { key: 'isoDate', label: 'ISO Date' },
    { key: 'context', label: 'Context' },
    { key: 'isRecurring', label: 'Recurring' },
  ],
  location: [
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'country', label: 'Country' },
    { key: 'context', label: 'Context' },
  ],
  product: [
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
  ],
  term: [
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
  ],
  concept: [
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
  ],
  web_page: [
    { key: 'url', label: 'URL' },
    { key: 'capturedAt', label: 'Captured' },
  ],
  research_source: [
    { key: 'url', label: 'URL' },
    { key: 'capturedAt', label: 'Captured' },
    { key: 'context', label: 'Context' },
  ],
  design_asset: [
    { key: 'canvasTitle', label: 'Canvas' },
    { key: 'assetType', label: 'Asset Type' },
  ],
  event: [
    { key: 'isoDate', label: 'Date' },
    { key: 'context', label: 'Context' },
  ],
  citation: [
    { key: 'source', label: 'Source' },
    { key: 'context', label: 'Context' },
  ],
};

function formatDate(ts: string): string {
  try {
    const n = Number(ts);
    const d = isNaN(n) ? new Date(ts) : new Date(n);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '\u2014';
  }
}

export default function EntityDetailModal({
  entityId,
  workspaceId,
  isAdmin,
  onClose,
  onEntityChange,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  /* ---- State ---- */
  const [currentEntityId, setCurrentEntityId] = useState<string | null>(entityId);
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [mentions, setMentions] = useState<EntityMention[]>([]);
  const [relationships, setRelationships] = useState<EntityRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('mentions');

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAliases, setEditAliases] = useState('');
  const [editMetadata, setEditMetadata] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync external entityId prop
  useEffect(() => {
    setCurrentEntityId(entityId);
  }, [entityId]);

  /* ---- Fetch entity data ---- */
  const fetchEntity = useCallback(async (eid: string) => {
    setLoading(true);
    setError(null);
    setEditing(false);
    try {
      const res = await knowledgeApi.getEntity(workspaceId, eid);
      setEntity(res.entity);
      setMentions(res.mentions);
      setRelationships(res.relationships);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load entity';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (currentEntityId) {
      fetchEntity(currentEntityId);
    }
  }, [currentEntityId, fetchEntity]);

  /* ---- Keyboard & scroll lock ---- */
  useEffect(() => {
    if (!currentEntityId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [currentEntityId]);

  useEffect(() => {
    if (!currentEntityId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing) {
          setEditing(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentEntityId, editing, onClose]);

  /* ---- Edit handlers ---- */
  const startEditing = () => {
    if (!entity) return;
    setEditName(entity.name);
    setEditAliases(entity.aliases.join(', '));
    setEditMetadata(entity.metadata ? JSON.stringify(entity.metadata, null, 2) : '{}');
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!entity || !currentEntityId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const params: UpdateEntityParams = {};
      const trimmedName = editName.trim();
      if (trimmedName && trimmedName !== entity.name) {
        params.name = trimmedName;
      }
      const newAliases = editAliases
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (JSON.stringify(newAliases) !== JSON.stringify(entity.aliases)) {
        params.aliases = newAliases;
      }
      try {
        const parsed = JSON.parse(editMetadata);
        if (JSON.stringify(parsed) !== JSON.stringify(entity.metadata)) {
          params.metadata = parsed;
        }
      } catch {
        setSaveError('Invalid JSON in metadata');
        setSaving(false);
        return;
      }
      if (Object.keys(params).length === 0) {
        setEditing(false);
        setSaving(false);
        return;
      }
      await knowledgeApi.updateEntity(workspaceId, currentEntityId, params);
      setEditing(false);
      onEntityChange?.();
      fetchEntity(currentEntityId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Related entity navigation ---- */
  const handleRelatedEntityClick = (relatedId: string) => {
    setCurrentEntityId(relatedId);
    setTab('mentions');
  };

  /* ---- Render gate ---- */
  if (!currentEntityId) return null;

  /* ---- Metadata rendering ---- */
  const renderMetadata = () => {
    if (!entity?.metadata || Object.keys(entity.metadata).length === 0) return null;
    const fields = METADATA_FIELDS[entity.entityType];
    if (!fields) return null;

    const rendered = fields.filter(
      (f) => entity.metadata && entity.metadata[f.key] != null && entity.metadata[f.key] !== ''
    );
    if (rendered.length === 0) return null;

    return (
      <div className="entity-detail-metadata">
        {rendered.map((f) => (
          <div key={f.key} className="entity-detail-metadata-item">
            <span className="entity-detail-metadata-label">{f.label}</span>
            <span className="entity-detail-metadata-value">
              {String(entity.metadata![f.key])}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="entity-detail-modal-overlay"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-detail-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="entity-detail-modal">
        {/* Loading */}
        {loading && (
          <div className="entity-detail-loading">
            <div className="related-docs-skeleton">
              <div className="related-docs-skeleton-line long" />
              <div className="related-docs-skeleton-line medium" />
              <div className="related-docs-skeleton-line short" />
              <div className="related-docs-skeleton-card" />
              <div className="related-docs-skeleton-card" />
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="entity-detail-error-container">
            <div className="related-docs-error">
              {error}
              <button
                type="button"
                className="related-docs-error-retry"
                onClick={() => currentEntityId && fetchEntity(currentEntityId)}
              >
                Retry
              </button>
            </div>
            <button
              type="button"
              className="entity-detail-close-btn"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && !error && entity && !editing && (
          <>
            {/* Header */}
            <div className="entity-detail-header">
              <div className="entity-detail-header-top">
                <h2 id="entity-detail-title" className="entity-detail-name">{entity.name}</h2>
                <EntityChip name={ENTITY_TYPE_LABELS[entity.entityType]} entityType={entity.entityType} />
              </div>
              {entity.aliases.length > 0 && (
                <div className="entity-detail-aliases">
                  aka {entity.aliases.join(', ')}
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="entity-detail-stats">
              <div className="entity-detail-stat">
                <span className="entity-detail-stat-value">{entity.mentionCount}</span>
                <span className="entity-detail-stat-label">Mentions</span>
              </div>
              <div className="entity-detail-stat">
                <span className="entity-detail-stat-value">{entity.docCount}</span>
                <span className="entity-detail-stat-label">Documents</span>
              </div>
              <div className="entity-detail-stat">
                <span className="entity-detail-stat-value">{formatDate(entity.firstSeenAt)}</span>
                <span className="entity-detail-stat-label">First Seen</span>
              </div>
              <div className="entity-detail-stat">
                <span className="entity-detail-stat-value">{formatDate(entity.lastSeenAt)}</span>
                <span className="entity-detail-stat-label">Last Seen</span>
              </div>
            </div>

            {/* Metadata */}
            {renderMetadata()}

            {/* Tabs */}
            <div className="entity-detail-tabs">
              <button
                type="button"
                className={`entity-detail-tab ${tab === 'mentions' ? 'active' : ''}`}
                onClick={() => setTab('mentions')}
              >
                Mentions ({mentions.length})
              </button>
              <button
                type="button"
                className={`entity-detail-tab ${tab === 'relationships' ? 'active' : ''}`}
                onClick={() => setTab('relationships')}
              >
                Relationships ({relationships.length})
              </button>
            </div>

            {/* Tab content */}
            <div className="entity-detail-tab-content">
              {tab === 'mentions' && <EntityMentionsList mentions={mentions} workspaceId={workspaceId} />}
              {tab === 'relationships' && (
                <EntityRelationshipsList
                  relationships={relationships}
                  onEntityClick={handleRelatedEntityClick}
                />
              )}
            </div>

            {/* Footer */}
            <div className="entity-detail-footer">
              {isAdmin && (
                <button
                  type="button"
                  className="entity-detail-edit-btn"
                  onClick={startEditing}
                >
                  Edit Entity
                </button>
              )}
              <button
                type="button"
                className="entity-detail-close-btn"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        )}

        {/* Edit mode */}
        {!loading && !error && entity && editing && (
          <>
            <div className="entity-detail-header">
              <h2 className="entity-detail-name">Edit Entity</h2>
            </div>

            <div className="entity-detail-edit-form">
              <label className="entity-detail-edit-label">
                Name
                <input
                  type="text"
                  className="entity-detail-edit-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                />
              </label>

              <label className="entity-detail-edit-label">
                Aliases (comma-separated)
                <input
                  type="text"
                  className="entity-detail-edit-input"
                  value={editAliases}
                  onChange={(e) => setEditAliases(e.target.value)}
                  placeholder="Alias 1, Alias 2, ..."
                  disabled={saving}
                />
              </label>

              <label className="entity-detail-edit-label">
                Metadata (JSON)
                <textarea
                  className="entity-detail-edit-textarea"
                  value={editMetadata}
                  onChange={(e) => setEditMetadata(e.target.value)}
                  rows={6}
                  disabled={saving}
                />
              </label>

              {saveError && (
                <div className="entity-detail-save-error">
                  {saveError}
                </div>
              )}
            </div>

            <div className="entity-detail-footer">
              <button
                type="button"
                className="entity-detail-edit-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="entity-detail-close-btn"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
