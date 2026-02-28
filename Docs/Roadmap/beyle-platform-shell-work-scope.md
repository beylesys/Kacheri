# BEYLE Platform — Unified Multi-Topology Experience & Intelligence Products | Full Work Scope

**Created:** 2026-02-25
**Status:** DRAFT — PENDING APPROVAL
**Scope Level:** Platform (cross-product, multi-topology, new top-level modules)
**Prerequisites:** Phase 0–6 complete, Phase 7 (E1–E9) planned
**Triggered by:** Need for unified product launcher, JAAL on all devices, cross-product intelligence gaps, SaaS distribution for retail clients, mobile access, Design Studio offline usability gap for non-coders, BEYLE Sheets as platform-integrated structured intelligence layer

---

## Executive Summary

The BEYLE Platform currently operates as a web application (React + Node) with product toggling, plus a standalone Electron browser (JAAL). Users have no unified entry point — they land directly in File Manager with no awareness of Design Studio, and JAAL runs as a completely separate desktop application with no mobile presence.

This work scope defines a **unified multi-topology platform** that delivers all four BEYLE products (Kacheri Docs, File Manager, Design Studio, BEYLE JAAL) across every device from a single codebase:

1. **Cloud SaaS (Web)** — Backend in the cloud, frontend served from CDN, accessed via browser. For retail clients and teams.
2. **Desktop App (Electron)** — Wraps frontend + JAAL natively. Supports both **local backend** (embedded, offline-capable) and **cloud backend** (connected to SaaS). For power users and enterprise.
3. **Mobile App (Capacitor + Native)** — Frontend wrapped in Capacitor, JAAL browsing via native WebView plugins, cloud backend. For on-the-go access on iOS and Android.

It also closes three cross-product intelligence gaps: JAAL's push-only sync (no pull), Design Studio's inability to push entities to the Memory Graph, and the absence of cross-product notifications. Additionally, it extends Design Studio's Edit Mode into a full **Visual Mode** — enabling non-coders to create presentations from scratch without AI, closing an offline usability gap.

Finally, it introduces **BEYLE Sheets** — a platform-integrated spreadsheet that is NOT a generic grid but the **structured intelligence layer** on top of the document platform. Sheets leverages the existing extraction engine, compliance engine, knowledge graph, clause library, negotiation tracking, and provenance system to deliver capabilities no standalone spreadsheet can: document-to-sheet extraction with provenance links, compliance-as-a-column, entity-aware cells, legal domain formula functions, JAAL research capture with cryptographic proofs, and verifiable AI-generated reports. Every product (Docs, Design Studio, JAAL, Sheets) is independently toggleable — they can be sold individually or as bundles, with cross-product features degrading gracefully when dependencies are disabled.

The key architectural insight: the **homepage and all shared UI live in the KACHERI Frontend (React)**, not in any native shell. Components detect their runtime context and adapt. JAAL browsing uses platform-native webview technology (Electron `<webview>` on desktop, native `WebView`/`WKWebView` on mobile) while JAAL's UI (Guide panel, Trust HUD, Research controls) is shared React.

---

## Architecture Overview

### Deployment Topologies

```
                     ┌──────────────────────────────────────────┐
                     │          KACHERI FRONTEND (React)         │
                     │                                           │
                     │  HomePage ─ Docs ─ Files ─ Studio ─ JAAL │
                     │  (universal, works in any shell)          │
                     └───────┬───────────┬───────────┬──────────┘
                             │           │           │
               ┌─────────────┘           │           └──────────────┐
               ▼                         ▼                          ▼
    ┌──────────────────┐     ┌───────────────────┐     ┌───────────────────┐
    │   WEB (SaaS)     │     │ DESKTOP (Electron) │     │ MOBILE (Capacitor)│
    │                  │     │                    │     │                   │
    │ Browser loads    │     │ BrowserWindow      │     │ WebView loads     │
    │ React app from   │     │ loads React app    │     │ React app from    │
    │ CDN              │     │ from local/cloud   │     │ cloud backend     │
    │                  │     │                    │     │                   │
    │ JAAL: React UI + │     │ JAAL: Full native  │     │ JAAL: React UI +  │
    │ backend-proxied  │     │ Electron webview   │     │ native WebView    │
    │ browsing         │     │ (full privacy)     │     │ plugin (Android   │
    │                  │     │                    │     │  ~95% / iOS ~80%) │
    │ Backend: Cloud   │     │ Backend: Local     │     │                   │
    │                  │     │  OR Cloud          │     │ Backend: Cloud    │
    └────────┬─────────┘     └─────────┬──────────┘     └─────────┬─────────┘
             │                         │                           │
             ▼                         ▼                           ▼
    ┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
    │ Cloud Backend    │     │ Local Backend      │     │ Cloud Backend    │
    │ (Docker/K8s)     │     │ (in-process) OR    │     │ (Docker/K8s)     │
    │ PostgreSQL       │     │ Cloud Backend      │     │ PostgreSQL       │
    └──────────────────┘     │ SQLite (local)     │     └──────────────────┘
                             └───────────────────┘
```

### JAAL Per-Platform Implementation

```
┌─────────────────────────────────────────────────────────────────┐
│                    JAAL ARCHITECTURE                             │
│                                                                  │
│  SHARED (React — all platforms):                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Guide Panel │ Trust HUD │ Research Session UI │ Proof     │   │
│  │             │           │ Controls            │ Viewer    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│              ┌───────────────┼───────────────────┐               │
│              ▼               ▼                   ▼               │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────────┐    │
│  │ DESKTOP        │ │ ANDROID        │ │ iOS              │    │
│  │ Electron       │ │ Native WebView │ │ Native WKWebView │    │
│  │ <webview>      │ │ (Java/Kotlin)  │ │ (Swift)          │    │
│  │                │ │                │ │                   │    │
│  │ Privacy: 100%  │ │ Privacy: ~95%  │ │ Privacy: ~80%    │    │
│  │ Proofs: local  │ │ Proofs: cloud  │ │ Proofs: cloud    │    │
│  │ Offline: yes   │ │ Offline: no    │ │ Offline: no      │    │
│  └────────────────┘ └────────────────┘ └──────────────────┘    │
│                                                                  │
│  BACKEND (cloud or local):                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ JAAL Service Module — proof generation, policy eval,      │   │
│  │ LLM orchestration, session management, Memory Graph sync  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Homepage is React** — Lives in `KACHERI FRONTEND/src/HomePage.tsx`, works in browser, Electron, and mobile from a single codebase.
2. **Deployment-aware, not deployment-specific** — Components detect runtime context (`web`, `electron`, `capacitor`) and adapt behavior.
3. **JAAL on every platform** — Desktop gets full native Electron webview. Mobile gets native WebView plugins (Android Java/Kotlin, iOS Swift). Web gets backend-proxied browsing. JAAL UI (Guide, Trust HUD, Research) is shared React across all.
4. **Desktop supports dual backend** — Local mode (embedded, offline-capable, SQLite) and cloud mode (connected to SaaS, PostgreSQL). User can switch.
5. **Backend is topology-agnostic** — Same codebase serves local SQLite and cloud PostgreSQL. Config determines topology.
6. **Product independence preserved** — Each product tile only appears if enabled via `ENABLED_PRODUCTS`. JAAL browsing features degrade per platform capabilities.
7. **Memory Graph as the integration backbone** — Cross-product data flows through shared entity/mention/relationship tables across all topologies.
8. **Three clean Design Studio modes** — Visual Mode (create + edit + position, works offline, no AI needed), AI Mode (generate + enhance via conversation), Code Mode (full HTML/CSS/JS control). Visual Mode subsumes and extends Phase 6 Edit Mode.
9. **Sheets as structured intelligence, not generic grid** — The grid is the rendering surface. What flows into and out of it is the product: extraction results, compliance scores, entity links, provenance trails, AI-generated reports. Every cell knows its origin.
10. **Product independence with graceful degradation** — Every product (Docs, Design Studio, JAAL, Sheets) is independently toggleable via `ENABLED_PRODUCTS`. Cross-product features (extraction-to-sheet, JAAL capture, compliance columns) hide when their dependency is disabled. Each product works as a standalone offering.

---

## Platform Capability Matrix

| Feature | Desktop (Electron) | Web (SaaS) | Android | iOS |
|---------|-------------------|------------|---------|-----|
| **Homepage + product tiles** | Full | Full | Full | Full |
| **Kacheri Docs** | Full | Full | Full | Full |
| **File Manager** | Full | Full | Full | Full |
| **Design Studio** | Full | Full | Full | Full |
| **Design Studio Visual Mode (offline)** | Full | Full | Full | Full |
| **BEYLE Sheets (grid + formulas)** | Full | Full | Full (card view) | Full (card view) |
| **Sheets: extraction-to-sheet** | Full | Full | Full | Full |
| **Sheets: entity-aware cells** | Full | Full | Full | Full |
| **Sheets: compliance columns** | Full | Full | Full | Full |
| **Sheets: legal formulas** | Full | Full | Full | Full |
| **Sheets: JAAL research capture** | Full | Backend-proxied | Full | Full |
| **Sheets: NL queries** | Full | Full | Full | Full |
| **Sheets: cell-level provenance** | Full | Full | Full | Full |
| **Sheets: real-time collaboration** | Full | Full | Full | Full |
| **Sheets: granular permissions** | Full | Full | Full | Full |
| **JAAL browsing** | Full (Electron webview) | Backend-proxied | Native WebView | Native WKWebView |
| **JAAL Guide mode (AI)** | Full | Full | Full | Full |
| **JAAL Research sessions** | Full | Full | Full | Full |
| **JAAL proof generation** | Local (offline) | Cloud (backend) | Cloud (backend) | Cloud (backend) |
| **JAAL privacy: cookie blocking** | Full | N/A (proxied) | Full | Per-store |
| **JAAL privacy: request interception** | Full | N/A (proxied) | Full | Custom schemes only |
| **JAAL privacy: storage silos** | Full | N/A (proxied) | Full | Full |
| **JAAL privacy: fingerprint defense** | Full | N/A (proxied) | Full | Partial (~80%) |
| **JAAL userscripts/RPA** | Full | Not available | Limited | Limited |
| **JAAL Gecko engine toggle** | Planned | No | No | No (WebKit mandate) |
| **Memory Graph** | Full | Full | Full | Full |
| **Cross-product notifications** | Full | Full | Full + push | Full + push |
| **Activity feed** | Full | Full | Full | Full |
| **Local backend (offline)** | Yes | No | No | No |
| **Cloud backend** | Yes | Yes | Yes | Yes |
| **Keyboard shortcuts** | Full | Browser-limited | N/A | N/A |
| **System tray** | Yes | No | No | No |

---

## Scope Boundary

### In Scope

- Universal homepage (React component, all topologies)
- Deployment context detection (web/electron/capacitor)
- Backend activity feed endpoint
- Electron desktop shell (local + cloud backend modes)
- JAAL modularization for platform integration
- JAAL React UI components (shared across all platforms)
- JAAL backend service module (proof gen, policy, LLM, sessions for non-desktop)
- JAAL backend-proxied browsing API (for web topology)
- Native browser plugins for mobile (Android WebView, iOS WKWebView)
- Capacitor mobile shell scaffold
- Mobile-responsive homepage and navigation
- JAAL bidirectional sync (pull from Memory Graph)
- Design Studio entity push to Memory Graph
- Cross-product notification bridge
- Memory Graph dashboard widget
- Backend cloud deployment config (Dockerfile, PostgreSQL support)
- Frontend SaaS build config (Dockerfile, CORS)
- Design Studio Visual Mode (blank frame creation, element palette, drag-and-drop, resize, pre-built layouts, snap-to-grid, grouping)
- BEYLE Sheets: grid rendering engine with virtualization, formula engine, cell types
- BEYLE Sheets: document-to-sheet extraction pipeline (bulk extraction → structured comparison matrix)
- BEYLE Sheets: entity-aware cells with Memory Graph linking
- BEYLE Sheets: legal domain formula functions (EXTRACT, COMPLIANCE_SCORE, ENTITY_MENTIONS, DAYS_UNTIL, CLAUSE_MATCH, NEGOTIATION_DELTA)
- BEYLE Sheets: compliance-as-a-column (auto-computed from policy engine)
- BEYLE Sheets: negotiation comparison matrices (auto-generated from negotiation sessions)
- BEYLE Sheets: JAAL research capture with cryptographic proof links
- BEYLE Sheets: real-time collaboration via Yjs, cell-level provenance, granular row/column permissions
- BEYLE Sheets: natural language queries, verifiable AI-generated reports, obligation tracker
- BEYLE Sheets: mobile card view, dashboard view with charts, template library with inheritance
- BEYLE Sheets: CSV/XLSX import/export with provenance preservation
- Product independence architecture (all products independently toggleable, cross-product features degrade gracefully)
- Desktop product switching UX (shortcuts, tray)
- Desktop offline mode and resilience
- Desktop and web settings UI

### Out of Scope

- Auto-update and code signing (distribution concern)
- App Store / Play Store submission
- Database migration tooling (SQLite → PostgreSQL data migration)
- CDN and domain infrastructure setup
- CI/CD pipeline for multi-topology builds
- JAAL Gecko/Firefox engine on mobile
- New Memory Graph entity types beyond those already defined
- Load balancing and horizontal scaling
- Platform analytics/telemetry

---

## Implementation Slices

### Phase A: Universal Foundation (Slices S1–S3)

*Frontend changes that work across all topologies. No native code.*

---

### Slice S1: Deployment Context Detection

**Files to create:**
- `KACHERI FRONTEND/src/platform/context.ts`
- `KACHERI FRONTEND/src/platform/types.ts`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx`

**Scope:**
- `DeploymentContext` module detects runtime environment:
  - `electron` — `window.electronAPI` defined or `navigator.userAgent` contains "Electron"
  - `capacitor` — `window.Capacitor` defined
  - `web` — default fallback
- Exposes React hook: `useDeploymentContext()` returning `{ platform: 'web' | 'electron' | 'capacitor', isDesktop: boolean, isMobile: boolean, isWeb: boolean }`
- Exposes helper: `canRunNativeJaal(): boolean` — true on `electron` and `capacitor` (native webview available)
- Exposes helper: `getBackendUrl(): string` — resolves from Electron config, Capacitor config, or `VITE_API_URL` for web
- Context provider wraps the app in `App.tsx`

**Acceptance Criteria:**
- `useDeploymentContext()` correctly identifies platform in browser, Electron, and Capacitor
- `canRunNativeJaal()` returns `true` on Electron and Capacitor, `false` on web
- `getBackendUrl()` resolves correctly per topology
- Zero bundle size impact for web users (tree-shakes to constants)
- `npx tsc --noEmit` passes

**Dependencies:** None

---

### Slice S2: Universal Homepage Component

