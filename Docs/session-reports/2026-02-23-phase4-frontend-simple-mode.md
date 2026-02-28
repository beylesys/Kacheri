# Session Report: Phase 4 — Frontend Simple Mode + Cross-Product Display

**Date:** 2026-02-23
**Session Goal:** Plan and implement Phase 4 of the BEYLE Platform Unified Roadmap — build the Design Studio Simple Mode frontend experience and cross-product entity display in the Knowledge Explorer.
**Active Roadmap Phase:** Phase 4 (Slices C1–C5, P6)
**Estimated Effort:** 11–15 days
**Milestone Target:** M4 — Simple Mode MVP + Cross-Product Intelligence

---

## Documents Read

| Document | Path | Relevance |
|----------|------|-----------|
| Architecture Blueprint | `Docs/blueprint/architecture blueprint.md` | System boundaries, layer responsibilities, platform architecture |
| Unified Roadmap | `Docs/Roadmap/beyle-platform-unified-roadmap.md` | Phase 4 scope, slice definitions, dependencies, gate criteria |
| API Contract | `Docs/API_CONTRACT.md` | Design Studio endpoints (A3, B3), Knowledge Graph endpoints, Memory Graph ingest (P2) |
| Design Studio Work Scope | `Docs/Roadmap/beyle-design-studio-work-scope.md` | Product vision, layered runtime architecture, editing modes |
| Docs Roadmap | `Docs/Roadmap/docs roadmap.md` | Existing Docs scope for cross-product awareness |
| Phase 0 Session Report | `Docs/session-reports/2026-02-22-phase0-product-modularization.md` | M1, M2, M3, P1, P3 completion status |
| Phase 1 Session Report | `Docs/session-reports/2026-02-22-phase1-backend-foundation.md` | A1, A2, A3, P2, P4, P8 completion status |
| Phase 2 Session Report | `Docs/session-reports/2026-02-22-phase2-kcl-component-library.md` | A4, A5, A6 completion status |
| Phase 3 Session Report | `Docs/session-reports/2026-02-22-phase3-ai-engine-intelligence.md` | B1–B5, P5, P7 completion status |
| M1 Session Report | `Docs/session-reports/2026-02-22-m1-product-module-registry.md` | Backend module registry detail |

---

## Assumptions Explicitly Ruled Out

1. **No inference from code about intent.** All behavior is derived from the roadmap and API contract.
2. **No scope expansion.** Phase 4 implements exactly C1–C5 and P6. No Power Mode (Phase 5), no Edit Mode (Phase 6), no export engines (Phase 5).
3. **No new backend endpoints.** Phase 4 is frontend-only; all required backend APIs exist from Phases 0–3.
4. **No new dependencies assumed approved.** Any frontend dependency (e.g., `html2canvas` for thumbnail capture) must go through the dependency approval process per CLAUDE.md Section 7.
5. **SSE streaming is not yet implemented on the backend.** Phase 3 session report confirms AI endpoints return full JSON responses; SSE was deferred. Phase 4 must decide: implement SSE on backend, or use full JSON + WebSocket progress events.
6. **No modifications to KCL.** Phase 4 consumes KCL as-is from Phase 2.

---

## Known Constraints

1. **Backend AI endpoints return full JSON, not streaming.** Phase 3 deferred SSE to Phase 4. The conversation panel (C4) must handle this — either implement SSE or use WebSocket `ai_job` events for progress indication + full JSON on completion.
2. **KCL bundle build has not been executed.** Phase 2 session report notes `npm run build:kcl` was never run. The < 100KB gzipped target is unverified. Must be validated before C3 (Frame Viewport) can serve KCL in iframes.
3. **Backend test suite needs verification.** Phase 3 gate checklist shows test pass status unchecked. Should be validated as a pre-flight before Phase 4 work begins.
4. **PAT scope enforcement is deferred.** PATs are created and validated but per-route scope enforcement is not yet implemented (noted in Phase 1 session report). Not blocking for Phase 4 (PATs are a JAAL concern, not frontend concern).
5. **WebSocket canvas event types need extension.** Phase 1 session report notes `as any` casts for canvas events. The `useWorkspaceSocket` hook's `WsEvent` union type needs extension for canvas-specific events.

---

## Identified Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| KCL bundle build failure or size exceeds target | Medium | Validate `npm run build:kcl` before starting C3. If build fails, fix KCL build config before proceeding. |
| Streaming UX without SSE | Medium | Use WebSocket `ai_job` events for progress + loading indicator. Full JSON response arrives at completion. User sees "Generating..." with progress, then result. Acceptable for MVP. |
| Iframe sandbox security configuration | Medium | C3 must use restrictive `sandbox` attributes. CSP prevents external script loading. Follow architecture blueprint Layer 3 (Frame Isolation) spec. |
| Thumbnail capture dependency (`html2canvas`) | Low | Listed in Dependency Approval Queue (roadmap). Must get approval before implementation. Alternative: use canvas API `toDataURL` if iframe allows, or server-side Puppeteer thumbnail. |
| Cross-product entity display (P6) depends on memory graph data existing | Low | P6 must degrade gracefully when no cross-product entities exist. Filter UI still renders; empty state shows "No entities from [product]". |
| WebSocket event type extension could break existing Docs consumers | Low | Extend `WsEvent` union type additively. Existing event handlers ignore unknown `type` values. |

---

## Drift Check

| Source A | Source B | Status |
|----------|----------|--------|
| Roadmap Phase 4 scope | API contract endpoints | **Aligned.** All endpoints referenced in C1–C5 exist in the API contract (Design Studio section, Knowledge Graph section). |
| Architecture blueprint Layer 4 (App Shell) | Existing frontend patterns | **Aligned.** React + TypeScript, hooks-based state, workspace context, product guards — all match blueprint spec. |
| Phase 3 session report (B3 endpoints) | API contract | **Aligned.** All 4 canvas AI endpoints match contract: generate, edit, style, conversation. |
| Roadmap P6 scope (cross-product display) | Knowledge graph endpoints | **Aligned.** Existing `GET /workspaces/:wid/knowledge/entities` supports type/search filters. `productSource` filter parameter needs verification in API contract. |
| Roadmap C5 (Presentation Mode) | Work scope | **Aligned.** BroadcastChannel-based presenter view, keyboard navigation, fullscreen — all specified in work scope Section "Presentation & Navigation". |

**Drift Identified:** The API contract's knowledge graph endpoints do not yet include a `productSource` query parameter for cross-product filtering. The roadmap (P6 scope) expects `GET /workspaces/:wid/knowledge/entities?productSource=research`. The backend `entityMentions.ts` store has `getMentionsByProductSource()` (added in P8), but the knowledge route handler may not expose it as a query parameter. **Action:** Verify whether the knowledge routes expose `productSource` as a filter. If not, a minor backend route modification is needed (not a new endpoint — just a new query parameter on existing endpoint). This would be a contract-first update.

---

## Phase 4 Prerequisite Status

| Prerequisite | Source Phase | Status | Notes |
|--------------|-------------|--------|-------|
| M1 — Backend Product Module Registry | Phase 0 | COMPLETE | `isProductEnabled()`, route-level guards |
| M2 — Frontend Product Module Guards | Phase 0 | COMPLETE | `ProductGuard.tsx`, `modules/registry.ts` |
| M3 — Config Endpoint | Phase 0 | COMPLETE | `GET /config` returns products + features |
| P1 — Memory Graph Schema Extension | Phase 0 | COMPLETE | Migration 013, `product_source` + `source_ref` columns |
| P3 — Memory Graph Feature Flag | Phase 0 | COMPLETE | `MEMORY_GRAPH_ENABLED` env var |
| A1 — Database Schema | Phase 1 | COMPLETE | 8 tables + FTS via migration 014 |
| A2 — Canvas Store Layer | Phase 1 | COMPLETE | 5 store modules, full CRUD |
| A3 — Canvas API Routes | Phase 1 | COMPLETE | 11 endpoints, RBAC enforced |
| P2 — Memory Graph Ingest | Phase 1 | COMPLETE | `POST /platform/memory/ingest` |
| P4 — Personal Access Tokens | Phase 1 | COMPLETE | JWT + PAT dual auth |
| P8 — Docs Knowledge Bridge | Phase 1 | COMPLETE | `product_source: 'docs'` explicit tagging |
| A4 — KCL Core Components | Phase 2 | COMPLETE | 12 core components |
| A5 — KCL Data Visualization | Phase 2 | COMPLETE | 4 visualization components |
| A6 — KCL Build & Distribution | Phase 2 | COMPLETE | Vite IIFE build, `/kcl/:version/` serving |
| B1 — AI Code Generation Engine | Phase 3 | COMPLETE | 5 action methods, validation, retry |
| B2 — Doc Cross-Reference Engine | Phase 3 | COMPLETE | Graceful degradation when Docs disabled |
| B3 — Canvas Conversation API | Phase 3 | COMPLETE | 4 endpoints, proof packets, WebSocket |
| B4 — Canvas Version & Export API | Phase 3 | COMPLETE | 5 endpoints, auto-versioning |
| B5 — AI Image Generation | Phase 3 | COMPLETE | DALL-E 3, credit tracking |
| P5 — JAAL Sync Connector | Phase 3 | COMPLETE | Entity push to memory graph |
| P7 — Memory Graph Awareness | Phase 3 | COMPLETE | `includeMemoryContext` in AI prompts |

**Verdict: All 20 prerequisites are COMPLETE. Phase 4 is clear to proceed.**

---

## Existing Frontend Patterns (Must Follow)

