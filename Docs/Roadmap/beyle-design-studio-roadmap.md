# Beyle Design Studio — Implementation Roadmap

**Created:** 2026-02-21
**Status:** DRAFT — PENDING APPROVAL
**Source of Truth:** `Docs/Roadmap/beyle-design-studio-work-scope.md` + Addendum A
**Prerequisite:** Kacheri Docs Phase 1 (complete) + Phase 2 (substantially complete)

---

## Purpose

This document is the **execution anchor** for building Beyle Design Studio. It sequences every feature from the work scope into buildable phases with clear milestones, dependency chains, and acceptance gates.

**Design constraint:** The system must support **independent product modules** — a deployment can enable Docs only, Design Studio only, or both. No product depends on another to function.

---

## Product Module Architecture

Before any Design Studio code ships, the platform must support product-level modularity. This is Phase 0.

```
BEYLE KACHERI Platform
│
├── Shared Substrate (always loaded)
│   ├── Auth / RBAC / Sessions
│   ├── Workspace management
│   ├── Proof model & Provenance store
│   ├── Job queue & Workers
│   ├── WebSocket infrastructure
│   ├── Artifact storage abstraction
│   ├── Observability & Health
│   ├── Audit log
│   └── Notification system
│
├── Product: Kacheri Docs (toggleable)
│   ├── Backend: doc routes, AI routes, import/export, comments, suggestions, versions
│   ├── Backend: extraction, compliance, clauses, knowledge graph, negotiations
│   ├── Frontend: Editor, FileManager, panels, modals
│   └── Frontend: doc-specific pages & navigation
│
├── Product: Beyle Design Studio (toggleable)
│   ├── Backend: canvas routes, canvas AI routes, export engines
│   ├── Backend: KCL serving, canvas templates, canvas assets
│   ├── Frontend: DesignStudioPage, studio components, KCL library
│   └── Frontend: studio-specific pages & navigation
│
└── Cross-Product (optional, gracefully degrades)
    ├── Doc cross-referencing in Design Studio (requires Docs enabled)
    ├── Canvas embedding in Docs (requires Design Studio enabled)
    └── Knowledge graph queries from Design Studio (requires Docs enabled)
```

**Configuration:**
```env
# Product modules — comma-separated list of enabled products
ENABLED_PRODUCTS=docs,design-studio

# Examples:
# ENABLED_PRODUCTS=docs                  → Docs only
# ENABLED_PRODUCTS=design-studio         → Design Studio only
# ENABLED_PRODUCTS=docs,design-studio    → Both products
```

---

## Phase Overview

| Phase | Name | Focus | Slices | Est. Effort |
|-------|------|-------|--------|-------------|
| **0** | Product Modularization | Make Docs and Design Studio independently toggleable | M1–M3 | 3–4 days |
| **1** | Backend Foundation | Database, store layer, API routes for canvases | A1–A3 | 4.5–5 days |
| **2** | KCL Component Library | Build the component runtime that frames target | A4–A6 | 9–12 days |
| **3** | AI Engine & Intelligence | Code generation, doc bridge, conversation, image gen | B1–B5 | 10–15 days |
| **4** | Frontend — Simple Mode | App shell, viewport, chat, presentation | C1–C5 | 10–14 days |
| **5** | Frontend — Power Mode & Exports | Code editor, all export engines, templates, versions UI | D1–D10 | 17–25 days |
| **6** | Frontend — Edit Mode | Direct manipulation via Properties Panel | F1–F3 | 9–12 days |
| **7** | Polish, Security & Platform | Hardening, performance, collaboration, mobile, testing | E1–E9 | 16–22 days |
| | **Total** | | **46 slices** | **79–109 days** |

> **Note:** Phase 0 adds 3 slices (M1–M3) beyond the 36 slices in the work scope + addendum, plus an additional 7 slices for modularity-related work integrated into existing phases.

---

## Phase 0: Product Modularization

**Goal:** Introduce product-level toggling so Docs and Design Studio can be independently enabled or disabled. No Design Studio code yet — this phase only restructures the existing codebase.

**Why this comes first:** Without this, adding Design Studio routes/pages creates a monolith where removing one product breaks the other. Doing this first means every subsequent phase naturally produces independent, toggleable code.

---

### Slice M1: Backend Product Module Registry

**Files to create:**
- `KACHERI BACKEND/src/modules/registry.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts`

**Scope:**
- Create a `ProductModule` interface and registry
- Read `ENABLED_PRODUCTS` from environment (default: `docs,design-studio`)
- Expose `isProductEnabled(product: string): boolean` utility
- Refactor `server.ts` route registration into product-scoped blocks:
  - Shared routes (auth, workspace, proofs, jobs, health, audit, notifications) — always registered
  - Docs routes — registered only when `docs` is enabled
  - Design Studio routes — registered only when `design-studio` is enabled
- Cross-product routes (e.g., doc cross-reference from canvas) — registered only when both products are enabled
- No behavioral changes — all existing routes remain registered when `ENABLED_PRODUCTS=docs`

**Acceptance Criteria:**
- `ENABLED_PRODUCTS=docs` → all current endpoints work, no Design Studio routes registered
- `ENABLED_PRODUCTS=design-studio` → shared + Design Studio routes only
- `ENABLED_PRODUCTS=docs,design-studio` → everything registered
- Existing tests pass unchanged

---

### Slice M2: Frontend Product Module Guards

**Files to create:**
- `KACHERI FRONTEND/src/modules/registry.ts`
- `KACHERI FRONTEND/src/modules/ProductGuard.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx`
- `KACHERI FRONTEND/src/components/AppLayout.tsx`

**Scope:**
- Frontend reads enabled products from a `/api/config` endpoint (or baked at build time via env var)
- `ProductGuard` component wraps product-specific routes — renders children only if product is enabled
- Navigation items (sidebar, header) conditionally rendered based on enabled products
- Attempting to navigate to a disabled product's route shows a "not available" page
- No behavioral changes for current Docs functionality

**Acceptance Criteria:**
- With `docs` enabled: all current pages work, no Design Studio nav items
- With `design-studio` enabled: Design Studio nav items visible, Docs nav items hidden
- With both: everything visible
- Direct URL to disabled product shows informational page

---

### Slice M3: Backend Config Endpoint + Build-Time Frontend Config

