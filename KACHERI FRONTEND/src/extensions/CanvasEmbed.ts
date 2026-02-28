// KACHERI FRONTEND/src/extensions/CanvasEmbed.ts
// Tiptap node extension for embedding Design Studio canvas frames in Docs.
//
// Renders a sandboxed iframe showing the frame content (read-only).
// When Design Studio is disabled, existing canvas-embed nodes show a
// placeholder message instead of the iframe.
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice P9

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import CanvasEmbedView from "../components/CanvasEmbedView";

export interface CanvasEmbedAttrs {
  canvasId: string;
  frameId: string;
  aspectRatio: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    canvasEmbed: {
      /**
       * Insert a canvas frame embed into the document.
       */
      insertCanvasEmbed: (attrs: CanvasEmbedAttrs) => ReturnType;
    };
  }
}

export const CanvasEmbed = Node.create({
  name: "canvasEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      canvasId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-canvas-id"),
        renderHTML: (attributes) => ({
          "data-canvas-id": attributes.canvasId,
        }),
      },
      frameId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-frame-id"),
        renderHTML: (attributes) => ({
          "data-frame-id": attributes.frameId,
        }),
      },
      aspectRatio: {
        default: "16/9",
        parseHTML: (element) =>
          element.getAttribute("data-aspect-ratio") || "16/9",
        renderHTML: (attributes) => ({
          "data-aspect-ratio": attributes.aspectRatio,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="canvas-embed"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "canvas-embed",
        class: "kacheri-canvas-embed",
      }),
    ];
  },

  addCommands() {
    return {
      insertCanvasEmbed:
        (attrs: CanvasEmbedAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CanvasEmbedView);
  },
});