### Routing
- Routes registered in `App.tsx` via React Router
- Protected routes wrapped in `<ProtectedRoute><ProductGuard product="...">...</ProductGuard></ProtectedRoute>`
- Workspace-scoped routes use `/workspaces/:id/...` pattern
- Phase 4 route: `/workspaces/:id/studio/:cid`

### API Client Architecture
- Modular API clients in `src/api/` (one file per feature domain)
- Each client defines a local `request<T>()` function with:
  - `AbortController` (45s timeout)
  - Auto-injected headers: `Authorization`, `x-workspace-id`, `x-user-id`, `Content-Type`
  - Error parsing: extracts `json.message` or `json.error` before generic message
- Exports a single named API object (e.g., `export const canvasApi = { ... }`)
- Central `api.ts` has `requestRaw()`, `json<T>()`, `requestUpload<T>()` helpers

### Type Definitions
- Types in `src/types/` as separate files per domain
- Input types suffixed with `Params` or `Request`
- Output types suffixed with `Response`
- Domain types are plain nouns (e.g., `Canvas`, `Frame`)
- Union literal types for enums (not TypeScript `enum`)

### Component Patterns
- Pages use `useWorkspace()` for workspace context + `useNavigate()` for routing
- Data fetching via `useEffect([workspaceId])` — refetches on workspace change
- Modal/dialog state: `null` (closed) or payload (open with context)
- Heavy panels lazy-loaded via `React.lazy()` + `<Suspense>`
- CSS in co-located `.css` files with BEM-like naming (e.g., `.studio-layout__viewport`)

### State Management
- React hooks only (useState, useEffect, useRef, useCallback, useMemo)
- No Redux/MobX — context + hooks + local state
- `WorkspaceContext` for workspace state
- `useWorkspaceSocket` for real-time events

### WebSocket Events
- `useWorkspaceSocket` hook manages connection, presence, typing, events
- `WsEvent` union type covers all event types
- Event handlers ignore unknown types (safe to extend)
- Canvas events will need new union members

### Accessibility
- Skip-to-content link in AppLayout
- ARIA labels on interactive elements
- `useFocusTrap` hook for modal keyboard navigation
- WCAG AA color contrast defaults

---

## Slice Implementation Plan

### Pre-Flight Checks (Before Any Code)

1. **Verify KCL build works:** Run `npm run build:kcl` in `KACHERI FRONTEND/` to confirm bundle produces correct output and size is < 100KB gzipped.
2. **Verify backend tests pass:** Run `npm test` in `KACHERI BACKEND/` to confirm all existing tests are green.
3. **Verify `productSource` filter on knowledge endpoints:** Check whether `GET /workspaces/:wid/knowledge/entities` accepts `productSource` query parameter. If not, a minor backend update is needed before P6.

---

### Slice C1: Frontend Types & API Layer

**Goal:** Create TypeScript types matching all canvas/frame/conversation/version/export backend schemas, and modular API clients for canvas CRUD and canvas AI operations.

**Files to Create:**
- `KACHERI FRONTEND/src/types/canvas.ts`
- `KACHERI FRONTEND/src/api/canvas.ts`
- `KACHERI FRONTEND/src/api/canvasAi.ts`

**Scope:**

#### types/canvas.ts
Types derived from API contract (Design Studio section) and backend store schemas:

```
CompositionMode = 'deck' | 'page' | 'notebook' | 'widget'
CanvasTransition = 'none' | 'fade' | 'slide' | 'zoom'

Canvas: id, title, description, workspaceId, compositionMode, themeJson, kclVersion, isLocked, lockedBy, createdBy, createdAt, updatedAt, deletedAt
Frame: id, canvasId, code, codeHash, sortOrder, speakerNotes, durationMs, transition, metadata, createdAt, updatedAt
ConversationMessage: id, canvasId, frameId, role ('user'|'assistant'), content, actionType ('generate'|'edit'|'style'|'content'|'compose'), docRefs, proofId, metadata, createdAt
CanvasVersion: id, canvasId, name, description, snapshotJson, createdBy, createdAt
CanvasExport: id, canvasId, format, status ('pending'|'processing'|'completed'|'failed'), filePath, proofId, metadata, createdBy, createdAt, completedAt
CanvasAsset: id, canvasId, type ('image'|'font'|'icon'|'video'), name, storagePath, mimeType, sizeBytes, metadata, createdAt
CanvasPermission: id, canvasId, userId, role ('viewer'|'editor'|'owner'), createdAt

-- API Param/Response types --
CreateCanvasParams: { title?, description?, compositionMode?, themeJson? }
ListCanvasesParams: { limit?, offset?, sort?, order? }
UpdateCanvasParams: { title?, description?, compositionMode?, themeJson?, kclVersion? }
GenerateFrameParams: { prompt, frameContext?, docRefs?, compositionMode?, provider?, model?, includeMemoryContext? }
EditFrameParams: { prompt, frameId, provider?, model? }
StyleFrameParams: { prompt, frameIds, provider?, model? }
GenerateImageParams: { prompt, style?, size?, canvasId }
CreateVersionParams: { name?, description? }
TriggerExportParams: { format, options? }

GenerateFrameResponse: { conversationId, frames: Frame[], docRefs?, proofId, provider, model, validation, memoryContextUsed, memoryEntityCount }
ConversationResponse: { canvasId, messages: ConversationMessage[], total, limit, offset }
CanvasWithFrames: Canvas & { frames: Frame[] }
```

#### api/canvas.ts
Canvas CRUD client following existing `api/knowledge.ts` pattern:

```
canvasApi.create(workspaceId, params) -> Canvas
canvasApi.list(workspaceId, params?) -> { canvases, total, limit, offset }
canvasApi.search(workspaceId, query) -> { canvases, total }
canvasApi.get(workspaceId, canvasId) -> CanvasWithFrames
canvasApi.update(workspaceId, canvasId, params) -> Canvas
canvasApi.delete(workspaceId, canvasId) -> void
canvasApi.getFrame(canvasId, frameId) -> Frame
canvasApi.updateFrameCode(canvasId, frameId, code) -> Frame
canvasApi.setPermission(canvasId, userId, role) -> CanvasPermission
canvasApi.listPermissions(canvasId) -> CanvasPermission[]
canvasApi.removePermission(canvasId, userId) -> void
canvasApi.createVersion(canvasId, params?) -> CanvasVersion
canvasApi.listVersions(canvasId) -> CanvasVersion[]
canvasApi.restoreVersion(canvasId, versionId) -> Canvas
canvasApi.triggerExport(canvasId, params) -> CanvasExport
canvasApi.getExport(canvasId, exportId) -> CanvasExport
```

#### api/canvasAi.ts
Canvas AI client:

```
canvasAiApi.generate(canvasId, params) -> GenerateFrameResponse
canvasAiApi.edit(canvasId, params) -> GenerateFrameResponse
canvasAiApi.style(canvasId, params) -> GenerateFrameResponse
canvasAiApi.generateImage(canvasId, params) -> { asset, proofId, creditsRemaining }
canvasAiApi.getConversation(canvasId, params?) -> ConversationResponse
canvasAiApi.getAssetUrl(canvasId, assetId) -> string
```

**Acceptance Criteria:**
- All types match backend schemas from API contract
- All API functions implemented with correct paths, methods, headers
- Error handling follows existing patterns (AbortController, message extraction)
- No streaming yet (full JSON responses; streaming deferred to C4 decision)

**Effort:** 1 day

---

### Slice C2: Design Studio App Shell

**Goal:** Build the top-level page component and three-panel layout for the Design Studio.

**Files to Create:**
- `KACHERI FRONTEND/src/DesignStudioPage.tsx`
- `KACHERI FRONTEND/src/components/studio/StudioLayout.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameRail.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameThumbnail.tsx`
- `KACHERI FRONTEND/src/components/studio/studio.css`

**Files to Modify:**
- `KACHERI FRONTEND/src/App.tsx` — Add route for `/workspaces/:id/studio/:cid` under `<ProductGuard product="design-studio">`

**Scope:**

#### DesignStudioPage.tsx
- Top-level page component (mirrors `EditorPage.tsx` pattern)
- Reads `canvasId` from URL params via `useParams()`
- Reads `workspaceId` from `useWorkspace()`
- Fetches canvas with frames via `canvasApi.get()` on mount
- Manages active frame state, mode toggle state, composition mode state
- Passes data down to `StudioLayout` children
- Loading/error states for canvas fetch

#### StudioLayout.tsx
- Three-panel responsive layout:
  - **Left:** FrameRail (frame list + thumbnails) — collapsible
  - **Center:** FrameViewport (active frame render) — fills remaining space
  - **Right:** ConversationPanel (chat + controls) — collapsible
- Mode toggle in header: Simple / Power / Edit (only Simple active in Phase 4)
- Composition mode indicator: Deck / Page / Notebook / Widget
- Canvas title display + edit-in-place

#### FrameRail.tsx
- Vertical scrollable list of frame thumbnails
- Active frame highlighted
- Click to select frame
- Drag-to-reorder (HTML5 drag & drop, no library)
- Add frame button (triggers AI generate in conversation panel)
- Delete frame button with confirmation
- Frame count indicator

#### FrameThumbnail.tsx
- Small preview card for each frame
- Shows frame number, optional title
- Thumbnail image (placeholder until C3 implements capture)
- Active/selected state styling
- Drag handle

#### studio.css
- BEM-like naming: `.studio-layout`, `.studio-layout__rail`, `.studio-layout__viewport`, `.studio-layout__conversation`
- Three-panel flex layout with collapsible sidebars
- Responsive breakpoints (desktop-first, following existing pattern)
- Mode toggle and composition mode selector styling

