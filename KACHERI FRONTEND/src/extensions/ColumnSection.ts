// KACHERI FRONTEND/src/extensions/ColumnSection.ts
// Column section extension for multi-column layouts (1-4 columns)

import { Node, mergeAttributes } from "@tiptap/core";

export type ColumnGap = "narrow" | "medium" | "wide";
export type ColumnRule = "none" | "thin" | "medium";

/** Convert a widths ratio string (e.g. "2:1") to CSS grid-template-columns (e.g. "2fr 1fr"). */
function widthsToGridTemplate(widths: string): string {
  return widths
    .split(":")
    .map((p) => `${p.trim()}fr`)
    .join(" ");
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnSection: {
      /**
       * Wrap selection in a column section
       */
      wrapInColumns: (columns?: number) => ReturnType;
      /**
       * Remove column section wrapper (unwrap to single column)
       */
      unwrapColumns: () => ReturnType;
      /**
       * Toggle column section: if in columns, unwrap; otherwise wrap in 2 columns
       */
      toggleColumns: (columns?: number) => ReturnType;
      /**
       * Update column count for the current column section
       */
      setColumnCount: (columns: number) => ReturnType;
      /**
       * Set column gap (narrow, medium, wide)
       */
      setColumnGap: (gap: ColumnGap) => ReturnType;
      /**
       * Set column rule (none, thin, medium)
       */
      setColumnRule: (rule: ColumnRule) => ReturnType;
      /**
       * Set per-column width ratios (e.g. "2:1", "1:1:1", "1:2:1") or null for equal
       */
      setColumnWidths: (widths: string | null) => ReturnType;
    };
  }
}

export const ColumnSection = Node.create({
  name: "columnSection",
  group: "block",
  content: "block+", // Must contain at least one block
  defining: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-columns") || "2", 10),
        renderHTML: (attributes) => ({
          "data-columns": attributes.columns,
        }),
      },
      columnGap: {
        default: "medium" as ColumnGap,
        parseHTML: (element) =>
          (element.getAttribute("data-column-gap") || "medium") as ColumnGap,
        renderHTML: (attributes) => ({
          "data-column-gap": attributes.columnGap,
        }),
      },
      columnRule: {
        default: "none" as ColumnRule,
        parseHTML: (element) =>
          (element.getAttribute("data-column-rule") || "none") as ColumnRule,
        renderHTML: (attributes) => ({
          "data-column-rule": attributes.columnRule,
        }),
      },
      columnWidths: {
        default: null as string | null,
        parseHTML: (element) =>
          element.getAttribute("data-column-widths") || null,
        renderHTML: (attributes) => {
          if (!attributes.columnWidths) return {};
          return {
            "data-column-widths": attributes.columnWidths,
            style: `display: grid; grid-template-columns: ${widthsToGridTemplate(attributes.columnWidths)};`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div.kacheri-columns' },
      { tag: 'div[data-columns]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "kacheri-columns",
      }),
      0, // Content hole
    ];
  },

  addCommands() {
    return {
      wrapInColumns:
        (columns = 2) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, { columns });
        },

      unwrapColumns:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },

      toggleColumns:
        (columns = 2) =>
        ({ state, commands }) => {
          // Check if we're currently inside a columnSection
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "columnSection") {
              // Already in columns, unwrap
              return commands.lift(this.name);
            }
          }
          // Not in columns, wrap
          return commands.wrapIn(this.name, { columns });
        },

      setColumnCount:
        (columns) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { columns });
        },

      setColumnGap:
        (gap) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { columnGap: gap });
        },

      setColumnRule:
        (rule) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { columnRule: rule });
        },

      setColumnWidths:
        (widths) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { columnWidths: widths });
        },
    };
  },
});

export default ColumnSection;