**Files to create:**
- `KACHERI BACKEND/src/routes/config.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register config route)
- `KACHERI FRONTEND/vite.config.ts` (expose build-time env vars)

**Scope:**
- `GET /api/config` — public endpoint returning enabled products, platform version, feature availability
- Frontend can either fetch at runtime or read from build-time `VITE_ENABLED_PRODUCTS` env var
- Config response shape:
  ```json
  {
    "products": ["docs", "design-studio"],
    "version": "1.0.0",
    "features": {
      "docs": { "enabled": true },
      "designStudio": { "enabled": true }
    }
  }
  ```

**Acceptance Criteria:**
- Config endpoint returns correct product list
- Frontend correctly reads and applies product configuration
- Disabled product routes return 404 from backend (not just hidden in UI)

---

### Phase 0 Gate

Before proceeding to Phase 1:
- [ ] Product module registry works on backend
- [ ] Frontend conditionally renders navigation and routes
- [ ] Existing Docs functionality unaffected (full regression)
- [ ] `ENABLED_PRODUCTS=docs` works as a standalone deployment
- [ ] Config endpoint serves product availability

---

## Phase 1: Backend Foundation

**Goal:** Build the persistence and API layer for canvases and frames. No frontend, no AI, no KCL — just the data backbone.

**Depends on:** Phase 0 (M1 — product registry, so routes are registered under the Design Studio module)

---

### Slice A1: Database Schema & Migration

**Files to create:**
- `KACHERI BACKEND/migrations/013_add_design_studio.sql`

**Scope:**
- Create all tables: `canvases`, `canvas_frames`, `canvas_conversations`, `canvas_versions`, `canvas_exports`
- Create all indexes
- Add proof kinds: `design:generate`, `design:edit`, `design:style`, `design:export`
- Migration runs cleanly on existing database
- Tables only created — no data, no dependencies on Docs tables

**Acceptance Criteria:**
- All tables created via migration
- Indexes verified
- Proof kinds registered
- Migration runs cleanly on existing database
- No foreign keys to Docs-specific tables (modularity)

---

### Slice A2: Canvas & Frame Store Layer

**Files to create:**
- `KACHERI BACKEND/src/store/canvases.ts`
- `KACHERI BACKEND/src/store/canvasFrames.ts`
- `KACHERI BACKEND/src/store/canvasConversations.ts`
- `KACHERI BACKEND/src/store/canvasVersions.ts`
- `KACHERI BACKEND/src/store/canvasExports.ts`

**Depends on:** A1

**Scope:**
- CanvasStore: CRUD, list by workspace, reorder frames, lock/unlock
- CanvasFrameStore: CRUD, get by canvas, reorder, update code + hash, update thumbnail
- CanvasConversationStore: append message, get by canvas (paginated), get by frame context
- CanvasVersionStore: create snapshot, list versions, get snapshot for restore
- CanvasExportStore: create, update status, list by canvas
- All stores follow existing patterns from `store/docs.ts`, `store/comments.ts`

**Acceptance Criteria:**
- All CRUD operations work
- Pagination works on list endpoints
- Frame reordering updates all affected indexes
- Version snapshots capture full canvas state

---

### Slice A3: Canvas API Routes — CRUD

**Files to create:**
- `KACHERI BACKEND/src/routes/canvases.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register under Design Studio product module)
- `Docs/API_CONTRACT.md` (add Design Studio section)

**Depends on:** A2, M1

**Scope:**
- `POST /workspaces/:wid/canvases` — create canvas
- `GET /workspaces/:wid/canvases` — list canvases (paginated, sortable)
- `GET /workspaces/:wid/canvases/:cid` — get canvas with frames
- `PATCH /workspaces/:wid/canvases/:cid` — update canvas
- `DELETE /workspaces/:wid/canvases/:cid` — delete canvas
- `GET /canvases/:cid/frames/:fid` — get frame with code
- `PUT /canvases/:cid/frames/:fid/code` — update frame code (Power Mode)
- Workspace middleware + RBAC (owner/editor/viewer per canvas)
- Routes registered only when `design-studio` product is enabled

**Acceptance Criteria:**
- All endpoints return correct responses per API contract
- RBAC enforced (viewer can read, editor can modify, owner can delete)
- Workspace scoping prevents cross-workspace access
- Frame code updates compute and store SHA256 hash
- Routes do not register when Design Studio is disabled

---

### Phase 1 Gate

Before proceeding to Phase 2:
- [ ] All 5 database tables created and indexed
- [ ] All 5 store modules operational with full CRUD
- [ ] All canvas API endpoints functional and RBAC-enforced
- [ ] API contract updated with Design Studio section
- [ ] Routes registered under product module guard

---

## Phase 2: KCL Component Library

**Goal:** Build the Kacheri Component Library — the custom elements runtime that AI-generated frame code targets. This is the narrow waist of the entire system.

**Depends on:** None (independent of Phase 1 — can be built in parallel)

**Critical path:** KCL must be complete before AI Engine (Phase 3) can generate code, and before Frontend (Phase 4) can render frames.

---

### Slice A4: KCL v1 — Core Components

**Files to create:**
- `KACHERI FRONTEND/src/kcl/kcl.ts` — runtime bootstrap, custom element registration
- `KACHERI FRONTEND/src/kcl/components/kcl-slide.ts` — frame container
- `KACHERI FRONTEND/src/kcl/components/kcl-text.ts` — typography
- `KACHERI FRONTEND/src/kcl/components/kcl-layout.ts` — flexbox/grid
- `KACHERI FRONTEND/src/kcl/components/kcl-image.ts` — image display
- `KACHERI FRONTEND/src/kcl/components/kcl-list.ts` — animated lists
- `KACHERI FRONTEND/src/kcl/components/kcl-quote.ts` — blockquote
- `KACHERI FRONTEND/src/kcl/components/kcl-metric.ts` — KPI display
- `KACHERI FRONTEND/src/kcl/components/kcl-icon.ts` — icon display
- `KACHERI FRONTEND/src/kcl/components/kcl-animate.ts` — animation wrapper
- `KACHERI FRONTEND/src/kcl/kcl.css` — base styles, reset, accessibility defaults
- `KACHERI FRONTEND/src/kcl/package.json` — standalone package metadata

**Scope:**
- KCL runtime: registers all custom elements, handles data binding from `<script data-for>` blocks
- All 10 core components with attributes, JSON data binding, accessible defaults
- Components are framework-agnostic (vanilla JS + custom elements, no React dependency)
- Error overlay for invalid prop combinations
- ARIA roles and WCAG AA contrast-safe defaults

**Acceptance Criteria:**
- All components render correctly in a standalone HTML page (no React)
- Data binding from `<script data-for>` works
- Components degrade gracefully when attributes are missing
- Error overlay shown for invalid prop combinations
- KCL builds as a standalone JS bundle
- Accessible defaults pass WCAG AA

**Dependency approval required:** Icon set (Lucide subset or custom SVG sprites) — build-time only

---

### Slice A5: KCL v1 — Data Visualization Components

**Files to create:**
- `KACHERI FRONTEND/src/kcl/components/kcl-chart.ts` — data visualization
- `KACHERI FRONTEND/src/kcl/components/kcl-table.ts` — data tables
- `KACHERI FRONTEND/src/kcl/components/kcl-timeline.ts` — timeline visualization
- `KACHERI FRONTEND/src/kcl/components/kcl-compare.ts` — before/after comparison

**Depends on:** A4

**Scope:**
- `kcl-chart`: bar, line, pie, donut, scatter, area charts with animation
- `kcl-table`: data table with sorting, alternating rows, responsive overflow
- `kcl-timeline`: vertical/horizontal timeline with nodes and connectors
- `kcl-compare`: side-by-side or slider-based before/after comparison
- All use JSON data binding, CSS custom properties for palette

**Acceptance Criteria:**
- Charts render all supported types with correct data and animation
- Tables handle varying column counts and data types
- Timeline renders with correct node positioning
- Compare slider works with touch and mouse

**Dependency decision required:** Chart rendering approach:
1. Custom SVG rendering (no dependency, full control, more effort)
2. Lightweight charting library (Chart.js ~60KB, uPlot ~30KB)
3. D3.js subset (maximum flexibility)

---

### Slice A6: KCL Build, Versioning & Distribution

**Files to create:**
- `KACHERI FRONTEND/src/kcl/build.ts` — standalone KCL bundle build script
- `KACHERI FRONTEND/src/kcl/version.ts` — version registry

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (add KCL static serving route under Design Studio module)

**Depends on:** A4, A5

