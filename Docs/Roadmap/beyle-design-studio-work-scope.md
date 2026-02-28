# Beyle Design Studio — Full Work Scope

**Created:** 2026-02-21
**Status:** DRAFT — PENDING APPROVAL
**Phase:** Architecture Blueprint Phase 6 (Slides & Sheets scaffolding)
**Prerequisite:** Kacheri Docs pilot-ready scope (complete), Prod-ready Docs scope (substantially complete)

---

## Executive Summary

Beyle Design Studio is an AI-powered interactive content engine where AI writes code for presentations, web pages, notebooks, and embeddable widgets — all backed by BEYLE KACHERI's proof-driven provenance model. Instead of dragging boxes on a canvas (the PowerPoint paradigm), users direct an AI that generates HTML/CSS/JS code targeting a custom component library (KCL), producing fully interactive, exportable, and verifiable visual content.

**Core value propositions:**
1. **AI-as-coder** — The AI writes real code for every visual. Users direct; AI designs and implements.
2. **Multi-format output** — Same content renders as slide deck, web page, interactive notebook, or embeddable widget.
3. **Fully generative design** — No templates. The AI controls typography, color, layout, animation, and data visualization from scratch.
4. **Proof-driven accountability** — Every AI code generation produces a proof packet. Every design decision is traceable, diffable, and replayable.
5. **Cross-document intelligence** — Canvases pull from and reference Kacheri Docs with full provenance chains.

---

## Vision: A Web-Native Content Runtime with Provenance

Beyle Design Studio is not a slide maker. It is an **AI-powered content runtime** — a platform where AI generates runnable web artifacts from user intent, and every artifact carries an immutable proof trail.

The insight: once frames are runnable HTML, "slides" become just one camera angle. The same engine produces pitch decks, landing pages, interactive reports, embeddable widgets, and micro-sites. All from the same canvas. All with the same proof model. All cross-referenced with your document ecosystem.

**What makes this unlike anything else:**

| Existing Tool | What It Lacks |
|---|---|
| **Gamma** | AI helps, but output is static. No code access, no proof trail. |
| **v0 / Bolt.new** | Generates code, but no document ecosystem, no proof model, no presentation mode. |
| **NotebookLM** | Research + conversation, but no visual output, no code generation. |
| **Canva / Beautiful.ai** | Template-driven, not generative. No code, no provenance. |
| **Reveal.js / Slidev** | Code-based, but manual coding. No AI, no proof model. |

**Beyle Design Studio = Generative AI code engine + Document knowledge base + Proof-driven accountability + Multi-format output.**

The product line positioning:

```
BEYLE KACHERI
├── Kacheri Docs           — AI-native document editing with proofs
├── Beyle Design Studio    — AI-powered interactive content engine
├── Kacheri Sheets         — (future)
└── Kacheri Tasks          — (future)
```

---

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| React + TypeScript frontend | Design Studio app shell — consistent tech stack |
| Fastify backend + SQLite | Canvas/frame persistence, proof storage, AI routing |
| `modelRouter.ts` AI engine | Code generation prompts, frame editing, intent interpretation |
| Proof pipeline (`provenanceStore.ts`) | New proof kinds: `design:generate`, `design:edit`, `design:export` |
| Job queue + workers | Background export rendering (PDF, video, PPTX) |
| WebSocket realtime (`workspaceWs.ts`) | Real-time canvas collaboration, AI generation progress |
| Auth + RBAC middleware | Canvas permissions (owner/editor/viewer), workspace scoping |
| Export pipeline (PDF via Puppeteer) | Frame-to-PDF rendering reuses Puppeteer infrastructure |
| Document store (`docs.ts`) | Cross-referencing — canvases link to docs with provenance |
| Knowledge graph (entities, search) | AI can query workspace knowledge when generating content |
| `sanitize.ts` utilities | Input sanitization for user-provided code in Power Mode |

---

## Architecture

### Layered Runtime

The architecture separates concerns into four distinct layers. This is a critical design decision — it determines security, export fidelity, AI reliability, and maintainability.

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Design Studio App Shell (React)                │
│  Editor UI, conversation panel, frame rail, settings     │
│  Consistent with Kacheri Docs frontend                   │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Frame Isolation (Sandboxed iframes)            │
│  Each frame renders in its own iframe                    │
│  Strict CSP, no network access, data injection only      │
│  Thumbnail capture on edit for rail display               │
├─────────────────────────────────────────────────────────┤
│  Layer 2: KCL — Kacheri Component Library (Versioned)    │
│  Custom elements: kcl-chart, kcl-layout, kcl-text, etc. │
│  Framework-agnostic (vanilla JS + custom elements)       │
│  Version-pinned per canvas                               │
├─────────────────────────────────────────────────────────┤
│  Layer 1: AI Code Engine                                 │
│  Generates HTML/CSS/JS + KCL components per frame        │
│  Per-canvas conversation with frame context              │
│  Cross-references Kacheri Docs (provenance chain)        │
│  Proof packet: prompt → code diff → render hash          │
└─────────────────────────────────────────────────────────┘
```

#### Why This Layering

- **AI generates HTML/CSS/JS** — the most reliable target language for AI code generation. JSX and framework-specific code introduce semantic failure modes. HTML/CSS failures are local and visible.
- **Sandboxed iframes** — natural security isolation. A broken frame doesn't crash the app. Frames cannot exfiltrate data.
- **KCL as custom elements** — framework-agnostic, works in exports without React runtime, browser-native standard.
- **React in the shell only** — consistent with Kacheri Docs frontend, but not in the content layer.
- **Exports ARE the source** — the HTML inside each iframe IS the export artifact. No lossy conversion from a proprietary format.

### Frame Isolation & Security

Each frame runs inside a sandboxed iframe with strict policies:

```html
<iframe
  sandbox="allow-scripts"
  csp="default-src 'self' 'unsafe-inline';
       img-src blob: data: kcl-asset:;
       font-src kcl-asset:;
       connect-src 'none';
       form-action 'none';
       frame-src 'none';"
/>
```

**Security policies:**
- **No network access from frames** — `connect-src 'none'`. All data is injected at render time via `postMessage`, not fetched by the frame. This eliminates data exfiltration vectors.
- **No top-navigation, no popups, no forms** — frames are pure visual output.
- **Assets served through Kacheri proxy** — frames reference `kcl-asset://image-id` or `kcl-asset://font-name`, the app shell resolves to actual URLs. No arbitrary external URLs in frame code.
- **CSP travels with the frame** — the Content Security Policy is part of the proof record.
- **External embeds via whitelist** — `frame-src` relaxed for trusted domains only (YouTube, Vimeo, Google Maps). *See Addendum A, ADD-4.*

### Performance: Three Render Modes

Managing many iframes requires careful render budgeting:

```
Frame Rail (thumbnails)  → Static screenshot (PNG captured on last edit)
Active Viewport          → Live iframe (only 1-3 frames mounted at a time)
Presentation Mode        → Preloaded pipeline (current + next 2 frames live)
```

- Only the active frame and its immediate neighbors run as live iframes.
- All other frames display as static thumbnails captured on the last edit.
- When the AI edits a frame, the thumbnail is re-captured automatically.
- The thumbnail IS the frame's visual hash — another proof artifact.

### KCL Version Pinning

Every canvas records the KCL version used:

```json
{
  "kcl_version": "1.0.0",
  "created_at": "2026-03-15T10:00:00Z",
  "frames": [...]
}
```

- When rendering, load the exact KCL version that was used when the canvas was last edited.
- Migration to newer KCL versions is opt-in, not automatic.
- Locked canvases render with their pinned KCL version forever.
- This prevents "why did my old canvas change?" drift.
- Backwards compatibility or migration pipeline for KCL updates.

---

## Content Model

### Core Primitives

**Canvas** — The top-level container. A canvas holds frames, conversation history, composition settings, and metadata. A canvas belongs to a workspace and has owner/editor/viewer permissions.

**Frame** — The atomic visual unit. A frame is a self-contained HTML document that renders inside a sandboxed iframe. Each frame has:
- `intent` — the semantic description (user prompt that produced it)
- `code` — the generated HTML/CSS/JS (the renderable artifact)
- `thumbnail` — PNG screenshot of the last render
- `speaker_notes` — optional rich text notes (Tiptap-backed)
- `data_bindings` — injected data (JSON) for dynamic content
- `source_refs` — cross-references to Kacheri Docs

**Composition** — How frames are arranged for output:

| Composition Mode | Behavior |
|---|---|
| **Deck** | Sequential frames with transitions, presenter view, speaker notes |
| **Page** | Frames stacked/gridded into a scrollable responsive web page |
| **Notebook** | Frames interleaved with narrative text blocks (Tiptap-backed) |
| **Widget** | Single frame embeddable in a Kacheri Doc or external site |

A single canvas can switch between composition modes. The same frames, different arrangement.

### Frame Independence

Frames are independent. Period.

```
ALLOWED:                           NOT ALLOWED:
┌──────────┐                       ┌──────────┐ ←→ ┌──────────┐
│  Frame 3  │                       │  Frame 3  │    │  Frame 4  │
│  ┌─────┐  │                       │           │    │           │
│  │chart│←→│filter│                │  shared state across frames │
│  └─────┘  │                       └──────────┘    └──────────┘
└──────────┘
All interactivity lives INSIDE a single frame.
```

- Cross-frame concerns (transitions, navigation order, theme consistency) are handled at the composition level, not the data level.
- If a user wants cross-filtering dashboards, that's a single frame with multiple components — not multiple frames sharing state.
- This keeps the iframe isolation model clean and avoids accidentally inventing a mini-app framework.

---

## KCL — Kacheri Component Library

### Design Principles

KCL is the narrow waist of the system. It must be:

1. **Opinionated about WHAT** — handles the things that are hard to get right consistently (charts, layouts, animations, responsive scaling)
2. **Flexible about HOW IT LOOKS** — leaves all visual styling to CSS (colors, typography, spacing, effects)
3. **Boring in its contract** — attributes + JSON props, predictable lifecycle, good error messages, zero hidden global state
4. **Small and stable** — a focused set of primitives, not a kitchen sink

The rule: if the AI generates a frame using ONLY KCL components with no custom CSS, it should look decent but generic. Custom CSS is what makes it *designed*. This keeps the floor high and the ceiling unlimited.

### Component Inventory

| Component | Purpose | Opinionated About | Flexible Via CSS |
|---|---|---|---|
| `<kcl-slide>` | Frame container | transitions, scaling | background, padding, effects |
| `<kcl-text>` | Typography block | responsive sizing, animation timing | font, color, weight, alignment |
| `<kcl-chart>` | Data visualization | chart type rendering, axes, legends, animation | palette, sizing, label styling |
| `<kcl-table>` | Data tables | column alignment, sorting, striping | colors, borders, hover states |
| `<kcl-image>` | Image display | aspect ratio, Ken Burns, lazy loading | filters, borders, shape clipping |
| `<kcl-layout>` | Flexbox/grid composition | responsive breakpoints, gap logic | all visual styling |
| `<kcl-code>` | Syntax-highlighted code | language detection, line numbers, highlighting | theme, font, line height |
| `<kcl-timeline>` | Timeline visualization | node positioning, connector lines | colors, icons, spacing |
| `<kcl-compare>` | Before/after, side-by-side | split logic, slider, alignment | everything visual |
| `<kcl-embed>` | Video, maps, iframes | responsive container, lazy loading | sizing, borders |
| `<kcl-source>` | Cross-reference to Docs | provenance link rendering, citation format | styling |
| `<kcl-animate>` | Animation wrapper | entrance/emphasis/exit orchestration | timing, easing |
| `<kcl-icon>` | Icon display | icon registry, sizing variants | color, stroke, animation |
| `<kcl-metric>` | Big number / KPI display | number formatting, trend indicators | all visual styling |
| `<kcl-quote>` | Blockquote / testimonial | attribution layout | typography, styling |
| `<kcl-list>` | Animated list items | staggered entrance, bullet styles | all visual styling |

### Data Binding Pattern

Avoid string escaping in attributes. Use `<script type="application/json">` blocks:

```html
<!-- AI generates this per frame -->
<kcl-chart id="revenue-chart" type="bar" animate="grow"></kcl-chart>
<script type="application/json" data-for="revenue-chart">
{
  "labels": ["Q1", "Q2", "Q3", "Q4"],
  "datasets": [{
    "label": "Revenue ($M)",
    "values": [2.1, 3.4, 5.2, 6.8]
  }]
}
</script>
```

KCL components look up their data by `id` from the nearest `<script data-for>` block. Clean, reliable, no escaping issues.

