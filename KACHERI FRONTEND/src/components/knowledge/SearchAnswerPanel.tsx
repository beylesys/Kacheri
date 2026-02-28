// KACHERI FRONTEND/src/components/knowledge/SearchAnswerPanel.tsx
// Displays AI-generated answer with citations, proof badge, and duration.
// Shows loading skeleton during semantic search.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 15

import type { SemanticSearchResponse } from '../../types/knowledge';
import SearchResultCard from './SearchResultCard';
import './knowledge.css';

type Props = {
  result: SemanticSearchResponse | null;
  loading: boolean;
};

export default function SearchAnswerPanel({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="search-answer-panel">
        <div className="search-answer-loading">
          <div className="search-answer-loading-spinner" />
          <span className="search-answer-loading-text">
            Searching your documents with AI...
          </span>
        </div>
        <div className="related-docs-skeleton">
          <div className="related-docs-skeleton-line long" />
          <div className="related-docs-skeleton-line medium" />
          <div className="related-docs-skeleton-line short" />
          <div className="related-docs-skeleton-card" />
          <div className="related-docs-skeleton-card" />
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="search-answer-panel">
      {/* Answer section */}
      {result.answer && (
        <div className="search-answer-block">
          <div className="search-answer-label">AI Answer</div>
          <div className="search-answer-text">
            {renderAnswerWithCitations(result.answer)}
          </div>
          <div className="search-answer-meta">
            <span className="search-answer-meta-item">
              {result.resultCount} result{result.resultCount !== 1 ? 's' : ''}
            </span>
            <span className="search-answer-meta-item">
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
            {result.proofId && (
              <span className="search-answer-proof-badge" title={`Proof: ${result.proofId}`}>
                Proofed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Results list */}
      {result.results.length > 0 && (
        <div className="search-results-list">
          <div className="search-results-heading">
            Documents ({result.results.length})
          </div>
          {result.results.map((r, i) => (
            <SearchResultCard
              key={r.docId}
              result={r}
              index={i + 1}
            />
          ))}
        </div>
      )}

      {/* No results */}
      {result.results.length === 0 && (
        <div className="search-no-results">
          No documents matched your query. Try different search terms or index more documents.
        </div>
      )}
    </div>
  );
}

/**
 * Render answer text, converting `[Doc N]` citations into styled inline badges.
 */
function renderAnswerWithCitations(answer: string): React.ReactNode {
  const parts = answer.split(/(\[Doc \d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[Doc (\d+)\]$/);
    if (match) {
      return (
        <span key={i} className="search-answer-citation" title={`See result #${match[1]}`}>
          [{match[1]}]
        </span>
      );
    }
    return part;
  });
}
