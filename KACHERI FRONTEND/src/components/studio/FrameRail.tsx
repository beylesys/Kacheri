// KACHERI FRONTEND/src/components/studio/FrameRail.tsx
// Left panel: vertical frame list with thumbnails, drag-to-reorder, add/delete.
// E2 — Virtual frame rail: only renders visible thumbnails for 100+ frame canvases.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C2 + Phase 7, Slice E2

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasFrame } from '../../types/canvas';
import type { CanvasViewer, FrameLockInfo } from '../../hooks/useCanvasCollaboration';
import { FrameThumbnail } from './FrameThumbnail';
import { useVirtualList } from '../../hooks/useVirtualList';

/** Height of each FrameThumbnail in px — must match CSS .frame-thumbnail min-height */
const THUMBNAIL_HEIGHT = 100;

interface FrameRailProps {
  frames: CanvasFrame[];
  activeFrameId: string | null;
  onSelectFrame: (frameId: string) => void;
  onReorder: (frameIds: string[]) => void;
  onAddFrame: () => void;
  onDeleteFrame: (frameId: string) => void;
  onSaveAsTemplate?: (frameId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** E8: Frame locks keyed by frameId */
  frameLocks?: Map<string, FrameLockInfo>;
  /** E8: Other users viewing this canvas */
  canvasViewers?: CanvasViewer[];
  /** E9: Mobile viewport — disable drag-to-reorder */
  isMobile?: boolean;
}

export function FrameRail({
  frames,
  activeFrameId,
  onSelectFrame,
  onReorder,
  onAddFrame,
  onDeleteFrame,
  onSaveAsTemplate,
  collapsed,
  onToggleCollapse,
  frameLocks,
  canvasViewers,
  isMobile,
}: FrameRailProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const sorted = [...frames].sort((a, b) => a.sortOrder - b.sortOrder);

  // E2 — Virtual frame rail: only render visible thumbnails + overscan
  const { start, end, totalHeight, offsetTop, scrollToIndex } = useVirtualList(
    sorted.length,
    { containerRef: listRef, itemHeight: THUMBNAIL_HEIGHT, overscan: 5 },
  );

  // Auto-scroll to active frame when it changes
  useEffect(() => {
    if (!activeFrameId) return;
    const idx = sorted.findIndex((f) => f.id === activeFrameId);
    if (idx >= 0) {
      scrollToIndex(idx);
    }
  }, [activeFrameId, sorted, scrollToIndex]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);

      if (dragIndex === null || dragIndex === dropIndex) {
        setDragIndex(null);
        return;
      }

      // Reorder: move dragIndex item to dropIndex position
      const reordered = [...sorted];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, moved);

      onReorder(reordered.map((f) => f.id));
      setDragIndex(null);
    },
    [dragIndex, sorted, onReorder],
  );

  const handleDelete = useCallback(
    (frameId: string, frameLabel: string) => {
      const confirmed = window.confirm(
        `Delete "${frameLabel}"? This cannot be undone.`,
      );
      if (confirmed) {
        onDeleteFrame(frameId);
      }
    },
    [onDeleteFrame],
  );

  // Visible slice of sorted frames
  const visibleFrames = sorted.slice(start, end);
  const bottomSpacerHeight = totalHeight - offsetTop - visibleFrames.length * THUMBNAIL_HEIGHT;

  return (
    <nav
      className={'studio-rail' + (collapsed ? ' collapsed' : '') + (isMobile ? ' studio-rail--mobile' : '')}
      aria-label="Frame rail"
    >
      {/* E9: Hide rail header on mobile — frames are always visible as horizontal strip */}
      {!isMobile && (
        <div className="frame-rail-header">
          <span className="frame-rail-title">
            Frames ({frames.length})
          </span>
          <button
            className="frame-rail-collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand frame rail' : 'Collapse frame rail'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            &#x25C0;
          </button>
        </div>
      )}

      <div className="frame-rail-list" role="list" ref={listRef}>
        {/* Top/left spacer — represents frames above/before the visible window */}
        {offsetTop > 0 && (
          <div style={isMobile ? { width: offsetTop, flexShrink: 0 } : { height: offsetTop, flexShrink: 0 }} aria-hidden="true" />
        )}

        {visibleFrames.map((frame, i) => {
          // Map visible index back to full array index for drag-to-reorder
          const fullIndex = start + i;
          return (
            <FrameThumbnail
              key={frame.id}
              frame={frame}
              index={fullIndex}
              isActive={frame.id === activeFrameId}
              onSelect={() => onSelectFrame(frame.id)}
              onDelete={isMobile ? undefined : () =>
                handleDelete(frame.id, frame.title || `Frame ${fullIndex + 1}`)
              }
              onSaveAsTemplate={
                !isMobile && onSaveAsTemplate
                  ? () => onSaveAsTemplate(frame.id)
                  : undefined
              }
              onDragStart={isMobile ? undefined : (e) => handleDragStart(e, fullIndex)}
              onDragOver={isMobile ? undefined : (e) => handleDragOver(e, fullIndex)}
              onDrop={isMobile ? undefined : (e) => handleDrop(e, fullIndex)}
              onDragLeave={isMobile ? undefined : handleDragLeave}
              isDragOver={!isMobile && dragOverIndex === fullIndex}
              lockedByName={frameLocks?.get(frame.id)?.displayName}
            />
          );
        })}

        {/* Bottom/right spacer — represents frames below/after the visible window */}
        {bottomSpacerHeight > 0 && (
          <div style={isMobile ? { width: bottomSpacerHeight, flexShrink: 0 } : { height: bottomSpacerHeight, flexShrink: 0 }} aria-hidden="true" />
        )}
      </div>

      {/* E9: Hide add frame button on mobile — use conversation panel instead */}
      {!isMobile && (
        <button
          className="frame-rail-add"
          onClick={onAddFrame}
          aria-label="Add new frame"
        >
          + Add Frame
        </button>
      )}
    </nav>
  );
}

export default FrameRail;