### Error Handling in Frames

When a frame has a code error, KCL displays a visible overlay inside the iframe:

```
┌──────────────────────────────────────────┐
│  ⚠ Frame rendering error                 │
│                                          │
│  ReferenceError: chartData is not defined│
│  Line 14, Column 8                       │
│                                          │
│  [Show Code]  [Rollback to Last Good]    │
└──────────────────────────────────────────┘
```

- Errors are contained within the frame (don't affect the app shell).
- "Rollback to Last Good" restores the last successfully rendered version.
- In Simple Mode, errors trigger an automatic AI fix attempt.
- In Power Mode, errors show the code location for manual fixing.

---

## Editing Experience

### Edit Mode (Direct Manipulation) — *See Addendum A, ADD-1*

> Non-technical users can click, select, and edit frame elements visually via a Properties Panel. No code knowledge required. Full details in Addendum A.

### Simple Mode (Creative Director)

The user interacts entirely through conversation. Code is never visible unless requested.

```
┌───────────────────────────────────────────────────────┐
│  Beyle Design Studio                        [≡] [⚙]  │
│  Canvas: "Q3 Board Deck"                              │
├──────────┬────────────────────────────┬───────────────┤
│  Frame   │  Main Viewport              │  Chat        │
│  Rail    │                             │              │
│  ┌────┐  │  ┌─────────────────────┐   │  User:       │
│  │ f1 │■ │  │                     │   │  "Create a   │
│  ├────┤  │  │  [Live Rendered     │   │   10-slide   │
│  │ f2 │□ │  │   Frame]            │   │   pitch for  │
│  ├────┤  │  │                     │   │   Q3 results.│
│  │ f3 │□ │  │                     │   │   Pull from  │
│  ├────┤  │  │                     │   │   the Q3     │
│  │ f4 │□ │  │                     │   │   Report."   │
│  └────┘  │  └─────────────────────┘   │              │
│          │                             │  AI:         │
│  [+]     │  ◄ f1 ● f2 ○ f3 ○ f4 ►    │  Generated   │
│          │                             │  10 frames..│
│          │                             │              │
│          │                             │  [Show Diff] │
│          │                             │  [Approve]   │
└──────────┴────────────────────────────┴───────────────┘
```

**User flow:**
1. User types a prompt in the chat panel.
2. AI generates code for one or more frames.
3. Viewport shows the rendered result in real-time (streaming).
4. User can approve, request changes, or click specific frames to refine.
5. "Show Diff" reveals the code diff (proof artifact).

### Power Mode (Code + Preview)

Split view with code editor and live preview.

```
┌───────────────────────────────────────────────────────┐
│  Beyle Design Studio                    [Simple|Power]│
│  Canvas: "Q3 Board Deck"               [≡] [⚙]      │
├──────────┬──────────────┬──────────────┬──────────────┤
│  Frame   │ Code Editor  │ Live Preview │  Chat        │
│  Rail    │              │              │              │
│  ┌────┐  │ <kcl-slide>  │ ┌──────────┐│              │
│  │ f1 │□ │  <kcl-text   │ │          ││  [Prompt]    │
│  ├────┤  │   animate=.. │ │ [Render] ││              │
│  │ f2 │■ │  >Revenue    │ │          ││              │
│  ├────┤  │  </kcl-text> │ └──────────┘│              │
│  │ f3 │□ │  <kcl-chart  │              │              │
│  └────┘  │   id="rev".. │  f1 ○ f2 ● │              │
│          │              │  f3 ○       │              │
│  [+]     │  [Format]    │              │              │
│          │  [Validate]  │              │              │
└──────────┴──────────────┴──────────────┴──────────────┘
```

**Power Mode features:**
- Syntax highlighting for HTML/CSS/JS with KCL component awareness.
- Format and lint on save.
- Basic validation (HTML parsing, KCL component prop checking).
- Live preview updates on code change (debounced).
- AI chat still available — "Add a trend line to this chart" modifies the code.
- Diffs as first-class: every save creates a diffable version.
- "Known good" rollback button — restores last successfully rendered version.

### Tiptap's Role (Scoped)

Tiptap is NOT the core editing paradigm. It is used in three scoped areas:

| Where | Role |
|---|---|
| **Speaker notes** | Rich text editing for presenter notes attached to each frame |
| **Notebook narrative** | Text blocks between frames in Notebook composition mode |
| **Prompt input** | Rich prompt input in the conversation panel (paste tables, formatting) |

Frame content editing is handled by the code editor (Power Mode) or AI (Simple Mode). Tiptap does not touch frame rendering.

---

## AI Code Engine

### Conversation Model

Per-canvas conversation with frame context:

- **Single conversation thread** per canvas — no fragmentation across frames.
- **Frame context is implicit** — whatever frame is selected is the active context, but the AI can reference any frame.
- **Cross-frame operations** — "make all frames consistent" or "apply this style to frames 2-5" work naturally.
- **Doc references are sticky** — once a Kacheri Doc is referenced, the AI can pull from it throughout the conversation.
- **Conversation is the audit trail** — every prompt → code change is a proof packet.

### AI Generation Flow

```
User Prompt
    │
    ▼
Intent Parsing (AI)
    │  - What frames to create/modify?
    │  - What content to include?
    │  - What style/mood/design direction?
    │  - What Docs to reference?
    │
    ▼
Doc Cross-Reference (if referenced)
    │  - Fetch doc content/extraction data
    │  - Maintain provenance link
    │
    ▼
Code Generation (AI)
    │  - Generate HTML/CSS/JS per frame
    │  - Use KCL components for structure
    │  - Apply fully generative design (colors, typography, layout)
    │  - Inject data via <script type="application/json"> blocks
    │
    ▼
Frame Render (sandboxed iframe)
    │  - Inject generated code into iframe
    │  - Capture thumbnail on successful render
    │  - Detect and report errors
    │
    ▼
Proof Packet
    │  - prompt_hash (user intent)
    │  - code_before_hash (prior state)
    │  - code_after_hash (new state)
    │  - render_hash (thumbnail hash)
    │  - model, temperature, seed
    │  - doc_refs (source documents)
    │
    ▼
User Review
    ├── Approve → commit to canvas
    ├── Request changes → new AI turn
    └── Reject → rollback to prior state
```

### Fully Generative Design

The AI controls ALL design decisions. There are no templates.

**What the AI decides per frame:**
- Typography: font family, size hierarchy, weight, line height, letter spacing
- Color: background, text colors, accent palette, gradient direction
- Layout: grid vs flex, column count, alignment, whitespace ratio
- Animation: entrance type, timing, stagger, easing curve
- Data visualization: chart type, encoding, palette, annotation placement
- Imagery: composition, filters, blend modes, positioning

**What constrains the AI:**
- **Brand guidelines** (optional) — user can provide colors, fonts, logo as canvas-level context
- **Accessibility standards** — WCAG AA contrast ratios, minimum text sizes, readable fonts
- **KCL component contracts** — components enforce valid prop combinations
- **Composition mode** — Deck mode constraints (aspect ratio, readability at distance), Page mode (responsive breakpoints)

### AI Model Configuration

Design Studio uses the existing `modelRouter.ts` with a new route configuration:

```typescript
// AI action types for Design Studio
type DesignAIAction =
  | 'design:generate'       // Generate new frame(s) from prompt
  | 'design:edit'           // Modify existing frame code
  | 'design:style'          // Restyle frame (keep content, change design)
  | 'design:content'        // Update content (keep design, change data/text)
  | 'design:compose'        // Generate full canvas from document
  | 'design:export_prep'    // Prepare frame for specific export format
  | 'design:image';         // AI image generation — See Addendum A, ADD-3
```

---

## Cross-Referencing with Kacheri Docs

### Pulling from Docs

- "Summarize the contract into 5 slides" → AI reads Doc content, extracts key points, generates frames
- "Add the financial table from Q3 Report" → AI finds the table, renders it as an interactive chart
- "Use the exact language from section 4.2 of the NDA" → AI pulls text with provenance link

### Pushing to Docs

- Embed a canvas frame inside a Doc (live widget via `<kcl-embed>`)
- "Turn this presentation into a document" → AI converts frames to prose (future)
- Export speaker notes as a Doc

### Provenance Chain

```
Doc (source) → Canvas Frame (derived) → Export (output)
     │                  │                      │
     └── proof ──────── └── proof ──────────── └── proof
```

Every frame knows where its content came from. The `<kcl-source>` component renders a citation link:

```html
<kcl-source doc-id="doc_abc123" section="4.2" label="Services Agreement, Section 4.2" />
```

Clicking a source reference navigates to the source document in Kacheri Docs.

---

## Export Engine

Since frames are code, export becomes compilation:

| Format | How It Works | Proof |
|---|---|---|
| **Web (HTML/JS/CSS)** | Bundle frame HTML + KCL library as self-contained SPA or static site | SHA256 of bundle |
| **PDF** | Render each frame via Puppeteer, paginate, include speaker notes | Per-page hash |
| **PPTX** | Map KCL components to PowerPoint objects (text → textbox, chart → chart, image → image). Lossy but usable. | SHA256 of PPTX |
| **Embeddable** | `<iframe>` snippet for embedding single frames or full deck | URL + hash |
| **PNG/SVG** | Export individual frames as images | Per-frame hash |
| **Standalone HTML** | Single-file HTML with inlined KCL, CSS, and data. Fully offline-capable. | SHA256 of file |
| **Video (MP4)** | Puppeteer frame capture + ffmpeg stitching with transitions. *See Addendum A, ADD-2.* | SHA256 of video |

Each export produces a proof packet consistent with the existing Kacheri proof model.

### PPTX Export Strategy

PPTX is the most complex export because PowerPoint's object model is fundamentally different from HTML. The strategy:

1. **KCL components map to PPTX primitives:**
   - `<kcl-text>` → TextBox with formatted runs
   - `<kcl-chart>` → native PowerPoint chart (if chart type is supported) or embedded image
   - `<kcl-image>` → Picture shape
   - `<kcl-table>` → PowerPoint table
   - `<kcl-layout>` → positioned shapes (absolute placement calculated from flex/grid)
   - Animations → PowerPoint entrance/emphasis animations (subset mapping)

2. **Fallback for unsupported elements:**
   - Complex custom HTML → rasterized to PNG, embedded as image
   - Custom animations → simplified or removed
   - Interactive elements → static snapshot

3. **Fidelity levels:**
   - High: text, images, basic charts, tables
   - Medium: complex layouts, multi-column
   - Low: custom animations, interactive elements, SVG effects

---

## Database Schema

### canvases

Top-level canvas container.

```sql
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,                         -- nanoid(12)
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Canvas',
  description TEXT,
  composition_mode TEXT NOT NULL DEFAULT 'deck'
    CHECK (composition_mode IN ('deck', 'page', 'notebook', 'widget')),
  kcl_version TEXT NOT NULL,                   -- pinned KCL version (e.g., "1.0.0")
  aspect_ratio TEXT NOT NULL DEFAULT '16:9'
    CHECK (aspect_ratio IN ('16:9', '4:3', '16:10', '1:1', 'auto')),
  theme_json TEXT,                             -- optional brand/theme constraints (colors, fonts, logo)
  settings_json TEXT NOT NULL DEFAULT '{}',    -- canvas-level settings (transitions, timing, etc.)
  frame_order_json TEXT NOT NULL DEFAULT '[]', -- ordered array of frame IDs
  is_locked INTEGER NOT NULL DEFAULT 0,        -- locked canvases are immutable
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX idx_canvases_workspace ON canvases(workspace_id);
CREATE INDEX idx_canvases_created_by ON canvases(created_by);
CREATE INDEX idx_canvases_updated ON canvases(updated_at DESC);
```

### canvas_frames

Individual frames within a canvas.

```sql
CREATE TABLE IF NOT EXISTS canvas_frames (
  id TEXT PRIMARY KEY,                         -- nanoid(12)
  canvas_id TEXT NOT NULL,
  frame_index INTEGER NOT NULL,                -- position in canvas (0-based)
  code_html TEXT NOT NULL DEFAULT '',           -- generated HTML/CSS/JS code
  code_hash TEXT,                              -- SHA256 of code_html
  thumbnail_path TEXT,                         -- path to PNG thumbnail
  thumbnail_hash TEXT,                         -- SHA256 of thumbnail
  speaker_notes TEXT,                          -- rich text (Tiptap JSON or HTML)
  data_json TEXT,                              -- injected data bindings (JSON)
  source_refs_json TEXT NOT NULL DEFAULT '[]', -- [{docId, section, label}]
  intent_summary TEXT,                         -- short description of what this frame shows
  last_prompt TEXT,                            -- the prompt that produced current code
  kcl_version TEXT NOT NULL,                   -- KCL version this frame was built with
  is_locked INTEGER NOT NULL DEFAULT 0,        -- locked frames can't be edited
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);
CREATE INDEX idx_frames_canvas ON canvas_frames(canvas_id);
CREATE INDEX idx_frames_order ON canvas_frames(canvas_id, frame_index);
```

### canvas_conversations

Per-canvas AI conversation history.

```sql
CREATE TABLE IF NOT EXISTS canvas_conversations (
  id TEXT PRIMARY KEY,                         -- nanoid(12)
  canvas_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,                       -- message content
  frame_context_id TEXT,                       -- which frame was active (nullable)
  frames_affected_json TEXT,                   -- array of frame IDs modified by this turn
  code_diffs_json TEXT,                        -- [{frameId, before, after}] for proof
  proof_id TEXT,                               -- linked proof record
  model TEXT,                                  -- AI model used (for assistant messages)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);
CREATE INDEX idx_conv_canvas ON canvas_conversations(canvas_id);
CREATE INDEX idx_conv_created ON canvas_conversations(canvas_id, created_at);
```

### canvas_versions

Named versions / snapshots of entire canvas state.

```sql
CREATE TABLE IF NOT EXISTS canvas_versions (
  id TEXT PRIMARY KEY,                         -- nanoid(12)
  canvas_id TEXT NOT NULL,
  version_name TEXT,                           -- user-defined name (optional)
  version_number INTEGER NOT NULL,             -- auto-incrementing
  snapshot_json TEXT NOT NULL,                  -- full canvas state (frames, settings, order)
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);
CREATE INDEX idx_versions_canvas ON canvas_versions(canvas_id);
CREATE INDEX idx_versions_number ON canvas_versions(canvas_id, version_number DESC);
```

### canvas_exports

Export history with proof records.

```sql
CREATE TABLE IF NOT EXISTS canvas_exports (
  id TEXT PRIMARY KEY,                         -- nanoid(12)
  canvas_id TEXT NOT NULL,
  export_format TEXT NOT NULL CHECK (export_format IN (
    'pdf', 'pptx', 'html_bundle', 'html_standalone',
    'png', 'svg', 'embed'
  )),
  file_path TEXT,                              -- storage path of exported file
  file_hash TEXT,                              -- SHA256 of export
  file_size INTEGER,                           -- bytes
  frame_count INTEGER NOT NULL,
  kcl_version TEXT NOT NULL,
  proof_id TEXT,
  exported_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);
CREATE INDEX idx_exports_canvas ON canvas_exports(canvas_id);
CREATE INDEX idx_exports_created ON canvas_exports(created_at DESC);
```

---

## API Contract Additions

### Canvas CRUD

```http
POST /workspaces/:wid/canvases
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Q3 Board Deck",
  "compositionMode": "deck",
  "aspectRatio": "16:9",
  "theme": {
    "primaryColor": "#1a1a4e",
    "fontFamily": "Space Grotesk"
  }
}
```

**Response:** `201 Created`
```json
{
  "canvas": {
    "id": "cvs_abc123",
    "title": "Q3 Board Deck",
    "compositionMode": "deck",
    "aspectRatio": "16:9",
    "kclVersion": "1.0.0",
    "frameOrder": [],
    "isLocked": false,
    "createdBy": "user_xyz",
    "createdAt": "2026-03-15T10:00:00Z",
    "updatedAt": "2026-03-15T10:00:00Z"
  }
}
```

---

```http
GET /workspaces/:wid/canvases
Authorization: Bearer <accessToken>
Query: ?sort=updated_at&order=desc&limit=20&offset=0
```

**Response:** `200 OK`
```json
{
  "canvases": [
    {
      "id": "cvs_abc123",
      "title": "Q3 Board Deck",
      "compositionMode": "deck",
      "frameCount": 10,
      "thumbnailUrl": "/canvases/cvs_abc123/thumbnail",
      "createdBy": "user_xyz",
      "updatedAt": "2026-03-15T14:30:00Z"
    }
  ],
  "total": 12,
  "limit": 20,
  "offset": 0
}
```

---

```http
GET /workspaces/:wid/canvases/:cid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "canvas": {
    "id": "cvs_abc123",
    "title": "Q3 Board Deck",
    "compositionMode": "deck",
    "aspectRatio": "16:9",
    "kclVersion": "1.0.0",
    "theme": { "primaryColor": "#1a1a4e", "fontFamily": "Space Grotesk" },
    "settings": { "transitionType": "morph", "transitionDuration": 500 },
    "frameOrder": ["frm_001", "frm_002", "frm_003"],
    "isLocked": false,
    "createdBy": "user_xyz",
    "createdAt": "2026-03-15T10:00:00Z",
    "updatedAt": "2026-03-15T14:30:00Z"
  },
  "frames": [
    {
      "id": "frm_001",
      "frameIndex": 0,
      "codeHash": "sha256:abc...",
      "thumbnailUrl": "/canvases/cvs_abc123/frames/frm_001/thumbnail",
      "intentSummary": "Title slide: Q3 Results Overview",
      "speakerNotes": "Welcome everyone...",
      "sourceRefs": [],
      "updatedAt": "2026-03-15T14:30:00Z"
    }
  ]
}
```

---

```http
PATCH /workspaces/:wid/canvases/:cid
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Q3 Board Deck — Final",
  "compositionMode": "page",
  "frameOrder": ["frm_002", "frm_001", "frm_003"]
}
```

**Response:** `200 OK`

---

```http
DELETE /workspaces/:wid/canvases/:cid
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

---

### Frame Endpoints

```http
GET /canvases/:cid/frames/:fid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "frame": {
    "id": "frm_001",
    "canvasId": "cvs_abc123",
    "frameIndex": 0,
    "codeHtml": "<!DOCTYPE html><html>...",
    "codeHash": "sha256:abc...",
    "thumbnailUrl": "/canvases/cvs_abc123/frames/frm_001/thumbnail",
    "speakerNotes": "Welcome everyone to the Q3 review...",
    "dataJson": { "revenue": [2.1, 3.4, 5.2] },
    "sourceRefs": [
      { "docId": "doc_xyz", "section": "4.2", "label": "Q3 Report, Financial Summary" }
    ],
    "intentSummary": "Title slide: Q3 Results Overview",
    "lastPrompt": "Create an impactful title slide for Q3 results",
    "kclVersion": "1.0.0",
    "isLocked": false,
    "updatedAt": "2026-03-15T14:30:00Z"
  }
}
```

---

```http
PUT /canvases/:cid/frames/:fid/code
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body (Power Mode direct edit):**
```json
{
  "codeHtml": "<!DOCTYPE html><html>...",
  "speakerNotes": "Updated notes..."
}
```