**Files to create:**
- `KACHERI FRONTEND/src/HomePage.tsx`
- `KACHERI FRONTEND/src/components/ProductCard.tsx`
- `KACHERI FRONTEND/src/components/homePage.css`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` — Change `/` route from `FileManagerPage` to `HomePage`
- `KACHERI FRONTEND/src/components/AppLayout.tsx` — Add home navigation link

**Scope:**
- `HomePage` component displays 4 product cards in a responsive grid:
  - **Kacheri Docs** — Icon, description, click → `/docs`
  - **File Manager** — Icon, description, click → `/files`
  - **Design Studio** — Icon, description, click → canvas list route
  - **BEYLE JAAL** — Icon, description, click behavior varies:
    - Electron: opens JAAL window via `window.electronAPI.openJaal()`
    - Capacitor: navigates to JAAL React view (native webview integration)
    - Web: navigates to JAAL web view (backend-proxied browsing)
- Each `ProductCard` shows: icon, name, short description, availability state
- Cards respect `isProductEnabled()` from existing product registry
- JAAL card shows platform-specific capability indicator:
  - Desktop: "Full privacy browsing"
  - Mobile: "Native browsing" with privacy level note
  - Web: "Cloud browsing"
- Responsive layout: 2x2 grid on desktop, 2x2 on tablet, single column on mobile
- Workspace selector on homepage (reuses existing `WorkspaceSwitcher`)
- Homepage is the new default route (`/`) — `FileManagerPage` remains at `/files`

**Acceptance Criteria:**
- Homepage renders with 4 product cards on all platforms
- Cards respect `ENABLED_PRODUCTS`
- JAAL card adapts to deployment context
- Responsive: desktop (1200px+), tablet (768px), mobile (375px)
- Existing `/files` route still loads `FileManagerPage` directly
- `npx tsc --noEmit` passes

**Dependencies:** S1

---

### Slice S3: Backend Activity Feed Endpoint & Homepage Feed

**Files to create:**
- `KACHERI BACKEND/src/routes/activityFeed.ts`
- `KACHERI FRONTEND/src/api/activityFeed.ts`
- `KACHERI FRONTEND/src/components/ActivityFeed.tsx`
- `KACHERI FRONTEND/src/components/activityFeed.css`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` — Register activity feed route
- `KACHERI FRONTEND/src/HomePage.tsx` — Integrate ActivityFeed component

**New API Endpoint:**
```
GET /workspaces/:wid/activity?limit=20
Authorization: Bearer <accessToken>

Response 200:
{
  "items": [
    {
      "id": "act_abc",
      "productSource": "docs",
      "itemType": "document",
      "itemId": "doc_123",
      "title": "Service Agreement Draft",
      "action": "edited",
      "timestamp": "2026-02-25T10:30:00Z",
      "actorName": "Jane Doe"
    }
  ]
}
```

**Scope:**
- Backend: New route aggregates recent activity from audit log + entity timestamps
  - Docs: recent doc edits from `audit_log WHERE action LIKE 'doc:%'`
  - Design Studio: recent canvas activity from `audit_log WHERE action LIKE 'canvas:%'`
  - Memory Graph: recent entity discoveries from `workspace_entities ORDER BY last_seen_at DESC`
  - JAAL: recent research sessions from `entity_mentions WHERE product_source = 'research'`
  - Merge, sort by timestamp, limit to N items
- Frontend: `ActivityFeed` component renders below product cards
  - Each item: product icon badge, item title, action verb, relative timestamp
  - Clicking an item navigates to relevant product route
  - Auto-refreshes every 60 seconds
  - Skeleton loader while fetching, "No recent activity" when empty

**Acceptance Criteria:**
- Feed shows items from all active products sorted by recency
- Items are clickable and navigate correctly
- Loads within 2 seconds
- Works in all topologies
- Returns 401 without auth, respects workspace scoping

**Dependencies:** S2

---

### Phase B: Product Independence — JAAL + Design Studio Visual Mode (Slices S4–S6, MC1–MC4)

*Extract JAAL logic into reusable modules (shared React UI, backend service, modularized desktop code) AND extend Design Studio with Visual Mode for offline, non-coder presentation creation.*

---

### Slice S4: JAAL React UI Components (Shared Across All Platforms)

**Files to create:**
- `KACHERI FRONTEND/src/components/jaal/GuidePanel.tsx`
- `KACHERI FRONTEND/src/components/jaal/TrustHUD.tsx`
- `KACHERI FRONTEND/src/components/jaal/ResearchSessionControls.tsx`
- `KACHERI FRONTEND/src/components/jaal/ProofViewer.tsx`
- `KACHERI FRONTEND/src/components/jaal/MemoryContextPanel.tsx`
- `KACHERI FRONTEND/src/components/jaal/JaalBrowserView.tsx`
- `KACHERI FRONTEND/src/components/jaal/jaal.css`
- `KACHERI FRONTEND/src/api/jaal.ts`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` — Add JAAL routes under ProductGuard

**Scope:**
- Reimplement JAAL's UI as React components, translating from `renderer.js` (7,065 lines) and `index.html`:
  - `GuidePanel` — AI actions: Summarize, Extract Links, Compare. Shows preview before approval.
  - `TrustHUD` — Confidence indicator (green/amber/red), policy state display.
  - `ResearchSessionControls` — Start/stop session, session history, annotation.
  - `ProofViewer` — List proofs, view proof detail, proof replay.
  - `MemoryContextPanel` — "Known Context" sidebar showing Memory Graph entities for current URL.
  - `JaalBrowserView` — Wrapper component that renders the platform-appropriate browser:
    - Desktop: Electron `<webview>` tag (via ref and native API)
    - Mobile: Capacitor native plugin bridge (S14/S15)
    - Web: `<iframe>` pointing to backend proxy (S5)
- New routes: `/jaal` (JAAL main view), `/jaal/session/:sid` (session detail)
- All components call backend APIs for proof generation, LLM, policy (S5) — no direct LLM calls from frontend
- Components use `useDeploymentContext()` to adapt browser rendering per platform

**Acceptance Criteria:**
- JAAL UI renders correctly on all platforms
- Guide panel actions trigger backend API calls (S5 endpoints)
- Trust HUD displays correct state
- Research session controls start/stop sessions via API
- Proof viewer lists and displays proofs
- `JaalBrowserView` renders appropriate browser control per platform
- `npx tsc --noEmit` passes

**Dependencies:** S1

---

### Slice S5: JAAL Backend Service Module

**Files to create:**
- `KACHERI BACKEND/src/jaal/proofService.ts`
- `KACHERI BACKEND/src/jaal/policyService.ts`
- `KACHERI BACKEND/src/jaal/sessionService.ts`
- `KACHERI BACKEND/src/jaal/llmService.ts`
- `KACHERI BACKEND/src/jaal/browseProxy.ts`
- `KACHERI BACKEND/src/routes/jaal.ts`
- `KACHERI BACKEND/src/store/jaalSessions.ts`
- `KACHERI BACKEND/src/store/jaalProofs.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` — Register JAAL routes under ProductGuard

**New API Endpoints:**
```
POST   /jaal/sessions                    — Start research session
PATCH  /jaal/sessions/:sid               — Update session (annotate, end)
GET    /jaal/sessions                    — List user's sessions
GET    /jaal/sessions/:sid               — Session detail with actions

POST   /jaal/guide/summarize             — AI summarize page content
POST   /jaal/guide/extract-links         — AI extract links from page
POST   /jaal/guide/compare               — AI compare two pages

POST   /jaal/proofs                      — Generate proof for an action
GET    /jaal/proofs                      — List proofs (filterable by session)
GET    /jaal/proofs/:pid                 — Proof detail

GET    /jaal/policy/evaluate             — Evaluate policy for an action
GET    /jaal/policy/privacy-receipt      — Get privacy receipt for current config

GET    /jaal/browse?url=<encoded_url>    — Proxy-fetch page for web topology
```

**Scope:**
- Extract JAAL's core logic from `BEYLE JAAL/main.js` and `BEYLE JAAL/lib/` into backend services:
  - `proofService` — Proof creation with SHA256 hash, proof listing, replay data. Stores in database (not filesystem).
  - `policyService` — Policy evaluation, privacy receipt generation. Reuses JAAL's `policy/policy.js` logic.
  - `sessionService` — Research session CRUD, action tracking, session index.
  - `llmService` — LLM orchestration for Guide mode actions. Reuses existing `modelRouter.ts`.
  - `browseProxy` — Server-side page fetch for web topology. Returns sanitized HTML. Used when no native webview is available.
- Sessions and proofs stored in database tables (new migration):
  - `jaal_sessions` — id, workspace_id, user_id, started_at, ended_at, action_count, metadata_json
  - `jaal_proofs` — id, session_id, workspace_id, user_id, kind, hash, payload_json, created_at
- Routes registered only when `isProductEnabled('jaal')` — new product in registry
- All endpoints require auth and workspace context
- `browseProxy` sanitizes HTML to prevent XSS, strips scripts, resolves relative URLs
- Proof generation creates provenance records (reuses existing proof/provenance infrastructure)

**Acceptance Criteria:**
- All JAAL API endpoints respond correctly with auth
- Session lifecycle works: create → add actions → end → list
- Proof generation produces valid proof packets with hashes
- Guide mode summarize/extract/compare produce correct AI responses
- Browse proxy returns sanitized page content
- Routes return 404 when JAAL product is disabled
- Database migration creates tables successfully

**Dependencies:** None (backend-only, parallel with Phase A)

---

### Slice S6: JAAL Desktop Main Process Modularization

**Files to create:**
- `BEYLE JAAL/main/ipcHandlers.js`
- `BEYLE JAAL/main/proofManager.js`
- `BEYLE JAAL/main/policyEngine.js`
- `BEYLE JAAL/main/sessionManager.js`
- `BEYLE JAAL/main/llmBridge.js`
- `BEYLE JAAL/main/networkManager.js`
- `BEYLE JAAL/main/syncConnector.js`

**Files to modify:**
- `BEYLE JAAL/main.js` — Refactor to import from modules, keep as standalone entry point

**Scope:**
- Extract JAAL's monolithic `main.js` (4,389 lines) into importable modules
- Each module exports `register(ipcMain, appContext)` to register its IPC handlers
- `appContext` provides shared state: app paths, config, BrowserWindow reference
- JAAL standalone mode (`npm run dev` in BEYLE JAAL/) works identically
- No logic changes — purely structural extraction
- Preserve all 40+ IPC channel names exactly as-is

**Acceptance Criteria:**
- JAAL runs identically in standalone mode
- All 40+ IPC handlers respond correctly
- Each module importable individually: `require('./main/proofManager')`
- No circular dependencies

**Risks:**
- JAAL's main.js has shared global state that must move to `appContext`
- Some handlers may have implicit ordering dependencies

**Dependencies:** None (parallel with everything)

---

### Slice MC1: Visual Mode — Blank Frame Creation & Element Palette

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/VisualCanvas.tsx`
- `KACHERI FRONTEND/src/components/studio/ElementPalette.tsx`
- `KACHERI FRONTEND/src/components/studio/visualCanvas.css`

**Files to modify:**
- `KACHERI FRONTEND/src/DesignStudioPage.tsx` — Add Visual Mode tab alongside AI Mode and Code Mode
- `KACHERI FRONTEND/src/components/studio/` — Integrate Visual Mode into existing mode switcher

**Scope:**
- **Visual Mode** becomes the third Design Studio mode (alongside AI Mode and Code Mode), replacing the current Edit Mode name and extending its capabilities:
  - Retains all Phase 6 Edit Mode features: KCL frame inspection (F1), Properties Panel (F2), inline text editing (F3)
  - Adds: blank frame creation from scratch (no AI, no code needed)
  - Adds: element palette sidebar with drag-to-canvas insertion
- Element palette provides:
  - **Text block** — heading, body, caption presets with font/size controls
  - **Image** — insert from upload, URL, or workspace attachments
  - **Shape** — rectangle, circle, line, arrow with fill/stroke controls
  - **Divider** — horizontal rule, decorative separators
- Blank frame creation: "Add Slide" button creates an empty frame with configurable dimensions (16:9, 4:3, A4 portrait/landscape)
- Elements placed at a default position on canvas; MC2 adds drag-and-drop precision
- Each element generates valid KCL under the hood (so Code Mode can edit it, AI Mode can enhance it)
- Works fully offline — no AI calls, no backend dependency for creation
- Mode switcher UI: `[Visual] [AI] [Code]` tabs at top of studio

**Acceptance Criteria:**
- User can create a blank frame and add text, image, shape, divider elements from palette
- Elements appear on the canvas at default positions
- Generated KCL is valid and editable in Code Mode
- AI Mode can enhance frames created in Visual Mode
- Works without backend/AI connection (offline-capable)
- `npx tsc --noEmit` passes

**Dependencies:** None (builds on existing Phase 6 Edit Mode foundation F1–F3)

---

### Slice MC2: Visual Mode — Drag-and-Drop Positioning & Resize Handles

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/DragManager.tsx`
- `KACHERI FRONTEND/src/components/studio/ResizeHandles.tsx`
- `KACHERI FRONTEND/src/components/studio/dragResize.css`

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/VisualCanvas.tsx` (from MC1)

**Scope:**
- Pointer-event-based drag-and-drop for all canvas elements:
  - Click to select, drag to reposition, handles to resize
  - Multi-select with Shift+click or marquee selection
  - Arrow keys for precise nudging (1px, Shift+arrow for 10px)
- Resize handles on selected elements:
  - 8-point handles (corners + edges) for shapes and images
  - Width-only handles for text blocks (height auto from content)
  - Aspect-ratio lock with Shift held during resize
- Position and size changes update the underlying KCL `style` properties
- Selection bridge from Phase 6 F1 (KCL inspection) extended:
  - Clicking an element in Visual Mode selects it AND shows its KCL in the inspector
  - Properties Panel (F2) reflects live position/size values
- Undo/redo for all drag and resize operations (integrates with existing undo stack if present)

**Acceptance Criteria:**
- Elements can be dragged to any position on the canvas
- Resize handles work correctly for all element types
- Multi-select and marquee selection work
- Arrow key nudging works
- Changes reflected in KCL and Properties Panel
- Undo/redo for all positioning operations
- `npx tsc --noEmit` passes

**Dependencies:** MC1

---

### Slice MC3: Visual Mode — Pre-Built Slide Layouts

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/SlideLayoutPicker.tsx`
- `KACHERI FRONTEND/src/components/studio/layouts/` (layout definition files)
- `KACHERI FRONTEND/src/components/studio/slideLayouts.css`

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/VisualCanvas.tsx` (from MC1)

**Scope:**
- Pre-built layout gallery available when creating a new frame or applying to existing frame:
  - **Title Slide** — centered heading + subtitle
  - **Title + Content** — heading left, body text right
  - **Two Column** — equal-width side-by-side content areas
  - **Image + Text** — large image left, text block right (and mirrored variant)
  - **Bullet List** — heading + bulleted content area
  - **Full Image** — edge-to-edge image with optional overlay text
  - **Comparison** — two columns with heading for each
  - **Quote** — centered large quote text + attribution
  - **Blank** — empty frame (already from MC1)
- Layouts are KCL templates — selecting one populates the frame with placeholder elements
- User can modify any element after applying layout (full Visual Mode editing)
- Layout picker appears in: "Add Slide" flow, and as "Apply Layout" button on existing frames
- Reuses existing template gallery modal pattern from Design Studio

