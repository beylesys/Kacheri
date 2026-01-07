// src/text/selectionUtils.ts
export interface Selection {
  start: number;
  end: number; // exclusive
}

export function clampSelection(text: string, sel: Selection): Selection {
  const len = text.length;
  const start = Math.max(0, Math.min(sel.start, len));
  const end = Math.max(start, Math.min(sel.end, len));
  return { start, end };
}

export function extract(text: string, sel: Selection): string {
  const { start, end } = clampSelection(text, sel);
  return text.slice(start, end);
}

export function applySelectionPatch(text: string, sel: Selection, replacement: string): { newText: string } {
  const { start, end } = clampSelection(text, sel);
  const before = text.slice(0, start);
  const after = text.slice(end);
  return { newText: `${before}${replacement}${after}` };
}