**Response:** `200 OK`
```json
{
  "frame": { "id": "frm_001", "codeHash": "sha256:def...", "updatedAt": "..." },
  "proofId": "proof_edit_123"
}
```

---

### AI Generation Endpoints

```http
POST /canvases/:cid/ai/generate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Create a 10-slide pitch deck about our Q3 results. Pull data from the Q3 Report doc.",
  "activeFrameId": null,
  "docRefs": ["doc_xyz789"],
  "compositionMode": "deck"
}
```

**Response:** `200 OK` (streamed)
```json
{
  "conversationId": "conv_abc123",
  "framesGenerated": [
    { "id": "frm_001", "intentSummary": "Title slide", "codeHash": "sha256:..." },
    { "id": "frm_002", "intentSummary": "Key metrics", "codeHash": "sha256:..." }
  ],
  "proofId": "proof_gen_123",
  "docRefsUsed": [
    { "docId": "doc_xyz789", "sectionsUsed": ["4.2", "5.1", "6.3"] }
  ]
}
```

---

```http
POST /canvases/:cid/ai/edit
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Make the chart more dramatic, bigger numbers, add YoY comparison",
  "activeFrameId": "frm_003",
  "docRefs": []
}
```

**Response:** `200 OK` (streamed)
```json
{
  "conversationId": "conv_abc123",
  "framesModified": [
    {
      "id": "frm_003",
      "codeDiff": { "before": "sha256:old...", "after": "sha256:new..." },
      "intentSummary": "Revenue chart with YoY comparison"
    }
  ],
  "proofId": "proof_edit_456"
}
```

---

```http
POST /canvases/:cid/ai/style
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Apply a dark, professional theme to all frames",
  "targetFrameIds": ["frm_001", "frm_002", "frm_003"],
  "preserveContent": true
}
```

**Response:** `200 OK` (streamed)

---

### Conversation Endpoint

```http
GET /canvases/:cid/conversation
Authorization: Bearer <accessToken>
Query: ?limit=50&before=<messageId>
```

**Response:** `200 OK`
```json
{
  "messages": [
    {
      "id": "msg_001",
      "role": "user",
      "content": "Create a 10-slide pitch deck...",
      "frameContextId": null,
      "createdAt": "2026-03-15T10:00:00Z"
    },
    {
      "id": "msg_002",
      "role": "assistant",
      "content": "I've generated 10 frames for your Q3 pitch deck...",
      "framesAffected": ["frm_001", "frm_002", "..."],
      "proofId": "proof_gen_123",
      "model": "claude-sonnet-4-6",
      "createdAt": "2026-03-15T10:00:15Z"
    }
  ],
  "total": 24
}
```

---

### Export Endpoints

```http
POST /canvases/:cid/export
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "format": "pdf",
  "options": {
    "includeNotes": true,
    "quality": "high"
  }
}
```

**Response:** `202 Accepted`
```json
{
  "exportId": "exp_abc123",
  "jobId": "job_exp_123",
  "status": "processing",
  "format": "pdf"
}
```

---

```http
GET /canvases/:cid/exports/:eid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "export": {
    "id": "exp_abc123",
    "format": "pdf",
    "status": "complete",
    "fileUrl": "/exports/exp_abc123.pdf",
    "fileHash": "sha256:abc...",
    "fileSize": 2450000,
    "frameCount": 10,
    "kclVersion": "1.0.0",
    "proofId": "proof_exp_789",
    "createdAt": "2026-03-15T15:00:00Z"
  }
}
```

---

### Version Endpoints

```http
POST /canvases/:cid/versions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "versionName": "Pre-board review"
}
```

**Response:** `201 Created`

---

```http
GET /canvases/:cid/versions
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "versions": [
    {
      "id": "ver_001",
      "versionNumber": 3,
      "versionName": "Pre-board review",
      "frameCount": 10,
      "createdBy": "user_xyz",
      "createdAt": "2026-03-15T14:00:00Z"
    }
  ]
}
```

---

```http
POST /canvases/:cid/versions/:vid/restore
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`

---

## Implementation Slices

### Phase A: Foundation (Backend + KCL)

#### Slice A1: Database Schema & Migration

**Files to create:**
- `KACHERI BACKEND/migrations/013_add_design_studio.sql`

**Scope:**
- Create all 5 tables: `canvases`, `canvas_frames`, `canvas_conversations`, `canvas_versions`, `canvas_exports`
- Create all indexes
- Add `design:generate`, `design:edit`, `design:style`, `design:export` to proof kinds

**Acceptance Criteria:**
- All tables created via migration
- Indexes verified
- Proof kinds registered
- Migration runs cleanly on existing database

---

#### Slice A2: Canvas & Frame Store Layer

**Files to create:**
- `KACHERI BACKEND/src/store/canvases.ts`
- `KACHERI BACKEND/src/store/canvasFrames.ts`
- `KACHERI BACKEND/src/store/canvasConversations.ts`
- `KACHERI BACKEND/src/store/canvasVersions.ts`
- `KACHERI BACKEND/src/store/canvasExports.ts`

**Scope:**
- CanvasStore: CRUD, list by workspace, reorder frames, lock/unlock
- CanvasFrameStore: CRUD, get by canvas, reorder, update code + hash, update thumbnail
- CanvasConversationStore: append message, get by canvas (paginated), get by frame context
- CanvasVersionStore: create snapshot, list versions, get snapshot for restore
- CanvasExportStore: create, update status, list by canvas

**Acceptance Criteria:**
- All CRUD operations work
- Pagination works on list endpoints
- Frame reordering updates all affected indexes
- Version snapshots capture full canvas state

---

#### Slice A3: Canvas API Routes — CRUD