**Acceptance Criteria:**
- 8-10 layout presets available in picker
- Applying a layout populates frame with correctly positioned placeholder elements
- All placeholder elements are editable (text, swappable images)
- Layouts produce valid KCL
- Layout picker UI consistent with existing template gallery patterns
- `npx tsc --noEmit` passes

**Dependencies:** MC1

---

### Slice MC4: Visual Mode — Snap-to-Grid, Grouping & Layer Control

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/SnapGrid.tsx`
- `KACHERI FRONTEND/src/components/studio/GroupManager.tsx`
- `KACHERI FRONTEND/src/components/studio/LayerPanel.tsx`
- `KACHERI FRONTEND/src/components/studio/layerPanel.css`

**Files to modify:**
- `KACHERI FRONTEND/src/components/studio/VisualCanvas.tsx` (from MC1)
- `KACHERI FRONTEND/src/components/studio/DragManager.tsx` (from MC2)

**Scope:**
- **Snap-to-grid**: configurable grid (8px, 16px, 32px) with visual gridlines toggle
  - Elements snap to grid during drag and resize
  - Smart guides: alignment lines appear when edges/centers align with other elements
  - Toggle: `View > Snap to Grid` and `View > Show Grid`
- **Grouping**: select multiple elements → Group (Ctrl+G) / Ungroup (Ctrl+Shift+G)
  - Grouped elements move and resize together
  - Groups represented as a KCL container element
  - Nested groups supported (group of groups)
- **Layer control (z-index)**: Layer Panel sidebar (toggleable)
  - Visual list of all elements in z-order
  - Drag to reorder
  - Keyboard: `Ctrl+]` bring forward, `Ctrl+[` send backward, `Ctrl+Shift+]` bring to front, `Ctrl+Shift+[` send to back
  - Eye icon to hide/show elements
  - Lock icon to prevent accidental edits
- All operations update underlying KCL

**Acceptance Criteria:**
- Snap-to-grid works during drag and resize
- Smart alignment guides appear correctly
- Grouping and ungrouping work with Ctrl+G / Ctrl+Shift+G
- Layer Panel shows correct z-order, drag-to-reorder works
- Hide/show and lock/unlock elements work
- Z-index keyboard shortcuts work
- All operations produce valid KCL
- `npx tsc --noEmit` passes

**Dependencies:** MC2

---

### Phase C: Electron Desktop Shell (Slices S7–S11)

---

### Slice S7: Electron Platform Scaffold

**Files to create:**
- `BEYLE PLATFORM/package.json`
- `BEYLE PLATFORM/main.js`
- `BEYLE PLATFORM/preload.js`
- `BEYLE PLATFORM/config.json`

**Scope:**
- Electron app creates main BrowserWindow loading KACHERI Frontend
- **Cloud mode**: Loads `{cloudUrl}/` — the React homepage
- **Local mode**: Starts backend in-process (S8), loads `http://localhost:{port}/`
- `preload.js` exposes `window.electronAPI`:
  - `getConfig()` — backend mode, enabled products
  - `openJaal()` — opens JAAL window (S10)
  - `getBackendStatus()` — health state
  - `getPlatformInfo()` — `{ platform: 'electron', version, backendMode }`
- `config.json`: backend mode (local/cloud), cloud URL, window preferences
- Single instance lock, window state persistence
- System tray with product quick-launch menu

**Acceptance Criteria:**
- Electron launches and shows KACHERI Frontend homepage
- Cloud mode connects to configured URL
- `window.electronAPI` available in renderer
- Single instance: re-launch focuses existing window
- Tray icon appears

**Dependencies:** S1, S2

---

### Slice S8: Embedded Backend (Local Mode)

**Files to create:**
- `BEYLE PLATFORM/lib/embeddedBackend.js`

**Files to modify:**
- `BEYLE PLATFORM/main.js`
- `KACHERI BACKEND/src/server.ts` — Add `export { app, startServer }` for in-process use

**Scope:**
- In local mode, Electron main process starts KACHERI Backend in-process:
  - Import Express app factory from `KACHERI BACKEND/src/server.ts`
  - `app.listen(0)` to bind auto-selected port
  - Pass port to renderer via `window.electronAPI.getConfig()`
- Health monitoring: `/health` every 10 seconds
- Startup: start backend → wait healthy → load homepage
- Shutdown: `server.close()` on app quit
- Database: SQLite stored in `{userData}/data/`
- Fallback: startup failure shows error with option to switch to cloud mode

**Acceptance Criteria:**
- Local mode: backend starts in-process, homepage loads with healthy indicator
- Port auto-selected, no conflicts
- SQLite persists in userData
- Clean shutdown, no orphan processes
- Startup failure shows clear error

**Dependencies:** S7

---

### Slice S9: Desktop Offline Mode & Resilience

**Files to create:**
- `BEYLE PLATFORM/lib/offlineManager.js`

**Files to modify:**
- `BEYLE PLATFORM/main.js`

**Scope:**
- When backend unavailable (local mode crash, cloud mode network failure):
  - Homepage shows offline indicator
  - Product cards show "Backend unavailable — reconnecting..."
  - JAAL desktop browsing remains functional (Electron webview works offline)
  - JAAL sync paused with indicator
- Auto-reconnection: poll health every 10 seconds
- Local mode: auto-restart backend on crash (max 3 attempts)
- Cache last-known activity feed

**Acceptance Criteria:**
- JAAL desktop works fully when backend is down
- Homepage shows clear offline state
- Auto-reconnection within 15 seconds of recovery
- Cached activity feed with "offline" badge

**Dependencies:** S8

---

### Slice S10: JAAL Desktop Window Integration

**Files to create:**
- `BEYLE PLATFORM/lib/jaalDesktop.js`

**Files to modify:**
- `BEYLE PLATFORM/main.js`
- `BEYLE PLATFORM/preload.js`

**Scope:**
- `window.electronAPI.openJaal()` opens a BrowserWindow loading JAAL's `index.html` + `preload.js`
- Register all JAAL IPC handler modules (from S6) in platform main process
- JAAL window gets own webview partition (isolated from KACHERI sessions)
- JAAL storage paths: `{userData}/jaal/proofs/`, `{userData}/jaal/sessions/`
- Closing JAAL window does not quit platform
- Re-click focuses existing JAAL window
- Desktop JAAL uses local IPC handlers for full privacy; also syncs to backend for cross-device access

**Acceptance Criteria:**
- JAAL opens with full desktop UI (webview, guide, research, proofs)
- All JAAL features work: browsing, AI, sessions, proofs, privacy
- Proofs save locally AND sync to backend (dual storage)
- JAAL and web products run simultaneously
- Close JAAL returns to homepage

**Dependencies:** S6, S7

---

### Slice S11: Desktop Product Switching & Shortcuts

**Files to modify:**
- `BEYLE PLATFORM/main.js`
- `BEYLE PLATFORM/preload.js`

**Scope:**
- Global keyboard shortcuts:
  - `Ctrl+1` → Homepage
  - `Ctrl+2` → Docs (`/docs`)
  - `Ctrl+3` → File Manager (`/files`)
  - `Ctrl+4` → Design Studio
  - `Ctrl+5` → JAAL
- Menu bar with product list and states
- Window titles: "BEYLE — Kacheri Docs", "BEYLE — JAAL Research"
- Tray "Recent Items" submenu

**Acceptance Criteria:**
- Shortcuts work from any window
- Tray shows correct states
- Titles identify active product

**Dependencies:** S7, S10

---

### Phase D: Cross-Product Intelligence (Slices S12–S15)

*Backend changes that work across all topologies.*

---

### Slice S12: Design Studio Entity Push to Memory Graph

**Files to modify:**
- `KACHERI BACKEND/src/ai/designEngine.ts`
- `KACHERI BACKEND/src/routes/canvasAi.ts`

**Scope:**
- After AI generates a canvas frame, extract entities from generated content
- Push to Memory Graph via existing `MemoryIngester.ingest()` with `productSource: 'design-studio'`, `sourceRef: canvasId`
- Reuse Docs knowledge indexer extraction patterns
- Async — does not block frame generation
- `memoryIndexed` flag on frame metadata

**Acceptance Criteria:**
- Entity from frame content appears with `productSource: 'design-studio'`
- Knowledge Explorer shows correct product badge
- Extraction doesn't slow generation
- Silently skipped when Memory Graph disabled

**Dependencies:** None

---

### Slice S13: JAAL Bidirectional Sync — Pull from Memory Graph

**Files to create:**
- `KACHERI FRONTEND/src/hooks/useMemoryContext.ts`

**Files to modify:**
- `KACHERI FRONTEND/src/components/jaal/MemoryContextPanel.tsx` (from S4)
- `KACHERI FRONTEND/src/api/jaal.ts` (from S4)

**Scope:**
- `useMemoryContext(url)` hook queries knowledge API for entities matching current URL
- `MemoryContextPanel` shows entities from all product sources with badges
- Manual search within JAAL to query Memory Graph
- Clicking entity mention navigates to source (Docs → `/doc/:id`, Studio → canvas)
- Works on all platforms (uses REST API, not IPC)

**API Calls (existing, no backend changes):**
- `GET /workspaces/:wid/knowledge/entities?search={query}&limit=20`
- `POST /workspaces/:wid/knowledge/search`
- `GET /workspaces/:wid/knowledge/entities/:eid`

**Acceptance Criteria:**
- Browsing a URL shows relevant Memory Graph entities
- Manual search returns cross-product entities
- Product source badges display correctly
- "Memory Graph unavailable" shown when disabled
- Async, non-blocking

**Dependencies:** S4

---

### Slice S14: Cross-Product Notification Bridge

**Files to create:**
- `KACHERI BACKEND/src/notifications/crossProductBridge.ts`

**Files to modify:**
- `KACHERI BACKEND/src/knowledge/memoryIngester.ts`
- `KACHERI BACKEND/src/store/notifications.ts`
- `KACHERI BACKEND/src/realtime/workspaceWs.ts`

**New Notification Types:**
- `cross_product:entity_conflict`
- `cross_product:entity_update`
- `cross_product:new_connection`

**Scope:**
- On entity ingest, check for cross-product mentions
- Generate notification for users who interacted with entity in other products
- Deliver via existing WebSocket infrastructure
- User-configurable preferences (on/off per type)
- Rate limit: max 10 per entity per hour

**API Contract Addition:**
```
PATCH /workspaces/:wid/notification-preferences
{
  "crossProductEntityConflict": true,
  "crossProductEntityUpdate": true,
  "crossProductNewConnection": false
}
```

**Acceptance Criteria:**
- JAAL sync entity → doc author notified
- Studio index entity → doc author notified
- Notification bell shows cross-product alerts
- Preferences respected
- Bulk ingestion rate-limited

**Dependencies:** S12

---

### Slice S15: Memory Graph Dashboard Widget

**Files to create:**
- `KACHERI FRONTEND/src/components/MemoryGraphWidget.tsx`
- `KACHERI FRONTEND/src/components/memoryGraphWidget.css`

**Files to modify:**
- `KACHERI FRONTEND/src/HomePage.tsx`

**Scope:**
- Homepage widget showing Memory Graph summary:
  - Entity counts by product source: "Docs: 234 | Research: 89 | Studio: 45"
  - Top 5 most-connected entities
  - Recent cross-product connections
- Click navigates to Knowledge Explorer
- Hidden when Memory Graph disabled
- Compact on mobile, expanded on desktop

**Acceptance Criteria:**
- Correct counts per product
- Top entities clickable
- Hidden when disabled
- Works all topologies

**Dependencies:** S2, S12

---

### Phase E: Cloud SaaS Infrastructure (Slices S16–S17)

---

### Slice S16: Backend Cloud Deployment Configuration

**Files to create:**
- `KACHERI BACKEND/Dockerfile`
- `KACHERI BACKEND/docker-compose.yml`
- `KACHERI BACKEND/.env.production.example`

**Files to modify:**
- `KACHERI BACKEND/src/config.ts` — Add PostgreSQL connection support alongside SQLite

**Scope:**
- `Dockerfile`: Multi-stage build (TypeScript compile → production Node.js)
- `docker-compose.yml`: Backend + PostgreSQL + Redis
- Environment config: `DATABASE_URL` (postgres:// or sqlite://), `REDIS_URL`, `CORS_ORIGINS`, `STORAGE_BACKEND` (local/s3)
- `config.ts`: database driver selection based on URL scheme
- Health endpoint returns topology: `{ mode: 'cloud' | 'local', database: 'postgresql' | 'sqlite' }`

**Risks:**
- SQLite → PostgreSQL query compatibility (FTS5 → `tsvector`/`tsquery`)
- Some SQLite-isms may need abstraction layer

**Acceptance Criteria:**
- `docker-compose up` starts with PostgreSQL
- Backend works identically on both databases
- Health reports correct topology
- `.env.production.example` documents all vars

**Dependencies:** None (parallel with all)

---

### Slice S17: Frontend SaaS Build & CORS

**Files to create:**
- `KACHERI FRONTEND/Dockerfile`
- `KACHERI FRONTEND/nginx.conf`

**Files to modify:**
- `KACHERI FRONTEND/vite.config.ts` — Build-time API URL config
- `KACHERI BACKEND/src/server.ts` — CORS middleware for cloud topology

**Scope:**
- Frontend Dockerfile: Build React → serve via nginx
- `nginx.conf`: SPA routing, gzip, cache headers
- `VITE_API_URL` for cloud backend URL (Electron overrides at runtime)
- Backend CORS: allow frontend origins from `CORS_ORIGINS` env var

**Acceptance Criteria:**
- `docker build` produces working frontend image
- CORS headers present for cloud frontend → cloud backend
- Same build works in web and Electron

**Dependencies:** S1

---

### Phase F: Mobile Shell & Native JAAL (Slices S18–S21)

---

### Slice S18: Capacitor Mobile Shell Scaffold

**Files to create:**
- `BEYLE MOBILE/package.json`
- `BEYLE MOBILE/capacitor.config.ts`
- `BEYLE MOBILE/android/` (generated)
- `BEYLE MOBILE/ios/` (generated)

**Scope:**
- Initialize Capacitor project wrapping KACHERI Frontend build
- Configure: app name "BEYLE", cloud backend URL
- iOS and Android native project scaffolding
- Deep linking: `beyle://docs/:id`, `beyle://files`, `beyle://jaal`
- Status bar, splash screen config
- `window.Capacitor` detection handled by S1

**Acceptance Criteria:**
- `npx cap run android` launches React app in emulator
- `npx cap run ios` launches in simulator
- Homepage renders, products navigate correctly
- Backend API calls reach cloud

**Dependencies:** S1, S2

---

### Slice S19: Android Native Browser Plugin

**Files to create:**
- `BEYLE MOBILE/plugins/jaal-browser/android/src/main/java/com/beyle/jaal/JaalBrowserPlugin.java`
- `BEYLE MOBILE/plugins/jaal-browser/android/src/main/java/com/beyle/jaal/JaalWebViewClient.java`
- `BEYLE MOBILE/plugins/jaal-browser/src/index.ts` (JS bridge)
- `BEYLE MOBILE/plugins/jaal-browser/src/definitions.ts` (TypeScript interface)

**Scope:**
- Capacitor plugin exposing a native Android `WebView` with full control:
  - `navigate(url)` — load URL in native WebView
  - `getPageContent()` — extract page HTML/text
  - `injectScript(js)` — execute JavaScript in page context
  - `onNavigationChange(callback)` — navigation events
  - `onPageLoad(callback)` — page load completion
  - `setPrivacyConfig(config)` — cookie blocking, storage silos, fingerprint defense
- `JaalWebViewClient` extends `WebViewClient`:
  - `shouldInterceptRequest()` — block/modify requests per privacy policy
  - `shouldOverrideUrlLoading()` — navigation control
  - Cookie management via `CookieManager`
  - Storage isolation via separate `WebView` instances per privacy scope
- Plugin renders native WebView overlaid on Capacitor WebView, controlled via bridge
- React `JaalBrowserView` component (from S4) communicates with this plugin

**Acceptance Criteria:**
- Native WebView renders web pages within the app
- Request interception blocks third-party cookies and trackers
- JavaScript injection works for page analysis
- Navigation events reach React via plugin bridge
- Storage silos isolate per-site data
- Plugin gracefully handles WebView lifecycle (pause/resume/destroy)

**Dependencies:** S4, S18

---

### Slice S20: iOS Native Browser Plugin

**Files to create:**
- `BEYLE MOBILE/plugins/jaal-browser/ios/Plugin/JaalBrowserPlugin.swift`
- `BEYLE MOBILE/plugins/jaal-browser/ios/Plugin/JaalWebViewController.swift`

**Scope:**
- Capacitor plugin exposing native `WKWebView` with maximum iOS-allowed control:
  - Same JS bridge interface as Android (S19) — `navigate`, `getPageContent`, `injectScript`, etc.
- `JaalWebViewController`:
  - `WKURLSchemeHandler` — intercept custom scheme requests for privacy analysis
  - `WKContentRuleList` — content blocking rules (Safari content blocker format) for tracker/ad blocking
  - `WKWebsiteDataStore` — separate non-persistent stores per privacy scope (storage silos)
  - `WKUserScript` — JavaScript injection for page analysis
  - `WKNavigationDelegate` — navigation event handling
- Handles iOS-specific constraints:
  - WebKit-only rendering (Apple mandate)
  - Limited request interception (custom schemes, not all HTTP)
  - Compensate with `WKContentRuleList` for broad blocking

**Acceptance Criteria:**
- WKWebView renders pages within the app
- Content blocking rules block known trackers
- Storage silos isolate per-site data via separate `WKWebsiteDataStore`
- JavaScript injection works for page analysis
- Navigation events reach React via plugin bridge
- Handles iOS safe area, keyboard, and multitasking correctly

**Platform Limitations (Documented, Not Bugs):**
- Request interception limited to custom URL schemes (not all HTTP)
- Cookie control is per-store, not per-cookie
- Fingerprint defense limited by WebKit API surface

**Dependencies:** S4, S18

---

### Slice S21: Mobile-Responsive UI & Navigation

**Files to modify:**
- `KACHERI FRONTEND/src/HomePage.tsx`
- `KACHERI FRONTEND/src/components/homePage.css`
- `KACHERI FRONTEND/src/components/AppLayout.tsx`
- `KACHERI FRONTEND/src/components/jaal/jaal.css`

**Scope:**
- Responsive homepage: single-column cards on mobile, 2x2 on tablet, 4-across on desktop
- Mobile bottom navigation bar: Home, Docs, Files, Studio, JAAL
- Touch-friendly card sizes (48px minimum tap target)
- Pull-to-refresh on activity feed
- Safe area handling for notched devices
- JAAL mobile layout: browser occupies main view, Guide panel as bottom sheet (slide up), Trust HUD as floating overlay

**Acceptance Criteria:**
- Homepage correct at 375px (iPhone SE), 390px (iPhone 14), 768px (iPad)
- Bottom nav on mobile, hidden on desktop
- Touch-friendly, no hover-only interactions
- Pull-to-refresh works
- Safe areas respected
- JAAL Guide panel usable as bottom sheet on mobile

**Dependencies:** S2, S18

---

### Phase G: Platform Settings & Polish (Slices S22–S23)

---

### Slice S22: Desktop Settings UI

**Files to create:**
- `BEYLE PLATFORM/settings/index.html`
- `BEYLE PLATFORM/settings/style.css`
- `BEYLE PLATFORM/settings/renderer.js`
- `BEYLE PLATFORM/settings/preload.js`

**Files to modify:**
- `BEYLE PLATFORM/main.js`

**Scope:**
- Settings window from tray menu and keyboard shortcut
- Options: backend mode (local/cloud), cloud URL, enabled products, JAAL sync config (PAT, workspace, auto-sync), appearance (light/dark), startup behavior
- Validate cloud URL before saving
- PAT in Electron safeStorage

**Acceptance Criteria:**
- All settings functional
- Backend mode switch works
- PAT persists encrypted

**Dependencies:** S7, S10

---

### Slice S23: Web & Mobile Settings Page

**Files to create:**
- `KACHERI FRONTEND/src/components/PlatformSettingsPage.tsx`
- `KACHERI FRONTEND/src/components/platformSettings.css`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` — Add settings route

**Scope:**
- Settings page at `/settings` for web and mobile users:
  - Notification preferences (cross-product alerts on/off)
  - Memory Graph visibility toggle
  - JAAL privacy level display (read-only, shows platform capabilities)
  - Theme preference
- Reuses existing notification preferences API
- Desktop redirects to native settings window

**Acceptance Criteria:**
- Settings page renders on web and mobile
- Notification preferences save correctly
- Desktop users directed to native settings

**Dependencies:** S2

---

### Phase H: Sheets Foundation (Slices SH1–SH5)

*Core spreadsheet product: grid, formulas, CRUD, import/export. Works as standalone product with no dependency on other BEYLE products.*

---

### Slice SH1: Product Registration, Database Schema & API Layer

**Files to create:**
- `KACHERI BACKEND/migrations/021_add_sheets.sql`
- `KACHERI BACKEND/src/store/sheets.ts`
- `KACHERI BACKEND/src/store/sheetCells.ts`
- `KACHERI BACKEND/src/store/sheetCellHistory.ts`
- `KACHERI BACKEND/src/store/sheetTemplates.ts`
- `KACHERI BACKEND/src/routes/sheets.ts`
- `KACHERI FRONTEND/src/types/sheets.ts`
- `KACHERI FRONTEND/src/api/sheets.ts`

**Files to modify:**
- `KACHERI BACKEND/src/modules/registry.ts` — Add `'sheets'` to `ProductId` union type
- `KACHERI FRONTEND/src/modules/registry.ts` — Add `'sheets'` to `ProductId` union type, `KNOWN_PRODUCTS`, and feature flags
- `KACHERI BACKEND/src/server.ts` — Register sheets routes conditionally: core routes under `isProductEnabled('sheets')`, cross-product routes further gated by their dependency product flags
- `KACHERI FRONTEND/src/App.tsx` — Add sheets routes wrapped in `<ProductGuard product="sheets">`

**Database Tables:**
```sql
-- Migration: 021_add_sheets.sql

CREATE TABLE sheets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  column_defs_json TEXT NOT NULL DEFAULT '[]',
  row_count INTEGER DEFAULT 0,
  source_type TEXT DEFAULT 'blank'
    CHECK (source_type IN ('blank', 'extraction', 'import', 'template', 'negotiation')),
  source_ref TEXT,
  template_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX idx_sheets_workspace ON sheets(workspace_id);
CREATE INDEX idx_sheets_template ON sheets(template_id);

CREATE TABLE sheet_rows (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  doc_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id)
);
CREATE INDEX idx_sheet_rows_sheet ON sheet_rows(sheet_id);
CREATE INDEX idx_sheet_rows_doc ON sheet_rows(doc_id);

CREATE TABLE sheet_cells (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  row_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text'
    CHECK (value_type IN ('text', 'number', 'date', 'currency', 'boolean', 'formula', 'entity', 'compliance', 'proof_linked')),
  raw_value TEXT,
  computed_value TEXT,
  entity_id TEXT,
  source_type TEXT DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'extraction', 'formula', 'ai', 'jaal', 'import')),
  source_ref TEXT,
  confidence REAL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id),
  FOREIGN KEY (row_id) REFERENCES sheet_rows(id)
);
CREATE INDEX idx_sheet_cells_sheet ON sheet_cells(sheet_id);
CREATE INDEX idx_sheet_cells_row ON sheet_cells(row_id);
CREATE INDEX idx_sheet_cells_entity ON sheet_cells(entity_id);

