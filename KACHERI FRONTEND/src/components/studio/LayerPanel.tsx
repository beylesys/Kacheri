// KACHERI FRONTEND/src/components/studio/LayerPanel.tsx
// MC4: Layer Panel — z-order management, visibility, and lock control.
// Rendered inline within the VisualCanvas "Layers" tab.
// Shows all elements sorted by z-index (front first), with drag-to-reorder,
// visibility toggle (eye icon), and lock toggle (lock icon).
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice MC4

import { useMemo, useRef, useState, useCallback } from 'react';
import type { LayerElement } from '../../kcl/types';
import type { ElementPositionChange } from './DragManager';
import './layerPanel.css';

// ── Component type icons ──

const COMPONENT_ICONS: Record<string, string> = {
  'kcl-text': 'T',
  'kcl-image': '\u{1F5BC}',
  'kcl-layout': '\u{1F4E6}',
  'kcl-chart': '\u{1F4CA}',
  'kcl-list': '\u2630',
  'kcl-quote': '\u201C',
  'kcl-metric': '#',
  'kcl-icon': '\u2B50',
  'kcl-code': '</>',
  'kcl-table': '\u{1F4CB}',
  'kcl-compare': '\u2194',
  'kcl-timeline': '\u{1F551}',
  div: '\u25A1',
};

function getComponentIcon(component: string): string {
  return COMPONENT_ICONS[component] || '\u25A0';
}

/** Short display label for the element. */
function getDisplayLabel(el: LayerElement): string {
  if (el.elementId.startsWith('group-')) return 'Group';
  // Component name without 'kcl-' prefix
  const label = el.component.replace(/^kcl-/, '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ── Props ──

interface LayerPanelProps {
  elements: LayerElement[];
  selectedElementIds: string[];
  onSelectElement: (elementId: string) => void;
  /** Called when z-order changes via drag reorder */
  onZIndexChange: (changes: ElementPositionChange[]) => void;
  /** Called when visibility is toggled (eye icon) */
  onVisibilityToggle: (elementId: string, visible: boolean) => void;
  /** Called when lock is toggled (lock icon) */
  onLockToggle: (elementId: string, locked: boolean) => void;
}

// ── Component ──

export function LayerPanel({
  elements,
  selectedElementIds,
  onSelectElement,
  onZIndexChange,
  onVisibilityToggle,
  onLockToggle,
}: LayerPanelProps) {
  // Sort elements by z-index descending (front = top of list)
  const sorted = useMemo(
    () => [...elements].sort((a, b) => b.zIndex - a.zIndex),
    [elements],
  );

  // ── Drag-to-reorder state ──
  const dragIndexRef = useRef<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (index: number, e: React.DragEvent) => {
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
      // Required for Firefox drag support
      e.dataTransfer.setData('text/plain', String(index));
    },
    [],
  );

  const handleDragOver = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetIndex(index);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback(
    (targetIndex: number) => {
      const fromIndex = dragIndexRef.current;
      dragIndexRef.current = null;
      setDropTargetIndex(null);

      if (fromIndex === null || fromIndex === targetIndex) return;

      // Compute new z-index values: reorder the array and assign
      // z-index values from highest (top) to lowest (bottom)
      const reordered = [...sorted];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(targetIndex, 0, moved);

      const changes: ElementPositionChange[] = reordered.map((el, i) => ({
        elementId: el.elementId,
        style: { 'z-index': String(reordered.length - i) },
      }));

      onZIndexChange(changes);
    },
    [sorted, onZIndexChange],
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDropTargetIndex(null);
  }, []);

  if (elements.length === 0) {
    return (
      <div className="layer-panel">
        <div className="layer-panel-header">
          <span className="layer-panel-title">Layers</span>
        </div>
        <div className="layer-panel-empty">
          No elements in this frame
        </div>
      </div>
    );
  }

  return (
    <div className="layer-panel" role="region" aria-label="Layer control">
      <div className="layer-panel-header">
        <span className="layer-panel-title">Layers</span>
      </div>
      <div className="layer-panel-list">
        {sorted.map((el, index) => (
          <div
            key={el.elementId}
            className={
              'layer-panel-item' +
              (selectedElementIds.includes(el.elementId) ? ' selected' : '') +
              (!el.visible ? ' hidden' : '') +
              (el.locked ? ' locked' : '') +
              (dropTargetIndex === index ? ' drag-over' : '')
            }
            onClick={() => onSelectElement(el.elementId)}
            draggable
            onDragStart={(e) => handleDragStart(index, e)}
            onDragOver={(e) => handleDragOver(index, e)}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
            title={`${el.component} #${el.elementId} (z: ${el.zIndex})`}
          >
            {/* Component type icon */}
            <span className="layer-panel-item-icon" aria-hidden="true">
              {getComponentIcon(el.component)}
            </span>

            {/* Element label */}
            <span className="layer-panel-item-label">
              {getDisplayLabel(el)}
              <span className="layer-panel-item-id">
                #{el.elementId.length > 12
                  ? el.elementId.slice(0, 12) + '\u2026'
                  : el.elementId}
              </span>
            </span>

            {/* Visibility toggle (eye icon) */}
            <button
              className={
                'layer-panel-item-action' + (el.visible ? '' : ' active')
              }
              onClick={(e) => {
                e.stopPropagation();
                onVisibilityToggle(el.elementId, !el.visible);
              }}
              aria-label={el.visible ? 'Hide element' : 'Show element'}
              title={el.visible ? 'Hide' : 'Show'}
            >
              {el.visible ? '\u{1F441}' : '\u2014'}
            </button>

            {/* Lock toggle */}
            <button
              className={
                'layer-panel-item-action' + (el.locked ? ' active' : '')
              }
              onClick={(e) => {
                e.stopPropagation();
                onLockToggle(el.elementId, !el.locked);
              }}
              aria-label={el.locked ? 'Unlock element' : 'Lock element'}
              title={el.locked ? 'Unlock' : 'Lock'}
            >
              {el.locked ? '\u{1F512}' : '\u{1F513}'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