**Files to create:**
- `KACHERI BACKEND/src/routes/canvases.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `Docs/API_CONTRACT.md` (document endpoints)

**Scope:**
- POST /workspaces/:wid/canvases — create canvas
- GET /workspaces/:wid/canvases — list canvases
- GET /workspaces/:wid/canvases/:cid — get canvas with frames
- PATCH /workspaces/:wid/canvases/:cid — update canvas
- DELETE /workspaces/:wid/canvases/:cid — delete canvas
- GET /canvases/:cid/frames/:fid — get frame with code
- PUT /canvases/:cid/frames/:fid/code — update frame code (Power Mode)
- Workspace middleware + RBAC (owner/editor/viewer per canvas)

**Acceptance Criteria:**
- All endpoints return correct responses per API contract
- RBAC enforced (viewer can read, editor can modify, owner can delete)
- Workspace scoping prevents cross-workspace access
- Frame code updates compute and store hash

---

#### Slice A4: KCL v1 — Core Components

**Files to create:**
- `KACHERI FRONTEND/src/kcl/kcl.ts` (runtime bootstrap, custom element registration)
- `KACHERI FRONTEND/src/kcl/components/kcl-slide.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-text.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-layout.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-image.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-list.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-quote.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-metric.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-icon.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-animate.ts`
- `KACHERI FRONTEND/src/kcl/kcl.css` (base styles, reset, accessibility defaults)
- `KACHERI FRONTEND/src/kcl/package.json` (standalone package metadata for versioning)

**Scope:**
- KCL runtime: registers all custom elements, handles data binding from `<script data-for>` blocks
- `kcl-slide`: container with background, aspect ratio, transition hooks
- `kcl-text`: typography with responsive sizing, animation entrance
- `kcl-layout`: flexbox/grid composition with responsive breakpoints
- `kcl-image`: image display with aspect ratio, lazy loading, filter support
- `kcl-list`: animated list items with staggered entrance
- `kcl-quote`: blockquote with attribution
- `kcl-metric`: big number / KPI display with trend indicator
- `kcl-icon`: icon from bundled icon set (subset of Lucide or similar)
- `kcl-animate`: animation wrapper with entrance/emphasis/exit orchestration
- All components use attributes + JSON data binding (no hidden state)
- Accessible by default (ARIA roles, contrast-safe defaults)

**Acceptance Criteria:**
- All components render correctly in a standalone HTML page
- Data binding from `<script data-for>` works
- Components degrade gracefully when attributes are missing
- Error overlay shown for invalid prop combinations
- KCL builds as a standalone JS bundle (no React dependency)
- Accessible defaults pass WCAG AA for default styling

**Dependency approval required:** Icon set (Lucide subset or custom SVG sprites) — no runtime dependency, build-time only

---

#### Slice A5: KCL v1 — Data Visualization Components

**Files to create:**
- `KACHERI FRONTEND/src/kcl/components/kcl-chart.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-table.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-timeline.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-compare.ts`

**Scope:**
- `kcl-chart`: bar, line, pie, donut, scatter, area charts with animation. Data from JSON binding. Palette customizable via CSS custom properties.
- `kcl-table`: data table with sorting, alternating rows, responsive overflow. Data from JSON binding.
- `kcl-timeline`: vertical/horizontal timeline with nodes and connectors
- `kcl-compare`: side-by-side or slider-based before/after comparison

**Acceptance Criteria:**
- Charts render all supported types with correct data
- Chart animations play on load
- Tables handle varying column counts and data types
- Timeline renders with correct node positioning
- Compare slider works with touch and mouse

**Dependency decision required:** Chart rendering approach — options:
1. Custom SVG rendering (no dependency, full control, more development effort)
2. Lightweight charting library (e.g., Chart.js, uPlot) bundled into KCL
3. D3.js subset for maximum flexibility

---

#### Slice A6: KCL Build, Versioning & Distribution

**Files to create:**
- `KACHERI FRONTEND/src/kcl/build.ts` (build script for standalone KCL bundle)
- `KACHERI FRONTEND/src/kcl/version.ts` (version registry)

**Scope:**
- Build KCL as a standalone JS + CSS bundle (no React dependency)
- Version stamping: each build produces `kcl-{version}.js` and `kcl-{version}.css`
- Version registry: maintains list of available versions with changelogs
- Serving: `/kcl/{version}/kcl.js` and `/kcl/{version}/kcl.css` served from backend
- Frame HTML template: `<script src="/kcl/{version}/kcl.js">` auto-injected
- Backwards compatibility test: render a set of "golden" frames against new KCL version, compare screenshots

**Acceptance Criteria:**
- KCL builds to standalone bundle without React
- Version-pinned serving works (`/kcl/1.0.0/kcl.js`)
- Multiple KCL versions can coexist on same server
- Golden frame comparison catches visual regressions

---

### Phase B: AI Engine & Conversation

#### Slice B1: AI Code Generation Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/designEngine.ts`
- `KACHERI BACKEND/src/ai/designPrompts.ts`

**Scope:**
- `generateFrames(prompt, context)`: generate HTML/CSS/JS code for one or more frames using KCL
- `editFrame(prompt, existingCode, context)`: modify existing frame code
- `styleFrames(prompt, frameCodes, context)`: restyle frames while preserving content
- System prompts for each action type with:
  - KCL component reference (available components and their attributes)
  - Canvas context (composition mode, aspect ratio, theme)
  - Frame context (existing frames for style consistency)
  - Doc references (content pulled from Kacheri Docs)
- Code validation: parse generated HTML, check for KCL component usage, validate structure
- Error recovery: if generated code fails validation, retry with error context (max 2 retries)
- Streaming: return generated code as it's produced for real-time preview

**Acceptance Criteria:**
- Generates valid HTML using KCL components from text prompts
- Edit mode preserves frame structure while applying changes
- Style mode changes visual appearance without altering content
- Code validation catches common generation errors
- Retry logic recovers from minor generation failures
- Streaming output enables real-time preview

---

#### Slice B2: Doc Cross-Reference Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/designDocBridge.ts`

**Scope:**
- Fetch doc content by ID for AI context injection
- Extract relevant sections from docs based on AI intent parsing
- Build provenance links: `{docId, section, textUsed, hash}`
- Support multiple docs per generation (e.g., "combine Q3 Report and Budget doc into a deck")
- Sanitize doc content before injection (strip sensitive metadata, limit token count)
- Generate `<kcl-source>` markup in frame code pointing back to source docs

**Acceptance Criteria:**
- Can fetch and inject doc content into AI prompts
- Provenance links correctly track which doc sections were used
- Multiple doc references supported per generation
- Content sanitized and token-limited
- `<kcl-source>` elements correctly point to source docs

---

#### Slice B3: Canvas Conversation API

**Files to create:**
- `KACHERI BACKEND/src/routes/canvasAi.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `KACHERI BACKEND/src/types/proofs.ts` (add design proof kinds)
- `Docs/API_CONTRACT.md`

**Scope:**
- POST /canvases/:cid/ai/generate — generate new frames from prompt
- POST /canvases/:cid/ai/edit — modify existing frame(s)
- POST /canvases/:cid/ai/style — restyle frame(s)
- GET /canvases/:cid/conversation — get conversation history
- All AI endpoints:
  - Create conversation entries (user + assistant messages)
  - Create proof packets (prompt hash, code diffs, model details)
  - Return streaming responses for real-time preview
  - Rate-limited (uses AI calls)
- Doc cross-referencing: when docRefs provided, fetch and inject doc content

**Acceptance Criteria:**
- All AI endpoints return correct responses per API contract
- Conversation history persisted and retrievable
- Proof packets created for every AI action
- Streaming works for real-time preview
- Rate limiting enforced
- Doc cross-references create provenance links

---

#### Slice B4: Canvas Version & Export API

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts`
- `Docs/API_CONTRACT.md`

**Scope:**
- POST /canvases/:cid/versions — create named version snapshot
- GET /canvases/:cid/versions — list versions
- POST /canvases/:cid/versions/:vid/restore — restore canvas to version
- POST /canvases/:cid/export — trigger export job
- GET /canvases/:cid/exports/:eid — get export status/download

**Acceptance Criteria:**
- Versions capture full canvas state (all frames, settings, order)
- Restore replaces current state with version snapshot
- Export triggers background job for heavy formats (PDF, PPTX)
- Export status trackable
- Export proof packets created

---

### Phase C: Frontend — App Shell & Simple Mode

#### Slice C1: Frontend Types & API Layer

**Files to create:**
- `KACHERI FRONTEND/src/types/canvas.ts`
- `KACHERI FRONTEND/src/api/canvas.ts`
- `KACHERI FRONTEND/src/api/canvasAi.ts`

**Scope:**
- TypeScript types for all canvas schemas (canvas, frame, conversation, version, export)
- API client: canvasApi (CRUD for canvases, frames, versions, exports)
- API client: canvasAiApi (generate, edit, style, conversation)
- Streaming response handling for AI generation
- Error handling following existing patterns

**Acceptance Criteria:**
- All types match backend schemas
- All API functions implemented
- Streaming responses handled correctly
- No TypeScript errors

---

#### Slice C2: Design Studio App Shell

**Files to create:**
- `KACHERI FRONTEND/src/DesignStudioPage.tsx`
- `KACHERI FRONTEND/src/components/studio/StudioLayout.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameThumbnail.tsx`
- `KACHERI FRONTEND/src/components/studio/studio.css`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` (add route `/workspaces/:wid/studio/:cid`)

**Scope:**
- DesignStudioPage: top-level page component, loads canvas data
- StudioLayout: three-panel layout (rail + viewport + chat)
- FrameRail: vertical frame list with thumbnails, drag-to-reorder, add/delete
- FrameThumbnail: thumbnail display with active indicator, frame number
- Route registration: `/workspaces/:wid/studio/:cid`
- Canvas title editing in header
- Mode toggle button (Simple/Power) in header
- Composition mode selector in header (Deck/Page/Notebook/Widget)

**Acceptance Criteria:**
- Page loads and displays canvas with frame rail
- Frame rail shows thumbnails in correct order
- Frames can be reordered via drag-and-drop
- New frames can be added
- Mode toggle and composition selector visible (functionality in later slices)
- Route accessible from file manager / navigation

---

#### Slice C3: Frame Viewport (Iframe Renderer)

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameRenderer.tsx`
- `KACHERI FRONTEND/src/components/studio/useFrameRenderer.ts`

**Scope:**
- FrameViewport: main viewport area showing the active frame
- FrameRenderer: sandboxed iframe component that renders frame HTML
  - Injects frame code HTML into iframe via srcdoc
  - Prepends KCL `<script>` and `<link>` tags (version-pinned)
  - Applies sandbox attributes and CSP
  - Handles iframe load events and error detection
  - Posts data bindings via postMessage
- useFrameRenderer: hook managing iframe lifecycle, thumbnail capture, error state
- Thumbnail capture: uses `html2canvas` or iframe screenshot API on frame render
- Frame navigation: prev/next buttons below viewport

**Acceptance Criteria:**
- Active frame renders correctly in sandboxed iframe
- KCL components work inside iframe
- Sandbox attributes prevent unauthorized access
- Errors in frame code display error overlay (not crash app)
- Thumbnail captured on successful render
- Frame navigation works

**Dependency decision required:** Thumbnail capture approach — `html2canvas` (existing, well-known) vs `iframe.contentDocument` canvas rendering

---

#### Slice C4: Conversation Panel (Simple Mode)

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/ConversationMessage.tsx`
- `KACHERI FRONTEND/src/components/studio/PromptInput.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameDiffPreview.tsx`
- `KACHERI FRONTEND/src/hooks/useCanvasConversation.ts`

**Scope:**
- ConversationPanel: chat-style panel showing conversation history
- ConversationMessage: individual message rendering (user prompt, AI response with frame previews)
- PromptInput: text input with send button, doc reference picker, frame context indicator
- FrameDiffPreview: inline before/after preview of frame changes within conversation
- useCanvasConversation: hook managing conversation state, streaming AI responses
- "Show Diff" button on AI messages reveals code diff
- "Approve" / "Request Changes" buttons on AI-generated frames
- Streaming: AI response appears in real-time as code is generated
- Doc reference picker: search and attach Kacheri Docs to the prompt

**Acceptance Criteria:**
- Conversation displays full history
- User can submit prompts and see AI responses
- Streaming works — response appears in real-time
- Frame changes shown as visual previews in conversation
- Code diff viewable via "Show Diff"
- Approve/reject workflow functions
- Doc references attachable to prompts

---

#### Slice C5: Presentation Mode

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/PresentationMode.tsx`
- `KACHERI FRONTEND/src/components/studio/PresenterView.tsx`

**Scope:**
- PresentationMode: fullscreen presentation with frame transitions
  - Keyboard navigation (arrow keys, space, escape)
  - Frame transitions (fade, slide, morph — using CSS animations)
  - Progress indicator (dot navigation at bottom)
  - Click-to-advance
