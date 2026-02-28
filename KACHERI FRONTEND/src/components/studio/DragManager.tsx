// KACHERI FRONTEND/src/components/studio/DragManager.tsx
// Overlay component for Visual Mode drag-and-drop positioning & resize (MC2).
// MC4: Extended with snap-to-grid, smart guides, lock enforcement, and allBounds callback.
// Renders as a transparent overlay on top of the iframe inside the zoom-scaled
// container. Handles element selection outlines, drag, resize, marquee
// selection, and arrow key nudging.
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slices MC2, MC4

import { useRef, useEffect, useCallback, useState } from 'react';
import type { ElementBounds, GridConfig, GuideLine } from '../../kcl/types';
import { ResizeHandles } from './ResizeHandles';
import type { HandlePosition } from './ResizeHandles';
import { snapToGrid, computeSmartGuides, GridOverlay, SmartGuideLines } from './SnapGrid';
import './dragResize.css';

// ── Types ──

export interface SelectedElementInfo {
  elementId: string;
  component: string;
  bounds: ElementBounds;
  isAbsolute: boolean;
}

export interface ElementPositionChange {
  elementId: string;
  style: Record<string, string>;
}

interface DragManagerProps {
  active: boolean;
  sendMessage: (msg: object) => void;
  selectedElements: SelectedElementInfo[];
  onPositionChange: (changes: ElementPositionChange[]) => void;
  onSelectionChange: (elementIds: string[]) => void;
  onDeselectAll: () => void;
  zoomScale: number;
  /** MC4: Grid configuration for snap-to-grid */
  gridConfig?: GridConfig;
  /** MC4: Locked element IDs (prevent drag/resize) */
  lockedElementIds?: Set<string>;
  /** MC4: Callback to expose all element bounds to parent (for LayerPanel) */
  onAllBoundsUpdate?: (elements: SelectedElementInfo[]) => void;
}

// ── Drag state (refs for 60fps updates without React re-renders) ──

interface DragState {
  mode: 'drag' | 'resize' | 'marquee';
  startClientX: number;
  startClientY: number;
  resizeHandle: HandlePosition | null;
  initialBounds: Map<string, ElementBounds>;
  initialAspectRatio: number;
  shiftKey: boolean;
}

// ── Handle resize delta calculation ──

function computeResizeDelta(
  handle: HandlePosition,
  dx: number,
  dy: number,
  initial: ElementBounds,
  shiftKey: boolean,
): { left: number; top: number; width: number; height: number } {
  let { left, top, width, height } = initial;
  const aspect = width / (height || 1);

  switch (handle) {
    case 'e':
      width = Math.max(20, width + dx);
      break;
    case 'w':
      width = Math.max(20, width - dx);
      left = initial.left + (initial.width - width);
      break;
    case 'n':
      height = Math.max(20, height - dy);
      top = initial.top + (initial.height - height);
      break;
    case 's':
      height = Math.max(20, height + dy);
      break;
    case 'se':
      width = Math.max(20, width + dx);
      height = Math.max(20, height + dy);
      break;
    case 'sw':
      width = Math.max(20, width - dx);
      left = initial.left + (initial.width - width);
      height = Math.max(20, height + dy);
      break;
    case 'ne':
      width = Math.max(20, width + dx);
      height = Math.max(20, height - dy);
      top = initial.top + (initial.height - height);
      break;
    case 'nw':
      width = Math.max(20, width - dx);
      left = initial.left + (initial.width - width);
      height = Math.max(20, height - dy);
      top = initial.top + (initial.height - height);
      break;
  }

  // Shift key: lock aspect ratio for corner handles
  if (shiftKey && ['nw', 'ne', 'se', 'sw'].includes(handle)) {
    const newAspect = width / (height || 1);
    if (newAspect > aspect) {
      height = width / aspect;
      if (handle === 'nw' || handle === 'ne') {
        top = initial.top + initial.height - height;
      }
    } else {
      width = height * aspect;
      if (handle === 'nw' || handle === 'sw') {
        left = initial.left + initial.width - width;
      }
    }
  }

  return { left, top, width, height };
}

// ── Component ──

