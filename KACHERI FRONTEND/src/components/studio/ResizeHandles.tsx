// KACHERI FRONTEND/src/components/studio/ResizeHandles.tsx
// 8-point resize handles for selected elements in Visual Mode (MC2).
// Renders corner and edge handles around the selection outline.
// Text elements show width-only handles (e, w).
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice MC2

import type { ElementBounds } from '../../kcl/types';

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** All 8 handles for shapes and images */
const ALL_HANDLES: readonly HandlePosition[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Width-only handles for text blocks (height is auto from content) */
const WIDTH_HANDLES: readonly HandlePosition[] = ['e', 'w'];

interface ResizeHandlesProps {
  bounds: ElementBounds;
  /** 'all' for shapes/images, 'width-only' for text blocks */
  handleSet: 'all' | 'width-only';
  onHandlePointerDown: (handle: HandlePosition, e: React.PointerEvent) => void;
}

export function ResizeHandles({
  handleSet,
  onHandlePointerDown,
}: ResizeHandlesProps) {
  const handles = handleSet === 'width-only' ? WIDTH_HANDLES : ALL_HANDLES;

  return (
    <>
      {handles.map((handle) => (
        <div
          key={handle}
          className={`resize-handle resize-handle--${handle}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onHandlePointerDown(handle, e);
          }}
          data-handle={handle}
        />
      ))}
    </>
  );
}