CREATE TABLE sheet_cell_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  change_type TEXT DEFAULT 'edit'
    CHECK (change_type IN ('edit', 'formula_recalc', 'extraction_update', 'ai_fill', 'import', 'jaal_capture')),
  changed_by TEXT,
  changed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  source_type TEXT,
  source_ref TEXT,
  FOREIGN KEY (cell_id) REFERENCES sheet_cells(id),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id)
);
CREATE INDEX idx_sheet_cell_history_cell ON sheet_cell_history(cell_id);
CREATE INDEX idx_sheet_cell_history_sheet ON sheet_cell_history(sheet_id);

CREATE TABLE sheet_permissions (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('sheet', 'row', 'column')),
  scope_id TEXT,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'admin')),
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id)
);
CREATE INDEX idx_sheet_permissions_sheet ON sheet_permissions(sheet_id);
CREATE INDEX idx_sheet_permissions_user ON sheet_permissions(user_id);

CREATE TABLE sheet_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'custom'
    CHECK (category IN ('due_diligence', 'compliance', 'obligation', 'negotiation', 'invoice', 'meeting', 'risk', 'custom')),
  column_defs_json TEXT NOT NULL,
  sample_data_json TEXT,
  formula_defs_json TEXT,
  is_system INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX idx_sheet_templates_workspace ON sheet_templates(workspace_id);
```

**API Endpoints:**
```
POST   /workspaces/:wid/sheets              — Create sheet
GET    /workspaces/:wid/sheets              — List workspace sheets
GET    /sheets/:id                          — Get sheet with data
PATCH  /sheets/:id                          — Update sheet metadata
DELETE /sheets/:id                          — Soft-delete sheet
POST   /sheets/:id/rows                    — Add row(s)
PATCH  /sheets/:id/rows/:rid               — Update row
DELETE /sheets/:id/rows/:rid               — Delete row
PATCH  /sheets/:id/cells                   — Bulk update cells
GET    /sheets/:id/cells/:cid/history      — Cell provenance history
```

**Acceptance Criteria:**
- `'sheets'` registered as product in both frontend and backend registries
- `ENABLED_PRODUCTS=sheets` enables sheets routes; omitting disables them
- CRUD operations work: create, list, get, update, delete sheets
- Cell updates recorded in history table
- Migration runs successfully
- `npx tsc --noEmit` passes

**Dependencies:** None

---

### Slice SH2: Grid Rendering Engine

**Files to create:**
- `KACHERI FRONTEND/src/components/sheets/SheetGrid.tsx`
- `KACHERI FRONTEND/src/components/sheets/CellRenderer.tsx`
- `KACHERI FRONTEND/src/components/sheets/CellEditor.tsx`
- `KACHERI FRONTEND/src/components/sheets/ColumnHeader.tsx`
- `KACHERI FRONTEND/src/components/sheets/RowHeader.tsx`
- `KACHERI FRONTEND/src/components/sheets/FormulaBar.tsx`
- `KACHERI FRONTEND/src/components/sheets/sheetGrid.css`
- `KACHERI FRONTEND/src/SheetPage.tsx`

**Scope:**
- Virtualized grid component using `react-window` for 100K+ row performance
- Cell types: text, number, date, currency, boolean, formula (extensible for entity, compliance, proof_linked in later slices)
- Keyboard navigation: arrow keys move selection, Tab moves right, Enter moves down, Escape cancels edit
- Cell selection: single click, Shift+click range, Ctrl+click multi-select
- Column resize by dragging header border, row height auto-fit from content
- Copy/paste: Ctrl+C/V for cells and ranges, tab-delimited clipboard format
- Column sorting (click header), column filtering (dropdown per column)
- Formula bar at top shows selected cell's raw value/formula
- Freeze rows/columns (first row/column header click)

**Acceptance Criteria:**
- Grid renders 100K rows without lag (virtualized, only visible rows in DOM)
- All cell types render correctly with type-appropriate formatting
- Keyboard navigation works across all cell types
- Selection, copy/paste, sort, filter all functional
- Formula bar displays and edits cell content
- `npx tsc --noEmit` passes

**Dependencies:** SH1

---

### Slice SH3: Formula Engine & Cell Types

**Files to create:**
- `KACHERI BACKEND/src/sheets/formulaEngine.ts`
- `KACHERI BACKEND/src/sheets/formulaParser.ts`
- `KACHERI BACKEND/src/sheets/cellTypes.ts`
- `KACHERI BACKEND/src/sheets/dependencyGraph.ts`

**Scope:**
- Expression parser supporting A1 cell references (`=A1+B2`), ranges (`=SUM(A1:A100)`), and named functions
- Standard functions: `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `IF`, `AND`, `OR`, `NOT`, `CONCAT`, `LEFT`, `RIGHT`, `LEN`, `TRIM`, `ROUND`, `NOW`, `TODAY`, `DATEDIF`, `IFERROR`
- Cell dependency graph: tracks which cells depend on which. On cell update, recalculates dependents in topological order
- Circular reference detection: formulas creating cycles return `#CIRCULAR` error
- Formula evaluation runs server-side (authoritative source of truth). Client shows optimistic preview
- Cell type coercion: numbers formatted per locale, dates formatted per preference, currency with symbol

**Acceptance Criteria:**
- All standard functions evaluate correctly
- Cell references resolve correctly (A1 notation)
- Dependency graph recalculates on edit (change A1 → B1 referencing A1 updates)
- Circular references detected and reported
- Formula errors displayed in cell (`#REF`, `#VALUE`, `#CIRCULAR`, `#DIV/0`)
- `npx tsc --noEmit` passes

**Dependencies:** SH1

---

### Slice SH4: Sheet List Page & CRUD UX

**Files to create:**
- `KACHERI FRONTEND/src/SheetsListPage.tsx`
- `KACHERI FRONTEND/src/components/sheets/SheetCard.tsx`
- `KACHERI FRONTEND/src/components/sheets/CreateSheetDialog.tsx`
- `KACHERI FRONTEND/src/components/sheets/sheetsListPage.css`

**Scope:**
- Workspace-scoped sheet listing page at `/workspaces/:wid/sheets`
- Sheet cards showing: title, row count, last modified timestamp, source type badge (blank/extraction/import/template/negotiation), creator
- Create sheet dialog with options:
  - **Blank sheet** — empty grid with configurable columns
  - **From template** — template gallery (SH20 adds full gallery, SH4 provides blank + basic)
  - **From document extraction** — only visible when `isProductEnabled('docs')` (SH6 implements)
  - **From negotiation** — only visible when `isProductEnabled('docs')` (SH10 implements)
  - **Import CSV/XLSX** — (SH5 implements)
- Rename, duplicate, delete (soft) sheets
- Multi-tab workbook: sheets can contain multiple tabs (stored as separate sheet records with parent_id)

