import { useEffect, useMemo } from "react";

type HeadingItem = {
  id: string;
  level: number;
  text: string;
  start: number | null;
  end: number | null;
};

type Props = {
  open: boolean;

  query: string;
  replaceValue: string;
  caseSensitive: boolean;
  currentIndex: number | null;
  total: number;

  onChangeQuery: (value: string) => void;
  onChangeReplace: (value: string) => void;
  onToggleCaseSensitive: () => void;

  onFindNext: () => void;
  onFindPrev: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;

  headings: HeadingItem[];
  onJumpToHeading: (range: { start: number; end: number }) => void;

  onClose: () => void;
};

export default function FindReplaceDialog({
  open,
  query,
  replaceValue,
  caseSensitive,
  currentIndex,
  total,
  onChangeQuery,
  onChangeReplace,
  onToggleCaseSensitive,
  onFindNext,
  onFindPrev,
  onReplaceCurrent,
  onReplaceAll,
  headings,
  onJumpToHeading,
  onClose,
}: Props) {
  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Better match counter messaging
  const label = useMemo(() => {
    if (!query.trim()) return "Type to search";
    if (total === 0) return "No matches found";
    if (currentIndex != null) return `${currentIndex + 1} of ${total}`;
    return `${total} match${total === 1 ? "" : "es"}`;
  }, [query, total, currentIndex]);

  const noMatches = total === 0 && query.trim().length > 0;

  if (!open) return null;

  const handleBackdropClick = (e: any) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "90vw",
          background: "#111827",
          color: "#f9fafb",
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Find &amp; Replace
            </div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              Ctrl/Cmd+F to open. Enter to find next, Esc to close.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              opacity: 0.8,
              marginBottom: 4,
            }}
          >
            Find
          </label>
          <input
            autoFocus
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) onFindPrev();
                else onFindNext();
              }
            }}
            placeholder="Text to find…"
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: noMatches ? "1px solid #ef4444" : "1px solid #374151",
              background: "#111827",
              color: "#f9fafb",
              fontSize: 13,
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              opacity: 0.8,
              marginBottom: 4,
            }}
          >
            Replace with
          </label>
          <input
            value={replaceValue}
            onChange={(e) => onChangeReplace(e.target.value)}
            placeholder="Replacement text…"
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #374151",
              background: "#111827",
              color: "#f9fafb",
              fontSize: 13,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 4,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              opacity: 0.85,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={onToggleCaseSensitive}
            />
            Case sensitive
          </label>

          <div
            style={{
              fontSize: 12,
              color: noMatches ? "#ef4444" : "#e5e7eb",
              opacity: noMatches ? 1 : 0.75,
            }}
          >
            {label}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 8,
          }}
        >
          <button
            type="button"
            onClick={onFindPrev}
            disabled={total === 0}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #4b5563",
              background: "transparent",
              color: total === 0 ? "#6b7280" : "#e5e7eb",
              cursor: total === 0 ? "not-allowed" : "pointer",
              opacity: total === 0 ? 0.5 : 1,
            }}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={onFindNext}
            disabled={total === 0}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #4b5563",
              background: "transparent",
              color: total === 0 ? "#6b7280" : "#e5e7eb",
              cursor: total === 0 ? "not-allowed" : "pointer",
              opacity: total === 0 ? 0.5 : 1,
            }}
          >
            Next
          </button>
          <button
            type="button"
            onClick={onReplaceCurrent}
            disabled={total === 0}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              borderRadius: 6,
              border: "none",
              background: total === 0 ? "#065f46" : "#10b981",
              color: "#111827",
              fontWeight: 600,
              cursor: total === 0 ? "not-allowed" : "pointer",
              opacity: total === 0 ? 0.5 : 1,
            }}
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onReplaceAll}
            disabled={total === 0}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              borderRadius: 6,
              border: "none",
              background: total === 0 ? "#1e3a5f" : "#3b82f6",
              color: "#ffffff",
              fontWeight: 600,
              cursor: total === 0 ? "not-allowed" : "pointer",
              opacity: total === 0 ? 0.5 : 1,
            }}
          >
            All ({total})
          </button>
        </div>

        {/* Headings navigation */}
        {headings.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div
              style={{
                fontSize: 11,
                opacity: 0.6,
                marginBottom: 4,
              }}
            >
              Jump to heading
            </div>
            <select
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10);
                const h = headings[idx];
                if (h?.start != null && h?.end != null) {
                  onJumpToHeading({ start: h.start, end: h.end });
                }
              }}
              value=""
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #374151",
                background: "#111827",
                color: "#f9fafb",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <option value="">Select a heading...</option>
              {headings.map((h, i) => (
                <option key={h.id} value={i}>
                  {"  ".repeat(h.level - 1)}
                  {h.text.slice(0, 40)}
                  {h.text.length > 40 ? "…" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