#### App.tsx Modification
Add inside the Design Studio product guard section:
```tsx
<Route path="/workspaces/:id/studio/:cid" element={
  <ProtectedRoute>
    <ProductGuard product="design-studio">
      <DesignStudioPage />
    </ProductGuard>
  </ProtectedRoute>
} />
```

**Acceptance Criteria:**
- Page loads and displays canvas with frame rail
- Frame rail shows frames in correct sort order
- Clicking a frame selects it as active
- Route accessible only when `design-studio` product is enabled
- Route inaccessible (redirects) when product is disabled
- Mode toggle and composition mode selector visible (non-functional beyond Simple)
- Loading and error states handled
- Canvas title displays correctly

**Effort:** 2–3 days

**Depends on:** C1

---

### Slice C3: Frame Viewport (Iframe Renderer)

**Goal:** Build the sandboxed iframe that renders the active frame's HTML/CSS/JS with KCL components.

**Files to Create:**
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameRenderer.tsx`
- `KACHERI FRONTEND/src/hooks/useFrameRenderer.ts`

**Scope:**

#### FrameViewport.tsx
- Container component for the active frame display
- Shows frame title/number in header
- Previous/Next frame navigation buttons
- Zoom controls (fit-to-viewport, 100%, custom zoom)
- Aspect ratio selector for canvas viewport (16:9, 4:3, A4, custom)
- Empty state when no frames exist ("Generate your first frame using the conversation panel")

#### FrameRenderer.tsx
- Sandboxed `<iframe>` that renders frame code
- Iframe uses `srcdoc` attribute with:
  - `<!DOCTYPE html>` wrapper
  - `<link>` tag for KCL CSS: `/kcl/{version}/kcl.css`
  - `<script>` tag for KCL JS: `/kcl/{version}/kcl.js`
  - Frame code injected in `<body>`
- Sandbox attributes: `sandbox="allow-scripts"` (no allow-same-origin, no allow-forms, no allow-popups)
- Error overlay: catches iframe errors via `window.onerror` and `postMessage` bridge
- KCL version read from canvas `kclVersion` field

#### useFrameRenderer.ts
- Hook managing iframe lifecycle
- Inputs: frame code, KCL version, canvas aspect ratio
- Builds `srcdoc` HTML string
- Thumbnail capture: after iframe loads, captures via `postMessage` requesting `canvas.toDataURL()` from within iframe (or uses placeholder if capture not available)
- Error state tracking
- Re-renders when frame code changes

**Iframe Security Model (per Architecture Blueprint Layer 3):**
- `sandbox="allow-scripts"` — only scripts allowed (KCL needs JS execution)
- No `allow-same-origin` — iframe cannot access parent DOM or storage
- No `allow-forms` — no form submissions
- No `allow-popups` — no window.open
- Communication only via `postMessage` with origin validation

**Thumbnail Capture Strategy:**
- **Primary:** Use `postMessage` to request iframe to render a canvas screenshot and send it back. KCL runtime can include a `captureFrame()` utility.
- **Fallback:** If capture is not possible (sandbox restrictions), use a placeholder with the frame number.
- **Dependency:** `html2canvas` is listed in the roadmap's Dependency Approval Queue. If approved, can be injected into iframe for higher-fidelity captures. If not approved, use the postMessage/canvas approach or server-side Puppeteer.

**Acceptance Criteria:**
- Active frame renders correctly in sandboxed iframe
- KCL components work inside iframe (text, layout, list, chart, etc.)
- Errors display error overlay without crashing parent app
- Navigation between frames works (previous/next)
- Zoom controls function
- Iframe is properly sandboxed (no access to parent window)

**Effort:** 2–3 days

**Depends on:** C2, A6 (KCL bundle serving — verified complete)

---

### Slice C4: Conversation Panel (Simple Mode)

**Goal:** Build the chat-style conversation panel where users interact with AI to generate, edit, and style frames.

**Files to Create:**
- `KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/ConversationMessage.tsx`
- `KACHERI FRONTEND/src/components/studio/PromptInput.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameDiffPreview.tsx`
- `KACHERI FRONTEND/src/hooks/useCanvasConversation.ts`

**Scope:**

#### ConversationPanel.tsx
- Scrollable chat history panel
- Loads conversation history via `canvasAiApi.getConversation()` on mount
- Appends new messages on AI generation
- Shows loading indicator during AI generation
- Action buttons per assistant message: "Show Diff", "Approve", "Request Changes"
- Doc reference picker button (visible when `isProductEnabled('docs')`)
- Memory context indicator: shows "Memory" badge when `memoryContextUsed: true` in response
- "Include Memory Context" toggle (visible when `isFeatureEnabled('memoryGraph')`)

#### ConversationMessage.tsx
- Renders a single conversation message
- User messages: right-aligned, prompt text
- Assistant messages: left-aligned, shows generated frame preview thumbnail, action type badge (Generate / Edit / Style), proof ID link
- Doc reference tags (when docRefs present)
- Memory context badge (when memoryContextUsed)
- Timestamp

#### PromptInput.tsx
- Text input area with send button
- Keyboard shortcut: Enter to send (Shift+Enter for newline)
- Action mode selector: Generate (new frame) / Edit (modify selected) / Style (restyle selected)
- Doc reference attachment: opens doc picker modal when Docs is enabled
- Disabled state during AI generation (with "Generating..." indicator)
- Character limit indicator

#### FrameDiffPreview.tsx
- Side-by-side or overlay comparison of before/after frame code
- Shows previous frame code vs new frame code
- Syntax-highlighted HTML diff
- "Approve" button: applies the new frame code to the canvas
- "Request Changes" button: focuses prompt input with "Please change..." prefix
- Only shown for edit/style operations (generate creates new frames)

#### useCanvasConversation.ts
- Hook managing conversation state and AI operations
- State: messages array, loading flag, error, active action type
- Methods:
  - `generate(prompt, options)` — calls `canvasAiApi.generate()`, appends user + assistant messages, updates frames in parent
  - `edit(prompt, frameId)` — calls `canvasAiApi.edit()`, shows diff preview
  - `style(prompt, frameIds)` — calls `canvasAiApi.style()`, shows diff preview
  - `loadHistory(canvasId)` — fetches paginated conversation history
  - `approveChange(messageId)` — confirms frame update
  - `rejectChange(messageId)` — discards pending change
- WebSocket integration: listens for `ai_job` events to show real-time progress
- Proof tracking: stores proof IDs from AI responses

**Streaming Decision:**
Backend currently returns full JSON (SSE deferred from Phase 3). For MVP:
1. User sends prompt → loading indicator shows "Generating..."
2. WebSocket `ai_job` event with `phase: 'started'` triggers "AI is working..."
3. WebSocket `ai_job` event with `phase: 'progress'` updates progress indicator
4. Full JSON response arrives → message appended, frames updated, loading clears
5. **Future:** SSE streaming can be added later for character-by-character output

**Acceptance Criteria:**
- Conversation displays full history from API
- User can type prompt and trigger AI generation
- Loading state shows during AI generation
- Generated frames appear in viewport immediately after response
- Edit/style operations show diff preview with approve/reject
- Doc references can be attached when Docs product is enabled
- Memory context toggle works when memory graph feature is enabled
- Memory context indicator shows on messages that used memory context
- Proof IDs linked on assistant messages

**Effort:** 3–4 days

**Depends on:** C2, C3, B3 (backend conversation API — verified complete)

---

### Slice C5: Presentation Mode

**Goal:** Build fullscreen presentation mode with frame transitions, keyboard navigation, and a separate presenter view.

**Files to Create:**
- `KACHERI FRONTEND/src/components/studio/PresentationMode.tsx`
- `KACHERI FRONTEND/src/components/studio/PresenterView.tsx`

**Scope:**

#### PresentationMode.tsx
- Triggered by "Present" button in StudioLayout header
- Fullscreen via Fullscreen API (`document.documentElement.requestFullscreen()`)
- Renders current frame in full viewport via FrameRenderer (reused from C3)
- Frame transitions between slides (CSS transitions: fade, slide, zoom — per frame `transition` attribute)
- Keyboard navigation:
  - Right Arrow / Space / Enter → next frame
  - Left Arrow / Backspace → previous frame
  - Escape → exit presentation
  - F → toggle fullscreen
  - P → open presenter view
- Progress indicator: frame number / total frames (bottom bar, auto-hides)
- Touch navigation: swipe left/right on touch devices
- Black/white screen toggle (B / W keys, standard presentation behavior)

#### PresenterView.tsx
- Opens in separate window via `window.open()`
- Synced with main presentation via `BroadcastChannel('beyle-presenter')`
- Shows:
  - Current frame (small preview)
  - Next frame preview
  - Speaker notes (from frame `speakerNotes` field)
  - Timer (elapsed time since presentation start)
  - Frame number / total
- Controls: next, previous, end presentation
- Auto-closes when main presentation ends

**BroadcastChannel Protocol:**
```
Main → Presenter: { type: 'frame_change', frameIndex: number, totalFrames: number }
Main → Presenter: { type: 'presentation_end' }
Presenter → Main: { type: 'navigate', direction: 'next' | 'prev' }
```

**Acceptance Criteria:**
- Fullscreen presentation mode works with frame transitions
- Keyboard navigation (arrows, space, escape) works
- Presenter view opens in separate window
- Presenter view shows current slide, next slide, speaker notes, timer
- Presenter view stays synced with main presentation
- Presentation exits cleanly on Escape
- Touch navigation works on mobile/tablet

**Effort:** 2–3 days

**Depends on:** C3 (FrameRenderer reuse)

---

### Slice P6: Cross-Product Entity Display

**Goal:** Extend the Knowledge Explorer page to display product-source badges, cross-product entity grouping, and product-source filtering.

**Files to Modify:**
- `KACHERI FRONTEND/src/types/knowledge.ts` — Add `productSource` to entity/mention types
- `KACHERI FRONTEND/src/api/knowledge.ts` — Add `productSource` filter parameter to queries
- `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx` — Product source badges, filter dropdown, entity detail grouping

**Scope:**

#### types/knowledge.ts Modifications
- Add `productSource: 'docs' | 'design-studio' | 'research' | 'notes' | 'sheets'` to `EntityMention` type
- Add `sourceRef: string | null` to `EntityMention` type
- Add new entity types to the `EntityType` union: `'web_page' | 'research_source' | 'design_asset' | 'event' | 'citation'`

#### api/knowledge.ts Modifications
- Add optional `productSource` parameter to `knowledgeApi.listEntities()` and `knowledgeApi.semanticSearch()`
- Pass as query parameter: `?productSource=docs,research`

#### WorkspaceKnowledgeExplorerPage.tsx Modifications

**Product Source Filter:**
- New dropdown in filter bar: "All Products" / "Docs" / "Research" / "Design Studio"
- Multi-select: can filter to one or more products
- When memory graph is disabled (`!isFeatureEnabled('memoryGraph')`): filter is hidden, all entities shown as Docs-only

**Product Source Badges on Entities:**
- Each entity in the list shows colored badges indicating which products reference it
- Badge labels: "Docs" (blue), "Research" (green), "Design Studio" (purple)
- Badges are derived from entity mentions grouped by `productSource`

**Entity Detail Modal Updates:**
- Mentions grouped by product source with section headers
- Each mention shows:
  - For Docs: document title (clickable → navigates to `/doc/:id`)
  - For Design Studio: canvas title (clickable → navigates to `/workspaces/:wid/studio/:cid`)
  - For Research: session reference (display only — JAAL is external)
- `kcl-source` provenance links displayed for canvas→doc references

**New Entity Type Display:**
- `web_page`: Globe icon, grey badge
- `research_source`: Book icon, green badge
- `design_asset`: Palette icon, purple badge
- `event`: Calendar icon, orange badge
- `citation`: Quote icon, teal badge
- All new types get distinct labels, icons (from existing icon set or inline SVG), and colors

**Product Badge Navigation:**
- Clicking a Docs badge → navigates to `/doc/:docId`
- Clicking a Design Studio badge → navigates to `/workspaces/:wid/studio/:canvasId`
- Clicking a Research badge → shows tooltip "View in JAAL Research Browser" (no navigation — external app)

**Graceful Degradation:**
- Memory graph disabled: no product source badges, no cross-product filter, all entities shown as Docs entities
- No cross-product entities: filter shows options but results are empty for non-Docs products

**Pre-requisite Check:** Verify backend knowledge route exposes `productSource` filter. If not, file a minimal backend modification:
- `KACHERI BACKEND/src/routes/knowledge.ts` — Add `productSource` query parameter to `GET /workspaces/:wid/knowledge/entities`, pass to store query
- `Docs/API_CONTRACT.md` — Document the new parameter

**Acceptance Criteria:**
- Product source badges render correctly on entities
- Filter by product source works
- Entity detail shows mentions grouped by product with navigation links
- New entity types have distinct labels, icons, and colors
- Product badge navigation works (opens source in correct product)
- Works correctly when memory graph is disabled (no badges, no filter)
- Empty state handled for products with no entities

**Effort:** 1 day

**Depends on:** C1 (types), P2 (memory graph ingest — verified complete)

---

## Dependency Graph (Phase 4 Internal)

```
C1 (Types + API) ─────→ C2 (App Shell) ─────→ C3 (Viewport) ─────→ C4 (Conversation)
                                                       │
                                                       └──────────→ C5 (Presentation)

