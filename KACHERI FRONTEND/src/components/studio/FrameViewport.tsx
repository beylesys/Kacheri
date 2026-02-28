// KACHERI FRONTEND/src/components/studio/FrameViewport.tsx
// Container component for the active frame display in Design Studio.
// Provides frame navigation, zoom controls, aspect ratio selection,
// and renders the sandboxed FrameRenderer.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C3

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { CanvasFrame } from '../../types/canvas';
import type { KCLEditableSchema, ElementBounds, GridConfig } from '../../kcl/types';
import { FrameRenderer } from './FrameRenderer';
import { FrameLockOverlay } from './FrameLockBadge';
import { DragManager } from './DragManager';
import type { SelectedElementInfo, ElementPositionChange } from './DragManager';
import { useFrameRenderer } from '../../hooks/useFrameRenderer';

type AspectRatio = '16:9' | '4:3' | 'a4' | 'auto';
type ZoomLevel = 'fit' | '50' | '75' | '100' | '125' | '150';

const ASPECT_RATIOS: { key: AspectRatio; label: string; ratio: number | null }[] = [
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: 'a4', label: 'A4', ratio: 210 / 297 }, // portrait
  { key: 'auto', label: 'Auto', ratio: null },
];

const ZOOM_LEVELS: { key: ZoomLevel; label: string; scale: number | null }[] = [
  { key: 'fit', label: 'Fit', scale: null },
  { key: '50', label: '50%', scale: 0.5 },
  { key: '75', label: '75%', scale: 0.75 },
  { key: '100', label: '100%', scale: 1 },
  { key: '125', label: '125%', scale: 1.25 },
  { key: '150', label: '150%', scale: 1.5 },
];

interface FrameViewportProps {
  /** The currently active frame to render */
  activeFrame: CanvasFrame;
  /** All frames sorted by sortOrder */
  sortedFrames: CanvasFrame[];
  /** Index of the active frame in sortedFrames */
  activeIndex: number;
  /** KCL version to use for rendering */
  kclVersion: string;
  /** Callback to select a different frame */
  onSelectFrame: (frameId: string) => void;
  /** Edit Mode (F2): enable KCL selection bridge */
  editMode?: boolean;
  /** Edit Mode (F2): called when a KCL element is selected in the iframe */
  onElementSelected?: (elementId: string, component: string, schema: KCLEditableSchema, bounds?: ElementBounds, isAbsolute?: boolean) => void;
  /** Edit Mode (F2): called when selection is cleared */
  onElementDeselected?: () => void;
  /** Edit Mode (F2): ref to expose sendMessage for property updates */
  sendMessageRef?: React.MutableRefObject<((msg: object) => void) | null>;
  /** Inline editing (F3): called when inline text editing starts */
  onInlineEditStart?: (elementId: string) => void;
  /** Inline editing (F3): called when inline text editing completes */
  onInlineEditComplete?: (elementId: string, newContent: string) => void;
  /** Inline editing (F3): called when inline text editing is cancelled */
  onInlineEditCancel?: (elementId: string) => void;
  /** E7: Effective embed whitelist domains for per-frame CSP */
  embedWhitelist?: string[];
  /** E8: True if the active frame is locked by another user */
  isLockedByOther?: boolean;
  /** E8: Display name of the user who holds the lock */
  lockedByName?: string;
  /** E9: Mobile viewport — enable touch swipe navigation */
  isMobile?: boolean;
  /** MC2: Selected elements with bounds for DragManager overlay */
  selectedElements?: SelectedElementInfo[];
  /** MC2: Called when element positions change via drag/resize/nudge */
  onPositionChange?: (changes: ElementPositionChange[]) => void;
  /** MC2: Called when selection changes (multi-select via marquee) */
  onSelectionChange?: (elementIds: string[]) => void;
  /** MC2: Called to deselect all elements */
  onDeselectAll?: () => void;
  /** MC4: Grid configuration for snap-to-grid */
  gridConfig?: GridConfig;
  /** MC4: Locked element IDs (prevent drag/resize) */
  lockedElementIds?: Set<string>;
  /** MC4: Callback to expose all element bounds to parent */
  onAllBoundsUpdate?: (elements: SelectedElementInfo[]) => void;
}

