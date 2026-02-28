// KACHERI FRONTEND/src/components/studio/VisualCanvas.tsx
// Right-panel orchestrator for Visual Mode (MC1 + MC3 + MC4).
// Shows ElementPalette for element creation, PropertiesPanel when a
// KCL element is selected in the viewport, and LayerPanel for z-order
// management. MC3 adds SlideLayoutPicker modal for pre-built slide layouts.
// MC4 adds Layers tab, grid toolbar with snap controls.
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slices MC1, MC3, MC4

import { useState, useCallback } from 'react';
import type { KCLEditableSchema, ElementBounds, GridConfig, LayerElement } from '../../kcl/types';
import type { ElementPositionChange } from './DragManager';
import { ElementPalette } from './ElementPalette';
import { PropertiesPanel } from './PropertiesPanel';
import { SlideLayoutPicker } from './SlideLayoutPicker';
import { LayerPanel } from './LayerPanel';
import './visualCanvas.css';
import './dragResize.css';

type AspectPreset = '16:9' | '4:3' | 'a4-portrait' | 'a4-landscape';
type VisualTab = 'elements' | 'properties' | 'layers';

interface VisualCanvasProps {
  selectedElement: KCLEditableSchema | null;
  onPropertyChange: (property: string, value: unknown) => void;
  inlineEditingActive?: boolean;
  onInsertElement: (elementKcl: string) => void;
  onCreateBlankFrame: (aspectPreset: AspectPreset) => void;
  hasActiveFrame: boolean;
  /** MC2: Bounds of the first selected element */
  selectedBounds?: ElementBounds;
  /** MC2: Called when bounds are edited via Position & Size inputs */
  onBoundsChange?: (newBounds: ElementBounds) => void;
  /** MC3: Creates a new frame from complete layout KCL code */
  onCreateFromLayout?: (code: string) => void;
  /** MC3: Applies layout inner KCL to the active frame (replaces content) */
  onApplyLayoutToFrame?: (innerKcl: string) => void;
  /** MC4: Layer elements for the LayerPanel */
  layerElements?: LayerElement[];
  /** MC4: Selected element IDs (for layer highlight) */
  selectedElementIds?: string[];
  /** MC4: Called when element is selected from layer panel */
  onSelectElementById?: (elementId: string) => void;
  /** MC4: Called when z-order changes via layer panel drag reorder */
  onZIndexChange?: (changes: ElementPositionChange[]) => void;
  /** MC4: Called when visibility is toggled (eye icon) */
  onVisibilityToggle?: (elementId: string, visible: boolean) => void;
  /** MC4: Called when lock is toggled (lock icon) */
  onLockToggle?: (elementId: string, locked: boolean) => void;
  /** MC4: Grid configuration */
  gridConfig?: GridConfig;
  /** MC4: Called when grid configuration changes */
  onGridConfigChange?: (config: GridConfig) => void;
}

