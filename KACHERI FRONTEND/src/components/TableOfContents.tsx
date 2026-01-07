// KACHERI FRONTEND/src/components/TableOfContents.tsx

import * as React from "react";
import type { EditorApi } from "../Editor";
import {
  buildHeadingIndex,
  type HeadingIndexItem,
} from "../headingsIndex";

export interface TableOfContentsProps {
  docId: string;
  editorApiRef: React.RefObject<EditorApi | null>;
}

/**
 * TableOfContents
 *
 * - Uses the shared heading index (H1–H4) so it stays aligned with
 *   HeadingsOutline and plain‑text offsets.
 * - Shows a small preview list in the sidebar (now clickable).
 * - Can insert or update an inline TOC block at the top of the doc:
 *   <div data-kacheri-toc="1"> ... </div>
 *
 * This is a pure client-side feature; no backend calls.
 */
export const TableOfContents: React.FC<TableOfContentsProps> = ({
  docId,
  editorApiRef,
}) => {
  const [headings, setHeadings] = React.useState<HeadingIndexItem[]>(
    []
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const readHtml = React.useCallback((): string => {
    const api = editorApiRef.current;
    if (!api || typeof api.getHTML !== "function") return "";
    try {
      return api.getHTML() || "";
    } catch {
      return "";
    }
  }, [editorApiRef]);

  const readPlainText = React.useCallback((): string => {
    const api = editorApiRef.current;
    if (!api || typeof api.getPlainText !== "function") return "";
    try {
      return api.getPlainText() || "";
    } catch {
      return "";
    }
  }, [editorApiRef]);

  const refreshHeadings = React.useCallback(() => {
    const html = readHtml();

    if (!html.trim()) {
      setHeadings([]);
      setError(null);
      return;
    }

    try {
      setError(null);
      const plain = readPlainText();

      // For ToC we only care about H1–H4 for now.
      const items = buildHeadingIndex(html, plain, {
        maxLevel: 4,
      });

      setHeadings(items);
    } catch (err) {
      console.error("TableOfContents: refreshHeadings failed", err);
      setError("Failed to parse document headings");
    }
  }, [readHtml, readPlainText]);

  React.useEffect(() => {
    // Refresh when docId changes (open a different doc).
    refreshHeadings();
  }, [docId, refreshHeadings]);

  const insertOrUpdateToc = React.useCallback(() => {
    const api = editorApiRef.current;

    if (!api || typeof api.getHTML !== "function") {
      setError("Editor not ready");
      return;
    }

    if (!headings.length) {
      setError("No headings found to build a table of contents");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const html = api.getHTML() || "";
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const body = doc.body;

      // Build or reuse TOC DOM container
      const tocDiv =
        body.querySelector<HTMLDivElement>('div[data-kacheri-toc="1"]') ??
        doc.createElement("div");

      tocDiv.setAttribute("data-kacheri-toc", "1");
      tocDiv.className = "toc-block";

      // Clear old children
      while (tocDiv.firstChild) {
        tocDiv.removeChild(tocDiv.firstChild);
      }

      const headingLabel = doc.createElement("p");
      headingLabel.className = "toc-title";
      headingLabel.textContent = "Contents";
      tocDiv.appendChild(headingLabel);

      const list = doc.createElement("ul");
      list.className = "toc-list";

      // Try to wire anchors so exports (PDF/DOCX) keep clickable links.
      const headingNodes = Array.from(
        body.querySelectorAll<HTMLElement>("h1, h2, h3, h4")
      );

      if (headingNodes.length === headings.length) {
        // 1:1 mapping between H1–H4 nodes and indexed headings.
        headingNodes.forEach((el, index) => {
          const h = headings[index];

          // Preserve existing id if present; otherwise assign a stable one.
          const anchorId =
            el.getAttribute("id") || `kacheri-toc-${index + 1}`;
          el.setAttribute("id", anchorId);

          const li = doc.createElement("li");
          li.className = `toc-item toc-level-${h.level}`;

          const a = doc.createElement("a");
          a.setAttribute("href", `#${anchorId}`);
          a.textContent = h.text;

          li.appendChild(a);
          list.appendChild(li);
        });
      } else {
        // Fallback: no anchor wiring, just plain text entries.
        headings.forEach((h) => {
          const li = doc.createElement("li");
          li.className = `toc-item toc-level-${h.level}`;
          li.textContent = h.text;
          list.appendChild(li);
        });
      }

      tocDiv.appendChild(list);

      if (!body.contains(tocDiv)) {
        // Insert TOC at the very top of the document
        if (body.firstChild) {
          body.insertBefore(tocDiv, body.firstChild);
        } else {
          body.appendChild(tocDiv);
        }
      }

      const newHtml = body.innerHTML;

      // Prefer setHTML if it exists; fall back to setFullText.
      const anyApi = api as any;
      if (typeof anyApi.setHTML === "function") {
        anyApi.setHTML(newHtml);
      } else if (typeof api.setFullText === "function") {
        api.setFullText(newHtml);
      }
    } catch (err) {
      console.error("TableOfContents: insertOrUpdateToc failed", err);
      setError("Failed to insert/update table of contents");
    } finally {
      setLoading(false);
    }
  }, [editorApiRef, headings]);

  // Sidebar click → jump to heading inside the editor.
  const handleClickHeading = React.useCallback(
    (h: HeadingIndexItem) => {
      const api = editorApiRef.current;
      if (!api) return;
      if (h.start == null || h.end == null) return;

      api.selectPlainTextRange?.({
        start: h.start,
        end: h.end,
      });
    },
    [editorApiRef]
  );

  return (
    <div className="sidebar-card toc-card">
      <div className="sidebar-card-header">
        <div className="sidebar-card-title">Table of contents</div>
        <div className="sidebar-card-actions">
          <button
            type="button"
            className="btn btn-xs"
            onClick={refreshHeadings}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-xs"
            onClick={insertOrUpdateToc}
            disabled={!headings.length || loading}
          >
            {loading
              ? "Updating…"
              : headings.length
              ? "Insert / Update"
              : "Insert"}
          </button>
        </div>
      </div>

      {error && <div className="sidebar-card-error">{error}</div>}

      {!error && !headings.length && (
        <p className="sidebar-card-empty">
          No headings yet. Add some H1–H4 headings to your document and
          click Refresh.
        </p>
      )}

      {!!headings.length && (
        <ol className="toc-preview">
          {headings.map((h) => (
            <li
              key={h.id}
              className={`toc-preview-item toc-level-${h.level}`}
              onClick={() => handleClickHeading(h)}
              style={{
                cursor:
                  h.start != null && h.end != null
                    ? "pointer"
                    : "default",
              }}
              title={
                h.start != null
                  ? "Jump to heading"
                  : undefined
              }
            >
              <span className="toc-preview-bullet">•</span>
              <span className="toc-preview-text">{h.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default TableOfContents;
