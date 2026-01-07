import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { TextSelection } from "prosemirror-state";

// 🧩 Table extensions
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

// 🖼 Enhanced Image extension with resize, align, caption
import { ImageEnhanced, type ImageAlign } from "./extensions";

// 📄 Document structure extensions
import { PageBreak, SectionBreak, ColumnSection } from "./extensions";

// 📝 List extensions
import { OrderedListEnhanced, type NumberingStyle } from "./extensions";

// 🔗 Cross-document link extension
import { DocLink } from "./extensions";

// 🌡️ AI heatmap extension (Phase 5 - P1.2)
import { AIHeatmark } from "./extensions";

export type EditorApi = {
  getSelectionText(): string;
  insertBelowSelection(text: string): void;
  replaceSelection(text: string): void;
  getHTML(): string;

  // Connection status for realtime collaboration
  isConnected(): boolean;
  getDocId(): string;

  // Plain-text helpers for selective rewrite
  getPlainText(): string;
  getSelectionOffsetsInPlainText(): { start: number; end: number };

  // Exact ProseMirror range helpers (for reliable "Accept" after palette/diff)
  getSelectionPositions(): { from: number; to: number };
  setSelectionPositions(pos: { from: number; to: number }): void;

  // NEW: map plain-text offsets → live selection
  selectPlainTextRange(range: { start: number; end: number }): void;

  // Whole-document helpers
  setFullText(text: string): void;
  setHTML(html: string): void;

  // Table helpers (editor depth)
  insertTable(opts?: {
    rows?: number;
    cols?: number;
    withHeaderRow?: boolean;
  }): void;

  // rows
  addTableRowAbove(): void;
  addTableRowBelow(): void;
  deleteTableRow(): void;

  // columns
  addTableColumnLeft(): void;
  addTableColumnRight(): void;
  deleteTableColumn(): void;

  // structure
  toggleTableHeaderRow(): void;
  mergeSelectedCells(): void;
  splitSelectedCell(): void;
  deleteTable(): void;

  // Images (enhanced)
  insertImage(opts: {
    src: string;
    alt?: string;
    title?: string;
    width?: string;
    align?: ImageAlign;
    caption?: string;
  }): void;
  setImageAlign(align: ImageAlign): void;
  setImageWidth(width: string): void;
  setImageCaption(caption: string): void;

  // Document structure
  insertPageBreak(): void;
  insertSectionBreak(): void;
  wrapInColumns(columns?: number): void;
  unwrapColumns(): void;
  toggleColumns(columns?: number): void;

  // List operations
  toggleBulletList(): void;
  toggleOrderedList(): void;
  sinkListItem(): void;
  liftListItem(): void;
  setNumberingStyle(style: NumberingStyle): void;

  // Doc link operations
  setDocLink(opts: { toDocId: string; toDocTitle?: string }): void;
  unsetDocLink(): void;
  isDocLinkActive(): boolean;
  getDocLinkAttrs(): { toDocId: string; toDocTitle?: string } | null;

  // Underlying Tiptap editor (for advanced operations like heatmap)
  editor: import("@tiptap/core").Editor | null;
};

// Re-export types for EditorPage
export type { ImageAlign, NumberingStyle };

type Props = { docId: string };

/** Compute the WebSocket URL for y-websocket. */
function wsUrl(): string {
  const fromEnv = (import.meta.env.VITE_WS_URL || "").trim();
  if (fromEnv) {
    if (fromEnv.startsWith("/")) {
      const u = new URL(window.location.href);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = fromEnv;
      u.search = "";
      u.hash = "";
      return u.toString().replace(/\/$/, "");
    }
    return fromEnv.replace(/\/$/, "");
  }
  const u = new URL(window.location.href);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/yjs";
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}

/** Heuristic: does this string already look like HTML? */
function looksLikeHtml(input: string): boolean {
  const s = input.trim();
  if (!s.includes("<") || !s.includes(">")) return false;
  // Look for common block/inline tags we care about.
  return /<\/?(p|br|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|div|span|strong|em|img)[\s>]/i.test(
    s
  );
}

/** Escape plain text for safe inclusion in HTML. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert multi-line plain text into simple HTML blocks:
 * - Paragraphs separated by one or more blank lines.
 * - Single newlines become <br /> inside a paragraph.
 */
