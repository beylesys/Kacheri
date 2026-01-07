// KACHERI FRONTEND/src/extensions/AIHeatmark.ts
// Phase 5 - P1.2: Tiptap Mark extension for AI heatmap highlighting
//
// This mark highlights AI-touched sections of the document with colored backgrounds.
// Different AI action types get different colors for visual distinction.

import { Mark, mergeAttributes } from "@tiptap/core";

// Extend Tiptap's Commands interface to add our custom commands
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiHeatmark: {
      /**
       * Set an AI heatmark on the specified range
       */
      setAIHeatmark: (attrs: AIHeatmarkAttrs) => ReturnType;
      /**
       * Remove all AI heatmarks from the current selection
       */
      unsetAIHeatmark: () => ReturnType;
      /**
       * Remove all AI heatmarks from the entire document
       */
      clearAllAIHeatmarks: () => ReturnType;
    };
  }
}

export interface AIHeatmarkAttrs {
  /** The type of AI action (compose, rewriteSelection, translate) */
  kind: string;
  /** Visual intensity 0-1 */
  intensity?: number;
  /** Reference to the proof record */
  proofId?: number | null;
  /** Timestamp of the AI action */
  ts?: number;
}

export interface AIHeatmarkOptions {
  /**
   * HTML attributes to add to the rendered element
   */
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Color configuration for different AI action types
 */
const AI_HEAT_COLORS: Record<string, { r: number; g: number; b: number }> = {
  // Green for compose (new AI-generated content)
  "ai:compose": { r: 34, g: 197, b: 94 },
  compose: { r: 34, g: 197, b: 94 },

  // Blue for selective rewrites (modified existing content)
  "ai:rewriteSelection": { r: 59, g: 130, b: 246 },
  rewriteSelection: { r: 59, g: 130, b: 246 },

  // Purple for constrained rewrites
  "ai:rewriteConstrained": { r: 139, g: 92, b: 246 },
  rewriteConstrained: { r: 139, g: 92, b: 246 },

  // Yellow for translations
  "ai:translate": { r: 245, g: 158, b: 11 },
  translate: { r: 245, g: 158, b: 11 },

  // Gray for unknown/other AI actions
  default: { r: 148, g: 163, b: 184 },
};

function getHeatColor(kind: string, intensity: number = 0.25): string {
  const colors = AI_HEAT_COLORS[kind] || AI_HEAT_COLORS.default;
  return `rgba(${colors.r}, ${colors.g}, ${colors.b}, ${intensity})`;
}

export const AIHeatmark = Mark.create<AIHeatmarkOptions>({
  name: "aiHeatmark",

  // Lower priority than doc links and other semantic marks
  priority: 100,

  // Can span across nodes
  spanning: true,

  // Allow multiple overlapping heatmarks (layered highlighting)
  excludes: "",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      kind: {
        default: "ai:compose",
        parseHTML: (element) =>
          element.getAttribute("data-ai-kind") || "ai:compose",
        renderHTML: (attributes) => ({
          "data-ai-kind": attributes.kind,
        }),
      },
      intensity: {
        default: 0.25,
        parseHTML: (element) =>
          parseFloat(element.getAttribute("data-ai-intensity") || "0.25"),
        renderHTML: (attributes) => ({
          "data-ai-intensity": String(attributes.intensity || 0.25),
        }),
      },
      proofId: {
        default: null,
        parseHTML: (element) => {
          const id = element.getAttribute("data-proof-id");
          return id ? parseInt(id, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.proofId) return {};
          return { "data-proof-id": String(attributes.proofId) };
        },
      },
      ts: {
        default: null,
        parseHTML: (element) => {
          const ts = element.getAttribute("data-ts");
          return ts ? parseInt(ts, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.ts) return {};
          return { "data-ts": String(attributes.ts) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-ai-kind]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = HTMLAttributes["data-ai-kind"] || "ai:compose";
    const intensity = parseFloat(HTMLAttributes["data-ai-intensity"] || "0.25");
    const bgColor = getHeatColor(kind, intensity);

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: `ai-heatmark ai-heatmark-${kind.replace(":", "-")}`,
        style: `background-color: ${bgColor}; border-radius: 2px;`,
        "data-type": "ai-heatmark",
      }),
      0, // Content slot
    ];
  },

  addCommands() {
    return {
      setAIHeatmark:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },

      unsetAIHeatmark:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },

      clearAllAIHeatmarks:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const { doc } = tr;
            const marks: { from: number; to: number }[] = [];

            doc.descendants((node, pos) => {
              if (node.isText) {
                node.marks.forEach((mark) => {
                  if (mark.type.name === this.name) {
                    marks.push({ from: pos, to: pos + node.nodeSize });
                  }
                });
              }
            });

            // Remove marks in reverse order to preserve positions
            marks.reverse().forEach(({ from, to }) => {
              tr.removeMark(from, to, this.type);
            });
          }
          return true;
        },
    };
  },
});

export default AIHeatmark;
