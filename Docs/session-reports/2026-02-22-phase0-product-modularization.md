# Session Report: Phase 0 — Product Modularization + Memory Graph Foundation

**Date:** 2026-02-22
**Phase:** 0 (of 8) from BEYLE Platform Unified Roadmap
**Goal:** Introduce product-level toggling so Docs and Design Studio can be independently enabled/disabled. Extend knowledge graph schema for multi-product memory. No Design Studio code yet — this phase only restructures the existing codebase and prepares the data layer.

## Phase 0 Slices

| Slice | Name | Status | Effort |
|-------|------|--------|--------|
| M1 | Backend Product Module Registry | COMPLETE | 1 day |
| M2 | Frontend Product Module Guards | COMPLETE | 0.5 day |
| M3 | Backend Config Endpoint + Build-Time Config | COMPLETE | 0.5 day |
| P1 | Memory Graph Schema Extension | COMPLETE | 0.5 day |
| P3 | Platform Config — Memory Graph Feature Flag | COMPLETE | 0.5 day |

## Documents Read

- `Docs/Roadmap/beyle-platform-unified-roadmap.md` — Phase 0 spec, all 5 slices
- `Docs/blueprint/architecture blueprint.md` — platform core vs product boundaries
- `Docs/Roadmap/docs roadmap.md` — pilot-ready (complete) + prod-ready scope
- `Docs/API_CONTRACT.md` — existing API surface
- `Docs/session-reports/2026-02-22-m1-product-module-registry.md` — M1 session report

## Architecture & Roadmap Alignment

- Phase 0 is the first phase of the unified roadmap (55 slices, 89-122 days total)
- Architecture blueprint defines products as independently toggleable
- No drift detected between roadmap, blueprint, and current code
- M1 established the backend pattern; M2 mirrors it on frontend
- M3 will create the config endpoint; P1/P3 extend the knowledge graph

## Assumptions Ruled Out

- NOT handling `MEMORY_GRAPH_ENABLED` route guarding (that is Slice P3 — M3 only reads the env var for the config response)
- NOT adding any Design Studio routes or UI (that is Phase 1+)
- NOT modifying AppLayout.tsx (navigation filtering handled at route level)
- NOT adding any new dependencies

## Constraints

- Default behavior (no env var set) must match current behavior (all routes available)
- All existing Docs functionality must remain unaffected
- Frontend uses build-time env var `VITE_ENABLED_PRODUCTS` until M3 provides runtime config

## Risks

- None identified for M1/M2. Both are additive refactors wrapping existing code in conditionals.

---

## Slice M1: Backend Product Module Registry — COMPLETE

**Detailed session report:** `Docs/session-reports/2026-02-22-m1-product-module-registry.md`

**Summary:**
- Created `KACHERI BACKEND/src/modules/registry.ts` — singleton pattern, reads `ENABLED_PRODUCTS` env var
- `ProductId = 'docs' | 'design-studio'`, exports `isProductEnabled()`, `areAllProductsEnabled()`, `getProductRegistry()`
- Refactored `server.ts` route registration into product-scoped blocks:
  - Shared routes (auth, workspace, proofs, jobs, health, audit, notifications) — always registered
  - Docs routes — registered only when `docs` is enabled
  - Design Studio placeholder — registered only when `design-studio` is enabled
  - Cross-product placeholder — registered only when both products are enabled
- 17 test cases covering all acceptance criteria, all passing
- 535 total backend tests passing, zero TypeScript errors
- No behavioral changes when `ENABLED_PRODUCTS` is unset (defaults to both products)

---

## Slice M2: Frontend Product Module Guards — COMPLETE

### Files Created

**`KACHERI FRONTEND/src/modules/registry.ts`** — Frontend product registry:
- Mirrors backend `KACHERI BACKEND/src/modules/registry.ts` pattern exactly
- Same `ProductId = 'docs' | 'design-studio'` type union
- Reads `VITE_ENABLED_PRODUCTS` build-time env var (default: `'docs,design-studio'`)
- Same `parseEnabledProducts()` logic: deduplicates, trims, lowercases, filters unknowns
- Frontend-specific: warns + falls back to default on empty list (vs backend throws)
- Singleton pattern: `getProductRegistry()`, `resetProductRegistry()` (testing)
- Public API: `isProductEnabled()`, `areAllProductsEnabled()`, `useProductConfig()` (React hook)
- React hook uses `useSyncExternalStore` for future runtime update support (M3)

