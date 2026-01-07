// KACHERI FRONTEND/src/extensions/SectionBreak.ts
// Section break extension for marking section boundaries
// Future: can carry section-specific properties (headers, footers, orientation)

import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sectionBreak: {
      /**
       * Insert a section break at the current position
       */
      insertSectionBreak: (options?: { columns?: number }) => ReturnType;
    };
  }
}

export const SectionBreak = Node.create({
  name: "sectionBreak",
  group: "block",
  selectable: true,
  draggable: false,
  atom: true, // Non-editable leaf node

  addAttributes() {
    return {
      // Column count for the following section (for future use)
      columns: {
        default: 1,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-columns") || "1", 10),
        renderHTML: (attributes) => ({
          "data-columns": attributes.columns,
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div.kacheri-section-break' },
      { tag: 'div[data-type="section-break"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "kacheri-section-break",
        "data-type": "section-break",
      }),
    ];
  },

  addCommands() {
    return {
      insertSectionBreak:
        (options = {}) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { columns: options.columns ?? 1 },
          });
        },
    };
  },
});

export default SectionBreak;
