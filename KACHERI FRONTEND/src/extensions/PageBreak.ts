// KACHERI FRONTEND/src/extensions/PageBreak.ts
// Page break extension for forcing new pages in exports

import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /**
       * Insert a page break at the current position
       */
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  selectable: true,
  draggable: false,
  atom: true, // Non-editable leaf node

  parseHTML() {
    return [
      { tag: 'div.kacheri-page-break' },
      { tag: 'div[data-type="page-break"]' },
      // Also parse Word-style page breaks from imported docs
      { tag: 'div[style*="page-break"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "kacheri-page-break",
        "data-type": "page-break",
      }),
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Ctrl/Cmd + Shift + Enter to insert page break
      "Mod-Shift-Enter": () => this.editor.commands.insertPageBreak(),
    };
  },
});

export default PageBreak;