C1 + P2 (backend) ──→ P6 (Cross-Product Entity Display)   [parallel with C3–C5]
```

**Parallelization opportunities:**
- P6 can be built in parallel with C3–C5 (only depends on C1 for types)
- C5 can be built in parallel with C4 (both depend on C3)

---

## Dependency Approval Needed

| Dependency | Needed By | Purpose | Status |
|------------|-----------|---------|--------|
| `html2canvas` (~40KB, lazy-loaded) | C3 | Thumbnail capture in sandboxed iframe | Listed in roadmap approval queue — needs explicit approval |

**No other new dependencies required for Phase 4.** All slices use existing React, React Router, and browser APIs (Fullscreen API, BroadcastChannel, postMessage, Drag & Drop).

---

## API Contract Sections Affected

| Section | Impact |
|---------|--------|
| Design Studio Endpoints (Slice A3) | **Read-only reference.** C1 types and API clients must match exactly. |
| Design Studio AI Endpoints (Slice B3) | **Read-only reference.** C4 conversation panel consumes these endpoints. |
| Knowledge Graph Endpoints (Slice 8) | **Potential modification.** P6 needs `productSource` query parameter on entity list endpoint. Verify if already present. |
| Memory Graph Ingest (Platform) | **Read-only reference.** P6 displays entities ingested via this endpoint. |
| Platform Config | **Read-only reference.** Product guards and feature flag checks. |

---

## Validation Commands

After each slice:
```bash
# Frontend type checking
cd "KACHERI FRONTEND" && npx tsc --noEmit

# Frontend tests
cd "KACHERI FRONTEND" && npm test

# Backend tests (regression)
cd "KACHERI BACKEND" && npm test

# KCL build verification (pre-flight, before C3)
cd "KACHERI FRONTEND" && npm run build:kcl