- PresenterView: separate window showing current frame + next frame preview + speaker notes + timer
  - Opens in new window via `window.open`
  - Synced with main presentation via BroadcastChannel

**Acceptance Criteria:**
- Fullscreen presentation mode works
- Keyboard navigation works
- Transitions animate between frames
- Presenter view opens in separate window
- Speaker notes visible in presenter view
- Timer works in presenter view
- Escape exits presentation mode

---

### Phase D: Frontend — Power Mode & Polish

#### Slice D1: Power Mode — Code Editor

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/CodeEditor.tsx`
- `KACHERI FRONTEND/src/components/studio/useCodeEditor.ts`

**Scope:**
- CodeEditor: syntax-highlighted code editor for frame HTML/CSS/JS
  - Uses CodeMirror 6 or Monaco (decision required)
  - HTML/CSS/JS syntax highlighting
  - KCL component autocompletion (custom extension)
  - Format on save (Prettier-based or custom HTML formatter)
  - Basic validation (HTML parsing, KCL prop checking)
  - Live preview: debounced updates to iframe on code change
  - Error indicators: inline markers for broken code
- useCodeEditor: hook managing editor state, format, validate, save
- Split view layout: code left, preview right
- AI chat still accessible in Power Mode (modifies code directly)

**Acceptance Criteria:**
- Code editor renders with syntax highlighting
- KCL components have autocompletion
- Format on save works
- Live preview updates on code change
- Errors shown inline
- Changes saved to frame store

**Dependency decision required:** Editor library — CodeMirror 6 (lighter, extensible, MIT) vs Monaco (VS Code engine, heavier, feature-rich). Recommend CodeMirror 6 for bundle size.

---

#### Slice D2: Export Engine — HTML Bundle & Standalone

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportHtml.ts`

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts` (wire export route)

**Scope:**
- HTML Bundle: export canvas as directory of HTML files + KCL + assets
  - One HTML file per frame
  - Shared KCL bundle
  - Index page with composition mode (deck navigation / page layout)
  - Zipped for download
- Standalone HTML: single self-contained HTML file
  - All frames inlined
  - KCL inlined (no external dependencies)
  - Works fully offline
  - Composition mode baked in (deck transitions or page scroll)
- Proof packet for each export

**Acceptance Criteria:**
- HTML bundle produces working static site
- Standalone HTML opens in any browser with full functionality
- KCL version matches canvas's pinned version
- Proof packet created with file hash
- Assets (images, fonts) bundled correctly

---

#### Slice D3: Export Engine — PDF

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportPdf.ts`

**Scope:**
- Render each frame via Puppeteer (reuse existing Puppeteer infrastructure from Docs)
- Each frame = one PDF page at canvas aspect ratio
- Optional: include speaker notes as text below each page (if `includeNotes: true`)
- Background job for large canvases
- Progress reporting via WebSocket

**Acceptance Criteria:**
- PDF contains one page per frame
- Frames render with full visual fidelity
- Speaker notes included when requested
- Large canvases don't timeout (background job)
- Proof packet with per-page hash

---

#### Slice D4: Export Engine — PPTX

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportPptx.ts`

**Scope:**
- Map KCL components to PPTX primitives:
  - `kcl-text` → TextBox with formatted runs
  - `kcl-image` → Picture shape
  - `kcl-chart` → embedded chart image (rasterized)
  - `kcl-table` → PowerPoint table
  - Complex/custom elements → rasterized PNG fallback
- Speaker notes per slide
- Canvas theme → PPTX theme colors
- Background job for large canvases

**Acceptance Criteria:**
- PPTX opens in PowerPoint with reasonable fidelity
- Text is editable (not rasterized) where possible
- Charts and complex elements included as images
- Speaker notes present on each slide
- File hash in proof packet

**Dependency decision required:** PPTX generation library — `pptxgenjs` (JS-native, MIT) or `python-pptx` via subprocess. Recommend `pptxgenjs` for consistency with Node.js stack.

---

#### Slice D5: Canvas Listing & File Manager Integration

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/CanvasCard.tsx`
- `KACHERI FRONTEND/src/components/studio/CanvasListView.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/FileManagerPage.tsx` (add canvas section or tab)
- `KACHERI FRONTEND/src/components/AppLayout.tsx` (add Design Studio nav item)

**Scope:**
- CanvasCard: card component showing canvas thumbnail, title, frame count, last edited
- CanvasListView: grid/list of canvases in workspace with create button
- File Manager integration: canvases appear alongside documents (new section or tab)
- Navigation: clicking a canvas opens Design Studio page
- Create canvas: button in file manager that creates new canvas and navigates to studio

**Acceptance Criteria:**
- Canvases visible in file manager
- Canvas cards show thumbnail and metadata
- Create canvas flow works
- Navigation to/from studio works
- Design Studio accessible from main navigation

---

#### Slice D6: Speaker Notes with Tiptap

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/SpeakerNotesEditor.tsx`

**Scope:**
- Tiptap-based rich text editor for speaker notes per frame
- Minimal toolbar: bold, italic, bullet list, numbered list
- Auto-saves on change
- Visible in the properties panel (bottom of chat panel or separate tab)
- Used in presenter view (Slice C5)

**Acceptance Criteria:**
- Rich text editing for speaker notes
- Auto-saves on change
- Notes persist per frame
- Notes display in presenter view

---

#### Slice D7: Canvas Versions & History UI

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/CanvasVersionsPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/CanvasVersionCard.tsx`

**Scope:**
- CanvasVersionsPanel: list of named versions with create/restore buttons
- CanvasVersionCard: version name, date, frame count, creator
- Create version: dialog to name the version
- Restore version: confirmation dialog, restores all frames to snapshot state
- Auto-versioning: create auto-version before AI generation (safety net)

**Acceptance Criteria:**
- Version list displays correctly
- Create version captures full canvas state
- Restore replaces current canvas state
- Auto-version created before each AI generation
- Confirmation dialog for restore

---

### Phase E: Polish, Security & Testing

#### Slice E1: Frame Security Hardening

**Scope:**
- Audit all iframe sandbox attributes
- Implement CSP reporting: frames log CSP violations to console (dev mode) or backend (prod)
- Asset proxy: implement `/kcl-assets/` route that resolves `kcl-asset://` references to actual file URLs
- User-provided code sanitization in Power Mode: scan for `fetch()`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon` — warn user, don't silently allow
- Test: verify frames cannot access parent window, cookies, localStorage, or network

**Acceptance Criteria:**
- CSP violations reported
- Asset proxy works for images and fonts
- User code sanitization warns on network access attempts
- Iframe isolation verified by test suite

---

#### Slice E2: Performance Optimization

**Scope:**
- Implement three-render-mode system (thumbnail / live iframe / presentation pipeline)
- Virtual frame rail: only render visible thumbnails (for 100+ frame canvases)
- Lazy KCL loading: iframe loads KCL bundle on demand, not on page load
- Debounce code editor → iframe updates (300ms)
- Memory monitoring: detect iframe memory leaks, warn user

**Acceptance Criteria:**
- Only 1-3 live iframes at any time
- Frame rail virtualizes for large canvases
- Code editor updates are debounced
- Memory stays stable during long editing sessions

---

#### Slice E3: Proof Integration

**Files to modify:**
- `KACHERI FRONTEND/src/ProofsPanel.tsx` (add design proof kinds)
- `KACHERI FRONTEND/src/utils/tooltipHelpers.ts` (add design tooltips)

**Scope:**
- `design:generate` proofs show: prompt, frames created, doc refs used
- `design:edit` proofs show: prompt, code diff, frame modified
- `design:style` proofs show: frames restyled, before/after thumbnails
- `design:export` proofs show: format, frame count, file hash
- Proofs viewable from canvas (link from conversation panel)
- Proofs viewable from global proofs panel (filtered by canvas)

**Acceptance Criteria:**
- All design proof kinds render correctly in ProofsPanel
- Proof links from conversation panel work
- Canvas filter in global proofs panel works
- Tooltips added for design proof kinds

---

#### Slice E4: Notebook Composition Mode

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/NotebookView.tsx`
- `KACHERI FRONTEND/src/components/studio/NotebookNarrative.tsx`

**Scope:**
- NotebookView: vertical layout alternating narrative text blocks with rendered frames
- NotebookNarrative: Tiptap-based rich text block between frames
- Narrative blocks stored as additional metadata on canvas (between-frame content)
- AI can generate narrative text alongside frames
- Export: notebook exports include narrative text between frame renders

**Acceptance Criteria:**
- Notebook mode displays frames with narrative blocks between them
- Narrative text is editable with Tiptap
- AI can generate both frames and narrative content
- Export includes narrative in HTML and PDF formats

---

#### Slice E5: Embed / Widget Mode

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/EmbedDialog.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts` (add public embed route)

**Scope:**
- Generate embeddable `<iframe>` snippet for single frames or full canvas
- Public embed route: `/embed/canvases/:cid` and `/embed/frames/:fid` (read-only, no auth required for published embeds)
- Embed settings: published/unpublished toggle, allowed domains whitelist
- Responsive embed (auto-resizes to container)
- EmbedDialog: UI for generating embed code, toggling publish state

**Acceptance Criteria:**
- Embed iframe renders frame correctly
- Published/unpublished toggle works
- Embed auto-resizes responsively
- Embed code copyable from dialog
- Unpublished embeds return 404

---

#### Slice E6: Documentation & Testing

**Files to create:**
- `KACHERI BACKEND/src/store/__tests__/canvases.test.ts`
- `KACHERI BACKEND/src/ai/__tests__/designEngine.test.ts`
- `KACHERI FRONTEND/src/kcl/__tests__/kcl-components.test.ts`
- `Docs/features/beyle-design-studio.md`

**Files to modify:**
- `Docs/API_CONTRACT.md` (final review, add Design Studio section to ToC)

**Scope:**
- Store tests: canvas and frame CRUD, version snapshots, conversation persistence
- AI engine tests: code generation validation, prompt construction, doc cross-referencing
- KCL tests: component rendering, data binding, error handling, accessibility
- User documentation: feature overview, Simple/Power mode guide, KCL component reference
- API contract finalization

**Acceptance Criteria:**
- All tests pass
- User docs explain feature comprehensively
- API contract complete and in ToC
- KCL component reference documented

---

## Estimated Effort by Slice

| Slice | Description | Effort |
|-------|-------------|--------|
| **Phase A: Foundation** | | |
| A1 | Database Schema & Migration | 0.5 days |
| A2 | Canvas & Frame Store Layer | 2 days |
| A3 | Canvas API Routes — CRUD | 2 days |
| A4 | KCL v1 — Core Components | 4-5 days |
| A5 | KCL v1 — Data Visualization | 4-5 days |
| A6 | KCL Build, Versioning & Distribution | 1-2 days |
| **Phase B: AI Engine** | | |
| B1 | AI Code Generation Engine | 3-4 days |
| B2 | Doc Cross-Reference Engine | 1-2 days |
| B3 | Canvas Conversation API | 2-3 days |
| B4 | Canvas Version & Export API | 1-2 days |
| **Phase C: Frontend — Simple Mode** | | |
| C1 | Frontend Types & API Layer | 1 day |
| C2 | Design Studio App Shell | 2-3 days |
| C3 | Frame Viewport (Iframe Renderer) | 2-3 days |
| C4 | Conversation Panel (Simple Mode) | 3-4 days |
| C5 | Presentation Mode | 2-3 days |
| **Phase D: Power Mode & Export** | | |
| D1 | Power Mode — Code Editor | 3-4 days |
| D2 | Export Engine — HTML Bundle & Standalone | 2-3 days |
| D3 | Export Engine — PDF | 1-2 days |
| D4 | Export Engine — PPTX | 2-3 days |
| D5 | Canvas Listing & File Manager Integration | 1-2 days |
| D6 | Speaker Notes with Tiptap | 1 day |
| D7 | Canvas Versions & History UI | 1-2 days |
| **Phase E: Polish & Testing** | | |
| E1 | Frame Security Hardening | 2 days |
| E2 | Performance Optimization | 2-3 days |
| E3 | Proof Integration | 1 day |
| E4 | Notebook Composition Mode | 2-3 days |
| E5 | Embed / Widget Mode | 2 days |
| E6 | Documentation & Testing | 2-3 days |
| **Total** | | **49-68 days** |

---

## Dependencies

| Slice | Depends On |
|-------|------------|
| A2 (Store Layer) | A1 (Database) |
| A3 (API Routes) | A2 (Store) |
| A4 (KCL Core) | None (independent) |
| A5 (KCL Data Viz) | A4 (KCL Core) |
| A6 (KCL Build) | A4, A5 (KCL components) |
| B1 (AI Engine) | A4 (KCL — needs component reference for prompts) |
| B2 (Doc Bridge) | None (uses existing doc store) |
| B3 (Conversation API) | A3 (API routes), B1 (AI engine), B2 (Doc bridge) |
| B4 (Version/Export API) | A3 (API routes) |
| C1 (Frontend Types) | A3, B3, B4 (API shape finalized) |
| C2 (App Shell) | C1 (Types) |
| C3 (Frame Viewport) | C2 (App Shell), A6 (KCL serving) |
| C4 (Conversation) | C2 (App Shell), C3 (Viewport), B3 (Conversation API) |
| C5 (Presentation) | C3 (Frame Viewport) |
| D1 (Code Editor) | C3 (Frame Viewport) |
| D2 (Export HTML) | A6 (KCL Build), B4 (Export API) |
| D3 (Export PDF) | B4 (Export API) |
| D4 (Export PPTX) | B4 (Export API) |
| D5 (File Manager) | C2 (App Shell), A3 (API) |
| D6 (Speaker Notes) | C2 (App Shell) |
| D7 (Versions UI) | C2 (App Shell), B4 (Version API) |
| E1 (Security) | C3 (Frame Viewport) |
| E2 (Performance) | C2, C3 (App Shell + Viewport) |
| E3 (Proofs) | B3 (Conversation API) |
| E4 (Notebook Mode) | C3 (Frame Viewport), D6 (Speaker Notes / Tiptap) |
| E5 (Embed Mode) | C3 (Frame Viewport), A3 (API) |
| E6 (Docs/Tests) | All above |

### Parallelization Opportunities

```
A1 → A2 → A3 ──────────────────────────┐
                                        ├─→ B3 → C1 → C2 → C3 → C4
