// KACHERI FRONTEND/src/utils/positionMapper.ts
// Phase 5 - P1.2: Plain text ↔ ProseMirror position mapping
//
// The backend stores AI action ranges as plain-text character offsets.
// The editor uses ProseMirror positions (node-tree based).
// This utility provides bidirectional mapping.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Maps a plain-text character offset to a ProseMirror position.
 *
 * ProseMirror positions count nodes differently than plain text:
 * - Each text character = 1 position
 * - Block elements (paragraphs, etc.) add opening/closing positions
 * - The document starts at position 0 (before first content)
 *
 * @param doc - The ProseMirror document node
 * @param plainOffset - Character offset in plain text (0-indexed)
 * @returns ProseMirror position, or null if out of bounds
 */
export function plainTextToProseMirror(
  doc: ProseMirrorNode,
  plainOffset: number
): number | null {
  if (plainOffset < 0) return null;
  if (plainOffset === 0) return 1; // Start of first text node

  let plainIndex = 0;
  let pmPos = 0;

  // Walk the document tree
  const result = walkDocForOffset(doc, plainOffset, { plainIndex, pmPos });
  return result;
}

/**
 * Maps a ProseMirror position to a plain-text character offset.
 *
 * @param doc - The ProseMirror document node
 * @param pmPos - ProseMirror position
 * @returns Plain text offset, or null if invalid position
 */
export function proseMirrorToPlainText(
  doc: ProseMirrorNode,
  pmPos: number
): number | null {
  if (pmPos < 0) return null;

  let plainIndex = 0;
  let currentPmPos = 0;

  // Walk the document tree
  const result = walkDocForPmPos(doc, pmPos, { plainIndex, currentPmPos });
  return result;
}

/**
 * Maps a plain-text range to a ProseMirror range.
 *
 * @param doc - The ProseMirror document node
 * @param start - Start offset in plain text
 * @param end - End offset in plain text
 * @returns Object with from/to PM positions, or null if invalid
 */
export function plainTextRangeToProseMirror(
  doc: ProseMirrorNode,
  start: number,
  end: number
): { from: number; to: number } | null {
  const fromPos = plainTextToProseMirror(doc, start);
  const toPos = plainTextToProseMirror(doc, end);

  if (fromPos === null || toPos === null) {
    return null;
  }

  return { from: fromPos, to: toPos };
}

/* ---------- Internal helpers ---------- */

interface WalkState {
  plainIndex: number;
  pmPos: number;
}

/**
 * Recursive walker to find PM position for a plain-text offset.
 */
function walkDocForOffset(
  node: ProseMirrorNode,
  targetPlainOffset: number,
  state: WalkState
): number | null {
  // Document and element nodes have opening/closing positions
  if (node.isBlock || node.type.name === "doc") {
    state.pmPos++; // Opening position

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      const result = walkDocForOffset(child, targetPlainOffset, state);
      if (result !== null) return result;
    }

    // Add newline for block elements (except doc)
    if (node.type.name !== "doc" && node.isBlock) {
      if (state.plainIndex === targetPlainOffset) {
        return state.pmPos;
      }
      state.plainIndex++; // newline character
    }

    state.pmPos++; // Closing position
    return null;
  }

  // Text nodes
  if (node.isText && node.text) {
    const text = node.text;
    for (let i = 0; i < text.length; i++) {
      if (state.plainIndex === targetPlainOffset) {
        return state.pmPos;
      }
      state.plainIndex++;
      state.pmPos++;
    }
  } else if (node.isInline) {
    // Other inline nodes (images, etc.) - count as 1 position
    state.pmPos++;
  }

  return null;
}

/**
 * Recursive walker to find plain-text offset for a PM position.
 */
function walkDocForPmPos(
  node: ProseMirrorNode,
  targetPmPos: number,
  state: { plainIndex: number; currentPmPos: number }
): number | null {
  if (node.isBlock || node.type.name === "doc") {
    state.currentPmPos++; // Opening position

    if (state.currentPmPos === targetPmPos) {
      return state.plainIndex;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      const result = walkDocForPmPos(child, targetPmPos, state);
      if (result !== null) return result;
    }

    // Add newline for block elements
    if (node.type.name !== "doc" && node.isBlock) {
      state.plainIndex++;
    }

    state.currentPmPos++; // Closing position

    if (state.currentPmPos === targetPmPos) {
      return state.plainIndex;
    }

    return null;
  }

  if (node.isText && node.text) {
    const text = node.text;
    for (let i = 0; i < text.length; i++) {
      if (state.currentPmPos === targetPmPos) {
        return state.plainIndex;
      }
      state.plainIndex++;
      state.currentPmPos++;
    }
  } else if (node.isInline) {
    if (state.currentPmPos === targetPmPos) {
      return state.plainIndex;
    }
    state.currentPmPos++;
  }

  return null;
}

/**
 * Simpler approach: extract plain text and build offset mapping.
 * This is more reliable but requires walking the entire document.
 */
export function buildPositionMap(doc: ProseMirrorNode): {
  plainToPm: Map<number, number>;
  pmToPlain: Map<number, number>;
  plainText: string;
} {
  const plainToPm = new Map<number, number>();
  const pmToPlain = new Map<number, number>();
  const textParts: string[] = [];

  let plainIndex = 0;

  function walk(node: ProseMirrorNode, pos: number): void {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        plainToPm.set(plainIndex, pos + i);
        pmToPlain.set(pos + i, plainIndex);
        textParts.push(node.text[i]);
        plainIndex++;
      }
    } else if (node.isBlock && node.type.name !== "doc") {
      // Process children
      let childPos = pos + 1; // Skip opening position
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        walk(child, childPos);
        childPos += child.nodeSize;
      }
      // Add newline after block
      plainToPm.set(plainIndex, childPos);
      pmToPlain.set(childPos, plainIndex);
      textParts.push("\n");
      plainIndex++;
    } else {
      // Document or other container
      let childPos = pos + 1;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        walk(child, childPos);
        childPos += child.nodeSize;
      }
    }
  }

  walk(doc, 0);

  return {
    plainToPm,
    pmToPlain,
    plainText: textParts.join(""),
  };
}

/**
 * Convert a plain-text range to PM positions using the position map.
 */
export function rangeToPositions(
  map: { plainToPm: Map<number, number> },
  start: number,
  end: number
): { from: number; to: number } | null {
  const from = map.plainToPm.get(start);
  const to = map.plainToPm.get(end);

  if (from === undefined || to === undefined) {
    // Try to find closest positions
    let fromPos = from;
    let toPos = to;

    if (fromPos === undefined) {
      // Find next available position
      for (let i = start; i >= 0; i--) {
        const pos = map.plainToPm.get(i);
        if (pos !== undefined) {
          fromPos = pos + (start - i);
          break;
        }
      }
    }

    if (toPos === undefined) {
      // Find previous available position
      for (let i = end; i >= 0; i--) {
        const pos = map.plainToPm.get(i);
        if (pos !== undefined) {
          toPos = pos + (end - i);
          break;
        }
      }
    }

    if (fromPos !== undefined && toPos !== undefined) {
      return { from: fromPos, to: toPos };
    }

    return null;
  }

  return { from, to };
}
