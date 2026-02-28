// KACHERI FRONTEND/src/components/studio/layouts/index.ts
// Pre-built slide layout definitions for Visual Mode (MC3).
// Each layout is a KCL template factory that generates valid KCL
// with unique element IDs. Layouts work in all modes (Visual, AI, Code).
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice MC3

// ── Unique ID generator (same pattern as ElementPalette) ──
let _layoutCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++_layoutCounter).toString(36)}`;
}

// ── Layout preset interface ──

export interface SlideLayoutPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** CSS class name for the miniature preview in the picker card */
  readonly previewClass: string;
  /** Returns complete <kcl-slide> KCL for "create new frame" mode */
  generateSlide(aspectRatio?: string): string;
  /** Returns inner KCL (no <kcl-slide> wrapper) for "apply to existing frame" mode */
  generateInner(): string;
}

// ── Helper: wrap inner KCL in a <kcl-slide> ──

function wrapSlide(innerKcl: string, aspectRatio: string): string {
  const slideId = uid('slide');
  return `<kcl-slide id="${slideId}" background="#1a1a2e" aspect-ratio="${aspectRatio}" padding="48">\n${innerKcl}\n</kcl-slide>`;
}

// ── Layout definitions ──

const titleSlide: SlideLayoutPreset = {
  id: 'title-slide',
  label: 'Title Slide',
  description: 'Centered heading with subtitle',
  previewClass: 'layout-preview-title-slide',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const layoutId = uid('layout');
    const headingId = uid('text');
    const subtitleId = uid('text');
    return [
      `  <kcl-layout id="${layoutId}" type="flex" direction="column" align="center" gap="16" style="height: 100%; justify-content: center;">`,
      `    <kcl-text id="${headingId}" level="h1" font-size="56" font-weight="700" align="center" color="#ffffff">Presentation Title</kcl-text>`,
      `    <kcl-text id="${subtitleId}" level="h2" font-size="28" font-weight="400" align="center" color="#94a3b8">Subtitle goes here</kcl-text>`,
      `  </kcl-layout>`,
    ].join('\n');
  },
};

const titleContent: SlideLayoutPreset = {
  id: 'title-content',
  label: 'Title + Content',
  description: 'Heading at top with body text below',
  previewClass: 'layout-preview-title-content',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const headingId = uid('text');
    const bodyId = uid('text');
    return [
      `  <kcl-text id="${headingId}" level="h1" font-size="40" font-weight="700" align="left" color="#ffffff">Slide Title</kcl-text>`,
      `  <kcl-text id="${bodyId}" level="p" font-size="20" font-weight="400" align="left" color="#cbd5e1" style="margin-top: 24px;">Add your content here. This text block supports full Visual Mode editing — change the font, size, color, and alignment using the Properties Panel.</kcl-text>`,
    ].join('\n');
  },
};

const twoColumn: SlideLayoutPreset = {
  id: 'two-column',
  label: 'Two Column',
  description: 'Equal-width side-by-side content areas',
  previewClass: 'layout-preview-two-column',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const rowId = uid('layout');
    const col1Id = uid('layout');
    const col2Id = uid('layout');
    const heading1Id = uid('text');
    const body1Id = uid('text');
    const heading2Id = uid('text');
    const body2Id = uid('text');
    return [
      `  <kcl-layout id="${rowId}" type="flex" direction="row" align="stretch" gap="32" style="height: 100%;">`,
      `    <kcl-layout id="${col1Id}" type="flex" direction="column" gap="12" style="flex: 1;">`,
      `      <kcl-text id="${heading1Id}" level="h2" font-size="28" font-weight="600" align="left" color="#ffffff">Column One</kcl-text>`,
      `      <kcl-text id="${body1Id}" level="p" font-size="16" font-weight="400" align="left" color="#cbd5e1">Content for the first column. Add text, images, or other elements here.</kcl-text>`,
      `    </kcl-layout>`,
      `    <kcl-layout id="${col2Id}" type="flex" direction="column" gap="12" style="flex: 1;">`,
      `      <kcl-text id="${heading2Id}" level="h2" font-size="28" font-weight="600" align="left" color="#ffffff">Column Two</kcl-text>`,
      `      <kcl-text id="${body2Id}" level="p" font-size="16" font-weight="400" align="left" color="#cbd5e1">Content for the second column. Matching layout for balanced presentation.</kcl-text>`,
      `    </kcl-layout>`,
      `  </kcl-layout>`,
    ].join('\n');
  },
};

const imageText: SlideLayoutPreset = {
  id: 'image-text',
  label: 'Image + Text',
  description: 'Large image left, text block right',
  previewClass: 'layout-preview-image-text',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const rowId = uid('layout');
    const imgId = uid('img');
    const colId = uid('layout');
    const headingId = uid('text');
    const bodyId = uid('text');
    return [
      `  <kcl-layout id="${rowId}" type="flex" direction="row" align="stretch" gap="32" style="height: 100%;">`,
      `    <kcl-image id="${imgId}" src="" alt="Placeholder image" fit="cover" aspect-ratio="4/3" style="flex: 3; border-radius: 8px;"></kcl-image>`,
      `    <kcl-layout id="${colId}" type="flex" direction="column" gap="12" style="flex: 2; justify-content: center;">`,
      `      <kcl-text id="${headingId}" level="h2" font-size="32" font-weight="600" align="left" color="#ffffff">Image Title</kcl-text>`,
      `      <kcl-text id="${bodyId}" level="p" font-size="16" font-weight="400" align="left" color="#cbd5e1">Describe the image or provide supporting context here. The image on the left can be replaced via the Properties Panel.</kcl-text>`,
      `    </kcl-layout>`,
      `  </kcl-layout>`,
    ].join('\n');
  },
};

const textImage: SlideLayoutPreset = {
  id: 'text-image',
  label: 'Text + Image',
  description: 'Text block left, large image right',
  previewClass: 'layout-preview-text-image',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const rowId = uid('layout');
    const colId = uid('layout');
    const headingId = uid('text');
    const bodyId = uid('text');
    const imgId = uid('img');
    return [
      `  <kcl-layout id="${rowId}" type="flex" direction="row" align="stretch" gap="32" style="height: 100%;">`,
      `    <kcl-layout id="${colId}" type="flex" direction="column" gap="12" style="flex: 2; justify-content: center;">`,
      `      <kcl-text id="${headingId}" level="h2" font-size="32" font-weight="600" align="left" color="#ffffff">Content Title</kcl-text>`,
      `      <kcl-text id="${bodyId}" level="p" font-size="16" font-weight="400" align="left" color="#cbd5e1">Your text content goes here. The image on the right can be replaced via the Properties Panel.</kcl-text>`,
      `    </kcl-layout>`,
      `    <kcl-image id="${imgId}" src="" alt="Placeholder image" fit="cover" aspect-ratio="4/3" style="flex: 3; border-radius: 8px;"></kcl-image>`,
      `  </kcl-layout>`,
    ].join('\n');
  },
};

const bulletList: SlideLayoutPreset = {
  id: 'bullet-list',
  label: 'Bullet List',
  description: 'Heading with bulleted content area',
  previewClass: 'layout-preview-bullet-list',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const headingId = uid('text');
    const listId = uid('list');
    const items = JSON.stringify({
      items: [
        { text: 'First key point' },
        { text: 'Second key point' },
        { text: 'Third key point' },
        { text: 'Fourth key point' },
      ],
    }, null, 2);
    return [
      `  <kcl-text id="${headingId}" level="h1" font-size="40" font-weight="700" align="left" color="#ffffff">Key Points</kcl-text>`,
      `  <kcl-list id="${listId}" type="bullet" style="margin-top: 24px;"></kcl-list>`,
      `  <script data-for="${listId}" type="application/json">${items}</script>`,
    ].join('\n');
  },
};

const fullImage: SlideLayoutPreset = {
  id: 'full-image',
  label: 'Full Image',
  description: 'Edge-to-edge image with overlay text',
  previewClass: 'layout-preview-full-image',
  generateSlide(aspectRatio = '16/9') {
    // Full image slides use zero padding for edge-to-edge coverage
    const slideId = uid('slide');
    return `<kcl-slide id="${slideId}" background="#000000" aspect-ratio="${aspectRatio}" padding="0">\n${this.generateInner()}\n</kcl-slide>`;
  },
  generateInner() {
    const imgId = uid('img');
    const overlayId = uid('text');
    return [
      `  <kcl-image id="${imgId}" src="" alt="Full-width image" fit="cover" style="width: 100%; height: 100%;"></kcl-image>`,
      `  <kcl-text id="${overlayId}" level="h1" font-size="48" font-weight="700" align="center" color="#ffffff" style="position: absolute; bottom: 48px; left: 48px; right: 48px; text-shadow: 0 2px 8px rgba(0,0,0,0.6);">Image Caption</kcl-text>`,
    ].join('\n');
  },
};

const comparison: SlideLayoutPreset = {
  id: 'comparison',
  label: 'Comparison',
  description: 'Two columns with heading for each',
  previewClass: 'layout-preview-comparison',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const titleId = uid('text');
    const rowId = uid('layout');
    const col1Id = uid('layout');
    const col2Id = uid('layout');
    const heading1Id = uid('text');
    const body1Id = uid('text');
    const heading2Id = uid('text');
    const body2Id = uid('text');
    const dividerId = uid('div');
    return [
      `  <kcl-text id="${titleId}" level="h1" font-size="36" font-weight="700" align="center" color="#ffffff" style="margin-bottom: 24px;">Comparison</kcl-text>`,
      `  <kcl-layout id="${rowId}" type="flex" direction="row" align="stretch" gap="0" style="flex: 1;">`,
      `    <kcl-layout id="${col1Id}" type="flex" direction="column" gap="12" style="flex: 1; padding-right: 24px;">`,
      `      <kcl-text id="${heading1Id}" level="h2" font-size="24" font-weight="600" align="center" color="#6366f1">Option A</kcl-text>`,
      `      <kcl-text id="${body1Id}" level="p" font-size="16" font-weight="400" align="left" color="#cbd5e1">Describe the first option, approach, or item being compared.</kcl-text>`,
      `    </kcl-layout>`,
      `    <div id="${dividerId}" role="separator" style="width: 1px; background: #475569;"></div>`,
      `    <kcl-layout id="${col2Id}" type="flex" direction="column" gap="12" style="flex: 1; padding-left: 24px;">`,
      `      <kcl-text id="${heading2Id}" level="h2" font-size="24" font-weight="600" align="center" color="#10b981">Option B</kcl-text>`,
      `      <kcl-text id="${body2Id}" level="p" font-size="16" font-weight="400" align="left" color="#cbd5e1">Describe the second option, approach, or item being compared.</kcl-text>`,
      `    </kcl-layout>`,
      `  </kcl-layout>`,
    ].join('\n');
  },
};

const quote: SlideLayoutPreset = {
  id: 'quote',
  label: 'Quote',
  description: 'Centered large quote with attribution',
  previewClass: 'layout-preview-quote',
  generateSlide(aspectRatio = '16/9') {
    return wrapSlide(this.generateInner(), aspectRatio);
  },
  generateInner() {
    const layoutId = uid('layout');
    const quoteId = uid('quote');
    return [
      `  <kcl-layout id="${layoutId}" type="flex" direction="column" align="center" gap="0" style="height: 100%; justify-content: center;">`,
      `    <kcl-quote id="${quoteId}" attribution="Author Name" variant="large">The best way to predict the future is to invent it.</kcl-quote>`,
      `  </kcl-layout>`,
    ].join('\n');
  },
};

// ── Exported layout array ──

export const SLIDE_LAYOUTS: readonly SlideLayoutPreset[] = [
  titleSlide,
  titleContent,
  twoColumn,
  imageText,
  textImage,
  bulletList,
  fullImage,
  comparison,
  quote,
];
