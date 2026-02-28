# Beyle Design Studio — Feature Documentation

Beyle Design Studio is the second major product in the BEYLE Platform. It is an AI-powered interactive content engine where AI generates HTML/CSS/JS code targeting a custom component library (KCL), producing fully interactive, exportable, and verifiable visual content — presentations, web pages, notebooks, and embeddable widgets.

---

## 1. Overview

- AI generates structured HTML/CSS/JS targeting the Kacheri Component Library (KCL) — not free-form HTML
- Every AI operation produces a verifiable proof packet (same proof model as Kacheri Docs)
- Three editing modes: Simple (AI chat), Power (code editor), Edit (visual properties panel)
- Four composition modes: Deck, Page, Notebook, Widget
- Seven export formats: PDF, PPTX, HTML Bundle, Standalone HTML, PNG, SVG, MP4
- Cross-product integration via Memory Graph — Design Studio AI can use context from Docs and Research
- Canvases can be embedded in Kacheri Docs and published as public widgets

---

## 2. Architecture

Design Studio follows a four-layer architecture:

### Layer 4 — App Shell (Frontend)
React frontend consistent with Kacheri Docs. Three-panel layout: frame rail (left), viewport (center), conversation/properties panel (right). Mode toggle switches between Simple, Power, and Edit modes.

### Layer 3 — Frame Isolation
Each frame renders in a sandboxed iframe (`sandbox="allow-scripts"`) with strict Content Security Policy. Frames cannot access the parent window, cookies, localStorage, or network. CSP violations are reported via postMessage relay. Assets are served through a dedicated proxy (`/kcl-assets/:assetId`).

### Layer 2 — KCL (Kacheri Component Library)
16 framework-agnostic custom elements built as web components. Version-pinned per canvas. Served as standalone JS/CSS bundle from `/kcl/:version/`. No React dependency inside frames.

### Layer 1 — AI Code Engine
Generates HTML/CSS/JS per frame via `designEngine.ts`. Validates output against KCL component rules. Automatic retry with error context injection on validation failure. Every operation produces a proof packet with before/after hashes.

---

## 3. Editing Modes

### Simple Mode (AI Chat)
Primary interface for most users. Users describe what they want in natural language. AI generates or modifies frames. Approve/reject workflow with diff preview. Works on mobile.

### Power Mode (Code Editor)
Direct code editing with syntax highlighting (CodeMirror 6). KCL tag autocompletion. Live preview with 300ms debounced updates. Format-on-save. Network access detection warnings. Desktop only.

### Edit Mode (Properties Panel)
Visual controls for non-coders. Select elements in the viewport, edit properties via form controls (text, color, font, size, data grids). Uses KCL inspector protocol (`editableProperties` static getter on each component). Inline text editing via double-click. Desktop only.

---

## 4. Composition Modes

| Mode | Layout | Use Case |
|------|--------|----------|
| **Deck** | Horizontal slides with transitions | Presentations, pitch decks |
| **Page** | Vertical scrollable layout | Web pages, landing pages |
| **Notebook** | Frames interleaved with narrative text | Reports, documentation, data stories |
| **Widget** | Single-frame compact layout | Embeddable charts, dashboards, cards |

Notebook mode uses Tiptap-based rich text blocks between frames. AI can generate both frame content and narrative text using `NARRATIVE_START`/`NARRATIVE_END` markers.

---

## 5. KCL Component Reference

All 16 components are web components that extend `KCLBaseElement`. Each component supports the inspector protocol (`editableProperties`), data binding, and accessibility features.

### Core Components (13)

| Component | Purpose | Key Attributes |
|-----------|---------|---------------|
| `kcl-slide` | Frame container | background, aspect-ratio, padding, transition |
| `kcl-text` | Typography (h1–h6, p, span) | level, color, align, animate, delay |
| `kcl-layout` | Flex/grid layout | direction, columns, gap, align, justify, wrap |
| `kcl-image` | Image display | src, alt (required), fit, aspect-ratio, radius |
| `kcl-list` | Lists | type (bullet/number/icon/none), stagger |
| `kcl-quote` | Block quotes | attribution, cite, variant |
| `kcl-metric` | KPI display | label, prefix, suffix, trend, format, animate |
| `kcl-icon` | Icons (~50+ names) | name, size, color, stroke-width, label |
| `kcl-animate` | Animation wrapper | type (fade/slide/scale/bounce/zoom), trigger, duration |
| `kcl-code` | Syntax-highlighted code | language (8 supported), line-numbers, highlight-lines |
| `kcl-embed` | External embeds | src (whitelisted domains), aspect-ratio |
| `kcl-source` | Doc citation links | doc-id, section, label |