**Scope:**
- Build KCL as standalone JS + CSS bundle (no React dependency)
- Version stamping: `kcl-{version}.js` and `kcl-{version}.css`
- Version registry with changelog
- Backend serving: `/kcl/{version}/kcl.js` and `/kcl/{version}/kcl.css`
- Frame HTML template auto-injects correct KCL version
- Backwards compatibility test: golden frame comparison
- Multiple KCL versions coexist on same server

**Acceptance Criteria:**
- KCL builds to standalone bundle without React
- Version-pinned serving works (`/kcl/1.0.0/kcl.js`)
- Multiple KCL versions can coexist
- Golden frame comparison catches visual regressions

---

### Phase 2 Gate

Before proceeding to Phase 3:
- [ ] All 16 KCL components render correctly in standalone HTML
- [ ] Data binding works via `<script data-for>` blocks
- [ ] KCL builds as a standalone versioned bundle
- [ ] KCL served from backend at versioned URLs
- [ ] Error overlay works for invalid component usage
- [ ] Accessibility defaults pass WCAG AA
- [ ] Chart rendering dependency approved and integrated

---

## Phase 3: AI Engine & Intelligence

**Goal:** Build the AI code generation engine, document cross-referencing, conversation persistence, and image generation capabilities.

**Depends on:** Phase 1 (A3 — API routes), Phase 2 (A4 — KCL component reference for prompt engineering)

---

### Slice B1: AI Code Generation Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/designEngine.ts`
- `KACHERI BACKEND/src/ai/designPrompts.ts`

**Depends on:** A4 (needs KCL component reference for system prompts)

**Scope:**
- `generateFrames(prompt, context)`: generate HTML/CSS/JS code using KCL components
- `editFrame(prompt, existingCode, context)`: modify existing frame code
- `styleFrames(prompt, frameCodes, context)`: restyle while preserving content
- System prompts with KCL component reference, canvas context, frame context
- Code validation: parse generated HTML, check KCL usage, validate structure
- Error recovery: retry with error context (max 2 retries)
- Streaming output for real-time preview
- Uses existing `modelRouter.ts` with new `design:*` action types

**Acceptance Criteria:**
- Generates valid HTML using KCL components from text prompts
- Edit mode preserves frame structure while applying changes
- Style mode changes visual appearance without altering content
- Code validation catches common generation errors
- Retry logic recovers from minor generation failures
- Streaming output works

---

### Slice B2: Doc Cross-Reference Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/designDocBridge.ts`

**Depends on:** None (uses existing doc store — but only functional when Docs product is enabled)

**Scope:**
- Fetch doc content by ID for AI context injection
- Extract relevant sections based on AI intent parsing
- Build provenance links: `{docId, section, textUsed, hash}`
- Support multiple docs per generation
- Sanitize doc content before injection (strip sensitive metadata, limit tokens)
- Generate `<kcl-source>` markup pointing back to source docs
- **Graceful degradation:** When Docs product is disabled, doc cross-referencing is unavailable — AI generates content without doc references, `docRefs` parameter is ignored

**Acceptance Criteria:**
- Can fetch and inject doc content into AI prompts (when Docs enabled)
- Provenance links correctly track which doc sections were used
- Multiple doc references supported per generation
- Content sanitized and token-limited
- `<kcl-source>` elements correctly point to source docs
- When Docs disabled: no errors, cross-reference silently unavailable

---

### Slice B3: Canvas Conversation API

**Files to create:**
- `KACHERI BACKEND/src/routes/canvasAi.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register under Design Studio module)
- `KACHERI BACKEND/src/types/proofs.ts` (add design proof kinds)
- `Docs/API_CONTRACT.md`

**Depends on:** A3, B1, B2

**Scope:**
- `POST /canvases/:cid/ai/generate` — generate new frames from prompt
- `POST /canvases/:cid/ai/edit` — modify existing frame(s)
- `POST /canvases/:cid/ai/style` — restyle frame(s)
- `GET /canvases/:cid/conversation` — get conversation history (paginated)
- All AI endpoints:
  - Create conversation entries (user + assistant messages)
  - Create proof packets (prompt hash, code diffs, model details)
  - Return streaming responses for real-time preview
  - Rate-limited per existing middleware
- Doc cross-referencing: when `docRefs` provided and Docs enabled, fetch and inject

**Acceptance Criteria:**
- All AI endpoints return correct responses per API contract
- Conversation history persisted and retrievable
- Proof packets created for every AI action
- Streaming works for real-time preview
- Rate limiting enforced
- Doc cross-references create provenance links (when Docs enabled)

---

### Slice B4: Canvas Version & Export API

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts`
- `Docs/API_CONTRACT.md`

**Depends on:** A3

**Scope:**
- `POST /canvases/:cid/versions` — create named version snapshot
- `GET /canvases/:cid/versions` — list versions
- `POST /canvases/:cid/versions/:vid/restore` — restore canvas to version
- `POST /canvases/:cid/export` — trigger export job
- `GET /canvases/:cid/exports/:eid` — get export status/download

**Acceptance Criteria:**
- Versions capture full canvas state (all frames, settings, order)
- Restore replaces current state with version snapshot
- Export triggers background job for heavy formats (PDF, PPTX)
- Export status trackable
- Export proof packets created

---

### Slice B5: AI Image Generation Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/imageGenerator.ts`
- `KACHERI BACKEND/src/store/canvasAssets.ts`

**Files to modify:**
- `KACHERI BACKEND/src/ai/designEngine.ts` (integrate image gen into frame generation)
- `KACHERI BACKEND/src/routes/canvasAi.ts` (add image generation endpoint)
- `KACHERI BACKEND/src/types/proofs.ts` (add `design:image` proof kind)
- `Docs/API_CONTRACT.md`
- Database migration: add `canvas_assets` table

**Depends on:** B1

**Scope:**
- `POST /canvases/:cid/ai/image` — generate image from text prompt
- Image generation via configurable provider (DALL-E 3 initially, pluggable)
- Asset storage and serving via `/canvases/:cid/assets/:assetId`
- Credit tracking per workspace
- Integration with design engine: AI can autonomously generate images during frame creation
- Proof packet for every generated image
- Asset proxy resolves `kcl-asset://` URLs

**Acceptance Criteria:**
- Image generation from text prompt works
- Generated images stored and servable
- Credit system tracks usage
- Proof packet created for each generation
- AI can autonomously generate images during frame creation
- Asset proxy resolves `kcl-asset://` URLs correctly

**Dependency:** External API (OpenAI or Stability AI) — per-call cost, configurable provider

---

### Phase 3 Gate

Before proceeding to Phase 4:
- [ ] AI generates valid HTML/CSS/JS using KCL components
- [ ] Edit and style operations work on existing frames
- [ ] Code validation + retry catches generation errors
- [ ] Streaming responses work for real-time preview
- [ ] Conversation history persisted with proof packets
- [ ] Doc cross-referencing works when Docs is enabled, degrades when disabled
- [ ] Version snapshots and export job triggering functional
- [ ] Image generation works with credit tracking
- [ ] API contract updated with all Design Studio AI endpoints

---

## Phase 4: Frontend — Simple Mode

**Goal:** Build the full Simple Mode experience — the primary interface where users interact with AI via conversation to create visual content.

**Depends on:** Phase 1 (A3 — API), Phase 2 (A6 — KCL serving), Phase 3 (B3 — conversation API)

---