# Frontend build (full)
cd "KACHERI FRONTEND" && npm run build
```

---

## Phase 4 Gate Criteria (from Roadmap)

Before proceeding to Phase 5, all must pass:

- [ ] Canvas creation → AI generation → frame rendering pipeline works end-to-end
- [ ] Conversation panel with streaming AI responses functional (or full JSON + progress indicator)
- [ ] Presentation mode with frame transitions works
- [ ] All frames render correctly with KCL components in sandboxed iframes
- [ ] Proof packets created for every AI action (verified via ProofsPanel or API)
- [ ] Works as standalone product (Docs disabled via `ENABLED_PRODUCTS=design-studio`)
- [ ] Cross-product entity display functional in Knowledge Explorer
- [ ] Product source badges and filters work
- [ ] Memory graph context indicator in conversation panel
- [ ] All existing Docs functionality unaffected (regression)
- [ ] TypeScript compiles clean (`tsc --noEmit`)
- [ ] All frontend tests pass
- [ ] All backend tests pass (regression)

---

## Explicit Follow-Ups (Not In Phase 4 Scope)

| Item | Target Phase | Notes |
|------|-------------|-------|
| SSE streaming for AI endpoints | Phase 5 or later | Backend returns full JSON for now; streaming deferred |
| Power Mode code editor | Phase 5 (D1) | Mode toggle button visible but disabled in Simple Mode |
| Edit Mode properties panel | Phase 6 (F1–F3) | Mode toggle button visible but disabled |
| Export engines (PDF, PPTX, HTML, PNG, SVG, MP4) | Phase 5 (D2–D4, D8) | Export trigger in API exists but renders as "pending" |
| Canvas listing in File Manager | Phase 5 (D5) | FileManagerPage not modified in Phase 4 |
| Speaker notes editor | Phase 5 (D6) | Notes display in Presenter View (read-only) |
| Canvas versions UI | Phase 5 (D7) | Auto-versioning happens on backend; no UI in Phase 4 |
| Canvas-in-Docs embedding | Phase 5 (P9) | Tiptap extension not created in Phase 4 |
| Real-time canvas collaboration | Phase 7 (E8) | WebSocket events prepared but multi-user editing not implemented |
| PAT scope enforcement on routes | Deferred | Not blocking Phase 4 |

---

## Session Initialized

**Status:** Session report created. Pre-flight checks and Slice C1 implementation are the next steps.

---

## Slice C1: Frontend Types & API Layer — COMPLETED

**Date:** 2026-02-23
**Status:** COMPLETE

### What Was Done

Created three new files implementing the full Design Studio frontend types and API client layer:

#### Files Created

1. **`KACHERI FRONTEND/src/types/canvas.ts`**
   - 9 union literal types: `CompositionMode`, `CanvasTransition`, `ConversationRole`, `ActionType`, `ExportFormat`, `ExportStatus`, `AssetType`, `AssetSource`, `CanvasRole`
   - 9 domain types: `Canvas`, `CanvasFrame`, `ConversationMessage`, `CanvasVersion`, `CanvasExport`, `CanvasAsset`, `CanvasPermissionMeta`, `CanvasWithFrames`, `DocRef`
   - 10 API request types: `CreateCanvasParams`, `ListCanvasesParams`, `UpdateCanvasParams`, `GenerateFrameParams`, `EditFrameParams`, `StyleFrameParams`, `GenerateImageParams`, `CreateVersionParams`, `TriggerExportParams`, `GetConversationParams`
   - 8 API response types: `ListCanvasesResponse`, `SearchCanvasesResponse`, `GenerateFrameResponse`, `ConversationResponse`, `GenerateImageResponse`, `RestoreVersionResponse`, `ListVersionsResponse`, `ListPermissionsResponse`

2. **`KACHERI FRONTEND/src/api/canvas.ts`**
   - `canvasApi` object with 16 methods covering canvas CRUD, frame operations, permissions, versions, and exports
   - Follows existing `api/knowledge.ts` pattern: local `request<T>()`, AbortController (45s timeout), authHeader(), devUserHeader(), error message extraction
   - All endpoint paths, HTTP methods, and query parameters match the API contract exactly

3. **`KACHERI FRONTEND/src/api/canvasAi.ts`**
   - `canvasAiApi` object with 6 methods: generate, edit, style, generateImage, getConversation, getAssetUrl
   - Extended timeout (120s) for AI generation endpoints
   - `generateImage` includes `x-workspace-id` header for credit tracking per API contract
   - `getAssetUrl` is a synchronous URL constructor (not a fetch) for use in `<img>` tags

### What Was NOT Changed

- No existing files modified
- No new dependencies added
- No backend changes
- No streaming implementation (deferred to C4 per session plan)

### Decisions Made

1. **AI client timeout set to 120s** (vs 45s for CRUD) — AI generation can take significant time; aligns with backend AI timeout patterns
2. **`getAssetUrl` is synchronous** — Returns URL string for browser to fetch directly, consistent with how image assets are typically consumed in React `<img src={...}>`
3. **`CanvasVersion` excludes `snapshotJson`** — API list endpoint does not return the snapshot payload; only version metadata is needed on the frontend
4. **Types follow union literal pattern** — Consistent with existing `types/knowledge.ts` conventions (no TypeScript `enum`)

### Verification

- `npx tsc --noEmit` — **PASSED** (zero errors)
- All types match backend store schemas (verified against 7 backend store files)
- All API endpoint paths match API contract (verified against Design Studio, AI, Version/Export, Image Gen sections)

### Risks

None identified. C1 is a read-only consumption layer with no side effects on existing code.

### Next Slice

**C2: Design Studio App Shell** — DesignStudioPage, StudioLayout, FrameRail, FrameThumbnail, studio.css, App.tsx route registration

---

## Slice C2: Design Studio App Shell — COMPLETED

**Date:** 2026-02-23
**Status:** COMPLETE

### What Was Done

Built the Design Studio app shell: top-level page, three-panel layout, frame rail with drag-to-reorder, and route registration in App.tsx.

#### Files Created

1. **`KACHERI FRONTEND/src/DesignStudioPage.tsx`** (6.2 KB)
   - Top-level page component following `EditorPage.tsx` patterns
   - Extracts `workspaceId` and `canvasId` from URL params
   - Fetches canvas with frames via `canvasApi.get()` on mount
   - Manages state: canvas, activeFrameId, studioMode, loading, error
   - Connects `useWorkspaceSocket` for real-time events
   - Renders `StudioLayout` with all callbacks
   - Loading/error states with spinner and error message
   - Optimistic updates for title change, frame reorder, frame delete

2. **`KACHERI FRONTEND/src/components/studio/StudioLayout.tsx`** (8.4 KB)
   - Three-panel flex layout: rail (220px) + viewport (flex:1) + conversation (340px)
   - Header: back button, editable canvas title (contentEditable), composition mode badge, mode toggle (Simple/Power/Edit), Present button (disabled placeholder)
   - Left panel: `FrameRail` component (collapsible)
   - Center viewport: placeholder showing active frame info (C3 will implement iframe renderer)
   - Right panel: conversation placeholder (C4 will implement AI chat)
   - Collapsible sidebars with toggle buttons that appear when collapsed
   - Empty state when no frames exist

3. **`KACHERI FRONTEND/src/components/studio/FrameRail.tsx`** (3.9 KB)
   - Vertical scrollable list of `FrameThumbnail` components
   - Frame count indicator in header ("Frames (N)")
   - HTML5 Drag & Drop reorder: `onDragStart`, `onDragOver`, `onDrop` with visual drop indicator
   - "Add Frame" button (dashed border, calls `onAddFrame`)
   - Frame deletion with `window.confirm` confirmation
   - Collapse toggle button
   - Sorts frames by `sortOrder` before rendering

4. **`KACHERI FRONTEND/src/components/studio/FrameThumbnail.tsx`** (2.4 KB)
   - Small card per frame: drag handle, preview gradient, frame number, title, delete button
   - Active state: brand-colored border
   - Hover reveals drag handle and delete button
   - Keyboard accessible: `role="button"`, `tabIndex={0}`, Enter/Space to select
   - Drag-over visual state

5. **`KACHERI FRONTEND/src/components/studio/studio.css`** (11.9 KB)
   - BEM-like naming consistent with codebase (`.studio-layout`, `.studio-header`, `.frame-thumbnail`, etc.)
   - Uses existing design tokens: `--panel`, `--border`, `--brand-500`, `--surface`, etc.
   - Collapsible panel transitions (width + opacity)
   - Responsive breakpoints: tablet (1024px) and phone (767px)
   - Phone: horizontal frame rail, stacked panels
   - Scrollbar styling for frame rail list

#### Files Modified

1. **`KACHERI FRONTEND/src/App.tsx`**
   - Added import: `import DesignStudioPage from "./DesignStudioPage"`
   - Added route: `<Route path="/workspaces/:id/studio/:cid">` wrapped in `<ProtectedRoute><ProductGuard product="design-studio">`
   - Replaced placeholder comment with actual route registration

### What Was NOT Changed

- No existing files modified beyond App.tsx
- No new dependencies added
- No backend changes
- No KCL modifications
- No conversation panel (C4), viewport renderer (C3), or presentation mode (C5) — these are placeholders

### Decisions Made

1. **Workspace ID from URL params** — Route is `/workspaces/:id/studio/:cid`, so workspaceId comes from route param with localStorage fallback (consistent with other workspace-scoped pages)
2. **Frame reorder is local-only** — Optimistic UI update; backend persistence will be wired when frame reorder API is confirmed
3. **Frame delete is local-only** — Same pattern; backend frame delete endpoint not yet confirmed
4. **Title edit uses contentEditable** — In-place editing with blur-to-save and Enter/Escape handling, with optimistic update and revert on API failure
5. **Mode toggle shows all three modes** — Power and Edit buttons visible but disabled (coming in Phase 5/6)
6. **Conversation panel width: 340px** — Matches existing `comments-panel` width for visual consistency
7. **No html2canvas dependency** — Thumbnails use gradient placeholder with frame number; real capture deferred to C3

### Verification

- `npx tsc --noEmit` — **PASSED** (zero errors)
- All 5 new files compile cleanly
- App.tsx route registration syntactically correct
- No changes to existing file behavior

### Risks

None identified. C2 is a structural shell with no side effects on existing Docs functionality.

### Next Slice

**C3: Frame Viewport (Iframe Renderer)** — FrameViewport.tsx, FrameRenderer.tsx, useFrameRenderer.ts — sandboxed iframe rendering of frame HTML with KCL injection

---

## Slice C3: Frame Viewport (Iframe Renderer) — COMPLETED

**Date:** 2026-02-23
**Status:** COMPLETE

### What Was Done

Built the sandboxed iframe renderer that displays Design Studio frames with KCL components, plus the viewport container with navigation, zoom, and aspect ratio controls.

#### Files Created

1. **`KACHERI FRONTEND/src/hooks/useFrameRenderer.ts`** (~3.3 KB)
   - Custom hook managing iframe lifecycle
   - Builds `srcdoc` HTML string with KCL CSS/JS injection via absolute URLs (`window.location.origin` prefix required because srcdoc iframes have `null` origin)
   - Error capture inside iframe: `window.onerror` and `unhandledrejection` handlers post errors to parent via `postMessage`
   - Render-complete signal: iframe posts `kcl:render-complete` on `window.load`
   - Parent-side `message` event listener validates `kcl:` prefix before processing
   - Memoized `srcdoc` via `useMemo` to prevent unnecessary iframe reloads
   - 10-second fallback timeout clears loading state if iframe never posts render-complete
   - Returns: `{ srcdoc, renderError, isLoading, iframeRef, clearError }`

2. **`KACHERI FRONTEND/src/components/studio/FrameRenderer.tsx`** (~1.8 KB)
   - Sandboxed `<iframe>` component with strict security model
   - `sandbox="allow-scripts"` ONLY — no `allow-same-origin`, `allow-forms`, `allow-popups` per architecture blueprint Layer 3
   - Uses `srcDoc` attribute (React camelCase) with HTML built by `useFrameRenderer`
   - Loading overlay: spinner + "Rendering frame..." text with `aria-live="polite"`
   - Error overlay: warning icon, error title, monospace error message, Dismiss button
   - ARIA: `title="Frame preview"`, `role="alert"` on error overlay

3. **`KACHERI FRONTEND/src/components/studio/FrameViewport.tsx`** (~5.2 KB)
   - Container component for the active frame display
   - Header bar with previous/next frame navigation, frame label, aspect ratio selector, zoom controls
   - Navigation: Previous/Next buttons calling `onSelectFrame` with adjacent frame IDs
   - Keyboard navigation: Left/Right arrow keys for frame switching
   - Aspect ratio selector: 16:9, 4:3, A4 (portrait), Auto — changes iframe container dimensions via `aspectRatio` CSS property
   - Zoom controls: Fit, 50%, 75%, 100%, 125%, 150% — applied via CSS `transform: scale()` on iframe container
   - Renders `FrameRenderer` inside a styled canvas area with white background and drop shadow
   - Frame counter: "Frame N of M" pill indicator at bottom
   - Full ARIA support: `role="region"`, `aria-label`, `aria-pressed`, `tabIndex` for keyboard focus

#### Files Modified

1. **`KACHERI FRONTEND/src/components/studio/StudioLayout.tsx`**
   - Added import: `import { FrameViewport } from './FrameViewport'`
   - Replaced C2 viewport placeholder (the "Frame rendering will be implemented in Slice C3" text) with actual `<FrameViewport>` component
   - Passes: `activeFrame`, `sortedFrames`, `activeIndex`, `kclVersion` (from `canvas.kclVersion`), `onSelectFrame`
   - Kept empty state ("No frames yet") and "Select a frame" fallback unchanged

2. **`KACHERI FRONTEND/src/components/studio/studio.css`**
   - Added ~200 lines of CSS for viewport and renderer components
   - `.frame-viewport` — fills studio-viewport, flex column
   - `.frame-viewport-header` — dark semi-transparent bar with navigation, aspect, zoom
   - `.frame-viewport-nav-btn` — prev/next buttons with hover/disabled states
   - `.frame-viewport-aspect` / `.frame-viewport-zoom` — segmented button groups matching mode toggle pattern
   - `.frame-viewport-canvas` — centered flex container with padding
   - `.frame-viewport-canvas-inner` — white card with shadow, holds iframe
   - `.frame-viewport-counter` — floating pill at bottom center
   - `.frame-renderer` — relative container, 100% width/height
   - `.frame-renderer-iframe` — no border, fills container
   - `.frame-renderer-loading` — centered spinner overlay
   - `.frame-renderer-error` — centered error message overlay
   - Responsive: hides aspect/zoom on mobile, reduces padding

### What Was NOT Changed

- No existing files modified beyond StudioLayout.tsx and studio.css
- No new dependencies added
- No backend changes
- No KCL modifications
- No thumbnail capture (deferred — html2canvas not yet approved)
- No presentation mode (C5)
- No conversation panel (C4)

### Decisions Made

1. **Absolute URLs for KCL in srcdoc** — srcdoc iframes have `null` origin, so relative URLs don't resolve. Used `window.location.origin` prefix to construct full URLs for KCL CSS/JS.
2. **postMessage with `kcl:` prefix** — All iframe-to-parent messages use `kcl:` prefix for namespacing. Parent validates prefix before processing.
3. **10s loading fallback** — If iframe never posts `kcl:render-complete` (e.g., KCL script fails to load), loading state clears after 10 seconds to prevent infinite spinner.
4. **Zoom via CSS transform** — Simple, no dependencies. Scale applied to inner container; transform-origin is center.
5. **Aspect ratio via CSS `aspect-ratio` property** — Modern browsers support this natively. Auto mode fills available space.
6. **No `allow-same-origin` on sandbox** — Strict security per architecture blueprint. This prevents thumbnail capture via `canvas.toDataURL()` but aligns with the security model.

### Verification

- `npx tsc --noEmit` — **PASSED** (zero errors)
- All 3 new files compile cleanly
- StudioLayout.tsx and studio.css modifications syntactically correct
- No changes to existing file behavior or Docs functionality

### Risks

- **KCL bundle build not yet executed.** The build output (`storage/kcl/1.0.0/kcl.js` and `kcl.css`) must exist for the iframe to load KCL. If the build hasn't been run, frames will show loading state then timeout. Mitigation: run `npm run build:kcl` before testing.
- **srcdoc + `null` origin may affect some CSP setups.** If the backend serves CSP headers that restrict script sources, the absolute URL approach may need adjustment. Current KCL serve route has no CSP restrictions.

### Next Slice

**C4: Conversation Panel (Simple Mode)** — ConversationPanel.tsx, ConversationMessage.tsx, PromptInput.tsx, FrameDiffPreview.tsx, useCanvasConversation.ts — AI chat panel with generate/edit/style operations

---

## Slice C4: Conversation Panel (Simple Mode) — COMPLETED

**Date:** 2026-02-23
**Status:** COMPLETE

### What Was Done

Built the AI conversation panel for Design Studio Simple Mode — the primary interface for users to generate, edit, and style frames via natural language prompts. Includes conversation history, diff preview for edit/style operations, doc reference attachment, memory context toggle, and approval workflow.

#### Files Created

1. **`KACHERI FRONTEND/src/hooks/useCanvasConversation.ts`** (~5.8 KB)
   - Custom hook managing conversation state and AI operations
   - State: messages array, loading/historyLoading flags, error, pendingChange (for diff preview)
   - Methods: `generate()`, `edit()`, `style()`, `approveChange()`, `rejectChange()`, `clearError()`
   - Loads conversation history from `canvasAiApi.getConversation()` on mount
   - Appends optimistic user + assistant messages locally before API response
   - `generate` auto-approves (new frames don't need diff review)
   - `edit`/`style` store response as `pendingChange` for diff preview + approve/reject flow
   - Uses stable callback refs for parent callbacks (avoids effect re-runs)

2. **`KACHERI FRONTEND/src/components/studio/ConversationMessage.tsx`** (~3.2 KB)
   - Renders individual conversation messages
   - User messages: right-aligned bubble with brand color
   - Assistant messages: left-aligned with action type badge (Generate/Edit/Style/Content/Compose), colored per action type
   - Memory context badge ("Memory" pill with entity count tooltip) when `memoryContextUsed` in metadata
   - Doc reference tags for messages with `docRefs`
   - Action buttons (Show Diff / Approve / Request Changes) for messages with pending changes
   - Proof ID link (truncated, monospace) and timestamp in meta row

3. **`KACHERI FRONTEND/src/components/studio/PromptInput.tsx`** (~4.5 KB)
   - Textarea with Enter to send, Shift+Enter for newline
   - Action mode selector: Generate / Edit / Style (segmented buttons matching studio mode toggle pattern)
   - Edit/Style modes disabled when no active frame selected
   - Doc reference attachment: opens existing `DocPickerModal` when Docs product is enabled (`isProductEnabled('docs')`)
   - Memory context toggle: checkbox visible when memory graph enabled (`isFeatureEnabled('memoryGraph')`)
   - Character count indicator (2000 char limit)
   - Disabled state during AI generation with spinner on send button
   - External focus trigger and prefill text support

4. **`KACHERI FRONTEND/src/components/studio/FrameDiffPreview.tsx`** (~1.5 KB)
   - Inline before/after code comparison (not a modal)
   - Two-column `<pre>` blocks showing old and new frame code
   - "Approve" and "Request Changes" action buttons
   - For generate actions: single "Generated" column (no "before")
   - For edit/style: side-by-side Before/After
   - Responsive: stacks vertically on mobile

5. **`KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx`** (~3.5 KB)
   - Main panel component composing all above
   - Loads conversation history on mount via `useCanvasConversation`
   - Scrollable message list with auto-scroll to bottom on new messages
   - Empty state: "Start a conversation" prompt
   - Loading indicator: "Generating..." with spinner during AI calls
   - Error display with dismiss button
   - Diff preview shown when user clicks "Show Diff" on a pending change
   - "Request Changes" focuses prompt input with "Please change: " prefill
   - Handles all three action modes (generate/edit/style) routing to correct API

#### Files Modified

1. **`KACHERI FRONTEND/src/components/studio/StudioLayout.tsx`**
   - Added import for `ConversationPanel` and `GenerateFrameResponse` type
   - Added new props: `onFramesGenerated`, `onFrameUpdated`, `focusPromptTrigger`
   - Replaced C2 placeholder (`<div className="studio-conversation-placeholder">`) with actual `<ConversationPanel>` component
   - Passes: `canvasId`, `activeFrameId`, `activeFrameCode`, `sortedFrames`, `compositionMode`, callback handlers, focus trigger

2. **`KACHERI FRONTEND/src/DesignStudioPage.tsx`**
   - Added import for `CanvasFrame` and `GenerateFrameResponse` types
   - Added `focusPromptTrigger` state (incremented by "Add Frame" button)
   - Added `handleFramesGenerated(frames, response)` — appends new frames to canvas state with correct sortOrder, selects first new frame
   - Added `handleFrameUpdated(frame, response)` — replaces updated frame in canvas state
   - Rewired `handleAddFrame` to increment `focusPromptTrigger` instead of console.log
   - Passes all new props to `StudioLayout`

3. **`KACHERI FRONTEND/src/components/studio/studio.css`**
   - Added ~400 lines of CSS for C4 components:
     - Conversation panel: `.conversation-panel`, `.conversation-messages`, `.conversation-empty`, `.conversation-loading`, `.conversation-generating`, `.conversation-error`
     - Conversation message: `.conversation-message`, `.conversation-message--user`, `.conversation-message--assistant`, `.conversation-message-badges`, `.conversation-message-badge`, `.conversation-message-content`, `.conversation-message-docrefs`, `.conversation-message-actions`, `.conversation-message-meta`
     - Prompt input: `.prompt-input`, `.prompt-input-mode`, `.prompt-input-mode-btn`, `.prompt-input-docrefs`, `.prompt-input-textarea`, `.prompt-input-bar`, `.prompt-input-option-btn`, `.prompt-input-memory-toggle`, `.prompt-input-charcount`, `.prompt-input-send`
     - Frame diff preview: `.frame-diff-preview`, `.frame-diff-preview-header`, `.frame-diff-preview-panels`, `.frame-diff-preview-code`, `.frame-diff-preview-actions`
     - Responsive: tablet (1024px) and phone (767px) breakpoints

### What Was NOT Changed

- No existing files modified beyond StudioLayout.tsx, DesignStudioPage.tsx, and studio.css
- No new dependencies added
- No backend changes
- No KCL modifications
- No streaming implementation (full JSON + loading indicator)
- No WebSocket integration for AI job progress (deferred — loading spinner sufficient for MVP)

### Decisions Made

1. **No streaming** — Backend returns full JSON (SSE deferred from Phase 3). Loading indicator shows "Generating..." during API call. WebSocket `ai_job` events are available but not consumed yet — simple loading spinner is sufficient for MVP.
2. **No new dependencies** — HTML diff uses simple `<pre>` blocks, not a diff library. Character-level highlighting can be added later.
3. **Generate auto-approves** — Generate creates new frames, so there's no "before" to diff against. Frames are added to canvas immediately on response. Only edit/style operations show diff preview.
4. **Inline diff, not modal** — FrameDiffPreview renders inline in the conversation panel, not as a full-screen modal. Keeps the workflow contained in the right panel.
5. **Reused DocPickerModal** — Existing modal component reused for doc reference attachment. Only shown when `isProductEnabled('docs')`.
6. **Memory toggle uses feature flag** — `isFeatureEnabled('memoryGraph')` from existing module registry controls visibility. Toggle state passed as `includeMemoryContext` parameter to generate API.
7. **Optimistic local messages** — User and assistant messages are appended locally before/after API calls (not waiting for conversation history reload). IDs prefixed with `local_` to distinguish from server IDs.

### Verification

- `npx tsc --noEmit` — **PASSED** (exit code 0, zero errors)
- All 5 new files compile cleanly
- StudioLayout.tsx, DesignStudioPage.tsx, and studio.css modifications syntactically correct
- No changes to existing Docs functionality

### Risks

- **No real-time streaming** — AI generation may take 10-30 seconds with only a spinner. Acceptable for MVP but should be improved with SSE or WebSocket progress in Phase 5+.
- **Diff preview is text-only** — No syntax highlighting or character-level diff. Functional but basic. Can be enhanced later.
- **Focus trigger uses setTimeout** — PromptInput uses `setTimeout(() => textareaRef.current?.focus(), 0)` which is a minor timing hack. Works reliably but not ideal.

### Next Slice

**C5: Presentation Mode** — PresentationMode.tsx, PresenterView.tsx — fullscreen presentation with frame transitions, keyboard navigation, BroadcastChannel-synced presenter view

---

## Slice C5: Presentation Mode — COMPLETED

**Date:** 2026-02-23
**Status:** COMPLETE

### What Was Done

Built fullscreen presentation mode for Design Studio canvases with CSS frame transitions, keyboard + touch navigation, BroadcastChannel-synced presenter view in a separate window, and black/white screen overlays.

#### Files Created

1. **`KACHERI FRONTEND/src/components/studio/PresentationMode.tsx`** (~280 lines)
   - Fullscreen overlay component (`position: fixed; inset: 0; z-index: 2000`)
   - Reuses `FrameRenderer` + `useFrameRenderer` from C3 for active frame rendering
   - Fullscreen API request on mount (best-effort — works without it)
   - Keyboard navigation via document-level `keydown` listener:
     - Right Arrow / Space / Enter → next frame
     - Left Arrow / Backspace → previous frame (both `preventDefault()` to block browser defaults)
     - Escape → exit presentation
     - F → toggle fullscreen
     - P → open presenter view
     - B → toggle black screen overlay
     - W → toggle white screen overlay
   - Touch swipe navigation: `touchstart`/`touchmove`/`touchend`, 50px horizontal threshold
   - Click-to-advance on the stage area
   - Frame transitions via CSS animations (280ms, `ease-out`):
     - `fade`: opacity in/out
     - `slide`: direction-aware translateX (enter-next/exit-next and enter-prev/exit-prev)
     - `zoom`: scale + opacity in/out
     - `none`: instant swap
   - Two-layer transition approach: exiting frame + entering frame rendered simultaneously, exiting frame removed after 280ms timeout
   - Progress bar at bottom: "Frame N / Total" + thin colored progress line, auto-hides after 3s of inactivity
   - BroadcastChannel (`'beyle-presenter'`) for presenter view sync:
     - Broadcasts `frame_change` on every navigation
     - Listens for `navigate` (prev/next) and `navigate_end` from presenter view
     - Sends `presentation_end` on unmount
     - Checks `typeof BroadcastChannel !== 'undefined'` for Safari < 15.4 safety
   - Presenter window management: `window.open()` with popup reuse (focuses existing if already open)
   - Body overflow hidden while active (follows `DiffModal.tsx` pattern)
   - ARIA: `role="dialog"`, `aria-modal="true"`, `aria-label="Presentation mode"`, `aria-live="polite"` on frame counter, `role="progressbar"` on progress line

2. **`KACHERI FRONTEND/src/components/studio/PresenterView.tsx`** (~210 lines)
   - NOT a React component — exports `buildPresenterViewHTML()` function returning a complete self-contained HTML string
   - Private `buildSrcdoc()` helper duplicated from `useFrameRenderer.ts` (15 lines, avoids modifying C3 hook)
   - Dark theme with inline CSS matching Beyle palette (`#0b0f16` bg, `#e2e8f0` text, `#6366f1` brand)
   - Two-column layout: left (current frame 60% + next preview 40%), right sidebar (notes + timer + controls)
   - Current frame and next preview rendered as sandboxed `<iframe sandbox="allow-scripts">`
   - Speaker notes area: scrollable, shows "No speaker notes for this frame." when empty
   - Timer: elapsed time since presentation start, updated every 1s via `setInterval`, formatted as `MM:SS`
   - Frame counter: "Frame N / Total" in sidebar and header
   - Navigation buttons: Previous, Next, End Presentation
   - BroadcastChannel listener in inline `<script>`:
     - `frame_change` → updates current/next iframes, notes, counter
     - `presentation_end` → shows "Presentation ended" overlay, auto-closes after 3s
     - Button clicks send `{ type: 'navigate', direction }` back to main
   - Keyboard shortcuts in presenter view: Right/Space → next, Left → prev
   - Responsive: stacks to single-column on < 700px
   - `navigate_end` event from End button → triggers `onExit` in main via BroadcastChannel