**Acceptance Criteria:**
- Sheet list page renders with correct cards
- Create blank sheet works end-to-end
- Rename, duplicate, delete functional
- Source type badges display correctly
- Cross-product creation options hidden when products disabled
- `npx tsc --noEmit` passes

**Dependencies:** SH1, SH2

---

### Slice SH5: CSV & XLSX Import/Export

**Files to create:**
- `KACHERI BACKEND/src/sheets/importCsv.ts`
- `KACHERI BACKEND/src/sheets/importXlsx.ts`
- `KACHERI BACKEND/src/sheets/exportCsv.ts`
- `KACHERI BACKEND/src/sheets/exportXlsx.ts`
- `KACHERI FRONTEND/src/components/sheets/ImportDialog.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Import/export endpoints

**New API Endpoints:**
```
POST /sheets/:id/import        — Upload CSV/XLSX file, populate sheet
GET  /sheets/:id/export?format=csv|xlsx  — Download sheet as CSV or XLSX
```

**Scope:**
- CSV import: auto-detect delimiter (comma, semicolon, tab), auto-detect column types (number, date, text), preview first 10 rows before confirming
- XLSX import: preserve cell types and basic formulas, import first sheet (or user-selected sheet)
- CSV export: UTF-8, configurable delimiter
- XLSX export: preserves types, adds "Provenance" metadata sheet listing cell sources
- Import creates provenance record: `recordProvenance({ action: 'sheet:import', details: { filename, hash, rowCount } })`

**Acceptance Criteria:**
- CSV import works with comma, semicolon, tab delimiters
- XLSX import preserves number/date/text types
- Export produces valid CSV/XLSX files
- Provenance metadata sheet included in XLSX export
- Import recorded in provenance system
- `npx tsc --noEmit` passes

**Dependencies:** SH1, SH3

---

### Phase I: Platform Intelligence Integration (Slices SH6–SH11)

*Cross-product features that connect Sheets to the document intelligence platform. Each feature is gated by its dependency product — Sheets works as standalone without these.*

---

### Slice SH6: Document-to-Sheet Extraction Pipeline

**Files to create:**
- `KACHERI BACKEND/src/sheets/extractionBridge.ts`
- `KACHERI FRONTEND/src/components/sheets/ExtractToSheetDialog.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Add extraction-to-sheet endpoints
- `KACHERI FRONTEND/src/components/sheets/CreateSheetDialog.tsx` — Add "From Documents" option (visible only when `isProductEnabled('docs')`)

**New API Endpoints:**
```
POST /workspaces/:wid/sheets/from-extraction  — Bulk: select docs → create sheet from extractions
POST /sheets/:id/rows/from-doc/:docId         — Add single doc's extraction as new row
```

**Scope:**
- "Create Sheet from Documents" flow: user selects workspace documents → extraction runs (or uses cached results) → results populate sheet rows
- Column definitions auto-generated from extraction schema per document type:
  - Contract → parties, effective_date, expiration_date, term_length, governing_law, liability_limit, payment_terms, auto_renewal, termination_clause
  - Invoice → vendor, customer, invoice_number, issue_date, due_date, subtotal, tax, total, currency
  - Proposal → vendor, client, date, valid_until, total_pricing, deliverables_count
  - (Similar for meeting_notes, report, other)
- Each row links to source `doc_id`. Each cell links to extraction `field_path`
- Confidence scores displayed as cell background color: green (>0.8), yellow (0.5-0.8), red (<0.5)
- Click any cell → navigate to source clause in the original document
- Supports bulk extraction: 50+ documents into a comparison matrix
- Cell `source_type` set to `'extraction'`, `source_ref` contains `extraction_id`

**Acceptance Criteria:**
- Select 10 contracts → sheet created with correct columns and extracted values
- Confidence indicators display correctly
- Click cell → navigates to source document
- Bulk extraction handles 50+ documents
- Feature hidden when `docs` product disabled
- API returns 404 when `docs` disabled
- `npx tsc --noEmit` passes

**Dependencies:** SH1, SH2

---

### Slice SH7: Entity-Aware Cells & Memory Graph Linking

**Files to create:**
- `KACHERI FRONTEND/src/components/sheets/EntityCell.tsx`
- `KACHERI FRONTEND/src/components/sheets/EntityHoverCard.tsx`
- `KACHERI FRONTEND/src/hooks/useEntityResolution.ts`

**Files to modify:**
- `KACHERI FRONTEND/src/components/sheets/CellRenderer.tsx` — Add `entity` cell type rendering
- `KACHERI BACKEND/src/routes/sheets.ts` — Entity resolution endpoint

**New API Endpoint:**
```
GET /workspaces/:wid/sheets/resolve-entity?name=<text>  — Resolve name to canonical entity
```

**Scope:**
- New cell type: `entity` — stores `entity_id` reference + display name
- Auto-resolution: typing a name triggers debounced lookup against `workspace_entities` (normalized name matching with existing dedup logic)
- Autocomplete dropdown shows matching entities with type badges
- Entity hover card shows: entity type, mention count, document count, aliases, top related entities, link to Knowledge Explorer
- Deduplication: "Acme Corp" and "ACME Corporation" resolve to same canonical entity
- Entity cells contribute to Memory Graph: `entity_mentions` created with `product_source: 'sheets'`
- Falls back to plain text cell when `memoryGraph` feature flag disabled

**Acceptance Criteria:**
- Type "Acme" → autocomplete shows matching entities
- Select entity → cell stores entity_id and displays name
- Hover → entity card with cross-product information
- Entity mentions created with `product_source: 'sheets'`
- Falls back to text cell when Memory Graph disabled
- `npx tsc --noEmit` passes

**Dependencies:** SH2

---

### Slice SH8: Legal Domain Formula Functions

**Files to create:**
- `KACHERI BACKEND/src/sheets/legalFormulas.ts`

**Files to modify:**
- `KACHERI BACKEND/src/sheets/formulaEngine.ts` — Register legal domain functions

**New Functions:**
| Function | Description | Product Gate |
|----------|-------------|-------------|
| `EXTRACT(doc_id, field_path)` | Pull field value from document extraction | `docs` |
| `COMPLIANCE_SCORE(doc_id, policy_id?)` | Live compliance status: "passed"/"failed"/score | `docs` |
| `ENTITY_MENTIONS(entity_name)` | Count mentions across workspace | `memoryGraph` |
| `DAYS_UNTIL(doc_id, date_field)` | Days until extracted date (negative if past) | `docs` |
| `CLAUSE_MATCH(text, library_id?)` | Match text against clause library, returns similarity 0-1 | `docs` |
| `NEGOTIATION_DELTA(session_id, field)` | Value change from previous negotiation round | `docs` |
| `DOC_VERSION_COUNT(doc_id)` | Number of document versions | `docs` |
| `RELATED_DOCS(doc_id, limit?)` | Count of related documents via shared entities | `memoryGraph` |

**Scope:**
- Each function calls existing backend services: extraction store, compliance engine, knowledge graph, clause matcher, negotiation store
- Results cached per-evaluation with 60-second TTL to avoid excessive backend calls
- Functions that call AI (e.g., CLAUSE_MATCH with AI similarity) produce proof packets
- When dependency product is disabled, function returns `#UNAVAILABLE` error with explanatory message
- Functions usable in any formula: `=IF(COMPLIANCE_SCORE(A1)="passed", "OK", "REVIEW")`

**Acceptance Criteria:**
- All 8 functions evaluate correctly with valid inputs
- `#UNAVAILABLE` returned when dependency product disabled
- Results cached (second evaluation within 60s returns cached value)
- AI-backed functions produce proof packets
- Functions compose with standard formulas
- `npx tsc --noEmit` passes

**Dependencies:** SH3

---

### Slice SH9: Compliance-as-a-Column

**Files to create:**
- `KACHERI BACKEND/src/sheets/complianceColumn.ts`
- `KACHERI FRONTEND/src/components/sheets/ComplianceCell.tsx`
- `KACHERI FRONTEND/src/components/sheets/ComplianceBadge.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/components/sheets/CellRenderer.tsx` — Add `compliance` cell type
- `KACHERI BACKEND/src/routes/sheets.ts` — Compliance column endpoints

**New API Endpoints:**
```
POST /sheets/:id/compliance/check-all  — Run compliance checks on all linked documents
GET  /sheets/:id/compliance/status     — Get compliance status for all rows
```

**Scope:**
- New cell type: `compliance` — auto-computed from compliance engine
- When a sheet row links to a `doc_id`, compliance columns auto-populate with pass/fail/warning per policy
- Badge colors: green (passed), red (failed), yellow (warning), gray (not checked)
- Click badge → popover showing per-policy breakdown (policy name, rule type, status, message)
- Column filterable: "show only failed" / "show only warnings"
- Auto-refresh: when document changes or policy updates, compliance cells recompute via WebSocket event
- "Re-check All" button runs bulk compliance across all linked documents
- Column type hidden when `docs` product disabled

**Acceptance Criteria:**
- Compliance badges display correctly for linked documents
- Click badge shows per-policy detail
- Filter by compliance status works
- "Re-check All" updates all rows
- Auto-refresh on document/policy change
- Hidden when `docs` product disabled
- `npx tsc --noEmit` passes

**Dependencies:** SH6

---

### Slice SH10: Negotiation Comparison Matrices

**Files to create:**
- `KACHERI BACKEND/src/sheets/negotiationBridge.ts`
- `KACHERI FRONTEND/src/components/sheets/NegotiationSheetDialog.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Negotiation-to-sheet endpoint
- `KACHERI FRONTEND/src/components/sheets/CreateSheetDialog.tsx` — Add "From Negotiation" option (visible only when `isProductEnabled('docs')`)

**New API Endpoint:**
```
POST /workspaces/:wid/sheets/from-negotiation/:sessionId  — Generate comparison matrix
```

**Scope:**
- Auto-generate sheet from negotiation session data
- Rows = substantive changes (from `negotiation_changes` where `category='substantive'`)
- Columns = round numbers (from `negotiation_rounds`)
- Cells = `proposed_text` per round, with diff highlighting against previous round
- Additional columns: status (pending/accepted/rejected/countered), risk_level, section_heading
- Color coding: accepted=green, rejected=red, countered=yellow, pending=gray
- Click cell → navigate to the change in the document at that specific round
- Summary row at top: total changes count, acceptance rate, risk distribution
- Sheet `source_type` set to `'negotiation'`, `source_ref` contains `session_id`

**Acceptance Criteria:**
- Select negotiation session → comparison matrix generated
- Round columns show correct proposed text per round
- Status and risk columns display with color coding
- Click cell navigates to source change in document
- Summary row computes correctly
- Feature hidden when `docs` product disabled
- `npx tsc --noEmit` passes

**Dependencies:** SH1, SH2

---

### Slice SH11: JAAL Research Capture to Sheet

**Files to create:**
- `KACHERI FRONTEND/src/components/sheets/JaalCaptureButton.tsx`
- `KACHERI FRONTEND/src/components/sheets/ProofLinkedCell.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/components/jaal/ResearchSessionControls.tsx` (from S4) — Add "Capture to Sheet" action
- `KACHERI BACKEND/src/routes/sheets.ts` — JAAL capture endpoint

**New API Endpoint:**
```
POST /sheets/:id/cells/from-jaal  — Insert cell value with JAAL proof
Body: { rowId, columnId, value, jaalSessionId, sourceUrl, proofId, trustScore }
```

**Scope:**
- During JAAL research session, "Capture to Sheet" button appears in Research Session Controls
- User selects text on page → chooses target sheet and cell → data inserted with metadata:
  - Source URL at capture time
  - Capture timestamp
  - JAAL `session_id`
  - `proof_id` (cryptographic proof of page content at that moment)
  - Trust HUD score
- New cell type: `proof_linked` — displays value with small proof icon
- Click proof icon → view proof detail: URL, timestamp, content hash, Trust score, link to JAAL session
- Cell `source_type` set to `'jaal'`, `source_ref` contains `proof_id`
- Works on all platforms: desktop uses local JAAL proof, mobile/web use JAAL backend service
- Feature hidden when `jaal` product disabled

**Acceptance Criteria:**
- "Capture to Sheet" button visible during JAAL session
- Captured data appears in target cell with proof icon
- Click proof icon shows proof detail
- Cell history records JAAL source
- Feature hidden when `jaal` product disabled
- API returns 404 when `jaal` disabled
- `npx tsc --noEmit` passes

**Dependencies:** SH2, S4 (JAAL React UI), S5 (JAAL Backend Service)

---

### Phase J: Collaboration & Provenance (Slices SH12–SH14)

*Real-time collaboration, cell-level audit trails, and granular access control. These are Sheets core features — no cross-product dependencies.*

---

### Slice SH12: Real-Time Collaboration via Yjs

**Files to create:**
- `KACHERI FRONTEND/src/hooks/useSheetsCollaboration.ts`
- `KACHERI FRONTEND/src/components/sheets/CollaboratorCursors.tsx`
- `KACHERI FRONTEND/src/components/sheets/CellLockIndicator.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/realtime/types.ts` — Add sheet collaboration event types
- `KACHERI BACKEND/src/realtime/workspaceWs.ts` — Handle sheet lock/presence events
- `KACHERI FRONTEND/src/components/sheets/SheetGrid.tsx` — Integrate collaboration overlay

**New WebSocket Events:**
```
Client → Server:
  { type: 'sheet_join', sheetId }
  { type: 'sheet_leave' }
  { type: 'sheet_cell_focus', sheetId, cellId }
  { type: 'sheet_cell_lock', sheetId, cellId, action: 'acquire' | 'release' }

Server → Client:
  { type: 'sheet_presence', sheetId, userId, cellId, action: 'viewing' | 'editing' | 'left' }
  { type: 'sheet_cell_lock', sheetId, cellId, userId, action: 'acquired' | 'released' }
  { type: 'sheet_cell_update', sheetId, cellId, value, updatedBy }