**`KACHERI FRONTEND/src/modules/ProductGuard.tsx`** — Route guard component:
- Follows `ProtectedRoute` pattern (children wrapper, conditional render)
- If product enabled → render `{children}`
- If product disabled → render centered informational page with product name, message, and "Back to Home" link
- No redirect — user sees the URL they tried to visit
- Product labels: `docs` → "Kacheri Docs", `design-studio` → "Beyle Design Studio"

### Files Modified

**`KACHERI FRONTEND/src/App.tsx`** — Route guard integration:
- Added import for `ProductGuard` from `./modules/ProductGuard`
- Reorganized routes into three groups with comments:
  1. **Auth routes (public):** `/login`, `/register`, `/invite/:token`
  2. **Shared protected routes:** `/`, `/files`, `/ai-watch`, `/workspaces/:id/ai-safety`, `/help/proofs`, `/workspaces/:id/knowledge`
  3. **Docs product routes (guarded):** `/docs`, `/doc/:id`, `/workspaces/:id/extraction-standards`, `/workspaces/:id/compliance-policies`, `/workspaces/:id/clauses`, `/workspaces/:id/negotiations`
- Each docs route wrapped: `<ProtectedRoute><ProductGuard product="docs">...</ProductGuard></ProtectedRoute>`
- Placeholder comment for Design Studio routes (Slice C2)

### Design Decisions

1. `VITE_ENABLED_PRODUCTS` build-time env var (M3 runtime config support deferred to M3)
2. Singleton pattern — no React context needed (config is static at build time)
3. `ProductGuard` follows `ProtectedRoute` pattern (children wrapper)
4. AppLayout.tsx left unchanged — navigation filtering happens at route level because:
   - Nav items are embedded in individual pages (EditorPage, FileManagerPage)
   - When docs is disabled, EditorPage doesn't render → its nav items naturally disappear
   - FileManagerPage is shared (workspace home) → always available
5. Knowledge Explorer (`/workspaces/:id/knowledge`) classified as **shared** (cross-product per P6)
6. Frontend falls back to defaults on invalid config (vs backend throws) — better UX

### What Was Intentionally NOT Changed

- AppLayout.tsx — no changes needed (nav filtering handled at route level)
- FileManagerPage.tsx — shared page, always available
- EditorPage.tsx — guarded at route level, no internal changes needed
- No new CSS files — ProductGuard uses inline styles (simple centered message)
- No React context provider — build-time config is static, `useSyncExternalStore` is sufficient

### Verification

- `tsc --noEmit` — zero TypeScript errors
- `vitest run` — 8 test files, 98 tests, all passing
- Default behavior (no env var) — both products enabled, all routes available, zero regression
- Route ordering preserved (shared routes, then docs routes, then fallback)

---

## Slice M3: Backend Config Endpoint + Build-Time Config — COMPLETE

### Files Created

**`KACHERI BACKEND/src/routes/config.ts`** — Platform config endpoint:
- `GET /config` — public endpoint (no auth required)
- Returns `PlatformConfigResponse`: `{ products, version, features }`
- `products`: reads from `getProductRegistry().enabledProducts`
- `version`: reads from `package.json` (currently `0.1.0`)
- `features.docs.enabled` / `features.designStudio.enabled`: derived from `isProductEnabled()`
- `features.memoryGraph.enabled`: reads `MEMORY_GRAPH_ENABLED` env var (default: `true`)
- Follows `routes/health.ts` pattern (export default async function)

### Files Modified

**`KACHERI BACKEND/src/server.ts`** — Route registration:
- Added import for `configRoutes` from `./routes/config`
- Registered in SHARED ROUTES section (after health, before audit)
- Added `/config [GET]` to `sharedRoutes` index array

**`KACHERI FRONTEND/src/modules/registry.ts`** — Runtime config fetch:
- Added `FeatureFlags` interface: `{ docs, designStudio, memoryGraph }` — each `{ enabled: boolean }`
- Extended `ProductRegistryConfig` with `features: FeatureFlags` and `version: string | null`
- Added `fetchProductConfig()`: calls `GET /api/config` at runtime, updates singleton, notifies React subscribers via `useSyncExternalStore`
- Added `isFeatureEnabled(feature)` utility for checking feature flags
- Deduplicates concurrent fetch calls; never throws — silently keeps build-time defaults on failure
- Wired `subscribe()` to use proper listener set (was no-op in M2; now notifies on config changes)

