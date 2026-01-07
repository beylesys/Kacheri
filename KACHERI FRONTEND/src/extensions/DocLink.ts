// KACHERI FRONTEND/src/extensions/DocLink.ts
// Custom Mark extension for cross-document links

import { Mark, mergeAttributes } from "@tiptap/core";

// Extend Tiptap's Commands interface to add our custom commands
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docLink: {
      /**
       * Set a doc link mark on the current selection
       */
      setDocLink: (attrs: { toDocId: string; toDocTitle?: string }) => ReturnType;
      /**
       * Remove the doc link mark from the current selection
       */
      unsetDocLink: () => ReturnType;
      /**
       * Toggle a doc link mark on the current selection
       */
      toggleDocLink: (attrs: { toDocId: string; toDocTitle?: string }) => ReturnType;
    };
  }
}

export interface DocLinkOptions {
  /**
   * HTML attributes to add to the rendered element
   */
  HTMLAttributes: Record<string, unknown>;
}

export const DocLink = Mark.create<DocLinkOptions>({
  name: "docLink",

  // Higher priority than regular Link to take precedence
  priority: 1000,

  // Can span across nodes (inline behavior)
  spanning: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      toDocId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-doc-id"),
        renderHTML: (attributes) => {
          if (!attributes.toDocId) {
            return {};
          }
          return { "data-doc-id": attributes.toDocId };
        },
      },
      toDocTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-doc-title"),
        renderHTML: (attributes) => {
          if (!attributes.toDocTitle) {
            return {};
          }
          return { "data-doc-title": attributes.toDocTitle };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-doc-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "kacheri-doc-link",
        href: "#",
        "data-type": "doc-link",
      }),
      0, // Content slot for the marked text
    ];
  },

  addCommands() {
    return {
      setDocLink:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },

      unsetDocLink:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },

      toggleDocLink:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attrs);
        },
    };
  },
});

export default DocLink;
