// KACHERI FRONTEND/src/components/PageSetupDialog.tsx
// Page Setup Dialog for document layout configuration

import React, { useEffect, useState } from 'react';
import './pageSetupDialog.css';

// Layout settings types (matches backend)
export type PageSize = 'a4' | 'letter' | 'legal';
export type Orientation = 'portrait' | 'landscape';

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface HeaderSettings {
  enabled: boolean;
  content: string;
  height: number;
}

export interface FooterSettings {
  enabled: boolean;
  content: string;
  height: number;
  showPageNumbers: boolean;
}

export interface LayoutSettings {
  pageSize: PageSize;
  orientation: Orientation;
  margins: Margins;
  header?: HeaderSettings;
  footer?: FooterSettings;
}

// Default layout settings
export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  pageSize: 'a4',
  orientation: 'portrait',
  margins: {
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
  },
};

// Page size dimensions in mm
const PAGE_SIZES: Record<PageSize, { width: number; height: number; label: string }> = {
  a4: { width: 210, height: 297, label: 'A4 (210 x 297 mm)' },
  letter: { width: 216, height: 279, label: 'Letter (8.5 x 11 in)' },
  legal: { width: 216, height: 356, label: 'Legal (8.5 x 14 in)' },
};

export interface PageSetupDialogProps {
  open: boolean;
  docId: string;
  initialSettings?: LayoutSettings;
  onClose: () => void;
  onApply: (settings: LayoutSettings) => Promise<void>;
}

