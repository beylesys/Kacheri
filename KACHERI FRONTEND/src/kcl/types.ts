/* === KCL Shared Types v1.0.0 === */

// --- Property Schema (Phase 6 Edit Mode — schema only) ---

export type PropertyType =
  | 'text'
  | 'color'
  | 'select'
  | 'number'
  | 'json'
  | 'image'
  | 'boolean';

export interface PropertySchema {
  name: string;
  label: string;
  type: PropertyType;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number | boolean;
  isAttribute: boolean;
  group?: string;
}

// --- Edit Mode Types (Phase 6 — F1) ---

export interface EditableProperty extends PropertySchema {
  currentValue: unknown;
}

export interface KCLEditableSchema {
  component: string;
  elementId: string;
  properties: EditableProperty[];
}

// --- PostMessage Protocol (Edit Mode) ---

/** iframe → parent */
export type KCLSelectionMessage =
  | { type: 'kcl:element-selected'; elementId: string; component: string; schema: KCLEditableSchema; bounds?: ElementBounds; isAbsolute?: boolean }
  | { type: 'kcl:element-deselected' };

/** parent → iframe */
export type KCLPropertyUpdateMessage = {
  type: 'kcl:update-property';
  elementId: string;
  property: string;
  value: unknown;
};

export type KCLHighlightMessage = {
  type: 'kcl:highlight-element';
  elementId: string;
};

export type KCLEditModeMessage =
  | { type: 'kcl:init-edit-mode' }
  | { type: 'kcl:exit-edit-mode' };

/** parent → iframe (inline editing trigger) */
export type KCLStartInlineEditMessage = {
  type: 'kcl:start-inline-edit';
  elementId: string;
};

/** iframe → parent (inline editing lifecycle) */
export type KCLInlineEditMessage =
  | { type: 'kcl:inline-edit-start'; elementId: string }
  | { type: 'kcl:inline-edit-complete'; elementId: string; newContent: string }
  | { type: 'kcl:inline-edit-cancel'; elementId: string };

// --- MC2: Drag/Resize PostMessage Protocol ---

/** Bounding rectangle relative to kcl-slide-container */
export interface ElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** parent → iframe: request bounds for specific elements */
export type KCLRequestBoundsMessage = {
  type: 'kcl:request-bounds';
  elementIds: string[];
};

/** iframe → parent: bounds response for requested elements */
export type KCLElementBoundsMessage = {
  type: 'kcl:element-bounds';
  elements: Array<{
    elementId: string;
    bounds: ElementBounds;
    isAbsolute: boolean;
  }>;
};

/** parent → iframe: apply live style during drag/resize (no code update) */
export type KCLApplyStyleMessage = {
  type: 'kcl:apply-style';
  elementId: string;
  style: Record<string, string>;
};

/** parent → iframe: request all selectable element bounds */
export type KCLRequestAllBoundsMessage = {
  type: 'kcl:request-all-bounds';
};

/** iframe → parent: all element bounds (for marquee hit-testing) */
export type KCLAllBoundsMessage = {
  type: 'kcl:all-bounds';
  elements: Array<{
    elementId: string;
    component: string;
    bounds: ElementBounds;
    isAbsolute: boolean;
  }>;
};

export type KCLParentMessage =
  | KCLPropertyUpdateMessage
  | KCLHighlightMessage
  | KCLEditModeMessage
  | KCLStartInlineEditMessage
  | KCLRequestBoundsMessage
  | KCLApplyStyleMessage
  | KCLRequestAllBoundsMessage;

// --- MC4: Grid, Guide & Layer Types ---

/** Grid configuration for snap-to-grid */
export interface GridConfig {
  size: 8 | 16 | 32;
  visible: boolean;
  snapEnabled: boolean;
}

/** Smart alignment guide line */
export interface GuideLine {
  axis: 'horizontal' | 'vertical';
  /** px from top (horizontal) or from left (vertical) */
  position: number;
  /** line start coordinate on the other axis */
  start: number;
  /** line end coordinate on the other axis */
  end: number;
}

/** Layer panel element info */
export interface LayerElement {
  elementId: string;
  component: string;
  bounds: ElementBounds;
  isAbsolute: boolean;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  groupId: string | null;
}

// --- Animation Types ---

export type AnimationType =
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'scale'
  | 'bounce'
  | 'zoom'
  | 'none';

export type AnimationTrigger = 'enter' | 'hover' | 'click';

export type TransitionType =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'zoom';

// --- Component Data Interfaces ---

export interface SlideData {
  backgroundImage?: string;
}

export interface TextData {
  content: string;
}

export interface ImageData {
  src: string;
}

export interface MetricData {
  value: number;
  delta?: number;
}

export interface ListItem {
  text: string;
  icon?: string;
  items?: ListItem[];
}

export interface ListData {
  items: ListItem[];
}

export interface QuoteData {
  text: string;
  attribution?: string;
}

export interface CodeData {
  code: string;
}

// --- Data Visualization Interfaces (A5) ---

export interface ChartDataset {
  label: string;
  values: number[];
  color?: string;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface TableData {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
}

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface TimelineData {
  events: TimelineEvent[];
}

export interface CompareData {
  before: { src: string; label: string };
  after: { src: string; label: string };
}

// --- Embed Whitelist ---

export const EMBED_WHITELIST: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'codepen.io',
  'loom.com',
  'www.loom.com',
]);

// --- Syntax Highlighting ---

export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'html'
  | 'css'
  | 'sql'
  | 'json'
  | 'markdown';

export const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  md: 'markdown',
};

export type TokenType =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'punctuation'
  | 'identifier'
  | 'tag'
  | 'attribute'
  | 'value'
  | 'property'
  | 'builtin'
  | 'plain';

export interface Token {
  type: TokenType;
  text: string;
}
