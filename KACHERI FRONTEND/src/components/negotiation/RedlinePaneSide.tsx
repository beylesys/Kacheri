// KACHERI FRONTEND/src/components/negotiation/RedlinePaneSide.tsx
// Individual pane for the RedlineView. Renders plain text with inline
// change highlights and a gutter of RedlineChangeMarker components.
//
// Left pane shows the previous round (deletions highlighted in red).
// Right pane shows the current round (insertions highlighted in green).
// Both panes highlight modifications in yellow.
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 15

import { useMemo, forwardRef } from 'react';
import type { NegotiationChange } from '../../types/negotiation';
import RedlineChangeMarker from './RedlineChangeMarker';
import './negotiation.css';

type Side = 'left' | 'right';

type Props = {
  label: string;
  text: string;
  changes: NegotiationChange[];
  side: Side;
  activeChangeIndex: number;
  onMarkerClick: (index: number) => void;
};

/** A segment of text with an optional highlight type. */
type Segment = {
  text: string;
  type: 'normal' | 'deleted' | 'inserted' | 'modified';
  changeIndex: number | null;
};

/**
 * Build highlighted segments for the left pane (previous round).
 * Marks regions at fromPos..toPos in the original text.
 *  - delete → 'deleted' (text was removed in the new round)
 *  - replace → 'modified' (text was changed)
 *  - insert → not shown on left (nothing to highlight in the old text)
 */
function buildLeftSegments(text: string, changes: NegotiationChange[]): Segment[] {
  // Filter and sort changes that have a region in the old text
  const applicable = changes
    .map((c, i) => ({ change: c, index: i }))
    .filter(({ change }) => change.changeType !== 'insert' && change.fromPos >= 0 && change.toPos >= 0)
    .sort((a, b) => a.change.fromPos - b.change.fromPos);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const { change, index } of applicable) {
    const start = Math.max(change.fromPos, cursor);
    const end = Math.min(change.toPos, text.length);
    if (start > end) continue;

    // Normal text before this change
    if (cursor < start) {
      segments.push({ text: text.slice(cursor, start), type: 'normal', changeIndex: null });
    }

    // Highlighted region
    const highlightType = change.changeType === 'delete' ? 'deleted' : 'modified';
    segments.push({
      text: text.slice(start, end),
      type: highlightType,
      changeIndex: index,
    });
    cursor = end;
  }

  // Remaining text after last change
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), type: 'normal', changeIndex: null });
  }

  return segments;
}

/**
 * Build highlighted segments for the right pane (current round).
 * For inserts and replaces, we show the proposed text as highlighted.
 * Since positions refer to the OLD text, we rebuild the new text by
 * walking changes in order and splicing in proposed text.
 */
function buildRightSegments(text: string, changes: NegotiationChange[]): Segment[] {
  // Sort changes by fromPos ascending
  const sorted = changes
    .map((c, i) => ({ change: c, index: i }))
    .sort((a, b) => a.change.fromPos - b.change.fromPos);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const { change, index } of sorted) {
    if (change.changeType === 'delete') {
      // Deletion: text is removed. Show normal text up to deletion, skip the deleted range.
      const start = Math.max(change.fromPos, cursor);
      if (cursor < start) {
        segments.push({ text: text.slice(cursor, start), type: 'normal', changeIndex: null });
      }
      // The deleted text is NOT in the right pane at all, but we show a marker
      segments.push({
        text: change.originalText ?? '[deleted]',
        type: 'deleted',
        changeIndex: index,
      });
      cursor = Math.max(change.toPos, cursor);
    } else if (change.changeType === 'insert') {
      // Insertion: new text at this position
      const insertAt = Math.max(change.fromPos, cursor);
      if (cursor < insertAt) {
        segments.push({ text: text.slice(cursor, insertAt), type: 'normal', changeIndex: null });
      }
      segments.push({
        text: change.proposedText ?? '',
        type: 'inserted',
        changeIndex: index,
      });
      cursor = insertAt;
    } else {
      // Replace: old region replaced with new text
      const start = Math.max(change.fromPos, cursor);
      const end = Math.min(change.toPos, text.length);
      if (cursor < start) {
        segments.push({ text: text.slice(cursor, start), type: 'normal', changeIndex: null });
      }
      segments.push({
        text: change.proposedText ?? text.slice(start, end),
        type: 'modified',
        changeIndex: index,
      });
      cursor = Math.max(end, cursor);
    }
  }

  // Remaining text
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), type: 'normal', changeIndex: null });
  }

  return segments;
}

const RedlinePaneSide = forwardRef<HTMLDivElement, Props>(function RedlinePaneSide(
  { label, text, changes, side, activeChangeIndex, onMarkerClick },
  ref
) {
  const segments = useMemo(() => {
    if (side === 'left') return buildLeftSegments(text, changes);
    return buildRightSegments(text, changes);
  }, [text, changes, side]);

  // Collect unique change indices for gutter markers
  const markerIndices = useMemo(() => {
    const seen = new Set<number>();
    const result: number[] = [];
    for (const seg of segments) {
      if (seg.changeIndex !== null && !seen.has(seg.changeIndex)) {
        seen.add(seg.changeIndex);
        result.push(seg.changeIndex);
      }
    }
    return result;
  }, [segments]);

  return (
    <div className={`redline-pane ${side}`} role="region" aria-label={label}>
      {/* Pane label */}
      <div className="redline-pane-label">{label}</div>

      <div className="redline-pane-body">
        {/* Gutter with change markers */}
        <div className="redline-pane-gutter" aria-hidden="true">
          {markerIndices.map(idx => (
            <RedlineChangeMarker
              key={idx}
              index={idx}
              change={changes[idx]}
              isActive={activeChangeIndex === idx}
              onClick={onMarkerClick}
            />
          ))}
        </div>

        {/* Text content with highlights */}
        <div className="redline-pane-content" ref={ref}>
          <pre className="redline-pane-text">
            {segments.map((seg, i) => {
              if (seg.type === 'normal') {
                return <span key={i}>{seg.text}</span>;
              }
              const isActive = seg.changeIndex === activeChangeIndex;
              const classes = [
                `redline-highlight-${seg.type}`,
                isActive ? 'redline-highlight-active' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <span
                  key={i}
                  className={classes}
                  data-change-index={seg.changeIndex}
                  role="mark"
                  aria-label={`${seg.type} text`}
                >
                  {seg.text}
                </span>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
});

export default RedlinePaneSide;