export function DragManager({
  active,
  sendMessage,
  selectedElements,
  onPositionChange,
  onSelectionChange,
  onDeselectAll,
  zoomScale,
  gridConfig,
  lockedElementIds,
  onAllBoundsUpdate,
}: DragManagerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const outlineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const marqueeRef = useRef<HTMLDivElement>(null);
  const allBoundsRef = useRef<SelectedElementInfo[]>([]);

  // Track selected elements for arrow key operations
  const selectedRef = useRef(selectedElements);
  selectedRef.current = selectedElements;
  const zoomRef = useRef(zoomScale);
  zoomRef.current = zoomScale;

  // MC4: Grid config ref (for use in pointer handlers without dependency churn)
  const gridConfigRef = useRef(gridConfig);
  gridConfigRef.current = gridConfig;
  const lockedIdsRef = useRef(lockedElementIds);
  lockedIdsRef.current = lockedElementIds;

  // MC4: Smart guide lines (rendered during drag, cleared on pointer up)
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);

  // ── Request all element bounds on mount and when active changes ──
  useEffect(() => {
    if (!active) return;
    sendMessage({ type: 'kcl:request-all-bounds' });
  }, [active, sendMessage]);

  // ── Listen for iframe postMessage responses ──
  useEffect(() => {
    if (!active) return;

    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'kcl:all-bounds') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allBoundsRef.current = data.elements.map((el: any) => ({
          elementId: el.elementId,
          component: el.component,
          bounds: el.bounds,
          isAbsolute: el.isAbsolute,
        }));
        // MC4: Expose all bounds to parent (for LayerPanel data)
        // Pass raw data so parent can access zIndex from kcl:all-bounds response
        if (onAllBoundsUpdate) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onAllBoundsUpdate(data.elements.map((el: any) => ({
            elementId: el.elementId,
            component: el.component,
            bounds: el.bounds,
            isAbsolute: el.isAbsolute,
            zIndex: el.zIndex ?? 0,
          })));
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [active, onAllBoundsUpdate]);

  // ── Determine handle set based on component type ──
  const getHandleSet = useCallback(
    (component: string): 'all' | 'width-only' => {
      return component === 'kcl-text' ? 'width-only' : 'all';
    },
    [],
  );

  // ── Apply live style to iframe element (no code update) ──
  const applyLiveStyle = useCallback(
    (elementId: string, style: Record<string, string>) => {
      sendMessage({ type: 'kcl:apply-style', elementId, style });
    },
    [sendMessage],
  );

  // ── Update overlay outline positions directly (no React re-render) ──
  const updateOutlinePosition = useCallback(
    (elementId: string, bounds: ElementBounds) => {
      const outline = outlineRefs.current.get(elementId);
      if (!outline) return;
      outline.style.left = `${bounds.left}px`;
      outline.style.top = `${bounds.top}px`;
      outline.style.width = `${bounds.width}px`;
      outline.style.height = `${bounds.height}px`;
    },
    [],
  );

  // ── Pointer event handlers ──

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const scale = zoomRef.current || 1;
      const dx = (e.clientX - state.startClientX) / scale;
      const dy = (e.clientY - state.startClientY) / scale;
      state.shiftKey = e.shiftKey;

      if (state.mode === 'drag') {
        // Move all selected elements
        const gc = gridConfigRef.current;
        const selectedIds = new Set(selectedRef.current.map(s => s.elementId));

        for (const sel of selectedRef.current) {
          const initial = state.initialBounds.get(sel.elementId);
          if (!initial) continue;

          let newLeft = initial.left + dx;
          let newTop = initial.top + dy;

          // MC4: Apply grid snap first
          if (gc?.snapEnabled) {
            newLeft = snapToGrid(newLeft, gc.size);
            newTop = snapToGrid(newTop, gc.size);
          }

          // MC4: Compute smart guides (override grid snap if closer match)
          const movingBounds: ElementBounds = {
            left: newLeft,
            top: newTop,
            width: initial.width,
            height: initial.height,
          };
          const otherBounds = allBoundsRef.current
            .filter(o => !selectedIds.has(o.elementId))
            .map(o => ({ elementId: o.elementId, bounds: o.bounds }));

          if (otherBounds.length > 0) {
            const guideResult = computeSmartGuides(movingBounds, otherBounds);
            newLeft = guideResult.snappedLeft;
            newTop = guideResult.snappedTop;
            setActiveGuides(guideResult.guides);
          } else {
            setActiveGuides([]);
          }

          // Update overlay position
          updateOutlinePosition(sel.elementId, {
            left: newLeft,
            top: newTop,
            width: initial.width,
            height: initial.height,
          });

          // Apply live style to iframe
          applyLiveStyle(sel.elementId, {
            position: 'absolute',
            left: `${Math.round(newLeft)}px`,
            top: `${Math.round(newTop)}px`,
          });
        }
      } else if (state.mode === 'resize' && state.resizeHandle) {
        // Resize the first selected element (single-select resize)
        const sel = selectedRef.current[0];
        if (!sel) return;
        const initial = state.initialBounds.get(sel.elementId);
        if (!initial) return;

        const result = computeResizeDelta(
          state.resizeHandle,
          dx,
          dy,
          initial,
          state.shiftKey,
        );

        // MC4: Snap resize result to grid
        const gc = gridConfigRef.current;
        if (gc?.snapEnabled) {
          result.left = snapToGrid(result.left, gc.size);
          result.top = snapToGrid(result.top, gc.size);
          result.width = Math.max(gc.size, snapToGrid(result.width, gc.size));
          result.height = Math.max(gc.size, snapToGrid(result.height, gc.size));
        }

        updateOutlinePosition(sel.elementId, result);

        applyLiveStyle(sel.elementId, {
          position: 'absolute',
          left: `${Math.round(result.left)}px`,
          top: `${Math.round(result.top)}px`,
          width: `${Math.round(result.width)}px`,
          height: `${Math.round(result.height)}px`,
        });
      } else if (state.mode === 'marquee') {
        // Draw marquee rectangle
        const overlay = overlayRef.current;
        if (!overlay || !marqueeRef.current) return;

        const rect = overlay.getBoundingClientRect();
        const startX = (state.startClientX - rect.left) / scale;
        const startY = (state.startClientY - rect.top) / scale;
        const currentX = (e.clientX - rect.left) / scale;
        const currentY = (e.clientY - rect.top) / scale;

        const mLeft = Math.min(startX, currentX);
        const mTop = Math.min(startY, currentY);
        const mWidth = Math.abs(currentX - startX);
        const mHeight = Math.abs(currentY - startY);

        marqueeRef.current.style.display = 'block';
        marqueeRef.current.style.left = `${mLeft}px`;
        marqueeRef.current.style.top = `${mTop}px`;
        marqueeRef.current.style.width = `${mWidth}px`;
        marqueeRef.current.style.height = `${mHeight}px`;
      }
    },
    [applyLiveStyle, updateOutlinePosition],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const scale = zoomRef.current || 1;
      const dx = (e.clientX - state.startClientX) / scale;
      const dy = (e.clientY - state.startClientY) / scale;

      // MC4: Clear smart guides on pointer up
      setActiveGuides([]);

      if (state.mode === 'drag') {
        // Only persist if actually moved
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          const gc = gridConfigRef.current;
          const selectedIds = new Set(selectedRef.current.map(s => s.elementId));
          const changes: ElementPositionChange[] = [];
          for (const sel of selectedRef.current) {
            const initial = state.initialBounds.get(sel.elementId);
            if (!initial) continue;

            let finalLeft = initial.left + dx;
            let finalTop = initial.top + dy;

            // MC4: Apply grid snap to final position
            if (gc?.snapEnabled) {
              finalLeft = snapToGrid(finalLeft, gc.size);
              finalTop = snapToGrid(finalTop, gc.size);
            }

            // MC4: Apply smart guide snap to final position
            const movingBounds: ElementBounds = {
              left: finalLeft,
              top: finalTop,
              width: initial.width,
              height: initial.height,
            };
            const otherBounds = allBoundsRef.current
              .filter(o => !selectedIds.has(o.elementId))
              .map(o => ({ elementId: o.elementId, bounds: o.bounds }));

            if (otherBounds.length > 0) {
              const guideResult = computeSmartGuides(movingBounds, otherBounds);
              finalLeft = guideResult.snappedLeft;
              finalTop = guideResult.snappedTop;
            }

            changes.push({
              elementId: sel.elementId,
              style: {
                position: 'absolute',
                left: `${Math.round(finalLeft)}px`,
                top: `${Math.round(finalTop)}px`,
                width: `${Math.round(initial.width)}px`,
                height: `${Math.round(initial.height)}px`,
              },
            });
          }
          if (changes.length > 0) {
            onPositionChange(changes);
          }
        }
      } else if (state.mode === 'resize' && state.resizeHandle) {
        const sel = selectedRef.current[0];
        if (sel) {
          const initial = state.initialBounds.get(sel.elementId);
          if (initial && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
            const result = computeResizeDelta(
              state.resizeHandle,
              dx,
              dy,
              initial,
              e.shiftKey,
            );

            // MC4: Snap resize result to grid
            const gc = gridConfigRef.current;
            if (gc?.snapEnabled) {
              result.left = snapToGrid(result.left, gc.size);
              result.top = snapToGrid(result.top, gc.size);
              result.width = Math.max(gc.size, snapToGrid(result.width, gc.size));
              result.height = Math.max(gc.size, snapToGrid(result.height, gc.size));
            }

            onPositionChange([
              {
                elementId: sel.elementId,
                style: {
                  position: 'absolute',
                  left: `${Math.round(result.left)}px`,
                  top: `${Math.round(result.top)}px`,
                  width: `${Math.round(result.width)}px`,
                  height: `${Math.round(result.height)}px`,
                },
              },
            ]);
          }
        }
      } else if (state.mode === 'marquee') {
        // Hide marquee
        if (marqueeRef.current) {
          marqueeRef.current.style.display = 'none';
        }

        // Hit-test marquee against all known element bounds
        const overlay = overlayRef.current;
        if (overlay) {
          const rect = overlay.getBoundingClientRect();
          const startX = (state.startClientX - rect.left) / scale;
          const startY = (state.startClientY - rect.top) / scale;
          const endX = (e.clientX - rect.left) / scale;
          const endY = (e.clientY - rect.top) / scale;

          const mLeft = Math.min(startX, endX);
          const mTop = Math.min(startY, endY);
          const mRight = Math.max(startX, endX);
          const mBottom = Math.max(startY, endY);

          const hitIds: string[] = [];
          for (const el of allBoundsRef.current) {
            const b = el.bounds;
            // Check intersection
            if (
              b.left < mRight &&
              b.left + b.width > mLeft &&
              b.top < mBottom &&
              b.top + b.height > mTop
            ) {
              hitIds.push(el.elementId);
            }
          }

          if (hitIds.length > 0) {
            onSelectionChange(hitIds);
          }
        }
      }

      // Clean up
      dragStateRef.current = null;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      // Re-request all bounds after position change (iframe will reload)
      setTimeout(() => {
        sendMessage({ type: 'kcl:request-all-bounds' });
      }, 500);
    },
    [handlePointerMove, onPositionChange, onSelectionChange, sendMessage],
  );

  // ── Start drag on selection outline ──
  const handleOutlinePointerDown = useCallback(
    (elementId: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // MC4: Prevent drag of locked elements
      if (lockedIdsRef.current?.has(elementId)) return;

      // Build initial bounds map
      const initialBounds = new Map<string, ElementBounds>();
      for (const sel of selectedRef.current) {
        initialBounds.set(sel.elementId, { ...sel.bounds });
      }

      // If clicking an element not in selection (without shift), select it
      const isInSelection = selectedRef.current.some(
        (s) => s.elementId === elementId,
      );
      if (!isInSelection && !e.shiftKey) {
        // Request selection of this element via iframe
        sendMessage({ type: 'kcl:highlight-element', elementId });
        return;
      }

      // Shift+click: toggle selection
      if (e.shiftKey && isInSelection && selectedRef.current.length > 1) {
        onSelectionChange(
          selectedRef.current
            .filter((s) => s.elementId !== elementId)
            .map((s) => s.elementId),
        );
        return;
      }

      dragStateRef.current = {
        mode: 'drag',
        startClientX: e.clientX,
        startClientY: e.clientY,
        resizeHandle: null,
        initialBounds,
        initialAspectRatio: 1,
        shiftKey: e.shiftKey,
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [
      handlePointerMove,
      handlePointerUp,
      onSelectionChange,
      sendMessage,
    ],
  );

  // ── Start resize on handle ──
  const handleResizePointerDown = useCallback(
    (handle: HandlePosition, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const sel = selectedRef.current[0];
      if (!sel) return;

      // MC4: Prevent resize of locked elements
      if (lockedIdsRef.current?.has(sel.elementId)) return;

      const initialBounds = new Map<string, ElementBounds>();
      initialBounds.set(sel.elementId, { ...sel.bounds });

      dragStateRef.current = {
        mode: 'resize',
        startClientX: e.clientX,
        startClientY: e.clientY,
        resizeHandle: handle,
        initialBounds,
        initialAspectRatio: sel.bounds.width / (sel.bounds.height || 1),
        shiftKey: e.shiftKey,
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  // ── Marquee start on overlay background click ──
  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only on direct overlay clicks (not on outlines or handles)
      if (e.target !== overlayRef.current) return;
      e.preventDefault();

      // Shift+click on empty area: start marquee
      // Normal click on empty area: deselect
      if (selectedRef.current.length > 0 && !e.shiftKey) {
        onDeselectAll();
      }

      dragStateRef.current = {
        mode: 'marquee',
        startClientX: e.clientX,
        startClientY: e.clientY,
        resizeHandle: null,
        initialBounds: new Map(),
        initialAspectRatio: 1,
        shiftKey: e.shiftKey,
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp, onDeselectAll],
  );

  // ── Arrow key nudging ──
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (selectedRef.current.length === 0) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
        return;

      // Don't intercept if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      e.preventDefault();
      e.stopPropagation();

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowUp':
          dy = -step;
          break;
        case 'ArrowDown':
          dy = step;
          break;
        case 'ArrowLeft':
          dx = -step;
          break;
        case 'ArrowRight':
          dx = step;
          break;
      }

      const changes: ElementPositionChange[] = [];
      for (const sel of selectedRef.current) {
        const newLeft = sel.bounds.left + dx;
        const newTop = sel.bounds.top + dy;

        // Apply live style
        sendMessage({
          type: 'kcl:apply-style',
          elementId: sel.elementId,
          style: {
            position: 'absolute',
            left: `${Math.round(newLeft)}px`,
            top: `${Math.round(newTop)}px`,
          },
        });

        changes.push({
          elementId: sel.elementId,
          style: {
            position: 'absolute',
            left: `${Math.round(newLeft)}px`,
            top: `${Math.round(newTop)}px`,
            width: `${Math.round(sel.bounds.width)}px`,
            height: `${Math.round(sel.bounds.height)}px`,
          },
        });
      }

      if (changes.length > 0) {
        onPositionChange(changes);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, sendMessage, onPositionChange]);

  // ── Escape to deselect ──
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedRef.current.length > 0) {
        onDeselectAll();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onDeselectAll]);

  if (!active) return null;

  return (
    <div
      ref={overlayRef}
      className="drag-manager-overlay"
      style={{ pointerEvents: selectedElements.length > 0 ? 'auto' : 'none' }}
      onPointerDown={handleOverlayPointerDown}
    >
      {/* Selection outlines */}
      {selectedElements.map((sel) => (
        <div
          key={sel.elementId}
          ref={(el) => {
            if (el) {
              outlineRefs.current.set(sel.elementId, el);
            } else {
              outlineRefs.current.delete(sel.elementId);
            }
          }}
          className="drag-selection-outline"
          style={{
            left: sel.bounds.left,
            top: sel.bounds.top,
            width: sel.bounds.width,
            height: sel.bounds.height,
          }}
          onPointerDown={(e) => handleOutlinePointerDown(sel.elementId, e)}
        >
          {/* Component label */}
          <span className="drag-component-label">{sel.component}</span>

          {/* Resize handles */}
          <ResizeHandles
            bounds={sel.bounds}
            handleSet={getHandleSet(sel.component)}
            onHandlePointerDown={handleResizePointerDown}
          />
        </div>
      ))}

      {/* Marquee selection rectangle */}
      <div
        ref={marqueeRef}
        className="drag-marquee"
        style={{ display: 'none' }}
      />

      {/* MC4: Grid overlay */}
      {gridConfig && (
        <GridOverlay gridSize={gridConfig.size} visible={gridConfig.visible} />
      )}

      {/* MC4: Smart alignment guide lines */}
      <SmartGuideLines guides={activeGuides} />
    </div>
  );
}
