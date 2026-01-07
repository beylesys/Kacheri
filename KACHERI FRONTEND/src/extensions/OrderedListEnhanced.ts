// KACHERI FRONTEND/src/extensions/OrderedListEnhanced.ts
// Enhanced OrderedList extension with numbering style attribute for legal-style numbering

import OrderedList from "@tiptap/extension-ordered-list";

export type NumberingStyle = "decimal" | "outline";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    orderedListEnhanced: {
      /**
       * Set the numbering style for the current ordered list
       */
      setNumberingStyle: (style: NumberingStyle) => ReturnType;
    };
  }
}

export const OrderedListEnhanced = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      numberingStyle: {
        default: "decimal",
        parseHTML: (element) =>
          (element.getAttribute("data-numbering-style") as NumberingStyle) ||
          "decimal",
        renderHTML: (attributes) => {
          const style = attributes.numberingStyle || "decimal";
          return {
            "data-numbering-style": style,
            class: style === "outline" ? "legal-numbering" : null,
          };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),

      setNumberingStyle:
        (style: NumberingStyle) =>
        ({ commands }) => {
          return commands.updateAttributes("orderedList", {
            numberingStyle: style,
          });
        },
    };
  },
});

export default OrderedListEnhanced;
