# BEYLE Platform — Unified Implementation Roadmap

**Created:** 2026-02-22
**Status:** DRAFT — PENDING APPROVAL
**Supersedes:** `Docs/Roadmap/beyle-design-studio-roadmap.md` (kept as historical reference)
**Feature Scope Source of Truth:** `Docs/Roadmap/beyle-design-studio-work-scope.md` + Addendum A
**Prerequisite:** Kacheri Docs Phase 1 (complete) + Phase 2 (substantially complete)

---

## Purpose

This document is the **execution anchor** for building the BEYLE Platform — a unified system where one user identity accesses all products (Docs, Research Browser, Design Studio, future Sheets/Notes/Dev Studio), connected by a shared **Memory Graph** that knows about everything the user has worked on across all products.

It merges the Design Studio implementation roadmap with 9 Platform slices (P1-P9) that establish the Memory Graph, product independence toggles, external client authentication, cross-product intelligence, Docs platform integration, and canvas-in-Docs embedding.

**Design constraints:**
1. Each product must operate independently — connecting to the Memory Graph is a toggle, not a dependency.
2. A deployment can enable any combination of products via `ENABLED_PRODUCTS`.
3. The Memory Graph is a cross-product enhancement that gracefully degrades when disabled.
4. No product depends on another product to function.

---

## Platform Architecture

```
BEYLE PLATFORM
|
+-- Platform Core (always loaded)
|   +-- Auth / RBAC / Sessions / Personal Access Tokens
|   +-- Workspace management
|   +-- Proof model & Provenance store
|   +-- Job queue & Workers
|   +-- WebSocket infrastructure
|   +-- Artifact storage abstraction
|   +-- Observability & Health
|   +-- Audit log
|   +-- Notification system
|   +-- Platform Config (product + feature flags)
|
+-- Memory Graph (toggleable via MEMORY_GRAPH_ENABLED)
|   +-- workspace_entities (nodes: person, org, concept, web_page, citation, ...)
|   +-- entity_mentions (edges: entity -> doc/canvas/session, with product_source)
|   +-- entity_relationships (edges: entity <-> entity, with strength + evidence)
|   +-- FTS5 search indexes (docs_fts, entities_fts)
|   +-- Ingest endpoint (POST /platform/memory/ingest)
|   +-- Cross-product query filters
|
+-- Product: Kacheri Docs (toggleable)
|   +-- Backend: doc routes, AI routes, import/export, comments, suggestions, versions
|   +-- Backend: extraction, compliance, clauses, knowledge graph, negotiations
|   +-- Frontend: Editor, FileManager, panels, modals
|   +-- Frontend: doc-specific pages & navigation
|   +-- Memory Graph: pushes entities via knowledge indexer with explicit product_source: 'docs'
|
+-- Product: Beyle Design Studio (toggleable)
|   +-- Backend: canvas routes, canvas AI routes, export engines
|   +-- Backend: KCL serving, canvas templates, canvas assets
|   +-- Frontend: DesignStudioPage, studio components, KCL library
|   +-- Frontend: studio-specific pages & navigation
|   +-- Memory Graph: AI queries memory for context; pushes design entities
|
+-- Product: Beyle Jaal Research (external Electron app)
|   +-- Standalone desktop browser with proof-first AI
|   +-- Connects to platform via Personal Access Token (PAT)
|   +-- Memory Graph: pushes research sessions, sources, entities via ingest endpoint
|   +-- Works fully offline without platform connection
|
+-- Cross-Product (optional, gracefully degrades)
    +-- Doc cross-referencing in Design Studio (requires Docs enabled)
    +-- Canvas frame embedding in Docs via Tiptap extension (requires Design Studio enabled)
    +-- Knowledge graph queries from Design Studio (requires Docs enabled)
    +-- Research entities visible in Docs/Studio (requires Memory Graph enabled)
    +-- Cross-product entity display with product badges and navigation
```

**Configuration:**
```env
# Product modules -- comma-separated list of enabled products
ENABLED_PRODUCTS=docs,design-studio

# Memory Graph -- cross-product intelligence layer
MEMORY_GRAPH_ENABLED=true

# Examples:
# ENABLED_PRODUCTS=docs                           -> Docs only
# ENABLED_PRODUCTS=design-studio                  -> Design Studio only
# ENABLED_PRODUCTS=docs,design-studio             -> Both products
# MEMORY_GRAPH_ENABLED=false                      -> Disable cross-product intelligence
```

---

## Memory Graph Architecture

### What the Memory Graph Knows

| Product | What it feeds into the graph |
|---------|------------------------------|
| **Kacheri Docs** | Entities extracted from text (parties, dates, amounts), doc links, versions |
| **Beyle Jaal Research** | Sources found, topics explored, synthesis produced, evidence chains |
| **Beyle Design Studio** | Canvases referenced, design assets, concepts used in frames |
| **Future: Sheets** | Data entities, formula references, linked ranges |
| **Future: Notes** | Quick captures, tagged concepts, meeting references |
| **Future: Dev Studio** | APIs referenced, specs linked, component relationships |

### Schema Extension (from existing Knowledge Graph)

**Existing tables (unchanged):**
- `workspace_entities` — canonical nodes
- `entity_relationships` — directed edges with strength + evidence
- `knowledge_queries` — audit log
- `docs_fts`, `entities_fts` — FTS5 search indexes

**Extended: `workspace_entities.entity_type`**

Current types: `person`, `organization`, `date`, `amount`, `location`, `product`, `term`, `concept`

New types added: `web_page`, `research_source`, `design_asset`, `event`, `citation`

**Extended: `entity_mentions`**

New columns:
- `product_source TEXT NOT NULL DEFAULT 'docs'` — which product created this mention
  - CHECK: `('docs', 'design-studio', 'research', 'notes', 'sheets')`
- `source_ref TEXT` — nullable reference for non-doc sources (canvas_id, session_id)
  - For docs: `source_ref = NULL` (uses existing `doc_id`)
  - For design-studio: `source_ref = canvas_id` or `frame_id`
  - For research: `source_ref = session_id`

**Why extend, not replace:**
- All existing knowledge graph code (entity harvester, FTS sync, related docs pipeline, recalculateCounts, cleanupStaleEntities) continues to work unchanged
- The `product_source` column enables filtering by product in queries
- Future products get memory graph support by pushing to the same ingest endpoint

### Ingest Protocol

**Endpoint:** `POST /platform/memory/ingest`

```json
{
  "productSource": "research",
  "entities": [
    {
      "name": "Acme Corp Annual Report 2025",
      "entityType": "research_source",
      "context": "Primary source in research session on corporate governance",
      "confidence": 0.9,
      "sourceRef": "session_2026-02-15T10-30-00Z",
      "metadata": { "url": "https://...", "capturedAt": "..." }
    }
  ],
  "relationships": [
    {
      "fromName": "Acme Corp Annual Report 2025",
      "fromType": "research_source",
      "toName": "Acme Corp",
      "toType": "organization",
      "relationshipType": "co_occurrence",
      "label": "source about",
      "evidence": "Research session analyzed Acme Corp governance structure"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "entitiesCreated": 1,
  "entitiesReused": 1,
  "mentionsCreated": 2,
  "relationshipsCreated": 1,
  "proofId": "prf_..."
}
```

### Product Independence Toggle

**How products check availability:**
```
GET /api/config ->
{
  "products": ["docs", "design-studio"],
  "features": {
    "docs": { "enabled": true },
    "designStudio": { "enabled": true },
    "memoryGraph": { "enabled": true }
  }
}
```

**When Memory Graph is disabled:**
- `POST /platform/memory/ingest` returns 404 (route not registered)
- Products that try to push data get 404 and handle it silently
- Existing Docs knowledge graph routes still work (Docs-owned, not Memory Graph-owned)
- No crash, no data loss, no dependency

**When a product is disabled:**
- Its routes return 404
- Navigation items are hidden in frontend
- Memory Graph entities from that product remain in the graph (no destructive cleanup)
- Cross-product queries can filter out disabled product sources

### JAAL Authentication: Personal Access Tokens

JAAL is an Electron desktop app with no web session. It uses **Personal Access Tokens (PATs)**:

1. User creates a PAT in Kacheri web UI (`POST /auth/tokens`)
2. JAAL stores the PAT in Electron's `safeStorage` (OS-level encryption)
3. JAAL sends PAT as `Authorization: Bearer <pat>` when syncing
4. Backend auth middleware validates PAT like any access token but with longer expiry
5. PATs are SHA256-hashed at rest, workspace-scoped, revocable

