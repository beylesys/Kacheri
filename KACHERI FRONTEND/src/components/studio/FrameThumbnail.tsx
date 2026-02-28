// KACHERI FRONTEND/src/components/studio/FrameThumbnail.tsx
// Single frame thumbnail card in the frame rail.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C2

import type { CanvasFrame } from '../../types/canvas';
import { FrameLockThumbnail } from './FrameLockBadge';

interface FrameThumbnailProps {
  frame: CanvasFrame;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onSaveAsTemplate?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  isDragOver: boolean;
  /** E8: Display name of user who holds a lock on this frame (undefined = unlocked) */
  lockedByName?: string;
}

export function FrameThumbnail({
  frame,
  index,
  isActive,
  onSelect,
  onDelete,
  onSaveAsTemplate,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  isDragOver,
  lockedByName,
}: FrameThumbnailProps) {
  const label = frame.title || `Frame ${index + 1}`;

  return (
    <div
      className={
        'frame-thumbnail' +
        (isActive ? ' active' : '') +
        (isDragOver ? ' drag-over' : '')
      }
      onClick={onSelect}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      role="button"
      tabIndex={0}
      aria-label={`${label}${isActive ? ' (active)' : ''}`}
      aria-current={isActive ? 'true' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Drag handle — visible on hover (hidden when drag is disabled) */}
      {onDragStart && (
        <span className="frame-thumbnail-drag" aria-hidden="true">
          &#x2630;
        </span>
      )}

      {/* Preview — placeholder with frame number */}
      <div className="frame-thumbnail-preview">
        {index + 1}
        {/* E8 — Frame lock badge */}
        {lockedByName && <FrameLockThumbnail displayName={lockedByName} />}
      </div>

      {/* Info */}
      <div className="frame-thumbnail-info">
        <div className="frame-thumbnail-number">
          Frame {index + 1}
        </div>
        {frame.title && (
          <div className="frame-thumbnail-label" title={frame.title}>
            {frame.title}
          </div>
        )}
      </div>

      {/* Save as template — visible on hover */}
      {onSaveAsTemplate && (
        <button
          className="frame-thumbnail-save-tpl"
          onClick={(e) => {
            e.stopPropagation();
            onSaveAsTemplate();
          }}
          aria-label={`Save ${label} as template`}
          title="Save as template"
        >
          &#x1F4BE;
        </button>
      )}

      {/* Delete button — visible on hover (hidden on mobile) */}
      {onDelete && (
        <button
          className="frame-thumbnail-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${label}`}
          title="Delete frame"
        >
          &#x2715;
        </button>
      )}
    </div>
  );
}

export default FrameThumbnail;