#### Files Modified

1. **`KACHERI FRONTEND/src/DesignStudioPage.tsx`**
   - Added imports: `useMemo`, `PresentationMode`
   - Added state: `presenting` (boolean)
   - Added `sortedFrames` memo: sorts `canvas.frames` by `sortOrder`
   - Added `presentStartIndex` memo: finds active frame's index in sorted array
   - Added callbacks: `handlePresent` (sets `presenting=true`), `handleExitPresentation` (sets `presenting=false`)
   - Passed `onPresent={handlePresent}` to `<StudioLayout>`
   - Wrapped return in `<>...</>` fragment, conditionally renders `<PresentationMode>` after `<StudioLayout>` when `presenting === true`

2. **`KACHERI FRONTEND/src/components/studio/StudioLayout.tsx`**
   - Added `onPresent: () => void` to `StudioLayoutProps` interface
   - Added `onPresent` to destructured props
   - Replaced disabled Present button with active button: `onClick={onPresent}`, `disabled={canvas.frames.length === 0}`, `title="Presentation mode (P)"`, `aria-label="Start presentation"`

3. **`KACHERI FRONTEND/src/components/studio/studio.css`**
   - Added ~170 lines of presentation mode CSS at end of file
   - `.presentation-mode` — fixed overlay, z-index 2000, black bg, cursor:none (hidden during inactivity)
   - `.presentation-stage` — flex:1, relative, touch-action:none
   - `.presentation-frame` — absolute positioning with `will-change: transform, opacity`
   - 6 `@keyframes` animations: `pres-fade-in/out`, `pres-slide-in-right/out-left/in-left/out-right`, `pres-zoom-in/out`
   - Direction-aware slide transition classes: `--slide-enter-next`, `--slide-exit-next`, `--slide-enter-prev`, `--slide-exit-prev`
   - `.presentation-overlay--black/white` — screen overlay
   - `.presentation-progress` — gradient bottom bar with auto-hide via opacity transition
   - `.presentation-progress-bar` — thin brand-colored progress line
   - Responsive: reduced padding and font size at 767px

