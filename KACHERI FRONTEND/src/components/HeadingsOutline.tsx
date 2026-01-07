// KACHERI FRONTEND/src/components/HeadingsOutline.tsx

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { EditorApi } from "../Editor";
import {
  buildHeadingIndex,
  type HeadingIndexItem,
} from "../headingsIndex";

type HeadingsOutlineProps = {
  docId: string;
  editorApiRef: RefObject<EditorApi | null>;
};

/**
 * Document outline card.
 *
 * - Polls the editor via EditorApi.getHTML() and getPlainText().
 * - Uses the shared heading index (buildHeadingIndex) so it stays
 *   consistent with the TableOfContents component.
 * - Outline entries are clickable: clicking a heading will move the
 *   caret to that heading in the main editor via selectPlainTextRange().
 */
export default function HeadingsOutline({
  docId,
  editorApiRef,
}: HeadingsOutlineProps) {
  const [headings, setHeadings] = useState<HeadingIndexItem[]>([]);

  // Poll the editor every ~800ms and rebuild the outline when HTML changes.
  useEffect(() => {
    let lastHtml = "";
    const interval = window.setInterval(() => {
      const api = editorApiRef.current;
      if (!api) return;

      const html = api.getHTML?.() || "";
      if (html === lastHtml) return;
      lastHtml = html;

      const plain = api.getPlainText?.() || "";
      setHeadings(buildHeadingIndex(html, plain));
    }, 800);

    return () => {
      window.clearInterval(interval);
    };
  }, [docId, editorApiRef]);

  const hasHeadings = headings.length > 0;

  const handleClickHeading = (h: HeadingIndexItem) => {
    const api = editorApiRef.current;
    if (!api) return;
    if (h.start == null || h.end == null) return;

    // Best-effort jump using the shared plain‑text offsets.
    api.selectPlainTextRange?.({
      start: h.start,
      end: h.end,
    });
  };

  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 6,
        padding: 8,
      }}
    >
      <div
        style={{
          fontSize: 12,
          opacity: 0.7,
          marginBottom: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>Outline</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          {hasHeadings
            ? `${headings.length} heading${
                headings.length === 1 ? "" : "s"
              }`
            : "No headings yet"}
        </span>
      </div>

      {!hasHeadings && (
        <div
          style={{
            fontSize: 12,
            opacity: 0.6,
          }}
        >
          Start by adding headings (H1–H4) in the doc and they’ll show
          up here.
        </div>
      )}

      {hasHeadings && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => handleClickHeading(h)}
              style={{
                fontSize: 12,
                padding: "4px 6px",
                borderRadius: 4,
                border: "1px solid #f3f4f6",
                background: "rgba(15,23,42,0.02)",
                cursor:
                  h.start != null && h.end != null
                    ? "pointer"
                    : "default",
                display: "flex",
                alignItems: "center",
                textAlign: "left",
              }}
              title={
                h.start != null
                  ? "Jump to heading"
                  : h.text
              }
            >
              <span
                style={{
                  marginLeft: (h.indentLevel - 1) * 10,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: 1,
                }}
              >
                {h.text}
              </span>
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.5,
                  marginLeft: 6,
                }}
              >
                H{h.level}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
