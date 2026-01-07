// KACHERI FRONTEND/src/components/AllDocsModal.tsx
// Modal for viewing all documents with orphan discovery and organization.

import React, { useState, useMemo, useEffect } from 'react';
import './allDocsModal.css';

type DocMeta = {
  id: string;
  title: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  allDocs: DocMeta[];
  docsInTree: Set<string>;
  loading?: boolean;
  error?: string | null;
  onOrganizeDoc: (docId: string, title: string) => void;
  onOpenDoc: (docId: string) => void;
};

export function AllDocsModal({
  open,
  onClose,
  allDocs,
  docsInTree,
  loading,
  error,
  onOrganizeDoc,
  onOpenDoc,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'in-tree' | 'orphaned'>('all');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setFilter('all');
    }
  }, [open]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filteredDocs = useMemo(() => {
    return allDocs.filter((doc) => {
      const inTree = docsInTree.has(doc.id);
      if (filter === 'in-tree' && !inTree) return false;
      if (filter === 'orphaned' && inTree) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const title = (doc.title ?? '').toLowerCase();
      return title.includes(q) || doc.id.toLowerCase().includes(q);
    });
  }, [allDocs, docsInTree, query, filter]);

  const orphanCount = useMemo(() => {
    return allDocs.filter((d) => !docsInTree.has(d.id)).length;
  }, [allDocs, docsInTree]);

  if (!open) return null;

  return (
    <div className="all-docs-backdrop" onClick={onClose}>
      <div className="all-docs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="all-docs-header">
          <h2 className="all-docs-title">
            All Documents ({allDocs.length})
            {orphanCount > 0 && (
              <span className="all-docs-orphan-badge">{orphanCount} orphaned</span>
            )}
          </h2>
          <button
            className="all-docs-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Search & Filters */}
        <div className="all-docs-controls">
          <input
            type="text"
            className="all-docs-search"
            placeholder="Search by title or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="all-docs-filters">
            <button
              type="button"
              className={`all-docs-filter-pill ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`all-docs-filter-pill ${filter === 'in-tree' ? 'active' : ''}`}
              onClick={() => setFilter('in-tree')}
            >
              In Folders
            </button>
            <button
              type="button"
              className={`all-docs-filter-pill ${filter === 'orphaned' ? 'active' : ''}`}
              onClick={() => setFilter('orphaned')}
            >
              Orphaned
            </button>
          </div>
        </div>

        {/* Document List */}
        <div className="all-docs-list">
          {loading && <div className="all-docs-status">Loading…</div>}
          {error && <div className="all-docs-status all-docs-error">{error}</div>}
          {!loading && !error && filteredDocs.length === 0 && (
            <div className="all-docs-status">No documents match your search.</div>
          )}
          {!loading &&
            !error &&
            filteredDocs.map((doc) => {
              const inTree = docsInTree.has(doc.id);
              return (
                <div
                  key={doc.id}
                  className={`all-docs-item ${!inTree ? 'orphaned' : ''}`}
                >
                  <div className="all-docs-item-main">
                    <button
                      type="button"
                      className="all-docs-item-title"
                      onClick={() => onOpenDoc(doc.id)}
                    >
                      {doc.title ?? 'Untitled'}
                    </button>
                    <span
                      className={`all-docs-status-pill ${inTree ? 'in-tree' : 'orphaned'}`}
                    >
                      {inTree ? 'In Folders' : 'Orphaned'}
                    </span>
                  </div>
                  <div className="all-docs-item-meta">
                    <span className="all-docs-item-id">
                      doc-{doc.id.slice(0, 8)}
                    </span>
                    {!inTree && (
                      <button
                        type="button"
                        className="all-docs-organize-btn"
                        onClick={() =>
                          onOrganizeDoc(doc.id, doc.title ?? 'Untitled')
                        }
                      >
                        Organize
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="all-docs-footer">
          <button type="button" className="bk-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default AllDocsModal;
