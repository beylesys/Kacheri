// KACHERI FRONTEND/src/components/studio/GroupManager.tsx
// MC4: Pure utility functions for grouping/ungrouping elements in KCL HTML code.
// Groups wrap selected elements in a <kcl-layout> container element.
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice MC4

import type { ElementBounds } from '../../kcl/types';

// ── ID Generation ──

let _groupCounter = 0;

function groupUid(): string {
  return `group-${Date.now().toString(36)}-${(++_groupCounter).toString(36)}`;
}

// ── Public Types ──

export interface GroupableElement {
  elementId: string;
  bounds: ElementBounds;
}

export interface GroupResult {
  newCode: string;
  groupId: string;
}

// ── Bounding Box ──

/** Compute the enclosing bounding box for a set of element bounds. */
export function computeBoundingBox(allBounds: ElementBounds[]): ElementBounds {
  if (allBounds.length === 0) return { left: 0, top: 0, width: 0, height: 0 };

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;

  for (const b of allBounds) {
    minLeft = Math.min(minLeft, b.left);
    minTop = Math.min(minTop, b.top);
    maxRight = Math.max(maxRight, b.left + b.width);
    maxBottom = Math.max(maxBottom, b.top + b.height);
  }

  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

// ── Group Detection ──

/** Check if an element is a group container (kcl-layout with group-* id prefix). */
export function isGroupElement(
  elementId: string,
  component: string,
): boolean {
  return component === 'kcl-layout' && elementId.startsWith('group-');
}

// ── Element Extraction Helpers ──

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the full HTML fragment for an element by its id attribute.
 * Returns the matched text and its start/end indices in the code string.
 * Handles both self-closing tags and tag pairs.
 */
function findElementHtml(
  code: string,
  elementId: string,
): { html: string; start: number; end: number } | null {
  const idEscaped = escapeRegex(elementId);

  // Match the opening tag containing this id
  const openTagRe = new RegExp(
    `<([a-z][a-z0-9-]*)\\b[^>]*\\bid="${idEscaped}"[^>]*>`,
    'i',
  );
  const openMatch = openTagRe.exec(code);
  if (!openMatch) return null;

  const tagName = openMatch[1];
  const start = openMatch.index;

  // Check for self-closing (ends with />)
  if (openMatch[0].endsWith('/>')) {
    return { html: openMatch[0], start, end: start + openMatch[0].length };
  }

  // Find the matching closing tag. Handle nesting of same tag name.
  const closingTag = `</${tagName}>`;
  let depth = 1;
  let pos = start + openMatch[0].length;

  const openRe = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${escapeRegex(tagName)}>`, 'gi');

  while (depth > 0 && pos < code.length) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;

    const nextOpen = openRe.exec(code);
    const nextClose = closeRe.exec(code);

    if (!nextClose) break; // Malformed HTML — no closing tag

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        const end = nextClose.index + closingTag.length;
        return { html: code.slice(start, end), start, end };
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }

  // Fallback: couldn't find proper closing tag, return opening tag only
  return { html: openMatch[0], start, end: start + openMatch[0].length };
}

/**
 * Update position style in an HTML fragment (modify inline style of element by id).
 * Used to adjust child positions when grouping/ungrouping.
 */
function updatePositionInFragment(
  html: string,
  elementId: string,
  left: number,
  top: number,
): string {
  const idEscaped = escapeRegex(elementId);

  // Case 1: id before style
  const idBeforeStyle = new RegExp(
    `(<[a-z][a-z0-9-]*\\b[^>]*\\bid="${idEscaped}"[^>]*\\bstyle=")([^"]*)(")`,
    'i',
  );
  if (idBeforeStyle.test(html)) {
    return html.replace(idBeforeStyle, (_m, pre, existing, suf) => {
      const merged = mergePosition(existing, left, top);
      return pre + merged + suf;
    });
  }

  // Case 2: style before id
  const styleBeforeId = new RegExp(
    `(<[a-z][a-z0-9-]*\\b[^>]*\\bstyle=")([^"]*)("[^>]*\\bid="${idEscaped}"[^>]*>)`,
    'i',
  );
  if (styleBeforeId.test(html)) {
    return html.replace(styleBeforeId, (_m, pre, existing, suf) => {
      const merged = mergePosition(existing, left, top);
      return pre + merged + suf;
    });
  }

  // Case 3: no style attribute — insert one
  const insertRe = new RegExp(
    `(<[a-z][a-z0-9-]*\\b[^>]*\\bid="${idEscaped}"[^>]*)(>)`,
    'i',
  );
  const posStyle = `position: absolute; left: ${Math.round(left)}px; top: ${Math.round(top)}px`;
  return html.replace(insertRe, `$1 style="${posStyle}"$2`);
}

