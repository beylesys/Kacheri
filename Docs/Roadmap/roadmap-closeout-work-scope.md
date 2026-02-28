# Roadmap Close-Out — Full Work Scope

**Created:** 2026-02-20
**Scope:** Roadmap Sections 2.5, 2.7 remaining gaps + Phase 5 P0.2 + tracked deferred perf items + doc hygiene
**Excluded:** Section 2.3 (Group RBAC, SCIM, legal hold, external viewers, expanded audit export) + 2.4 cross-workspace link controls (requires 2.3 RBAC)
**Baseline:** Sections 2.1, 2.2, 2.4 (except cross-workspace), 2.6, 2.8 confirmed complete. 2.5 at ~90%, 2.7 at ~30%.

---

## Audit-Corrected Baseline — What's Actually Done

| Roadmap Item | Status | Evidence |
|---|---|---|
| 2.1 — Multi-column layouts (2–4 cols, gap/rule, asymmetric) | Done | `ColumnSection.ts` extended Phase 2 Slice 8 |
| 2.1 — Advanced page numbering (roman, alpha, section reset) | Done | `PageSetupDialog.tsx` extended Phase 2 Slice 7 |
| 2.1 — Legal numbering (7 styles, `startFrom`) | Done | `OrderedListEnhanced.ts` Phase 2 Slice 6 |
| 2.1 — Large doc performance (React.memo, lazy images, polling) | Partial | Phase 2 Slice 14; no virtualization for 500+ pages |
| 2.2 — Comment filters (9 params) + bulk resolve | Done | Phase 2 Slice 1 |
| 2.2 — Suggestion filters (changeType, from/to) | Done | Phase 2 Slice 2 |
| 2.2 — Arbitrary version diffs | Done | Phase 2 Slice 3 |
| 2.2 — Notification hooks (webhook, Slack Block Kit, email SMTP) | Done | Phase 2 Slices 11+13 |
| 2.2 — Review assignment system | Done | Phase 2 Slice 12 |
| 2.3 — Advanced RBAC & Enterprise IT | **Deferred** | Held for enterprise onboarding |
| 2.4 — Wiki-style graph view (doc links + entity graph) | Done | `DocLinkGraph.tsx`, `EntityGraph.tsx` — Phase 2 Slices 9–10 |
| 2.4 — Semantic search layer | Done | `SemanticSearchBar.tsx` + `semanticSearch.ts` — Cross-Doc Intelligence |
| 2.4 — Cross-workspace link controls | **Deferred** | Requires 2.3 RBAC model |
| 2.5 — verify:nightly script + replay | Done | `scripts/nightly_verify.ts` |
| 2.5 — CI/cron integration + JSON reports | Done | GitHub Actions workflow |
| 2.5 — Artifacts table (storage_provider, storage_key, verified_at) | Done | Migration 002 |
| 2.5 — Storage abstraction module (local/S3/GCS) | Done | `src/storage/` — factory + singleton + env config |
| 2.5 — Storage wiring into application paths | **Not done** | provenance, imageUpload, docAttachments, exportDocx still use direct `fs` |
| 2.5 — Background workers (5/9 types implemented) | Partial | verify:export/compose, reminder, knowledge:index, notification:deliver |
| 2.5 — Background workers (4 orphan types) | **Not done** | export:pdf, export:docx, import:file, cleanup:orphan — typed but no handlers |
| 2.5 — Structured logs (Pino) + Prometheus metrics | Done | `observability/logger.ts`, `observability/metrics.ts` |
| 2.5 — Health checks (ready/live/full) | Done | `routes/health.ts` |
| 2.6 — All items | Done | Badges, heatmap, dashboard, provider display, onboarding |
| 2.7 — Responsive breakpoints (basic) | Partial | `@media` in 14+ CSS files, but no mobile-first redesign |
| 2.7 — ARIA roles (surface level) | Partial | `role="dialog"`, `aria-label` present; zero focus trapping |
| 2.7 — Offline behavior hardening | **Not done** | No offline indicator, no conflict UX |
| 2.7 — Big-doc regression tests | **Not done** | `benchmarkDocGenerator.ts` exists but no test suite |
| 2.8 — Document Attachments System | Done | Full stack: migration 010, store, routes, AttachmentPanel, AttachmentViewer |
| Phase 5 — Report archiving + history UI | Done | `ReportHistoryTable.tsx`, `ReportDetailModal.tsx` |
| Phase 5 — Hotspot detection + provider analytics | Done | `/ai/watch/hotspots`, `/ai/watch/providers`, `HotspotCard.tsx` |
| Phase 5 — Compose determinism indicator | Done | `ComposeDeterminismIndicator.tsx` |
| Phase 5 — Grafana dashboard + alert rules | Done | `monitoring/dashboards/`, `monitoring/alerts/` |
| Phase 5 — Migration runner CLI | Done | `scripts/migrate.ts` |
| Deferred #1 — Email notification infrastructure | Done | `nodemailer` installed, SMTP in `notificationDeliverWorker.ts` |
| Deferred #2 — Graph visualization | Done | Custom SVG force-directed graphs, zero external deps |
| Deferred #3 — Vector embeddings | **Deferred** | FTS5+AI sufficient at workspace scale |
| Deferred #4 — Cross-workspace search | **Deferred** | Requires 2.3 RBAC |
| Deferred #5 — Real-time entity detection | **Deferred** | Nice-to-have, not in roadmap |
| Deferred #6 — N+1 query optimization | **Not done** | No batch `getExtractionsByIds()` |
| Deferred #7 — Entity normalizer scaling | **Not done** | O(n²) with 500 cap |
| Deferred #8 — Frontend unit tests | **Not done** | Zero test files in frontend |

