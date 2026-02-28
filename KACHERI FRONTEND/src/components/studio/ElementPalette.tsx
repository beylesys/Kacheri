// KACHERI FRONTEND/src/components/studio/ElementPalette.tsx
// Element palette sidebar for Visual Mode (MC1 + MC3).
// Provides insert buttons for text blocks, images, shapes, and dividers.
// MC3 adds layout entry points: "From Layout..." for new frames, "Apply Layout..."
// for existing frames. Each insertion generates valid KCL code that is editable
// in Code Mode and enhanceable by AI Mode. Works fully offline — no backend dependency.
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slices MC1, MC3

import { useState, useCallback } from 'react';

type AspectPreset = '16:9' | '4:3' | 'a4-portrait' | 'a4-landscape';

interface ElementPaletteProps {
  onInsertElement: (elementKcl: string) => void;
  onCreateBlankFrame: (aspectPreset: AspectPreset) => void;
  hasActiveFrame: boolean;
  /** MC3: Opens the layout picker in 'create' or 'apply' mode */
  onOpenLayoutPicker?: (mode: 'create' | 'apply') => void;
}

// ── Unique ID generator ──
let _visualCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_visualCounter).toString(36)}`;
}

// ── KCL Element Templates ──

interface TextPreset {
  readonly label: string;
  readonly level: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly content: string;
}

const TEXT_PRESETS: readonly TextPreset[] = [
  { label: 'Heading', level: 'h1', fontSize: '48', fontWeight: '700', content: 'Heading' },
  { label: 'Subheading', level: 'h2', fontSize: '32', fontWeight: '600', content: 'Subheading' },
  { label: 'Body Text', level: 'p', fontSize: '18', fontWeight: '400', content: 'Body text goes here.' },
  { label: 'Caption', level: 'p', fontSize: '14', fontWeight: '400', content: 'Caption text' },
];

function generateTextKcl(preset: TextPreset): string {
  const id = uid('text');
  return `<kcl-text id="${id}" level="${preset.level}" font-size="${preset.fontSize}" font-weight="${preset.fontWeight}" align="left" color="#ffffff">${preset.content}</kcl-text>`;
}

function generateImageKcl(src: string, alt: string): string {
  const id = uid('img');
  const safeSrc = src.replace(/"/g, '&quot;');
  const safeAlt = alt.replace(/"/g, '&quot;');
  return `<kcl-image id="${id}" src="${safeSrc}" alt="${safeAlt}" fit="contain" aspect-ratio="16/9"></kcl-image>`;
}

interface ShapePreset {
  readonly label: string;
  readonly style: string;
  readonly useLayout?: boolean;
}

const SHAPE_PRESETS: readonly ShapePreset[] = [
  {
    label: 'Rectangle',
    style: 'width: 200px; height: 120px; background: rgba(99, 102, 241, 0.3); border: 2px solid #6366f1; border-radius: 8px;',
  },
  {
    label: 'Circle',
    style: 'width: 120px; height: 120px; background: rgba(16, 185, 129, 0.3); border: 2px solid #10b981; border-radius: 50%;',
  },
  {
    label: 'Line',
    style: 'width: 200px; height: 2px; background: #94a3b8;',
  },
  {
    label: 'Arrow',
    style: '',
    useLayout: true,
  },
];

function generateShapeKcl(preset: ShapePreset): string {
  const id = uid('shape');
  if (preset.useLayout) {
    // Arrow: a line with a triangle on the right end, using kcl-layout
    return `<kcl-layout id="${id}" type="flex" direction="row" align="center" gap="0">\n  <div style="flex: 1; height: 2px; background: #94a3b8;"></div>\n  <div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #94a3b8;"></div>\n</kcl-layout>`;
  }
  return `<div id="${id}" style="${preset.style}"></div>`;
}

interface DividerPreset {
  readonly label: string;
  readonly style: string;
}

const DIVIDER_PRESETS: readonly DividerPreset[] = [
  { label: 'Simple Rule', style: 'width: 100%; height: 1px; background: #475569; margin: 16px 0;' },
  { label: 'Thick Rule', style: 'width: 100%; height: 3px; background: #6366f1; margin: 16px 0; border-radius: 2px;' },
  { label: 'Dotted', style: 'width: 100%; height: 0; border-top: 2px dotted #475569; margin: 16px 0;' },
  { label: 'Gradient', style: 'width: 100%; height: 2px; background: linear-gradient(to right, transparent, #6366f1, transparent); margin: 16px 0;' },
];

