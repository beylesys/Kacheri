// KACHERI FRONTEND/src/extensions/index.ts
// Export custom Tiptap extensions

export { ImageEnhanced, type ImageAlign } from "./ImageEnhanced";
export { default as ImageNodeView } from "./ImageNodeView";

// Document structure extensions
export { PageBreak } from "./PageBreak";
export { SectionBreak } from "./SectionBreak";
export { ColumnSection } from "./ColumnSection";

// List extensions
export {
  OrderedListEnhanced,
  type NumberingStyle,
} from "./OrderedListEnhanced";

// Cross-document link extension
export { DocLink } from "./DocLink";

// AI heatmap extension (Phase 5 - P1.2)
export { AIHeatmark, type AIHeatmarkAttrs } from "./AIHeatmark";