### Data Visualization Components (4)

| Component | Purpose | Data Binding |
|-----------|---------|-------------|
| `kcl-chart` | Charts (bar, line, pie, donut, scatter, area) | Required — `labels`, `datasets` |
| `kcl-table` | Data tables | Required — `columns`, `rows` |
| `kcl-timeline` | Timeline visualization | Required — `events` array |
| `kcl-compare` | Before/after comparison | Required — `before`, `after` |

### Data Binding Pattern

Data-visualization components require data via `<script>` tags:

```html
<kcl-chart id="revenue" type="bar"></kcl-chart>
<script data-for="revenue" type="application/json">
  {"labels": ["Q1", "Q2", "Q3"], "datasets": [{"label": "Revenue", "data": [100, 200, 150]}]}
</script>
```

---

## 6. AI Capabilities

### Action Types

| Action | Description | Proof Kind |
|--------|-------------|-----------|
| **Generate** | Create new frames from a text prompt | `design:generate` |
| **Edit** | Modify code of a specific frame | `design:edit` |
| **Style** | Restyle one or more frames (colors, fonts, layout) | `design:style` |
| **Content** | Update text/data content without changing structure | `design:content` |
| **Compose** | Generate frames from Kacheri Docs content | `design:compose` |

### Doc Cross-Referencing
The compose action pulls content from Kacheri Docs with provenance links. Source documents are tracked via `kcl-source` components and doc link records.

### AI Image Generation
Text-to-image generation via configurable provider (DALL-E / Stability AI). Per-workspace credit system. Generated images stored as canvas assets and referenced via `kcl-image` with asset proxy URLs.

### Memory Graph Integration (P7)
When enabled, AI queries the Memory Graph for cross-product context during frame generation. Research sessions, document entities, and design assets from across the platform can inform AI responses.

### Validation & Retry
Generated code is validated against KCL component rules (root element, valid tags, data binding, JSON, accessibility). On validation failure, the engine retries (max 2 attempts) with error context injected into the prompt.

---

## 7. Export Formats

| Format | Engine | Notes |
|--------|--------|-------|
| **PDF** | Puppeteer | Full-page rendering, notebook narrative sections |
| **PPTX** | pptxgenjs | Frame-per-slide, speaker notes, narrative as text slides |
| **HTML Bundle** | Custom | Multi-file bundle with KCL assets, per-frame pages |
| **Standalone HTML** | Custom | Single self-contained HTML file |
| **PNG** | Puppeteer | Per-frame screenshot |
| **SVG** | Puppeteer | Per-frame vector |
| **MP4** | Puppeteer + ffmpeg | Frame transitions rendered as video |

All exports produce proof packets (`design:export` kind) with file hashes and metadata.

---

## 8. Proof Integration

Design Studio uses the same proof model as Kacheri Docs:
- Every AI operation (generate, edit, style, content, compose) creates a proof packet
- Proofs include: prompt, action type, frame count, code hashes, provider, model, validation results, retries used
- Proofs viewable from canvas via conversation panel "View Proof" links
- Proofs viewable from global ProofsPanel with canvas filter (`GET /canvases/:cid/provenance`)
- Export proofs include format, frame count, and file hash

### Design Proof Kinds in ProofsPanel

| Kind | Display | Details |
|------|---------|---------|
| `design:generate` / `design:compose` | "AI Generated" | Prompt, frames created, doc refs used |
| `design:edit` / `design:content` | "AI Edited" | Prompt, code diff, frame modified |
| `design:style` | "AI Restyled" | Frames restyled, before/after |
| `design:export` | "Exported" | Format, frame count, file hash |

---

## 9. Embed / Widget Mode

Canvases can be published for embedding on external sites:
- **Publish toggle**: Owner-only control via `PATCH /canvases/:cid/publish`
- **Public canvas embed**: `GET /embed/public/canvases/:cid` — renders all frames as HTML
- **Public frame embed**: `GET /embed/public/frames/:fid` — renders single frame as HTML
- **Auto-resize**: Embedded iframes communicate height changes via `postMessage` (`beyle:embed-resize`)
- **No auth required**: Published embeds are public; unpublished embeds return 404
- **Composition-mode-aware**: Deck/widget modes show navigation; page/notebook modes render as scrollable

### Embed Dialog
UI for generating embed snippets, toggling publish state, and selecting embed target (full canvas or individual frame).

---

## 10. Notebook Composition