---

## What's Remaining — 9 Slices, 3 Sprints (16 Days)

---

### Sprint 1: Storage & Verification Close-Out (4 days)

#### Slice 1: Storage Client Wiring (1 day)

**Problem:** The storage abstraction module exists at `src/storage/` (local/S3/GCS with factory + singleton), but the main file I/O paths bypass it entirely. Proof recording, image upload, attachment upload, and export serving all use direct `fs.writeFile`/`fs.readFile`. This means switching to S3/GCS requires code changes in 4+ files instead of a config change.

**What to build:** Wire existing `getStorage()` into all file I/O paths. No new module — the abstraction is done.

**Files to modify:**

| File | Current | Change |
|---|---|---|
| `src/provenance.ts:248` | `fs.writeFileSync(onDisk, ...)` | `await getStorage().write(storageKey, buffer)` |
| `src/provenance.ts:297` | `fs.readFileSync(r.path)` | `await getStorage().read(storageKey)` |
| `src/routes/imageUpload.ts:124` | `await fs.writeFile(filePath, buf)` | `await getStorage().write(storageKey, buf)` |
| `src/routes/docAttachments.ts:162` | `await fs.writeFile(filePath, buf)` | `await getStorage().write(storageKey, buf)` |
| `src/routes/exportDocx.ts:714` | `await writeFileAtomic(full, buffer)` | `await getStorage().write(storageKey, buffer)` |

**Key decisions:**
- Storage keys follow pattern: `{workspace_id}/{type}/{doc_id}/{filename}` (e.g., `ws_123/proofs/doc_456/proof_789.json`)
- `storage_key` column on proofs table populated on every write
- Local provider stores at existing paths for backward compatibility
- All reads that currently use filesystem paths must resolve via `storage_key` from DB → `getStorage().read()`

**Env vars:** Already configured — `STORAGE_PROVIDER`, `AWS_S3_BUCKET`, `AWS_REGION`, `GCS_BUCKET`, `GCS_PROJECT_ID`

**API Contract:** No endpoint changes. Storage is internal.

**Migration:** None. Existing files remain. New writes go through the client.

---

#### Slice 2: Artifacts Canonicalization (2 days)

**Problem:** Proof packets are dual-written (filesystem JSON + DB row), but reads still go to filesystem in some paths. The DB should be canonical; filesystem/cloud is just a storage backend.

**What to build:**

1. **Refactor verify:nightly** to resolve artifacts via DB → storage client, not direct filesystem paths
   - `scripts/nightly_verify.ts` → resolve proof paths through `artifacts.getByHash()` → `getStorage().read()`
   - `scripts/replay_exports.ts` → same pattern
   - `scripts/replay_ai_compose.ts` → same pattern

