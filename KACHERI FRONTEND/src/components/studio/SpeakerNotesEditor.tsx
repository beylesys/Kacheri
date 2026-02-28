// KACHERI FRONTEND/src/components/studio/SpeakerNotesEditor.tsx
// Rich text editor for per-frame speaker notes using Tiptap.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D6

import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

interface SpeakerNotesEditorProps {
  notes: string;
  onSave: (notes: string) => void;
  readOnly?: boolean;
}

export function SpeakerNotesEditor({
  notes,
  onSave,
  readOnly = false,
}: SpeakerNotesEditorProps) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const editor = useEditor({
    extensions: [StarterKit],
    content: notes || '',
    editable: !readOnly,
    onBlur({ editor: ed }) {
      if (readOnly) return;
      const html = ed.getHTML();
      // Tiptap returns "<p></p>" for empty content — normalise to ""
      const normalized = html === '<p></p>' ? '' : html;
      onSaveRef.current(normalized);
    },
  });

  // Sync content when notes prop changes (e.g. switching frames)
  const prevNotes = useRef(notes);
  useEffect(() => {
    if (!editor) return;
    if (notes !== prevNotes.current) {
      prevNotes.current = notes;
      editor.commands.setContent(notes || '');
    }
  }, [notes, editor]);

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
      className="speaker-notes-editor"
      onKeyDown={handleKeyDown}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

export default SpeakerNotesEditor;
