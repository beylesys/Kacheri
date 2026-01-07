// KACHERI FRONTEND/src/components/DocPickerModal.tsx
// Modal for selecting a document to link to (cross-doc links)

import React, { useEffect, useState } from "react";
import { DocsAPI, type DocMeta } from "../api";
import "./docPickerModal.css";

export interface DocPickerModalProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Called when user closes the modal */
  onClose: () => void;
  /** Called when user selects a document */
  onSelect: (doc: { id: string; title: string }) => void;
  /** Exclude this doc from the list (typically the current doc) */
  excludeDocId?: string;
  /** Modal title (defaults to "Link to Document") */
  title?: string;
}

export const DocPickerModal: React.FC<DocPickerModalProps> = ({
  open,
  onClose,
  onSelect,
  excludeDocId,
  title = "Link to Document",
}) => {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<DocMeta | null>(null);

  // Fetch docs when modal opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setQuery("");
    setSelectedDoc(null);

    DocsAPI.list()
      .then((list) => setDocs(list))
      .catch((err) => setError(err?.message || "Failed to load documents"))
      .finally(() => setLoading(false));
  }, [open]);

  // Filter docs by search query
  const filteredDocs = docs.filter((d) => {
    if (d.id === excludeDocId) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (d.title ?? "").toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q)
    );
  });

  const handleConfirm = () => {
    if (selectedDoc) {
      onSelect({ id: selectedDoc.id, title: selectedDoc.title });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
    // Allow Enter to confirm when a doc is selected
    if (e.key === "Enter" && selectedDoc) {
      e.preventDefault();
      handleConfirm();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!open) return null;

  return (
    <div
      className="bk-modal-backdrop"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-picker-title"
    >
      <div
        className="bk-modal doc-picker-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="bk-modal-header doc-picker-header">
          <h2 id="doc-picker-title" className="bk-modal-title">
            {title}
          </h2>
          <button
            className="doc-picker-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="doc-picker-search">
          <input
            className="bk-modal-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or ID..."
            autoFocus
          />
        </div>

        <div className="doc-picker-list">
          {loading && <div className="doc-picker-status">Loading…</div>}
          {error && <div className="doc-picker-status doc-picker-error">{error}</div>}
          {!loading && !error && filteredDocs.length === 0 && (
            <div className="doc-picker-status">No documents found</div>
          )}
          {!loading &&
            !error &&
            filteredDocs.map((doc) => (
              <button
                key={doc.id}
                className={`doc-picker-item ${
                  selectedDoc?.id === doc.id ? "selected" : ""
                }`}
                onClick={() => setSelectedDoc(doc)}
                onDoubleClick={() => {
                  setSelectedDoc(doc);
                  onSelect({ id: doc.id, title: doc.title });
                }}
              >
                <span className="doc-picker-item-title">
                  {doc.title || "Untitled"}
                </span>
                <span className="doc-picker-item-id">{doc.id}</span>
              </button>
            ))}
        </div>

        <footer className="bk-modal-actions">
          <button className="bk-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="bk-button bk-button-primary"
            onClick={handleConfirm}
            disabled={!selectedDoc}
          >
            Insert Link
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DocPickerModal;