function generateDividerKcl(preset: DividerPreset): string {
  const id = uid('div');
  return `<div id="${id}" role="separator" style="${preset.style}"></div>`;
}

// ── Aspect preset labels ──
const ASPECT_LABELS: Record<AspectPreset, string> = {
  '16:9': '16:9',
  '4:3': '4:3',
  'a4-portrait': 'A4 Portrait',
  'a4-landscape': 'A4 Landscape',
};

const ASPECT_PRESETS: readonly AspectPreset[] = ['16:9', '4:3', 'a4-portrait', 'a4-landscape'];

// ── Shape icon characters ──
const SHAPE_ICONS: Record<string, string> = {
  Rectangle: '\u25A1',
  Circle: '\u25CB',
  Line: '\u2500',
  Arrow: '\u2192',
};

// ── Component ──

export function ElementPalette({
  onInsertElement,
  onCreateBlankFrame,
  hasActiveFrame,
  onOpenLayoutPicker,
}: ElementPaletteProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);

  // Collapsible section state
  const [sections, setSections] = useState({
    frame: true,
    layouts: true,
    text: true,
    image: true,
    shape: false,
    divider: false,
  });

  const toggleSection = useCallback((key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleInsertImage = useCallback(() => {
    if (!imageUrl.trim()) return;
    onInsertElement(generateImageKcl(imageUrl.trim(), imageAlt.trim() || 'Image'));
    setImageUrl('');
    setImageAlt('');
    setShowImageInput(false);
  }, [imageUrl, imageAlt, onInsertElement]);

  const handleImageKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleInsertImage();
      }
    },
    [handleInsertImage],
  );

  return (
    <div className="element-palette">
      {/* ── New Frame section ── */}
      <div className="element-palette-section">
        <button
          className="element-palette-section-header"
          onClick={() => toggleSection('frame')}
          aria-expanded={sections.frame}
        >
          <span className="element-palette-section-arrow">
            {sections.frame ? '\u25BC' : '\u25B6'}
          </span>
          <span>New Frame</span>
        </button>
        {sections.frame && (
          <div className="element-palette-section-body">
            <div className="element-palette-frame-grid">
              {ASPECT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className="element-palette-frame-btn"
                  onClick={() => onCreateBlankFrame(preset)}
                  title={`Create blank ${ASPECT_LABELS[preset]} frame`}
                >
                  <div
                    className={`element-palette-frame-preview ep-frame-${preset.replace(':', '-')}`}
                  />
                  <span className="element-palette-frame-label">
                    {ASPECT_LABELS[preset]}
                  </span>
                </button>
              ))}
            </div>
            {/* MC3: Create frame from pre-built layout */}
            {onOpenLayoutPicker && (
              <button
                className="element-palette-item"
                onClick={() => onOpenLayoutPicker('create')}
                title="Create a new frame from a pre-built layout"
                style={{ marginTop: 6 }}
              >
                <span className="element-palette-item-icon">{'\u2B1A'}</span>
                <span className="element-palette-item-label">From Layout...</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── MC3: Layouts section ── */}
      {onOpenLayoutPicker && (
        <div className="element-palette-section">
          <button
            className="element-palette-section-header"
            onClick={() => toggleSection('layouts')}
            aria-expanded={sections.layouts}
          >
            <span className="element-palette-section-arrow">
              {sections.layouts ? '\u25BC' : '\u25B6'}
            </span>
            <span>Layouts</span>
          </button>
          {sections.layouts && (
            <div className="element-palette-section-body">
              <button
                className="element-palette-item"
                onClick={() => onOpenLayoutPicker('apply')}
                disabled={!hasActiveFrame}
                title={
                  hasActiveFrame
                    ? 'Apply a pre-built layout to the current frame'
                    : 'Create a frame first'
                }
              >
                <span className="element-palette-item-icon">{'\u2B1A'}</span>
                <span className="element-palette-item-label">Apply Layout...</span>
                <span className="element-palette-item-meta">replace content</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Text section ── */}
      <div className="element-palette-section">
        <button
          className="element-palette-section-header"
          onClick={() => toggleSection('text')}
          aria-expanded={sections.text}
        >
          <span className="element-palette-section-arrow">
            {sections.text ? '\u25BC' : '\u25B6'}
          </span>
          <span>Text</span>
        </button>
        {sections.text && (
          <div className="element-palette-section-body">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="element-palette-item"
                onClick={() => onInsertElement(generateTextKcl(preset))}
                disabled={!hasActiveFrame}
                title={
                  hasActiveFrame
                    ? `Insert ${preset.label}`
                    : 'Create a frame first'
                }
              >
                <span className="element-palette-item-icon">T</span>
                <span className="element-palette-item-label">
                  {preset.label}
                </span>
                <span className="element-palette-item-meta">
                  {preset.level} / {preset.fontSize}px
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Image section ── */}
      <div className="element-palette-section">
        <button
          className="element-palette-section-header"
          onClick={() => toggleSection('image')}
          aria-expanded={sections.image}
        >
          <span className="element-palette-section-arrow">
            {sections.image ? '\u25BC' : '\u25B6'}
          </span>
          <span>Image</span>
        </button>
        {sections.image && (
          <div className="element-palette-section-body">
            <button
              className="element-palette-item"
              onClick={() =>
                onInsertElement(
                  generateImageKcl('', 'Placeholder image'),
                )
              }
              disabled={!hasActiveFrame}
              title={
                hasActiveFrame
                  ? 'Insert empty image placeholder'
                  : 'Create a frame first'
              }
            >
              <span className="element-palette-item-icon">{'\u{1F5BC}'}</span>
              <span className="element-palette-item-label">Placeholder</span>
            </button>
            <button
              className="element-palette-item"
              onClick={() => setShowImageInput((p) => !p)}
              disabled={!hasActiveFrame}
              title={
                hasActiveFrame
                  ? 'Insert image from URL'
                  : 'Create a frame first'
              }
            >
              <span className="element-palette-item-icon">{'\u{1F517}'}</span>
              <span className="element-palette-item-label">From URL</span>
            </button>
            {showImageInput && (
              <div className="element-palette-image-form">
                <input
                  type="text"
                  placeholder="Image URL"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={handleImageKeyDown}
                  aria-label="Image URL"
                />
                <input
                  type="text"
                  placeholder="Alt text"
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  onKeyDown={handleImageKeyDown}
                  aria-label="Image alt text"
                />
                <button
                  className="button sm ghost"
                  onClick={handleInsertImage}
                  disabled={!imageUrl.trim()}
                >
                  Insert
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Shape section ── */}
      <div className="element-palette-section">
        <button
          className="element-palette-section-header"
          onClick={() => toggleSection('shape')}
          aria-expanded={sections.shape}
        >
          <span className="element-palette-section-arrow">
            {sections.shape ? '\u25BC' : '\u25B6'}
          </span>
          <span>Shape</span>
        </button>
        {sections.shape && (
          <div className="element-palette-section-body">
            {SHAPE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="element-palette-item"
                onClick={() => onInsertElement(generateShapeKcl(preset))}
                disabled={!hasActiveFrame}
                title={
                  hasActiveFrame
                    ? `Insert ${preset.label}`
                    : 'Create a frame first'
                }
              >
                <span className="element-palette-item-icon">
                  {SHAPE_ICONS[preset.label] || '\u25A0'}
                </span>
                <span className="element-palette-item-label">
                  {preset.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Divider section ── */}
      <div className="element-palette-section">
        <button
          className="element-palette-section-header"
          onClick={() => toggleSection('divider')}
          aria-expanded={sections.divider}
        >
          <span className="element-palette-section-arrow">
            {sections.divider ? '\u25BC' : '\u25B6'}
          </span>
          <span>Divider</span>
        </button>
        {sections.divider && (
          <div className="element-palette-section-body">
            {DIVIDER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="element-palette-item"
                onClick={() =>
                  onInsertElement(generateDividerKcl(preset))
                }
                disabled={!hasActiveFrame}
                title={
                  hasActiveFrame
                    ? `Insert ${preset.label}`
                    : 'Create a frame first'
                }
              >
                <span className="element-palette-item-icon">
                  &mdash;
                </span>
                <span className="element-palette-item-label">
                  {preset.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
