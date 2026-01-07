// KACHERI FRONTEND/src/extensions/ColumnSection.ts
// Column section extension for 1-2 column layouts

import { Node, mergeAttributes } from "@tiptap/core";

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
    };
  },
});

export default ColumnSection;
