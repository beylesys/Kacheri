// KACHERI FRONTEND/src/components/studio/SnapGrid.tsx
// MC4: Snap-to-grid utilities, smart guide computation, and overlay components.
// Pure utility functions + lightweight React components for grid visualization
// and alignment guides during drag/resize in Visual Mode.
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice MC4

import type { ElementBounds, GuideLine } from '../../kcl/types';

// ── Grid Snapping ──

/** Snap a single coordinate to the nearest grid line. */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Snap an ElementBounds to grid (position and dimensions). */
export function snapBoundsToGrid(
  bounds: ElementBounds,
  gridSize: number,
): ElementBounds {
  return {
    left: snapToGrid(bounds.left, gridSize),
    top: snapToGrid(bounds.top, gridSize),
    width: Math.max(gridSize, snapToGrid(bounds.width, gridSize)),
    height: Math.max(gridSize, snapToGrid(bounds.height, gridSize)),
  };
}

// ── Smart Guides ──

/** Proximity threshold (px) for smart guide snapping. */
const GUIDE_THRESHOLD = 4;

export interface GuideResult {
  /** Snapped left position (may differ from input if guide matched). */
  snappedLeft: number;
  /** Snapped top position (may differ from input if guide matched). */
  snappedTop: number;
  /** Guide lines to render during this drag frame. */
  guides: GuideLine[];
}

/**
 * Given a moving element's bounds and all other elements' bounds,
 * compute alignment guide lines and snap adjustments.
 *
 * Compares left/right/center edges on X axis and top/bottom/center
 * edges on Y axis. Returns the best snap position and the guide lines
 * that should be rendered.
 */
export function computeSmartGuides(
  movingBounds: ElementBounds,
  allOtherBounds: ReadonlyArray<{ elementId: string; bounds: ElementBounds }>,
): GuideResult {
  const mLeft = movingBounds.left;
  const mRight = movingBounds.left + movingBounds.width;
  const mCenterX = movingBounds.left + movingBounds.width / 2;
  const mTop = movingBounds.top;
  const mBottom = movingBounds.top + movingBounds.height;
  const mCenterY = movingBounds.top + movingBounds.height / 2;

  let snappedLeft = movingBounds.left;
  let snappedTop = movingBounds.top;

  let bestDx = GUIDE_THRESHOLD + 1;
  let bestDy = GUIDE_THRESHOLD + 1;
  let bestGuideX = -1;
  let bestGuideY = -1;

  // Collect best matching edges for X and Y separately
  for (const other of allOtherBounds) {
    const b = other.bounds;
    const oLeft = b.left;
    const oRight = b.left + b.width;
    const oCenterX = b.left + b.width / 2;
    const oTop = b.top;
    const oBottom = b.top + b.height;
    const oCenterY = b.top + b.height / 2;

    // Vertical guides (alignment on X axis)
    const xPairs: Array<[number, number]> = [
      [mLeft, oLeft],
      [mLeft, oRight],
      [mLeft, oCenterX],
      [mRight, oLeft],
      [mRight, oRight],
      [mRight, oCenterX],
      [mCenterX, oCenterX],
    ];
    for (const [mEdge, oEdge] of xPairs) {
      const dist = Math.abs(mEdge - oEdge);
      if (dist < GUIDE_THRESHOLD && dist < bestDx) {
        bestDx = dist;
        snappedLeft = movingBounds.left + (oEdge - mEdge);
        bestGuideX = oEdge;
      }
    }

    // Horizontal guides (alignment on Y axis)
    const yPairs: Array<[number, number]> = [
      [mTop, oTop],
      [mTop, oBottom],
      [mTop, oCenterY],
      [mBottom, oTop],
      [mBottom, oBottom],
      [mBottom, oCenterY],
      [mCenterY, oCenterY],
    ];
    for (const [mEdge, oEdge] of yPairs) {
      const dist = Math.abs(mEdge - oEdge);
      if (dist < GUIDE_THRESHOLD && dist < bestDy) {
        bestDy = dist;
        snappedTop = movingBounds.top + (oEdge - mEdge);
        bestGuideY = oEdge;
      }
    }
  }

  // Build guide lines from matched edges
  const guides: GuideLine[] = [];

  if (bestGuideX >= 0) {
    // Vertical guide line spanning the relevant range
    const allTops = allOtherBounds.map((o) => o.bounds.top);
    const allBottoms = allOtherBounds.map(
      (o) => o.bounds.top + o.bounds.height,
    );
    const minY = Math.min(snappedTop, ...allTops);
    const maxY = Math.max(
      snappedTop + movingBounds.height,
      ...allBottoms,
    );
    guides.push({
      axis: 'vertical',
      position: bestGuideX,
      start: minY,
      end: maxY,
    });
  }

  if (bestGuideY >= 0) {
    // Horizontal guide line spanning the relevant range
    const allLefts = allOtherBounds.map((o) => o.bounds.left);
    const allRights = allOtherBounds.map(
      (o) => o.bounds.left + o.bounds.width,
    );
    const minX = Math.min(snappedLeft, ...allLefts);
    const maxX = Math.max(
      snappedLeft + movingBounds.width,
      ...allRights,
    );
    guides.push({
      axis: 'horizontal',
      position: bestGuideY,
      start: minX,
      end: maxX,
    });
  }

  return { snappedLeft, snappedTop, guides };
}

// ── Grid Overlay Component ──

interface GridOverlayProps {
  gridSize: number;
  visible: boolean;
}

/**
 * Renders visual grid lines as a CSS repeating background pattern.
 * Zero DOM elements per grid line — uses repeating-linear-gradient.
 */
export function GridOverlay({ gridSize, visible }: GridOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className="snap-grid-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        backgroundImage: `
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent ${gridSize - 1}px,
            rgba(255, 255, 255, 0.06) ${gridSize - 1}px,
            rgba(255, 255, 255, 0.06) ${gridSize}px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent ${gridSize - 1}px,
            rgba(255, 255, 255, 0.06) ${gridSize - 1}px,
            rgba(255, 255, 255, 0.06) ${gridSize}px
          )
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
      }}
    />
  );
}

// ── Smart Guide Lines Component ──

interface SmartGuideLinesProps {
  guides: GuideLine[];
}

/** Renders alignment guide lines (magenta lines like Figma/Sketch). */
export function SmartGuideLines({ guides }: SmartGuideLinesProps) {
  if (guides.length === 0) return null;

  return (
    <>
      {guides.map((guide, i) =>
        guide.axis === 'vertical' ? (
          <div
            key={i}
            className="smart-guide-line"
            style={{
              position: 'absolute',
              left: guide.position,
              top: guide.start,
              width: 1,
              height: guide.end - guide.start,
              background: '#ff4081',
              pointerEvents: 'none',
              zIndex: 25,
            }}
          />
        ) : (
          <div
            key={i}
            className="smart-guide-line"
            style={{
              position: 'absolute',
              left: guide.start,
              top: guide.position,
              width: guide.end - guide.start,
              height: 1,
              background: '#ff4081',
              pointerEvents: 'none',
              zIndex: 25,
            }}
          />
        ),
      )}
    </>
  );
}