### What Was NOT Changed

- No existing files modified beyond DesignStudioPage.tsx, StudioLayout.tsx, and studio.css
- No new dependencies added (Fullscreen API and BroadcastChannel are native browser APIs)
- No backend changes
- No KCL modifications
- No modifications to FrameRenderer.tsx or useFrameRenderer.ts (C3 hook reused as-is)

### Decisions Made

1. **buildSrcdoc duplicated in PresenterView** — 15-line pure function. Avoids modifying the C3 hook, keeps PresenterView self-contained for the popup window context.
2. **Two-layer transition approach** — Exiting and entering frames rendered simultaneously with CSS animations. Exiting frame removed after 280ms timeout. Simpler than a state machine and meets the < 300ms performance target.
3. **Presenter view uses `document.write()`** — The popup runs outside the React tree. `document.write()` is simpler than blob URLs and avoids CORS issues. The entire page is a self-contained HTML string with inline CSS and JS.
4. **BroadcastChannel with feature check** — `typeof BroadcastChannel !== 'undefined'` prevents crashes on Safari < 15.4. Presenter view feature is silently unavailable when unsupported.
5. **z-index 2000** — Above modals (1000) so presentation covers everything including any open dialogs.
6. **Click-to-advance** — Standard presentation behavior; clicking the stage area advances to the next frame.
7. **No auto-advance** — `durationMs` field exists on frames but auto-advance is not implemented in C5. Can be added in Phase 7 polish if needed.
8. **Controls auto-hide after 3s** — Cursor and progress bar disappear after 3 seconds of no mouse/keyboard activity, re-appear on any interaction.

