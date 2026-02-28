// KACHERI FRONTEND/src/components/knowledge/SemanticSearchBar.tsx
// Search bar with dual mode: Quick (FTS5, fast) and Semantic (AI, slower).
// Text input with "Ask" button, mode toggle pills, loading/error states.
// Dispatches results to parent via callbacks.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 15

import { useState, useRef, useCallback } from 'react';
import { knowledgeApi } from '../../api/knowledge';
import type {
  SemanticSearchResponse,
  KeywordSearchResponse,
} from '../../types/knowledge';
import './knowledge.css';

type SearchMode = 'quick' | 'semantic';

type Props = {
  workspaceId: string;
  onSemanticResult?: (result: SemanticSearchResponse) => void;
  onKeywordResult?: (result: KeywordSearchResponse) => void;
  onLoadingChange?: (loading: boolean) => void;
  onClear?: () => void;
  compact?: boolean;
  /** Pre-fill the search input (e.g. from recent query click) */
  initialQuery?: string;
};

export default function SemanticSearchBar({
  workspaceId,
  onSemanticResult,
  onKeywordResult,
  onLoadingChange,
  onClear,
  compact,
  initialQuery,
}: Props) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [mode, setMode] = useState<SearchMode>('semantic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const setLoadingState = useCallback(
    (v: boolean) => {
      setLoading(v);
      onLoadingChange?.(v);
    },
    [onLoadingChange],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoadingState(true);
    setError(null);

    try {
      if (mode === 'semantic') {
        const result = await knowledgeApi.semanticSearch(workspaceId, {
          query: trimmed,
          limit: 10,
        });
        onSemanticResult?.(result);
      } else {
        const result = await knowledgeApi.keywordSearch(workspaceId, trimmed, 20);
        onKeywordResult?.(result);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search failed. Please try again.';
      setError(msg);
    } finally {
      setLoadingState(false);
    }
  }, [query, mode, loading, workspaceId, onSemanticResult, onKeywordResult, setLoadingState]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClear = () => {
    setQuery('');
    setError(null);
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <div className={`semantic-search-bar${compact ? ' compact' : ''}`}>
      {/* Mode toggle */}
      <div className="semantic-search-mode">
        <button
          type="button"
          className={`semantic-search-mode-pill${mode === 'semantic' ? ' active' : ''}`}
          onClick={() => setMode('semantic')}
          disabled={loading}
          title="AI-powered semantic search — slower but understands natural language"
        >
          Semantic
        </button>
        <button
          type="button"
          className={`semantic-search-mode-pill${mode === 'quick' ? ' active' : ''}`}
          onClick={() => setMode('quick')}
          disabled={loading}
          title="Fast keyword search via FTS5 — instant results"
        >
          Quick
        </button>
      </div>

      {/* Input row */}
      <div className="semantic-search-input-row">
        <input
          ref={inputRef}
          type="text"
          className="semantic-search-input"
          placeholder={
            mode === 'semantic'
              ? 'Ask about your documents...'
              : 'Search entities and documents...'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoComplete="off"
        />
        {query && !loading && (
          <button
            type="button"
            className="semantic-search-clear"
            onClick={handleClear}
            title="Clear search"
          >
            &times;
          </button>
        )}
        <button
          type="button"
          className={`semantic-search-submit${loading ? ' loading' : ''}`}
          onClick={handleSubmit}
          disabled={!query.trim() || loading}
        >
          {loading ? (
            <span className="semantic-search-spinner" />
          ) : mode === 'semantic' ? (
            'Ask'
          ) : (
            'Search'
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="semantic-search-error">
          {error}
          <button
            type="button"
            className="semantic-search-error-retry"
            onClick={handleSubmit}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
