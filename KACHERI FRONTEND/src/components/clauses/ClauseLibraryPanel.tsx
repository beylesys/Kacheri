// KACHERI FRONTEND/src/components/clauses/ClauseLibraryPanel.tsx
// Main sidebar panel for the Clause Library.
//
// Shows: searchable, filterable list of workspace clauses with category filter,
// debounced search, loading/error/empty states, and clause preview modal.
//
// Follows CompliancePanel / ExtractionPanel pattern exactly.
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B9

import { memo, useState, useEffect, useCallback } from 'react';
import type { Clause, ClauseCategory, ListClausesResponse } from '../../types/clause.ts';
import { clausesApi } from '../../api/clauses.ts';
import ClauseCard from './ClauseCard.tsx';
import ClausePreviewModal from './ClausePreviewModal.tsx';
import './clauses.css';

type Props = {
  docId: string;
  /** Workspace ID — required because clauses are workspace-scoped. */
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  /** When true, renders as embedded content (no fixed positioning). */
  embedded?: boolean;
  /** Called when user clicks "Insert" on a clause. Wired in B11. */
  onInsert?: (clauseId: string) => void;
};

/** Debounce delay for search input (ms). */
const SEARCH_DEBOUNCE_MS = 300;
/** Default page size for clause listing. */
const PAGE_LIMIT = 50;

function ClauseLibraryPanelInner({
  docId: _docId,
  workspaceId,
  open,
  onClose,
  refreshKey = 0,
  embedded = false,
  onInsert,
}: Props) {
  // Data state
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ClauseCategory | ''>('');

  // Preview modal state
  const [previewClause, setPreviewClause] = useState<Clause | null>(null);

  // --- Debounce search input ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // --- Fetch clauses ---
  const fetchClauses = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res: ListClausesResponse = await clausesApi.list(workspaceId, {
        search: debouncedSearch || undefined,
        category: selectedCategory || undefined,
        limit: PAGE_LIMIT,
      });
      setClauses(res.clauses);
      setTotal(res.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load clauses';
      // 404 means no clauses — not an error
      if (msg.includes('404')) {
        setClauses([]);
        setTotal(0);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, debouncedSearch, selectedCategory]);

  // --- Trigger fetch on open/refresh/filter changes ---
  useEffect(() => {
    if (open || embedded) {
      fetchClauses();
    }
  }, [open, embedded, fetchClauses, refreshKey]);

  // --- Panel classes ---
  const panelClasses = [
    'clause-library-panel',
    open ? 'open' : '',
    embedded ? 'embedded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={panelClasses}>
      {/* Header (non-embedded only) */}
      {!embedded && (
        <div className="clause-library-header">
          <span className="clause-library-title">Clause Library</span>
          <button className="clause-library-close" onClick={onClose} title="Close">
            {'\u2715'}
          </button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="clause-library-search">
        <input
          type="text"
          className="clause-library-search-input"
          placeholder="Search clauses..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="clause-library-filter-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as ClauseCategory | '')}
        >
          <option value="">All</option>
          <option value="general">General</option>
          <option value="legal">Legal</option>
          <option value="financial">Financial</option>
          <option value="boilerplate">Boilerplate</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {/* Content */}
      <div className="clause-library-content">
        {/* Loading skeleton */}
        {loading && (
          <div className="clause-library-skeleton">
            {[0, 1, 2].map(i => (
              <div key={i} className="clause-library-skeleton-card">
                <div className="clause-library-skeleton-line long" />
                <div className="clause-library-skeleton-line medium" />
                <div className="clause-library-skeleton-line short" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="clause-library-error">
            {error.includes('timed out') || error.includes('timeout')
              ? 'Request timed out. Please try again.'
              : error.includes('429') || error.includes('rate limit')
                ? 'Rate limited. Please wait a moment before retrying.'
                : error}
            <br />
            <button
              className="clause-library-error-retry"
              onClick={fetchClauses}
            >
              {error.includes('429') || error.includes('rate limit') ? 'Try again later' : 'Retry'}
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && clauses.length === 0 && (
          <div className="clause-library-empty">
            <div className="clause-library-empty-icon">{'\uD83D\uDCDA'}</div>
            <div className="clause-library-empty-text">
              {debouncedSearch || selectedCategory
                ? 'No clauses match your search. Try different keywords or clear the filter.'
                : 'No clauses yet. Save text from your documents to build your library.'}
            </div>
          </div>
        )}

        {/* Data state: clause list */}
        {!loading && !error && clauses.length > 0 && (
          <>
            <div className="clause-library-results-count">
              {total} {total === 1 ? 'clause' : 'clauses'}
              {(debouncedSearch || selectedCategory) ? ' found' : ''}
            </div>
            {clauses.map(clause => (
              <ClauseCard
                key={clause.id}
                clause={clause}
                onPreview={setPreviewClause}
                onInsert={onInsert}
              />
            ))}
          </>
        )}
      </div>

      {/* Preview Modal */}
      <ClausePreviewModal
        clause={previewClause}
        onClose={() => setPreviewClause(null)}
        onInsert={onInsert}
      />
    </div>
  );
}

export default memo(ClauseLibraryPanelInner);