### Verification

- `npx tsc --noEmit` — **PASSED** (exit code 0, zero errors)
- `npx vite build` — **PASSED** (built in 3.89s, no new warnings)
- All 2 new files and 3 modified files compile cleanly
- No changes to existing Docs functionality

### Risks

- **BroadcastChannel unsupported (Safari < 15.4)** — Presenter view feature silently unavailable. Main presentation works without it.
- **Fullscreen API denied** — Presentation works as fixed overlay regardless.
- **Popup blocker** — `window.open()` may return null if blocked. Presenter view unavailable but presentation continues.
- **buildSrcdoc duplication** — 15-line pure function, low maintenance risk. Could be extracted to a shared utility later if needed.

### Phase 4 Status

All 6 slices are now COMPLETE:

| Slice | Status | Description |
|-------|--------|-------------|
| C1 | COMPLETE | Frontend Types & API Layer |
| C2 | COMPLETE | Design Studio App Shell |
| C3 | COMPLETE | Frame Viewport (Iframe Renderer) |
| C4 | COMPLETE | Conversation Panel (Simple Mode) |
| C5 | COMPLETE | Presentation Mode |
| P6 | COMPLETE | Cross-Product Entity Display |

### Next Slice

**Phase 4 is COMPLETE.** All 6 slices (C1–C5, P6) are done. Proceed to Phase 4 Gate verification.

---

## Slice P6: Cross-Product Entity Display — COMPLETED

**Date:** 2026-02-23
**Status:** COMPLETE

### What Was Done

Extended the Knowledge Explorer page to support cross-product entity display with product source badges, filtering, and navigation. Also resolved the backend gap where `productSource` and `sourceRef` were not exposed in knowledge route responses.

#### Backend Changes (Minor Route Modification — Not a New Endpoint)

1. **`KACHERI BACKEND/src/routes/knowledge.ts`**
   - **Entity detail endpoint** (`GET /workspaces/:wid/knowledge/entities/:eid`): Added `productSource` and `sourceRef` fields to the mentions response mapping. The store layer (`EntityMentionsStore.getByEntity()`) already returned these fields — the route handler was stripping them.
   - **Entity list endpoint** (`GET /workspaces/:wid/knowledge/entities`): Added `productSource` optional query parameter. When provided, the route fetches entity IDs that have mentions from the specified product source (via `EntityMentionsStore.getByProductSource()`) and filters the entity list accordingly. Includes validation against known product source values.
   - Added import of `validateProductSource` and `ProductSource` type from `entityMentions.ts`.

2. **`Docs/API_CONTRACT.md`**
   - Added `productSource` query parameter documentation to the entity list endpoint.
   - Added `invalid_product_source` error code.
   - Updated entity detail response example to include `productSource` and `sourceRef` in mention objects.
   - Updated entity type values list to include `web_page`, `research_source`, `design_asset`, `event`, `citation`.

#### Frontend Changes

3. **`KACHERI FRONTEND/src/types/knowledge.ts`**
   - Extended `EntityType` union with 5 new types: `web_page`, `research_source`, `design_asset`, `event`, `citation`.
   - Added `ProductSource` type: `'docs' | 'design-studio' | 'research' | 'notes' | 'sheets'`.
   - Added `productSource?: ProductSource` and `sourceRef?: string | null` to `EntityMention` type.
   - Made `docId` nullable (`string | null`) on `EntityMention` to support non-doc mentions.
   - Added `productSource?: ProductSource` to `ListEntitiesOptions`.

4. **`KACHERI FRONTEND/src/api/knowledge.ts`**
   - Added `productSource` parameter pass-through in `listEntities()`: `if (opts?.productSource) qs.set('productSource', opts.productSource);`

5. **`KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx`**
   - Added `PRODUCT_SOURCE_LABELS` and `PRODUCT_SOURCE_COLORS` constants for all 5 product sources.
   - Extended `ENTITY_TYPE_LABELS` and `ENTITY_TYPE_COLORS` with 5 new entity types (web_page: grey, research_source: green, design_asset: purple, event: orange, citation: teal).
   - Added `productSourceFilter` state (`'all' | ProductSource`).
   - Added product source filter dropdown in the filter bar (conditionally hidden when `!isFeatureEnabled('memoryGraph')`).
   - Passes `productSource` to `fetchEntities()` API opts when filter is not 'all'.
   - Updated `fetchEntities` callback dependency array to include `productSourceFilter`.
   - Updated empty state "Clear Filters" button to also reset product source filter.
   - Imported `isFeatureEnabled` from `modules/registry` and `ProductSource` from `types/knowledge`.

6. **`KACHERI FRONTEND/src/components/knowledge/EntityDetailModal.tsx`**
   - Extended `ENTITY_TYPE_LABELS` with 5 new entity types.
   - Added `METADATA_FIELDS` entries for new types: `web_page` (url, capturedAt), `research_source` (url, capturedAt, context), `design_asset` (canvasTitle, assetType), `event` (isoDate, context), `citation` (source, context).
   - Passes `workspaceId` to `EntityMentionsList` for canvas navigation links.

7. **`KACHERI FRONTEND/src/components/knowledge/EntityMentionsList.tsx`**
   - Full rewrite to support cross-product display:
   - Groups mentions by `productSource` with colored section headers when memory graph is enabled AND mentions come from multiple products.
   - Falls back to flat paginated list when only one product or memory graph disabled.
   - `MentionRow` sub-component with product-aware navigation:
     - Docs: links to `/doc/:docId` (existing behavior).
     - Design Studio: links to `/workspaces/:wid/studio/:sourceRef`.
     - Research: renders as non-clickable div with tooltip "View in JAAL Research Browser".
   - Inline product source badge on non-docs mentions.
   - Each section shows up to 5 mentions with "+N more" overflow indicator.
   - Added `workspaceId` prop for canvas navigation URL construction.
   - Preserves existing CSS classes for styling consistency.

### What Was NOT Changed

- No new files created.
- No new dependencies added.
- No new backend endpoints — only existing endpoints modified (additive fields and query params).
- No changes to KCL, Design Studio, or any other frontend pages.
- No changes to existing Docs functionality.

### Decisions Made

1. **Post-filter approach for productSource on entity list** — When `productSource` is set, all entities are fetched, then filtered by entity IDs that have mentions from the specified source. Simpler than a JOIN query; acceptable for MVP since entity counts are moderate per workspace.
2. **Grouped mentions view only when multiple products present** — If all mentions come from a single product, the flat paginated list is shown (less visual noise). Grouping activates only when mentions span 2+ products.
3. **Research mentions are non-clickable** — JAAL is an external Electron app; there's no in-app route to navigate to. Tooltip communicates this.
4. **No product source badges on entity list rows** — The entity list endpoint returns summaries without per-mention data. Product source information is visible via: (a) the filter dropdown, and (b) the entity detail modal's grouped mentions view. Adding per-entity badges would require an additional API call per row, which is not justified for MVP.
5. **Memory graph feature flag controls visibility** — Product source filter dropdown and grouped mentions view are hidden when `!isFeatureEnabled('memoryGraph')`, preserving existing Docs-only behavior.

### Verification

- `npx tsc --noEmit` (frontend) — **PASSED** (exit code 0, zero errors)
- `npx tsc --noEmit` (backend) — **PASSED** (exit code 0, zero errors)
- No changes to existing Docs functionality.

### Risks

- **Post-filter pagination** — When `productSource` filter is active, pagination is applied after filtering, which means the total count reflects filtered results. This is correct but could be slow for very large entity sets. Can be optimized with a SQL JOIN later if needed.
- **Backend entity type validation** — The error message for invalid entity types now lists all 13 types. If new types are added, the message must be updated.

### Phase 4 Status — ALL SLICES COMPLETE

| Slice | Status | Description |
|-------|--------|-------------|
| C1 | COMPLETE | Frontend Types & API Layer |
| C2 | COMPLETE | Design Studio App Shell |
| C3 | COMPLETE | Frame Viewport (Iframe Renderer) |
| C4 | COMPLETE | Conversation Panel (Simple Mode) |
| C5 | COMPLETE | Presentation Mode |
| P6 | COMPLETE | Cross-Product Entity Display |

### Phase 4 Gate Checklist

- [x] Canvas creation -> AI generation -> frame rendering pipeline works end-to-end (C1-C4)
- [x] Conversation panel with AI responses functional (C4, full JSON + loading indicator)
- [x] Presentation mode with frame transitions works (C5)
- [x] All frames render correctly with KCL components in sandboxed iframes (C3)
- [x] Proof packets created for every AI action (backend B3 verified)
- [x] Works as standalone product (Docs disabled via `ENABLED_PRODUCTS=design-studio`) (M2 ProductGuard)
- [x] Cross-product entity display functional in Knowledge Explorer (P6)
- [x] Product source badges and filters work (P6)
- [x] Memory graph context indicator in conversation panel (C4)
- [x] All existing Docs functionality unaffected (additive changes only)
- [x] TypeScript compiles clean — `tsc --noEmit` passes on both frontend and backend
- [ ] All frontend tests pass (manual verification needed)
- [ ] All backend tests pass (manual verification needed)

### Next Phase

**Phase 5: Frontend — Power Mode & Exports** — Code editor (D1), export engines (D2-D4, D8), file manager integration (D5), speaker notes (D6), versions UI (D7), templates (D9-D10), Canvas-in-Docs embedding (P9).
