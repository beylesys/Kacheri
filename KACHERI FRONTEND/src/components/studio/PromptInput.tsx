// KACHERI FRONTEND/src/components/studio/PromptInput.tsx
// Text input area with action mode selector for Design Studio conversation panel.
// Supports Generate / Edit / Style modes, doc reference attachment, and memory context toggle.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C4

import { useState, useRef, useCallback } from 'react';
import type { ActionMode } from '../../hooks/useCanvasConversation';
import { isProductEnabled, isFeatureEnabled } from '../../modules/registry';
import { DocPickerModal } from '../DocPickerModal';

const MAX_CHARS = 2000;

const MODE_OPTIONS: { mode: ActionMode; label: string; title: string }[] = [
  { mode: 'generate', label: 'Generate', title: 'Generate new frame(s) from prompt' },
  { mode: 'edit', label: 'Edit', title: 'Edit the selected frame' },
  { mode: 'style', label: 'Style', title: 'Restyle the selected frame(s)' },
];

interface PromptInputProps {
  onSubmit: (prompt: string, mode: ActionMode, options: PromptOptions) => void;
  loading: boolean;
  hasActiveFrame: boolean;
  /** External control to focus the input (e.g., from "Add Frame" button) */
  focusTrigger?: number;
  /** Pre-fill prompt text (e.g., from "Request Changes") */
  prefill?: string;
}

export interface PromptOptions {
  docRefs?: string[];
  includeMemoryContext?: boolean;
}

export function PromptInput({
  onSubmit,
  loading,
  hasActiveFrame,
  focusTrigger,
  prefill,
}: PromptInputProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ActionMode>('generate');
  const [includeMemory, setIncludeMemory] = useState(false);
  const [docRefs, setDocRefs] = useState<{ id: string; title: string }[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const docsEnabled = isProductEnabled('docs');
  const memoryEnabled = isFeatureEnabled('memoryGraph');

  // Handle prefill from parent
  if (prefill && text !== prefill) {
    setText(prefill);
  }

  // Focus trigger from parent
  if (focusTrigger) {
    // Defer focus to next tick to avoid stale ref
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    onSubmit(trimmed, mode, {
      docRefs: docRefs.length > 0 ? docRefs.map((d) => d.id) : undefined,
      includeMemoryContext: includeMemory || undefined,
    });

    setText('');
    setDocRefs([]);
  }, [text, loading, mode, docRefs, includeMemory, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleDocSelect = useCallback((doc: { id: string; title: string }) => {
    setDocRefs((prev) => {
      if (prev.some((d) => d.id === doc.id)) return prev;
      return [...prev, doc];
    });
    setShowDocPicker(false);
  }, []);

  const removeDocRef = useCallback((docId: string) => {
    setDocRefs((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  const charCount = text.length;
  const overLimit = charCount > MAX_CHARS;

  return (
    <div className="prompt-input">
      {/* Action mode selector */}
      <div className="prompt-input-mode" role="group" aria-label="Action mode">
        {MODE_OPTIONS.map(({ mode: m, label, title }) => {
          const disabled = (m === 'edit' || m === 'style') && !hasActiveFrame;
          return (
            <button
              key={m}
              className={
                'prompt-input-mode-btn' + (mode === m ? ' active' : '')
              }
              onClick={() => setMode(m)}
              disabled={disabled}
              aria-pressed={mode === m}
              title={disabled ? `${title} (select a frame first)` : title}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Doc reference tags */}
      {docRefs.length > 0 && (
        <div className="prompt-input-docrefs">
          {docRefs.map((doc) => (
            <span key={doc.id} className="prompt-input-docref">
              {doc.title}
              <button
                className="prompt-input-docref-remove"
                onClick={() => removeDocRef(doc.id)}
                aria-label={`Remove reference to ${doc.title}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Textarea */}
      <div className="prompt-input-field">
        <textarea
          ref={textareaRef}
          className="prompt-input-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            loading
              ? 'Generating...'
              : mode === 'generate'
                ? 'Describe what you want to create...'
                : mode === 'edit'
                  ? 'Describe how to edit this frame...'
                  : 'Describe the style changes...'
          }
          disabled={loading}
          rows={3}
          aria-label="Prompt input"
        />
      </div>

      {/* Bottom bar: options + send */}
      <div className="prompt-input-bar">
        <div className="prompt-input-options">
          {docsEnabled && (
            <button
              className="prompt-input-option-btn"
              onClick={() => setShowDocPicker(true)}
              disabled={loading}
              title="Reference a document"
            >
              + Doc
            </button>
          )}

          {memoryEnabled && (
            <label className="prompt-input-memory-toggle" title="Include cross-product memory context">
              <input
                type="checkbox"
                checked={includeMemory}
                onChange={(e) => setIncludeMemory(e.target.checked)}
                disabled={loading}
              />
              <span className="prompt-input-memory-label">Memory</span>
            </label>
          )}
        </div>

        <div className="prompt-input-right">
          <span
            className={
              'prompt-input-charcount' + (overLimit ? ' over-limit' : '')
            }
          >
            {charCount}/{MAX_CHARS}
          </span>

          <button
            className="prompt-input-send"
            onClick={handleSubmit}
            disabled={loading || !text.trim() || overLimit}
            aria-label="Send prompt"
            title="Send (Enter)"
          >
            {loading ? (
              <span className="prompt-input-send-loading" />
            ) : (
              <span>&#x2191;</span>
            )}
          </button>
        </div>
      </div>

      {/* Doc picker modal */}
      {showDocPicker && (
        <DocPickerModal
          open={showDocPicker}
          onClose={() => setShowDocPicker(false)}
          onSelect={handleDocSelect}
          title="Reference a Document"
        />
      )}
    </div>
  );
}