### Slice C1: Frontend Types & API Layer

**Files to create:**
- `KACHERI FRONTEND/src/types/canvas.ts`
- `KACHERI FRONTEND/src/api/canvas.ts`
- `KACHERI FRONTEND/src/api/canvasAi.ts`

**Depends on:** A3, B3, B4 (API shape finalized)

**Scope:**
- TypeScript types for all canvas schemas (canvas, frame, conversation, version, export, asset)
- API client: `canvasApi` (CRUD for canvases, frames, versions, exports)
- API client: `canvasAiApi` (generate, edit, style, image, conversation)
- Streaming response handling for AI generation
- Error handling following existing `api.ts` patterns

**Acceptance Criteria:**
- All types match backend schemas
- All API functions implemented
- Streaming responses handled correctly
- No TypeScript errors

---

### Slice C2: Design Studio App Shell

**Files to create:**
- `KACHERI FRONTEND/src/DesignStudioPage.tsx`
- `KACHERI FRONTEND/src/components/studio/StudioLayout.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameThumbnail.tsx`
- `KACHERI FRONTEND/src/components/studio/studio.css`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` (add route under ProductGuard)

**Depends on:** C1, M2

**Scope:**
- DesignStudioPage: top-level page, loads canvas data
- StudioLayout: three-panel layout (rail + viewport + chat)
- FrameRail: vertical frame list with thumbnails, drag-to-reorder, add/delete
- FrameThumbnail: thumbnail display with active indicator, frame number
- Route: `/workspaces/:wid/studio/:cid` (guarded by Design Studio product module)
- Canvas title editing in header
- Mode toggle button (Simple/Power/Edit) in header
- Composition mode selector (Deck/Page/Notebook/Widget)

**Acceptance Criteria:**
- Page loads and displays canvas with frame rail
- Frame rail shows thumbnails in correct order
- Frames reorderable via drag-and-drop
- New frames can be added
- Route accessible only when Design Studio product is enabled
- Mode toggle and composition selector visible

---

### Slice C3: Frame Viewport (Iframe Renderer)

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameRenderer.tsx`
- `KACHERI FRONTEND/src/hooks/useFrameRenderer.ts`

**Depends on:** C2, A6 (KCL serving)

**Scope:**
- FrameViewport: main viewport showing the active frame
- FrameRenderer: sandboxed iframe that renders frame HTML
  - Injects frame code via `srcdoc`
  - Prepends KCL `<script>` and `<link>` tags (version-pinned)
  - Applies sandbox attributes and CSP
  - Handles load events and error detection
  - Posts data bindings via `postMessage`
- useFrameRenderer: hook managing iframe lifecycle, thumbnail capture, error state
- Thumbnail capture on successful render
- Frame navigation: prev/next buttons
- Error overlay inside iframe (doesn't crash app shell)

**Acceptance Criteria:**
- Active frame renders correctly in sandboxed iframe
- KCL components work inside iframe
- Sandbox attributes prevent unauthorized access
- Errors in frame code display error overlay
- Thumbnail captured on successful render
- Frame navigation works

**Dependency decision required:** Thumbnail capture — `html2canvas` vs `iframe.contentDocument` canvas rendering

---

### Slice C4: Conversation Panel (Simple Mode)

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/ConversationMessage.tsx`
- `KACHERI FRONTEND/src/components/studio/PromptInput.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameDiffPreview.tsx`
- `KACHERI FRONTEND/src/hooks/useCanvasConversation.ts`

**Depends on:** C2, C3, B3

**Scope:**
- ConversationPanel: chat-style panel showing conversation history
- ConversationMessage: individual message rendering (user prompt, AI response with frame previews)
- PromptInput: text input with send button, doc reference picker (when Docs enabled), frame context indicator
- FrameDiffPreview: inline before/after preview within conversation
- useCanvasConversation: hook managing conversation state, streaming AI responses
- "Show Diff" button reveals code diff (proof artifact)
- "Approve" / "Request Changes" buttons on AI-generated frames
- Streaming: AI response appears in real-time
- Doc reference picker: search and attach Kacheri Docs (conditionally available when Docs enabled)

**Acceptance Criteria:**
- Conversation displays full history
- User can submit prompts and see AI responses
- Streaming works — response appears in real-time
- Frame changes shown as visual previews
- Code diff viewable via "Show Diff"
- Approve/reject workflow functions
- Doc references attachable when Docs product is enabled
- Doc reference picker hidden when Docs product is disabled

---

### Slice C5: Presentation Mode

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/PresentationMode.tsx`
- `KACHERI FRONTEND/src/components/studio/PresenterView.tsx`

**Depends on:** C3

**Scope:**
- PresentationMode: fullscreen presentation with frame transitions
  - Keyboard navigation (arrows, space, escape)
  - Frame transitions (fade, slide, morph via CSS animations)
  - Progress indicator (dot navigation)
  - Click-to-advance
- PresenterView: separate window (via `window.open`)
  - Current frame + next frame preview + speaker notes + timer
  - Synced via BroadcastChannel

**Acceptance Criteria:**
- Fullscreen presentation mode works
- Keyboard navigation works
- Transitions animate between frames
- Presenter view opens in separate window
- Speaker notes visible in presenter view
- Timer works
- Escape exits presentation mode

---

### Phase 4 Gate — Simple Mode MVP

This is the **first usable milestone**. After Phase 4, a user can:
- Create a canvas
- Use AI to generate frames via conversation
- View rendered frames in sandboxed iframes
- Approve/reject AI changes
- Navigate and present slides
- Cross-reference Kacheri Docs (when Docs enabled)

Before proceeding to Phase 5:
- [ ] Canvas creation → AI generation → frame rendering pipeline works end-to-end
- [ ] Conversation panel with streaming AI responses functional
- [ ] Presentation mode with transitions works
- [ ] All frames render correctly with KCL components
- [ ] Proof packets created for every AI action
- [ ] Works as standalone product (Docs disabled)

---

## Phase 5: Power Mode & Export Pipeline

**Goal:** Build the advanced editing experience (code editor), all export engines, file manager integration, templates, and version history UI.

**Depends on:** Phase 4 (C2, C3 — app shell and viewport exist)

**Parallelization:** Slices D1–D10 have limited inter-dependencies. Many can be built in parallel.

---

### Slice D1: Power Mode — Code Editor

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/CodeEditor.tsx`
- `KACHERI FRONTEND/src/hooks/useCodeEditor.ts`

**Depends on:** C3

**Scope:**
- Syntax-highlighted code editor for frame HTML/CSS/JS
- KCL component autocompletion (custom extension)
- Format on save
- Basic validation (HTML parsing, KCL prop checking)
- Live preview: debounced updates to iframe on code change
- Error indicators: inline markers
- Split view layout: code left, preview right
- AI chat still accessible in Power Mode

**Acceptance Criteria:**
- Code editor renders with syntax highlighting
- KCL components have autocompletion
- Format on save works
- Live preview updates on code change (debounced)
- Errors shown inline
- Changes saved to frame store

**Dependency decision required:** CodeMirror 6 (lighter, MIT) vs Monaco (VS Code engine, heavier). Recommend CodeMirror 6.

---

### Slice D2: Export Engine — HTML Bundle & Standalone

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportHtml.ts`

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts` (wire export route)

**Depends on:** A6, B4

**Scope:**
- HTML Bundle: directory of HTML files + KCL + assets, zipped for download
- Standalone HTML: single self-contained file, fully offline
- Composition mode baked in (deck transitions or page scroll)
- Proof packet for each export

**Acceptance Criteria:**
- HTML bundle produces working static site
- Standalone HTML opens in any browser with full functionality
- KCL version matches canvas's pinned version
- Proof packet created with file hash
- Assets (images, fonts) bundled correctly

---

### Slice D3: Export Engine — PDF

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportPdf.ts`

**Depends on:** B4

**Scope:**
- Render each frame via Puppeteer (reuse existing infrastructure)
- One PDF page per frame at canvas aspect ratio
- Optional speaker notes below each page
- Background job for large canvases with WebSocket progress

**Acceptance Criteria:**
- PDF contains one page per frame with full visual fidelity
- Speaker notes included when requested
- Large canvases don't timeout (background job)
- Proof packet with per-page hash

---

### Slice D4: Export Engine — PPTX

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportPptx.ts`

**Depends on:** B4

**Scope:**
- Map KCL components to PPTX primitives (text → TextBox, image → Picture, chart → embedded image, table → PowerPoint table)
- Complex/custom elements → rasterized PNG fallback
- Speaker notes per slide, canvas theme → PPTX theme colors
- Background job for large canvases

**Acceptance Criteria:**
- PPTX opens in PowerPoint with reasonable fidelity
- Text is editable (not rasterized) where possible
- Speaker notes present on each slide
- File hash in proof packet

**Dependency decision required:** `pptxgenjs` (JS-native, MIT) vs `python-pptx` subprocess. Recommend `pptxgenjs`.

---

### Slice D5: Canvas Listing & File Manager Integration

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/CanvasCard.tsx`
- `KACHERI FRONTEND/src/components/studio/CanvasListView.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/FileManagerPage.tsx` (add canvas section — conditional on Design Studio enabled)
- `KACHERI FRONTEND/src/components/AppLayout.tsx` (add Design Studio nav item — conditional)

**Depends on:** C2, A3

**Scope:**
- CanvasCard: thumbnail, title, frame count, last edited
- CanvasListView: grid/list with create button
- File Manager integration: canvases appear alongside documents (when both products enabled) or standalone (when only Design Studio enabled)
- Navigation to Design Studio page from canvas card

**Acceptance Criteria:**
- Canvases visible in file manager (when Design Studio enabled)
- Canvas cards show thumbnail and metadata
- Create canvas flow works
- Navigation works
- When Docs disabled: file manager shows only canvases
- When Design Studio disabled: file manager shows only docs

---

### Slice D6: Speaker Notes with Tiptap

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/SpeakerNotesEditor.tsx`

**Depends on:** C2

**Scope:**
- Tiptap-based rich text editor for speaker notes per frame
- Minimal toolbar: bold, italic, bullet list, numbered list
- Auto-saves on change
- Used in presenter view (C5)

**Acceptance Criteria:**
- Rich text editing works
- Auto-saves on change
- Notes persist per frame
- Notes display in presenter view

---

### Slice D7: Canvas Versions & History UI

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/CanvasVersionsPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/CanvasVersionCard.tsx`

**Depends on:** C2, B4

**Scope:**
- CanvasVersionsPanel: list of named versions with create/restore
- CanvasVersionCard: version name, date, frame count, creator
- Create version dialog, restore confirmation dialog
- Auto-versioning: create auto-version before AI generation (safety net)

**Acceptance Criteria:**
- Version list displays correctly
- Create version captures full canvas state
- Restore replaces current canvas state
- Auto-version created before each AI generation
- Confirmation dialog for restore

---

### Slice D8: Export Engine — Video (MP4)

**Files to create:**
- `KACHERI BACKEND/src/exports/canvasExportVideo.ts`

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts` (add `mp4` to export format)
- Database: add `'mp4'` to `canvas_exports.export_format` CHECK constraint

**Depends on:** B4

**Scope:**
- Render each frame via Puppeteer as PNG sequence
- Generate transition frames between slides
- Stitch with ffmpeg into H.264 MP4
- Support 720p, 1080p, 4K resolution options
- Background job with WebSocket progress
- Proof packet with video file hash

**Acceptance Criteria:**
- MP4 plays in standard video players
- Transitions render smoothly
- Resolution options work
- Progress reported during render
- Proof packet created

**Dependency approval required:** `ffmpeg-static` npm package (MIT, ~70MB binary)

---

### Slice D9: Frame Templates — Backend

**Files to create:**
- `KACHERI BACKEND/src/store/canvasTemplates.ts`
- `KACHERI BACKEND/src/routes/canvasTemplates.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register under Design Studio module)
- `Docs/API_CONTRACT.md`
- Database migration: add `canvas_templates` table