### Cross-Product Queries

Existing knowledge graph endpoints gain a `productSource` filter:

```
GET /workspaces/:wid/knowledge/entities?productSource=research
GET /workspaces/:wid/knowledge/search?q=term&productSource=docs,research
```

Entity detail response includes product-grouped mentions:
```json
{
  "entity": { "name": "Acme Corp", "entityType": "organization" },
  "mentions": [
    { "docId": "doc_123", "productSource": "docs", "context": "..." },
    { "sourceRef": "canvas_456", "productSource": "design-studio", "context": "..." },
    { "sourceRef": "session_789", "productSource": "research", "context": "..." }
  ]
}
```

---

## Phase Overview

| Phase | Name | Focus | Slices | Est. Effort |
|-------|------|-------|--------|-------------|
| **0** | Product Modularization + Memory Graph Foundation | Make products independently toggleable; extend knowledge graph for multi-product | M1-M3, P1, P3 | 4-5 days |
| **1** | Backend Foundation | Database, store layer, API routes for canvases; memory graph ingest; PATs; Docs MG bridge | A1-A3, P2, P4, P8 | 7.5-9 days |
| **2** | KCL Component Library | Build the component runtime that frames target (13 core + 4 viz) | A4-A6 | 10-13 days |
| **3** | AI Engine, Intelligence & JAAL Connector | Code generation, doc bridge, conversation, image gen; JAAL sync; memory awareness | B1-B5, P5, P7 | 12-17 days |
| **4** | Frontend — Simple Mode + Cross-Product Display | App shell, viewport, chat, presentation; cross-product entity display | C1-C5, P6 | 11-15 days |
| **5** | Frontend — Power Mode & Exports | Code editor, all export engines (HTML/PDF/PPTX/PNG/SVG/MP4), templates, versions UI, Canvas-in-Docs embedding | D1-D10, P9 | 19.5-28 days |
| **6** | Frontend — Edit Mode | Direct manipulation via Properties Panel | F1-F3 | 9-12 days |
| **7** | Polish, Security & Platform | Hardening, performance, collaboration, mobile, testing | E1-E9 | 16-22 days |
| | **Total** | | **55 slices** | **89-122 days** |

---

## Phase 0: Product Modularization + Memory Graph Foundation

**Goal:** Introduce product-level toggling so Docs and Design Studio can be independently enabled or disabled. Extend the knowledge graph schema for multi-product memory. No Design Studio code yet — this phase only restructures the existing codebase and prepares the data layer.

**Why this comes first:** Without this, adding Design Studio routes creates a monolith where removing one product breaks the other. The memory graph schema extension is trivial (one migration) and must land before the ingest endpoint in Phase 1.

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
- Cross-product routes — registered only when both products are enabled
- No behavioral changes — all existing routes remain registered when `ENABLED_PRODUCTS=docs`