2. **Refactor export serving** to fetch via storage client using `storage_key` from DB
   - Export download routes must use `getStorage().read(storageKey)` instead of `fs.readFile(path)`

3. **Backfill script: `scripts/backfill_storage_keys.ts`**
   - Scans existing proof files on disk
   - Populates `storage_key` for any rows where it's null
   - Idempotent — safe to run multiple times
   - Registered as `npm run backfill:storage-keys`

4. **Integrity script: `scripts/verify_storage_integrity.ts`**
   - For each artifact in DB with a `storage_key`, confirms the storage backend has the file
   - Verifies hash matches where available
   - Outputs JSON report with `pass`/`fail`/`missing` per artifact
   - Registered as `npm run verify:storage-integrity`

5. **Update `recordProof()`** to always set `storage_key` on insert (currently some paths leave it null)

**Invariant after this slice:** Every artifact read goes through artifacts store → storage client. No direct `fs.readFile` for proof/export data remains in application code.

**API Contract:** No endpoint changes.

**Dependencies:** None new. Uses existing storage module from Slice 1.

---

#### Slice 3: Verification Failure Notifications (1 day)

**Problem:** `nightly_verify.ts` runs and saves reports, but P0.2 (failure notifications) was deferred. When verification fails at 2 AM, nobody knows until they check the dashboard.

**What to build:**

1. **Add `--notify` flag to `nightly_verify.ts`**
   - Parse via `process.argv.includes('--notify')`
   - On status `fail` or `partial`, dispatch notifications

2. **Slack notification:**
   - `POST` to `KACHERI_VERIFY_SLACK_WEBHOOK` URL
   - Same HTTP POST pattern already used in `notificationDeliverWorker.ts`
   - Payload: `{ status, failureSummary, reportUrl, timestamp }`
   - No new dependency

3. **Email notification:**
   - Send via existing `nodemailer` transport (already installed and wired)
   - To: `KACHERI_VERIFY_EMAIL_TO` (comma-separated addresses)
   - Subject: `[Kacheri] Nightly Verification ${status.toUpperCase()}`
   - Body: HTML summary matching existing email template pattern from `notificationDeliverWorker.ts`

4. **Update GitHub Actions workflow** to pass `--notify` flag

**Env vars:** `KACHERI_VERIFY_SLACK_WEBHOOK` (optional), `KACHERI_VERIFY_EMAIL_TO` (optional). Both skip silently if not set.

**Dependencies:** None new. Reuses existing `nodemailer` and HTTP POST patterns.

**API Contract:** No endpoint changes.

---

### Sprint 2: Platform Polish (7 days)

#### Slice 4: Offline/Online UI Indicator + Conflict UX (2 days)

**Problem:** WebSocket reconnect logic exists (`useWorkspaceSocket.ts` — exponential backoff, heartbeat) and IndexedDB persistence exists (`Editor.tsx` — `y-indexeddb`). But users see nothing when they go offline. Silent reconnect is good UX for brief disconnects but bad UX for extended outages.

**What to build:**

1. **Connection status badge** (editor header area):
   - **Connected** — green dot, hidden after 3s (don't clutter when everything's fine)
   - **Reconnecting...** — amber dot + pulse animation + attempt count (`Reconnecting (3/∞)...`)
   - **Offline** — red dot + "Changes saved locally" message (shown after 3 failed reconnect attempts)
   - **Back online** — green dot + "Syncing..." then hidden after sync completes

2. **State source:** Existing `connected` state from `useWorkspaceSocket.ts` + new `reconnectAttempts` counter

3. **Conflict banner:** If Yjs detects conflicting updates on reconnect, show a non-dismissible banner: "Some changes may have conflicted during offline editing. Please review recent changes." (Yjs CRDT handles merge automatically, but users should know it happened.)

4. **ARIA:** `aria-live="polite"` on status badge for screen reader announcements

**CSS:** Add to `ui.css` — small, unobtrusive status bar. No new component library.