**Depends on:** A3

**Scope:**
- CanvasTemplateStore: create, list (with tag filter), get, delete
- API routes: CRUD for templates
- Capture frame code + thumbnail + tags on save
- Copy template code into new frame on insert

**Acceptance Criteria:**
- Templates can be saved from any frame
- Template list supports tag filtering
- Templates scoped to workspace
- Inserting a template creates a new independent frame

---

### Slice D10: Frame Templates — Frontend

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/TemplateGallery.tsx`
- `KACHERI FRONTEND/src/components/studio/SaveTemplateDialog.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx` (add template options to add-frame menu)

**Depends on:** D9, C2

**Scope:**
- SaveTemplateDialog: name, tags, preview
- TemplateGallery: grid with search, tag filter, insert button
- Context menu: "Save as Template" on frames
- Add-frame menu: "Insert from Template" option

**Acceptance Criteria:**
- Save template captures name and tags
- Gallery shows workspace templates with thumbnails
- Tag filtering and search work
- Inserting from template adds new frame

---

### Phase 5 Gate

Before proceeding to Phase 6:
- [ ] Power Mode code editor with live preview works
- [ ] HTML (bundle + standalone), PDF, PPTX, and MP4 exports all functional
- [ ] File manager shows canvases (conditional on product module)
- [ ] Speaker notes editable and visible in presenter view
- [ ] Version history with create/restore works
- [ ] Frame templates save/insert pipeline works

---

## Phase 6: Edit Mode (Direct Manipulation)

**Goal:** Build the third editing mode — Edit Mode — where non-technical users can click on elements and edit their properties visually via a Properties Panel. No code knowledge required.

**Depends on:** Phase 2 (A4, A5 — all KCL components), Phase 4 (C2 — app shell)

---

### Slice F1: KCL Inspection Protocol & Selection Bridge

**Files to create:**
- `KACHERI FRONTEND/src/kcl/inspector.ts` — editable property schema per component
- `KACHERI FRONTEND/src/kcl/selection.ts` — selection state, highlight rendering, postMessage bridge

**Files to modify:**
- All KCL component files in `KACHERI FRONTEND/src/kcl/components/` (add `editableProperties` schema, selection event handlers)

**Depends on:** A4, A5

**Scope:**
- Define `KCLEditableSchema` for every KCL component (16 components)
- Implement selection visual feedback (hover outline, selection outline, component label)
- Implement postMessage bridge: element selection, property updates, highlight commands
- Click events on KCL elements trigger selection
- Property update handler: receive change → update DOM → emit change event

**Acceptance Criteria:**
- Clicking a KCL element in iframe sends selection event to parent
- Parent can send property updates that re-render the element
- Visual selection feedback (outline, label) works
- All 16 KCL components define their editable properties schema

---

### Slice F2: Properties Panel UI

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/PropertiesPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/PropertyEditors.tsx` — text, color, select, number, image, data grid
- `KACHERI FRONTEND/src/components/studio/DataGridEditor.tsx` — spreadsheet-like editor for chart/table data
- `KACHERI FRONTEND/src/components/studio/propertiesPanel.css`

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/StudioLayout.tsx` (add Properties Panel in Edit Mode)
- `KACHERI FRONTEND/src/DesignStudioPage.tsx` (wire Edit Mode state)

**Depends on:** C2, F1

**Scope:**
- PropertiesPanel: renders editable controls based on selected element's schema
- Property editors for each type: text, color (picker + swatches), select (dropdown), number (input + slider), image (upload/select), json (DataGridEditor)
- DataGridEditor: spreadsheet-like grid for chart datasets and table data
- Changes apply immediately (optimistic update)
- Each property change creates a code diff (proof model)
- Undo/redo support

**Acceptance Criteria:**
- Selecting element shows its properties in panel
- All property types have working editors
- Changes reflect immediately in frame
- DataGridEditor works for chart and table data
- Undo/redo works
- Code diffs generated for each change

**Dependency decision required:** Color picker — `react-colorful` (~2KB) or custom

---

### Slice F3: Inline Text Editing

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/InlineTextEditor.tsx`

