# Session Report: Slice M1 — Backend Product Module Registry

**Date:** 2026-02-22
**Goal:** Introduce product-level toggling so Docs and Design Studio can be independently enabled/disabled at the backend route registration level.

## Documents Read
- `Docs/Roadmap/beyle-platform-unified-roadmap.md` — Phase 0, Slice M1 spec
- `Docs/blueprint/architecture blueprint.md` — platform core vs product boundaries
- `Docs/API_CONTRACT.md` — existing API surface (no changes needed for M1)
- `KACHERI BACKEND/src/server.ts` — current route registration (all unconditional)
- `KACHERI BACKEND/src/auth/config.ts` — singleton config pattern reference

## Architecture & Roadmap Alignment
- M1 is Phase 0, Slice 1 of the unified roadmap
- Architecture blueprint defines products as independently toggleable
- No drift detected between roadmap, blueprint, and current code
- API contract unaffected (M1 controls registration, not endpoints)

## Assumptions Ruled Out
- NOT extracting inline doc routes to a separate file (deferred to future cleanup)
- NOT creating `GET /api/config` endpoint (that is Slice M3)
- NOT handling `MEMORY_GRAPH_ENABLED` (that is Slice P3)
- NOT adding any new dependencies

## Constraints
- Route ordering for AI routes must be preserved (specific before generic)
- Default behavior (`ENABLED_PRODUCTS` unset) must register all routes (backward compatible)
- All existing tests must pass unchanged

## Risks
- None identified. The refactor is additive (wrapping existing code in conditionals).

---

## Work Log

### Slice: Create `src/modules/registry.ts` — COMPLETE
- Singleton pattern following `auth/config.ts`
- Reads `ENABLED_PRODUCTS` env var (default: `docs,design-studio`)
- Exports `isProductEnabled()`, `areAllProductsEnabled()`, `getProductRegistry()`, `resetProductRegistry()`
- `ProductId` type union: `'docs' | 'design-studio'`
- Validates input: unknown products filtered, empty list throws
- Deduplicates, trims, lowercases input

### Slice: Create `src/modules/__tests__/registry.test.ts` — COMPLETE
- 17 test cases covering all acceptance criteria
- Tests: defaults, single product, multiple products, normalization, unknown products, empty/invalid input, singleton caching, reset behavior

### Slice: Refactor `server.ts` route registration — COMPLETE
- Added import for `isProductEnabled`, `areAllProductsEnabled`, `getProductRegistry`
- Added boot log: `Product modules` with `enabledProducts` array
- **Shared routes** (always registered): metrics, health, audit, artifacts, jobs, messages, notifications, notification preferences, invites
- **Docs routes** (conditional): AI routes, import/export, attachments, reviewers, file manager, extraction, compliance, clauses, knowledge, negotiations, doc permissions, comments, versions, suggestions, templates, doc links
- **Docs inline routes** (conditional): GET/POST /docs, CRUD, layout, trash, restore, PDF export, export file serving, provenance
- **Design Studio placeholder**: logs info when enabled, no routes yet
- **Cross-product placeholder**: empty block, no routes yet
- **Index route**: dynamic — `sharedRoutes` + `docsRoutes` (conditional) + `designStudioRoutes` (conditional), added `enabledProducts` to response

### Verification — COMPLETE
- `tsc --noEmit` — zero errors
- `vitest run` — 28 test files, 535 tests, all passing (including 17 new registry tests)
- Route ordering preserved: specific AI routes before generic `/docs/:id/ai/:action`
- No behavioral changes when `ENABLED_PRODUCTS` is unset (defaults to both products)

---

## Decisions Made
1. Inline doc routes wrapped in `if (isProductEnabled('docs'))` block directly in `main()` rather than extracted to a separate function — simpler, less risk, same outcome
2. Index route split into `sharedRoutes` / `docsRoutes` / `designStudioRoutes` arrays with conditional spreading
3. `docs/:docId/artifacts` and `docs/:docId/jobs` moved to `docsRoutes` list (doc-scoped views of shared resources)

## What Was Intentionally NOT Changed
- No imports removed from server.ts (unused imports are harmless)
- No indentation changes inside the `if` blocks (minimizes diff)
- Debug routes remain unconditional (infrastructure)
- Job queue start remains unconditional (shared infrastructure)
- `attachProvenanceBridge()` remains unconditional
- `installWorkspaceWs()` remains unconditional

## Next Steps
- Slice M2: Frontend Product Module Guards
- Slice M3: Backend Config Endpoint (`GET /api/config`)
- Slice P1: Memory Graph Schema Extension (migration 013)
