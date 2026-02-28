// KACHERI FRONTEND/src/components/studio/SlideLayoutPicker.tsx
// Modal gallery for selecting pre-built slide layouts (MC3).
// Follows TemplateGallery pattern: overlay + focus-trapped dialog + grid of cards.
// Supports two modes: 'create' (new frame from layout) and 'apply' (replace active frame content).
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice MC3

import { useRef, useCallback } from 'react';
import { SLIDE_LAYOUTS } from './layouts';
import type { SlideLayoutPreset } from './layouts';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './slideLayouts.css';

export interface SlideLayoutPickerProps {
  open: boolean;
  onClose: () => void;
  /** 'create' = make new frame from layout; 'apply' = replace active frame content */
  mode: 'create' | 'apply';
  /** Called in 'create' mode with complete <kcl-slide> code */
  onCreateFromLayout: (code: string) => void;
  /** Called in 'apply' mode with inner KCL (no slide wrapper) */
  onApplyLayout: (innerKcl: string) => void;
}

// ── Miniature preview renderers ──
// Each layout gets a schematic CSS preview showing its structure.

function renderPreview(preset: SlideLayoutPreset): React.ReactNode {
  switch (preset.id) {
    case 'title-slide':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-block layout-preview-block--heading" />
          <div className="layout-preview-block layout-preview-block--text" />
        </div>
      );

    case 'title-content':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-block layout-preview-block--heading" />
          <div className="layout-preview-block layout-preview-block--text" />
          <div className="layout-preview-block layout-preview-block--text" style={{ width: '75%' }} />
          <div className="layout-preview-block layout-preview-block--text" style={{ width: '60%' }} />
        </div>
      );

    case 'two-column':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-col">
            <div className="layout-preview-block layout-preview-block--heading" />
            <div className="layout-preview-block layout-preview-block--text" />
            <div className="layout-preview-block layout-preview-block--text" style={{ width: '70%' }} />
          </div>
          <div className="layout-preview-col">
            <div className="layout-preview-block layout-preview-block--heading" />
            <div className="layout-preview-block layout-preview-block--text" />
            <div className="layout-preview-block layout-preview-block--text" style={{ width: '70%' }} />
          </div>
        </div>
      );

    case 'image-text':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-block layout-preview-block--image" />
          <div className="layout-preview-col">
            <div className="layout-preview-block layout-preview-block--heading" />
            <div className="layout-preview-block layout-preview-block--text" />
            <div className="layout-preview-block layout-preview-block--text" />
          </div>
        </div>
      );

    case 'text-image':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-col">
            <div className="layout-preview-block layout-preview-block--heading" />
            <div className="layout-preview-block layout-preview-block--text" />
            <div className="layout-preview-block layout-preview-block--text" />
          </div>
          <div className="layout-preview-block layout-preview-block--image" />
        </div>
      );

    case 'bullet-list':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-block layout-preview-block--heading" />
          <div className="layout-preview-bullets">
            <div className="layout-preview-bullet">
              <div className="layout-preview-bullet-dot" />
              <div className="layout-preview-bullet-line" style={{ width: '80%' }} />
            </div>
            <div className="layout-preview-bullet">
              <div className="layout-preview-bullet-dot" />
              <div className="layout-preview-bullet-line" style={{ width: '65%' }} />
            </div>
            <div className="layout-preview-bullet">
              <div className="layout-preview-bullet-dot" />
              <div className="layout-preview-bullet-line" style={{ width: '75%' }} />
            </div>
            <div className="layout-preview-bullet">
              <div className="layout-preview-bullet-dot" />
              <div className="layout-preview-bullet-line" style={{ width: '55%' }} />
            </div>
          </div>
        </div>
      );

    case 'full-image':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-block layout-preview-block--image" />
          <div className="layout-preview-block layout-preview-block--heading" />
        </div>
      );

    case 'comparison':
      return (
        <div className="layout-preview-frame">
          <div className="layout-preview-block layout-preview-block--heading" />
          <div className="layout-preview-row">
            <div className="layout-preview-col">
              <div className="layout-preview-block layout-preview-block--accent" />
              <div className="layout-preview-block layout-preview-block--text" />
              <div className="layout-preview-block layout-preview-block--text" />
            </div>
            <div className="layout-preview-divider" />
            <div className="layout-preview-col">
              <div className="layout-preview-block layout-preview-block--accent" />
              <div className="layout-preview-block layout-preview-block--text" />
              <div className="layout-preview-block layout-preview-block--text" />
            </div>
          </div>
        </div>
      );

    case 'quote':
      return (
        <div className="layout-preview-frame">
          <span className="layout-preview-quote-mark" aria-hidden="true">{'\u201C'}</span>
          <div className="layout-preview-block layout-preview-block--text" />
          <div className="layout-preview-block layout-preview-block--accent" />
        </div>
      );

    default:
      return (
        <div className="layout-preview-frame" />
      );
  }
}

// ── Component ──

export function SlideLayoutPicker({
  open,
  onClose,
  mode,
  onCreateFromLayout,
  onApplyLayout,
}: SlideLayoutPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const handleSelect = useCallback(
    (preset: SlideLayoutPreset) => {
      if (mode === 'create') {
        onCreateFromLayout(preset.generateSlide());
      } else {
        onApplyLayout(preset.generateInner());
      }
      onClose();
    },
    [mode, onCreateFromLayout, onApplyLayout, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="slide-layout-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="slide-layout-picker"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'create' ? 'Choose a slide layout' : 'Apply a layout to this frame'}
      >
        {/* Header */}
        <div className="slide-layout-header">
          <span className="slide-layout-title">
            {mode === 'create' ? 'New Frame from Layout' : 'Apply Layout'}
          </span>
          <button
            className="slide-layout-close"
            onClick={onClose}
            aria-label="Close"
          >
            &#x2715;
          </button>
        </div>

        {/* Grid */}
        <div className="slide-layout-grid">
          {SLIDE_LAYOUTS.map((preset) => (
            <div
              key={preset.id}
              className={`slide-layout-card ${preset.previewClass}`}
              onClick={() => handleSelect(preset)}
              role="button"
              tabIndex={0}
              aria-label={`${mode === 'create' ? 'Create frame with' : 'Apply'} ${preset.label} layout`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(preset);
                }
              }}
            >
              <div className="slide-layout-card-preview" aria-hidden="true">
                {renderPreview(preset)}
              </div>
              <div className="slide-layout-card-body">
                <div className="slide-layout-card-label">{preset.label}</div>
                <div className="slide-layout-card-desc">{preset.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