export function FrameViewport({
  activeFrame,
  sortedFrames,
  activeIndex,
  kclVersion,
  onSelectFrame,
  editMode,
  onElementSelected,
  onElementDeselected,
  sendMessageRef,
  onInlineEditStart,
  onInlineEditComplete,
  onInlineEditCancel,
  embedWhitelist,
  isLockedByOther,
  lockedByName,
  isMobile,
  selectedElements,
  onPositionChange,
  onSelectionChange,
  onDeselectAll,
  gridConfig,
  lockedElementIds,
  onAllBoundsUpdate,
}: FrameViewportProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [zoom, setZoom] = useState<ZoomLevel>('fit');

  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < sortedFrames.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      onSelectFrame(sortedFrames[activeIndex - 1].id);
    }
  }, [hasPrev, sortedFrames, activeIndex, onSelectFrame]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      onSelectFrame(sortedFrames[activeIndex + 1].id);
    }
  }, [hasNext, sortedFrames, activeIndex, onSelectFrame]);

  // Keyboard navigation for the viewport
  // MC2: disable arrow key frame navigation in edit mode (DragManager uses arrows for nudging)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editMode) return; // MC2: arrows reserved for element nudging
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        handleNext();
      }
    },
    [editMode, hasPrev, hasNext, handlePrev, handleNext],
  );

  // Use the frame renderer hook — passes editMode and selection callbacks (F2)
  const { srcdoc, renderError, isLoading, iframeRef, clearError, sendMessage } =
    useFrameRenderer({
      frameCode: activeFrame.code,
      kclVersion,
      editMode,
      embedWhitelist,
      onElementSelected,
      onElementDeselected,
      onInlineEditStart,
      onInlineEditComplete,
      onInlineEditCancel,
    });

  // Expose sendMessage to parent via ref (F2)
  useEffect(() => {
    if (sendMessageRef) {
      sendMessageRef.current = sendMessage;
    }
    return () => {
      if (sendMessageRef) {
        sendMessageRef.current = null;
      }
    };
  }, [sendMessage, sendMessageRef]);

  // Compute aspect ratio style for the iframe container
  const canvasStyle = useMemo(() => {
    const ar = ASPECT_RATIOS.find((a) => a.key === aspectRatio);
    const zl = ZOOM_LEVELS.find((z) => z.key === zoom);

    const style: React.CSSProperties = {};

    if (ar?.ratio) {
      style.aspectRatio = String(ar.ratio);
      style.maxWidth = '100%';
      style.maxHeight = '100%';
    } else {
      // auto: fill available space
      style.width = '100%';
      style.height = '100%';
    }

    if (zl?.scale) {
      style.transform = `scale(${zl.scale})`;
      style.transformOrigin = 'center center';
    }

    return style;
  }, [aspectRatio, zoom]);

  // MC2: Compute current zoom scale for DragManager coordinate conversion
  const currentZoomScale = useMemo(() => {
    const zl = ZOOM_LEVELS.find((z) => z.key === zoom);
    return zl?.scale ?? 1;
  }, [zoom]);

  // E9 — Touch swipe navigation for mobile (same pattern as PresentationMode.tsx)
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const SWIPE_THRESHOLD = 50;

  useEffect(() => {
    if (!isMobile) return;
    const area = canvasAreaRef.current;
    if (!area) return;

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }

    function handleTouchEnd(e: TouchEvent) {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartXRef.current;
      const dy = touch.clientY - touchStartYRef.current;

      // Only horizontal swipes above threshold
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) {
        return;
      }

      if (dx < 0) {
        // Swipe left → next frame
        handleNext();
      } else {
        // Swipe right → previous frame
        handlePrev();
      }
    }

    area.addEventListener('touchstart', handleTouchStart, { passive: true });
    area.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      area.removeEventListener('touchstart', handleTouchStart);
      area.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, handlePrev, handleNext]);

  return (
    <div
      className={'frame-viewport' + (isMobile ? ' frame-viewport--mobile' : '')}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Frame viewport"
    >
      {/* Header bar */}
      <div className="frame-viewport-header">
        {/* Navigation */}
        <div className="frame-viewport-nav">
          <button
            className="frame-viewport-nav-btn"
            onClick={handlePrev}
            disabled={!hasPrev}
            aria-label="Previous frame"
            title="Previous frame"
          >
            &#x25C0;
          </button>

          <span className="frame-viewport-frame-label">
            Frame {activeIndex + 1}
            {activeFrame.title ? `: ${activeFrame.title}` : ''}
          </span>

          <button
            className="frame-viewport-nav-btn"
            onClick={handleNext}
            disabled={!hasNext}
            aria-label="Next frame"
            title="Next frame"
          >
            &#x25B6;
          </button>
        </div>

        <span className="spacer" />

        {/* Aspect ratio selector */}
        <div
          className="frame-viewport-aspect"
          role="group"
          aria-label="Aspect ratio"
        >
          {ASPECT_RATIOS.map(({ key, label }) => (
            <button
              key={key}
              className={
                'frame-viewport-aspect-btn' +
                (aspectRatio === key ? ' active' : '')
              }
              onClick={() => setAspectRatio(key)}
              aria-pressed={aspectRatio === key}
              title={`Aspect ratio: ${label}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Zoom controls */}
        <div
          className="frame-viewport-zoom"
          role="group"
          aria-label="Zoom level"
        >
          {ZOOM_LEVELS.map(({ key, label }) => (
            <button
              key={key}
              className={
                'frame-viewport-zoom-btn' + (zoom === key ? ' active' : '')
              }
              onClick={() => setZoom(key)}
              aria-pressed={zoom === key}
              title={`Zoom: ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Iframe canvas area — E9: ref for touch swipe detection */}
      <div className="frame-viewport-canvas" ref={canvasAreaRef}>
        <div className="frame-viewport-canvas-inner" style={canvasStyle}>
          <FrameRenderer
            srcdoc={srcdoc}
            renderError={renderError}
            isLoading={isLoading}
            iframeRef={iframeRef}
            onClearError={clearError}
          />
          {/* MC2 — DragManager overlay for drag/resize in Visual Mode */}
          {editMode && onPositionChange && onSelectionChange && onDeselectAll && (
            <DragManager
              active={!!editMode}
              sendMessage={sendMessage}
              selectedElements={selectedElements || []}
              onPositionChange={onPositionChange}
              onSelectionChange={onSelectionChange}
              onDeselectAll={onDeselectAll}
              zoomScale={currentZoomScale}
              gridConfig={gridConfig}
              lockedElementIds={lockedElementIds}
              onAllBoundsUpdate={onAllBoundsUpdate}
            />
          )}
          {/* E8 — Lock overlay when another user holds the frame lock */}
          {isLockedByOther && (
            <FrameLockOverlay displayName={lockedByName} />
          )}
        </div>
      </div>

      {/* Frame counter */}
      <div className="frame-viewport-counter">
        Frame {activeIndex + 1} of {sortedFrames.length}
      </div>
    </div>
  );
}