**Depends on:** F2

**Scope:**
- Double-click `<kcl-text>` in viewport → text becomes directly editable in-place within iframe
- Mini formatting toolbar (bold, italic, color, size)
- Enter to confirm, Escape to cancel
- Changes update underlying HTML code

**Acceptance Criteria:**
- Double-click activates inline editing
- Text editable directly in frame viewport
- Formatting toolbar works
- Escape cancels, click-away or Enter confirms
- HTML code updated correctly

---

### Phase 6 Gate

Before proceeding to Phase 7:
- [ ] All 16 KCL components have editable property schemas
- [ ] Selection bridge (postMessage) works between iframe and app shell
- [ ] Properties Panel renders controls for selected element
- [ ] All property editor types work (text, color, select, number, image, json)
- [ ] Inline text editing works for `<kcl-text>` elements
- [ ] Every property change creates a proof-compatible code diff

---

## Phase 7: Polish, Security & Platform

**Goal:** Harden the system — security audit, performance optimization, real-time collaboration, mobile support, proof integration, notebook/widget modes, and testing.

**Depends on:** Phases 4–6 (C2, C3, C4 — app shell, viewport, conversation)

**Parallelization:** Most E-slices are independent and can be built in parallel.

---

### Slice E1: Frame Security Hardening

**Depends on:** C3

**Scope:**
- Audit all iframe sandbox attributes
- CSP reporting: frames log violations to console (dev) or backend (prod)
- Asset proxy: `/kcl-assets/` route resolves `kcl-asset://` references
- User code sanitization in Power Mode: warn on `fetch()`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`
- Test: verify frames cannot access parent window, cookies, localStorage, or network

**Acceptance Criteria:**
- CSP violations reported
- Asset proxy works for images and fonts
- User code sanitization warns on network access attempts
- Iframe isolation verified by test suite

---

### Slice E2: Performance Optimization

**Depends on:** C2, C3

**Scope:**
- Three-render-mode system (thumbnail / live iframe / presentation pipeline)
- Virtual frame rail for 100+ frame canvases
- Lazy KCL loading: iframe loads KCL on demand
- Debounce code editor → iframe updates (300ms)
- Memory monitoring: detect iframe memory leaks, warn user

**Acceptance Criteria:**
- Only 1-3 live iframes at any time
- Frame rail virtualizes for large canvases
- Code editor updates debounced
- Memory stays stable during long editing sessions

---

### Slice E3: Proof Integration

**Files to modify:**
- `KACHERI FRONTEND/src/ProofsPanel.tsx` (add design proof kinds)
- `KACHERI FRONTEND/src/utils/tooltipHelpers.ts` (add design tooltips)

**Depends on:** B3

**Scope:**
- `design:generate` proofs: prompt, frames created, doc refs used
- `design:edit` proofs: prompt, code diff, frame modified
- `design:style` proofs: frames restyled, before/after thumbnails
- `design:export` proofs: format, frame count, file hash
- `design:image` proofs: prompt, asset, credits used
- Proofs viewable from canvas (link from conversation panel)
- Proofs viewable from global proofs panel (filtered by canvas)

**Acceptance Criteria:**
- All design proof kinds render correctly in ProofsPanel
- Proof links from conversation panel work
- Canvas filter in global proofs panel works
- Tooltips added for design proof kinds

---

### Slice E4: Notebook Composition Mode

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/NotebookView.tsx`
- `KACHERI FRONTEND/src/components/studio/NotebookNarrative.tsx`

**Depends on:** C3, D6

**Scope:**
- NotebookView: vertical layout alternating narrative text with rendered frames
- NotebookNarrative: Tiptap-based rich text block between frames
- Narrative blocks stored as canvas metadata
- AI generates narrative text alongside frames
- Export includes narrative in HTML and PDF formats

**Acceptance Criteria:**
- Notebook mode displays frames with narrative blocks
- Narrative text editable with Tiptap
- AI generates both frames and narrative
- Export includes narrative in HTML and PDF

---

### Slice E5: Embed / Widget Mode

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/EmbedDialog.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/routes/canvases.ts` (add public embed route)

**Depends on:** C3, A3

**Scope:**
- Generate embeddable `<iframe>` snippet for single frames or full canvas
- Public embed route: `/embed/canvases/:cid` and `/embed/frames/:fid` (read-only, no auth for published embeds)
- Embed settings: published/unpublished toggle, allowed domains whitelist
- Responsive embed (auto-resizes)
- EmbedDialog: generate embed code, toggle publish state

**Acceptance Criteria:**
- Embed iframe renders frame correctly
- Published/unpublished toggle works
- Embed auto-resizes responsively
- Embed code copyable from dialog
- Unpublished embeds return 404

---

### Slice E6: Documentation & Testing

**Files to create:**
- `KACHERI BACKEND/src/store/__tests__/canvases.test.ts`
- `KACHERI BACKEND/src/ai/__tests__/designEngine.test.ts`
- `KACHERI FRONTEND/src/kcl/__tests__/kcl-components.test.ts`
- `Docs/features/beyle-design-studio.md`

**Files to modify:**
- `Docs/API_CONTRACT.md` (final review, add Design Studio to ToC)

**Depends on:** All above

**Scope:**
- Store tests: canvas/frame CRUD, version snapshots, conversation persistence
- AI engine tests: code generation validation, prompt construction, doc cross-referencing
- KCL tests: component rendering, data binding, error handling, accessibility
- User documentation: feature overview, mode guide, KCL component reference
- API contract finalization

**Acceptance Criteria:**
- All tests pass
- User docs explain feature comprehensively
- API contract complete and in ToC
- KCL component reference documented

---

### Slice E7: External Embed Whitelist

**Files to modify:**
- `KACHERI FRONTEND/src/kcl/components/kcl-embed.ts` (URL validation, whitelist check, blocked state UI)
- `KACHERI BACKEND/src/routes/canvases.ts` (workspace embed whitelist settings)
- Frame renderer CSP generation (dynamic per-frame CSP)

**Depends on:** A4

**Scope:**
- `<kcl-embed>` validates URL against whitelist before rendering
- Blocked URLs show informative message
- CSP generated per-frame (only relaxed for frames using embeds)
- Default whitelist: YouTube, YouTube-nocookie, Vimeo, Google Maps, Codepen, Loom
- Workspace-level whitelist configuration (admin customizable)

**Acceptance Criteria:**
- Whitelisted embeds render correctly
- Non-whitelisted URLs blocked with visible message
- CSP is per-frame
- Workspace admin can customize whitelist

---

### Slice E8: Real-Time Canvas Collaboration

**Files to create:**
- `KACHERI FRONTEND/src/hooks/useCanvasCollaboration.ts`
- `KACHERI FRONTEND/src/components/studio/PresenceIndicator.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameLockBadge.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/realtime/workspaceWs.ts` (canvas presence + frame lock channels)
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx` (presence avatars)
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx` (lock overlay)
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx` (real-time message sync)

