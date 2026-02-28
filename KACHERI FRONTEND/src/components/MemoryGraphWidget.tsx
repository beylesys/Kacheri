/**
 * MemoryGraphWidget — Slice S15 (Phase D)
 *
 * Homepage widget showing Memory Graph summary:
 * - Entity counts by product source (Docs / Studio / Research)
 * - Overall stats (entities, relationships, indexed docs)
 * - Top 5 most-connected entities (clickable → Knowledge Explorer)
 * - Hidden when Memory Graph feature is disabled
 * - Compact on mobile, expanded on desktop
 *
 * Uses existing knowledge API endpoints — no backend changes.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { knowledgeApi, knowledgeAdminApi } from '../api/knowledge';
import { isFeatureEnabled } from '../modules/registry';
import type { KnowledgeSummaryResponse, TopEntity, EntityType } from '../types/knowledge';
import './memoryGraphWidget.css';

// ── Helpers ──

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  person: 'Person',
  organization: 'Org',
  date: 'Date',
  amount: 'Amount',
  location: 'Location',
  product: 'Product',
  term: 'Term',
  concept: 'Concept',
  web_page: 'Web Page',
  research_source: 'Research',
  design_asset: 'Design',
  event: 'Event',
  citation: 'Citation',
};

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  person: '#3b82f6',
  organization: '#a855f7',
  date: '#f59e0b',
  amount: '#10b981',
  location: '#ef4444',
  product: '#06b6d4',
  term: '#8b5cf6',
  concept: '#6366f1',
  web_page: '#14b8a6',
  research_source: '#22c55e',
  design_asset: '#ec4899',
  event: '#f97316',
  citation: '#64748b',
};

interface SourceCount {
  docs: number;
  studio: number;
  research: number;
}

interface WidgetData {
  summary: KnowledgeSummaryResponse;
  sourceCounts: SourceCount;
}

// ── Icons ──

function GraphIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="mg-widget-icon">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="12" cy="18" r="3" />
      <line x1="8.5" y1="7.5" x2="10.5" y2="16" />
      <line x1="15.5" y1="7.5" x2="13.5" y2="16" />
      <line x1="9" y1="6" x2="15" y2="6" />
    </svg>
  );
}

// ── Skeleton ──

function WidgetSkeleton() {
  return (
    <div className="mg-widget-skeleton" aria-hidden="true">
      <div className="mg-skeleton-row mg-skeleton-row-sources">
        <div className="mg-skeleton-pill" />
        <div className="mg-skeleton-pill" />
        <div className="mg-skeleton-pill" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mg-skeleton-row" style={{ animationDelay: `${i * 0.15}s` }}>
          <div className="mg-skeleton-bar mg-skeleton-bar-wide" />
          <div className="mg-skeleton-bar mg-skeleton-bar-narrow" />
        </div>
      ))}
    </div>
  );
}

// ── Component ──

interface MemoryGraphWidgetProps {
  workspaceId: string | null;
}

export function MemoryGraphWidget({ workspaceId }: MemoryGraphWidgetProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!workspaceId || !isFeatureEnabled('memoryGraph')) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch summary + product source counts in parallel
      const [summary, docsRes, studioRes, researchRes] = await Promise.all([
        knowledgeAdminApi.getSummary(workspaceId),
        knowledgeApi.listEntities(workspaceId, { productSource: 'docs', limit: 1 }),
        knowledgeApi.listEntities(workspaceId, { productSource: 'design-studio', limit: 1 }),
        knowledgeApi.listEntities(workspaceId, { productSource: 'research', limit: 1 }),
      ]);

      setData({
        summary,
        sourceCounts: {
          docs: docsRes.total,
          studio: studioRes.total,
          research: researchRes.total,
        },
      });
    } catch (err) {
      // 404 = Memory Graph not available on backend — show nothing
      if (err instanceof Error && err.message.startsWith('API 404:')) {
        setData(null);
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load Memory Graph');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Feature gate — hidden when Memory Graph is disabled
  if (!isFeatureEnabled('memoryGraph')) return null;

  // No workspace — don't render
  if (!workspaceId) return null;

  // 404 fallback — no data and no error means backend doesn't support it
  if (!loading && !error && !data) return null;

  const knowledgePath = `/workspaces/${workspaceId}/knowledge`;

  const handleViewAll = () => {
    navigate(knowledgePath);
  };

  const handleEntityClick = (entity: TopEntity) => {
    navigate(`${knowledgePath}?entity=${entity.id}`);
  };

  const handleEntityKeyDown = (e: React.KeyboardEvent, entity: TopEntity) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleEntityClick(entity);
    }
  };

  return (
    <section className="mg-widget" aria-label="Memory Graph summary">
      {/* Header */}
      <div className="mg-widget-header">
        <div className="mg-widget-header-left">
          <GraphIcon />
          <h2 className="mg-widget-title">Memory Graph</h2>
        </div>
        <button
          className="mg-widget-view-all"
          onClick={handleViewAll}
          aria-label="View all entities in Knowledge Explorer"
        >
          View All
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <WidgetSkeleton />
      ) : error ? (
        <div className="mg-widget-error">{error}</div>
      ) : data && data.summary.stats.entityCount === 0 ? (
        <div className="mg-widget-empty">
          No entities discovered yet. Entities will appear here as you create documents and use AI features.
        </div>
      ) : data ? (
        <>
          {/* Product source counts */}
          <div className="mg-widget-sources">
            <div className="mg-widget-source-pill">
              <span className="mg-widget-source-dot mg-widget-source-dot--docs" />
              <span className="mg-widget-source-label">Docs</span>
              <span className="mg-widget-source-count">{data.sourceCounts.docs}</span>
            </div>
            <div className="mg-widget-source-pill">
              <span className="mg-widget-source-dot mg-widget-source-dot--studio" />
              <span className="mg-widget-source-label">Studio</span>
              <span className="mg-widget-source-count">{data.sourceCounts.studio}</span>
            </div>
            <div className="mg-widget-source-pill">
              <span className="mg-widget-source-dot mg-widget-source-dot--research" />
              <span className="mg-widget-source-label">Research</span>
              <span className="mg-widget-source-count">{data.sourceCounts.research}</span>
            </div>
          </div>

          {/* Stats summary */}
          <div className="mg-widget-stats">
            <div className="mg-widget-stat">
              <span className="mg-widget-stat-value">{data.summary.stats.entityCount}</span>
              <span className="mg-widget-stat-label">Entities</span>
            </div>
            <div className="mg-widget-stat">
              <span className="mg-widget-stat-value">{data.summary.stats.relationshipCount}</span>
              <span className="mg-widget-stat-label">Connections</span>
            </div>
            <div className="mg-widget-stat">
              <span className="mg-widget-stat-value">
                {data.summary.stats.indexedDocs}/{data.summary.stats.totalDocs}
              </span>
              <span className="mg-widget-stat-label">Indexed</span>
            </div>
          </div>

          {/* Top entities — hidden on mobile */}
          {data.summary.topEntities.length > 0 && (
            <div className="mg-widget-entities">
              <h3 className="mg-widget-entities-title">Top Entities</h3>
              <div className="mg-widget-entities-list" role="list">
                {data.summary.topEntities.slice(0, 5).map((entity) => (
                  <div
                    key={entity.id}
                    className="mg-widget-entity-row"
                    role="listitem"
                    tabIndex={0}
                    onClick={() => handleEntityClick(entity)}
                    onKeyDown={(e) => handleEntityKeyDown(e, entity)}
                    aria-label={`${entity.name} — ${ENTITY_TYPE_LABELS[entity.entityType] ?? entity.entityType}, ${entity.docCount} documents`}
                  >
                    <span
                      className="mg-widget-entity-type"
                      style={{ backgroundColor: ENTITY_TYPE_COLORS[entity.entityType] ?? '#64748b' }}
                    >
                      {ENTITY_TYPE_LABELS[entity.entityType] ?? entity.entityType}
                    </span>
                    <span className="mg-widget-entity-name">{entity.name}</span>
                    <span className="mg-widget-entity-docs">{entity.docCount} docs</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