/** Merge position properties into an existing inline style string. */
function mergePosition(existing: string, left: number, top: number): string {
  const map = new Map<string, string>();
  if (existing.trim()) {
    for (const decl of existing.split(';')) {
      const colonIdx = decl.indexOf(':');
      if (colonIdx < 0) continue;
      const key = decl.slice(0, colonIdx).trim();
      const val = decl.slice(colonIdx + 1).trim();
      if (key) map.set(key, val);
    }
  }
  map.set('position', 'absolute');
  map.set('left', `${Math.round(left)}px`);
  map.set('top', `${Math.round(top)}px`);
  return Array.from(map.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

// ── Group Elements ──

/**
 * Group: Wrap selected elements in a <kcl-layout> container.
 *
 * 1. Compute bounding box of all selected elements
 * 2. Extract each element's HTML fragment from the code
 * 3. Adjust each child's position to be relative to the group top-left
 * 4. Build the group wrapper with extracted children
 * 5. Replace the first extracted element's position with the group,
 *    and remove the other extracted elements from the code
 *
 * Returns null if fewer than 2 elements are provided.
 */
export function groupElements(
  code: string,
  elements: GroupableElement[],
): GroupResult | null {
  if (elements.length < 2) return null;

  const groupId = groupUid();

  // 1. Compute bounding box
  const bbox = computeBoundingBox(elements.map((e) => e.bounds));

  // 2. Find all element HTML fragments (sorted by position in code, descending)
  const fragments: Array<{
    html: string;
    start: number;
    end: number;
    element: GroupableElement;
  }> = [];

  for (const el of elements) {
    const found = findElementHtml(code, el.elementId);
    if (!found) return null; // Cannot find element in code
    fragments.push({ ...found, element: el });
  }

  // Sort by start position descending so we can safely remove from end-to-start
  fragments.sort((a, b) => b.start - a.start);

  // 3. Adjust child positions to be relative to group top-left
  const adjustedChildren: string[] = [];
  for (const frag of fragments) {
    const relLeft = frag.element.bounds.left - bbox.left;
    const relTop = frag.element.bounds.top - bbox.top;
    const adjusted = updatePositionInFragment(
      frag.html,
      frag.element.elementId,
      relLeft,
      relTop,
    );
    adjustedChildren.unshift(adjusted); // unshift since we're iterating in reverse
  }

  // 4. Build group HTML
  const groupHtml =
    `<kcl-layout id="${groupId}" type="flex" direction="column" ` +
    `style="position: absolute; left: ${Math.round(bbox.left)}px; ` +
    `top: ${Math.round(bbox.top)}px; width: ${Math.round(bbox.width)}px; ` +
    `height: ${Math.round(bbox.height)}px; padding: 0; gap: 0;">\n` +
    adjustedChildren.map((c) => `  ${c}`).join('\n') +
    `\n</kcl-layout>`;

  // 5. Remove all fragment positions from code (in reverse order to preserve indices)
  let newCode = code;
  for (const frag of fragments) {
    newCode =
      newCode.slice(0, frag.start) + newCode.slice(frag.end);
  }

  // Insert group at the position of the first element (lowest start index)
  const insertPos = fragments[fragments.length - 1].start;
  newCode =
    newCode.slice(0, insertPos) + groupHtml + newCode.slice(insertPos);

  return { newCode, groupId };
}

// ── Ungroup Element ──

/**
 * Ungroup: Remove <kcl-layout> container wrapper and restore children
 * to absolute positions in the parent.
 *
 * 1. Find the group element by id in the code
 * 2. Extract its innerHTML (children)
 * 3. For each child with an id, compute absolute position
 *    (group position + child relative position)
 * 4. Replace the group element with the restored children
 *
 * Returns the modified code, or null if the group element wasn't found.
 */
export function ungroupElement(
  code: string,
  groupId: string,
  groupBounds: ElementBounds,
): string | null {
  const found = findElementHtml(code, groupId);
  if (!found) return null;

  // Extract children: strip the opening and closing group tags
  const openTagRe = /^<kcl-layout\b[^>]*>/;
  const closeTagRe = /<\/kcl-layout>$/;

  let inner = found.html.replace(openTagRe, '').replace(closeTagRe, '').trim();

  // Find all child elements with id attributes and update their positions
  // to be absolute in the parent coordinate space
  const childIdRe = /\bid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  const childIds: string[] = [];
  while ((match = childIdRe.exec(inner)) !== null) {
    childIds.push(match[1]);
  }

  for (const childId of childIds) {
    // Parse child's current relative position from its style
    const childFound = findElementHtml(inner, childId);
    if (!childFound) continue;

    const styleMatch = childFound.html.match(/\bstyle="([^"]*)"/);
    if (!styleMatch) continue;

    const styleStr = styleMatch[1];
    const leftMatch = styleStr.match(/left:\s*(-?\d+(?:\.\d+)?)px/);
    const topMatch = styleStr.match(/top:\s*(-?\d+(?:\.\d+)?)px/);

    const relLeft = leftMatch ? parseFloat(leftMatch[1]) : 0;
    const relTop = topMatch ? parseFloat(topMatch[1]) : 0;

    // Convert to absolute position
    const absLeft = groupBounds.left + relLeft;
    const absTop = groupBounds.top + relTop;

    inner = updatePositionInFragment(inner, childId, absLeft, absTop);
  }

  // Replace the group element with the restored children
  const newCode =
    code.slice(0, found.start) + inner + code.slice(found.end);

  return newCode;
}