**Depends on:** C2, existing WebSocket infrastructure

**Scope:**
- Canvas presence via WebSocket (who is viewing which canvas/frame)
- Frame lock acquire/release protocol
- Auto-release on disconnect or 60s inactivity
- Presence avatars on frame rail thumbnails
- Lock overlay on viewport when another user holds the lock
- Conversation messages sync in real-time
- Canvas metadata changes sync via Yjs

**Acceptance Criteria:**
- Multiple users view same canvas simultaneously
- Frame locks prevent concurrent editing
- Presence indicators show who is where
- Conversation panel syncs in real-time
- Lock auto-releases on disconnect
- Canvas metadata changes propagate to all users

---

### Slice E9: Mobile Simple Mode

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/StudioLayout.tsx` (responsive breakpoints)
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx` (horizontal mode)
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx` (swipe navigation)
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx` (mobile layout)
- `KACHERI FRONTEND/src/components/studio/studio.css` (responsive styles)
- `KACHERI FRONTEND/src/DesignStudioPage.tsx` (force Simple Mode on mobile)

**Depends on:** C2, C3, C4

**Scope:**
- Responsive layout: three-panel → stacked at <768px
- Horizontal frame rail with touch scrolling
- Swipe left/right to navigate frames
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

---

### Phase 7 Gate — Full Product Complete

After Phase 7, Beyle Design Studio is complete:
- [ ] Frame security hardened (CSP, sandbox, asset proxy, code sanitization)
- [ ] Performance optimized (three render modes, virtual rail, lazy loading)
- [ ] All proof kinds integrated into ProofsPanel
- [ ] Notebook composition mode works
- [ ] Embed/widget mode with public URLs works
- [ ] External embed whitelist works
- [ ] Real-time collaboration with frame-level locking works
- [ ] Mobile Simple Mode responsive and functional
- [ ] All tests pass
- [ ] User documentation complete
- [ ] API contract finalized

---

## Complete Dependency Graph

```
PHASE 0: Product Modularization
M1 (Backend module registry)
M2 (Frontend product guards)     } Can be built in parallel
M3 (Config endpoint)

PHASE 1: Backend Foundation (depends on M1)
M1 → A1 → A2 → A3

PHASE 2: KCL (independent — parallel with Phase 1)
A4 → A5 → A6

PHASE 3: AI Engine (depends on A3 + A4)
A4 ──→ B1 ──→ B5 (image gen)
         │
A3 ──→ B3 (conversation API, depends on B1 + B2)
         │
       B2 (doc bridge — independent, but wired into B3)
         │
A3 ──→ B4 (version/export API)

PHASE 4: Frontend Simple Mode (depends on A3 + A6 + B3)
A3 + B3 + B4 → C1 → C2 → C3 → C4
                            │
                            └→ C5 (presentation)

PHASE 5: Power Mode & Exports (depends on C2, C3, B4)
C3 ──→ D1 (code editor)
A6 + B4 → D2 (HTML export)
B4 ──→ D3 (PDF export)        } Export engines
B4 ──→ D4 (PPTX export)       } can be built
B4 ──→ D8 (video export)      } in parallel
C2 + A3 → D5 (file manager)
C2 ──→ D6 (speaker notes)
C2 + B4 → D7 (versions UI)
A3 ──→ D9 → D10 (templates)

PHASE 6: Edit Mode (depends on A4 + A5 + C2)
A4 + A5 → F1 → F2 → F3
                 ↑
                C2

PHASE 7: Polish (depends on Phases 4-6)
C3 ──→ E1 (security)
C2 + C3 → E2 (performance)
B3 ──→ E3 (proofs)
C3 + D6 → E4 (notebook mode)
C3 + A3 → E5 (embed/widget)
All ──→ E6 (docs & testing)
A4 ──→ E7 (embed whitelist)
C2 ──→ E8 (collaboration)
C2 + C3 + C4 → E9 (mobile)
```

---

## Parallelization Strategy

```
Timeline (conceptual — not to scale):

Week 1-2:    [M1]──[M2]──[M3]          ← Phase 0
             │
Week 2-3:    [A1]──[A2]──[A3]          ← Phase 1 (backend)
             │
Week 2-5:    [A4]──────[A5]──[A6]      ← Phase 2 (KCL) — PARALLEL with Phase 1
             │           │
Week 5-8:    [B1]──[B5]  │             ← Phase 3 (AI engine)
             [B2]        │
             [B3]────────┘
             [B4]
             │
Week 8-12:   [C1]──[C2]──[C3]──[C4]   ← Phase 4 (Simple Mode)
                          [C5]
                          │
Week 12-17:  [D1] [D2] [D3] [D4]      ← Phase 5 (Power Mode + Exports)
             [D5] [D6] [D7] [D8]        All largely parallel
             [D9]──[D10]
             │
Week 12-15:  [F1]──[F2]──[F3]          ← Phase 6 (Edit Mode) — PARALLEL with Phase 5
             │
Week 17-21:  [E1] [E2] [E3] [E4]      ← Phase 7 (Polish)
             [E5] [E7] [E8] [E9]        All largely parallel
             [E6] ← last (testing)
```

**Key parallelization opportunities:**
1. **Phase 1 + Phase 2** run in parallel (backend foundation + KCL have no dependencies on each other)
2. **Phase 5 + Phase 6** run in parallel (Power Mode + Edit Mode are independent)
3. **Within Phase 5:** D2/D3/D4/D8 (all export engines) are fully independent
4. **Within Phase 7:** E1/E2/E3/E4/E5/E7/E8/E9 are mostly independent

---

## Milestone Summary

| Milestone | What's Usable | Gate |
|-----------|---------------|------|
| **M0: Modular Platform** | Docs works standalone, Design Studio routes ready to receive | Phase 0 complete |
| **M1: Data Backbone** | Canvas CRUD via API, no UI | Phase 1 complete |
| **M2: Component Runtime** | KCL components render in standalone HTML | Phase 2 complete |
| **M3: AI Brain** | AI generates frame code from prompts, with proofs | Phase 3 complete |
| **M4: Simple Mode MVP** | Full create → generate → view → present flow | Phase 4 complete |
| **M5: Power User Ready** | Code editor, all exports, templates, versions | Phase 5 complete |
| **M6: Non-Coder Ready** | Visual editing via Properties Panel | Phase 6 complete |
| **M7: Production Ready** | Security hardened, performant, collaborative, mobile | Phase 7 complete |

---

## Complete Slice Inventory (46 slices)

