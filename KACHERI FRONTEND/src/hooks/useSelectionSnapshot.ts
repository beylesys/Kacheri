// src/hooks/useSelectionSnapshot.ts
import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from 'prosemirror-state';

export type SelectionSnapshot = {
  fromPos: number;
  toPos: number;
  start: number;
  end: number;
  fullText: string;
};

/** Plain text of the whole document (block separator = two newlines). */
export function getPlainText(editor: Editor): string {
  const doc = editor.state.doc;
  return doc.textBetween(0, doc.content.size, '\n\n');
}

/** Convert ProseMirror positions to plain-text offsets. */
export function posToPlainTextOffsets(editor: Editor, fromPos: number, toPos: number) {
  const doc = editor.state.doc;
  const before = doc.textBetween(0, fromPos, '\n\n');
  const selected = doc.textBetween(fromPos, toPos, '\n\n');
  const start = before.length;
  const end = start + selected.length;
  return { start, end };
}

/**
 * Capture the current selection *before* opening any UI that steals focus
 * (palette, modal), and restore it later when applying.
 */
export function useSelectionSnapshot(editor: Editor | null) {
  const ref = useRef<SelectionSnapshot | null>(null);

  function capture(): SelectionSnapshot | null {
    if (!editor) return null;
    const { from: fromPos, to: toPos } = editor.state.selection;
    const fullText = getPlainText(editor);
    const { start, end } = posToPlainTextOffsets(editor, fromPos, toPos);
    const snap = { fromPos, toPos, start, end, fullText };
    ref.current = snap;
    return snap;
  }

  function restore() {
    if (!editor || !ref.current) return;
    const { fromPos, toPos } = ref.current;
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, fromPos, toPos));
    editor.view.dispatch(tr);
    editor.view.focus();
  }

  /** Access current snapshot (if any). */
  function current() { return ref.current; }

  return { capture, restore, current };
}