**Files to modify:**
- `KACHERI FRONTEND/src/hooks/useWorkspaceSocket.ts` — expose `reconnectAttempts`, `connectionState` enum
- `KACHERI FRONTEND/src/EditorPage.tsx` — render status badge
- `KACHERI FRONTEND/src/ui.css` — status badge styles

**No backend changes. No new dependencies.**

---

#### Slice 5: Mobile-Responsive Editor Layout (2 days)

**Problem:** Desktop-first layout. Basic `@media (max-width: 768px)` breakpoints exist in 14+ CSS files for panel stacking and font sizing, but no proper mobile-first redesign exists. Toolbar overflows on phone, sidebars overlap content, touch targets are too small.

**What to build:**

1. **Breakpoints** (layered on existing):
   - Desktop: >1024px (current layout, no changes)
   - Tablet: 768–1024px
   - Phone: <768px

2. **Editor toolbar (tablet/phone):**
   - Collapsible toolbar groups: primary actions always visible (bold, italic, heading), secondary in overflow menu (alignment, lists, columns)
   - Single-row toolbar with horizontal scroll on phone
   - Touch-friendly targets: minimum 44px hit area

3. **Sidebar panels (tablet):**
   - Panels open as overlay (not pushing content), 50% width max
   - Swipe-to-dismiss gesture

4. **Sidebar panels (phone):**
   - Full-screen bottom sheet (slide up from bottom)
   - Single panel visible at a time

5. **File Manager (tablet/phone):**
   - Tablet: collapsible folder tree (toggle between tree and doc list)
   - Phone: single-panel mode — folder breadcrumbs at top, doc list below. Tap folder to navigate in.

6. **Navigation:**
   - Hamburger menu for main nav on tablet/phone
   - Bottom tab bar on phone for: Documents, Editor, AI Watch

**CSS approach:** Media queries in existing CSS files. No CSS framework. Follows existing patterns.

**No backend changes. No new dependencies.**

---

#### Slice 6: Accessibility Hardening (3 days)

**Problem:** ARIA roles are partially present (`role="dialog"`, `aria-label`, `aria-modal` on some modals). But zero focus trapping exists in any modal. Keyboard navigation has gaps. No systematic accessibility pass has been done.

**What to build:**

1. **Focus management:**
   - Trap focus in all modals (ProofOnboardingModal, PageSetupDialog, AttachmentViewer, VersionDiffModal, EntityDetailModal, TemplateGalleryModal, OriginalSourceModal, WorkspaceSettingsModal, etc.)
   - Return focus to trigger element on modal close
   - `autoFocus` on first interactive element in modal
   - Implementation: shared `useFocusTrap(ref)` hook — no external dependency

