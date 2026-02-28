// KACHERI FRONTEND/src/components/TemplateGalleryModal.tsx
// Template Gallery Modal for creating documents from templates

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { templatesApi, type TemplateListItem } from '../api/templates';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './templateGalleryModal.css';

// Icon mapping for template types
const TEMPLATE_ICONS: Record<string, string> = {
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  'file-text': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  'clipboard-list': 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 M12 12h4 M12 16h4 M8 12h.01 M8 16h.01',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  briefcase: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
};

function TemplateIcon({ icon }: { icon: string }) {
  const path = TEMPLATE_ICONS[icon] || TEMPLATE_ICONS.file;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

export interface TemplateGalleryModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (templateId: string, title: string | undefined) => Promise<void>;
}

export const TemplateGalleryModal: React.FC<TemplateGalleryModalProps> = ({
  open,
  onClose,
  onSelectTemplate,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Load templates when modal opens
  useEffect(() => {
    if (open) {
      loadTemplates();
      setSelectedTemplate(null);
      setTitle('');
      setError(null);
    }
  }, [open]);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const data = await templatesApi.list();
      setTemplates(data.templates);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = useCallback(async () => {
    if (!selectedTemplate) return;

    setCreating(true);
    setError(null);
    try {
      await onSelectTemplate(selectedTemplate, title.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create document');
    } finally {
      setCreating(false);
    }
  }, [selectedTemplate, title, onSelectTemplate, onClose]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  const handleBackdropClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  const selectedTemplateName = templates.find(t => t.id === selectedTemplate)?.name || '';

  return (
    <div
      ref={dialogRef}
      className="template-gallery-backdrop"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-gallery-title"
    >
      <div
        className="template-gallery-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="template-gallery-header">
          <h2 id="template-gallery-title" className="template-gallery-title">
            Create New Document
          </h2>
          <button
            className="template-gallery-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Loading state */}
        {loading && (
          <div className="template-gallery-loading">Loading templates...</div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="template-gallery-error">{error}</div>
        )}

        {/* Template grid */}
        {!loading && !error && (
          <div className="template-gallery-grid">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                onClick={() => setSelectedTemplate(template.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedTemplate(template.id);
                  }
                }}
              >
                <div className="template-card-header">
                  <span className="template-card-icon">
                    <TemplateIcon icon={template.icon} />
                  </span>
                  <span className="template-card-name">{template.name}</span>
                </div>
                <p className="template-card-description">{template.description}</p>
                <span className="template-card-category">{template.category}</span>
              </div>
            ))}
          </div>
        )}

        {/* Title input (shown when template selected) */}
        {selectedTemplate && (
          <div className="template-gallery-title-section">
            <label className="template-gallery-title-label" htmlFor="doc-title">
              Document Title (optional)
            </label>
            <input
              id="doc-title"
              className="template-gallery-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedTemplateName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
          </div>
        )}

        {/* Footer */}
        <footer className="template-gallery-footer">
          <button
            className="template-gallery-cancel-btn"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            className="template-gallery-create-btn"
            onClick={handleCreate}
            disabled={!selectedTemplate || creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default TemplateGalleryModal;