```

**Scope:**
- Yjs `Y.Map` for sheet cell data — CRDT-based conflict-free synchronization
- Cell locking: editing a cell acquires a lock (45s refresh interval, 60s server timeout — same pattern as canvas frame locks)
- Collaborator cursors: colored cell highlights showing where other users are focused
- Presence sidebar: list of users currently viewing the sheet
- Optimistic local updates with server reconciliation
- Auto-release locks on disconnect or inactivity

**Acceptance Criteria:**
- Two users open same sheet → see each other's cursor positions
- Editing a cell acquires lock visible to others
- Cell edits sync in real-time across clients
- Locks auto-release on disconnect
- No data loss on concurrent edits (CRDT merge)
- `npx tsc --noEmit` passes

**Dependencies:** SH2

---

### Slice SH13: Cell-Level Provenance & Audit Trail

**Files to create:**
- `KACHERI FRONTEND/src/components/sheets/CellHistory.tsx`
- `KACHERI FRONTEND/src/components/sheets/ProvenanceTimeline.tsx`
- `KACHERI FRONTEND/src/components/sheets/cellHistory.css`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Cell history query endpoints
- `KACHERI BACKEND/src/store/sheetCellHistory.ts` — History query functions

**New API Endpoints:**
```
GET /sheets/:id/cells/:cellId/history?limit=50&before=<ts>  — Cell change history
GET /sheets/:id/provenance?limit=100&before=<ts>            — Sheet-level provenance timeline
```

**Scope:**
- Every cell change automatically recorded in `sheet_cell_history` with: previous_value, new_value, change_type, changed_by, source_type, source_ref
- Right-click cell → "View History" opens timeline panel:
  - Each entry shows: actor name, timestamp, old → new value, source badge
  - Color-coded by source: blue (manual), green (extraction), purple (AI), orange (JAAL), gray (import), teal (formula recalc)
  - Click entry → navigate to source context (source document for extraction, proof packet for AI/JAAL)
- Sheet-level provenance timeline: combines all cell changes across the sheet, sorted by time
- Provenance also recorded via existing `recordProvenance()` system: `action: 'sheet:cell:update'`
- Audit log entries created for sheet-level actions: create, delete, share, permission change

**Acceptance Criteria:**
- Cell history shows complete change timeline
- Source type badges display correctly
- Click extraction source → navigates to source document
- Sheet-level timeline shows combined activity
- Provenance entries created for all cell changes
- History paginated correctly
- `npx tsc --noEmit` passes

**Dependencies:** SH1

---

### Slice SH14: Granular Permissions — Row & Column Level

**Files to create:**
- `KACHERI BACKEND/src/store/sheetPermissions.ts`
- `KACHERI FRONTEND/src/components/sheets/PermissionsDialog.tsx`
- `KACHERI FRONTEND/src/components/sheets/permissionsDialog.css`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Permission CRUD endpoints
- `KACHERI FRONTEND/src/components/sheets/SheetGrid.tsx` — Permission-aware cell rendering
- `KACHERI FRONTEND/src/components/sheets/CellEditor.tsx` — Respect edit restrictions

**New API Endpoints:**
```
GET  /sheets/:id/permissions             — Get permission rules
PUT  /sheets/:id/permissions             — Update permission rules (admin only)
GET  /sheets/:id/permissions/effective    — Get effective permissions for current user
```

**Scope:**
- Three permission scopes: sheet-level (view/edit/admin), row-level (per `row_id`), column-level (per `column_id`)
- Permission resolution: most specific wins (column-level > row-level > sheet-level)
- Read-restricted cells display `[Restricted]` placeholder with lock icon
- Edit-restricted cells are non-editable: gray background, no cursor on hover
- Admin can configure rules like: "Financial columns visible only to admin role"
- Share dialog for external sharing with column redaction selection
- Permissions respect workspace role hierarchy (workspace admin always has full access)

**Acceptance Criteria:**
- Column-level restriction hides values for restricted users
- Row-level restriction hides entire rows for restricted users
- Edit restriction prevents cell editing but allows viewing
- Most-specific permission wins (column override beats sheet-level)
- Admin can configure and preview permissions
- Workspace admin bypasses all restrictions
- `npx tsc --noEmit` passes

**Dependencies:** SH1

---

### Phase K: AI & Advanced Intelligence (Slices SH15–SH17)

*AI-powered features that operate on sheet data. NL queries and AI reports work on any sheet. Obligation tracker integrates with extraction when docs product is enabled.*

---

### Slice SH15: Natural Language Sheet Queries

**Files to create:**
- `KACHERI BACKEND/src/sheets/nlQueryEngine.ts`
- `KACHERI FRONTEND/src/components/sheets/QueryBar.tsx`
- `KACHERI FRONTEND/src/components/sheets/queryBar.css`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — NL query endpoint

**New API Endpoint:**
```
POST /sheets/:id/query
Body: { prompt: "show all contracts expiring next month where liability cap is below $1M" }
Response: { filterSpec: {...}, sortSpec: {...}, explanation: "..." }
```

**Scope:**
- Natural language query bar above the grid (keyboard shortcut: Ctrl+Q)
- User types a question → AI translates to filter/sort/aggregate operations on sheet data
- AI uses existing `modelRouter` for LLM calls
- AI context includes: column definitions (names, types), sample data (first 5 rows), available formula functions, entity types in cells
- Query produces structured filter spec → applied directly to grid (no separate results view)
- Query history saved per-user per-sheet, accessible via dropdown
- Every AI query produces a proof packet: input prompt hash → output filter spec → model used
- Works on any sheet (standalone or extraction-based)

**Acceptance Criteria:**
- Type "show expired contracts" → grid filters to rows where expiration_date < today
- Type "sort by total value descending" → grid sorts correctly
- Query history dropdown shows previous queries
- Proof packet created for each query
- Works on sheets without extraction (pure text/number data)
- `npx tsc --noEmit` passes

**Dependencies:** SH3, SH6

---

### Slice SH16: Verifiable AI-Generated Reports

**Files to create:**
- `KACHERI BACKEND/src/sheets/reportGenerator.ts`
- `KACHERI FRONTEND/src/components/sheets/GenerateReportDialog.tsx`
- `KACHERI FRONTEND/src/components/sheets/ReportPreview.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Report generation endpoint

**New API Endpoint:**
```
POST /sheets/:id/generate-report
Body: { prompt: "Summarize due diligence findings and highlight high-risk contracts" }
Response: { report: { sections: [...], proof: {...} } }
```

**Scope:**
- "Generate Report" action available on any sheet via toolbar button
- User provides prompt describing desired report
- AI analyzes all sheet data (column definitions + all cell values) and generates structured report:
  - Executive summary
  - Key findings (bulleted)
  - Data tables (subset of sheet data relevant to prompt)
  - Risk highlights (if applicable)
  - Recommendations (if applicable)
- Every generated claim links back to source cells: `{ cellId, value, rowId, columnId }`
- Report includes proof packet: SHA256 of input data + prompt → model → SHA256 of output
- Report can be:
  - Viewed in preview modal
  - Exported as PDF
  - Inserted as new Kacheri Doc (when `docs` product enabled)
- Works with any sheet but optimized for extraction-based sheets (richer context)

**Acceptance Criteria:**
- Report generates from sheet data with structured sections
- Source cell links are clickable and navigate correctly
- Proof packet included with valid hashes
- PDF export works
- Insert as Doc works when `docs` enabled, hidden when disabled
- `npx tsc --noEmit` passes

**Dependencies:** SH6, SH13

---

### Slice SH17: Obligation Tracker with Deadline Notifications

**Files to create:**
- `KACHERI BACKEND/src/sheets/obligationTracker.ts`
- `KACHERI FRONTEND/src/components/sheets/ObligationSheet.tsx`
- `KACHERI FRONTEND/src/components/sheets/DeadlineIndicator.tsx`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Obligation-specific endpoints
- `KACHERI BACKEND/src/jobs/workers/reminderWorker.ts` — Add sheet deadline reminders

**Scope:**
- Specialized sheet template "Obligation Tracker" (registered as system template)
- When `docs` product enabled: auto-populates from extraction results — rows = obligations extracted from contracts (`keyObligations` field)
- When `docs` product disabled: manual-only mode (user enters obligations by hand)
- Columns: obligation text, source document (entity-linked), responsible party (entity-linked), deadline (date), status (pending/in_progress/complete/overdue), compliance status (computed when available)
- Deadline column triggers notification reminders via existing notification infrastructure: 7 days, 3 days, 1 day before deadline
- Overdue rows highlighted with red background
- Dependency tracking: if obligation A depends on obligation B (linked via knowledge graph relationships), dependency chain shown as expandable tree
- Dashboard summary row at top: X pending, Y overdue, Z completed, next deadline
- Status updates via dropdown (pending → in_progress → complete) with audit trail

**Acceptance Criteria:**
- Template creates obligation tracker sheet
- Auto-populate works from contract extractions (when docs enabled)
- Manual mode works without docs product
- Deadline notifications fire at correct intervals
- Overdue highlighting works
- Status transitions recorded in history
- Dashboard summary computes correctly
- `npx tsc --noEmit` passes

**Dependencies:** SH6, SH7, SH9

---

### Phase L: Views, Templates & Polish (Slices SH18–SH21)

*Alternative views, template library, and platform integration. Completes the Sheets product.*

---

### Slice SH18: Mobile Card View

**Files to create:**
- `KACHERI FRONTEND/src/components/sheets/CardView.tsx`
- `KACHERI FRONTEND/src/components/sheets/RecordCard.tsx`
- `KACHERI FRONTEND/src/components/sheets/cardView.css`

**Files to modify:**
- `KACHERI FRONTEND/src/SheetPage.tsx` — Add view switcher (Grid / Card / Dashboard)

**Scope:**
- On mobile (detected via `useDeploymentContext()` or `max-width: 768px` media query), default to card view instead of grid
- Each sheet row becomes a swipeable card:
  - Card header: first column value (typically title/name)
  - Card body: remaining fields with type-appropriate rendering (entity badges, compliance badges, deadline indicators, proof icons)
  - Card footer: source document link, last modified
- Tap card → expand to full record view with all fields editable
- Swipe actions: mark complete (for obligation tracker), flag for review
- Quick-edit mode: tap any field on expanded card to edit inline
- View switcher available on all devices: users can toggle between Grid and Card on desktop too
- Touch-optimized: 48px minimum tap targets, swipe gestures, pull-to-refresh

**Acceptance Criteria:**
- Card view renders correctly on mobile (375px, 390px, 768px)
- All cell types render appropriately in card format
- Swipe actions work on touch devices
- Expand/collapse cards works
- Inline editing works on expanded cards
- View switcher toggles between Grid/Card on any device
- `npx tsc --noEmit` passes

**Dependencies:** SH2, S1 (deployment context)

---

### Slice SH19: Dashboard View with Charts

**Files to create:**
- `KACHERI FRONTEND/src/components/sheets/DashboardView.tsx`
- `KACHERI FRONTEND/src/components/sheets/ChartWidget.tsx`
- `KACHERI FRONTEND/src/components/sheets/KpiWidget.tsx`
- `KACHERI FRONTEND/src/components/sheets/dashboardView.css`

**Files to modify:**
- `KACHERI FRONTEND/src/SheetPage.tsx` — Add Dashboard to view switcher

**Scope:**
- Dashboard view renders computed visualizations from sheet data
- Chart types (lightweight SVG rendering, no heavy charting library):
  - Bar chart (vertical/horizontal)
  - Line chart (with trend line)
  - Pie / donut chart
  - Stacked bar
- KPI widgets: single number with trend arrow and subtitle (e.g., "47 contracts | +5 this week")
- Auto-suggested charts based on column types:
  - Date column → timeline/line chart
  - Currency/number column → bar chart
  - Boolean/status column → pie chart
  - Entity column → frequency bar chart
- User can: add/remove widgets, rearrange via drag, configure data source per widget
- Dashboard refreshes live as sheet data changes
- Exportable as PNG (for reports/presentations)

**Acceptance Criteria:**
- All 4 chart types render correctly
- KPI widgets compute from sheet data
- Auto-suggestion produces sensible defaults
- Drag-to-rearrange works
- Live refresh on data change
- PNG export works
- `npx tsc --noEmit` passes

**Dependencies:** SH2

---

### Slice SH20: Template Library & Inheritance

**Files to create:**
- `KACHERI FRONTEND/src/components/sheets/TemplateGallery.tsx`
- `KACHERI FRONTEND/src/components/sheets/templateGallery.css`

**Files to modify:**
- `KACHERI BACKEND/src/routes/sheets.ts` — Template CRUD endpoints
- `KACHERI BACKEND/src/store/sheetTemplates.ts` — Template store functions
- `KACHERI FRONTEND/src/components/sheets/CreateSheetDialog.tsx` — Add "From Template" with gallery UI

**New API Endpoints:**
```
GET  /workspaces/:wid/sheet-templates              — List templates (system + custom)
POST /workspaces/:wid/sheet-templates              — Create custom template
GET  /workspaces/:wid/sheet-templates/:tid         — Get template detail
POST /workspaces/:wid/sheet-templates/:tid/derive  — Create sheet from template
POST /sheets/:id/pull-template-update              — Pull updates from parent template
POST /sheets/:id/save-as-template                  — Save sheet as custom template
```

**Built-in System Templates:**
| Template | Category | Columns | Requires |
|----------|----------|---------|----------|
| Due Diligence Checklist | due_diligence | document, type, status, assignee, notes, deadline | `docs` |
| Contract Comparison Matrix | due_diligence | Auto from extraction schema | `docs` |
| Compliance Scorecard | compliance | document, policy columns (auto from policies) | `docs` |
| Obligation Tracker | obligation | obligation, source, party, deadline, status, compliance | `docs` |
| Negotiation Summary | negotiation | clause, round columns, status, risk | `docs` |
| Invoice Register | invoice | vendor, number, date, amount, status, notes | Standalone |
| Meeting Action Items | meeting | task, assignee, deadline, status, meeting_date | Standalone |
| Risk Register | risk | risk, severity, likelihood, impact, mitigation, owner | Standalone |

**Template Inheritance:**
- Derived sheets track `template_id` reference to parent template
- When parent template is updated (e.g., admin adds new column), derived sheets can "Pull Update":
  - Non-destructive: adds new columns, never removes existing data
  - Preview diff before applying
  - Local data preserved, only structure changes applied
- Custom templates: user can save any sheet as a workspace template for reuse

**Acceptance Criteria:**
- Template gallery shows system + custom templates
- System templates visible only when their product dependency is enabled
- Create sheet from template populates correct columns
- "Pull Update" adds new columns without data loss
- Custom template creation works
- `npx tsc --noEmit` passes

**Dependencies:** SH1, SH4

---

### Slice SH21: Sheet Settings & Platform Integration

**Files to modify:**
- `KACHERI FRONTEND/src/SheetPage.tsx` — Settings panel
- `KACHERI FRONTEND/src/HomePage.tsx` (from S2) — Add Sheets product card (gated by `isProductEnabled('sheets')`)
- `KACHERI FRONTEND/src/components/AppLayout.tsx` — Add Sheets navigation link (gated)
- `KACHERI BACKEND/src/routes/activityFeed.ts` (from S3) — Include sheet activity in feed

**Scope:**
- Sheet settings panel (gear icon in toolbar):
  - Default view preference: Grid / Card / Dashboard
  - Auto-refresh interval for compliance/formula columns (off / 30s / 60s / 5min)
  - Notification preferences for this sheet (deadline reminders on/off)
- Homepage integration: Sheets product card with icon, description, sheet count
  - Card only visible when `isProductEnabled('sheets')`
  - Click → navigate to sheets list page
- Activity feed integration: sheet creates, edits, shares appear in workspace activity feed
  - `productSource: 'sheets'` for activity items
- Navigation: Sheets accessible from AppLayout sidebar and homepage
- Keyboard shortcuts documented in help modal:
  - `Ctrl+Q` — Open NL query bar
  - `Ctrl+Shift+H` — Toggle cell history panel
  - `Ctrl+G` — Toggle Grid/Card view
  - Standard: arrow keys, Tab, Enter, Escape, Ctrl+C/V

**Acceptance Criteria:**
- Settings panel saves and applies preferences
- Sheets card appears on homepage when product enabled
- Sheet activity appears in workspace activity feed
- Navigation links work from sidebar and homepage
- Keyboard shortcuts documented and functional
- `npx tsc --noEmit` passes

**Dependencies:** SH4, S2 (homepage), S3 (activity feed)

