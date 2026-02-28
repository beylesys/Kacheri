// KACHERI FRONTEND/src/hooks/useVirtualList.ts
// Generic virtual list hook for rendering only visible items in a scrollable container.
// Uses scroll position + fixed item height to compute the visible window — no external
// dependencies, follows existing IntersectionObserver pattern from ImageNodeView.tsx.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 7, Slice E2

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseVirtualListOptions {
  /** Ref to the scrollable container element */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Fixed height of each item in px */
  itemHeight: number;
  /** Number of extra items to render above and below the visible window */
  overscan?: number;
}

interface UseVirtualListResult {
  /** Start index of the visible range (inclusive) */
  start: number;
  /** End index of the visible range (exclusive) */
  end: number;
  /** Total height of the virtualized content in px */
  totalHeight: number;
  /** Top offset for the first visible item in px */
  offsetTop: number;
  /** Scroll the container so that `index` is visible */
  scrollToIndex: (index: number) => void;
}

/**
 * Virtual list hook — computes which items should be rendered based on
 * the scroll position of a container with fixed-height items.
 *
 * Returns spacer dimensions so the caller can render:
 *   <div style={{ height: offsetTop }} />       ← top spacer
 *   {items.slice(start, end).map(renderItem)}   ← visible items
 *   <div style={{ height: totalHeight - offsetTop - (end - start) * itemHeight }} /> ← bottom spacer
 */
export function useVirtualList(
  itemCount: number,
  { containerRef, itemHeight, overscan = 5 }: UseVirtualListOptions,
): UseVirtualListResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const rafId = useRef(0);

  // Track scroll position with RAF throttling (matches ImageNodeView.tsx pattern)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerHeight(el.clientHeight);

    function handleScroll() {
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0;
        if (containerRef.current) {
          setScrollTop(containerRef.current.scrollTop);
        }
      });
    }

    // Also track container resize via ResizeObserver (guarded for jsdom/SSR)
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });
      ro.observe(el);
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      ro?.disconnect();
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [containerRef]);

  const totalHeight = itemCount * itemHeight;

  // Compute visible range
  const rawStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const start = Math.max(0, rawStart - overscan);
  const end = Math.min(itemCount, rawStart + visibleCount + overscan);
  const offsetTop = start * itemHeight;

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el) return;
      const targetTop = index * itemHeight;
      const targetBottom = targetTop + itemHeight;

      // Only scroll if the item is outside the visible area
      if (targetTop < el.scrollTop) {
        el.scrollTop = targetTop;
      } else if (targetBottom > el.scrollTop + el.clientHeight) {
        el.scrollTop = targetBottom - el.clientHeight;
      }
    },
    [containerRef, itemHeight],
  );

  return { start, end, totalHeight, offsetTop, scrollToIndex };
}