export const PageSetupDialog: React.FC<PageSetupDialogProps> = ({
  open,
  docId: _docId,
  initialSettings,
  onClose,
  onApply,
}) => {
  const [settings, setSettings] = useState<LayoutSettings>(
    initialSettings ?? DEFAULT_LAYOUT_SETTINGS
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSettings(initialSettings ?? DEFAULT_LAYOUT_SETTINGS);
      setError(null);
    }
  }, [open, initialSettings]);

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

  const handleApply = async () => {
    setSaving(true);
    setError(null);
    try {
      await onApply(settings);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save layout settings');
    } finally {
      setSaving(false);
    }
  };

  const updateMargin = (key: keyof Margins, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setSettings(prev => ({
        ...prev,
        margins: { ...prev.margins, [key]: num },
      }));
    }
  };

  const updateHeader = (updates: Partial<HeaderSettings>) => {
    setSettings(prev => ({
      ...prev,
      header: {
        enabled: prev.header?.enabled ?? false,
        content: prev.header?.content ?? '',
        height: prev.header?.height ?? 15,
        ...updates,
      },
    }));
  };

  const updateFooter = (updates: Partial<FooterSettings>) => {
    setSettings(prev => ({
      ...prev,
      footer: {
        enabled: prev.footer?.enabled ?? false,
        content: prev.footer?.content ?? '',
        height: prev.footer?.height ?? 15,
        showPageNumbers: prev.footer?.showPageNumbers ?? true,
        ...updates,
      },
    }));
  };

  if (!open) return null;

  // Calculate preview dimensions
  const pageSize = PAGE_SIZES[settings.pageSize];
  const isLandscape = settings.orientation === 'landscape';
  const previewScale = 0.4; // Scale factor for preview

  return (
    <div
      className="page-setup-backdrop"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-setup-title"
    >
      <div
        className="page-setup-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="page-setup-header">
          <h2 id="page-setup-title" className="page-setup-title">
            Page Setup
          </h2>
          <button
            className="page-setup-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Error message */}
        {error && <div className="page-setup-error">{error}</div>}

        {/* Page Preview */}
        <div className="page-setup-preview">
          <div
            className={`page-setup-preview-page ${settings.orientation}`}
            style={{
              width: (isLandscape ? pageSize.height : pageSize.width) * previewScale,
              height: (isLandscape ? pageSize.width : pageSize.height) * previewScale,
            }}
          >
            {/* Margins visualization */}
            <div
              className="page-setup-preview-margins"
              style={{
                top: settings.margins.top * previewScale,
                right: settings.margins.right * previewScale,
                bottom: settings.margins.bottom * previewScale,
                left: settings.margins.left * previewScale,
              }}
            />
            {/* Header visualization */}
            {settings.header?.enabled && (
              <div
                className="page-setup-preview-header"
                style={{ height: (settings.header.height || 15) * previewScale }}
              />
            )}
            {/* Footer visualization */}
            {settings.footer?.enabled && (
              <div
                className="page-setup-preview-footer"
                style={{ height: (settings.footer.height || 15) * previewScale }}
              />
            )}
          </div>
        </div>

        {/* Page Size & Orientation */}
        <div className="page-setup-section">
          <h3 className="page-setup-section-title">Page</h3>
          <div className="page-setup-row">
            <div className="page-setup-field flex-1">
              <label className="page-setup-label">Size</label>
              <select
                className="page-setup-select"
                value={settings.pageSize}
                onChange={(e) => setSettings(prev => ({ ...prev, pageSize: e.target.value as PageSize }))}
              >
                {Object.entries(PAGE_SIZES).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="page-setup-field">
              <label className="page-setup-label">Orientation</label>
              <div className="page-setup-radio-group">
                <label className="page-setup-radio">
                  <input
                    type="radio"
                    name="orientation"
                    checked={settings.orientation === 'portrait'}
                    onChange={() => setSettings(prev => ({ ...prev, orientation: 'portrait' }))}
                  />
                  <span className="page-setup-radio-label">Portrait</span>
                </label>
                <label className="page-setup-radio">
                  <input
                    type="radio"
                    name="orientation"
                    checked={settings.orientation === 'landscape'}
                    onChange={() => setSettings(prev => ({ ...prev, orientation: 'landscape' }))}
                  />
                  <span className="page-setup-radio-label">Landscape</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Margins */}
        <div className="page-setup-section">
          <h3 className="page-setup-section-title">Margins</h3>
          <div className="page-setup-margins-grid">
            {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <div key={side} className="page-setup-margin-field">
                <label className="page-setup-margin-label">
                  {side.charAt(0).toUpperCase() + side.slice(1)}
                </label>
                <input
                  type="number"
                  className="page-setup-margin-input"
                  value={settings.margins[side]}
                  onChange={(e) => updateMargin(side, e.target.value)}
                  min="0"
                  max="100"
                  step="1"
                />
                <span className="page-setup-margin-unit">mm</span>
              </div>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="page-setup-section">
          <div className="page-setup-toggle-row">
            <label className="page-setup-toggle-label">
              <input
                type="checkbox"
                checked={settings.header?.enabled ?? false}
                onChange={(e) => updateHeader({ enabled: e.target.checked })}
              />
              Header
            </label>
            <div className="page-setup-height-field">
              <label className="page-setup-height-label">Height:</label>
              <input
                type="number"
                className="page-setup-height-input"
                value={settings.header?.height ?? 15}
                onChange={(e) => updateHeader({ height: parseFloat(e.target.value) || 15 })}
                disabled={!settings.header?.enabled}
                min="5"
                max="50"
              />
              <span className="page-setup-margin-unit">mm</span>
            </div>
          </div>
          <div className={`page-setup-content-field ${!settings.header?.enabled ? 'page-setup-disabled' : ''}`}>
            <input
              type="text"
              className="page-setup-content-input"
              placeholder="Header content (e.g., document title, date)"
              value={settings.header?.content ?? ''}
              onChange={(e) => updateHeader({ content: e.target.value })}
              disabled={!settings.header?.enabled}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="page-setup-section">
          <div className="page-setup-toggle-row">
            <label className="page-setup-toggle-label">
              <input
                type="checkbox"
                checked={settings.footer?.enabled ?? false}
                onChange={(e) => updateFooter({ enabled: e.target.checked })}
              />
              Footer
            </label>
            <div className="page-setup-height-field">
              <label className="page-setup-height-label">Height:</label>
              <input
                type="number"
                className="page-setup-height-input"
                value={settings.footer?.height ?? 15}
                onChange={(e) => updateFooter({ height: parseFloat(e.target.value) || 15 })}
                disabled={!settings.footer?.enabled}
                min="5"
                max="50"
              />
              <span className="page-setup-margin-unit">mm</span>
            </div>
          </div>
          <div className={`page-setup-content-field ${!settings.footer?.enabled ? 'page-setup-disabled' : ''}`}>
            <input
              type="text"
              className="page-setup-content-input"
              placeholder="Footer content"
              value={settings.footer?.content ?? ''}
              onChange={(e) => updateFooter({ content: e.target.value })}
              disabled={!settings.footer?.enabled}
            />
          </div>
          <div className={`page-setup-page-numbers ${!settings.footer?.enabled ? 'page-setup-disabled' : ''}`}>
            <label className="page-setup-toggle-label">
              <input
                type="checkbox"
                checked={settings.footer?.showPageNumbers ?? true}
                onChange={(e) => updateFooter({ showPageNumbers: e.target.checked })}
                disabled={!settings.footer?.enabled}
              />
              Show page numbers
            </label>
          </div>
        </div>

        {/* Footer actions */}
        <footer className="page-setup-footer">
          <button className="page-setup-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="page-setup-btn page-setup-btn-primary"
            onClick={handleApply}
            disabled={saving}
          >
            {saving ? 'Applying...' : 'Apply'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PageSetupDialog;
