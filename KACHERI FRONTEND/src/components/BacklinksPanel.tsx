// KACHERI FRONTEND/src/components/BacklinksPanel.tsx
// Panel showing documents that link TO the current document (backlinks).

import React from 'react';
import { useBacklinks } from '../hooks/useBacklinks';
import './backlinksPanel.css';

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
};

export function BacklinksPanel({
  docId,
  open,
  onClose,
  refreshKey = 0,
}: Props) {
  const { backlinks, count, loading, error } = useBacklinks(docId, refreshKey);

  return (
    <aside
      className={`backlinks-panel ${open ? 'open' : ''}`}
      role="complementary"
      aria-label="Backlinks"
      aria-expanded={open}
    >
      <header className="backlinks-header">
        <h3 className="backlinks-title">Backlinks ({count})</h3>
        <button
          className="backlinks-close"
          onClick={onClose}
          aria-label="Close backlinks panel"
        >
          ×
        </button>
      </header>

      <div className="backlinks-list">
        {loading && (
          <div className="backlinks-status">Loading…</div>
        )}

        {error && (
          <div className="backlinks-status backlinks-error">{error}</div>
        )}

        {!loading && !error && backlinks.length === 0 && (
          <div className="backlinks-status">
            No documents link to this one yet
          </div>
        )}

        {!loading && !error && backlinks.map((link) => (
          <a
            key={link.id}
            className="backlinks-item"
            href={`/doc/${link.fromDocId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="backlinks-item-icon">📄</span>
            <div className="backlinks-item-content">
              <span className="backlinks-item-title">
                {link.fromDocTitle || 'Untitled'}
              </span>
              {link.linkText && (
                <span className="backlinks-item-text">
                  "{link.linkText}"
                </span>
              )}
            </div>
          </a>
        ))}
      </div>
    </aside>
  );
}

export default BacklinksPanel;