export function VisualCanvas({
  selectedElement,
  onPropertyChange,
  inlineEditingActive,
  onInsertElement,
  onCreateBlankFrame,
  hasActiveFrame,
  selectedBounds,
  onBoundsChange,
  onCreateFromLayout,
  onApplyLayoutToFrame,
  layerElements,
  selectedElementIds,
  onSelectElementById,
  onZIndexChange,
  onVisibilityToggle,
  onLockToggle,
  gridConfig,
  onGridConfigChange,
}: VisualCanvasProps) {
  const [manualTab, setManualTab] = useState<VisualTab>('elements');

  // MC3: Layout picker modal state
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false);
  const [layoutPickerMode, setLayoutPickerMode] = useState<'create' | 'apply'>('create');

  // Auto-switch to Properties when an element is selected via F1 click
  const activeTab: VisualTab = selectedElement ? 'properties' : manualTab;

  // MC2: Handle individual bound field changes
  const handleBoundField = useCallback(
    (field: keyof ElementBounds, rawValue: string) => {
      if (!selectedBounds || !onBoundsChange) return;
      const num = parseInt(rawValue, 10);
      if (isNaN(num)) return;
      onBoundsChange({ ...selectedBounds, [field]: num });
    },
    [selectedBounds, onBoundsChange],
  );

  // MC3: Open layout picker in the specified mode
  const handleOpenLayoutPicker = useCallback((mode: 'create' | 'apply') => {
    setLayoutPickerMode(mode);
    setLayoutPickerOpen(true);
  }, []);

  return (
    <div className="visual-canvas">
      {/* Tab bar */}
      <div className="visual-canvas-tabs" role="tablist" aria-label="Visual mode panels">
        <button
          className={'visual-canvas-tab' + (activeTab === 'elements' ? ' active' : '')}
          role="tab"
          aria-selected={activeTab === 'elements'}
          aria-controls="visual-panel-elements"
          onClick={() => setManualTab('elements')}
        >
          Elements
        </button>
        <button
          className={'visual-canvas-tab' + (activeTab === 'properties' ? ' active' : '')}
          role="tab"
          aria-selected={activeTab === 'properties'}
          aria-controls="visual-panel-properties"
          onClick={() => setManualTab('properties')}
        >
          Properties
        </button>
        <button
          className={'visual-canvas-tab' + (activeTab === 'layers' ? ' active' : '')}
          role="tab"
          aria-selected={activeTab === 'layers'}
          aria-controls="visual-panel-layers"
          onClick={() => setManualTab('layers')}
        >
          Layers
        </button>
      </div>

      {/* MC4: Grid & Snap toolbar */}
      {gridConfig && onGridConfigChange && (
        <div className="grid-toolbar">
          <button
            className={'grid-toolbar-btn' + (gridConfig.visible ? ' active' : '')}
            onClick={() =>
              onGridConfigChange({ ...gridConfig, visible: !gridConfig.visible })
            }
            title={gridConfig.visible ? 'Hide grid' : 'Show grid'}
            aria-label="Toggle grid visibility"
          >
            Grid
          </button>
          <button
            className={'grid-toolbar-btn' + (gridConfig.snapEnabled ? ' active' : '')}
            onClick={() =>
              onGridConfigChange({ ...gridConfig, snapEnabled: !gridConfig.snapEnabled })
            }
            title={gridConfig.snapEnabled ? 'Disable snap' : 'Enable snap'}
            aria-label="Toggle snap to grid"
          >
            Snap
          </button>
          <select
            className="grid-toolbar-select"
            value={gridConfig.size}
            onChange={(e) =>
              onGridConfigChange({
                ...gridConfig,
                size: parseInt(e.target.value, 10) as 8 | 16 | 32,
              })
            }
            aria-label="Grid size"
          >
            <option value={8}>8px</option>
            <option value={16}>16px</option>
            <option value={32}>32px</option>
          </select>
        </div>
      )}

      {/* Tab content */}
      <div className="visual-canvas-content">
        {activeTab === 'elements' ? (
          <div id="visual-panel-elements" role="tabpanel">
            <ElementPalette
              onInsertElement={onInsertElement}
              onCreateBlankFrame={onCreateBlankFrame}
              hasActiveFrame={hasActiveFrame}
              onOpenLayoutPicker={
                onCreateFromLayout || onApplyLayoutToFrame
                  ? handleOpenLayoutPicker
                  : undefined
              }
            />
          </div>
        ) : activeTab === 'properties' ? (
          <div id="visual-panel-properties" role="tabpanel">
            {/* MC2: Position & Size fields */}
            {selectedBounds && onBoundsChange && (
              <div className="drag-position-fields">
                <div className="drag-position-field">
                  <label className="drag-position-label">X</label>
                  <input
                    className="drag-position-input"
                    type="number"
                    value={Math.round(selectedBounds.left)}
                    onChange={(e) => handleBoundField('left', e.target.value)}
                    aria-label="X position"
                  />
                </div>
                <div className="drag-position-field">
                  <label className="drag-position-label">Y</label>
                  <input
                    className="drag-position-input"
                    type="number"
                    value={Math.round(selectedBounds.top)}
                    onChange={(e) => handleBoundField('top', e.target.value)}
                    aria-label="Y position"
                  />
                </div>
                <div className="drag-position-field">
                  <label className="drag-position-label">W</label>
                  <input
                    className="drag-position-input"
                    type="number"
                    value={Math.round(selectedBounds.width)}
                    min={1}
                    onChange={(e) => handleBoundField('width', e.target.value)}
                    aria-label="Width"
                  />
                </div>
                <div className="drag-position-field">
                  <label className="drag-position-label">H</label>
                  <input
                    className="drag-position-input"
                    type="number"
                    value={Math.round(selectedBounds.height)}
                    min={1}
                    onChange={(e) => handleBoundField('height', e.target.value)}
                    aria-label="Height"
                  />
                </div>
              </div>
            )}

            <PropertiesPanel
              selectedElement={selectedElement}
              onPropertyChange={onPropertyChange}
              inlineEditingActive={inlineEditingActive}
            />
          </div>
        ) : (
          <div id="visual-panel-layers" role="tabpanel">
            {layerElements && onZIndexChange && onVisibilityToggle && onLockToggle && onSelectElementById ? (
              <LayerPanel
                elements={layerElements}
                selectedElementIds={selectedElementIds ?? []}
                onSelectElement={onSelectElementById}
                onZIndexChange={onZIndexChange}
                onVisibilityToggle={onVisibilityToggle}
                onLockToggle={onLockToggle}
              />
            ) : (
              <div style={{ padding: '16px', color: 'var(--muted, #94a3b8)', fontSize: '12px' }}>
                No layer data available
              </div>
            )}
          </div>
        )}
      </div>

      {/* MC3: Slide Layout Picker modal */}
      <SlideLayoutPicker
        open={layoutPickerOpen}
        onClose={() => setLayoutPickerOpen(false)}
        mode={layoutPickerMode}
        onCreateFromLayout={onCreateFromLayout ?? (() => {})}
        onApplyLayout={onApplyLayoutToFrame ?? (() => {})}
      />
    </div>
  );
}