**Acceptance Criteria:**
- `ENABLED_PRODUCTS=docs` -> all current endpoints work, no Design Studio routes registered
- `ENABLED_PRODUCTS=design-studio` -> shared + Design Studio routes only
- `ENABLED_PRODUCTS=docs,design-studio` -> everything registered
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
      "designStudio": { "enabled": true },
      "memoryGraph": { "enabled": true }
    }
  }
  ```

**Acceptance Criteria:**
- Config endpoint returns correct product list and feature flags
- Frontend correctly reads and applies product configuration
- Disabled product routes return 404 from backend (not just hidden in UI)

---

### Slice P1: Memory Graph Schema Extension

**Files to create:**
- `KACHERI BACKEND/migrations/013_extend_memory_graph.sql`

**Scope:**
- Add `product_source` column to `entity_mentions` (default `'docs'`, CHECK constraint for `docs`, `design-studio`, `research`, `notes`, `sheets`)
- Add `source_ref` column to `entity_mentions` (nullable TEXT for non-doc references)
- Make `doc_id` nullable on `entity_mentions` — non-doc products use `source_ref` instead of `doc_id`. Existing rows all have `doc_id` populated, so no data migration needed. The existing foreign key constraint remains; NULL values simply bypass it.
- Extend `workspace_entities.entity_type` CHECK to include `web_page`, `research_source`, `design_asset`, `event`, `citation`
- Add index on `entity_mentions(product_source)`
- No data migration needed — all existing rows default to `'docs'` with existing `doc_id` intact

**Note on SQLite ALTER TABLE limitations:** SQLite does not support modifying CHECK constraints or making columns nullable via ALTER TABLE. The `doc_id` nullability and new entity types will be validated at the application layer (in `entityMentions.ts` and `workspaceEntities.ts`) rather than via SQL CHECK. The `product_source` column can be added with its own CHECK via ALTER TABLE ADD COLUMN.

**Acceptance Criteria:**
- Migration runs on existing database without errors
- All existing knowledge graph tests pass unchanged
- New entity types can be created via existing `WorkspaceEntitiesStore.create()`
- `product_source` column defaults correctly for existing mentions
- Non-doc mentions can be created with `doc_id: NULL` and `source_ref` set

---

### Slice P3: Platform Config — Memory Graph Feature Flag

**Files to modify:**
- `KACHERI BACKEND/src/routes/config.ts` (add `memoryGraph` to features response)
- `KACHERI BACKEND/src/modules/registry.ts` (add `isFeatureEnabled('memoryGraph')`)

**Depends on:** M3

**Scope:**
- `MEMORY_GRAPH_ENABLED` env var (defaults to `true`)
- Config endpoint includes `memoryGraph: { enabled: boolean }` in features
- Memory graph routes only registered when `MEMORY_GRAPH_ENABLED=true`
- Existing knowledge graph routes (Docs-owned) remain registered under Docs product regardless
- New `/platform/memory/*` routes registered only when memory graph is enabled

**Acceptance Criteria:**
- `MEMORY_GRAPH_ENABLED=false` -> ingest endpoint not registered (404)
- `MEMORY_GRAPH_ENABLED=true` -> ingest endpoint available
- Existing knowledge graph endpoints still work regardless of memory graph toggle
- Frontend can check `config.features.memoryGraph.enabled`

---

### Phase 0 Gate

Before proceeding to Phase 1:
- [ ] Product module registry works on backend
- [ ] Frontend conditionally renders navigation and routes
- [ ] Existing Docs functionality unaffected — **full regression required:**
  - [ ] All existing API endpoints return correct responses with `ENABLED_PRODUCTS=docs`
  - [ ] All existing frontend pages load and function correctly (manual smoke test)
  - [ ] All existing backend tests pass unchanged
- [ ] `ENABLED_PRODUCTS=docs` works as a standalone deployment
- [ ] Config endpoint serves product availability and feature flags
- [ ] Memory graph migration (013) runs cleanly on existing database
- [ ] New entity types accepted by `WorkspaceEntitiesStore`
- [ ] `MEMORY_GRAPH_ENABLED` flag correctly controls feature availability
- [ ] Non-doc mentions can be created with `doc_id: NULL` and `source_ref` set

---

## Phase 1: Backend Foundation

**Goal:** Build the persistence and API layer for canvases and frames. Establish the memory graph ingest endpoint and personal access token system for external clients (JAAL).

**Depends on:** Phase 0 (M1 — product registry, P1 — schema extension, P3 — feature flag)

---

### Slice A1: Database Schema & Migration

**Files to create:**
- `KACHERI BACKEND/migrations/014_add_design_studio.sql`

**Scope:**
- Create all 8 Design Studio tables:
  - `canvases` — top-level canvas container
  - `canvas_frames` — individual frames within a canvas
  - `canvas_conversations` — per-canvas AI conversation history
  - `canvas_versions` — named version snapshots
  - `canvas_exports` — export history with proof records (format CHECK includes: pdf, pptx, html_bundle, html_standalone, png, svg, embed, mp4)
  - `canvas_assets` — generated/uploaded images, fonts, and other assets per canvas
  - `canvas_templates` — reusable frame templates, workspace-scoped with tags
  - `canvas_permissions` — per-canvas permission overrides (following existing doc_permissions pattern: canvas_id, user_id, role)
- Create `canvases_fts` FTS5 virtual table for canvas search (canvas_id, workspace_id, title, description)
- Create all indexes
- Add proof kinds: `design:generate`, `design:edit`, `design:style`, `design:content`, `design:compose`, `design:export`, `design:image`
- Migration runs cleanly on existing database
- Tables only created — no data, no dependencies on Docs tables

**Acceptance Criteria:**
- All 8 tables + FTS virtual table created via migration
- All indexes verified
- All proof kinds registered
- Migration runs cleanly on existing database
- No foreign keys to Docs-specific tables (modularity)
- Canvas search via FTS returns matching canvases by title/description

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
- `KACHERI BACKEND/src/store/canvasPermissions.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register under Design Studio product module)
- `Docs/API_CONTRACT.md` (add Design Studio section)

**Depends on:** A2, M1

**Scope:**
- `POST /workspaces/:wid/canvases` — create canvas
- `GET /workspaces/:wid/canvases` — list canvases (paginated, sortable)
- `GET /workspaces/:wid/canvases/search?q=term` — full-text search canvases via `canvases_fts`
- `GET /workspaces/:wid/canvases/:cid` — get canvas with frames
- `PATCH /workspaces/:wid/canvases/:cid` — update canvas
- `DELETE /workspaces/:wid/canvases/:cid` — delete canvas
- `GET /canvases/:cid/frames/:fid` — get frame with code
- `PUT /canvases/:cid/frames/:fid/code` — update frame code (Power Mode)
- `POST /canvases/:cid/permissions` — set per-canvas permission for a user
- `GET /canvases/:cid/permissions` — list canvas permissions
- `DELETE /canvases/:cid/permissions/:userId` — remove per-canvas permission override
- **Canvas permissions model:** follows existing doc_permissions pattern. Workspace RBAC is the baseline; canvas_permissions provides per-canvas overrides (owner/editor/viewer). Canvas creator is automatically owner. Permission checks: canvas-level override > workspace-level role.
- Workspace middleware + RBAC enforced on all endpoints
- Routes registered only when `design-studio` product is enabled

**Acceptance Criteria:**
- All endpoints return correct responses per API contract
- Canvas search returns matching canvases by title and description
- Per-canvas permissions enforced (viewer can read, editor can modify, owner can delete)
- Canvas-level permissions override workspace-level roles when set
- Workspace scoping prevents cross-workspace access
- Frame code updates compute and store SHA256 hash
- Routes do not register when Design Studio is disabled

---

### Slice P2: Memory Graph Ingest Endpoint

**Files to create:**
- `KACHERI BACKEND/src/routes/memoryIngest.ts`
- `KACHERI BACKEND/src/knowledge/memoryIngester.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register route under `memoryGraph` feature flag)
- `KACHERI BACKEND/src/store/entityMentions.ts` (support `productSource` and `sourceRef` in `CreateMentionInput`)
- `Docs/API_CONTRACT.md`

**Depends on:** P1, P3

**Scope:**
- `POST /platform/memory/ingest` — accepts entities and relationships from any product
- Dedup logic: reuse existing `getEntityByNormalizedName()` before creating new entities
- For non-doc products: `doc_id` is NULL, `source_ref` is set (canvas_id, session_id, etc.)
- For Docs product: `doc_id` is set, `source_ref` is NULL (uses existing pattern)
- Rate limited: 60 req/min per workspace
- Proof packet created for each ingest (kind: `memory:ingest`)
- Validates `productSource` against known products
- Returns ingest result: `{ entitiesCreated, entitiesReused, mentionsCreated, relationshipsCreated }`
- Route only registered when `MEMORY_GRAPH_ENABLED=true`

**Acceptance Criteria:**
- Ingest from any product creates entities and mentions correctly
- Non-doc mentions created with `doc_id: NULL` and `source_ref` set
- Existing Docs knowledge graph unaffected
- `product_source` correctly set on new mentions
- `source_ref` correctly stored for non-doc references
- Returns 404 when `memoryGraph` feature is disabled
- Dedup matches existing entities by normalized name + type
- Rate limiting enforced

---

### Slice P4: Personal Access Tokens for External Clients

**Files to create:**
- `KACHERI BACKEND/src/auth/pat.ts`
- `KACHERI BACKEND/src/routes/pat.ts`

**Files to modify:**
- `KACHERI BACKEND/src/auth/middleware.ts` (accept PAT in Bearer header)
- `KACHERI BACKEND/src/server.ts` (register PAT routes)
- `Docs/API_CONTRACT.md`

**Depends on:** None (independent)

**Scope:**
- `POST /auth/tokens` — create PAT (name, expiry, optional scopes)
- `GET /auth/tokens` — list user's PATs (token value masked)
- `DELETE /auth/tokens/:id` — revoke PAT
- PATs stored as SHA256 hashed values in a new `personal_access_tokens` table via dedicated migration `015_add_personal_access_tokens.sql`
- Auth middleware: try JWT first, fall back to PAT lookup on miss
- PATs have optional scope restrictions (e.g., `memory:write` only)
- Each PAT is workspace-scoped
- Maximum 10 PATs per user

**Acceptance Criteria:**
- PAT creation returns the token value (shown once, never again)
- PAT auth works on all API endpoints (unless scope-restricted)
- PAT revocation immediately blocks access
- Scoped PATs cannot access out-of-scope endpoints
- Max 10 PATs per user enforced

---

### Slice P8: Docs Knowledge Indexer Memory Graph Bridge

**Files to modify:**
- `KACHERI BACKEND/src/store/entityMentions.ts` (add `productSource` and `sourceRef` to `CreateMentionInput`, `EntityMention`, and row converters)
- `KACHERI BACKEND/src/knowledge/` (update knowledge indexer to explicitly pass `product_source: 'docs'` when creating mentions)

**Depends on:** P1

**Scope:**
- Extend `CreateMentionInput` with optional `productSource` (defaults to `'docs'`) and `sourceRef` fields
- Extend `EntityMention` domain type and `EntityMentionRow` with `product_source` and `source_ref`
- Update `rowToMention()` converter to include `productSource` and `sourceRef`
- Update knowledge indexer to explicitly pass `product_source: 'docs'` when harvesting entities from documents
- Update `getMentionsByEntity()` and `getMentionsByDoc()` queries to return `productSource` and `sourceRef`
- Add `getMentionsByProductSource(workspaceId, productSource)` query for cross-product filtering
- No behavioral change for existing Docs features — just explicit tagging instead of relying on column DEFAULT

**Acceptance Criteria:**
- All new entity mentions from Docs have `product_source: 'docs'` explicitly set
- Existing queries return `productSource` field in results
- New `getMentionsByProductSource` enables filtering by product
- All existing knowledge graph tests pass unchanged
- Backward compatible — callers that don't pass `productSource` get `'docs'` by default

**Effort:** 0.5 days

---

### Phase 1 Gate

Before proceeding to Phase 2:
- [ ] All 8 Design Studio database tables + FTS created and indexed
- [ ] All store modules operational with full CRUD (canvases, frames, conversations, versions, exports, permissions)
- [ ] All canvas API endpoints functional and RBAC-enforced (including search and permissions)
- [ ] API contract updated with Design Studio section
- [ ] Routes registered under product module guard
- [ ] `/platform/memory/ingest` endpoint functional and rate-limited
- [ ] PAT creation, authentication, and revocation working
- [ ] Auth middleware accepts both JWT and PAT
- [ ] Docs knowledge indexer explicitly tags mentions with `product_source: 'docs'`
- [ ] `entityMentions.ts` supports `productSource` and `sourceRef` fields

---

## Phase 2: KCL Component Library

**Goal:** Build the Kacheri Component Library — the custom elements runtime that AI-generated frame code targets. This is the narrow waist of the entire system.

**Depends on:** None (independent of Phase 1 — can be built in parallel)

**No platform slices in this phase.** KCL is a pure Design Studio concern with no memory graph intersection.

---

### Slice A4: KCL v1 — Core Components (13)

**Files to create:**
- `KACHERI FRONTEND/src/kcl/kcl.ts` — runtime bootstrap, custom element registration
- `KACHERI FRONTEND/src/kcl/components/kcl-slide.ts` — frame container with background, transitions, scaling
- `KACHERI FRONTEND/src/kcl/components/kcl-text.ts` — typography with responsive sizing, animation
- `KACHERI FRONTEND/src/kcl/components/kcl-layout.ts` — flexbox/grid composition with breakpoints
- `KACHERI FRONTEND/src/kcl/components/kcl-image.ts` — image display with aspect ratio, lazy loading
- `KACHERI FRONTEND/src/kcl/components/kcl-list.ts` — animated list items with staggered entrance
- `KACHERI FRONTEND/src/kcl/components/kcl-quote.ts` — blockquote with attribution
- `KACHERI FRONTEND/src/kcl/components/kcl-metric.ts` — big number / KPI display with trend indicator
- `KACHERI FRONTEND/src/kcl/components/kcl-icon.ts` — icon display from bundled icon set
- `KACHERI FRONTEND/src/kcl/components/kcl-animate.ts` — animation wrapper (entrance/emphasis/exit)
- `KACHERI FRONTEND/src/kcl/components/kcl-code.ts` — syntax-highlighted code blocks with language detection, line numbers, theme via CSS custom properties
- `KACHERI FRONTEND/src/kcl/components/kcl-embed.ts` — responsive container for whitelisted external embeds (YouTube, Vimeo, Maps); validates URLs against whitelist, shows blocked state for non-whitelisted
- `KACHERI FRONTEND/src/kcl/components/kcl-source.ts` — cross-reference citation link to Kacheri Docs; renders doc title + section reference, clicking navigates to source document
- `KACHERI FRONTEND/src/kcl/kcl.css` — base styles, reset, accessibility defaults
- `KACHERI FRONTEND/src/kcl/package.json` — standalone package metadata

**Scope:**
- KCL runtime: registers all custom elements, handles data binding from `<script data-for>` blocks
- All 13 core components with attributes, JSON data binding, accessible defaults
- Components are framework-agnostic (vanilla JS + custom elements, no React dependency)
- `kcl-code`: supports major languages (JS, TS, Python, HTML, CSS, SQL, JSON, Markdown) with syntax highlighting
- `kcl-embed`: validates URLs against default whitelist (YouTube, Vimeo, Google Maps, Codepen, Loom); enhanced whitelist customization in E7
- `kcl-source`: renders provenance citation in format `[doc title, Section X.Y]` with link; renders as plain text when Docs is disabled
- Error overlay for invalid prop combinations
- ARIA roles and WCAG AA contrast-safe defaults

**Acceptance Criteria:**
- All 13 components render correctly in a standalone HTML page (no React)
- Data binding from `<script data-for>` works
- Components degrade gracefully when attributes are missing
- `kcl-code` highlights syntax for supported languages
- `kcl-embed` blocks non-whitelisted URLs with visible message
- `kcl-source` renders citation links correctly
- Error overlay shown for invalid prop combinations
- KCL builds as a standalone JS bundle
- Accessible defaults pass WCAG AA

**Effort:** 5-6 days

**Dependency approval required:** Icon set (Lucide subset or custom SVG sprites) — build-time only

---

### Slice A5: KCL v1 — Data Visualization Components

**Files to create:**
- `KACHERI FRONTEND/src/kcl/components/kcl-chart.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-table.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-timeline.ts`
- `KACHERI FRONTEND/src/kcl/components/kcl-compare.ts`

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

**Dependency decision required:** Chart rendering approach (custom SVG vs uPlot vs D3 subset)

---

### Slice A6: KCL Build, Versioning & Distribution

**Files to create:**
- `KACHERI FRONTEND/src/kcl/build.ts`
- `KACHERI FRONTEND/src/kcl/version.ts`

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

## Phase 3: AI Engine & Intelligence + JAAL Connector

**Goal:** Build the AI code generation engine, document cross-referencing, conversation persistence, image generation, JAAL sync connector, and Design Studio memory graph awareness.

**Depends on:** Phase 1 (A3 — API routes, P2 — ingest endpoint, P4 — PATs), Phase 2 (A4 — KCL component reference)

---

### Slice B1: AI Code Generation Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/designEngine.ts`
- `KACHERI BACKEND/src/ai/designPrompts.ts`

**Depends on:** A4

**Scope:**
- `generateFrames(prompt, context)`: generate HTML/CSS/JS using KCL components — action type `design:generate`
- `editFrame(prompt, existingCode, context)`: modify existing frame code — action type `design:edit`
- `styleFrames(prompt, frameCodes, context)`: restyle while preserving content — action type `design:style`
- `updateContent(prompt, existingCode, context)`: update data/text while preserving design — action type `design:content` (distinct from edit: keeps visual design, changes only text/data values)
- `composeFromDocs(prompt, docRefs, context)`: generate full multi-frame canvas from one or more documents — action type `design:compose` (orchestrates multiple generateFrames calls with doc context)
- Note: `design:export_prep` is handled inline by export engines (D2/D3/D4), not as a separate AI action
- System prompts with KCL component reference (all 17 components), canvas context, frame context
- Code validation: parse generated HTML, check KCL usage, validate structure
- Error recovery: retry with error context (max 2 retries)
- Streaming output for real-time preview
- Uses existing `modelRouter.ts` with new `design:*` action types

**Acceptance Criteria:**
- Generates valid HTML using KCL components from text prompts
- Edit mode preserves frame structure while applying changes
- Style mode changes visual appearance without altering content
- Content mode updates data/text values without changing design
- Compose mode generates full canvas from document references
- Code validation catches common generation errors
- Retry logic recovers from minor generation failures
- Streaming output works

---

### Slice B2: Doc Cross-Reference Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/designDocBridge.ts`

**Depends on:** None (uses existing doc store — only functional when Docs enabled)

**Scope:**
- Fetch doc content by ID for AI context injection
- Extract relevant sections based on AI intent parsing
- Build provenance links: `{docId, section, textUsed, hash}`
- Support multiple docs per generation
- Sanitize doc content before injection (strip sensitive metadata, limit tokens)
- Generate `<kcl-source>` markup pointing back to source docs
- **Graceful degradation:** B2 exports `isDocBridgeAvailable(): boolean` which checks `isProductEnabled('docs')`. When Docs disabled, all methods return `{ available: false, docs: [], provenance: [] }`. B3 checks `isDocBridgeAvailable()` before calling B2 fetch methods. AI generation proceeds without doc context when unavailable — no errors, no empty `<kcl-source>` references generated.

**Acceptance Criteria:**
- Can fetch and inject doc content into AI prompts (when Docs enabled)
- Provenance links correctly track which doc sections were used
- `isDocBridgeAvailable()` returns `false` when Docs disabled
- When Docs disabled: no errors, no empty references, AI generates without doc context
- B3 never calls B2 fetch methods when Docs is disabled

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
- All AI endpoints create conversation entries, proof packets, streaming responses
- Rate-limited per existing middleware
- Doc cross-referencing when `docRefs` provided and Docs enabled

**Acceptance Criteria:**
- All AI endpoints return correct responses per API contract
- Conversation history persisted and retrievable
- Proof packets created for every AI action
- Streaming works for real-time preview
- Rate limiting enforced

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
- Versions capture full canvas state
- Restore replaces current state with version snapshot
- Export triggers background job
- Export proof packets created

---

### Slice B5: AI Image Generation Engine

**Files to create:**
- `KACHERI BACKEND/src/ai/imageGenerator.ts`
- `KACHERI BACKEND/src/store/canvasAssets.ts`

**Files to modify:**
- `KACHERI BACKEND/src/ai/designEngine.ts`
- `KACHERI BACKEND/src/routes/canvasAi.ts`
- `KACHERI BACKEND/src/types/proofs.ts`
- `Docs/API_CONTRACT.md`

**Depends on:** A1 (for canvas_assets table), B1

**Scope:**
- `POST /canvases/:cid/ai/image` — generate image from text prompt
- Image generation via configurable provider (DALL-E 3 initially, pluggable)
- Asset storage and serving, credit tracking per workspace
- Proof packet for every generated image

**Acceptance Criteria:**
- Image generation from text prompt works
- Generated images stored and servable
- Credit system tracks usage
- Proof packet created for each generation

**Dependency:** External API (OpenAI or Stability AI)

---

### Slice P5: JAAL Sync Connector Library

**Files to create:**
- `BEYLE JAAL/lib/kacheriSync.js`

**Files to modify:**
- `BEYLE JAAL/main.js` (add sync IPC handlers: `jaal:sync:config`, `jaal:sync:push`, `jaal:sync:status`)
- `BEYLE JAAL/preload.js` (expose sync IPC)
- `BEYLE JAAL/renderer.js` (add sync UI controls in Trust Console)
- `BEYLE JAAL/DOCS/API-CONTRACT.md` (document sync endpoints)

**Depends on:** P2, P4

**Scope:**
- `kacheriSync.js`: library that maps JAAL session data to memory graph ingest format:
  - Extract URLs as `web_page` entities
  - Extract AI-generated concepts/names as `concept`/`person`/`organization` entities
  - Map session itself as `research_source` entity
  - Map compared pages as `co_occurrence` relationships
- Configuration: PAT stored in Electron `safeStorage`, workspace ID + API URL in config
- IPC handlers: `jaal:sync:config` (set/get PAT + workspace), `jaal:sync:push` (trigger sync), `jaal:sync:status` (last sync state)
- Renderer UI: "Sync to Beyle" button in Trust Console, sync status indicator, settings for PAT/workspace
- Batch upload via `POST /platform/memory/ingest` with `productSource: 'research'`
- Sync on: session end (automatic), manual button click

**Engineering constraint:** P5 modifies BEYLE JAAL source files and must comply with `BEYLE JAAL/DOCS/Claude.md` engineering guardrails. Coordinate with JAAL's own roadmap (V2 phases) to avoid conflicts.

**Acceptance Criteria:**
- End-of-session sync pushes entities to Kacheri backend
- Manual sync works
- Auth uses PAT from secure storage
- Graceful error handling when Kacheri backend is unreachable
- No crash when memory graph is disabled on backend (404 handled silently)
- Settings persist across app restarts

---

### Slice P7: Design Studio Memory Graph Awareness

**Files to modify:**
- `KACHERI BACKEND/src/ai/designDocBridge.ts` (extend to query memory graph for context)
- `KACHERI BACKEND/src/routes/canvasAi.ts` (add `includeMemoryContext` option)

**Depends on:** B2, P2

**Scope:**
- When generating frames, AI can optionally receive memory graph context
- `POST /canvases/:cid/ai/generate` gains optional `includeMemoryContext: boolean` field
- When enabled, design engine queries knowledge graph for entities relevant to the prompt
- Injected as "Related Knowledge" section in AI system prompt
- Graceful degradation: when memory graph is disabled, `includeMemoryContext` is silently ignored
- No frontend changes needed here (handled in P6 and C4)

**Acceptance Criteria:**
- AI generation with memory context produces frames informed by research/docs entities
- Without memory graph enabled, no errors — `includeMemoryContext` silently ignored
- Memory context enriches AI output quality measurably

---

### Phase 3 Gate

Before proceeding to Phase 4:
- [ ] AI generates valid HTML/CSS/JS using KCL components
- [ ] Edit and style operations work on existing frames
- [ ] Code validation + retry catches generation errors
- [ ] Streaming responses work for real-time preview
- [ ] Conversation history persisted with proof packets
- [ ] Doc cross-referencing works when Docs enabled, degrades when disabled
- [ ] Version snapshots and export job triggering functional
- [ ] Image generation works with credit tracking
- [ ] JAAL sync connector pushes research entities to memory graph
- [ ] Design Studio AI can query memory graph for context
- [ ] End-to-end: research in JAAL -> sync -> generate frame in Studio referencing research

---

## Phase 4: Frontend — Simple Mode + Cross-Product Display

**Goal:** Build the full Simple Mode experience and cross-product entity display in the Knowledge Explorer.

**Depends on:** Phase 1 (A3), Phase 2 (A6), Phase 3 (B3)

---

### Slice C1: Frontend Types & API Layer

**Files to create:**
- `KACHERI FRONTEND/src/types/canvas.ts`
- `KACHERI FRONTEND/src/api/canvas.ts`
- `KACHERI FRONTEND/src/api/canvasAi.ts`

**Depends on:** A3, B3, B4

**Scope:**
- TypeScript types for all canvas schemas
- API client: `canvasApi` (CRUD for canvases, frames, versions, exports)
- API client: `canvasAiApi` (generate, edit, style, image, conversation)
- Streaming response handling for AI generation
- Error handling following existing `api.ts` patterns

**Acceptance Criteria:**
- All types match backend schemas
- All API functions implemented
- Streaming responses handled correctly

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
- Route: `/workspaces/:wid/studio/:cid` (guarded by Design Studio product module)
- Mode toggle button (Simple/Power/Edit) in header
- Composition mode selector (Deck/Page/Notebook/Widget)

**Acceptance Criteria:**
- Page loads and displays canvas with frame rail
- Frame rail shows thumbnails in correct order
- Route accessible only when Design Studio product is enabled
- Mode toggle and composition selector visible

---

### Slice C3: Frame Viewport (Iframe Renderer)

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/FrameViewport.tsx`
- `KACHERI FRONTEND/src/components/studio/FrameRenderer.tsx`
- `KACHERI FRONTEND/src/hooks/useFrameRenderer.ts`

**Depends on:** C2, A6

**Scope:**
- Sandboxed iframe that renders frame HTML
- Injects frame code via `srcdoc`, prepends KCL script/link tags
- Thumbnail capture on successful render
- Error overlay inside iframe

**Acceptance Criteria:**
- Active frame renders correctly in sandboxed iframe
- KCL components work inside iframe
- Errors display error overlay
- Thumbnail captured on successful render

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
- Chat-style panel showing conversation history
- Streaming AI responses in real-time
- Doc reference picker (when Docs enabled)
- Memory context indicator (when memory graph enabled) — shows "Memory" badge when AI used memory graph context
- "Show Diff" and "Approve" / "Request Changes" buttons

**Acceptance Criteria:**
- Conversation displays full history
- Streaming works
- Doc references attachable when Docs enabled
- Memory context indicator shows when memory graph context was used
- Approve/reject workflow functions

---

### Slice C5: Presentation Mode

**Files to create:**
- `KACHERI FRONTEND/src/components/studio/PresentationMode.tsx`
- `KACHERI FRONTEND/src/components/studio/PresenterView.tsx`

**Depends on:** C3

**Scope:**
- Fullscreen presentation with frame transitions
- Keyboard navigation, progress indicator
- Presenter view in separate window via BroadcastChannel

**Acceptance Criteria:**
- Fullscreen presentation mode works
- Keyboard navigation works
- Presenter view opens in separate window with notes and timer

---

### Slice P6: Cross-Product Entity Display

**Files to modify:**
- `KACHERI FRONTEND/src/types/knowledge.ts` (add `productSource` to entity/mention types)
- `KACHERI FRONTEND/src/api/knowledge.ts` (add `productSource` filter parameter)
- `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx` (product source badges + filter)

**Depends on:** C1, P2

**Scope:**
- Entity list shows product source badges (Docs, Research, Design Studio)
- Entity detail modal groups mentions by product source
- Entity detail shows `kcl-source` provenance links back from canvases to docs
- Filter dropdown: "All Products", "Docs", "Research", "Design Studio"
- New entity types (`web_page`, `research_source`, `design_asset`, `citation`, `event`) get labels, icons, and colors
- Cross-product related items: show canvases and research sessions alongside docs
- Product badge navigation: clicking a badge opens the source in its product (doc → Docs editor, canvas → Design Studio, session → research detail)

**Acceptance Criteria:**
- Product source badges render correctly on entities
- Filter by product source works
- Entity detail shows mentions grouped by product with navigation links
- New entity types have distinct labels, icons, and colors
- Product badge navigation works (opens source in correct product)
- Works correctly when memory graph is disabled (no badges, no cross-product data)

---

### Phase 4 Gate — Simple Mode MVP + Cross-Product Display

This is the **first usable milestone**. After Phase 4, a user can:
- Create a canvas and use AI to generate frames via conversation
- View rendered frames in sandboxed iframes
- Navigate and present slides
- Cross-reference Kacheri Docs (when Docs enabled)
- See research entities from JAAL in the Knowledge Explorer (when memory graph enabled)
- See memory graph context indicator in Studio conversation

Before proceeding to Phase 5:
- [ ] Canvas creation -> AI generation -> frame rendering pipeline works end-to-end
- [ ] Conversation panel with streaming AI responses functional
- [ ] Presentation mode with transitions works
- [ ] All frames render correctly with KCL components
- [ ] Proof packets created for every AI action
- [ ] Works as standalone product (Docs disabled)
- [ ] Cross-product entity display functional in Knowledge Explorer
- [ ] Product source badges and filters work
- [ ] Memory graph context indicator in conversation panel

---

## Phase 5: Power Mode & Export Pipeline

**Goal:** Build the advanced editing experience, all export engines, file manager integration, templates, and version history UI.

**Depends on:** Phase 4 (C2, C3 — app shell and viewport exist)

**No platform slices in this phase.** Memory graph awareness is already baked into the AI engine (P7) and the frontend (P6).

---

### Slice D1: Power Mode — Code Editor
- Syntax-highlighted code editor for frame HTML/CSS/JS
- KCL component autocompletion, live preview, error indicators
- **Effort:** 3-4 days. **Depends on:** C3
- **Dependency decision:** CodeMirror 6 (recommended) vs Monaco

### Slice D2: Export Engine — HTML Bundle, Standalone, PNG & SVG
- HTML Bundle (directory zipped) + Standalone HTML (single file)
- PNG export: Puppeteer renders frame at canvas aspect ratio, saves as PNG (per-frame or all-frames zip)
- SVG export: frame HTML/CSS wrapped in `<foreignObject>` SVG or rasterized via Puppeteer SVG mode
- **Effort:** 3-4 days. **Depends on:** A6, B4

### Slice D3: Export Engine — PDF
- Render each frame via Puppeteer, one page per frame
- **Effort:** 1-2 days. **Depends on:** B4

### Slice D4: Export Engine — PPTX
- Map KCL components to PPTX primitives
- **Effort:** 2-3 days. **Depends on:** B4
- **Dependency decision:** `pptxgenjs` (recommended)

### Slice D5: Canvas Listing & File Manager Integration
- Canvases are NOT stored in `fs_nodes`. They appear as a separate "Canvases" section in the File Manager, below the document tree. The section shows CanvasCard components in a grid, fetched from the canvas API.
- Canvas cards show thumbnail, title, frame count, composition mode badge (Deck/Page/Notebook/Widget), last edited
- Section only visible when Design Studio enabled
- Create canvas button in File Manager navigates to Design Studio
- **Effort:** 1-2 days. **Depends on:** C2, A3

### Slice D6: Speaker Notes with Tiptap
- Rich text speaker notes per frame
- **Effort:** 1 day. **Depends on:** C2

### Slice D7: Canvas Versions & History UI
- Version list, create, restore with auto-versioning before AI generation
- **Effort:** 1-2 days. **Depends on:** C2, B4

### Slice D8: Export Engine — Video (MP4)
- PNG sequence via Puppeteer + ffmpeg stitching
- **Effort:** 3-4 days. **Depends on:** B4
- **Dependency approval required:** `ffmpeg-static`

### Slice D9: Frame Templates — Backend
- Template CRUD + tag filtering
- **Effort:** 1-2 days. **Depends on:** A3

### Slice D10: Frame Templates — Frontend
- Template gallery, save dialog, insert flow
- Note: `canvas_templates` table already created in A1 migration (014); D9 creates the store and routes
- **Effort:** 1-2 days. **Depends on:** D9, C2

---

### Slice P9: Canvas Frame Embedding in Docs

**Files to create:**
- `KACHERI FRONTEND/src/extensions/CanvasEmbed.ts` (Tiptap node extension for `canvas-embed` node type)
- `KACHERI FRONTEND/src/components/CanvasEmbedView.tsx` (node view component rendering embedded canvas frame)
- `KACHERI BACKEND/src/routes/canvasEmbed.ts` (read-only endpoint for frame render data)

**Files to modify:**
- `KACHERI FRONTEND/src/extensions/index.ts` (register CanvasEmbed extension when Design Studio enabled)
- `KACHERI BACKEND/src/server.ts` (register embed route under cross-product guard — requires both Docs and Design Studio enabled)

**Depends on:** C3 (Frame Viewport), M1 (product module registry), Docs Tiptap editor (existing)

**Scope:**
- Tiptap node extension: `canvas-embed` node type with attributes (`canvasId`, `frameId`, `aspectRatio`)
- Node view renders a sandboxed iframe showing the frame (read-only, no interaction)
- Insert flow: user selects "Insert Canvas Frame" from command palette or toolbar → canvas/frame picker modal → embed inserted into document
- Backend route: `GET /embed/frames/:fid/render` returns frame code + KCL version (read-only, workspace-scoped auth)
- Extension only registered when Design Studio product is enabled (via product config check)
- When Design Studio disabled: existing `canvas-embed` nodes in documents show placeholder text ("Design Studio content — enable Design Studio to view")
- Proof: embedding creates a `doc_link` record linking doc → canvas with type `'canvas_embed'`
- Embedded frames update when source frame is edited (live reference, not a copy)

**Acceptance Criteria:**
- Canvas frames render inline in Docs editor as sandboxed iframes
- Frame picker modal shows canvases and frames from current workspace
- Embedded frames are read-only in doc context (view only, no editing)
- Embedding works only when Design Studio is enabled
- Placeholder shown when Design Studio is disabled
- `doc_link` provenance record created for each embedding
- Embedded frames reflect source frame updates

**Effort:** 1.5 days

---

### Phase 5 Gate
- [ ] Power Mode code editor with live preview works
- [ ] HTML, PDF, PPTX, PNG, SVG, MP4 exports all functional
- [ ] File manager shows canvases in separate section
- [ ] Speaker notes, versions, templates all working
- [ ] Canvas frames embeddable in Docs via Tiptap extension (when both products enabled)

---

## Phase 6: Edit Mode (Direct Manipulation)

**Goal:** Build the third editing mode where non-technical users can click elements and edit properties visually.

**Depends on:** Phase 2 (A4, A5), Phase 4 (C2)

**No platform slices in this phase.**

---

### Slice F1: KCL Inspection Protocol & Selection Bridge
- Editable property schema per component, selection via postMessage
- **Effort:** 3-4 days. **Depends on:** A4, A5

### Slice F2: Properties Panel UI
- Visual controls for selected element (text, color, number, image, data grid)
- **Effort:** 4-5 days. **Depends on:** C2, F1
- **Dependency decision:** Color picker (`react-colorful` recommended)

### Slice F3: Inline Text Editing
- Double-click to edit text directly in viewport
- **Effort:** 2-3 days. **Depends on:** F2

### Phase 6 Gate
- [ ] All 17 KCL components (13 core + 4 visualization) have editable property schemas
- [ ] Properties Panel renders controls for selected element
- [ ] Inline text editing works

---

## Phase 7: Polish, Security & Platform

**Goal:** Harden the system — security, performance, collaboration, mobile, testing.

**Depends on:** Phases 4-6

**No additional platform slices.** E6 (Documentation & Testing) naturally covers memory graph docs and cross-product test scenarios.

---

### Slice E1: Frame Security Hardening — 2 days
### Slice E2: Performance Optimization — 2-3 days
### Slice E3: Proof Integration & Notification Wiring — 1 day
- Wire notification triggers for Design Studio events: canvas shared, AI generation complete, export complete, frame lock requested
- Update notification preferences to include Design Studio event categories
### Slice E4: Notebook Composition Mode — 2-3 days
### Slice E5: Embed / Widget Mode — 2 days
### Slice E6: Documentation & Testing — 2-3 days
- Document memory graph architecture and cross-product query patterns
- Test scenarios for cross-product flows: research → memory graph → studio AI context, docs → canvas embed, JAAL sync → knowledge explorer display
### Slice E7: External Embed Whitelist — 1-2 days
### Slice E8: Real-Time Canvas Collaboration — 3-4 days
### Slice E9: Mobile Simple Mode — 2-3 days

### Phase 7 Gate — Full Product Complete
- [ ] Frame security hardened
- [ ] Performance optimized
- [ ] All proof kinds integrated
- [ ] Notebook, embed/widget modes work
- [ ] Real-time collaboration with frame-level locking
- [ ] Mobile Simple Mode responsive
- [ ] All tests pass
- [ ] Documentation complete (including memory graph, cross-product features, and canvas-in-Docs embedding)
- [ ] Notification triggers wired for Design Studio events

---

## Complete Dependency Graph

```
PHASE 0: Product Modularization + Memory Graph Foundation
M1 (Backend module registry)
M2 (Frontend product guards)        Can be built in parallel
M3 (Config endpoint)
P1 (Memory graph schema extension)  Can be built in parallel
P3 (Memory graph feature flag) ---> depends on M3

PHASE 1: Backend Foundation (depends on M1, P1)
M1 --> A1 --> A2 --> A3
P1 + P3 --> P2 (Memory ingest endpoint)    Parallel with A1-A3
            P4 (Personal access tokens)     Independent
P1 -------> P8 (Docs knowledge indexer bridge)  Parallel with A1-A3

PHASE 2: KCL (independent -- parallel with Phase 1)
A4 --> A5 --> A6

PHASE 3: AI Engine + JAAL Connector (depends on A3 + A4 + P2)
A4 ------> B1 ------> B5 (image gen)
             |
A3 ------> B3 (conversation API, depends on B1 + B2)
             |
           B2 (doc bridge -- independent, wired into B3)
             |
A3 ------> B4 (version/export API)

P2 + P4 --> P5 (JAAL sync connector)          Parallel with B1-B5
B2 + P2 --> P7 (Studio memory awareness)      Parallel with B3-B5

PHASE 4: Frontend Simple Mode (depends on A3 + A6 + B3)
A3 + B3 + B4 --> C1 --> C2 --> C3 --> C4
                                |
                                +--> C5 (presentation)
C1 + P2 --> P6 (cross-product entity display)  Parallel with C3-C5

PHASE 5: Power Mode & Exports (depends on C2, C3, B4)
C3 ----> D1 (code editor)
A6 + B4 -> D2 (HTML/PNG/SVG export)
B4 ----> D3 (PDF)           Export engines
B4 ----> D4 (PPTX)          can be built
B4 ----> D8 (video)          in parallel
C2 + A3 -> D5 (file manager)
C2 ----> D6 (speaker notes)
C2 + B4 -> D7 (versions UI)
A3 ----> D9 -> D10 (templates)
C3 + M1 -> P9 (Canvas-in-Docs embedding)  Parallel with D-slices

PHASE 6: Edit Mode (depends on A4 + A5 + C2) -- UNCHANGED
A4 + A5 -> F1 -> F2 -> F3
                  ^
                 C2

PHASE 7: Polish (depends on Phases 4-6) -- UNCHANGED
C3 ----> E1 (security)
C2 + C3 -> E2 (performance)
B3 ----> E3 (proofs)
C3 + D6 -> E4 (notebook mode)
C3 + A3 -> E5 (embed/widget)
All ----> E6 (docs & testing)
A4 ----> E7 (embed whitelist)
C2 ----> E8 (collaboration)
C2 + C3 + C4 -> E9 (mobile)
```

---

## Parallelization Timeline

```
Week 1-2:    [M1]--[M2]--[M3]--[P3]            Phase 0
             [P1]                                Phase 0 (parallel)

Week 2-4:    [A1]--[A2]--[A3]                   Phase 1 (backend)
             [P2]                                Phase 1 (parallel: ingest)
             [P4]                                Phase 1 (parallel: PATs)
             [P8]                                Phase 1 (parallel: Docs MG bridge)

Week 2-6:    [A4]------[A5]--[A6]               Phase 2 (KCL, 13 components) PARALLEL with Phase 1

Week 6-10:   [B1]--[B5]                          Phase 3 (AI engine)
             [B2]--[P7]                          Phase 3 (doc bridge + memory awareness)
             [B3]---------                       Phase 3 (conversation API)
             [B4]                                Phase 3 (version/export)
             [P5]                                Phase 3 (JAAL connector, parallel)

Week 10-14:  [C1]--[C2]--[C3]--[C4]            Phase 4 (Simple Mode)
                          [C5]
             [P6]                                Phase 4 (cross-product, parallel)

Week 14-19:  [D1-D10]                           Phase 5 (Power Mode + Exports)
             [P9]                                Phase 5 (Canvas-in-Docs, parallel with D-slices)
Week 14-17:  [F1]--[F2]--[F3]                  Phase 6 (Edit Mode) PARALLEL with Phase 5
Week 19-23:  [E1-E9]                            Phase 7 (Polish)
```

**Staffing requirement:** The parallelization timeline assumes at least 2 developers working simultaneously. With a single developer, phases execute sequentially and total calendar time increases accordingly.

---

## Complete Slice Inventory (55 slices)

| ID | Slice | Phase | Depends On | Effort |
|----|-------|-------|------------|--------|
| M1 | Backend Product Module Registry | 0 | -- | 1-2 days |
| M2 | Frontend Product Module Guards | 0 | -- | 1 day |
| M3 | Config Endpoint + Build Config | 0 | -- | 0.5-1 day |
| **P1** | **Memory Graph Schema Extension** | **0** | **--** | **0.5 days** |
| **P3** | **Platform Config — Memory Graph Feature Flag** | **0** | **M3** | **0.5 days** |
| A1 | Database Schema & Migration (8 tables + FTS) | 1 | M1 | 0.5 days |
| A2 | Canvas & Frame Store Layer | 1 | A1 | 2 days |
| A3 | Canvas API Routes — CRUD, Search & Permissions | 1 | A2, M1 | 2 days |
| **P2** | **Memory Graph Ingest Endpoint** | **1** | **P1, P3** | **1.5 days** |
| **P4** | **Personal Access Tokens** | **1** | **--** | **1 day** |
| **P8** | **Docs Knowledge Indexer Memory Graph Bridge** | **1** | **P1** | **0.5 days** |
| A4 | KCL v1 — Core Components (13) | 2 | -- | 5-6 days |
| A5 | KCL v1 — Data Visualization (4) | 2 | A4 | 4-5 days |
| A6 | KCL Build, Versioning & Distribution | 2 | A4, A5 | 1-2 days |
| B1 | AI Code Generation Engine | 3 | A4 | 3-4 days |
| B2 | Doc Cross-Reference Engine | 3 | -- | 1-2 days |
| B3 | Canvas Conversation API | 3 | A3, B1, B2 | 2-3 days |
| B4 | Canvas Version & Export API | 3 | A3 | 1-2 days |
| B5 | AI Image Generation Engine | 3 | A1, B1 | 3-4 days |
| **P5** | **JAAL Sync Connector Library** | **3** | **P2, P4** | **1 day** |
| **P7** | **Design Studio Memory Graph Awareness** | **3** | **B2, P2** | **1 day** |
| C1 | Frontend Types & API Layer | 4 | A3, B3, B4 | 1 day |
| C2 | Design Studio App Shell | 4 | C1, M2 | 2-3 days |
| C3 | Frame Viewport (Iframe Renderer) | 4 | C2, A6 | 2-3 days |
| C4 | Conversation Panel (Simple Mode) | 4 | C2, C3, B3 | 3-4 days |
| C5 | Presentation Mode | 4 | C3 | 2-3 days |
| **P6** | **Cross-Product Entity Display** | **4** | **C1, P2** | **1 day** |
| D1 | Power Mode — Code Editor | 5 | C3 | 3-4 days |
| D2 | Export Engine — HTML Bundle, Standalone, PNG & SVG | 5 | A6, B4 | 3-4 days |
| D3 | Export Engine — PDF | 5 | B4 | 1-2 days |
| D4 | Export Engine — PPTX | 5 | B4 | 2-3 days |
| D5 | Canvas Listing & File Manager Integration | 5 | C2, A3 | 1-2 days |
| D6 | Speaker Notes with Tiptap | 5 | C2 | 1 day |
| D7 | Canvas Versions & History UI | 5 | C2, B4 | 1-2 days |
| D8 | Export Engine — Video (MP4) | 5 | B4 | 3-4 days |
| D9 | Frame Templates — Backend | 5 | A3 | 1-2 days |
| D10 | Frame Templates — Frontend | 5 | D9, C2 | 1-2 days |
| **P9** | **Canvas Frame Embedding in Docs** | **5** | **C3, M1** | **1.5 days** |
| F1 | KCL Inspection Protocol & Selection Bridge | 6 | A4, A5 | 3-4 days |
| F2 | Properties Panel UI | 6 | C2, F1 | 4-5 days |
| F3 | Inline Text Editing | 6 | F2 | 2-3 days |
| E1 | Frame Security Hardening | 7 | C3 | 2 days |
| E2 | Performance Optimization | 7 | C2, C3 | 2-3 days |
| E3 | Proof Integration & Notification Wiring | 7 | B3 | 1-2 days |
| E4 | Notebook Composition Mode | 7 | C3, D6 | 2-3 days |
| E5 | Embed / Widget Mode | 7 | C3, A3 | 2 days |
| E6 | Documentation & Testing | 7 | All | 2-3 days |
| E7 | External Embed Whitelist | 7 | A4 | 1-2 days |
| E8 | Real-Time Canvas Collaboration | 7 | C2, WebSocket | 3-4 days |
| E9 | Mobile Simple Mode | 7 | C2, C3, C4 | 2-3 days |

---

## Effort Summary

| Phase | Name | Original | Platform Added | New Total |
|-------|------|----------|----------------|-----------|
| 0 | Product Modularization + Memory Graph Foundation | 3-4 days | +1 day | **4-5 days** |
| 1 | Backend Foundation | 4.5-5 days | +3 days | **7.5-9 days** |
| 2 | KCL Component Library | 9-12 days | 0 | **10-13 days** |
| 3 | AI Engine + JAAL Connector | 10-15 days | +2 days | **12-17 days** |
| 4 | Frontend Simple Mode + Cross-Product | 10-14 days | +1 day | **11-15 days** |
| 5 | Power Mode & Exports | 17-25 days | +1.5 days | **19.5-28 days** |
| 6 | Edit Mode | 9-12 days | 0 | **9-12 days** |
| 7 | Polish, Security & Platform | 16-22 days | 0 | **16-22 days** |
| | **TOTAL** | **79-109 days** | **+8.5 days** | **89-122 days** |

> **Note on Phase 1:** +3 days includes P2 (1.5d), P4 (1d), and P8 (0.5d).
> **Note on Phase 2:** +1 day reflects 3 additional KCL components (kcl-code, kcl-embed, kcl-source) in A4.
> **Note on Phase 5:** +1.5 days includes P9 Canvas-in-Docs embedding (1.5d) and D2 PNG/SVG expansion (+1d).

---

## Product Independence Verification

### Docs-Only (`ENABLED_PRODUCTS=docs`)

| Subsystem | Status |
|-----------|--------|
| All existing Docs features | Works |
| Knowledge graph (doc-scoped) | Works |
| Knowledge indexer explicitly tags entities with `product_source: 'docs'` | Works (P8) |
| Memory graph ingest endpoint | Available if `MEMORY_GRAPH_ENABLED=true` |
| Cross-product entity display | No cross-product badges (all entities show as Docs) |
| Canvas-in-Docs embedding | Extension not registered (Design Studio disabled) |
| Design Studio routes | Not registered (404) |
| Design Studio nav items | Hidden |
| JAAL sync target | Works if `MEMORY_GRAPH_ENABLED=true` |

### Design-Studio-Only (`ENABLED_PRODUCTS=design-studio`)

| Subsystem | Status |
|-----------|--------|
| Canvas CRUD, AI, exports | Works |
| KCL components & serving | Works |
| Memory graph awareness in AI | Works if `MEMORY_GRAPH_ENABLED=true` |
| Doc cross-referencing | Gracefully unavailable (no Docs) |
| Knowledge graph entities | Queryable (empty if no Docs) |
| JAAL sync target | Works if `MEMORY_GRAPH_ENABLED=true` |
| Document routes | Not registered (404) |
| Document nav items | Hidden |
| File manager | Shows canvases only |

### Research-Only (JAAL standalone, no Kacheri backend)

| Subsystem | Status |
|-----------|--------|
| JAAL browser | Works fully standalone |
| Session management | Works locally (file-based proofs) |
| Trust aggregation | Works locally |
| Memory graph sync | Fails gracefully (no backend, 404 handled silently) |
| All research features | Fully functional offline |

### All Products + Memory Graph

| Subsystem | Status |
|-----------|--------|
| Everything above | Works |
| Memory graph ingest | Full functionality |
| Cross-product entity display | Product badges, filters, click-to-navigate |
| Canvas frames embeddable in Docs | Via Tiptap CanvasEmbed extension (P9) |
| JAAL research visible in Docs | Via knowledge graph search |
| JAAL research visible in Design Studio | Via memory context in AI prompts |
| Docs entities visible in Design Studio | Via doc cross-reference + memory graph |
| Design assets tracked | As `design_asset` entities |
| File manager | Shows both docs and canvases |
| Knowledge Explorer | Shows entities from all products with badges + kcl-source provenance links |

### Memory Graph Disabled (`MEMORY_GRAPH_ENABLED=false`)

| Subsystem | Status |
|-----------|--------|
| `/platform/memory/ingest` | Not registered (404) |
| Existing knowledge graph routes | Still work (Docs-owned) |
| Design Studio AI | Works without memory context |
| JAAL sync | Fails gracefully (404 on ingest, no crash) |
| Cross-product entity display | No cross-product badges |
| All products | Work independently with full functionality |

---

## Milestone Summary

| Milestone | What's Usable | Gate |
|-----------|---------------|------|
| **M0: Modular Platform** | Docs works standalone, Design Studio routes ready, Memory Graph schema ready | Phase 0 |
| **M1: Data Backbone** | Canvas CRUD via API, memory graph ingest functional, PAT auth working, Docs knowledge indexer Memory Graph bridge operational (P8) | Phase 1 |
| **M2: Component Runtime** | KCL components render in standalone HTML | Phase 2 |
| **M3: AI Brain + Connected Research** | AI generates frames, JAAL syncs to memory, cross-product AI context | Phase 3 |
| **M4: Simple Mode MVP + Cross-Product Intelligence** | Full create -> generate -> view -> present flow + cross-product entity display | Phase 4 |
| **M5: Power User Ready** | Code editor, all exports (HTML/PDF/PPTX/PNG/SVG/MP4), templates, versions, canvas frames embeddable in Docs (P9) | Phase 5 |
| **M6: Non-Coder Ready** | Visual editing via Properties Panel | Phase 6 |
| **M7: Production Ready** | Security hardened, performant, collaborative, mobile | Phase 7 |

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

**No new dependencies required for Platform slices (P1-P9).** All platform work uses existing infrastructure (SQLite, nanoid, crypto, axios in JAAL, Electron safeStorage). P9 (Canvas-in-Docs embedding) uses the existing Tiptap extension system and sandboxed iframes — no new libraries needed.

---

## Success Metrics

Performance and quality targets carried forward from the Design Studio work scope. These metrics serve as acceptance criteria for milestone gates.

| Metric | Target |
|--------|--------|
| AI code generation success rate (first attempt) | > 85% |
| AI code generation success rate (after retry) | > 95% |
| Frame render time (iframe load to paint) | < 500ms |
| Thumbnail capture time | < 1 second |
| Canvas load time (10 frames) | < 2 seconds |
| PDF export time (10 frames) | < 30 seconds |
| HTML export time (10 frames) | < 5 seconds |
| PPTX text editability rate | > 70% |
| KCL bundle size (core) | < 100KB gzipped |
| Code editor keystroke-to-preview | < 500ms |
| Presentation mode transition | < 300ms |
| Properties Panel change-to-render | < 200ms |
| AI image generation time | < 15 seconds |
| Video export (10 frames, 1080p) | < 2 minutes |
| Memory graph ingest (500 entities) | < 5 seconds |
| Cross-product entity query | < 200ms |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Phase 0 modularization breaks existing Docs | High | Full regression testing before proceeding. Phase 0 is refactoring only — no new features. |
| Memory graph schema migration breaks knowledge graph | Medium | P1 uses `ALTER TABLE ADD COLUMN` with defaults. All existing data preserved. Test against current database before merge. |
| PAT security introduces auth bypass vector | Medium | PATs are SHA256-hashed at rest. Workspace-scoped. Revocable. Max 10 per user. Scope restrictions enforced. |
| JAAL sync volume overwhelms backend | Low | Rate limited (60/min). Batch endpoint, not per-entity. Max 500 entities per ingest call. |
| Memory graph adds noise to knowledge graph | Low | Product source filtering in UI. Admin can delete entities by source. `cleanupStaleEntities` respects product source. |
| KCL scope creep | High | New components require work scope amendment. KCL does structure, CSS does styling. |
| AI code generation quality insufficient | Medium | B1 includes validation + retry. KCL constraints bound AI output. |
| Product module toggle adds complexity | Low | One-time cost. Clean separation pays off immediately and for all future products. |
| Phase 0 regression breaks Docs | High | Explicit regression gate: all existing endpoints tested, all frontend pages verified, existing tests pass with `ENABLED_PRODUCTS=docs`. |
| Canvas permissions model complexity | Medium | Follow existing `doc_permissions` pattern exactly. Workspace RBAC is baseline; `canvas_permissions` are overrides. |
| P8 breaks existing knowledge indexer | Low | Additive change only — new optional fields with defaults. Existing code paths unchanged. All existing tests pass. |

---

*This roadmap is the execution anchor for the BEYLE Platform, including Design Studio and Memory Graph. All implementation must follow the phase sequencing and dependency chains defined here. Changes to phases, slice ordering, or dependencies require explicit amendment to this document.*

*Source of truth for Design Studio feature scope: `Docs/Roadmap/beyle-design-studio-work-scope.md` + Addendum A*
*Source of truth for platform architecture: `Docs/blueprint/architecture blueprint.md`*
*Historical reference: `Docs/Roadmap/beyle-design-studio-roadmap.md` (superseded by this document)*