2. **ARIA roles audit + fix:**
   - All modals: verify `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (some have this, fill gaps)
   - Tabs (CommentsPanel, SuggestionsPanel, ProofsPanel, KnowledgeExplorer): `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`
   - Toolbar buttons: `aria-label` for icon-only buttons
   - Status badges: `aria-live="polite"` for verification results, connection status
   - Drawers: `role="complementary"`, `aria-label`

3. **Keyboard navigation:**
   - Escape closes any open modal/panel (audit all; some have this, some don't)
   - Tab order follows visual layout
   - Arrow keys navigate within tab groups
   - Enter/Space activates all buttons and toggles
   - Skip-to-content link at top of page

4. **Color contrast:**
   - Audit all text/background combinations against WCAG AA (4.5:1 normal text, 3:1 large)
   - Fix failures (primarily lighter status badges and placeholder text)

5. **Live regions:**
   - `aria-live="assertive"` for error messages
   - `aria-live="polite"` for: verification status changes, AI job completion, notification count updates, connection status

**Deliverable:** Accessibility audit checklist with pass/fail per component, all failures fixed.

**No backend changes. No new dependencies.**

---

### Sprint 3: Testing & Performance Close-Out (5 days)

#### Slice 7: Big-Doc Regression Test Suite (2 days)

**Problem:** `benchmarkDocGenerator.ts` exists as a dev utility but there's no automated regression suite. No way to catch performance regressions in CI.

**What to build:**

1. **Test framework:** Vitest (already installed in backend) + Playwright for browser-based measurement

2. **Benchmark scenarios:**

   | Scenario | Pages | Images | Tables | Target |
   |---|---|---|---|---|
   | Small doc | 10 | 5 | 3 | Baseline |
   | Medium doc | 50 | 20 | 10 | Load <2s |
   | Large doc | 100 | 40 | 20 | Load <3s |
   | Stress doc | 200 | 80 | 40 | Load <5s |

3. **Measurements per scenario:**
   - Initial load time (DOMContentLoaded → editor ready)
   - Scroll FPS (programmatic scroll, measure rAF count — target: >30 FPS)
   - Memory after 5 min idle (no leak — delta <20MB)
   - DOM node count
   - Yjs sync time (create doc → collaborate → verify sync)

4. **CI integration:**
   - Playwright test that opens editor with generated doc
   - `performance.now()` + `performance.memory` (Chrome) measurements
   - JSON report output, threshold-based pass/fail
   - Run on PR (medium doc only) and nightly (all scenarios)

5. **File:** `KACHERI FRONTEND/tests/perf/big-doc.spec.ts`

**Dependencies:** Playwright (dev dependency — **requires approval**).

---

#### Slice 8: Frontend Unit Tests (2 days)

**Problem:** Backend has tests (extraction, compliance, clause, knowledge, negotiation). Frontend has zero unit tests. Key interactive components are untested.

**What to build:**

1. **Test framework:** Vitest + React Testing Library

2. **Frontend test config:** `KACHERI FRONTEND/vitest.config.ts`

3. **Priority components to test:**

   | Component | Key behaviors to verify |
   |---|---|
   | CommentsPanel | Filter rendering, bulk resolve call, tab switching |
   | SuggestionsPanel | Filter chips, status tabs, accept/reject calls |
   | AttachmentPanel | Upload validation (type, size), delete confirmation, storage bar |
   | ReviewersPanel | Assign flow, status update, self-service actions |
   | ProofsPanel | Export list rendering, verification badge states, timeline filtering |
   | DocLinkGraph | Node rendering from mock data, click-to-navigate |
   | EntityGraph | Node coloring by type, filter toggles |
   | SemanticSearchBar | Query submission, result rendering |

4. **Pattern:** Mock API responses with `vi.mock()`, render component, assert DOM state and interaction callbacks.

5. **File structure:**
   ```
   KACHERI FRONTEND/src/__tests__/
     CommentsPanel.test.tsx
     SuggestionsPanel.test.tsx
     AttachmentPanel.test.tsx
     ReviewersPanel.test.tsx
     ProofsPanel.test.tsx
     DocLinkGraph.test.tsx
     EntityGraph.test.tsx
     SemanticSearchBar.test.tsx
   ```

**Dependencies:** `@testing-library/react`, `@testing-library/jest-dom` (dev — **requires approval**).

---

#### Slice 9: Knowledge Engine Performance (1 day)

**Problem:** Two known performance issues tracked in deferred work scope, both with known fixes.

**Fix 1: N+1 query optimization in knowledge engine**
- Current: semantic search calls `getExtraction()` per result for evidence enrichment
- Fix: batch-fetch extractions with `WHERE id IN (...)` in a single query
- Add `getExtractionsByIds(ids[])` to extractions store
- Use in `semanticSearch.ts` enrichment step
- Affected: `knowledge/semanticSearch.ts`, `knowledge/relatedDocs.ts`, `knowledge/relationshipDetector.ts`

**Fix 2: Entity normalizer scaling**
- Current: O(n²) pairwise comparison for entity deduplication within a type, capped at 500
- Fix: blocking strategy — group by first 3 characters of normalized name, only compare within blocks
- Reduces comparisons from n² to ~n²/k where k = number of blocks
- Remove the 500 cap
- Adequate for 500–10,000 entities per workspace

**No schema changes. No API changes. No new dependencies.**

---

### Housekeeping (alongside Sprint 1, Day 1)

These are documentation corrections identified during the audit. No code changes.

1. **Update `deferred-work-scope.md`** — Mark items #1 (email) and #2 (graph viz) as RESOLVED with implementation references
2. **Decide on 4 orphan job types** — `export:pdf`, `export:docx`, `import:file`, `cleanup:orphan` are typed in `jobs/types.ts` but have no workers. Either implement minimally or remove from the type union to avoid dead code.
3. **Add cross-workspace controls deferral note** — Explicitly note in roadmap docs that 2.4 cross-workspace link controls are deferred alongside 2.3

---

## Summary

| Slice | Sprint | Name | Backend | Frontend | New Deps | Est. Days |
|---|---|---|---|---|---|---|
| 1 | 1 | Storage Client Wiring | Yes | No | No | 1 |
| 2 | 1 | Artifacts Canonicalization | Yes | No | No | 2 |
| 3 | 1 | Verification Failure Notifications | Yes | No | No | 1 |
| 4 | 2 | Offline/Online UI Indicator | No | Yes | No | 2 |
| 5 | 2 | Mobile-Responsive Layout | No | Yes | No | 2 |
| 6 | 2 | Accessibility Hardening | No | Yes | No | 3 |
| 7 | 3 | Big-Doc Regression Tests | No | Yes | Yes (playwright) | 2 |
| 8 | 3 | Frontend Unit Tests | No | Yes | Yes (testing-library) | 2 |
| 9 | 3 | Knowledge Engine Performance | Yes | No | No | 1 |
| — | 1 | Housekeeping (docs + orphan types) | Partial | No | No | 0.5 |
| **TOTAL** | | | | | | **16.5 days** |

---

## Dependencies Requiring Approval

| Dependency | Slice | Why | Alternative |
|---|---|---|---|
| `playwright` | 7 | Browser-based perf tests | Manual benchmarking only |
| `@testing-library/react` | 8 | Component unit tests | Vitest with jsdom only |
| `@testing-library/jest-dom` | 8 | DOM assertion matchers | Plain assertions |

Cloud SDK deps (`@aws-sdk/client-s3`, `@google-cloud/storage`) are already handled as optional dynamic imports in the existing storage module. No approval needed — they're already in the codebase pattern.

---

## Execution Order & Rationale

```
Sprint 1 (4 days): Storage Wiring → Canonicalization → Notifications + Housekeeping
  ↳ Infrastructure close-out. Storage wiring unblocks cloud deployment.
    Canonicalization makes verification pipeline fully correct.
    Notifications close the last Phase 5 gap.
    Housekeeping corrects stale documentation.