| ID | Slice | Phase | Depends On | Effort |
|----|-------|-------|------------|--------|
| M1 | Backend Product Module Registry | 0 | — | 1-2 days |
| M2 | Frontend Product Module Guards | 0 | — | 1 day |
| M3 | Config Endpoint + Build Config | 0 | — | 0.5-1 day |
| A1 | Database Schema & Migration | 1 | M1 | 0.5 days |
| A2 | Canvas & Frame Store Layer | 1 | A1 | 2 days |
| A3 | Canvas API Routes — CRUD | 1 | A2, M1 | 2 days |
| A4 | KCL v1 — Core Components (10) | 2 | — | 4-5 days |
| A5 | KCL v1 — Data Visualization (4) | 2 | A4 | 4-5 days |
| A6 | KCL Build, Versioning & Distribution | 2 | A4, A5 | 1-2 days |
| B1 | AI Code Generation Engine | 3 | A4 | 3-4 days |
| B2 | Doc Cross-Reference Engine | 3 | — | 1-2 days |
| B3 | Canvas Conversation API | 3 | A3, B1, B2 | 2-3 days |
| B4 | Canvas Version & Export API | 3 | A3 | 1-2 days |
| B5 | AI Image Generation Engine | 3 | B1 | 3-4 days |
| C1 | Frontend Types & API Layer | 4 | A3, B3, B4 | 1 day |
| C2 | Design Studio App Shell | 4 | C1, M2 | 2-3 days |
| C3 | Frame Viewport (Iframe Renderer) | 4 | C2, A6 | 2-3 days |
| C4 | Conversation Panel (Simple Mode) | 4 | C2, C3, B3 | 3-4 days |
| C5 | Presentation Mode | 4 | C3 | 2-3 days |
| D1 | Power Mode — Code Editor | 5 | C3 | 3-4 days |
| D2 | Export Engine — HTML Bundle & Standalone | 5 | A6, B4 | 2-3 days |
| D3 | Export Engine — PDF | 5 | B4 | 1-2 days |
| D4 | Export Engine — PPTX | 5 | B4 | 2-3 days |
| D5 | Canvas Listing & File Manager Integration | 5 | C2, A3 | 1-2 days |
| D6 | Speaker Notes with Tiptap | 5 | C2 | 1 day |
| D7 | Canvas Versions & History UI | 5 | C2, B4 | 1-2 days |
| D8 | Export Engine — Video (MP4) | 5 | B4 | 3-4 days |
| D9 | Frame Templates — Backend | 5 | A3 | 1-2 days |
| D10 | Frame Templates — Frontend | 5 | D9, C2 | 1-2 days |
| F1 | KCL Inspection Protocol & Selection Bridge | 6 | A4, A5 | 3-4 days |
| F2 | Properties Panel UI | 6 | C2, F1 | 4-5 days |
| F3 | Inline Text Editing | 6 | F2 | 2-3 days |
| E1 | Frame Security Hardening | 7 | C3 | 2 days |
| E2 | Performance Optimization | 7 | C2, C3 | 2-3 days |
| E3 | Proof Integration | 7 | B3 | 1 day |
| E4 | Notebook Composition Mode | 7 | C3, D6 | 2-3 days |
| E5 | Embed / Widget Mode | 7 | C3, A3 | 2 days |
| E6 | Documentation & Testing | 7 | All | 2-3 days |
| E7 | External Embed Whitelist | 7 | A4 | 1-2 days |
| E8 | Real-Time Canvas Collaboration | 7 | C2, WebSocket | 3-4 days |
| E9 | Mobile Simple Mode | 7 | C2, C3, C4 | 2-3 days |

---

## Dependency Approval Queue

All dependencies must be approved before the slice that needs them begins.

| Dependency | Needed By | Purpose | Recommendation |
|---|---|---|---|
| Icon set (Lucide subset) | A4 | `kcl-icon` component | Build-time only, no runtime dep |
| Chart rendering library | A5 | `kcl-chart` component | uPlot (~30KB) or custom SVG |
| CodeMirror 6 | D1 | Power Mode code editor | Recommended (~150KB, MIT) |
| `pptxgenjs` | D4 | PPTX export | Recommended (JS-native, MIT) |
| `html2canvas` | C3 | Thumbnail capture | ~40KB, lazy-loaded |
| `ffmpeg-static` | D8 | Video export | ~70MB binary, MIT |
| Image gen API (OpenAI/Stability) | B5 | AI imagery | External API, per-call cost |
| Color picker (`react-colorful`) | F2 | Properties Panel | ~2KB, MIT |

---

## Product Module Independence Verification

### Docs-Only Deployment (`ENABLED_PRODUCTS=docs`)

| Subsystem | Status |
|---|---|
| Auth, workspace, RBAC | Works |
| Document editing (Tiptap + Yjs) | Works |
| AI operations (compose, rewrite, translate) | Works |
| Comments, suggestions, versions | Works |
| Import/export (PDF, DOCX) | Works |
| Extraction, compliance, clauses | Works |
| Knowledge graph, negotiations | Works |
| Proofs & provenance | Works |
| Design Studio routes | Not registered (404) |
| Design Studio nav items | Hidden |
| KCL serving | Not registered |
| Canvas API | Not registered |

### Design-Studio-Only Deployment (`ENABLED_PRODUCTS=design-studio`)

| Subsystem | Status |
|---|---|
| Auth, workspace, RBAC | Works |
| Canvas CRUD | Works |
| AI frame generation | Works |
| KCL components & serving | Works |
| Frame rendering (iframe) | Works |
| Presentation mode | Works |
| All exports (HTML, PDF, PPTX, MP4) | Works |
| Templates | Works |
| Proofs & provenance | Works (design proof kinds) |
| Doc cross-referencing | Gracefully unavailable (no Docs) |
| `<kcl-source>` references | Render as text (no navigation to Docs) |
| Document editing routes | Not registered (404) |
| Document nav items | Hidden |
| File manager | Shows canvases only (no docs) |

### Both Products (`ENABLED_PRODUCTS=docs,design-studio`)

| Subsystem | Status |
|---|---|
| Everything above | Works |
| Doc cross-referencing in Design Studio | Full functionality |
| Canvas embedding in Docs | Full functionality |
| File manager | Shows both docs and canvases |
| Knowledge graph queries from canvas AI | Works |
| Proofs panel | Shows both doc and design proof kinds |

---

## Risk Register (Roadmap-Specific)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Phase 0 modularization breaks existing Docs | High | Full regression testing before proceeding. Phase 0 is refactoring only — no new features. |
| KCL scope creep (adding components beyond the 16) | High | New components require work scope amendment. KCL does structure, CSS does styling. |
| Phase 2 (KCL) takes longer than estimated | Medium | KCL is critical path. Start early, build core components (A4) first, data viz (A5) can be descoped to MVP chart types. |
| AI code generation quality insufficient | Medium | B1 includes validation + retry. Iterate on system prompts. KCL component contracts constrain AI output. |
| Export engines (D2-D4, D8) are individually complex | Medium | Each export is independent. Ship HTML export first (simplest), then PDF (reuses Puppeteer), then PPTX (most complex), video last. |
| Product module toggle adds complexity | Low | One-time cost. Clean separation pays off immediately and for all future products. |

---

*This roadmap is the execution anchor for Beyle Design Studio. All implementation must follow the phase sequencing and dependency chains defined here. Changes to phases, slice ordering, or dependencies require explicit amendment to this document.*

*Source of truth for feature scope: `Docs/Roadmap/beyle-design-studio-work-scope.md` + Addendum A*