function plainTextToHtml(input: string): string {
  const normalized = input.replace(/\r\n/g, "\n");
  const chunks = normalized.split(/\n{2,}/); // blank line = new paragraph

  const htmlBlocks = chunks.map((chunk) => {
    const trimmed = chunk.replace(/\s+$/g, "");
    const escaped = escapeHtml(trimmed);
    if (!escaped) return "<p></p>";
    const withBreaks = escaped.replace(/\n/g, "<br />");
    return `<p>${withBreaks}</p>`;
  });

  return htmlBlocks.join("");
}

/**
 * Decide how to insert some external text into the editor:
 * - If it looks like HTML → use as-is.
 * - Otherwise → treat as plain text and normalise to HTML.
 */
function normaliseForInsertion(raw: string): string {
  const value = raw ?? "";
  if (!value.trim()) return "";
  return looksLikeHtml(value) ? value : plainTextToHtml(value);
}

const Editor = forwardRef<EditorApi, Props>(function Editor({ docId }, ref) {
  // ---- Yjs doc + provider per doc ----
  const ydoc = useMemo(() => new Y.Doc(), [docId]);
  const serverUrl = useMemo(() => wsUrl(), []);
  const provider = useMemo(
    () =>
      new WebsocketProvider(serverUrl, `doc-${docId}`, ydoc, {
        connect: false,
      }),
    [serverUrl, docId, ydoc]
  );

  // ---- Connection status badge ----
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const onStatus = (e: {
      status: "connected" | "disconnected" | "connecting";
    }) => {
      setConnected(e.status === "connected");
    };

    provider.on("status", onStatus);
    const p: any = provider as any;
    if (typeof p.wsconnected === "boolean") {
      setConnected(p.wsconnected);
    }
    provider.connect();

    return () => {
      provider.off("status", onStatus as any);
      try {
        provider.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [provider]);

  // ---- Offline cache (y-indexeddb) ----
  useEffect(() => {
    const idb = new IndexeddbPersistence(`doc-${docId}`, ydoc);
    return () => {
      try {
        idb.destroy();
      } catch {
        /* ignore */
      }
    };
  }, [docId, ydoc]);

  // ---- Selection snapshot (guards against toolbar/palette focus-steal) ----
  const selectionSnapshotRef = useRef<{
    start: number;
    end: number;
    ts: number;
  } | null>(null);
  const GRACE_MS = 2500; // time window to reuse last non-empty selection if focus briefly moves

  // ---- Tiptap editor ----
  const editor = useEditor({
    extensions: [
      // StarterKit with history disabled for collab, orderedList disabled for enhanced version
      StarterKit.configure({
        history: false,
        orderedList: false,
      }),

      // Enhanced OrderedList with legal-style numbering support
      OrderedListEnhanced,

      // Table support: keeps DOCX/HTML table structure alive
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "kacheri-table",
        },
      }),
      TableRow,
      TableHeader,
      TableCell,

      // Enhanced Image support with resize, align, caption
      ImageEnhanced.configure({
        inline: false,
        HTMLAttributes: {
          class: "kacheri-image",
        },
      }),

      // Document structure extensions
      PageBreak,
      SectionBreak,
      ColumnSection,

      // Cross-document links
      DocLink,

      // AI heatmap highlighting (Phase 5 - P1.2)
      AIHeatmark,

      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider,
        user: { name: "You", color: "#4c6ef5" },
      }),
    ],
    autofocus: true,
    content: "",
    editorProps: {
      attributes: {
        style:
          "min-height:60vh; outline:none; font: 16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;",
      },
      // Handle clicks on doc links to navigate
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains("kacheri-doc-link")) {
          const docId = target.getAttribute("data-doc-id");
          if (docId) {
            // Open linked document in new tab
            window.open(`/doc/${docId}`, "_blank");
            return true;
          }
        }
        return false;
      },
    },
    onSelectionUpdate: ({ editor }) => {
      // Keep a rolling snapshot of the latest non-empty selection in *plain-text offsets*
      try {
        const doc = editor.state.doc;
        const { from, to } = editor.state.selection;
        if (to > from) {
          const start = doc.textBetween(0, from, "\n").length;
          const end = start + doc.textBetween(from, to, "\n").length;
          selectionSnapshotRef.current = { start, end, ts: Date.now() };
        }
      } catch {
        /* ignore */
      }
    },
  });

  // Focus caret once the editor is ready
  useEffect(() => {
    if (editor) editor.commands.focus("end");
  }, [editor]);

  // ---- Imperative API exposed to parent ----
  useImperativeHandle(
    ref,
    (): EditorApi => ({
      // Connection status for realtime status badge
      isConnected() {
        return connected;
      },

      getDocId() {
        return docId;
      },

      getSelectionText() {
        if (!editor) return "";
        const { from, to } = editor.state.selection;
        return editor.state.doc.textBetween(from, to, "\n");
      },

      insertBelowSelection(text: string) {
        if (!editor) return;
        const html = normaliseForInsertion(text);
        if (!html) return;

        const { to } = editor.state.selection;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: to, to })
          .insertContent(html)
          .run();
      },

      replaceSelection(text: string) {
        if (!editor) return;
        const html = normaliseForInsertion(text);
        if (!html) return;
        editor.chain().focus().insertContent(html).run();
      },

      getHTML() {
        return editor?.getHTML() ?? "<p></p>";
      },

      // Plain-text helpers for selective rewrite
      getPlainText() {
        if (!editor) return "";
        const doc = editor.state.doc;
        return doc.textBetween(0, doc.content.size, "\n");
      },

      getSelectionOffsetsInPlainText() {
        if (!editor) return { start: 0, end: 0 };
        const doc = editor.state.doc;
        const { from, to } = editor.state.selection;
        const liveStart = doc.textBetween(0, from, "\n").length;
        const liveEnd = liveStart + doc.textBetween(from, to, "\n").length;
        if (liveEnd > liveStart) {
          return { start: liveStart, end: liveEnd };
        }
        const snap = selectionSnapshotRef.current;
        if (snap && snap.end > snap.start && Date.now() - snap.ts <= GRACE_MS) {
          return { start: snap.start, end: snap.end };
        }
        return { start: 0, end: 0 };
      },

      // Exact PM range helpers
      getSelectionPositions() {
        if (!editor) return { from: 0, to: 0 };
        const { from, to } = editor.state.selection;
        return { from, to };
      },

      setSelectionPositions(pos) {
        if (!editor) return;
        const { from, to } = pos;
        const tr = editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, from, to)
        );
        editor.view.dispatch(tr);
        editor.view.focus();
      },

      // NEW: select a span given plain-text offsets (used by Find/Replace)
      selectPlainTextRange(range) {
        if (!editor) return;
        const doc = editor.state.doc;
        const docSize = doc.content.size;

        let start = Math.min(range.start, range.end);
        let end = Math.max(range.start, range.end);

        if (start < 0) start = 0;
        if (end < 0) end = 0;

        const fullLen = doc.textBetween(0, docSize, "\n").length;
        if (start > fullLen) start = fullLen;
        if (end > fullLen) end = fullLen;

        const offsetToPos = (off: number): number => {
          if (off <= 0) return 0;
          if (off >= fullLen) return docSize;

          let lo = 0;
          let hi = docSize;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            const len = doc.textBetween(0, mid, "\n").length;
            if (len < off) {
              lo = mid + 1;
            } else {
              hi = mid;
            }
          }
          return lo;
        };

        const fromPos = offsetToPos(start);
        const toPos = offsetToPos(end);

        const tr = editor.state.tr.setSelection(
          TextSelection.create(doc, fromPos, toPos)
        );
        editor.view.dispatch(tr);
        editor.view.focus();
      },

      // Whole-document helpers
      setFullText(text: string) {
        if (!editor) return;
        const html = normaliseForInsertion(text);
        if (!html) {
          editor.commands.clearContent(true);
          return;
        }
        editor.commands.setContent(html, false);
        editor.commands.focus("end");
      },

      setHTML(html: string) {
        if (!editor) return;
        editor.commands.setContent(html || "<p></p>", false);
        editor.commands.focus("end");
      },

      // Table helpers (editor depth)
      insertTable(opts) {
        if (!editor) return;
        const { rows = 3, cols = 3, withHeaderRow = true } = opts || {};
        editor
          .chain()
          .focus()
          .insertTable({ rows, cols, withHeaderRow })
          .run();
      },

      // rows
      addTableRowAbove() {
        if (!editor) return;
        editor.chain().focus().addRowBefore().run();
      },

      addTableRowBelow() {
        if (!editor) return;
        editor.chain().focus().addRowAfter().run();
      },

      deleteTableRow() {
        if (!editor) return;
        editor.chain().focus().deleteRow().run();
      },

      // columns
      addTableColumnLeft() {
        if (!editor) return;
        editor.chain().focus().addColumnBefore().run();
      },

      addTableColumnRight() {
        if (!editor) return;
        editor.chain().focus().addColumnAfter().run();
      },

      deleteTableColumn() {
        if (!editor) return;
        editor.chain().focus().deleteColumn().run();
      },

      // structure
      toggleTableHeaderRow() {
        if (!editor) return;
        editor.chain().focus().toggleHeaderRow().run();
      },

      mergeSelectedCells() {
        if (!editor) return;
        editor.chain().focus().mergeCells().run();
      },

      splitSelectedCell() {
        if (!editor) return;
        editor.chain().focus().splitCell().run();
      },

      deleteTable() {
        if (!editor) return;
        editor.chain().focus().deleteTable().run();
      },

      // Enhanced Images
      insertImage(opts) {
        if (!editor) return;
        const src = (opts.src || "").trim();
        if (!src) return;

        const alt = opts.alt ?? "";
        const title = opts.title ?? "";
        const width = opts.width ?? null;
        const align = opts.align ?? "center";
        const caption = opts.caption ?? "";

        // Use the enhanced Image extension command
        const cmds: any = editor.commands as any;
        if (cmds && typeof cmds.setImage === "function") {
          cmds.setImage({
            src,
            alt,
            title,
            width,
            align,
            caption,
          });
          editor.commands.focus("end");
          return;
        }

        // Fallback: insert raw <img> HTML
        const escapedAlt = alt.replace(/"/g, "&quot;");
        const html = `<img src="${src}" alt="${escapedAlt}" title="${escapedAlt}">`;
        editor.chain().focus().insertContent(html).run();
      },

      setImageAlign(align) {
        if (!editor) return;
        const cmds: any = editor.commands as any;
        if (cmds && typeof cmds.setImageAlign === "function") {
          cmds.setImageAlign(align);
        }
      },

      setImageWidth(width) {
        if (!editor) return;
        const cmds: any = editor.commands as any;
        if (cmds && typeof cmds.setImageWidth === "function") {
          cmds.setImageWidth(width);
        }
      },

      setImageCaption(caption) {
        if (!editor) return;
        const cmds: any = editor.commands as any;
        if (cmds && typeof cmds.setImageCaption === "function") {
          cmds.setImageCaption(caption);
        }
      },

      // Document structure methods
      insertPageBreak() {
        if (!editor) return;
        editor.commands.insertPageBreak();
      },

      insertSectionBreak() {
        if (!editor) return;
        editor.commands.insertSectionBreak();
      },

      wrapInColumns(columns = 2) {
        if (!editor) return;
        editor.commands.wrapInColumns(columns);
      },

      unwrapColumns() {
        if (!editor) return;
        editor.commands.unwrapColumns();
      },

      toggleColumns(columns = 2) {
        if (!editor) return;
        editor.commands.toggleColumns(columns);
      },

      // List operations
      toggleBulletList() {
        if (!editor) return;
        editor.chain().focus().toggleBulletList().run();
      },

      toggleOrderedList() {
        if (!editor) return;
        editor.chain().focus().toggleOrderedList().run();
      },

      sinkListItem() {
        if (!editor) return;
        editor.chain().focus().sinkListItem("listItem").run();
      },

      liftListItem() {
        if (!editor) return;
        editor.chain().focus().liftListItem("listItem").run();
      },

      setNumberingStyle(style) {
        if (!editor) return;
        (editor.commands as any).setNumberingStyle?.(style);
      },

      // Doc link operations
      setDocLink(opts) {
        if (!editor) return;
        editor.chain().focus().setDocLink(opts).run();
      },

      unsetDocLink() {
        if (!editor) return;
        editor.chain().focus().unsetDocLink().run();
      },

      isDocLinkActive() {
        return editor?.isActive("docLink") ?? false;
      },

      getDocLinkAttrs() {
        if (!editor) return null;
        const attrs = editor.getAttributes("docLink");
        if (!attrs || !attrs.toDocId) return null;
        return attrs as { toDocId: string; toDocTitle?: string };
      },

      // Underlying Tiptap editor (for advanced operations like heatmap)
      get editor() {
        return editor;
      },
    }),
    [editor, connected, docId]
  );

  // ---- Cleanup ----
  useEffect(() => {
    return () => {
      try {
        provider.destroy();
      } catch {
        /* ignore */
      }
      try {
        ydoc.destroy();
      } catch {
        /* ignore */
      }
    };
  }, [provider, ydoc]);

  return (
    <>
      {/* Editor content - no wrapper styling, EditorPage owns the page look */}
      <div className="editor-content">
        <EditorContent editor={editor} />
      </div>
    </>
  );
});

export default Editor;