---

## Dependency Graph

```
Phase A: Universal Foundation (all topologies)
  S1 (Context) ─────────────────────────────────┐
  S2 (Homepage) → S1                             │
  S3 (Activity Feed) → S2                        │
                                                   │
Phase B: Product Independence (JAAL + Visual Mode)   │
  S4 (JAAL React UI) → S1                         │
  S5 (JAAL Backend Service) ── (parallel)          │
  S6 (JAAL Desktop Modularize) ── (parallel)       │
  MC1 (Visual Mode: Elements) ── (parallel)        │
  MC2 (Visual Mode: Drag/Resize) → MC1             │
  MC3 (Visual Mode: Layouts) → MC1                 │
  MC4 (Visual Mode: Grid/Group/Layers) → MC2       │
                                                   │
Phase C: Electron Desktop Shell                    │
  S7 (Electron Scaffold) → S1, S2                 │
  S8 (Embedded Backend) → S7                       │
  S9 (Offline Mode) → S8                           │
  S10 (JAAL Desktop Window) → S6, S7              │
  S11 (Shortcuts/Tray) → S7, S10                   │
                                                   │
Phase D: Cross-Product Intelligence                │
  S12 (Studio Push) ── (parallel, no deps)         │
  S13 (JAAL Pull) → S4                             │
  S14 (Notifications) → S12                        │
  S15 (MG Widget) → S2, S12                        │
                                                   │
Phase E: Cloud SaaS                                │
  S16 (Backend Docker) ── (parallel)               │
  S17 (Frontend Docker) → S1                       │
                                                   │
Phase F: Mobile Shell & Native JAAL                │
  S18 (Capacitor Scaffold) → S1, S2               │
  S19 (Android Browser Plugin) → S4, S18           │
  S20 (iOS Browser Plugin) → S4, S18               │
  S21 (Mobile Responsive) → S2, S18                │
                                                   │
Phase G: Settings & Polish                         │
  S22 (Desktop Settings) → S7, S10                 │
  S23 (Web/Mobile Settings) → S2                   │
                                                    │
Phase H: Sheets Foundation                          │
  SH1 (Product Registration + Schema) ── (parallel) │
  SH2 (Grid Rendering Engine) → SH1                │
  SH3 (Formula Engine) → SH1                       │
  SH4 (Sheet List Page + CRUD) → SH1, SH2          │
  SH5 (CSV/XLSX Import/Export) → SH1, SH3          │
                                                    │
Phase I: Platform Intelligence Integration          │
  SH6 (Extraction Pipeline) → SH1, SH2             │
  SH7 (Entity-Aware Cells) → SH2                   │
  SH8 (Legal Domain Formulas) → SH3                │
  SH9 (Compliance-as-a-Column) → SH6               │
  SH10 (Negotiation Matrices) → SH1, SH2           │
  SH11 (JAAL Research Capture) → SH2, S4, S5       │
                                                    │
Phase J: Collaboration & Provenance                 │
  SH12 (Real-Time Collaboration) → SH2             │
  SH13 (Cell-Level Provenance) → SH1               │
  SH14 (Granular Permissions) → SH1                │
                                                    │
Phase K: AI & Advanced Intelligence                 │
  SH15 (NL Sheet Queries) → SH3, SH6              │
  SH16 (AI-Generated Reports) → SH6, SH13          │
  SH17 (Obligation Tracker) → SH6, SH7, SH9        │
                                                    │
Phase L: Views, Templates & Polish                  │
  SH18 (Mobile Card View) → SH2, S1                │
  SH19 (Dashboard View) → SH2                      │
  SH20 (Template Library) → SH1, SH4               │
  SH21 (Settings + Integration) → SH4, S2, S3      │
```

## Execution Order

```
Week 1 (Days 1–5):
  S1 (Context Detection)           — 1 day
  S2 (Homepage Component)          — 2 days
  S5 (JAAL Backend Service)        — 4 days (parallel, starts Day 1)
  S6 (JAAL Desktop Modularize)     — 3 days (parallel, starts Day 1)
  S12 (Studio Entity Push)         — 1 day (parallel)
  S16 (Backend Docker)             — 2 days (parallel)
  MC1 (Visual Mode: Elements)      — 3 days (parallel, starts Day 1)

Week 2 (Days 6–10):
  S3 (Activity Feed)               — 2 days
  S4 (JAAL React UI)               — 4 days (parallel, critical path)
  S7 (Electron Scaffold)           — 2 days
  S17 (Frontend Docker)            — 1 day (parallel)
  MC2 (Visual Mode: Drag/Resize)   — 4 days (parallel, starts Day 6 after MC1)
  MC3 (Visual Mode: Layouts)       — 2 days (parallel, starts Day 6 after MC1)

Week 3 (Days 11–15):
  S8 (Embedded Backend)            — 2 days
  S10 (JAAL Desktop Window)        — 2 days
  S13 (JAAL Pull from MG)          — 2 days (parallel, after S4)
  S14 (Notification Bridge)        — 2 days
  S18 (Capacitor Scaffold)         — 2 days (parallel)
  MC4 (Visual Mode: Grid/Layers)   — 2 days (parallel, starts Day 11 after MC2)

Week 4 (Days 16–20):
  S9 (Offline Mode)                — 2 days
  S11 (Desktop Shortcuts)          — 2 days
  S15 (MG Widget)                  — 1 day
  S19 (Android Browser Plugin)     — 5 days (starts here, continues Week 5)

Week 5 (Days 21–25):
  S19 (Android Browser Plugin)     — (continued)
  S20 (iOS Browser Plugin)         — 5 days (parallel with S19 tail)
  S21 (Mobile Responsive)          — 2 days
  S22 (Desktop Settings)           — 2 days (parallel)
  S23 (Web/Mobile Settings)        — 1 day (parallel)

--- Sheets Track (runs in parallel with Shell Weeks 1–9) ---

Sheets Week 1–2:
  SH1 (Registration + Schema)     — 3 days
  SH2 (Grid Rendering Engine)     — 4 days (after SH1)
  SH3 (Formula Engine)            — 3 days (parallel with SH2)
  SH4 (Sheet List Page + CRUD)    — 2 days (after SH1, SH2)

Sheets Week 3–4:
  SH5 (CSV/XLSX Import/Export)    — 2 days (after SH3)
  SH6 (Extraction Pipeline)       — 3 days (after SH2)
  SH7 (Entity-Aware Cells)        — 3 days (after SH2)
  SH10 (Negotiation Matrices)     — 2 days (parallel)
  SH12 (Real-Time Collaboration)  — 4 days (after SH2)

Sheets Week 5–6:
  SH8 (Legal Domain Formulas)     — 3 days (after SH3)
  SH9 (Compliance-as-a-Column)    — 3 days (after SH6)
  SH13 (Cell-Level Provenance)    — 3 days (after SH1)
  SH14 (Granular Permissions)     — 3 days (after SH1)
  SH11 (JAAL Research Capture)    — 2 days (after SH2 + S4/S5)

Sheets Week 7–8:
  SH15 (NL Sheet Queries)         — 3 days (after SH3, SH6)
  SH16 (AI-Generated Reports)     — 3 days (after SH6, SH13)
  SH17 (Obligation Tracker)       — 3 days (after SH6, SH7, SH9)
  SH18 (Mobile Card View)         — 2 days (after SH2)
  SH19 (Dashboard View)           — 3 days (after SH2)

Sheets Week 9:
  SH20 (Template Library)         — 2 days (after SH1, SH4)
  SH21 (Settings + Integration)   — 2 days (after SH4, S2, S3)
```

## Slice Summary

| Slice | Name | Phase | Est. Days | Dependencies |
|-------|------|-------|-----------|--------------|
| S1 | Deployment Context Detection | A | 1 | None |
| S2 | Universal Homepage Component | A | 2 | S1 |
| S3 | Activity Feed Endpoint & UI | A | 2 | S2 |
| S4 | JAAL React UI Components | B | 4 | S1 |
| S5 | JAAL Backend Service Module | B | 4 | None |
| S6 | JAAL Desktop Main Process Modularization | B | 3 | None |
| MC1 | Visual Mode — Blank Frame Creation & Element Palette | B | 3 | None |
| MC2 | Visual Mode — Drag-and-Drop Positioning & Resize | B | 4 | MC1 |
| MC3 | Visual Mode — Pre-Built Slide Layouts | B | 2 | MC1 |
| MC4 | Visual Mode — Snap-to-Grid, Grouping & Layers | B | 2 | MC2 |
| S7 | Electron Platform Scaffold | C | 2 | S1, S2 |
| S8 | Embedded Backend (Local Mode) | C | 2 | S7 |
| S9 | Desktop Offline Mode & Resilience | C | 2 | S8 |
| S10 | JAAL Desktop Window Integration | C | 2 | S6, S7 |
| S11 | Desktop Product Switching & Shortcuts | C | 2 | S7, S10 |
| S12 | Design Studio Entity Push | D | 1 | None |
| S13 | JAAL Bidirectional Sync — Pull | D | 2 | S4 |
| S14 | Cross-Product Notification Bridge | D | 2 | S12 |
| S15 | Memory Graph Dashboard Widget | D | 1 | S2, S12 |
| S16 | Backend Cloud Deployment Config | E | 2 | None |
| S17 | Frontend SaaS Build & CORS | E | 1 | S1 |
| S18 | Capacitor Mobile Shell Scaffold | F | 2 | S1, S2 |
| S19 | Android Native Browser Plugin | F | 5 | S4, S18 |
| S20 | iOS Native Browser Plugin | F | 5 | S4, S18 |
| S21 | Mobile-Responsive UI & Navigation | F | 2 | S2, S18 |
| S22 | Desktop Settings UI | G | 2 | S7, S10 |
| S23 | Web & Mobile Settings Page | G | 1 | S2 |
| SH1 | Product Registration, DB Schema & API Layer | H | 3 | None |
| SH2 | Grid Rendering Engine | H | 4 | SH1 |
| SH3 | Formula Engine & Cell Types | H | 3 | SH1 |
| SH4 | Sheet List Page & CRUD UX | H | 2 | SH1, SH2 |
| SH5 | CSV & XLSX Import/Export | H | 2 | SH1, SH3 |
| SH6 | Document-to-Sheet Extraction Pipeline | I | 3 | SH1, SH2 |
| SH7 | Entity-Aware Cells & Memory Graph Linking | I | 3 | SH2 |
| SH8 | Legal Domain Formula Functions | I | 3 | SH3 |
| SH9 | Compliance-as-a-Column | I | 3 | SH6 |
| SH10 | Negotiation Comparison Matrices | I | 2 | SH1, SH2 |
| SH11 | JAAL Research Capture to Sheet | I | 2 | SH2, S4, S5 |
| SH12 | Real-Time Collaboration via Yjs | J | 4 | SH2 |
| SH13 | Cell-Level Provenance & Audit Trail | J | 3 | SH1 |
| SH14 | Granular Permissions — Row & Column Level | J | 3 | SH1 |
| SH15 | Natural Language Sheet Queries | K | 3 | SH3, SH6 |
| SH16 | Verifiable AI-Generated Reports | K | 3 | SH6, SH13 |
| SH17 | Obligation Tracker with Deadline Notifications | K | 3 | SH6, SH7, SH9 |
| SH18 | Mobile Card View | L | 2 | SH2, S1 |
| SH19 | Dashboard View with Charts | L | 3 | SH2 |
| SH20 | Template Library & Inheritance | L | 2 | SH1, SH4 |
| SH21 | Sheet Settings & Platform Integration | L | 2 | SH4, S2, S3 |
| | | | | |
| **Shell + Visual Mode** | | **A–G** | **63 days** | |
| **Sheets** | | **H–L** | **58 days** | |
| **Grand Total** | | **A–L** | **121 days** | **48 slices** |

## New Dependencies Required

### BEYLE PLATFORM (Electron Desktop Shell)

| Dependency | Type | Version | Why | Alternatives |
|------------|------|---------|-----|--------------|
| `electron` | runtime | `^30.0.0` | Desktop shell (matches JAAL) | None |
| `electron-builder` | devDependency | `^24.x` | Packaging (future) | `electron-forge` |

### BEYLE MOBILE (Capacitor Mobile Shell)

| Dependency | Type | Version | Why | Alternatives |
|------------|------|---------|-----|--------------|
| `@capacitor/core` | runtime | `^6.x` | Mobile framework | React Native (full rewrite), PWA (limited) |
| `@capacitor/cli` | devDependency | `^6.x` | Build tooling | N/A |
| `@capacitor/ios` | runtime | `^6.x` | iOS platform | N/A |
| `@capacitor/android` | runtime | `^6.x` | Android platform | N/A |
| `@capacitor/status-bar` | runtime | `^6.x` | Status bar | N/A |
| `@capacitor/splash-screen` | runtime | `^6.x` | Launch screen | N/A |

### KACHERI BACKEND (Cloud Topology)

| Dependency | Type | Version | Why | Alternatives |
|------------|------|---------|-----|--------------|
| `pg` | runtime | `^8.x` | PostgreSQL driver | `postgres` (lighter) |
| `@types/pg` | devDependency | `^8.x` | TypeScript types | N/A |
| `cors` | runtime | `^2.x` | CORS middleware | Manual headers |

### KACHERI FRONTEND (JAAL Product)

No new frontend dependencies — JAAL React UI uses existing React + existing component patterns.

### KACHERI FRONTEND (Sheets Product)

| Dependency | Type | Version | Why | Alternatives |
|------------|------|---------|-----|--------------|
| `react-window` | runtime | `^1.8.x` | Virtualized grid rendering for 100K+ rows | `react-virtualized` (heavier), custom IntersectionObserver (more work) |

### KACHERI BACKEND (Sheets Product)

| Dependency | Type | Version | Why | Alternatives |
|------------|------|---------|-----|--------------|
| `xlsx` | runtime | `^0.18.x` | XLSX import/export parsing (Apache-2.0) | `exceljs` (heavier, more features), CSV-only (less capable) |

**All dependencies require approval per CLAUDE.md Section 7.**

---

## Database Migration (Slice S5)

```sql
-- Migration: 020_add_jaal_tables.sql

CREATE TABLE jaal_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'abandoned')),
  action_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_jaal_sessions_workspace ON jaal_sessions(workspace_id);
CREATE INDEX idx_jaal_sessions_user ON jaal_sessions(user_id);
CREATE INDEX idx_jaal_sessions_status ON jaal_sessions(status);

CREATE TABLE jaal_proofs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES jaal_sessions(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_jaal_proofs_session ON jaal_proofs(session_id);
CREATE INDEX idx_jaal_proofs_workspace ON jaal_proofs(workspace_id);
CREATE INDEX idx_jaal_proofs_kind ON jaal_proofs(kind);
```

### Database Migration (Slice SH1)

