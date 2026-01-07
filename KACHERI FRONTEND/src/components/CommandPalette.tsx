// KACHERI FRONTEND/src/components/CommandPalette.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "../palette.css";

export type Command = {
  id: string;
  title: string;
  hint?: string;
  /**
   * Run the command.
   * When `needsInput` is true, the palette will call this with the
   * text the user typed in the input box.
   */
  run: (input?: string) => Promise<void> | void;
  /**
   * If true, this command is two‑step:
   *  1) user selects the command,
   *  2) palette switches into "input mode" and collects text, then calls run(input).
   */
  needsInput?: boolean;
};

export default function CommandPalette(props: {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const { isOpen, onClose, commands } = props;
  const [query, setQuery] = useState("");
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset & focus when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveCommand(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const closePalette = useCallback(() => {
    setActiveCommand(null);
    setQuery("");
    onClose();
  }, [onClose]);

  const filtered = useMemo(() => {
    if (activeCommand) {
      // In input mode we just show the active command
      return [activeCommand];
    }
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.hint || "").toLowerCase().includes(q)
    );
  }, [commands, query, activeCommand]);

  // Keyboard handling: selection mode vs input mode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isOpen) return;

      if (e.key === "Enter") {
        e.preventDefault();

        // Already in input mode → run active command with current query
        if (activeCommand) {
          const inputVal = query.trim();
          if (activeCommand.needsInput && !inputVal) {
            window.alert("Type your instructions, then press Enter.");
            return;
          }
          Promise.resolve(activeCommand.run(inputVal)).finally(() => {
            closePalette();
          });
          return;
        }

        // Command selection mode → run or enter input mode
        const first = filtered[0];
        if (!first) return;

        if (first.needsInput) {
          // Step 1: pick command; Step 2: collect input
          setActiveCommand(first);
          setQuery("");
          setTimeout(() => inputRef.current?.focus(), 0);
        } else {
          Promise.resolve(first.run(query.trim())).finally(() => {
            closePalette();
          });
        }
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (activeCommand) {
          // Cancel input mode but keep palette open
          setActiveCommand(null);
          setQuery("");
          setTimeout(() => inputRef.current?.focus(), 0);
        } else {
          closePalette();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, activeCommand, filtered, query, closePalette]);

  if (!isOpen) return null;

  const placeholder = activeCommand
    ? activeCommand.hint ||
      `Type input for "${activeCommand.title}", then press Enter`
    : "Type to filter commands… (Enter runs top command, Esc closes)";

  return (
    <div className="pal-overlay" onClick={closePalette}>
      {/* Prevent palette mousedown from stealing editor focus (which collapses selection) */}
      <div
        className="pal"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName !== "INPUT") e.preventDefault();
        }}
      >
        <input
          ref={inputRef}
          className="pal-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="pal-list">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              className="pal-item"
              onClick={async () => {
                // Click follows same logic as Enter
                if (!activeCommand) {
                  if (cmd.needsInput) {
                    setActiveCommand(cmd);
                    setQuery("");
                    setTimeout(() => inputRef.current?.focus(), 0);
                  } else {
                    await cmd.run(query.trim());
                    closePalette();
                  }
                } else {
                  const inputVal = query.trim();
                  if (activeCommand.needsInput && !inputVal) {
                    window.alert("Type your instructions, then press Enter.");
                    return;
                  }
                  await activeCommand.run(inputVal);
                  closePalette();
                }
              }}
            >
              <div className="pal-title">{cmd.title}</div>
              {cmd.hint && <div className="pal-hint">{cmd.hint}</div>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="pal-empty">No matches</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Ctrl/Cmd+K hotkey that lets callers CAPTURE SELECTION BEFORE OPENING.
 * We call `onBeforeOpen()` synchronously, then open.
 */
export function usePaletteHotkey(
  setOpen: (b: boolean) => void,
  onBeforeOpen?: () => void
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      const withCmd = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
      if (isK && withCmd) {
        e.preventDefault();
        try {
          onBeforeOpen?.();
        } catch {
          /* noop */
        }
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen, onBeforeOpen]);
}