Sprint 2 (7 days): Offline Indicator → Mobile → Accessibility
  ↳ User-facing polish. Shipped smallest-to-largest
    so visible improvements land early.

Sprint 3 (5 days): Big-Doc Tests → Unit Tests → Perf Fixes
  ↳ Quality close-out. Test infrastructure + known perf fixes.
    Slices 7+8 can run in parallel (different test domains).
```

---

## What This Closes Out

| Roadmap Section | Before | After |
|---|---|---|
| 2.1 Editor & Layout Extras | 100% | 100% (already done) |
| 2.2 Collaboration Depth & History | 100% | 100% (already done) |
| 2.3 Advanced RBAC & Enterprise IT | **Deferred** | **Deferred** |
| 2.4 Knowledge Graph & Wiki (excl. cross-workspace) | 100% | 100% (already done) |
| 2.4 Cross-workspace link controls | **Deferred with 2.3** | **Deferred with 2.3** |
| 2.5 Ops, Verification & Infra | ~90% | 100% |
| 2.6 Proof-Driven Moat & AI Safety | 100% | 100% (already done) |
| 2.7 Platform Polish | ~30% | 100% |
| 2.8 Document Attachments | 100% | 100% (already done) |
| Phase 5 gaps (P0.2 notifications) | 95% | 100% |
| Deferred perf items (#6, #7) | Tracked | Resolved |
| Deferred frontend tests (#8) | Tracked | Resolved |

After these 9 slices, the only remaining roadmap items are:
- **2.3** — Advanced RBAC & Enterprise IT (held for enterprise onboarding)
- **2.4 cross-workspace** — Deferred with 2.3 (requires RBAC model)
- **Deferred #3** — Vector embeddings (FTS5+AI sufficient)
- **Deferred #4** — Cross-workspace search (requires 2.3)
- **Deferred #5** — Real-time entity detection (nice-to-have, not in roadmap)

Everything else is closed. Then we build Slides.
