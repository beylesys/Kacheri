// KACHERI FRONTEND/src/components/knowledge/SearchResultCard.tsx
// Individual search result card showing doc title, relevance badge,
// snippets with highlight rendering, and matched entities as chips.
//
// Used for both semantic search results and keyword document results.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 15

import type { SearchResult } from '../../types/knowledge';
import EntityChip from './EntityChip';
import './knowledge.css';

type Props = {
  result: SearchResult;
  /** Optional 1-based index label (e.g. "1", "2") */
  index?: number;
};

function relevanceClass(relevance: number): string {
  if (relevance >= 0.7) return 'high';
  if (relevance >= 0.4) return 'medium';
  return 'low';
}

export default function SearchResultCard({ result, index }: Props) {
  const pct = Math.round(result.relevance * 100);

  return (
    <a
      className="search-result-card"
      href={`/doc/${result.docId}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open "${result.docTitle || 'Untitled'}" in a new tab`}
    >
      {/* Header: index + title + relevance */}
      <div className="search-result-card-header">
        {index !== undefined && (
          <span className="search-result-card-index">{index}</span>
        )}
        <span className="search-result-card-title">
          {result.docTitle || 'Untitled'}
        </span>
        <span className={`search-result-card-relevance ${relevanceClass(result.relevance)}`}>
          {pct}%
        </span>
      </div>

      {/* Snippets */}
      {result.snippets.length > 0 && (
        <div className="search-result-snippets">
          {result.snippets.slice(0, 3).map((snippet, i) => (
            <div key={i} className="search-result-snippet">
              <span
                className="search-result-snippet-text"
                dangerouslySetInnerHTML={{ __html: sanitizeSnippet(snippet.text) }}
              />
              {snippet.fieldPath && (
                <span className="search-result-snippet-field">
                  {snippet.fieldPath}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Matched entities */}
      {result.matchedEntities.length > 0 && (
        <div className="search-result-entities">
          {result.matchedEntities.slice(0, 5).map((name, i) => (
            <EntityChip key={`${name}-${i}`} name={name} entityType="term" />
          ))}
          {result.matchedEntities.length > 5 && (
            <span className="entity-chip-overflow">
              +{result.matchedEntities.length - 5}
            </span>
          )}
        </div>
      )}
    </a>
  );
}

/**
 * Sanitize snippet HTML — only allow <mark> tags for highlights.
 * Strips all other HTML to prevent XSS.
 */
function sanitizeSnippet(html: string): string {
  return html
    .replace(/<(?!\/?mark\b)[^>]*>/gi, '')
    .replace(/&(?!amp;|lt;|gt;|quot;|#39;)/g, '&amp;');
}