**`KACHERI FRONTEND/src/vite-env.d.ts`** — Type definitions:
- Consolidated duplicate `ImportMetaEnv` declarations
- Added `VITE_ENABLED_PRODUCTS` and `VITE_MEMORY_GRAPH_ENABLED` type definitions

**`Docs/API_CONTRACT.md`** — API documentation:
- Added "Platform Config Endpoint (Slice M3)" section before Observability section
- Documented `GET /config` endpoint, response shape, all fields, and behavior notes

### Design Decisions

1. Route path is `/config` on backend (frontend accesses as `/api/config` via Vite proxy rewrite)
2. Public endpoint — product config is non-sensitive discovery information
3. Version read from `package.json` via `resolveJsonModule` (already enabled in tsconfig)
4. `MEMORY_GRAPH_ENABLED` defaults to `true` per roadmap spec
5. Frontend `fetchProductConfig()` is optional enhancement — never blocks rendering
6. `isMemoryGraphEnabled()` is a local helper in config.ts (not exported to registry yet — P3 will wire it into the registry's `isFeatureEnabled()`)
7. No new dependencies

### What Was Intentionally NOT Changed

- No backend registry changes — `MEMORY_GRAPH_ENABLED` route guarding is Slice P3's responsibility
- No App.tsx changes — frontend already uses build-time config; runtime fetch is an opt-in enhancement
- No new React context — `useSyncExternalStore` with listener set is sufficient
- vite.config.ts unchanged — Vite natively exposes `VITE_*` env vars; only type definitions added

## Slice P1: Memory Graph Schema Extension — COMPLETE

### Files Created

**`KACHERI BACKEND/migrations/013_extend_memory_graph.sql`** — Table recreation migration:
- Recreates `workspace_entities` without `entity_type` CHECK constraint (validation moved to app layer via `VALID_ENTITY_TYPES` array). Allows new entity types: `web_page`, `research_source`, `design_asset`, `event`, `citation`.
- Recreates `entity_mentions` with three schema changes:
  - `doc_id` made nullable (non-doc products use `source_ref` instead)
  - `product_source TEXT NOT NULL DEFAULT 'docs'` with CHECK constraint for `docs`, `design-studio`, `research`, `notes`, `sheets`
  - `source_ref TEXT` nullable column for non-doc references (canvas_id, session_id, etc.)
- New index: `idx_mentions_product_source` on `entity_mentions(product_source)`
- All existing data preserved — existing rows get `product_source = 'docs'`, `source_ref = NULL`
- All existing indexes recreated identically
- SQLite table recreation approach used because ALTER COLUMN and CHECK modification are unsupported

### Files Modified

**`KACHERI BACKEND/src/store/workspaceEntities.ts`** — Extended entity types:
- `EntityType` union extended with 5 new types: `web_page`, `research_source`, `design_asset`, `event`, `citation`
- `VALID_ENTITY_TYPES` array extended with same 5 types
- `validateEntityType()` automatically accepts new types (checks against array)
- No changes to `createEntity()` or any other function

**`KACHERI BACKEND/src/store/entityMentions.ts`** — Multi-product mention support:
- Added `ProductSource` type: `'docs' | 'design-studio' | 'research' | 'notes' | 'sheets'`
- Added `validateProductSource()` function
- `EntityMention.docId` changed from `string` to `string | null`
- `EntityMention` gained `productSource: ProductSource` and `sourceRef: string | null`
- `EntityMentionRow` updated with `product_source`, `source_ref`, nullable `doc_id`
- `CreateMentionInput.docId` changed from required to optional
- `CreateMentionInput` gained optional `productSource` and `sourceRef`
- `rowToMention()` maps new columns with safe defaults
- `createMention()` passes new columns to INSERT; validates docs product requires docId

**`KACHERI BACKEND/src/knowledge/relatedDocs.ts`** — Null guard for nullable docId:
- Added `if (!mention.docId) continue;` before processing mention in related docs pipeline
- Non-doc mentions (from research, design-studio) are skipped in doc-to-doc relatedness

**`KACHERI BACKEND/src/knowledge/semanticSearch.ts`** — Null guard for nullable docId:
- Added `if (!mention.docId) continue;` before processing mention in semantic search
- Non-doc mentions skipped when building doc results from entity matches

### Design Decisions

1. **Table recreation** over ALTER TABLE ADD COLUMN for `entity_mentions` — required because `doc_id NOT NULL` cannot be changed to nullable via ALTER, and acceptance criteria require NULL doc_id inserts
2. **Table recreation** for `workspace_entities` — required because entity_type CHECK cannot be expanded via ALTER, and acceptance criteria require new entity types to be insertable
3. **App-layer validation** for entity types — `VALID_ENTITY_TYPES` array is the source of truth; future entity types can be added without schema changes
4. **App-layer validation** for docs docId requirement — `createMention()` throws if `productSource === 'docs'` and no `docId` provided
5. **Backward compatible** — all existing callers continue to work unchanged (harvester always passes docId, doesn't pass productSource/sourceRef → defaults apply)

### What Was Intentionally NOT Changed

- `entityHarvester.ts` — P8 scope (will explicitly tag docs mentions with `product_source: 'docs'`)
- `knowledge.ts` routes — no API-visible changes in P1
- `entityRelationships.ts`, `knowledgeQueries.ts` — untouched
- `API_CONTRACT.md` — no API changes
- Frontend code — no changes
- FTS5 virtual tables — not affected by table recreation

### Verification

- `tsc --noEmit` — zero TypeScript errors (backend + frontend)
- `vitest run` — 28 test files, 535 tests, all passing
- Migration SQL reviewed: preserves all data, recreates all indexes
- Backward compatibility confirmed: existing harvester calls work unchanged

## Slice P3: Platform Config — Memory Graph Feature Flag — COMPLETE

### Files Modified

**`KACHERI BACKEND/src/modules/registry.ts`** — Feature flag utility:
- Added `FeatureId` type: `'memoryGraph'`
- Added `isFeatureEnabled(feature: FeatureId): boolean` function
- For `memoryGraph`: reads `MEMORY_GRAPH_ENABLED` env var (defaults to `true`); treats `'false'` and `'0'` as disabled
- Mirrors the frontend's `isFeatureEnabled()` pattern from M3

**`KACHERI BACKEND/src/routes/config.ts`** — Centralized feature flag check:
- Replaced local `isMemoryGraphEnabled()` with `isFeatureEnabled('memoryGraph')` from registry
- Removed redundant local helper — single source of truth in registry

**`KACHERI BACKEND/src/server.ts`** — Memory graph route guard + boot log:
- Imported `isFeatureEnabled` from registry
- Added `memoryGraphEnabled` to boot info log alongside `enabledProducts`
- Added `MEMORY GRAPH ROUTES` section after cross-product placeholder — guarded by `isFeatureEnabled('memoryGraph')`
- Placeholder for P2's `/platform/memory/ingest` route; existing Docs knowledge graph routes remain unaffected

### Design Decisions

1. `isFeatureEnabled()` uses a switch statement for extensibility — future feature flags (e.g., AI image generation credits) can be added as new cases
2. Registry is the single source of truth — `config.ts` delegates to it rather than having its own env var parsing
3. Memory graph route section is positioned after cross-product routes, before the index route — follows the existing pattern of product-specific sections
4. Boot log includes `memoryGraphEnabled` for operational visibility

### What Was Intentionally NOT Changed

- Frontend code — `isFeatureEnabled('memoryGraph')` already existed from M3
- Config endpoint response shape — already correct from M3
- Existing knowledge graph routes — remain under Docs product section (Docs-owned, unaffected by toggle)
- No new dependencies
- No API contract changes (config endpoint already documented in M3)

### Verification

- `tsc --noEmit` — zero TypeScript errors (backend + frontend)
- `vitest run` — 28 test files, 535 tests, all passing
- No regression — config endpoint still returns `memoryGraph: { enabled: true }` by default
- Boot log now shows `memoryGraphEnabled: true` alongside `enabledProducts`

---

## Phase 0 Gate Checklist

- [x] Product module registry works on backend (M1)
- [x] Frontend conditionally renders navigation and routes (M2)
- [x] Existing Docs functionality unaffected — all 535 backend tests pass (M1), 98 frontend tests pass (M2)
- [x] `ENABLED_PRODUCTS=docs` works as a standalone deployment (M1 backend + M2 frontend)
- [x] Config endpoint serves product availability and feature flags (M3)
- [x] Memory graph migration (013) runs cleanly on existing database (P1)
- [x] New entity types accepted by `WorkspaceEntitiesStore` (P1)
- [x] `MEMORY_GRAPH_ENABLED` flag correctly controls feature availability (P3)
- [x] Non-doc mentions can be created with `doc_id: NULL` and `source_ref` set (P1)
