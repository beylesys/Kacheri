// KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx
// Workspace Knowledge Graph Explorer page.
// All members can browse entities, stats, and search. Admin-only for re-indexing.
// Includes stats bar, entity type breakdown, top entities, recent queries,
// filterable entity table, and index status indicator.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slices 14, 15, 16, 19
// See: Docs/Roadmap/phase2-product-features-work-scope.md — Slice 9 (tabbed layout + DocLinkGraph)

import { useEffect, useState, useRef, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../workspace/WorkspaceContext';
import { useWorkspaceSocket, type WsEvent } from '../hooks/useWorkspaceSocket';
import { knowledgeApi, knowledgeAdminApi } from '../api/knowledge';
import { SemanticSearchBar, SearchAnswerPanel, EntityDetailModal, DocLinkGraph, EntityGraph } from '../components/knowledge';
import { sanitizeHtml } from '../utils/sanitize';
import type {
  Entity,
  EntityType,
  ProductSource,
  KnowledgeSummaryResponse,
  IndexStatusResponse,
  ListEntitiesOptions,
  SemanticSearchResponse,
  KeywordSearchResponse,
} from '../types/knowledge';
import { isFeatureEnabled } from '../modules/registry';
import '../components/knowledge/knowledge.css';

/* ---------- Helpers ---------- */

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

const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  person: '#3b82f6',
  organization: '#a855f7',
  date: '#f59e0b',
  amount: '#22c55e',
  location: '#ef4444',
  product: '#14b8a6',
  term: '#6b7280',
  concept: '#6366f1',
  web_page: '#94a3b8',
  research_source: '#10b981',
  design_asset: '#8b5cf6',
  event: '#f97316',
  citation: '#06b6d4',
};

const PRODUCT_SOURCE_LABELS: Record<ProductSource, string> = {
  docs: 'Docs',
  'design-studio': 'Design Studio',
  research: 'Research',
  notes: 'Notes',
  sheets: 'Sheets',
};

const PRODUCT_SOURCE_COLORS: Record<ProductSource, string> = {
  docs: '#3b82f6',
  'design-studio': '#8b5cf6',
  research: '#10b981',
  notes: '#f59e0b',
  sheets: '#14b8a6',
};

const SORT_LABELS: Record<string, string> = {
  doc_count: 'Doc Count',
  name: 'Name',
  mention_count: 'Mentions',
  created_at: 'Created',
};

