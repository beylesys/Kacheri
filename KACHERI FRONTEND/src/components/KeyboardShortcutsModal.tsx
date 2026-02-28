// KACHERI FRONTEND/src/components/KeyboardShortcutsModal.tsx
// Modal displaying all available keyboard shortcuts for discoverability

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './keyboardShortcutsModal.css';

type Props = {
  open: boolean;
  onClose: () => void;
};

type ShortcutItem = {
  keys: string[];
  action: string;
};

type ShortcutSection = {
  title: string;
  shortcuts: ShortcutItem[];
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? '⌘' : 'Ctrl';

const sections: ShortcutSection[] = [
  {
    title: 'General',
    shortcuts: [
      { keys: [modKey, 'K'], action: 'Open Command Palette' },
      { keys: [modKey, 'F'], action: 'Find & Replace' },
      { keys: [modKey, 'Shift', '?'], action: 'Keyboard Shortcuts' },
      { keys: ['Esc'], action: 'Close Dialog / Cancel' },
    ],
  },
  {
    title: 'Text Formatting',
    shortcuts: [
      { keys: [modKey, 'B'], action: 'Bold' },
      { keys: [modKey, 'I'], action: 'Italic' },
      { keys: [modKey, 'U'], action: 'Underline' },
      { keys: [modKey, 'Shift', 'X'], action: 'Strikethrough' },
      { keys: [modKey, 'E'], action: 'Code' },
    ],
  },
  {
    title: 'History',
    shortcuts: [
      { keys: [modKey, 'Z'], action: 'Undo' },
      { keys: [modKey, 'Shift', 'Z'], action: 'Redo' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: [modKey, 'A'], action: 'Select All' },
    ],
  },
  {
    title: 'AI Actions',
    shortcuts: [
      { keys: [modKey, 'K'], action: 'Open Command Palette, then type:' },
      { keys: [], action: '"summarize" — Summarize selection' },
      { keys: [], action: '"tasks" — Extract action items' },
      { keys: [], action: '"rewrite" — Rewrite selection' },
      { keys: [], action: '"compose" — AI compose with prompt' },
    ],
  },
];

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Escape to close
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="shortcuts-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="keyboard-shortcuts-title" ref={dialogRef}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2 id="keyboard-shortcuts-title">Keyboard Shortcuts</h2>
          <button className="shortcuts-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="shortcuts-content">
          {sections.map((section) => (
            <div key={section.title} className="shortcuts-section">
              <h3 className="shortcuts-section-title">{section.title}</h3>
              <div className="shortcuts-list">
                {section.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className="shortcuts-row">
                    <div className="shortcuts-keys">
                      {shortcut.keys.length > 0 ? (
                        shortcut.keys.map((key, keyIdx) => (
                          <span key={keyIdx}>
                            <kbd className="shortcuts-key">{key}</kbd>
                            {keyIdx < shortcut.keys.length - 1 && (
                              <span className="shortcuts-plus">+</span>
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="shortcuts-indent">↳</span>
                      )}
                    </div>
                    <div className="shortcuts-action">{shortcut.action}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          <span className="shortcuts-hint">
            Press <kbd className="shortcuts-key">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