Notebook mode interleaves Tiptap narrative blocks with rendered frames:
- Narrative blocks stored in frame `metadata.narrativeHtml`
- AI generates narrative via `NARRATIVE_START`/`NARRATIVE_END` markers in prompts
- Tiptap editor (StarterKit) for manual narrative editing
- Active frame renders as live iframe; others as thumbnails (respects 1–3 live iframe constraint)
- Export integration: PDF (narrative sections with page breaks), HTML Standalone (continuous scroll), HTML Bundle (narrative above frame code), PPTX (text-only slides before frame slides)

---

## 11. Canvas Embedding in Docs (P9)

Design Studio canvas frames can be embedded inline in Kacheri Docs:
- Tiptap `CanvasEmbed` node extension with `canvasId`, `frameId`, `aspectRatio` attributes
- Read-only display in sandboxed iframe
- Graceful placeholder when Design Studio is disabled
- Frame data fetched via `GET /embed/frames/:fid/render`
- Provenance tracked via doc link records (`link_text='canvas_embed'`)

---

## 12. Security

### Frame Isolation
- Sandboxed iframes (`sandbox="allow-scripts"`, no `allow-same-origin`)
- CSP via `<meta http-equiv="Content-Security-Policy">` in srcdoc
- CSP directives: `default-src 'none'`, `script-src 'unsafe-inline'`, `style-src 'unsafe-inline'`, `img-src` limited to parent origin + data URIs
- CSP violations reported via `SecurityPolicyViolationEvent` → postMessage relay

### postMessage Security
- Parent-to-iframe: `postMessage('*')` (iframe has null origin — no valid target)
- Iframe-to-parent: `postMessage(origin)` (tightened from `'*'`)
- Parent validates `event.origin` is `'null'` (srcdoc) or same-origin

### Asset Proxy
- Public route `/kcl-assets/:assetId` serves images, fonts, icons
- Asset IDs are 12-char nanoids (~72 bits entropy) — not enumerable
- Only `image`, `font`, `icon` types served
- Immutable cache headers, CORS for null-origin iframes

### Code Sanitization (Power Mode)
- Network access pattern detection: `fetch()`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, dynamic `import()`
- Warnings shown to user (CSP blocks at runtime anyway)

---

## 13. Performance

### Three-Render-Mode System
| Mode | KCL Loaded | Use Case |
|------|-----------|----------|
| **thumbnail** | No | Frame rail thumbnails, notebook inactive frames |
| **live** | Yes (lazy) | Viewport, active frame in notebook |
| **presentation** | Yes | Fullscreen presentation mode |

### Virtual Frame Rail
- `useVirtualList` hook: renders only visible thumbnails (plus 5 overscan)
- RAF-throttled scroll tracking, ResizeObserver for container resize
- Supports 100+ frame canvases without performance degradation

### Lazy KCL Loading
- Dynamic `document.createElement('script')` instead of parser-blocking `<script src>`
- CSS loaded first (link before script)
- `script.onload` fires `kcl:render-complete`

### Code Editor Debounce
- 300ms debounce on code changes before iframe update

### Memory Monitoring
- `useMemoryMonitor` hook: `performance.memory` (Chrome) with iframe-count fallback
- Warns on heap > 80% limit, sustained growth > 50MB/min, or > 5 iframes
- Dismissible amber banner

---

## 14. Notifications

Design Studio events trigger notifications:
- `canvas_shared` — when a canvas is shared with a user
- `ai_generation_complete` — when AI generate/edit/style operations complete
- `export_complete` — when an export job finishes
- `frame_lock_requested` — when a collaborator requests a frame lock (E8, pending)

Notification preferences allow users to toggle each Design Studio event category independently.

---

## 15. Cross-Product Flows

### Research → Memory Graph → Studio AI Context
Research sessions (via JAAL) push entities to the Memory Graph. When `MEMORY_GRAPH_ENABLED=true`, Design Studio AI queries the graph for relevant context during frame generation.

### Docs → Canvas Embed
Kacheri Docs embed Design Studio frames inline via the Tiptap `CanvasEmbed` extension. Frame data served via authenticated endpoint with provenance tracking.

### JAAL Sync → Knowledge Explorer
External research clients authenticate via Personal Access Tokens (PATs) and push entities to the Memory Graph via `POST /platform/memory/ingest`. These appear in the Knowledge Explorer with product badges and filters.

---

## Status

- **Phases 0–6**: COMPLETE (Foundation, AI Engine, Frontend Simple/Power/Edit Modes)
- **Phase 7 E1–E5**: COMPLETE (Security, Performance, Proofs, Notebook, Embed)
- **Phase 7 E7–E9**: PENDING (External Embed Whitelist, Real-Time Collaboration, Mobile)