A4 → A5 → A6 ──────────────────────────┤              │
                                        │              ├─→ C5 (Presentation)
B1 (after A4) ─────────────────────────┤              ├─→ D1 (Code Editor)
B2 (independent) ──────────────────────┤              ├─→ D5 (File Manager)
B4 (after A3) ─────────────────────────┘              └─→ D6 (Speaker Notes)

D2 (HTML Export) ─── after A6 + B4    (independent)
D3 (PDF Export) ──── after B4          (independent)
D4 (PPTX Export) ─── after B4         (independent)
```

**Phase A is the critical path.** KCL development (A4-A6) and backend foundation (A1-A3) can proceed in parallel. Phase B depends on A4 (KCL reference for AI prompts) and A3 (API routes). Phase C depends on everything being wired together. Phase D slices are largely independent of each other. Phase E is polish.

---

## Dependency Approval Requests

The following new dependencies will be needed. Per project policy, each requires explicit approval before installation.

| Dependency | Purpose | Alternatives | Risk | Bundle Impact |
|---|---|---|---|---|
| CodeMirror 6 (`@codemirror/view`, etc.) | Code editor in Power Mode | Monaco (heavier), Ace (older), textarea (insufficient) | Low — well-maintained, MIT, modular | ~150KB (tree-shakeable) |
| Chart rendering library (TBD) | `kcl-chart` component | Custom SVG (no dep, more dev effort), Chart.js (~60KB), uPlot (~30KB) | Low–Medium depending on choice | 30-80KB |
| `pptxgenjs` | PPTX export generation | `python-pptx` via subprocess (cross-language), manual OOXML (massive effort) | Low — mature, MIT, JS-native | Backend only (no frontend impact) |
| html2canvas (or similar) | Thumbnail capture from iframe | Canvas API on iframe document (same-origin required), server-side Puppeteer screenshot | Low — well-known, MIT | ~40KB (frontend only, lazy-loaded) |

No dependencies will be installed until each is explicitly approved.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI generates broken/invalid HTML | Medium | Code validation after generation, auto-retry with error context (max 2), "known good" rollback |
| KCL becomes a kitchen sink framework | High | Strict component inventory — new components require work scope amendment. KCL does structure, CSS does styling. |
| KCL version drift breaks old canvases | High | Version pinning per canvas, backwards compatibility tests, locked canvases render with original version |
| Iframe sandbox escape | High | Strict CSP, no `allow-same-origin` in production, no network access, regular security audit |
| Data exfiltration from frames | High | `connect-src 'none'`, all data injected via postMessage, no user-controlled URLs in frames |
| 200+ frame canvas performance | Medium | Three-render-mode system (thumbnail/live/presentation), virtual frame rail, iframe recycling |
| PPTX export fidelity | Medium | Clearly communicate fidelity levels (high/medium/low), rasterize complex elements as PNG fallback |
| AI cost for large canvas generation | Medium | Rate limiting, token budgets per generation, streaming to show progress |
| Cross-frame shared state requests from users | Medium | Architectural constraint: frames are independent. Complex interactivity = single frame with multiple components. |
| Code editor introduces XSS in Power Mode | Medium | Frame runs in sandboxed iframe — even malicious code can't escape. User-facing warnings for dangerous patterns. |
| KCL data attribute escaping bugs | Low | JSON in `<script data-for>` blocks avoids attribute escaping entirely |

---

## Explicitly Out of Scope

**⚠ AMENDED BY ADDENDUM A (2026-02-21)** — Several items below have been promoted to in-scope. See Addendum A for full details.

~~1. **Real-time collaborative canvas editing**~~ → **NOW IN SCOPE** (Addendum A, ADD-5) — Frame-level locking model.
~~2. **Video export**~~ → **NOW IN SCOPE** (Addendum A, ADD-2) — Puppeteer + ffmpeg.
~~3. **AI-generated imagery**~~ → **NOW IN SCOPE** (Addendum A, ADD-3) — Credit-based system.
~~4. **Custom KCL component authoring by users**~~ → **REPLACED** by Save Frame as Template (Addendum A, ADD-7).
5. **Kacheri Sheets integration** — No live data binding from Sheets. Chart data is static JSON. *(Sheets product doesn't exist yet.)*
~~6. **Mobile editing**~~ → **NOW IN SCOPE** (Addendum A, ADD-6) — Simple Mode on mobile, Power/Edit Mode desktop-only.
7. **Offline editing** — No offline canvas editing in v1 (requires significant Yjs/CRDT work for frames). Deferred to v2.
~~8. **External embed sources in frames**~~ → **NOW IN SCOPE** (Addendum A, ADD-4) — Domain whitelist approach.
9. **Page composition mode with custom routing** — Multi-page site with URL routing deferred. Page mode is single scrollable page.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| AI code generation success rate (valid HTML on first attempt) | > 85% |
| AI code generation success rate (valid after retry) | > 95% |
| Frame render time (iframe load to paint) | < 500ms |
| Thumbnail capture time | < 1 second |
| Canvas load time (10 frames, thumbnails) | < 2 seconds |
| PDF export time (10 frames) | < 30 seconds |
| HTML export time (10 frames) | < 5 seconds |
| PPTX export text editability rate | > 70% of text elements |
| KCL bundle size | < 100KB gzipped (core) |
| Code editor keystroke-to-preview latency | < 500ms |
| Presentation mode frame transition | < 300ms |

---

## Architectural Guardrails (from ChatGPT Review)

The following constraints were validated during architecture review and are binding:

1. **Frames must be deterministic and self-contained.** Frame behavior must not depend on "whatever KCL does this week" without versioning. KCL version pinning per canvas is mandatory.

2. **KCL must be opinionated, not a kitchen sink.** KCL handles: layout primitives, animations/transitions, charts/tables, media handling, theming tokens. Everything else stays raw HTML/CSS.

3. **Frames are pure functions.** Data in → visual out. No side effects, no network access, no state leakage.

4. **No cross-frame shared state.** Frames are independent. Interactivity lives inside a single frame. Cross-frame concerns are handled at the composition level only.

5. **The narrow waist test.** If KCL becomes "React but worse," it has failed. The game is finding a small, powerful set of primitives that keeps 80% of outputs clean and consistent, while allowing 20% wild custom HTML/CSS/SVG.

---

*This document is the authoritative work scope for Beyle Design Studio. All implementation must follow these specifications. Changes to architecture, scope, or dependencies require explicit amendment to this document.*

---
---

# ADDENDUM A — Scope Expansion (2026-02-21)

**Status:** APPROVED
**Amends:** Original work scope above
**Context:** Post-review additions to close usability gaps and promote high-value features from out-of-scope.

This addendum adds **7 new capability areas** and **10 new implementation slices** to the original work scope. All additions follow the same architecture, proof model, and security constraints defined above.

---

## ADD-1: Edit Mode — Direct Manipulation for Non-Coders

> **Referenced by:** Editing Experience section (adds a third mode alongside Simple and Power)

### Problem

The original scope offers two editing modes: Simple Mode (AI-only via chat) and Power Mode (code editor). Neither serves non-technical users who want to make small visual tweaks directly — change a word, adjust a color, resize an image — the way they do in PowerPoint or Canva.

### Solution: Edit Mode (Properties Panel)

A third editing mode that lets users click on any element in the rendered frame and edit its properties visually.

**How it works:**

```
┌───────────────────────────────────────────────────────┐
│  Beyle Design Studio                [Simple|Edit|Power]│
│  Canvas: "Q3 Board Deck"                              │
├──────────┬─────────────────────────┬──────────────────┤
│  Frame   │  Main Viewport          │  Properties      │
│  Rail    │                         │  Panel           │
│  ┌────┐  │  ┌───────────────────┐  │                  │
│  │ f1 │■ │  │                   │  │  Selected:       │
│  ├────┤  │  │  [Revenue Growth] │←─│─ kcl-text        │
│  │ f2 │□ │  │   ▪ selected      │  │                  │
│  ├────┤  │  │                   │  │  Content:        │
│  │ f3 │□ │  │  [chart below]    │  │  [Revenue Growth]│
│  └────┘  │  │                   │  │                  │
│          │  └───────────────────┘  │  Font: [Space G▾]│
│  [+]     │                         │  Size: [48px   ] │
│          │  ◄ f1 ● f2 ○ f3 ►      │  Color: [■ #1a1] │
│          │                         │  Weight: [Bold ▾]│
│          │                         │  Align: [L C R J]│
│          │                         │                  │
│          │                         │  --- Animation --│
│          │                         │  Entrance: [fade]│
│          │                         │  Duration: [0.5s]│
└──────────┴─────────────────────────┴──────────────────┘
```

**Interaction model:**

1. User clicks on an element in the rendered frame viewport.
2. The iframe communicates the selected element to the app shell via `postMessage`.
3. The Properties Panel shows editable controls specific to that element's KCL component type.
4. User changes a property (e.g., font size) → the app shell updates the underlying HTML code → iframe re-renders.
5. Every property change creates a diffable version (same proof model as code edits).

**What Edit Mode supports per KCL component:**

| Component | Editable Properties |
|---|---|
| `<kcl-text>` | Content (inline text editing), font family, size, weight, color, alignment, animation |
| `<kcl-image>` | Source (swap image), alt text, aspect ratio, filters, border radius |
| `<kcl-chart>` | Chart type, data (spreadsheet-like editor), colors, labels, legend toggle |
| `<kcl-table>` | Cell data (spreadsheet-like editor), header row toggle, stripe toggle, colors |
| `<kcl-layout>` | Direction (row/column), gap, alignment, padding |
| `<kcl-list>` | Items (add/remove/reorder), bullet style, animation |
| `<kcl-metric>` | Value, label, trend direction, trend value |
| `<kcl-quote>` | Quote text, attribution, style variant |
| `<kcl-slide>` | Background color/image/gradient, padding, transition type |
| `<kcl-icon>` | Icon selection (from icon picker), size, color |
| `<kcl-timeline>` | Events (add/remove/edit), orientation, connector style |
| `<kcl-compare>` | Before/after sources, slider position, labels |

**What Edit Mode does NOT do:**
- No free-form drag anywhere on canvas (elements stay within their layout containers)
- No pixel-level positioning (layout is handled by `<kcl-layout>` flexbox/grid)
- No drawing tools or freehand annotation
- Complex structural changes still go through AI (Simple Mode) or code (Power Mode)

### Architecture Impact

**KCL components must support an inspection protocol:**

Each KCL component defines an `editableProperties` schema that the app shell can query:

```typescript
// Each KCL component exposes this via a static property
interface KCLEditableSchema {
  component: string;           // e.g., "kcl-text"
  properties: {
    name: string;              // e.g., "content"
    type: 'text' | 'color' | 'select' | 'number' | 'json' | 'image';
    label: string;             // e.g., "Text Content"
    options?: string[];        // for 'select' type
    min?: number; max?: number; // for 'number' type
    currentValue: any;         // read from element
  }[];
}
```

**Element Selection Bridge (postMessage protocol):**

```
Frame iframe → App Shell:
  { type: 'kcl:element-selected', elementId: 'rev-title', component: 'kcl-text', schema: {...} }
  { type: 'kcl:element-deselected' }

App Shell → Frame iframe:
  { type: 'kcl:update-property', elementId: 'rev-title', property: 'content', value: 'New Title' }
  { type: 'kcl:highlight-element', elementId: 'rev-title' }
```

**KCL visual feedback:**
- Hovered elements show a subtle blue outline
- Selected elements show a solid blue outline with component type label
- Resize handles on images and layout containers (where applicable)

### New Implementation Slices

#### Slice F1: KCL Inspection Protocol & Selection Bridge

**Files to create:**
- `KACHERI FRONTEND/src/kcl/inspector.ts` (editable property schema per component)
- `KACHERI FRONTEND/src/kcl/selection.ts` (selection state, highlight rendering, postMessage bridge)

**Files to modify:**
- All KCL component files in `KACHERI FRONTEND/src/kcl/components/` (add editableProperties schema, selection event handlers)

**Scope:**
- Define `KCLEditableSchema` for every KCL component
- Implement selection visual feedback (hover outline, selection outline, component label)
- Implement postMessage bridge: element selection, property updates, highlight commands
- Handle click events on KCL elements to trigger selection
- Property update handler: receive property change → update DOM attribute/content → emit change event

**Acceptance Criteria:**
- Clicking a KCL element in the iframe sends selection event to parent
- Parent can send property updates that re-render the element
- Visual selection feedback (outline, label) works
- All KCL components define their editable properties schema

**Effort:** 3-4 days

---

#### Slice F2: Properties Panel UI

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/PropertiesPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/PropertyEditors.tsx` (individual property editors: text input, color picker, select, number, image picker, data grid)
- `KACHERI FRONTEND/src/components/studio/DataGridEditor.tsx` (spreadsheet-like editor for chart/table data)
- `KACHERI FRONTEND/src/components/studio/propertiesPanel.css`

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/StudioLayout.tsx` (add Properties Panel to layout in Edit Mode)
- `KACHERI FRONTEND/src/DesignStudioPage.tsx` (wire Edit Mode state)

**Scope:**
- PropertiesPanel: renders editable controls based on selected element's KCLEditableSchema
- Property editors for each property type:
  - `text`: inline text input / textarea
  - `color`: color picker (hex input + swatches)
  - `select`: dropdown
  - `number`: number input with optional slider
  - `image`: image picker (upload or select from existing)
  - `json`: DataGridEditor for chart/table data
- DataGridEditor: spreadsheet-like grid for editing chart datasets and table data (rows/columns, add/remove, cell editing)
- Changes apply immediately to frame (optimistic update)
- Each property change creates a code diff (for proof model)
- Undo/redo support for property changes

**Acceptance Criteria:**
- Selecting an element in the frame shows its properties in the panel
- All property types have working editors
- Changes reflect immediately in the frame
- DataGridEditor works for chart and table data
- Undo/redo works
- Code diffs generated for each change

**Effort:** 4-5 days

---

#### Slice F3: Inline Text Editing

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/InlineTextEditor.tsx`

**Scope:**
- Double-click a `<kcl-text>` element in the viewport → text becomes directly editable in-place within the iframe
- Mini formatting toolbar appears above selected text (bold, italic, color, size)
- Enter to confirm, Escape to cancel
- Changes update the underlying HTML code

**Acceptance Criteria:**
- Double-click activates inline text editing
- Text editable directly in the frame viewport
- Formatting toolbar works
- Escape cancels, click-away or Enter confirms
- HTML code updated correctly

**Effort:** 2-3 days

---

## ADD-2: Video Export (MP4)

> **Referenced by:** Export Engine section (adds new export format row)

### Scope

Export canvas frames as an MP4 video with transitions, timing, and optional audio narration track.

**How it works:**
1. Puppeteer renders each frame at the canvas aspect ratio
2. Frame transitions rendered as intermediate frames (fade, slide, morph)
3. Timing: configurable seconds-per-frame (default 5s) + transition duration
4. ffmpeg stitches frame images into MP4 with H.264 encoding
5. Optional: speaker notes → TTS audio track (uses existing TTS infrastructure if available)
6. Background job for rendering (can take minutes for large decks)

**Export settings:**
```json
{
  "format": "mp4",
  "options": {
    "resolution": "1080p",
    "secondsPerFrame": 5,
    "transitionDuration": 0.5,
    "includeAudio": false,
    "audioSource": "tts_from_notes"
  }
}
```

### New Implementation Slice

#### Slice D8: Export Engine — Video (MP4)

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportVideo.ts`

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts` (add mp4 to export format enum)
- Database: add `'mp4'` to `canvas_exports.export_format` CHECK constraint

**Scope:**
- Render each frame via Puppeteer as PNG sequence
- Generate transition frames between slides (CSS animation capture or interpolation)
- Stitch with ffmpeg into H.264 MP4
- Support 720p, 1080p, 4K resolution options
- Background job with progress reporting via WebSocket
- Proof packet with video file hash

**Acceptance Criteria:**
- MP4 plays in standard video players
- Transitions render smoothly between frames
- Resolution options work correctly
- Progress reported during render
- Proof packet created

**Effort:** 3-4 days

**Dependency approval required:** `ffmpeg` binary — not an npm dependency, system-level binary. Free, open source (LGPL/GPL). Must be available on the server. Consider bundling via `ffmpeg-static` npm package (MIT, ~70MB, bundles the binary).

---

## ADD-3: AI-Generated Imagery

> **Referenced by:** AI Code Engine section (adds new AI action type), KCL component inventory (images)

### Scope

Users can request AI-generated images directly within frame generation or as standalone requests. The AI generates images from text descriptions and inserts them into frames.

**User interactions:**
- "Add an illustration of a mountain landscape as the background" → AI generates image, inserts into frame
- "Generate an icon set for these 4 features" → AI generates custom icons
- Select an `<kcl-image>` in Edit Mode → "Generate with AI" button in Properties Panel

**Architecture:**

```
User prompt (text description)
    │
    ▼
Design Engine (parses intent, identifies image needs)
    │
    ▼
Image Generation API (configurable provider)
    │  - Provider 1: OpenAI DALL-E 3
    │  - Provider 2: Stability AI (Stable Diffusion)
    │  - Provider 3: Self-hosted (future)
    │
    ▼
Image stored as canvas asset (with proof)
    │
    ▼
Inserted into frame as <kcl-image src="kcl-asset://img_abc123">
```

**Cost management:**
- Credit-based system: each workspace gets N image generations per billing period
- Credit check before generation (fail fast if exhausted)
- Image generation tracked per workspace for billing visibility
- Lower-cost provider options available (Stable Diffusion via API is cheaper than DALL-E)

**New AI action type:**
```typescript
type DesignAIAction =
  | 'design:generate'
  | 'design:edit'
  | 'design:style'
  | 'design:content'
  | 'design:compose'
  | 'design:export_prep'
  | 'design:image';        // NEW — AI image generation
```

### New Implementation Slice

#### Slice B5: AI Image Generation Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/imageGenerator.ts`
- `KACHERI BACKEND/src/store/canvasAssets.ts`

**Files to modify:**
- `KACHERI BACKEND/src/ai/designEngine.ts` (integrate image generation into frame generation flow)
- `KACHERI BACKEND/src/routes/canvasAi.ts` (add image generation endpoint)
- `KACHERI BACKEND/src/types/proofs.ts` (add `design:image` proof kind)
- `Docs/API_CONTRACT.md`

**New API endpoint:**
```http
POST /canvases/:cid/ai/image
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request:**
```json
{
  "prompt": "A minimalist mountain landscape at sunset, flat design style",
  "aspectRatio": "16:9",
  "style": "flat",
  "targetFrameId": "frm_003"
}
```

**Response:** `200 OK`
```json
{
  "asset": {
    "id": "asset_img_abc123",
    "url": "/canvases/cvs_abc/assets/asset_img_abc123",
    "width": 1920,
    "height": 1080,
    "hash": "sha256:abc..."
  },
  "proofId": "proof_img_123",
  "creditsUsed": 1,
  "creditsRemaining": 49
}
```

**Database addition — canvas_assets table:**
```sql
CREATE TABLE IF NOT EXISTS canvas_assets (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image_generated', 'image_uploaded', 'font', 'other')),
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  generation_prompt TEXT,
  generation_provider TEXT,
  proof_id TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);
CREATE INDEX idx_canvas_assets_canvas ON canvas_assets(canvas_id);
```

**Scope:**
- Image generation via configurable provider (DALL-E 3 initially, pluggable)
- Asset storage and serving via `/canvases/:cid/assets/:assetId`
- Credit tracking per workspace
- Integration with design engine: AI can decide to generate images as part of frame generation
- Proof packet for every generated image
- Image inserted into frame code as `<kcl-image src="kcl-asset://asset_img_abc123">`

**Acceptance Criteria:**
- Image generation from text prompt works
- Generated images stored and servable
- Credit system tracks usage
- Proof packet created for each generation
- AI can autonomously generate images during frame creation
- Asset proxy resolves `kcl-asset://` URLs correctly

**Effort:** 3-4 days

**Dependency:** External API (OpenAI or Stability AI) — has per-call cost. No npm dependency needed beyond existing HTTP client. Provider is configurable.

---

## ADD-4: External Embed Sources (YouTube, Maps, Vimeo)

> **Referenced by:** Frame Isolation & Security section (relaxes `frame-src` for whitelisted domains), KCL `<kcl-embed>` component

### Scope

Allow frames to embed content from trusted third-party sources via a domain whitelist.

**Whitelisted domains (v1):**
- `youtube.com` / `youtube-nocookie.com`
- `vimeo.com`
- `google.com/maps` / `maps.google.com`
- `codepen.io`
- `loom.com`

**Security approach:**
- CSP `frame-src` updated to include whitelisted domains ONLY (not blanket open)
- Embeds render inside a nested iframe within the frame's sandbox
- `<kcl-embed>` component validates URLs against whitelist before rendering
- Unknown URLs show a blocked message with explanation
- Whitelist is server-configurable per workspace (admin can add/remove domains)

**CSP update for frames with embeds:**
```
frame-src 'none' youtube.com youtube-nocookie.com vimeo.com google.com maps.google.com codepen.io loom.com;
```

### New Implementation Slice

#### Slice E7: External Embed Whitelist

**Files to modify:**
- `KACHERI FRONTEND/src/kcl/components/kcl-embed.ts` (add URL validation, whitelist check, blocked state UI)
- `KACHERI BACKEND/src/routes/canvases.ts` (add workspace embed whitelist settings endpoint)
- Frame renderer CSP generation (dynamic CSP based on whether frame uses embeds)

**Scope:**
- `<kcl-embed>` validates embed URL against whitelist
- Blocked URLs show informative message (not silent failure)
- CSP generated per-frame based on whether embeds are present
- Workspace-level whitelist configuration (admin can customize)
- Default whitelist includes YouTube, Vimeo, Google Maps, Codepen, Loom

**Acceptance Criteria:**
- Whitelisted embeds render correctly inside frames
- Non-whitelisted URLs are blocked with visible message
- CSP is per-frame (only relaxed for frames that use embeds)
- Workspace admin can customize whitelist

**Effort:** 1-2 days

---

## ADD-5: Real-Time Collaborative Canvas Editing

> **Referenced by:** Architecture section, WebSocket infrastructure

### Scope

Multiple users can edit the same canvas simultaneously, with frame-level locking and live presence.

**Approach: Frame-Level Locking (not character-level CRDT)**

Unlike Kacheri Docs where Yjs provides character-level collaboration, Design Studio uses a simpler model:

```
Canvas Level (Yjs synced):
  - Canvas metadata (title, settings, composition mode)
  - Frame order (reordering is collaborative)
  - Presence cursors (who's looking at which frame)

Frame Level (Locked per user):
  - Only one user can edit a frame at a time
  - Other users see "Aditya is editing Frame 3" badge
  - Frame lock auto-releases on navigation away or 60s inactivity
  - AI generation locks affected frames during generation
```

**Why not character-level for frame code?**
- Frame code is generated by AI or set by Properties Panel — not typed character-by-character
- Two users editing the same frame's HTML simultaneously would cause constant conflicts
- Frame-level locking is simpler, more reliable, and matches the mental model

**Presence indicators:**
- Frame rail shows avatar badges on frames being viewed/edited by others
- Viewport shows "locked by [name]" overlay if another user has the lock
- Conversation panel is fully shared (all users see all messages in real-time)

### New Implementation Slice

#### Slice E8: Real-Time Canvas Collaboration

**Files to create:**
- `KACHERI FRONTEND/src/hooks/useCanvasCollaboration.ts`
- `KACHERI FRONTEND/src/components/studio/PresenceIndicator.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameLockBadge.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/realtime/workspaceWs.ts` (add canvas presence and frame lock channels)
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx` (add presence avatars)
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx` (add lock overlay)
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx` (real-time message sync)

**Scope:**
- Canvas presence via existing WebSocket infrastructure (who is viewing which canvas/frame)
- Frame lock acquire/release protocol via WebSocket
- Auto-release on disconnect or 60s inactivity
- Presence avatars on frame rail thumbnails
- Lock overlay on viewport when another user holds the lock
- Conversation messages sync in real-time across all connected users
- Canvas metadata changes (title, frame order, settings) sync via Yjs

**Acceptance Criteria:**
- Multiple users can view the same canvas simultaneously
- Frame locks prevent concurrent editing of the same frame
- Presence indicators show who is where
- Conversation panel syncs in real-time
- Lock auto-releases on disconnect
- Canvas metadata changes propagate to all connected users

**Effort:** 3-4 days

---

## ADD-6: Mobile Simple Mode Editing

> **Referenced by:** Editing Experience section

### Scope

Simple Mode (AI chat) works on mobile devices. Power Mode and Edit Mode remain desktop-only.

**What works on mobile:**
- Conversation panel (full-screen on mobile — primary interface)
- Frame viewport (swipeable frame navigation)
- Frame rail (horizontal strip at top, scrollable)
- Presentation mode (fullscreen, swipe to advance)
- View all frames, approve/reject AI changes

**What does NOT work on mobile:**
- Power Mode code editor (desktop only)
- Edit Mode Properties Panel (desktop only — screen too small for useful property editing)
- Drag-to-reorder frames (use conversation: "move frame 3 after frame 5")

**Layout (mobile):**

```
┌──────────────────────────┐
│  Canvas: Q3 Deck    [≡]  │
├──────────────────────────┤
│ [f1] [f2] [f3] [f4] →   │  ← horizontal frame rail
├──────────────────────────┤
│                          │
│  ┌────────────────────┐  │
│  │  [Rendered Frame]  │  │  ← frame viewport (swipeable)
│  │                    │  │
│  └────────────────────┘  │
│                          │
├──────────────────────────┤
│  Chat panel              │  ← conversation (scrollable)
│  ...messages...          │
│                          │
│  [Type a prompt...]  [→] │  ← prompt input
└──────────────────────────┘
```

### New Implementation Slice

#### Slice E9: Mobile Simple Mode

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/StudioLayout.tsx` (responsive breakpoints, stacked layout)
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx` (horizontal mode for mobile)
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx` (swipe navigation)
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx` (mobile-friendly layout)
- `KACHERI FRONTEND/src/components/studio/studio.css` (responsive styles)
- `KACHERI FRONTEND/src/DesignStudioPage.tsx` (hide mode toggle on mobile, force Simple Mode)

**Scope:**
- Responsive layout: three-panel → stacked layout at mobile breakpoint (<768px)
- Horizontal frame rail with touch scrolling
- Swipe left/right on viewport to navigate frames
- Touch-friendly prompt input
- Hide Power/Edit mode toggle on mobile (Simple Mode only)
- Presentation mode: swipe to advance, tap to toggle UI

**Acceptance Criteria:**
- Studio loads and functions on mobile viewport
- Frame navigation via swipe works
- Conversation panel usable on mobile
- Presentation mode works with touch
- Power and Edit modes hidden on mobile
- No horizontal scroll or overflow issues

**Effort:** 2-3 days

---

## ADD-7: Save Frame as Template

> **Referenced by:** Content Model section (replaces Custom KCL authoring in out-of-scope list)

### Scope

Users can save any frame as a reusable template, available across all canvases in the workspace. This gives 80% of the "custom component" value without the security complexity of user-authored KCL components.

**User flow:**
1. User creates a frame they like (via AI or manual editing)
2. Right-click frame or use menu → "Save as Template"
3. Name the template, add optional tags (e.g., "title slide", "chart", "comparison")
4. Template appears in a template gallery when creating new frames
5. "Insert from Template" adds a copy of the template's code as a new frame
6. Templates are workspace-scoped (all workspace members can use them)

**What a template stores:**
```json
{
  "id": "tpl_abc123",
  "name": "Dark Revenue Chart",
  "tags": ["chart", "financial", "dark"],
  "thumbnailUrl": "/templates/tpl_abc123/thumbnail",
  "codeHtml": "<!DOCTYPE html>...",
  "kclVersion": "1.0.0",
  "sourceCanvasId": "cvs_xyz",
  "sourceFrameId": "frm_003",
  "createdBy": "user_xyz",
  "createdAt": "2026-03-20T10:00:00Z"
}
```

### Database Addition

```sql
CREATE TABLE IF NOT EXISTS canvas_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  thumbnail_path TEXT,
  code_html TEXT NOT NULL,
  kcl_version TEXT NOT NULL,
  source_canvas_id TEXT,
  source_frame_id TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX idx_templates_workspace ON canvas_templates(workspace_id);
CREATE INDEX idx_templates_name ON canvas_templates(workspace_id, name);
```

### New API Endpoints

```http
POST /workspaces/:wid/canvas-templates
GET /workspaces/:wid/canvas-templates?tags=chart,financial
GET /workspaces/:wid/canvas-templates/:tid
DELETE /workspaces/:wid/canvas-templates/:tid
```

### New Implementation Slices

#### Slice D9: Frame Templates — Backend

**Files to create:**
- `KACHERI BACKEND/src/store/canvasTemplates.ts`
- `KACHERI BACKEND/src/routes/canvasTemplates.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `Docs/API_CONTRACT.md`

**Scope:**
- CanvasTemplateStore: create, list (with tag filter), get, delete
- API routes: CRUD for templates
- When saving: capture frame code, generate thumbnail, store with tags
- When inserting: copy template code into new frame, update KCL version if needed

**Acceptance Criteria:**
- Templates can be saved from any frame
- Template list supports tag filtering
- Templates scoped to workspace
- Inserting a template creates a new independent frame

**Effort:** 1-2 days

---

#### Slice D10: Frame Templates — Frontend

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/TemplateGallery.tsx`
- `KACHERI FRONTEND/src/components/studio/SaveTemplateDialog.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx` (add "Insert from Template" option to add-frame menu)

**Scope:**
- SaveTemplateDialog: name input, tag picker, preview
- TemplateGallery: grid of templates with search and tag filter, insert button
- "Save as Template" option in frame context menu
- "Insert from Template" option in add-frame flow

**Acceptance Criteria:**
- Save template dialog captures name and tags
- Template gallery shows all workspace templates with thumbnails
- Tag filtering and search work
- Inserting from template adds new frame with template code
- Template gallery accessible from frame rail "+" menu

**Effort:** 1-2 days

---

## Updated Out-of-Scope List

The following items from the original out-of-scope list have been **promoted to in-scope** by this addendum:

| Original Out-of-Scope Item | New Status | Addendum Section |
|---|---|---|
| Real-time collaborative canvas editing | **IN SCOPE** — frame-level locking | ADD-5 |
| Video export (MP4) | **IN SCOPE** — Puppeteer + ffmpeg | ADD-2 |
| AI-generated imagery | **IN SCOPE** — with credit system | ADD-3 |
| External embed sources in frames | **IN SCOPE** — whitelist approach | ADD-4 |
| Mobile editing | **IN SCOPE** — Simple Mode only | ADD-6 |
| Custom KCL component authoring | **REPLACED** by Save Frame as Template | ADD-7 |

**Remaining out of scope (unchanged):**

1. **Kacheri Sheets integration** — Sheets product doesn't exist yet. Data binding architecture is ready for it when Sheets is built.
2. **Offline editing** — Requires service workers, IndexedDB caching, conflict resolution. Poor effort-to-wow ratio. Deferred to v2.
3. **Multi-page site routing** — Page composition mode is single scrollable page. Multi-page with URL routing is a separate product scope (website builder). Deferred to v2.

---

## Updated Effort Summary

**New slices added by this addendum:**

| Slice | Description | Effort |
|-------|-------------|--------|
| **Phase F: Edit Mode (NEW)** | | |
| F1 | KCL Inspection Protocol & Selection Bridge | 3-4 days |
| F2 | Properties Panel UI | 4-5 days |
| F3 | Inline Text Editing | 2-3 days |
| **Additions to existing phases** | | |
| B5 | AI Image Generation Engine | 3-4 days |
| D8 | Export Engine — Video (MP4) | 3-4 days |
| D9 | Frame Templates — Backend | 1-2 days |
| D10 | Frame Templates — Frontend | 1-2 days |
| E7 | External Embed Whitelist | 1-2 days |
| E8 | Real-Time Canvas Collaboration | 3-4 days |
| E9 | Mobile Simple Mode | 2-3 days |
| **Addendum total** | | **24-33 days** |

**Revised project total:** 73-101 days (original 49-68 + addendum 24-33)

---

## Updated Dependency Approval Requests

**New dependencies requiring approval (addendum):**

| Dependency | Purpose | Alternatives | Risk | Impact |
|---|---|---|---|---|
| `ffmpeg-static` | Video export — bundles ffmpeg binary | System-installed ffmpeg (ops burden), no video export | Low — MIT, widely used | Backend only, ~70MB binary |
| OpenAI API (DALL-E 3) or Stability AI API | AI image generation | Self-hosted Stable Diffusion (infra cost), no image generation | Medium — per-call cost, external dependency | Backend only, API calls |
| Color picker component (TBD) | Properties Panel color editing | Custom implementation, `react-colorful` (~2KB) | Low | ~2KB frontend |

---

## Updated Risk Register (Addendum Additions)

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI image generation cost overruns | Medium | Credit-based system with hard limits per workspace, usage dashboard for admins |
| Edit Mode bidirectional sync bugs (property change → code → render loop) | Medium | One-way data flow: property change → code update → iframe re-render. No reverse inference from rendered DOM. |
| Frame lock contention in collaboration | Low | Auto-release after 60s inactivity, clear "request lock" UX, admin can force-release |
| Mobile viewport too small for meaningful frame preview | Low | Landscape orientation hint for presentation mode, pinch-to-zoom on frame viewport |
| External embeds introduce tracking/privacy concerns | Medium | Privacy-respecting embed URLs (youtube-nocookie.com), clear user warning when inserting embeds |
| Template proliferation (too many templates, no curation) | Low | Tag-based organization, workspace admin can manage templates, usage analytics |

---

## Updated Dependency Graph (Addendum Slices)

```
Original slices (unchanged):
A1 → A2 → A3 → B3 → C1 → C2 → C3 → C4
A4 → A5 → A6                │
B1 (after A4)                │
B2 (independent)             │

New addendum slices:
F1 (after A4+A5) ──→ F2 (after C2+F1) ──→ F3 (after F2)
B5 (after B1) ──────→ wired into B3
D8 (after B4) ────── independent
D9 → D10 (after A3) ── independent
E7 (after A4) ────── independent
E8 (after C2 + existing WebSocket) ── independent
E9 (after C2+C3+C4) ── independent
```

**Key dependency notes:**
- **F1 (KCL Inspection)** depends on all KCL components being built (A4+A5)
- **F2 (Properties Panel)** depends on the app shell (C2) and KCL inspection (F1)
- **F3 (Inline Text)** depends on Properties Panel infrastructure (F2)
- **B5 (Image Gen)** depends on the AI engine (B1) existing
- **E8 (Collaboration)** depends on the app shell (C2) and WebSocket infra (already exists)
- **Edit Mode (Phase F) is on the critical path for the non-coder experience** — prioritize accordingly

---

## Updated Success Metrics (Addendum Additions)

| Metric | Target |
|--------|--------|
| Properties Panel property-change-to-render latency | < 200ms |
| Inline text editing activation time | < 100ms |
| AI image generation time | < 15 seconds |
| Video export time (10 frames, 1080p) | < 2 minutes |
| Collaboration frame lock acquire time | < 100ms |
| Mobile Simple Mode usability (frame navigation, prompt, approve) | Fully functional |
| Template insert time | < 500ms |
| External embed load time (YouTube) | < 3 seconds |

---

*End of Addendum A. All additions are subject to the same architecture, proof model, security, and coding standards defined in the main work scope above.*
