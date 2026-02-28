// KACHERI FRONTEND/src/extensions/OrderedListEnhanced.ts
// Enhanced OrderedList extension with legal numbering, alpha, and roman styles

import OrderedList from "@tiptap/extension-ordered-list";

export type NumberingStyle =
  | "decimal"
  | "outline"
  | "legal"
  | "alpha-lower"
  | "alpha-upper"
  | "roman-lower"
  | "roman-upper";

/** Map each numbering style to its CSS class (null = use browser default). */
const STYLE_CLASS_MAP: Record<NumberingStyle, string | null> = {
  decimal: null,
  outline: "legal-numbering",
  legal: "legal-numbering",
  "alpha-lower": "numbering-alpha-lower",
  "alpha-upper": "numbering-alpha-upper",
  "roman-lower": "numbering-roman-lower",
  "roman-upper": "numbering-roman-upper",
};

/** Styles that use CSS counters (list-style: none + ::before). */
const COUNTER_BASED_STYLES = new Set<string>(["outline", "legal"]);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    orderedListEnhanced: {
      /** Set the numbering style for the current ordered list. */
      setNumberingStyle: (style: NumberingStyle) => ReturnType;
      /** Override the start number (null = auto). */
      setStartFrom: (value: number | null) => ReturnType;
    };
  }
}

export const OrderedListEnhanced = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      numberingStyle: {
        default: "decimal",
        parseHTML: (element: HTMLElement) =>
          (element.getAttribute("data-numbering-style") as NumberingStyle) ||
          "decimal",
        renderHTML: (attributes: Record<string, any>) => {
          const style: NumberingStyle =
            attributes.numberingStyle || "decimal";
          return {
            "data-numbering-style": style,
            class: STYLE_CLASS_MAP[style] ?? null,
          };
        },
      },

      startFrom: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const val = element.getAttribute("data-start-from");
          return val ? parseInt(val, 10) : null;
        },
        renderHTML: (attributes: Record<string, any>) => {
          if (attributes.startFrom == null) return {};
          const startVal = parseInt(attributes.startFrom, 10);
          if (isNaN(startVal)) return {};

          const style: string = attributes.numberingStyle || "decimal";
          const isCounterBased = COUNTER_BASED_STYLES.has(style);

          return {
            "data-start-from": String(startVal),
            // Counter-based styles: override the CSS counter reset value.
            // Native styles: use the standard <ol start="N"> attribute.
            ...(isCounterBased
              ? { style: `counter-reset: level1 ${startVal - 1}` }
              : { start: String(startVal) }),
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

      setStartFrom:
        (value: number | null) =>
        ({ commands }) => {
          return commands.updateAttributes("orderedList", {
            startFrom: value,
          });
        },
    };
  },
});

export default OrderedListEnhanced;
