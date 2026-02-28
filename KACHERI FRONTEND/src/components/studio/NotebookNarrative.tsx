// KACHERI FRONTEND/src/components/studio/NotebookNarrative.tsx
// Tiptap rich-text editor for narrative blocks between frames in notebook composition mode.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 7, Slice E4

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface NotebookNarrativeProps {
  narrativeHtml: string;
  onSave: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

export function NotebookNarrative({
  narrativeHtml,
  onSave,
  readOnly = false,
  placeholder = 'Add narrative text...',
}: NotebookNarrativeProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const editor = useEditor({
    extensions: [StarterKit],
    content: narrativeHtml || '',
    editable: !readOnly,
    onBlur({ editor: ed }) {
      if (readOnly) return;
      const html = ed.getHTML();
      // Tiptap returns "<p></p>" for empty content — normalise to ""
      const normalized = html === '<p></p>' ? '' : html;
      onSaveRef.current(normalized);
    },
  });

  // Sync content when narrativeHtml prop changes (e.g. frame reordering, undo)
  const prevHtml = useRef(narrativeHtml);
  useEffect(() => {
    if (!editor) return;
    if (narrativeHtml !== prevHtml.current) {
      prevHtml.current = narrativeHtml;
      editor.commands.setContent(narrativeHtml || '');
    }
  }, [narrativeHtml, editor]);

  // Sync editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Escape blurs and triggers save
      if (e.key === 'Escape' && editor) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    },
    [editor],
  );

  return (
    <div
      className="notebook-narrative-editor"
      data-placeholder={placeholder}
      onKeyDown={handleKeyDown}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

export default NotebookNarrative;
