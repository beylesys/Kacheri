// KACHERI FRONTEND/src/extensions/ImageEnhanced.ts
// Enhanced Image extension with resize, alignment, and caption support

import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { mergeAttributes } from "@tiptap/core";
import ImageNodeView from "./ImageNodeView";

export type ImageAlign = "left" | "center" | "right";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageEnhanced: {
      /**
       * Set image alignment
       */
      setImageAlign: (align: ImageAlign) => ReturnType;
      /**
       * Set image width
       */
      setImageWidth: (width: string) => ReturnType;
      /**
       * Update image caption
       */
      setImageCaption: (caption: string) => ReturnType;
    };
  }
}

export const ImageEnhanced = Image.extend({
  name: "image",

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-width") || element.style.width || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return {
            "data-width": attributes.width,
            style: `width: ${attributes.width}`,
          };
        },
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") || "center",
        renderHTML: (attributes) => ({
          "data-align": attributes.align,
        }),
      },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") || "",
        renderHTML: (attributes) => {
          if (!attributes.caption) return {};
          return {
            "data-caption": attributes.caption,
          };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),

      setImageAlign:
        (align: ImageAlign) =>
        ({ commands }) => {
          return commands.updateAttributes("image", { align });
        },

      setImageWidth:
        (width: string) =>
        ({ commands }) => {
          return commands.updateAttributes("image", { width });
        },

      setImageCaption:
        (caption: string) =>
        ({ commands }) => {
          return commands.updateAttributes("image", { caption });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
      },
      {
        tag: "figure.kacheri-image",
        getAttrs: (element) => {
          const img = element.querySelector("img");
          const figcaption = element.querySelector("figcaption");
          if (!img) return false;
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt") || "",
            title: img.getAttribute("title") || "",
            width: img.getAttribute("data-width") || img.style.width || null,
            align: element.getAttribute("data-align") || "center",
            caption: figcaption?.textContent || "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { align, caption, width, ...imgAttrs } = HTMLAttributes;

    // Render as figure with optional caption
    const figureAttrs: Record<string, any> = {
      class: "kacheri-image",
      "data-align": align || "center",
    };

    const imgStyleParts: string[] = [];
    if (width) {
      imgStyleParts.push(`width: ${width}`);
    }

    const imgFinalAttrs = mergeAttributes(this.options.HTMLAttributes, imgAttrs, {
      style: imgStyleParts.join("; ") || undefined,
      "data-width": width || undefined,
    });

    if (caption) {
      return [
        "figure",
        figureAttrs,
        ["img", imgFinalAttrs],
        ["figcaption", {}, caption],
      ];
    }

    return [
      "figure",
      figureAttrs,
      ["img", imgFinalAttrs],
    ];
  },
});

export default ImageEnhanced;