```sql
-- Migration: 021_add_sheets.sql

CREATE TABLE sheets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  column_defs_json TEXT NOT NULL DEFAULT '[]',
  row_count INTEGER DEFAULT 0,
  source_type TEXT DEFAULT 'blank'
    CHECK (source_type IN ('blank', 'extraction', 'import', 'template', 'negotiation')),
  source_ref TEXT,
  template_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deleted_at INTEGER,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_sheets_workspace ON sheets(workspace_id);
CREATE INDEX idx_sheets_template ON sheets(template_id);

CREATE TABLE sheet_rows (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  doc_id TEXT,
  entity_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id)
);

CREATE INDEX idx_sheet_rows_sheet ON sheet_rows(sheet_id);
CREATE INDEX idx_sheet_rows_doc ON sheet_rows(doc_id);

CREATE TABLE sheet_cells (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  row_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text'
    CHECK (value_type IN ('text', 'number', 'date', 'currency', 'boolean',
                          'formula', 'entity', 'compliance', 'proof_linked')),
  raw_value TEXT,
  computed_value TEXT,
  formula_text TEXT,
  entity_id TEXT,
  source_type TEXT DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'extraction', 'formula', 'ai', 'jaal', 'import')),
  source_ref TEXT,
  confidence REAL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id),
  FOREIGN KEY (row_id) REFERENCES sheet_rows(id)
);

CREATE UNIQUE INDEX idx_sheet_cells_position ON sheet_cells(row_id, column_id);
CREATE INDEX idx_sheet_cells_sheet ON sheet_cells(sheet_id);
CREATE INDEX idx_sheet_cells_entity ON sheet_cells(entity_id);

CREATE TABLE sheet_cell_history (
  id TEXT PRIMARY KEY,
  cell_id TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  change_type TEXT NOT NULL DEFAULT 'edit'
    CHECK (change_type IN ('edit', 'formula_recalc', 'extraction_update',
                           'ai_fill', 'import', 'jaal_capture')),
  changed_by TEXT,
  source_type TEXT,
  source_ref TEXT,
  changed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (cell_id) REFERENCES sheet_cells(id),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id)
);

CREATE INDEX idx_sheet_cell_history_cell ON sheet_cell_history(cell_id);
CREATE INDEX idx_sheet_cell_history_sheet ON sheet_cell_history(sheet_id);

CREATE TABLE sheet_permissions (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('sheet', 'row', 'column')),
  scope_id TEXT,
  user_id TEXT,
  role TEXT,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'admin')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (sheet_id) REFERENCES sheets(id)
);

CREATE INDEX idx_sheet_permissions_sheet ON sheet_permissions(sheet_id);
CREATE INDEX idx_sheet_permissions_user ON sheet_permissions(user_id);

CREATE TABLE sheet_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  column_defs_json TEXT NOT NULL DEFAULT '[]',
  formula_defs_json TEXT,
  formatting_json TEXT,
  is_builtin INTEGER DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_sheet_templates_workspace ON sheet_templates(workspace_id);
CREATE INDEX idx_sheet_templates_category ON sheet_templates(category);
```

---

## API Contract Additions

### JAAL Endpoints (Slice S5)

```
POST   /jaal/sessions                 — Start research session
PATCH  /jaal/sessions/:sid            — Update/end session
GET    /jaal/sessions                 — List sessions
GET    /jaal/sessions/:sid            — Session detail

POST   /jaal/guide/summarize          — AI summarize page
POST   /jaal/guide/extract-links      — AI extract links
POST   /jaal/guide/compare            — AI compare pages

POST   /jaal/proofs                   — Generate proof
GET    /jaal/proofs                   — List proofs
GET    /jaal/proofs/:pid              — Proof detail

GET    /jaal/policy/evaluate          — Evaluate action policy
GET    /jaal/browse?url=<url>         — Proxy-fetch page (web topology)
```

All require auth + workspace context. Return 404 when JAAL product disabled.

### Sheets Core Endpoints (Slice SH1)

```
GET    /sheets                            — List sheets in workspace
POST   /sheets                            — Create sheet (blank/template)
GET    /sheets/:id                        — Get sheet with column defs
PATCH  /sheets/:id                        — Update sheet metadata
DELETE /sheets/:id                        — Soft-delete sheet

GET    /sheets/:id/rows                   — List rows (paginated)
POST   /sheets/:id/rows                   — Add row(s)
PATCH  /sheets/:id/rows/:rowId            — Update row
DELETE /sheets/:id/rows/:rowId            — Delete row

GET    /sheets/:id/cells                  — Get all cells (grid data)
PUT    /sheets/:id/cells/bulk             — Bulk update cells
GET    /sheets/:id/cells/:cellId/history  — Cell change history
```

### Sheets Import/Export Endpoints (Slice SH5)

```
POST   /sheets/:id/import                 — Import CSV/XLSX
GET    /sheets/:id/export?format=csv|xlsx  — Export sheet
```

### Sheets Extraction Endpoints (Slice SH6) — requires `docs` product

```
POST   /sheets/from-extraction            — Create sheet from doc extractions
POST   /sheets/:id/rows/from-doc/:docId   — Add row from single doc extraction
```

### Sheets Negotiation Endpoint (Slice SH10) — requires `docs` product

```
POST   /sheets/from-negotiation/:sessionId — Create comparison matrix from negotiation
```

### Sheets JAAL Capture Endpoint (Slice SH11) — requires `jaal` product

```
POST   /sheets/:id/cells/from-jaal        — Capture research data to cell with proof link
```

### Sheets Permissions Endpoints (Slice SH14)

```
GET    /sheets/:id/permissions            — Get permission rules
PUT    /sheets/:id/permissions            — Set permission rules
```

### Sheets AI Endpoints (Slices SH15, SH16)

```
POST   /sheets/:id/query                  — Natural language query → filter/sort
POST   /sheets/:id/generate-report        — AI report from sheet data
```

### Sheets Provenance Endpoint (Slice SH13)

```
GET    /sheets/:id/provenance             — Sheet-level provenance timeline
```

All Sheets endpoints require auth + workspace context. Core CRUD returns 404 when Sheets product disabled. Cross-product endpoints return 404 when their respective dependency product is disabled.

### Activity Feed Endpoint (Slice S3)

```
GET /workspaces/:wid/activity?limit=20
```

### Notification Preferences (Slice S14)

```
PATCH /workspaces/:wid/notification-preferences
{ "crossProductEntityConflict": true, "crossProductEntityUpdate": true, "crossProductNewConnection": false }
```

### Backend Server Export (Slice S8)

```typescript
// KACHERI BACKEND/src/server.ts — minimal addition
export { app, startServer };
```

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| JAAL React UI rewrite scope creep (7,065 + 32,656 lines of source) | HIGH | S4 only reimplements core UI patterns (Guide, Trust, Research, Proofs). Full parity is iterative. |
| SQLite → PostgreSQL compatibility (FTS5 → tsvector) | HIGH | Abstract search behind interface; test both in CI |
| iOS WKWebView limited request interception | MEDIUM | Compensate with WKContentRuleList for blocking; document limitations |
| Android WebView security (arbitrary page rendering) | MEDIUM | Sandbox WebView, restrict JavaScript bridge surface, CSP headers |
| JAAL backend service duplicates desktop logic | MEDIUM | Desktop uses local IPC + syncs to backend; mobile/web use backend directly. Same business rules, different execution path. |
| Native plugin development requires Java/Kotlin + Swift expertise | HIGH | Scope to minimum viable browser control API; complex privacy features can be iterative |
| Proof format divergence (local files vs database) | MEDIUM | Define canonical proof JSON schema; both storage backends serialize same format |
| Visual Mode KCL generation complexity — visual edits must produce valid, editable KCL | MEDIUM | Build on existing KCL component library; round-trip test: Visual → Code → Visual |
| Mobile app review delays (App Store / Play Store) | LOW | Out of scope for this work; documented as distribution concern |
| Memory pressure on low-end Android with native WebView + Capacitor | MEDIUM | Lazy init browser; destroy WebView on JAAL close; test on low-end devices |
| Grid performance with 100K+ rows | HIGH | Virtualized rendering via react-window; server-side pagination; only render visible cells |
| Formula engine circular reference DoS | MEDIUM | Dependency graph with cycle detection; max evaluation depth limit (1000); timeout per formula (5s) |
| Cell-level permissions complexity (row × column × sheet) | MEDIUM | "Most specific wins" resolution rule; cache computed permissions per session; test matrix in CI |
| Cross-product feature degradation when products toggled off | MEDIUM | Every cross-product feature checks `isProductEnabled()` at both route registration and render time; comprehensive fallback tests |
| `xlsx` dependency size and security surface | LOW | Backend-only; pin version; audit before adoption; CSV fallback always available |
| Legal formula functions calling multiple backend services per evaluation | MEDIUM | 60s TTL cache per function result; rate-limit formula recalculation to 1/second per sheet; batch evaluations |
| JAAL proof-linked cells require both products running simultaneously | LOW | Proof data stored in cell; proof detail lookup degrades gracefully if JAAL unavailable (shows cached metadata) |
| Template inheritance schema drift | MEDIUM | Template updates are non-destructive pull (additive columns only); never remove user data |

---

## Roadmap Alignment

### Position in BEYLE Platform Roadmap

This work scope defines **Phase 8: Platform Shell, SaaS & Multi-Device** in the unified roadmap, following Phase 7 (Polish, Security & Platform).

Phases A, B, D, and E can run in parallel with Phase 7 since they touch different code areas.

### Covered Architectural Concepts

- **Architecture Blueprint**: "BEYLE is a unified platform" — this scope delivers it across every device
- **Product Independence**: Each product works independently across all topologies
- **Memory Graph**: Closes all documented gaps (JAAL pull, Studio push, cross-product notifications)
- **JAAL integration**: Moves from standalone desktop app to platform-integrated product on all devices
- **Design Studio Visual Mode**: Closes the offline gap for non-coders — presentations can now be created without AI or coding. Builds on Phase 6 Edit Mode foundation (F1–F3). Three clean modes: Visual (create + edit), AI (generate + enhance), Code (full control)
- **BEYLE Sheets**: Structured intelligence layer that leverages all existing engines (extraction, compliance, knowledge graph, clauses, negotiations, provenance) to turn document intelligence into interactive, collaborative spreadsheets with cell-level provenance and legal domain formulas
- **Product Independence**: Every product (Docs, Design Studio, JAAL, Sheets) is independently toggleable via product registry. Cross-product features degrade gracefully when dependencies are disabled.

### Not Covered (Future Scope)

- Auto-update infrastructure (Electron, App Store, Play Store)
- Database migration tooling (SQLite → PostgreSQL data)
- CDN and domain infrastructure
- CI/CD for multi-topology builds
- Platform analytics/telemetry
- Load balancing, horizontal scaling
- JAAL Gecko engine on any platform
- Sheets: pivot tables (complex aggregation engine — future)
- Sheets: conditional formatting rules engine (future)
- Sheets: real-time external data connections (future)
- Sheets: embedded mini-charts within cells (future)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Homepage render (all topologies) | < 1 second |
| Activity feed load | < 2 seconds |
| Desktop cold start (local mode) | < 5 seconds |
| Desktop cold start (cloud mode) | < 3 seconds |
| Mobile cold start | < 3 seconds |
| Web page load (SaaS) | < 2 seconds |
| JAAL browser load (all platforms) | < 1 second |
| Memory Graph entity pull | < 2 seconds (20 results) |
| Cross-product notification latency | < 5 seconds |
| Desktop idle memory (homepage) | < 300 MB |
| Mobile homepage memory | < 100 MB |
| Docker image (backend) | < 200 MB |
| Docker image (frontend) | < 50 MB |
| Android APK size | < 30 MB |
| iOS IPA size | < 30 MB |
| Sheet grid render (1K rows) | < 500ms |
| Sheet grid scroll (100K rows, virtualized) | 60 FPS |
| Formula engine full recalc (1K cells) | < 2 seconds |
| Legal formula evaluation (single) | < 3 seconds |
| Document-to-Sheet extraction (10 docs) | < 30 seconds |
| Cell history lookup | < 500ms |
| NL query → filter application | < 5 seconds |
| AI report generation | < 30 seconds |
| CSV import (10K rows) | < 5 seconds |
| XLSX import (10K rows) | < 10 seconds |
| Real-time cell sync latency | < 500ms |
| Permission check per cell render | < 1ms (cached) |

---

## Validation

### Per-Topology Smoke Tests

1. **Web SaaS**: Browser → homepage → 4 cards → all products work → JAAL uses proxied browsing → activity feed loads
2. **Desktop Local**: Electron → backend starts in-process → homepage → all 4 products → JAAL full privacy → kill network → JAAL still works → reconnect → sync resumes
3. **Desktop Cloud**: Electron cloud mode → connects to remote backend → all products → JAAL desktop with cloud proofs
4. **Android**: Launch app → homepage → all products → JAAL native WebView → request interception blocks trackers → proofs generated server-side
5. **iOS**: Launch app → homepage → all products → JAAL WKWebView → content blocking rules active → storage silos work → proofs via backend
6. **Design Studio Visual Mode (all topologies)**: Open Design Studio → switch to Visual Mode → create blank frame → add text/image/shape from palette → drag elements → resize → apply layout → group elements → snap to grid → switch to Code Mode → verify KCL is valid → switch to AI Mode → enhance frame → switch back to Visual Mode → edits preserved

### Sheets Smoke Tests

1. **Grid smoke test**: Create blank sheet → add 1000 rows → formula columns compute → sort/filter works → scroll at 60 FPS
2. **Extraction pipeline**: Select 10 contracts → "Create Sheet from Documents" → columns auto-generated from extraction schema → cells link to source clauses → confidence colors visible
3. **Entity resolution**: Type "Acme" in entity cell → auto-resolves to existing workspace entity → hover card shows cross-product information
4. **Compliance column**: Add compliance column → all rows linked to docs show pass/fail badges → change a policy → badges recompute
5. **Legal formulas**: Enter `=EXTRACT(doc123, "paymentTerms.amount")` → cell shows extracted value with confidence → enter `=COMPLIANCE_SCORE(doc123)` → shows status
6. **Collaboration**: Two users open same sheet → cell selections visible → edits sync in real-time → cell lock indicators work
7. **Cell provenance**: Edit a cell → right-click → View History → full audit trail with source attribution (manual/extraction/AI/JAAL)
8. **NL query**: Type "contracts expiring in March with liability over $1M" → grid filters to matching rows → query recorded in history
9. **Mobile card view**: Open sheet on mobile → card view default → swipe through records → edit inline → switch to grid view
10. **Template inheritance**: Create sheet from "Due Diligence" template → add data → template updated with new column → sheet offers "Pull Update" → user data preserved
11. **Product independence**: Disable `docs` product → Sheets still works (grid, formulas, import/export, collaboration) → "From Documents" option hidden → `EXTRACT()` returns #UNAVAILABLE → re-enable `docs` → features reappear

### Cross-Product Integration Test (Any Topology)

1. Create entity in Docs → appears in Memory Graph widget
2. Open JAAL → browse related URL → "Known Context" shows Docs entity
3. End JAAL session → entity syncs to Memory Graph
4. Generate Design Studio frame → entity extracted and pushed
5. Doc author receives cross-product notification
6. Knowledge Explorer shows entities from all 3 products with badges
7. **Sheets integration**: Create sheet from extracted contracts → entity cells resolve to Memory Graph → compliance column auto-populates → JAAL captures research data to cell with proof link → sheet activity appears in workspace activity feed