function formatDate(ts: string): string {
  try {
    const n = Number(ts);
    const d = isNaN(n) ? new Date(ts) : new Date(n);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function isAdmin(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

const PAGE_SIZE = 20;

/* ---------- Page Component ---------- */

export default function WorkspaceKnowledgeExplorerPage() {
  const navigate = useNavigate();
  const { currentWorkspace, workspaceId } = useWorkspace();

  // Summary data (stats bar, type breakdown, top entities, recent queries)
  const [summary, setSummary] = useState<KnowledgeSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Index status
  const [status, setStatus] = useState<IndexStatusResponse | null>(null);

  // Entity list
  const [entities, setEntities] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<EntityType | 'all'>('all');
  const [productSourceFilter, setProductSourceFilter] = useState<ProductSource | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sort, setSort] = useState<'doc_count' | 'name' | 'mention_count' | 'created_at'>('doc_count');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);

  // Re-index state
  const [reindexing, setReindexing] = useState(false);
  const [reindexError, setReindexError] = useState<string | null>(null);

  // Selected entity (placeholder for Slice 16 EntityDetailModal)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Search state (Slice 15)
  const [semanticResult, setSemanticResult] = useState<SemanticSearchResponse | null>(null);
  const [keywordResult, setKeywordResult] = useState<KeywordSearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');

  // Indexing progress from WebSocket events (Slice 19)
  const [indexProgress, setIndexProgress] = useState<{
    stage: string;
    progress: number;
  } | null>(null);

  // Active tab (Slice 9 — tabbed layout)
  const [activeTab, setActiveTab] = useState<'explorer' | 'documents' | 'entities'>('explorer');

  // WebSocket for real-time indexing progress
  const { events } = useWorkspaceSocket(workspaceId ?? '', { userId: 'knowledge-explorer' });
  const wsSeenRef = useRef(0);

  // Debounce search input
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchDebounced(search);
      setOffset(0);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Fetch summary + status (on mount and after re-index)
  const fetchSummary = useCallback(async () => {
    if (!workspaceId) return;
    setSummaryLoading(true);
    try {
      const [sum, st] = await Promise.all([
        knowledgeAdminApi.getSummary(workspaceId),
        knowledgeAdminApi.getStatus(workspaceId),
      ]);
      setSummary(sum);
      setStatus(st);
    } catch {
      // Non-fatal — entity list still works
    } finally {
      setSummaryLoading(false);
    }
  }, [workspaceId]);

  // Fetch entity list
  const fetchEntities = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const opts: ListEntitiesOptions = {
        sort,
        order,
        limit: PAGE_SIZE,
        offset,
      };
      if (filterType !== 'all') opts.type = filterType;
      if (searchDebounced) opts.search = searchDebounced;
      if (productSourceFilter !== 'all') opts.productSource = productSourceFilter;
      const res = await knowledgeApi.listEntities(workspaceId, opts);
      setEntities(res.entities);
      setTotal(res.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load entities';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filterType, productSourceFilter, searchDebounced, sort, order, offset]);

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    fetchEntities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filterType, productSourceFilter, searchDebounced, sort, order, offset]);

  // Process WebSocket events for real-time indexing progress (Slice 19)
  useEffect(() => {
    if (events.length <= wsSeenRef.current) return;
    for (let i = wsSeenRef.current; i < events.length; i++) {
      const e = events[i] as WsEvent;
      if (e.type === 'ai_job' && (e as any).kind === 'knowledge_index') {
        const phase = (e as any).phase as string;
        const meta = (e as any).meta as Record<string, unknown> | undefined;
        const progress = Number(meta?.progress ?? 0);
        const stage = String(meta?.stage ?? phase);

        if (phase === 'finished' || phase === 'failed') {
          // Indexing complete — clear progress and refresh data
          setIndexProgress(null);
          fetchSummary();
          fetchEntities();
        } else {
          setIndexProgress({ stage, progress });
        }
      }
    }
    wsSeenRef.current = events.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // Re-index handler
  const handleReindex = async () => {
    if (!workspaceId) return;
    if (!window.confirm('Re-index the entire workspace? This may take a few minutes for large workspaces.')) return;
    setReindexing(true);
    setReindexError(null);
    try {
      await knowledgeAdminApi.triggerIndex(workspaceId, { mode: 'full' });
      // Refresh status after a short delay to show "indexing in progress"
      setTimeout(() => {
        fetchSummary();
        fetchEntities();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger re-index';
      setReindexError(msg);
    } finally {
      setReindexing(false);
    }
  };

  // Entity click handler (placeholder for Slice 16)
  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
    // EntityDetailModal will be added in Slice 16
  };

  // Search result handlers (Slice 15)
  const handleSemanticResult = useCallback((result: SemanticSearchResponse) => {
    setSemanticResult(result);
    setKeywordResult(null);
    // Refresh summary to update recent queries section
    fetchSummary();
  }, [fetchSummary]);

  const handleKeywordResult = useCallback((result: KeywordSearchResponse) => {
    setKeywordResult(result);
    setSemanticResult(null);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSemanticResult(null);
    setKeywordResult(null);
  }, []);

  const handleRecentQueryClick = useCallback((queryText: string) => {
    setSearchInitialQuery(queryText);
    // Force re-render of SemanticSearchBar with new initialQuery
    setSemanticResult(null);
    setKeywordResult(null);
  }, []);

  // Pagination
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Coverage percentage
  const coverage = status && status.totalDocCount > 0
    ? Math.round((status.indexedDocCount / status.totalDocCount) * 100)
    : 0;

  /* ---------- Access Control ---------- */

  if (!currentWorkspace) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>
          <div style={{ color: '#9ca3c7', fontSize: 14 }}>Loading workspace...</div>
        </div>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>KNOWLEDGE GRAPH</div>
            <h1 style={titleStyle}>{currentWorkspace.name}</h1>
            <p style={subtitleStyle}>
              Browse entities, relationships, and knowledge extracted from your workspace documents.
            </p>
          </div>
          <div style={headerRightStyle}>
            {/* Index status badge with real-time progress (Slice 19) */}
            {(status || indexProgress) && (
              <span style={{
                ...indexBadgeStyle,
                background: (status?.indexingInProgress || indexProgress)
                  ? 'rgba(251,146,60,0.15)'
                  : 'rgba(34,197,94,0.12)',
                color: (status?.indexingInProgress || indexProgress) ? '#fb923c' : '#86efac',
                borderColor: (status?.indexingInProgress || indexProgress)
                  ? 'rgba(251,146,60,0.4)'
                  : 'rgba(34,197,94,0.3)',
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: (status?.indexingInProgress || indexProgress) ? '#fb923c' : '#22c55e',
                  marginRight: 5,
                }} />
                {indexProgress
                  ? `Indexing: ${indexProgress.progress}% (${indexProgress.stage.replace(/_/g, ' ')})`
                  : status?.indexingInProgress
                    ? 'Indexing...'
                    : 'Index Ready'}
              </span>
            )}
            {/* Re-index button (admin only) */}
            {isAdmin(currentWorkspace.role) && (
              <button
                type="button"
                onClick={handleReindex}
                style={reindexButtonStyle}
                disabled={reindexing || (status?.indexingInProgress ?? false)}
              >
                {reindexing ? 'Starting...' : 'Re-index Workspace'}
              </button>
            )}
            <button type="button" onClick={() => navigate('/')} style={backButtonStyle}>
              Back to Files
            </button>
          </div>
        </header>

        {/* Re-index error */}
        {reindexError && (
          <div style={errorBannerStyle}>
            Re-index failed: {reindexError}
          </div>
        )}

        {/* Tab bar (Slice 9) */}
        <nav style={tabBarStyle} role="tablist" aria-label="Knowledge views" onKeyDown={(e) => {
          const tabs = ['explorer', 'documents', 'entities'] as const;
          const idx = tabs.indexOf(activeTab);
          if (e.key === 'ArrowRight') { e.preventDefault(); setActiveTab(tabs[(idx + 1) % tabs.length]); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]); }
        }}>
          {(['explorer', 'documents', 'entities'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`knowledge-panel-${tab}`}
              id={`knowledge-tab-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              style={activeTab === tab ? { ...tabBtnStyle, ...tabBtnActiveStyle } : tabBtnStyle}
            >
              {tab === 'explorer' ? 'Explorer' : tab === 'documents' ? 'Documents' : 'Entities'}
            </button>
          ))}
        </nav>

        {/* Documents tab — Doc-Link Graph (Slice 9) */}
        {activeTab === 'documents' && workspaceId && (
          <div role="tabpanel" id="knowledge-panel-documents" aria-labelledby="knowledge-tab-documents">
            <DocLinkGraph workspaceId={workspaceId} />
          </div>
        )}

        {/* Entities tab — Entity Graph (Slice 10) */}
        {activeTab === 'entities' && workspaceId && (
          <div role="tabpanel" id="knowledge-panel-entities" aria-labelledby="knowledge-tab-entities">
            <EntityGraph workspaceId={workspaceId} onEntityClick={handleEntityClick} />
          </div>
        )}

        {/* Explorer tab — existing content */}
        {activeTab === 'explorer' && (<div role="tabpanel" id="knowledge-panel-explorer" aria-labelledby="knowledge-tab-explorer">

        {/* Semantic Search (Slice 15) */}
        {workspaceId && (
          <section style={{ marginTop: 16 }}>
            <SemanticSearchBar
              key={searchInitialQuery}
              workspaceId={workspaceId}
              onSemanticResult={handleSemanticResult}
              onKeywordResult={handleKeywordResult}
              onLoadingChange={setSearchLoading}
              onClear={handleSearchClear}
              initialQuery={searchInitialQuery}
            />

            {/* Semantic search answer + results */}
            <SearchAnswerPanel result={semanticResult} loading={searchLoading && !keywordResult} />

            {/* Keyword search results */}
            {keywordResult && (
              <div className="keyword-search-results">
                {keywordResult.entities.length > 0 && (
                  <div className="keyword-search-section">
                    <div className="keyword-search-section-heading">
                      Entities ({keywordResult.entities.length})
                    </div>
                    {keywordResult.entities.slice(0, 10).map((ent) => (
                      <div
                        key={ent.id}
                        className="keyword-search-entity-row"
                        onClick={() => handleEntityClick(ent.id)}
                      >
                        <span className="keyword-search-entity-name">{ent.name}</span>
                        {ent.entityType && (
                          <span style={{
                            fontSize: 10,
                            color: ENTITY_TYPE_COLORS[ent.entityType as EntityType] ?? '#94a3b8',
                            textTransform: 'capitalize',
                          }}>
                            {ent.entityType}
                          </span>
                        )}
                        {ent.docCount !== null && (
                          <span className="keyword-search-entity-count">
                            {ent.docCount} doc{ent.docCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {keywordResult.documents.length > 0 && (
                  <div className="keyword-search-section">
                    <div className="keyword-search-section-heading">
                      Documents ({keywordResult.documents.length})
                    </div>
                    {keywordResult.documents.slice(0, 10).map((doc) => (
                      <a
                        key={doc.docId}
                        className="keyword-search-doc-row"
                        href={`/doc/${doc.docId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <div className="keyword-search-doc-title">
                          {doc.title || 'Untitled'}
                        </div>
                        {doc.snippet && (
                          <div
                            className="keyword-search-doc-snippet"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(doc.snippet) }}
                          />
                        )}
                      </a>
                    ))}
                  </div>
                )}
                {keywordResult.entities.length === 0 && keywordResult.documents.length === 0 && (
                  <div className="search-no-results">
                    No entities or documents match your search.
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Stats bar */}
        {!summaryLoading && summary && status && (
          <section style={statsBarStyle}>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{summary.stats.entityCount.toLocaleString()}</div>
              <div style={statLabelStyle}>Entities</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{summary.stats.relationshipCount.toLocaleString()}</div>
              <div style={statLabelStyle}>Relationships</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>
                {status.indexedDocCount}/{status.totalDocCount}
              </div>
              <div style={statLabelStyle}>Indexed Docs</div>
            </div>
            <div style={statCardStyle}>
              <div style={{
                ...statValueStyle,
                color: coverage >= 80 ? '#86efac' : coverage >= 50 ? '#fbbf24' : '#fca5a5',
              }}>
                {coverage}%
              </div>
              <div style={statLabelStyle}>Coverage</div>
            </div>
          </section>
        )}

        {/* Entity type breakdown */}
        {summary && Object.keys(summary.entityTypeBreakdown).length > 0 && (
          <section style={{ marginTop: 16 }}>
            <div style={sectionHeadingStyle}>Entity Types</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {(Object.entries(summary.entityTypeBreakdown) as [EntityType, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setFilterType(type); setOffset(0); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 10px',
                      borderRadius: 12,
                      border: filterType === type
                        ? `1px solid ${ENTITY_TYPE_COLORS[type]}`
                        : '1px solid rgba(148,163,184,0.2)',
                      background: filterType === type
                        ? `${ENTITY_TYPE_COLORS[type]}20`
                        : 'rgba(15,23,42,0.5)',
                      color: ENTITY_TYPE_COLORS[type],
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: ENTITY_TYPE_COLORS[type],
                    }} />
                    {ENTITY_TYPE_LABELS[type]}: {count}
                  </button>
                ))}
              {filterType !== 'all' && (
                <button
                  type="button"
                  onClick={() => { setFilterType('all'); setOffset(0); }}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 12,
                    border: '1px solid rgba(148,163,184,0.3)',
                    background: 'transparent',
                    color: '#9ca3c7',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Clear filter
                </button>
              )}
            </div>
          </section>
        )}

        {/* Top entities */}
        {summary && summary.topEntities.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <div style={sectionHeadingStyle}>Top Entities</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {summary.topEntities.slice(0, 6).map((ent) => (
                <button
                  key={ent.id}
                  type="button"
                  onClick={() => handleEntityClick(ent.id)}
                  style={topEntityCardStyle}
                >
                  <span style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: ENTITY_TYPE_COLORS[ent.entityType],
                    marginRight: 5,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{ent.name}</span>
                  <span style={{ fontSize: 10, color: '#9ca3c7', marginLeft: 4 }}>
                    {ent.docCount} doc{ent.docCount !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Recent queries — clickable to re-run search */}
        {summary && summary.recentQueries.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <div style={sectionHeadingStyle}>Recent Queries</div>
            <div style={{ marginTop: 6 }}>
              {summary.recentQueries.slice(0, 5).map((q) => (
                <div
                  key={q.id}
                  style={{ ...recentQueryRowStyle, cursor: 'pointer' }}
                  onClick={() => handleRecentQueryClick(q.query)}
                  title="Click to search again"
                >
                  <span style={{ fontSize: 12, color: '#e5e7ff' }}>
                    &ldquo;{q.query}&rdquo;
                  </span>
                  <span style={{ fontSize: 10, color: '#9ca3c7', marginLeft: 8 }}>
                    {q.resultCount} result{q.resultCount !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>
                    {formatDate(q.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Filter bar */}
        <section style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#9ca3c7' }}>Filter:</label>
          <select
            style={filterSelectStyle}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as EntityType | 'all'); setOffset(0); }}
          >
            <option value="all">All Types</option>
            {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((t) => (
              <option key={t} value={t}>{ENTITY_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {isFeatureEnabled('memoryGraph') && (
            <select
              style={filterSelectStyle}
              value={productSourceFilter}
              onChange={(e) => { setProductSourceFilter(e.target.value as ProductSource | 'all'); setOffset(0); }}
              aria-label="Filter by product source"
            >
              <option value="all">All Products</option>
              {(Object.keys(PRODUCT_SOURCE_LABELS) as ProductSource[]).map((ps) => (
                <option key={ps} value={ps}>{PRODUCT_SOURCE_LABELS[ps]}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInputStyle}
          />
          <label style={{ fontSize: 12, color: '#9ca3c7', marginLeft: 8 }}>Sort:</label>
          <select
            style={filterSelectStyle}
            value={sort}
            onChange={(e) => { setSort(e.target.value as typeof sort); setOffset(0); }}
          >
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
            style={{
              ...filterSelectStyle,
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {order === 'desc' ? '\u2193' : '\u2191'}
          </button>
          <span style={{ fontSize: 11, color: '#9ca3c7', marginLeft: 'auto' }}>
            {total} entit{total !== 1 ? 'ies' : 'y'}
          </span>
        </section>

        {/* Error */}
        {error && (
          <div style={errorBannerStyle}>
            {error}
            <button
              type="button"
              onClick={fetchEntities}
              style={{ ...retryButtonStyle, marginLeft: 8 }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && entities.length === 0 && (
          <div style={{ marginTop: 20, color: '#9ca3c7', fontSize: 13 }}>
            Loading entities...
          </div>
        )}

        {/* Empty state */}
        {!loading && entities.length === 0 && !error && (
          <div style={emptyStyle}>
            <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 8 }}>&#x1F50D;</div>
            {searchDebounced || filterType !== 'all' || productSourceFilter !== 'all' ? (
              <>
                <div style={{ marginBottom: 8 }}>No entities match your filters.</div>
                <button
                  type="button"
                  onClick={() => { setSearch(''); setFilterType('all'); setProductSourceFilter('all'); setOffset(0); }}
                  style={retryButtonStyle}
                >
                  Clear Filters
                </button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 8 }}>No entities in your knowledge graph yet.</div>
                <div style={{ fontSize: 11, color: '#9ca3c7', marginBottom: 12 }}>
                  Import and extract documents to automatically build your workspace knowledge graph.
                </div>
                {isAdmin(currentWorkspace.role) && (
                  <button
                    type="button"
                    onClick={handleReindex}
                    style={reindexButtonStyle}
                    disabled={reindexing}
                  >
                    {reindexing ? 'Starting...' : 'Index Workspace'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Entity table */}
        {entities.length > 0 && (
          <section style={{ marginTop: 16 }}>
            <div style={tableShellStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: 180 }}>Name</th>
                    <th style={thStyle}>Type</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Docs</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Mentions</th>
                    <th style={thStyle}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map((ent) => (
                    <tr
                      key={ent.id}
                      onClick={() => handleEntityClick(ent.id)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(30,64,175,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = '';
                      }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{ent.name}</div>
                        {ent.aliases.length > 0 && (
                          <div style={{ fontSize: 10, color: '#9ca3c7', marginTop: 1 }}>
                            aka {ent.aliases.slice(0, 2).join(', ')}
                            {ent.aliases.length > 2 ? ` +${ent.aliases.length - 2}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '1px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 500,
                          background: `${ENTITY_TYPE_COLORS[ent.entityType]}18`,
                          color: ENTITY_TYPE_COLORS[ent.entityType],
                          textTransform: 'capitalize',
                        }}>
                          <span style={{
                            display: 'inline-block',
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: ENTITY_TYPE_COLORS[ent.entityType],
                          }} />
                          {ENTITY_TYPE_LABELS[ent.entityType]}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11, fontWeight: 600 }}>
                        {ent.docCount}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontSize: 11 }}>
                        {ent.mentionCount}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11, color: '#9ca3c7' }}>
                        {formatDate(ent.lastSeenAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={paginationStyle}>
                <button
                  type="button"
                  style={pageBtnStyle}
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Prev
                </button>
                <span style={{ fontSize: 11, color: '#9ca3c7' }}>
                  Page {currentPage} of {totalPages} &middot; Showing {offset + 1}&ndash;{Math.min(offset + PAGE_SIZE, total)} of {total}
                </span>
                <button
                  type="button"
                  style={pageBtnStyle}
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        )}

        </div>)}
        {/* end Explorer tab content */}

        {/* Entity Detail Modal (Slice 16) — outside tabs (modal, accessible from any tab) */}
        <EntityDetailModal
          entityId={selectedEntityId}
          workspaceId={workspaceId!}
          isAdmin={isAdmin(currentWorkspace.role)}
          onClose={() => setSelectedEntityId(null)}
          onEntityChange={() => { fetchEntities(); fetchSummary(); }}
        />
      </div>
    </div>
  );
}

/* ---------- Styles ---------- */

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '24px 18px 32px',
  background: 'radial-gradient(circle at top left, #020617 0, #020617 40%, #020617 100%)',
  color: '#e5e7ff',
};

const shellStyle: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 20,
  alignItems: 'flex-start',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: '#9ca3c7',
};

const titleStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: 0.4,
  margin: '4px 0 4px',
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: '#cbd5f5',
  maxWidth: 500,
};

const headerRightStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
};

const backButtonStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.7)',
  background: 'linear-gradient(145deg, #111827, #1f2937)',
  color: '#e5e7ff',
  fontSize: 12,
  cursor: 'pointer',
};

const reindexButtonStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 999,
  border: '1px solid rgba(139,92,246,0.5)',
  background: 'linear-gradient(145deg, rgba(139,92,246,0.2), rgba(139,92,246,0.05))',
  color: '#c4b5fd',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const indexBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 12,
  border: '1px solid',
  fontSize: 11,
  fontWeight: 600,
};

const statsBarStyle: CSSProperties = {
  marginTop: 20,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 12,
};

const statCardStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid rgba(30,64,175,0.5)',
  background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,64,175,0.12))',
  textAlign: 'center',
};

const statValueStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: '#e5e7ff',
};

const statLabelStyle: CSSProperties = {
  fontSize: 10,
  color: '#9ca3c7',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginTop: 2,
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#9ca3c7',
  textTransform: 'uppercase',
  letterSpacing: 1.2,
};

const topEntityCardStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid rgba(30,64,175,0.4)',
  background: 'rgba(15,23,42,0.7)',
  color: '#e5e7ff',
  cursor: 'pointer',
  fontSize: 12,
};

const recentQueryRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '5px 0',
  borderBottom: '1px solid rgba(30,64,175,0.2)',
};

const filterSelectStyle: CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#e5e7ff',
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148,163,184,0.3)',
  borderRadius: 6,
  outline: 'none',
};

const searchInputStyle: CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#e5e7ff',
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148,163,184,0.3)',
  borderRadius: 6,
  outline: 'none',
  minWidth: 160,
};

const errorBannerStyle: CSSProperties = {
  marginTop: 16,
  padding: '8px 10px',
  borderRadius: 12,
  background: 'rgba(248,113,113,0.14)',
  border: '1px solid rgba(248,113,113,0.7)',
  fontSize: 12,
  color: '#fca5a5',
};

const retryButtonStyle: CSSProperties = {
  padding: '2px 8px',
  fontSize: 11,
  border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: 4,
  background: 'transparent',
  color: '#fca5a5',
  cursor: 'pointer',
};

const emptyStyle: CSSProperties = {
  marginTop: 40,
  textAlign: 'center',
  color: '#9ca3c7',
  fontSize: 13,
};

const tableShellStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(30,64,175,0.7)',
  overflow: 'auto',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(15,23,42,0.95))',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: 11,
  color: '#cbd5f5',
  borderBottom: '1px solid rgba(30,64,175,0.7)',
  background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,64,175,0.6))',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle: CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  fontSize: 12,
  color: '#e5e7ff',
  borderBottom: '1px solid rgba(30,64,175,0.35)',
};

const paginationStyle: CSSProperties = {
  marginTop: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
};

const pageBtnStyle: CSSProperties = {
  padding: '4px 12px',
  fontSize: 11,
  color: '#93c5fd',
  background: 'transparent',
  border: '1px solid rgba(59,130,246,0.3)',
  borderRadius: 4,
  cursor: 'pointer',
};

/* Tab bar styles (Slice 9) */

const tabBarStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 16,
  marginBottom: 4,
  borderBottom: '1px solid rgba(30,64,175,0.4)',
  paddingBottom: 0,
};

const tabBtnStyle: CSSProperties = {
  padding: '7px 18px',
  fontSize: 12,
  fontWeight: 600,
  color: '#9ca3c7',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  cursor: 'pointer',
  letterSpacing: 0.3,
  transition: 'color 0.15s, border-color 0.15s',
};

const tabBtnActiveStyle: CSSProperties = {
  color: '#e5e7ff',
  borderBottomColor: '#3b82f6',
};

