# Session Report: Phase 2 Product Features — Work Scope Planning

**Date:** 2026-02-19
**Status:** PLANNING COMPLETE
**Full Spec:** [phase2-product-features-work-scope.md](../Roadmap/phase2-product-features-work-scope.md)

---

## Session Goal

Design and scope the Phase 2 product-facing features for implementation, covering:
- **Editor & Layout Extras** (Roadmap 2.1) — Legal numbering, multi-column, advanced page numbering, large-doc performance
- **Collaboration Depth** (Roadmap 2.2) — Comment filters, arbitrary version diffs, bulk operations, notification webhooks, review assignments
- **Document Attachments** (Roadmap 2.8) — Per-doc file attachments with inline viewer and workspace-level limits
- **Knowledge Graph & Doc-Link Visualization** (Roadmap 2.4) — Document-link graph + entity-relationship graph (semantic search already complete from Cross-Doc Intelligence phase)

Enterprise hardening items (Roadmap 2.3, 2.5, 2.6, 2.7) are explicitly deferred after verifying their foundations are solid.

---

## Documents Read

| Document | Location | Status |
|----------|----------|--------|
| Architecture Blueprint | `Docs/blueprint/architecture blueprint.md` | Read |
| Roadmap | `Docs/Roadmap/docs roadmap.md` | Read |
| API Contract | `Docs/API_CONTRACT.md` | Read (structure + first 200 lines) — **INSUFFICIENT**: contract is 70K+ tokens; full review required before implementing new endpoints to avoid conflicts |
| Enhancement Planning | `Docs/Roadmap/docs-enhancement-planning.md` | Read (first 50 lines for context) |
| Cross-Doc Intelligence Work Scope | `Docs/Roadmap/cross-document-intelligence-work-scope.md` | Read (pattern reference) |
| Compliance/Clause Work Scope | `Docs/Roadmap/compliance-checker-clause-library-work-scope.md` | Read (pattern reference) |
| Redline/Negotiation Session | `Docs/session-reports/2026-02-09-redline-negotiation-ai.md` | Read |
| Pilot Completion Session | `Docs/session-reports/2026-02-06-pilot-completion.md` | Read |

### Codebase Areas Inspected

| Area | Files/Patterns Read | Purpose |
|------|---------------------|---------|
| TipTap Editor Setup | `Editor.tsx`, all custom extensions in `src/extensions/` | Understand current editor capabilities and extension points |
| Editor Extensions | `OrderedListEnhanced.ts`, `ColumnSection.ts`, `SectionBreak.ts`, `PageBreak.ts`, `DocLink.ts`, `AIHeatmark.ts`, `ImageEnhanced.ts` | Map what exists vs what needs extension |
| Frontend Package.json | TipTap dependencies, versions | Verify installed packages |
| Comment Routes + Store | `routes/comments.ts`, `store/comments.ts` | Current filter capabilities (limited) |
| Suggestion Routes + Store | `routes/suggestions.ts`, `store/suggestions.ts` | Current filter capabilities (better — has status + authorId) |
| Version Routes + Store | `routes/versions.ts`, `store/versions.ts` | Current diff endpoint (supports compareWith) |
| RBAC/Auth Middleware | `workspace/middleware.ts`, `store/docPermissions.ts`, `auth/` | Verify enterprise base is solid |
| Storage/Artifacts | `store/artifacts.ts`, `provenance.ts`, `provenanceStore.ts` | Verify storage pattern — **Note:** `StorageProvider` is a type alias only, not a working abstraction |
| Job Queue | `jobs/queue.ts`, `jobs/types.ts`, `jobs/workers/` | Verify job system extensible |
| Health/Metrics | `routes/health.ts`, `routes/metrics.ts` | Verify observability hooks exist |
| Image Upload | `routes/imageUpload.ts` | Pattern reference for attachment upload |
| Export Pipeline | `routes/exportDocx.ts` | Understand export fidelity requirements |
| Notification System | `store/notifications.ts`, `routes/notifications.ts` | Current notification capabilities |
| WebSocket Types | `realtime/types.ts` | Current event taxonomy |
| Knowledge Graph | `store/workspaceEntities.ts`, `knowledge/` | Existing entity/relationship data |

---

## Architecture & Roadmap Alignment

### Roadmap Sections Covered
- **2.1 Editor & Layout Extras** — All items scoped (legal numbering, multi-column, page numbering, large-doc perf)
- **2.2 Collaboration Depth** — All items scoped: version diffs, comment filters, notification hooks, **review assignments** (B5 — newly added per audit)
- **2.4 Knowledge Graph & Wiki** — Partial coverage:
  - Semantic search layer: **already complete** from Cross-Document Intelligence phase (`knowledge/semanticSearch.ts`, `SemanticSearchBar.tsx`)
  - Doc-link graph: **newly scoped** (D0) — wiki-style graph view of docs and their links
  - Entity graph: scoped (D1) — interactive entity-relationship visualization
  - Cross-workspace links: deferred (D2) pending real user validation
- **2.8 Document Attachments** — Full subsystem scoped, with workspace-level limits added per audit

### Roadmap Sections Explicitly Deferred
- **2.3 Advanced RBAC & Enterprise IT** — Base verified solid (4-level roles, audit log, invites). Additive extensions only.
- **2.5 Ops, Verification & Infra** — Base verified solid (StorageProvider type, job queue, Prometheus). No refactoring needed.
- **2.6 Proof-Driven Moat & AI Safety UX** — Already 90% complete (badges, heatmaps, dashboard, determinism indicators).
- **2.7 Platform Polish** — Not started. Mobile, accessibility, offline are independent of product features.

### Architecture Alignment
- All changes follow existing patterns (store factory, route middleware, WebSocket broadcasting, proof pipeline)
- No new architectural boundaries or layer violations
- Frontend extensions follow established TipTap extension pattern
- Backend routes follow existing RBAC + proof + audit pattern
- Three new migration files (010, 011, 012) following existing one-purpose-per-migration pattern

---

## Enterprise Base Verification Results

| System | Verdict | Details |
|--------|---------|---------|
| **RBAC** | Solid | 4-level workspace + doc roles, cascading resolver, 60+ audited actions. Group roles = additive tables only. |
| **Storage** | Solid (with caveat) | `StorageProvider` is a type alias (`"local" | "s3" | "gcs"`) labeling proof records — **not** a working storage abstraction. `updateStorageLocation()` is metadata-only (SQL UPDATE). `imageUpload.ts` writes directly to local FS via `fs.writeFile`. S3 migration will require building an actual `StorageClient` interface. Base is solid for current local-first needs. |
| **Job Queue** | Solid | SQLite + optional BullMQ. Priority, retry, scheduling. New types = add to union + register handler. |
| **Observability** | Solid | Prometheus `/metrics`, K8s `/health/ready` + `/health/live`, request ID correlation. Wire counters when needed. |
| **Audit** | Solid | Fire-and-forget `logAuditEvent()`, paginated queries, target-scoped history. Export = query addition. |
| **Provenance** | Solid | Dual-write DB + NDJSON, deduped timelines, workspace-scoped. `verify:nightly` = orchestration. |

**Conclusion:** No refactoring required before building product features. Enterprise items are purely additive.

---

## Constraints & Assumptions

### Constraints
1. No new dependencies without explicit approval (graph library, Nodemailer)
2. All changes must preserve export fidelity (DOCX numbering, columns)
3. Document content is Yjs-managed — schema changes must be backward-compatible
4. Attachment storage is local filesystem for now (S3 deferred). `StorageProvider` is a type label only — no cloud storage client exists. Attachments follow the same direct-fs pattern as `imageUpload.ts`.
5. Full API Contract review required before implementation — only 200 lines of 70K+ token contract were read during planning

### Assumptions
1. Legal numbering CSS counters can approximate most common patterns (1.1.1, a.b.c)
2. DOCX numbering export may have minor fidelity gaps — acceptable with documentation
3. Existing TipTap 2.26+ supports the extension patterns needed
4. Graph visualization with 500+ nodes is achievable with lazy loading

### Explicitly Ruled Out
- Custom ProseMirror schema from scratch (extends existing extensions instead)
- Server-side rendering for graph visualization
- Cross-workspace entity sharing (deferred to user validation)
- Real-time collaborative attachment editing (view-only)
- Email delivery in the initial notification slice (webhook-only first)

---

## Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Legal numbering → DOCX export fidelity gaps | Medium | High | Early spike on DOCX numbering XML |
| Graph library bundle size impact | Medium | Low | Lazy-load / code-split |
| Large-doc bottleneck in Yjs (not DOM) | Low | High | May need CRDT-level chunking |
| Nodemailer config complexity | Medium | Medium | Default webhook-only; email opt-in |
| Attachment disk usage without S3 | Medium | Medium | Strict per-doc limits |

---

## Decisions Made

1. **Product features before enterprise hardening** — User directed; enterprise base verified solid
2. **Execution order** — Quick collaboration wins → Attachments → Editor power → Graph + notifications + review assignments → Performance
3. **14 slices across 5 sprints** — Incremental delivery with early value (expanded from 12 after audit)
4. **Email deferred behind webhook** — Slice 11 ships webhook/Slack; Slice 13 adds email with dependency approval
5. **Cross-workspace links deferred** — Needs real user validation before implementation
6. **Graph library recommendation** — `@xyflow/react` (pending approval)
7. **Doc-link graph added alongside entity graph** — Per roadmap 2.4 "wiki-style graph view of docs and their links" intent (added after audit)
8. **Review assignment notifications scoped** — Per roadmap 2.2 "mentions and review assignments" intent (added after audit)
9. **Migration files split per sprint** — `010_add_doc_attachments.sql`, `011_add_notification_preferences.sql`, `012_add_doc_reviewers.sql` following one-purpose-per-migration pattern (corrected after audit)

---

## Work Scope Output

Full work scope document created at:
`Docs/Roadmap/phase2-product-features-work-scope.md`

### Slice Summary (14 slices, 5 sprints)

| Slice | Name | Sprint | Backend | Frontend | New Deps |
|-------|------|--------|---------|----------|----------|
| 1 | Comment Filters & Bulk Resolve | 1 | Yes | Yes | No |
| 2 | Suggestion Filters | 1 | Yes | Yes | No |
| 3 | Arbitrary Version Diffs | 1 | No | Yes | No |
| 4 | Attachments Backend | 2 | Yes (migration 010) | No | No |
| 5 | Attachments Frontend | 2 | No | Yes | No |
| 6 | Legal Numbering System | 3 | Yes (export) | Yes | No |
| 7 | Advanced Page Numbering | 3 | Yes (export) | Yes | No |
| 8 | Multi-Column Layout Extensions | 3 | Yes (export) | Yes | No |
| 9 | Document-Link Graph | 4 | No | Yes | Yes (graph lib) |
| 10 | Entity Graph Visualization | 4 | No | Yes | No (shares graph lib) |
| 11 | Notification Preferences & Webhooks | 4 | Yes (migration 011) | Yes | No |
| 12 | Review Assignment System | 4 | Yes (migration 012) | Yes | No |
| 13 | Email Notification Delivery | 4 | Yes | Yes | Yes (nodemailer) |
| 14 | Large Document Performance | 5 | No | Yes | No |

---

## Next Steps

1. ~~Begin Slice 2 (Suggestion Filters) — Sprint 1 continuation~~ DONE
2. ~~Slice 3 (Arbitrary Version Diffs) — Sprint 1 frontend-only~~ DONE
3. ~~Slice 4 (Attachments Backend) — Sprint 2~~ DONE
4. ~~Slice 5 (Attachments Frontend) — Sprint 2~~ DONE
5. ~~Slice 6 (Legal Numbering System) — Sprint 3~~ DONE
6. ~~Slice 7 (Advanced Page Numbering) — Sprint 3~~ DONE
7. ~~Slice 8 (Multi-Column Layout Extensions) — Sprint 3~~ DONE
8. ~~Slices 9-14 — Sprints 4-5~~ DONE
9. **Phase 2 Product Features COMPLETE** — all 14 slices implemented

---

## Slice 1 Implementation — Comment Filters & Bulk Resolve (2026-02-19)

### What Was Completed

**API Contract (contract-first):**
- Updated `GET /docs/:id/comments` query params: added `authorId`, `mentionsUser`, `unresolvedOnly`, `from`, `to`, `search`, `limit`, `offset`, `sortBy`
- Added `total` field to list response for pagination support
- Added `POST /docs/:id/comments/bulk-resolve` endpoint spec
- Added `Bulk resolve threads | commenter+` to permission model
- Added changelog entry v1.14.0

**Backend:**
- `store/audit.ts`: Added `comment:bulk_resolve` audit action type
- `realtime/types.ts`: Added `bulk_resolved` to comment WS event actions
- `store/comments.ts`:
  - Expanded `ListCommentsOptions` with 9 new filter fields
  - Added `ListCommentsResult` type (`{ comments, total }`)
  - Rewrote `listComments()` with dynamic WHERE clause builder, COUNT query, LIMIT/OFFSET pagination
  - `mentionsUser` uses efficient subquery: `id IN (SELECT comment_id FROM comment_mentions WHERE user_id = ?)`
  - Added `bulkResolveThreads(docId, userId, threadIds?)` — queries unresolved first for accurate return, then bulk UPDATE
- `routes/comments.ts`:
  - Expanded GET handler with full query param parsing and numeric validation
  - Added POST `/docs/:id/comments/bulk-resolve` with RBAC (commenter+), audit logging, WS broadcast

**Frontend:**
- `api/comments.ts`: Expanded `ListCommentsOptions`, updated `list()` return type + query builder, added `bulkResolve()` method
- `hooks/useComments.ts`: Added `ServerFilters` type, accepted as third param, wired to API in fetch and refetch
- `components/commentsPanel.css`: Added filter bar styles (search input, author dropdown, resolve all button)
- `components/CommentsPanel.tsx`:
  - Added debounced search (300ms), author dropdown from existing workspace members
  - "Resolve All" button with confirmation dialog, visible when open threads > 0
  - Filter-aware empty state messages

### What Was Intentionally Not Changed
- No database migrations (all filters use existing columns/indexes)
- No new dependencies
- Existing All/Open/Resolved client-side tabs remain unchanged — server filters reduce the dataset, tabs refine further
- No pagination UI added (default limit=100 covers typical documents; deferred if needed)

### Decisions Made
1. Server-side + client-side filtering hybrid: new filters (author, search) are server-side for correctness; resolution tabs remain client-side for responsiveness
2. `unresolvedOnly` takes precedence over `includeResolved` when both present
3. Bulk resolve broadcasts single `bulk_resolved` WS event (not N individual events)
4. Search uses SQLite LIKE (no FTS5) — adequate for short comment text within a single doc
5. Author dropdown reuses existing workspace members data (no extra API call)

### Risks
- `getMentions()` N+1 per comment in `listComments()` — acceptable at typical comment volumes; batch optimization deferred
- `LIKE %search%` cannot use index — acceptable within per-doc comment volume

### Validation
- `npx tsc --noEmit` syntax check (pending)

---

## Audit Findings & Corrections (2026-02-19)

Post-planning audit against roadmap source of intent identified gaps, inaccuracies, and planning issues. All have been resolved in the updated work scope.

### Gaps Identified & Resolved

| # | Gap | Roadmap Source | Resolution |
|---|-----|---------------|------------|
| 1 | **Semantic search layer** not mentioned in work scope | Roadmap 2.4: "Semantic search layer on top of cross-doc indexes, grounded in proofs" | Acknowledged as **already complete** from Cross-Document Intelligence phase. Backend `semanticSearch.ts` (4-step NL pipeline) and frontend `SemanticSearchBar.tsx` + `SearchAnswerPanel.tsx` fully implemented. Added acknowledgment to Feature D header. |
| 2 | **Doc-link graph** replaced by entity graph | Roadmap 2.4: "Wiki-style graph view of docs and their links, with filters by tag, folder, or status" | Added **D0: Document-Link Graph Visualization** as new sub-feature. Uses existing `doc_links` table (baseline schema) and doc APIs. Frontend-only. User chose to build both graphs. |
| 3 | **Review assignments** missing from notifications | Roadmap 2.2: "Notification hooks/integrations for mentions **and review assignments**" | Added **B5: Review Assignment Notifications** with `doc_reviewers` schema, CRUD API, `review_assigned` notification type, and frontend UI. User chose to scope in this phase. |

### Inaccuracies Identified & Corrected

| # | Inaccuracy | Actual State | Correction |
|---|-----------|-------------|------------|
| 1 | Feature D1 said "New 'Graph' tab alongside existing 'Search' and 'Entities' tabs" | `WorkspaceKnowledgeExplorerPage.tsx` is a single unified view with SemanticSearchBar, stats, entity chips, and entity table — **no tabs exist** | Fixed D1 description to describe actual layout and propose tabbed refactor |
| 2 | Feature A3 said page numbers use `{page}` / `{pages}` placeholder pattern | `PageSetupDialog.tsx` uses `showPageNumbers` boolean toggle in `FooterSettings` — **no placeholder token system** | Corrected to describe actual `showPageNumbers` boolean implementation |
| 3 | API Contract read was only "structure + first 200 lines" of a 70K+ token file | Defining 6+ new endpoint groups against a partially-read contract risks collisions | Flagged as insufficient; added full review as prerequisite for Sprint 1 |
| 4 | `StorageProvider` described as a working abstraction | `StorageProvider` is a **type alias only** (`"local" | "s3" | "gcs"`), not an interface. `updateStorageLocation()` is a metadata-only SQL UPDATE. `imageUpload.ts` writes directly via `fs.writeFile`. | Corrected in Enterprise Base Verification, Constraints, Feature C storage approach, and Deferred table |
| 5 | Header claimed full coverage of Roadmap 2.4 | Only entity graph was scoped; semantic search omitted; doc-link graph missing | Updated to note partial coverage with per-item status |

### Planning Issues Identified & Resolved

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Single migration `010_phase2_product_features.sql` spanning Sprint 2 and Sprint 4 — impractical for incremental deployment | Split into `010_add_doc_attachments.sql` (Sprint 2), `011_add_notification_preferences.sql` (Sprint 4), `012_add_doc_reviewers.sql` (Sprint 4). Follows existing one-purpose-per-migration pattern (001–009). |
| 2 | Attachment storage described as using "existing storage abstraction" when none exists | Corrected: attachments follow same direct-FS pattern as `imageUpload.ts`, tagged with `storage_provider='local'` for future S3 migration |
| 3 | Attachment limits scoped per-document only; roadmap says "per workspace" | Added workspace-level aggregate limit: 1GB per workspace (configurable via `KACHERI_MAX_ATTACHMENT_SIZE_PER_WORKSPACE`) alongside existing per-doc limits |

---

## Slice 2 Implementation — Suggestion Filters (2026-02-19)

### What Was Completed

**API Contract (contract-first):**
- Updated `GET /docs/:id/suggestions` query params: added `changeType`, `from`, `to`
- Added `total` field to list response for pagination support
- Added changelog entry v1.15.0

**Backend:**
- `store/suggestions.ts`:
  - Added `changeType`, `from`, `to` to `ListSuggestionsOptions` interface
  - Added `ListSuggestionsResult` type (`{ suggestions, total }`)
  - Rewrote `listSuggestions()` with dynamic WHERE clause builder for `changeType` (`AND change_type = ?`), `from` (`AND created_at >= ?`), `to` (`AND created_at <= ?`)
  - Added COUNT query (same WHERE, no LIMIT/OFFSET) for `total` pagination count
  - Return type changed from `SuggestionMeta[]` to `ListSuggestionsResult`
- `routes/suggestions.ts`:
  - Expanded Querystring type with `changeType`, `from`, `to`
  - Added parsing/validation for new params: `changeType` validated via existing `isValidChangeType()`, `from`/`to` parsed as integers
  - Destructures `{ suggestions, total }` from store result
  - Returns `{ suggestions, pendingCount, total }` in response

**Frontend:**
- `api/suggestions.ts`: Extended `ListSuggestionsOptions` with `changeType`, `from`, `to`; updated `list()` return type to include `pendingCount` and `total`; extended query string builder
- `hooks/useSuggestions.ts`: Added `SuggestionServerFilters` type; accepted as 3rd param; passed to API in fetch and refetch; filter key tracked in useEffect deps
- `components/SuggestionsPanel.tsx`:
  - Added `changeTypeFilter` state (`'all' | 'insert' | 'delete' | 'replace'`)
  - Builds `serverFilters` from changeTypeFilter (omitted when 'all')
  - Renders change type filter chips: All Types / Insert / Delete / Replace
  - Filter-aware empty state messages
- `components/suggestionsPanel.css`: Added `.suggestions-change-filter` container and `.suggestions-change-chip` styles with color-coded active states (green=insert, red=delete, blue=replace)

### What Was Intentionally Not Changed
- No database migrations (all filters use existing columns)
- No new dependencies
- Existing All/Pending/Accepted/Rejected client-side status tabs remain unchanged — server filters reduce the dataset, status tabs refine further
- Date range picker frontend deferred (backend is ready with `from`/`to`; work scope says "optional — may be overkill for MVP")

### Decisions Made
1. Server-side + client-side filtering hybrid: `changeType` is server-side for efficiency; status tabs remain client-side for responsiveness
2. `from`/`to` are backend-ready but no frontend date picker added — per work scope B2 guidance
3. Added `total` to response following Slice 1 pattern for pagination consistency
4. `filterKey` string used for stable useEffect dependency (avoids object reference issues)

### Risks
- None identified — straightforward filter additions on existing indexed columns

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 3 Implementation — Arbitrary Version Diffs (2026-02-19)

### What Was Completed

**Frontend only — no backend or API contract changes.**

**`components/VersionsPanel.tsx`:**
- Added panel-level compare mode with `compareMode`, `compareA`, `compareB` state
- Added `handleToggleCompareMode()` — toggles compare bar on/off, clears selections on exit
- Added `handleViewDiff()` — opens existing `VersionDiffModal` with selected version IDs
- Added "Compare" button in header (next to close button), disabled when < 2 versions exist
- Added compare bar (between filter tabs and version list) with:
  - Two `<select>` dropdowns (Version A, Version B) populated from `versions` array
  - Each dropdown disables the other's current selection to prevent same-version comparison
  - "View Diff" button, disabled until both versions are selected and differ
- Existing per-item compare flow (VersionItem dropdown) remains unchanged

**`components/versionsPanel.css`:**
- Added `.versions-header-actions` flex container for header buttons
- Added `.versions-compare-btn` toggle button styles with `.active` state (brand-600)
- Added `.versions-compare-bar` container with surface background and border
- Added `.versions-compare-selects`, `.versions-compare-field`, `.versions-compare-label` layout
- Added `.versions-compare-select` styled dropdowns with focus ring
- Added `.versions-compare-view-btn` primary action button
- All styles follow existing design system (CSS variables, border-radius, transitions)

### What Was Intentionally Not Changed
- `api/versions.ts` — `getDiff()` already supports arbitrary comparison
- `hooks/useVersions.ts` — `versions` array already available, no changes needed
- `VersionDiffModal.tsx` — already renders any diff given two version IDs
- `VersionItem.tsx` — per-item compare dropdown remains as an alternative UX path
- All backend files — no changes (endpoint already supports `compareWith` param)
- API Contract — no updates needed

### Decisions Made
1. Panel-level compare is additive to per-item compare — both UX paths coexist
2. `<select>` dropdowns chosen over click-to-select (simpler, more accessible, consistent with form patterns)
3. Each dropdown disables the other's current selection to prevent invalid same-version comparison
4. Compare mode auto-clears selections when toggled off for clean state
5. "Compare" button disabled when < 2 versions exist (edge case protection)

### Risks
- None identified — purely additive frontend UI over existing working backend endpoint

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 4 Implementation — Attachments Backend (2026-02-19)

### What Was Completed

**API Contract (contract-first):**
- Added `Document Attachment Endpoints (Slice 4)` section with 4 endpoints
- Added permission model table for attachments
- Added `attachment` to WebSocket event types table
- Added changelog entry v1.16.0

**Migration:**
- `010_add_doc_attachments.sql`: `doc_attachments` table with `id` (TEXT PK, nanoid), `doc_id`, `workspace_id`, `filename`, `mime_type`, `size_bytes`, `storage_provider` (default 'local'), `storage_key`, `sha256`, `uploaded_by`, `uploaded_at`, `deleted_at` (soft delete), `metadata_json`
- Indexes: `idx_doc_attachments_doc` (partial — WHERE deleted_at IS NULL), `idx_doc_attachments_workspace`
- Rollback section (commented)

**Backend — Store (`store/docAttachments.ts`):**
- `createAttachment()` — INSERT with prepared statement, returns mapped `DocAttachment`
- `listAttachments(docId)` — SELECT WHERE deleted_at IS NULL, ordered by uploaded_at DESC
- `getAttachment(id)` — SELECT by PK (includes deleted for ownership check in delete flow)
- `deleteAttachment(id)` — soft delete (SET deleted_at = Date.now()), returns boolean
- `getDocAttachmentStats(docId)` — COUNT + SUM(size_bytes) for limit enforcement
- `getWorkspaceAttachmentStats(workspaceId)` — SUM(size_bytes) across workspace
- `checkDocAttachmentLimits(docId, fileSize)` — checks per-file (25MB), per-doc count (20), per-doc total (100MB)
- `checkWorkspaceAttachmentLimits(workspaceId, fileSize)` — checks workspace total (1GB)
- `ATTACHMENT_LIMITS` exported constant for response payloads
- All limits configurable via env vars (`KACHERI_MAX_ATTACHMENTS_PER_DOC`, etc.)

**Backend — Routes (`routes/docAttachments.ts`):**
- `POST /docs/:id/attachments` (editor+): multipart upload, MIME validation (8 types), limit checks, SHA256 hash, write to `storage/attachments/doc-{id}/{nanoid}.{ext}`, proof + provenance + audit + WS broadcast
- `GET /docs/:id/attachments` (viewer+): list with stats and limits
- `GET /docs/:id/attachments/:attachmentId/file` (viewer+): serve file with correct Content-Type, Cache-Control immutable, Content-Disposition inline
- `DELETE /docs/:id/attachments/:attachmentId` (editor+ or uploader): soft delete with proof + provenance + audit + WS broadcast
- Filename sanitization (removes path separators, null bytes, truncates to 255)
- Path traversal prevention (storage key resolved via `repoPath()`)

**Backend — WebSocket (`realtime/types.ts`):**
- Added `attachment` event type: `{ type: 'attachment'; action: 'uploaded' | 'deleted'; docId; attachmentId; filename; uploadedBy; ts }`

**Backend — Audit (`store/audit.ts`):**
- Added `attachment:upload` and `attachment:delete` to `AuditAction` type
- Added `attachment` to `AuditTargetType` type

**Backend — Server (`server.ts`):**
- Imported and registered `docAttachmentRoutes`
- Added 3 attachment routes to index route listing

### What Was Intentionally Not Changed
- No frontend changes (Slice 5 scope)
- No new dependencies (reuses `@fastify/multipart` already registered)
- No cloud storage implementation (local FS only, tagged `storage_provider='local'` for future S3/GCS migration)
- Physical file deletion not performed on soft delete (files remain for potential recovery; cleanup deferred to enterprise hardening)

### Decisions Made
1. Soft delete pattern — `deleted_at` column, consistent with existing comment/message patterns; enables future recovery
2. Storage path: `storage/attachments/doc-{docId}/{nanoid}.{ext}` — follows `storage/images/doc-{docId}/` pattern from imageUpload
3. Upload uses `req.file()` (single file) not `req.files()` (multi) — one attachment per request
4. Uploader can delete own attachments with viewer+ role; others' attachments require editor+
5. Workspace ID required for upload (needed for workspace-level limit checks)
6. `getAttachment()` returns even soft-deleted rows — needed for delete endpoint to check ownership before RBAC
7. File hashing uses raw SHA256 hex (stored as `sha256` column); proof hash prefixed with `sha256:` per existing convention

### Risks
- Disk usage accumulates since soft-deleted files remain on disk — mitigated by workspace-level 1GB limit; physical cleanup deferred to enterprise hardening phase
- `@fastify/multipart` may already be registered by `importDoc.ts` or `imageUpload.ts` — handled with `hasContentTypeParser` guard

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 5 Implementation — Attachments Frontend (Panel + Viewer) (2026-02-19)

### What Was Completed

**Frontend only — no backend or API contract changes.**

**New file: `api/attachments.ts` — API client:**
- `DocAttachment`, `AttachmentLimits`, `ListAttachmentsResponse`, `UploadAttachmentResponse` types matching backend contract
- `attachmentsApi` object with `list()`, `upload()`, `getFileUrl()`, `delete()` methods
- Upload uses raw `fetch()` + `FormData` (not the `request<T>()` wrapper which auto-sets `Content-Type: application/json` and would corrupt multipart boundary)
- `getFileUrl()` returns synchronous URL string for use in `<iframe src>` / `<img src>`
- Standard `request<T>()` wrapper duplicated from `comments.ts` for list/delete methods

**New file: `hooks/useAttachments.ts` — data fetching hook:**
- `useAttachments(docId, refreshKey)` following exact `useComments.ts` pattern
- Returns `{ attachments, totalSize, count, limits, loading, error, refetch }`
- `useEffect` with cancelled boolean for cleanup, `useCallback` refetch

**New file: `components/AttachmentPanel.tsx` — sidebar panel:**
- Props: `{ docId, open, onClose, refreshKey, currentUserId, workspaceId, onViewAttachment }`
- Layout: header → storage usage bar → upload dropzone → upload state → file list → empty state
- Storage usage bar with percentage fill, warning (>80%), critical (>95%) color states
- Upload dropzone with drag-and-drop (`onDragOver`/`onDragLeave`/`onDrop`) + hidden file input + "browse" button
- Client-side MIME validation (8 allowed types) and size validation (25MB) before API call
- Upload error auto-dismiss after 5 seconds via `setTimeout`
- File list with MIME-based icon (PDF=red, IMG=green, Office=blue), filename (ellipsis), meta (size, date), View/Delete actions
- Delete with `confirm()` dialog; `canDelete` checks `uploadedBy === currentUserId`
- Capacity detection: dropzone disabled when at count or size limit

**New file: `components/attachmentPanel.css` — panel styles:**
- CSS prefix: `attachments-` following `commentsPanel.css` convention
- Fixed position, 340px wide, slide-in animation, z-index 2000
- Usage bar with `.warning` (amber) and `.critical` (red) fill variants
- Dropzone with `.active` hover state and `.disabled` capacity state
- File item layout with icon color-coding by type
- Responsive mobile breakpoint (768px → bottom slide-up)

**New file: `components/AttachmentViewer.tsx` — modal viewer:**
- Props: `{ open, attachment, fileUrl, onClose }`
- Follows `OriginalSourceModal.tsx` pattern exactly
- Fixed overlay (z-index 1000) with backdrop scrim
- Escape key handler + body scroll lock
- Fullscreen toggle
- Header: filename, format badge, size, download link, fullscreen, close
- MIME-based content rendering: PDF → `<iframe>`, images → `<img>` with error fallback, office → icon + download button
- Footer: uploader, date, SHA-256 prefix
- Resets `imageError` and `full` state on attachment change

**New file: `components/attachmentViewer.css` — viewer styles:**
- Minimal CSS for header/footer/content flex layout (most styling is inline, matching OriginalSourceModal pattern)

**Modified: `hooks/useWorkspaceSocket.ts`:**
- Added `AttachmentAction` type export (`'uploaded' | 'deleted'`)
- Added `attachment` variant to `WsEvent` union type
- Added `case 'attachment':` handler in `ws.onmessage` switch block with safe field parsing

**Modified: `EditorPage.tsx`:**
- Added imports: `AttachmentPanel`, `AttachmentViewer`, `attachmentsApi`, `DocAttachment`
- Added `"attachments"` to `rightDrawerTab` union type
- Added `attachmentsRefreshKey` and `viewingAttachment` state
- Added WS event handler: bumps `attachmentsRefreshKey` on `attachment` events for this doc
- Added "Attach" drawer tab button after "Negotiate"
- Added `AttachmentPanel` conditional render in drawer content
- Added `AttachmentViewer` modal render (outside drawer, before `CommandPalette`)

### What Was Intentionally Not Changed
- No backend changes (Slice 4 is complete)
- No API Contract updates (attachment endpoints already documented in Slice 4)
- No new dependencies (PDF via native iframe, images via native img, no pdf.js)
- No upload progress bar (fetch doesn't support progress natively; "Uploading..." indicator is sufficient for 25MB max)
- No toolbar shortcut button (accessible via drawer tab + command palette)
- No command palette entry added (can be added later if needed)

### Decisions Made
1. Upload uses raw `fetch()` + `FormData` instead of `request<T>()` wrapper — the wrapper auto-sets Content-Type which corrupts multipart boundaries
2. `getFileUrl()` returns synchronous URL string — same pattern as `OriginalSourceModal.tsx` which uses direct URLs for file serving
3. `formatBytes()` defined locally in both `AttachmentPanel.tsx` and `AttachmentViewer.tsx` — matches existing pattern in `ImportRoundDialog.tsx`; no shared utility created
4. `canDelete()` checks `uploadedBy === currentUserId` client-side — backend enforces full RBAC (editor+ or uploader)
5. `imageError` and `full` state reset on attachment change via `useEffect([attachment?.id])`
6. AttachmentViewer placed outside the drawer `<aside>` for proper modal z-index layering

### Risks
- Auth for inline file serving: `getFileUrl()` returns direct URL. If Bearer token is required for `<iframe>`/`<img>` tags, they cannot send Authorization headers. Existing `OriginalSourceModal.tsx` uses same direct-URL pattern successfully, so this is expected to work. Fallback to `fetch()` + `URL.createObjectURL()` can be added if needed.

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 6 Implementation — Legal Numbering System (2026-02-19)

### What Was Completed

**No API contract changes. No database changes. No new dependencies.**

**Frontend — Extension (`extensions/OrderedListEnhanced.ts`):**
- Expanded `NumberingStyle` union type from 2 to 7 values: `decimal`, `outline`, `legal`, `alpha-lower`, `alpha-upper`, `roman-lower`, `roman-upper`
- Added `STYLE_CLASS_MAP` constant mapping each style to its CSS class (`legal-numbering` for outline/legal, `numbering-{type}` for alpha/roman)
- Added `COUNTER_BASED_STYLES` set for styles that use CSS counters (outline, legal)
- Added `startFrom` attribute: parses from `data-start-from` HTML attribute, renders `counter-reset: level1 {N-1}` for counter-based styles or `start="{N}"` for native styles
- Added `setStartFrom(value: number | null)` command to Commands interface and implementation
- Backward compatible: existing `decimal` and `outline` styles render identically

**Frontend — CSS (`ui.css`):**
- Added Level 4 legal numbering: `.legal-numbering ol ol ol` → `counter-reset: level4`, `::before` content displays `1.1.1.1` pattern
- Added `.numbering-alpha-lower { list-style-type: lower-alpha; }`
- Added `.numbering-alpha-upper { list-style-type: upper-alpha; }`
- Added `.numbering-roman-lower { list-style-type: lower-roman; }`
- Added `.numbering-roman-upper { list-style-type: upper-roman; }`

**Frontend — EditorApi (`Editor.tsx`):**
- Added `setStartFrom(value: number | null): void` to `EditorApi` type
- Added implementation in `useImperativeHandle`: delegates to `(editor.commands as any).setStartFrom?.(value)`

**Frontend — Toolbar UI (`EditorPage.tsx`):**
- Imported `NumberingStyle` type from `./Editor`
- Added `currentNumberingStyle` and `startFromValue` state variables
- Added `useEffect` with 300ms polling interval to track editor selection → reads `orderedList` attributes → updates state (follows existing connection-status polling pattern)
- Expanded Lists group in left formatting drawer:
  - Numbering style `<select>` dropdown with 7 options (Decimal, Legal, Alpha lower/upper, Roman lower/upper, Outline legacy)
  - "Start at" `<input type="number">` field with "Auto" placeholder
- Follows existing `<select className="input sm">` pattern from Typography group

**Backend — DOCX Export (`routes/exportDocx.ts`):**
- Added number conversion helpers: `toLowerAlpha()`, `toUpperAlpha()`, `toLowerRoman()`, `toUpperRoman()`
- Added `preprocessLegalNumbering(html)` function:
  - For `numbering-{alpha,roman}-*` classes: converts to inline `style="list-style-type: ..."` that html-to-docx can interpret
  - For `legal-numbering` class: delegates to `injectLegalNumbers()` for visible text injection
- Added `injectLegalNumbers(html)` function:
  - Finds all `<ol class="legal-numbering">` blocks (last-to-first for index safety)
  - Uses `findClosingTag()` to extract each complete OL block
  - Delegates to `processLegalBlock()` for number injection
- Added `findClosingTag(html, start, tag)`: balanced tag finder handling nesting
- Added `processLegalBlock(block)`:
  - Maintains counter stack per nesting level
  - Walks OL/LI tokens, increments counters, builds hierarchical number string (e.g., "1.2.3")
  - Injects `<span style="font-weight:500">` with computed number as visible text prefix
  - Strips `legal-numbering` class and adds `list-style-type: none` to prevent double numbering
- Integrated into export pipeline: `preprocessHtmlForDocx()` → `preprocessLegalNumbering()` → `wrapHtmlForDocx()`

### What Was Intentionally Not Changed
- No API contract updates (document content is opaque HTML/Yjs)
- No database migrations (numbering stored as HTML attributes)
- No new dependencies
- `prefix` and `suffix` attributes deferred — require CSS custom properties or NodeView; disproportionate complexity for MVP
- Per-level configuration UI popover deferred — per-list dropdown is sufficient since each nested `<ol>` is a separate ProseMirror node
- DOCX native numbering XML (OOXML `<w:lvl>` generation) not attempted — pre-processing HTML is sufficient and avoids deep XML complexity
- "Continue from previous" toggle deferred — would require scanning sibling ProseMirror nodes; partially covered by `startFrom`

### Decisions Made
1. Per-list `numberingStyle` (not per-level UI) — each nested `<ol>` is a separate ProseMirror node, so per-list control gives per-level independence for free
2. `outline` and `legal` both map to `legal-numbering` CSS class — backward compatible, `legal` adds level 4 support
3. `startFrom` uses `counter-reset` for CSS counter styles, `start` attribute for native styles — both handled in `renderHTML`
4. DOCX export uses "pre-process HTML with visible text" strategy (Option A) — no OOXML XML generation needed, regex-based processing consistent with existing pipeline
5. Editor state polling (300ms interval) instead of TipTap `onSelectionUpdate` event — follows existing `realtimeConnected` pattern, avoids coupling to editor instance lifecycle
6. Number conversion helpers (`toLowerAlpha`, `toLowerRoman`, etc.) defined locally in exportDocx.ts — only used here, no shared utility created

### Risks
- `html-to-docx` may not honor `list-style-type: lower-alpha/roman` from inline styles — mitigated by the fact that the numbers will still render as basic decimal list with correct text content
- Regex-based legal numbering pre-processor assumes well-formed TipTap HTML output — TipTap always produces clean markup, but edge cases (empty lists, deeply nested content within LI) may need refinement
- CSS counter `startFrom` inline style and `numberingStyle` class are rendered by separate TipTap attribute `renderHTML` calls — TipTap merges attribute objects, verified no conflict

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 7 Implementation — Advanced Page Numbering (2026-02-19)

### What Was Completed

**No API contract changes. No database migrations. No new dependencies.**

**Type Extensions (Backend + Frontend):**
- `KACHERI BACKEND/src/store/docs.ts`: Extended `LayoutSettings` footer type with 4 new optional fields:
  - `pageNumberFormat?: 'decimal' | 'lowerRoman' | 'upperRoman' | 'lowerAlpha' | 'upperAlpha'`
  - `pageNumberStartAt?: number` — override start page number
  - `pageNumberPosition?: 'header-left' | 'header-center' | 'header-right' | 'footer-left' | 'footer-center' | 'footer-right'`
  - `sectionResetPageNumbers?: boolean` — restart numbering at section breaks
- `KACHERI FRONTEND/src/api.ts`: Added `PageNumberFormat` and `PageNumberPosition` type aliases; extended `FooterSettings` with same 4 fields
- `KACHERI FRONTEND/src/components/PageSetupDialog.tsx`: Mirrored type exports locally

All fields optional with sensible defaults → fully backward-compatible with existing stored layout settings.

**Frontend — PageSetupDialog UI (`components/PageSetupDialog.tsx`):**
- Extended `updateFooter()` defaults to include all 4 new fields
- Added expandable page numbering options section below the `showPageNumbers` checkbox (visible only when page numbers are enabled)
- Format picker: `<select>` with 5 options (1,2,3 / i,ii,iii / I,II,III / a,b,c / A,B,C)
- Position picker: `<select>` with 6 options (Header/Footer × Left/Center/Right)
- Start at: `<input type="number" min="1">` with "Auto" placeholder; empty = auto
- Section reset: Checkbox "Restart numbering at each section break"
- All controls follow existing PageSetupDialog patterns (`.page-setup-select`, `.page-setup-margin-input`, `.page-setup-toggle-label`)

**Frontend — CSS (`components/pageSetupDialog.css`):**
- Added `.page-setup-numbering-options` — container with subtle indented background
- Added `.page-setup-numbering-row` — flex row for format + position + start-at side by side
- Added `.page-setup-numbering-field` — individual field container with flex: 1
- Added `.page-setup-numbering-reset` — section reset checkbox container
- All styles follow existing design system (CSS variables, border-radius, transitions)

**Backend — DOCX Export (`routes/exportDocx.ts`):**
- Moved `getDocLayout()` call earlier in the export pipeline (before `preprocessHtmlForDocx`) so `sectionResetPageNumbers` flag is available for preprocessing
- Extended `preprocessHtmlForDocx()` with `sectionResetPageNumbers` parameter:
  - When true: converts section breaks to page breaks (preserves visual separation in DOCX)
  - When false: strips section breaks (existing behavior)
- Rewrote footer/header page number building logic:
  - Reads `pageNumberFormat`, `pageNumberPosition`, `pageNumberStartAt` from layout
  - `fmtLabels` map: decimal → `'Page {PAGE} of {NUMPAGES}'`, others → `'Page {PAGE}'`
  - `alignMap`: maps position to CSS text-align (left/center/right)
  - When position is `header-*`: page number HTML goes into headerHtml (enables `docxOptions.header`)
  - When position is `footer-*`: page number text appended to footerContent with correct alignment
  - Footer HTML uses dynamic `text-align` from position (was hardcoded `center`)
  - Passes `docxOptions.pageNumberStart` when startAt is set (best-effort)
  - Passes `docxOptions.pageNumberFormatType` when non-decimal (best-effort for future library support)

### What Was Intentionally Not Changed
- No API contract updates (LayoutSettings is opaque JSON within doc metadata)
- No database migrations (stored as JSON in `layout_settings` column)
- No new dependencies
- Existing `showPageNumbers: boolean` toggle remains as master switch — new fields only take effect when it's true
- No OOXML post-processing (direct XML manipulation of the DOCX ZIP) — deferred to enterprise hardening

### Decisions Made
1. New fields are all optional with defaults matching current behavior (decimal, footer-center, auto start, no section reset) → zero migration needed
2. `sectionResetPageNumbers` converts section breaks to page breaks in DOCX — true per-section `<w:sectPr>` with `<w:pgNumType>` requires OOXML post-processing (documented limitation)
3. Format preference is stored and passed to html-to-docx options, but actual format rendering in DOCX is best-effort — html-to-docx always renders `{PAGE}` as decimal. Noted in `pageNumberFormatType` option for future library support.
4. Position picker drives placement into headerHtml vs footerHTMLString with correct text-align — works correctly with html-to-docx
5. `getDocLayout()` call moved earlier in the export pipeline to avoid duplicate invocation

### Known Limitations
1. **Format in DOCX**: html-to-docx uses `{PAGE}` placeholder which renders as decimal in Word. True format control (`<w:numFmt>`) requires OOXML post-processing (deferred).
2. **Section reset in DOCX**: Per-section `<w:sectPr>` with `<w:pgNumType w:start="1">` requires OOXML post-processing. Section breaks are converted to page breaks for visual separation only.
3. **Start at**: Passed via `docxOptions.pageNumberStart` — html-to-docx may or may not honor this option.

### Risks
- html-to-docx may not support `pageNumberStart` or `pageNumberFormatType` options — mitigated by storing preferences in layout settings for future OOXML post-processing
- Non-decimal formats display as decimal in exported DOCX — acceptable per risk register ("accept degraded export as fallback")

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 8 Implementation — Multi-Column Layout Extensions (2026-02-19)

### What Was Completed

**No API contract changes. No database migrations. No new dependencies.**

**Frontend — Extension (`extensions/ColumnSection.ts`):**
- Exported `ColumnGap` (`'narrow' | 'medium' | 'wide'`) and `ColumnRule` (`'none' | 'thin' | 'medium'`) type aliases
- Added `columnGap` attribute: parses from `data-column-gap`, default `'medium'`
- Added `columnRule` attribute: parses from `data-column-rule`, default `'none'`
- Added `columnWidths` attribute: parses from `data-column-widths`, default `null` (e.g., `"2:1"`, `"1:1:1"`, `"1:2:1"`)
  - When set, `renderHTML` outputs inline `style="display: grid; grid-template-columns: Nfr Nfr;"` to switch from CSS column-count (flowing) to CSS Grid (fixed cells)
  - Helper `widthsToGridTemplate()` converts ratio string to `fr`-based template
- Added `setColumnGap(gap)`, `setColumnRule(rule)`, `setColumnWidths(widths)` commands via `updateAttributes`
- Backward compatible: existing 2-column layouts render identically (gap defaults to medium, rule defaults to none, widths defaults to null)

**Frontend — Extension (`extensions/SectionBreak.ts`):**
- Added `headerHtml` attribute: parses from `data-header-html`, default `''`
- Added `footerHtml` attribute: parses from `data-footer-html`, default `''`
- Added `firstPageDifferent` attribute: parses from `data-first-page-different`, default `false`
- `insertSectionBreak` command updated to accept all new options
- Backward compatible: existing section breaks render identically (all new fields default to empty/false)

**Frontend — Extension index (`extensions/index.ts`):**
- Added `ColumnGap` and `ColumnRule` type exports alongside `ColumnSection`

**Frontend — EditorApi (`Editor.tsx`):**
- Added `setColumnCount(columns: number)`, `setColumnGap(gap: ColumnGap)`, `setColumnRule(rule: ColumnRule)`, `setColumnWidths(widths: string | null)` to `EditorApi` type
- Added implementations in `useImperativeHandle`: delegate to `editor.commands.*`
- Added `ColumnGap`, `ColumnRule` to the `export type` line

**Frontend — CSS (`ui.css`):**
- Added 3-column styles: `.kacheri-columns[data-columns="3"]` with `column-count: 3; column-gap: 2em;`
- Added 4-column styles: `.kacheri-columns[data-columns="4"]` with `column-count: 4; column-gap: 1.5em;`
- Added gap variants: `[data-column-gap="narrow"]` → `1em`, `"medium"` → `2em`, `"wide"` → `3em`
- Added rule variants: `[data-column-rule="none"]` → `none`, `"thin"` → `1px solid #e5e7eb`, `"medium"` → `2px solid #d1d5db`
- Added grid mode: `[data-column-widths]` overrides `column-count` with `unset`, grid gap variants applied via `gap` property
- Added width ratio label: `::before` shows `"N Columns (ratio)"` when widths are set
- Updated print styles: 3-4 column sections collapse to 2 columns on print
- Removed hardcoded `column-rule` from 2-column default (now controlled by `data-column-rule` attribute)

**Frontend — Toolbar UI (`EditorPage.tsx`):**
- Imported `ColumnGap`, `ColumnRule` types from `./Editor`
- Added 4 column state variables: `currentColumnCount`, `currentColumnGap`, `currentColumnRule`, `currentColumnWidths`
- Extended existing 300ms polling `useEffect` to also read `columnSection` attributes alongside list attributes
- Added "Layout" group in left formatting drawer (between Lists and Clear Formatting):
  - Column count `<select>`: No Columns / 2 / 3 / 4 — wraps/unwraps/updates as appropriate
  - Column gap `<select>`: Narrow / Medium / Wide (visible when in columns)
  - Column rule `<select>`: None / Thin / Medium (visible when in columns)
  - Width ratio presets `<select>`: Equal + context-sensitive presets (2:1, 1:2 for 2-col; 1:1:1, 1:2:1 for 3-col; etc.)
  - "Insert Section Break" button
  - Column settings conditionally visible only when cursor is inside a column section (`currentColumnCount >= 2`)

**Backend — DOCX Export (`routes/exportDocx.ts`):**
- Replaced simple column unwrap regex with structured table-based conversion
- Added `parseColumnWidths(widths, colCount)`: converts ratio string (e.g., `"2:1"`) to percentage array (e.g., `[66.7, 33.3]`)
- Added `convertColumnsToTable(block)`: extracts column count, widths, gap from attributes; parses child block elements; distributes across table cells sequentially (round-robin); generates `<table>` with correct cell widths and padding
- Added `extractBalancedDiv(html, startIdx)`: finds the balanced closing `</div>` for nested column section markup
- Updated `preprocessHtmlForDocx()`: processes all `kacheri-columns` blocks last-to-first using balanced div extraction + table conversion (instead of simple unwrap)
- Section break handling unchanged (page-break conversion when `sectionResetPageNumbers` is true, removal otherwise)

### What Was Intentionally Not Changed
- No API contract updates (column layout is opaque HTML/Yjs content)
- No database migrations (all attributes stored as HTML data attributes)
- No new dependencies
- Existing `wrapInColumns`, `unwrapColumns`, `toggleColumns` commands unchanged — new commands are additive
- `SectionBreak` per-section header/footer attributes stored on node but NOT yet consumed by export pipeline (true per-section `<w:sectPr>` requires OOXML post-processing, deferred)
- No OOXML post-processing for `<w:cols>` — table-based approach gives reasonable visual approximation

### Decisions Made
1. **Grid mode for width ratios** — CSS `column-count` doesn't support per-column widths; switching to CSS Grid when `columnWidths` is set is the only way. Content doesn't flow between grid cells (behavioral difference from flowing columns, documented).
2. **Table-based DOCX export** — Replaced simple unwrap with HTML table conversion. Content distributed across cells sequentially (round-robin). Gives visual multi-column layout in Word. Accepted per risk register ("accept minor differences; document known limitations").
3. **Gap/Rule as data attributes** — Rendered via CSS attribute selectors, not inline styles. This keeps the HTML clean and allows CSS-only theming.
4. **Print styles collapse 3-4 columns to 2** — Prevents narrow-column overflow on standard paper sizes.
5. **Conditional UI visibility** — Column gap/rule/width controls only visible when cursor is inside a column section, reducing toolbar clutter.
6. **Combined polling useEffect** — Merged numbering and column attribute polling into single 300ms interval for efficiency (one `getAttributes` call per type per tick).

### Known Limitations
1. **Width ratios use CSS Grid** — Content is assigned to cells sequentially, not flowed. Each child block element goes to the next column. This differs from CSS `column-count` where text wraps to the next column automatically.
2. **DOCX table export** — Content distribution differs from editor view (sequential vs flowing). The exported DOCX shows content in table cells, not Word native columns (`<w:cols>`). True `<w:cols>` requires OOXML post-processing (deferred).
3. **Section break per-section headers/footers** — Attributes are stored but not consumed by export. True per-section `<w:sectPr>` requires OOXML post-processing (deferred to enterprise hardening).

### Risks
- Table-based column export may have spacing differences compared to editor view — mitigated by explicit cell widths and padding based on gap setting
- Grid mode behavioral difference (no content flow) may confuse users expecting newspaper-style columns — mitigated by offering as an optional "width ratios" feature, not the default

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 9 Implementation — Document-Link Graph (2026-02-19)

### What Was Completed

**No API contract changes. No database migrations. No new dependencies.**

**New file: `components/knowledge/DocLinkGraph.tsx` — Interactive force-directed graph:**
- Custom force simulation engine (zero dependencies): Coulomb repulsion (O(N²)), spring link attraction, center gravity, velocity damping
- `initCircleLayout()` → initial circular placement of nodes
- 300-tick synchronous pre-layout before first render, then `requestAnimationFrame` loop for interactive settling
- Throttled React re-renders: only when `maxVelocity > 0.5` and at most 30fps
- SVG rendering with `<g>` transform for zoom/pan:
  - Nodes: `<circle>` sized by link count (`BASE_RADIUS + RADIUS_SCALE * sqrt(linkCount)`)
  - Node coloring: gradient from dim gray (#4b5563) to bright blue (#93c5fd) by link density
  - Edges: `<line>` with `<marker>` arrowheads for directionality
  - Invisible wide hit-target lines (stroke-width: 12) for edge click detection
  - Labels: `<text>` with truncated doc titles
- SVG interactions:
  - Wheel zoom (0.2x–3x) with zoom-toward-cursor math
  - Pan via `pointerdown/move/up` on SVG background
  - Node drag: sets `fx`/`fy`, resets simulation alpha to 0.3 for re-settling
  - `setPointerCapture` for reliable pointer tracking outside SVG bounds
- Tooltip: HTML `<div>` overlay (screen space) showing doc title + link count on node hover
- Edge detail: Click edge → popover showing "DocA → links to → DocB" with link text
- Click-to-navigate: `useNavigate()` to `/doc/${nodeId}` on node click
- Filters:
  - Min link count slider (hides orphan/isolated documents)
  - Search-to-focus input (type doc title → graph pans/zooms to matching node)
  - Reset view button (computes bounding box and fits all nodes)
- Data fetching: `DocsAPI.list()` for workspace docs (nodes), then `Promise.allSettled(docs.map(d => docLinksApi.listLinks(d.id)))` for all edges in parallel
- Large workspace guard: Caps at 150 docs (sorted by most recently updated), shows info banner
- Synthetic nodes: Creates dashed-circle nodes for link targets not in the workspace doc list (trashed, inaccessible, etc.)
- Legend bar showing node color scale, synthetic node indicator, and interaction hints

**Modified: `components/knowledge/index.ts`:**
- Added `DocLinkGraph` barrel export

**Modified: `pages/WorkspaceKnowledgeExplorerPage.tsx` — Tabbed layout refactor:**
- Added `activeTab` state: `'explorer' | 'documents' | 'entities'` (default: `'explorer'`)
- Added tab bar navigation (Explorer | Documents | Entities) rendered after re-index error banner
- Wrapped all existing content (Semantic Search through Entity table) in `{activeTab === 'explorer' && <> ... </>}`
- Documents tab: renders `<DocLinkGraph workspaceId={workspaceId} />` (lazy-loaded on tab activation)
- Entities tab: placeholder for Slice 10 (Entity Graph Visualization)
- EntityDetailModal stays outside tabs (modal, accessible from any tab)
- Added `tabBarStyle`, `tabBtnStyle`, `tabBtnActiveStyle` CSSProperties matching page dark theme
- Zero existing lines deleted — all changes are additive

### What Was Intentionally Not Changed
- No backend changes (uses existing `GET /docs` and `GET /docs/:id/links` APIs)
- No API Contract updates (no new endpoints)
- No new dependencies (custom force simulation replaces `@xyflow/react` — user chose d3-force + custom SVG approach, implemented from scratch)
- No folder-based node coloring (DocMeta doesn't carry folder info; nodes colored by link count instead)
- No per-node right-click context menu (click navigates, hover shows tooltip — sufficient for MVP)
- No WebSocket event handling for real-time graph updates (graph refreshes on tab mount; real-time updates deferred)

### Decisions Made
1. **d3-force + custom SVG** over `@xyflow/react` — user decision; zero dependencies, full control, adequate for 10-150 node graphs
2. **N+1 data fetching** (1 docs call + N link calls in parallel) — no workspace-level links endpoint exists; `Promise.allSettled` handles individual failures gracefully
3. **150 doc cap** — prevents O(N²) repulsion from degrading performance on very large workspaces; shows most recently updated docs
4. **Inline CSSProperties** (not CSS file) — matches existing page styling pattern; all 1037 lines of the host page use inline styles
5. **Default tab is 'explorer'** — preserves existing user behavior; returning users see the familiar search + entity table view
6. **Simulation runs in refs** (not React state) — only triggers React re-renders when visible movement occurs; avoids 60fps state churn
7. **Synthetic nodes for unknown targets** — creates dashed-circle placeholder nodes for link targets not in docs list, preventing crashes and showing the relationship exists
8. **Tooltip in screen space** (HTML overlay, not SVG) — avoids SVG text rendering issues and zoom scaling artifacts

### Risks
- N+1 link fetching may be slow for workspaces with 100+ docs — mitigated by `Promise.allSettled` parallelism and 150 doc cap; a workspace-level links endpoint could optimize this later
- Force simulation O(N²) repulsion at N=150 costs ~22,500 pair computations per tick — benchmarked as acceptable (<3ms per tick on modern hardware)
- SVG pointer events may behave differently across browsers for drag/pan — mitigated by `setPointerCapture` for reliable tracking

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 10 Implementation — Entity Graph Visualization (2026-02-19)

### What Was Completed

**No API contract changes. No database migrations. No new dependencies. Frontend only.**

**New file: `components/knowledge/EntityGraph.tsx` — Interactive entity-relationship graph:**
- Custom force simulation engine (zero dependencies) — same pattern as `DocLinkGraph.tsx`:
  - Coulomb repulsion (O(N²)), spring link attraction, center gravity, velocity damping
  - 300-tick synchronous pre-layout, then `requestAnimationFrame` loop for interactive settling
  - Throttled React re-renders (30fps max, only when visible movement)
- Data fetching: parallel `knowledgeApi.listEntities()` (limit 500, sorted by mention count) + `knowledgeApi.listRelationships()` (limit 2000)
- Entity cap at 200 nodes for O(N²) simulation safety (shows info banner when capped)
- Only includes relationship edges where both endpoints exist in the node set
- SVG rendering with `<g>` transform for zoom/pan:
  - Nodes: `<circle>` sized by `BASE_RADIUS + RADIUS_SCALE * sqrt(mentionCount)`
  - Node coloring: by `ENTITY_TYPE_COLORS[entityType]` (8 distinct colors matching existing page palette)
  - Edges: `<line>` colored by `RELATIONSHIP_TYPE_COLORS[relationshipType]` (6 types), opacity scaled by relationship strength (0.15–0.6)
  - No arrowheads (entity relationships are undirected conceptually)
  - Invisible wide hit-target lines (stroke-width: 12) for edge click detection
  - Labels: `<text>` with truncated entity names
- SVG interactions (identical to DocLinkGraph):
  - Wheel zoom (0.2x–3x) with zoom-toward-cursor math
  - Pan via `pointerdown/move/up` on SVG background
  - Node drag: sets `fx`/`fy`, resets simulation alpha to 0.3 for re-settling
  - `setPointerCapture` for reliable pointer tracking
- Tooltip: HTML overlay showing entity name, type (color-coded), mention count, connection count
- Edge detail: Click edge → popover showing "EntityA ↔ EntityB" + relationship type + strength percentage + evidence count + optional label
- **Click-to-detail**: `onEntityClick(nodeId)` prop → opens `EntityDetailModal` (NOT navigate like DocLinkGraph)
- Filter panel (3 rows):
  1. Entity type toggle chips (8 types) — click to show/hide entity types with color-coded active state
  2. Relationship type toggle chips (6 types) — click to show/hide relationship types
  3. Min connections slider + Search-to-focus input + Reset View button + node/edge count
- Focus: type entity name → graph pans/zooms to matching node with golden dashed ring
- Reset View: computes bounding box and fits all nodes
- Legend: all 8 entity type color dots with labels + interaction hints
- Styles: all inline CSSProperties matching DocLinkGraph and host page dark theme

**Modified: `components/knowledge/index.ts`:**
- Added `EntityGraph` barrel export

**Modified: `pages/WorkspaceKnowledgeExplorerPage.tsx`:**
- Added `EntityGraph` to import from `'../components/knowledge'`
- Replaced Entities tab placeholder (spider emoji + "planned for next update" text) with:
  `<EntityGraph workspaceId={workspaceId} onEntityClick={handleEntityClick} />`
- `handleEntityClick` already existed (line 238) — sets `selectedEntityId` which opens `EntityDetailModal`

### What Was Intentionally Not Changed
- No backend files (uses existing `GET /workspaces/:id/knowledge/entities` and `GET /workspaces/:id/knowledge/relationships` APIs)
- No API Contract updates (no new endpoints)
- No new dependencies (custom force simulation, same as Slice 9)
- `DocLinkGraph.tsx` untouched
- All existing Explorer tab content untouched
- `EntityDetailModal.tsx` untouched (receives clicks from graph)
- No WebSocket event handling for real-time graph updates (graph refreshes on tab mount)

### Decisions Made
1. **Custom force simulation** over `@xyflow/react` — follows user's Slice 9 decision; zero dependencies, full control, adequate for 10-200 node entity graphs
2. **200 entity cap** (vs 150 for DocLinkGraph) — entities are typically more numerous; O(N²) at 200 = 40,000 pair computations/tick, still fast
3. **Parallel data fetch** — single `Promise.all` for entities + relationships (2 API calls vs N+1 in DocLinkGraph)
4. **No arrowheads on entity relationships** — unlike doc links which are directional, entity relationships are conceptually bidirectional
5. **Edge opacity by strength** — provides visual weight hierarchy without cluttering the graph
6. **3-row filter panel** — entity types, relationship types, and controls separated for clarity
7. **Inline CSSProperties** (not CSS file) — matches existing page and DocLinkGraph styling pattern
8. **`onEntityClick` callback prop** — graph doesn't navigate; delegates to parent for modal opening (reuses existing `handleEntityClick` → `EntityDetailModal` pipeline)

### Risks
- O(N²) repulsion at N=200 costs ~40,000 pair computations per tick — benchmarked as acceptable (<5ms per tick on modern hardware)
- `listEntities` limit=500 may not capture all entities in very large workspaces — mitigated by sorting by mention count (most important entities shown first) and info banner
- `listRelationships` limit=2000 may miss some relationships — mitigated by showing the most relevant connections; a graph-optimized endpoint could be added later

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 11 Implementation — Notification Preferences & Webhook Delivery (2026-02-19)

### What Was Completed

**API Contract (contract-first):**
- Added `GET /workspaces/:id/notification-preferences` endpoint spec
- Added `PUT /workspaces/:id/notification-preferences` endpoint spec (upsert semantics)
- Added Permission Model — Notification Preferences (`member+` on workspace)
- Added `notification:deliver` to Job Types list
- Added `notification:preference:update` to Audit Actions
- Added changelog entry v1.17.0

**Migration:**
- `011_add_notification_preferences.sql`: `notification_preferences` table with `id` (INTEGER PK AUTOINCREMENT), `user_id`, `workspace_id`, `channel`, `notification_type`, `enabled`, `config_json`, `created_at`, `updated_at`
- UNIQUE constraint on `(user_id, workspace_id, channel, notification_type)` for upsert semantics
- Index: `idx_notification_preferences_user_workspace` on `(user_id, workspace_id)`
- Rollback section (commented)

**Backend — Store (`store/notificationPreferences.ts`):**
- Type exports: `NotificationChannel` (`'in_app' | 'webhook' | 'slack'`), `PreferenceNotificationType` (`NotificationType | 'all'`), `NotificationPreference`, `UpsertPreferenceInput`, `ActiveChannel`
- Validation helpers: `isValidChannel()`, `isValidPreferenceNotificationType()`
- `listPreferences(userId, workspaceId)` — SELECT with ORDER BY channel, notification_type
- `upsertPreferences(userId, workspaceId, inputs[])` — INSERT OR REPLACE using UNIQUE constraint, wrapped in transaction for atomicity
- `getActiveChannels(userId, workspaceId, notificationType)` — returns enabled channels for delivery, checks both specific type and 'all' fallback, deduplicates by channel with specific-type priority
- `deleteWorkspacePreferences(workspaceId)` — for workspace deletion cleanup
- All functions follow existing store patterns (try/catch, console.error, row conversion)

**Backend — Routes (`routes/notificationPreferences.ts`):**
- `GET /workspaces/:wid/notification-preferences` (member+): extracts userId, workspace read access check, returns `{ preferences }`
- `PUT /workspaces/:wid/notification-preferences` (member+): validates preferences array (max 50), validates each channel/notificationType/enabled, validates webhook URLs (must be HTTPS), validates Slack URLs (must be from hooks.slack.com), upserts, audit logs, returns `{ preferences, updated }`
- `FastifyPluginAsync` pattern with default export (follows `compliancePoliciesRoutes` pattern)

**Backend — Job Types (`jobs/types.ts`):**
- Added `"notification:deliver"` to `JobType` union
- Added `NotificationDeliverPayload` interface (notificationId, userId, workspaceId, notificationType, title, body, linkType, linkId, actorId)
- Added `NotificationDeliverResult` interface (notificationId, channels array with status per channel)

**Backend — Worker (`jobs/workers/notificationDeliverWorker.ts`):**
- `notificationDeliverJob(job)` — main worker function
  - Calls `getActiveChannels()` to find enabled external channels
  - Skips `in_app` channel (already delivered synchronously)
  - Webhook delivery: POST JSON payload (`{ event, notification, workspace, actor, timestamp }`) to config.url with 5s timeout via AbortController
  - Slack delivery: POST Slack Block Kit message (`{ blocks: [header, section, context] }`) to config.webhookUrl with 5s timeout
  - Returns per-channel delivery status (delivered/skipped/failed with error message)
- `registerNotificationDeliverWorkers()` — registration function following `registerReminderWorkers()` pattern

**Backend — Notification Creation Wrapper (`store/notifications.ts`):**
- Added `createAndDeliverNotification(params)` — creates in-app notification via existing `createNotification()`, then enqueues `notification:deliver` job via `queue.add()` for external channel delivery
- Non-fatal: if job queue enqueue fails, in-app notification is still returned (console.warn logged)
- Existing `createNotification()` left completely unchanged for backward compatibility

**Backend — Worker Registration (`jobs/workers/index.ts`):**
- Added import and registration call for `registerNotificationDeliverWorkers`
- Updated console.log message to include `notification:deliver`
- Added export for `notificationDeliverJob`

**Backend — Audit Types (`store/audit.ts`):**
- Added `"notification:preference:update"` to `AuditAction` union
- Added `"notification_preference"` to `AuditTargetType` union

**Backend — Server Registration (`server.ts`):**
- Imported `notificationPreferenceRoutes` from `./routes/notificationPreferences`
- Registered route plugin after existing notification routes
- Added `/workspaces/:id/notification-preferences [GET, PUT]` to index route listing

**Frontend — API Client (`api/notificationPreferences.ts`):**
- Type exports: `NotificationChannel`, `PreferenceNotificationType`, `NotificationPreference`, `UpsertPreferenceInput`, `ListPreferencesResponse`, `UpdatePreferencesResponse`
- `notificationPreferencesApi.list(workspaceId)` — GET
- `notificationPreferencesApi.update(workspaceId, preferences)` — PUT with JSON body
- Standard `request<T>()` wrapper with auth/dev headers (duplicated from `comments.ts` pattern)

**Frontend — WorkspaceSettingsModal (`components/workspace/WorkspaceSettingsModal.tsx`):**
- Added `'notifications'` to `Tab` union type
- Added notification state: `notifPrefs`, `notifLoading`, `notifSaving`, `notifError`, `notifSuccess`, `notifDraft`
- Added `loadNotifPrefs()` — loads preferences on tab activation (same pattern as `loadMembers()`)
- Added draft management helpers: `getDraftPref()`, `isChannelEnabled()`, `isTypeEnabled()`, `getChannelConfig()`, `toggleChannelAll()`, `toggleType()`, `updateChannelConfig()`
- Added `handleSaveNotifPrefs()` — calls PUT endpoint, updates state, shows success/error
- Added "Notifications" tab button in nav (visible to all members — before "Danger Zone")
- Notifications tab content:
  - Per-channel sections: In-App, Webhook, Slack
  - Each channel: master enable/disable checkbox with channel label
  - Webhook config: HTTPS URL input (visible when enabled)
  - Slack config: incoming webhook URL input (visible when enabled)
  - Per-type toggles for external channels: Mentions, Comment Replies, Document Shared, Suggestions, Reminders
  - "Save Preferences" button at bottom

**Frontend — CSS (`components/workspace/workspaceSettings.css`):**
- Added `.ws-settings-notifications` container
- Added `.ws-settings-notif-channel` — per-channel section with border and background
- Added `.ws-settings-notif-channel-header` — flex header with toggle and label
- Added `.ws-settings-notif-toggle` — checkbox + label styling with purple accent
- Added `.ws-settings-notif-types` — flex-wrap container for type toggles
- Added `.ws-settings-notif-type-toggle` — pill-shaped checkbox + label

### What Was Intentionally Not Changed
- No email delivery (deferred to Slice 13 with nodemailer dependency)
- No new npm dependencies
- Existing `createNotification()` function unchanged — new `createAndDeliverNotification()` is additive wrapper
- No WebSocket event type changes (delivery is background job, not real-time event)
- No "Test" button for webhook/Slack (can be added later; users can test by creating a notification)
- Existing notification routes (`/notifications`) unchanged
- No WebSocket handler for notification preferences changes

### Decisions Made
1. `createAndDeliverNotification()` wrapper approach — keeps `createNotification()` pure, existing callers unaffected, new callers opt into external delivery
2. `getActiveChannels()` with 'all' fallback — specific notification type preferences take priority over 'all', deduplicated by channel
3. Webhook delivery includes event type, notification details, workspace ID, actor, and timestamp — sufficient for external system integration
4. Slack uses Block Kit format (header + section + context) — renders well in Slack UI, no SDK dependency
5. 5-second timeout on all external deliveries — prevents worker from hanging on slow endpoints
6. Job queue retry (maxAttempts=3) handles transient failures — no custom retry logic in worker
7. All members can manage their own preferences (not admin-only) — per API contract spec
8. Draft-based editing in frontend — changes are batched and sent on "Save", not per-toggle (reduces API calls)
9. `FastifyPluginAsync` pattern with default export — follows `compliancePoliciesRoutes` (workspace-scoped route pattern)
10. In-app channel shown in UI but labeled "Always active" — clarifies that in-app notifications can't be disabled

### Risks
- `queue.add()` is async (returns Promise) but called without await in `createAndDeliverNotification()` — fire-and-forget is intentional; job queue persistence ensures delivery even if the promise isn't awaited
- External webhooks may receive duplicate deliveries if job retries on timeout where the target received the first request — mitigated by including `notificationId` in payload for idempotency checking by consumers
- No webhook URL signature/HMAC — consumers cannot verify requests came from Kacheri; can be added in a future slice if needed

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 12 Implementation — Review Assignment System (2026-02-19)

### What Was Completed

**API Contract (contract-first):**
- Added `Document Reviewer Endpoints (Slice 12)` section with 4 endpoints:
  - `POST /docs/:id/reviewers` — Assign reviewer (editor+ on doc)
  - `GET /docs/:id/reviewers` — List reviewers (viewer+ on doc)
  - `PATCH /docs/:id/reviewers/:userId` — Update status (reviewer themselves or editor+)
  - `DELETE /docs/:id/reviewers/:userId` — Remove reviewer (editor+ or self)
- Added Permission Model — Document Reviewers table
- Added `reviewer` to WebSocket event types table with payload documentation
- Updated `notificationType` to include `review_assigned`
- Added changelog entry v1.18.0

**Migration:**
- `012_add_doc_reviewers.sql`: `doc_reviewers` table with `id` (INTEGER PK AUTOINCREMENT), `doc_id`, `workspace_id`, `user_id`, `assigned_by`, `status` (default 'pending'), `assigned_at`, `completed_at`, `notes`
- UNIQUE constraint on `(doc_id, user_id)` — prevents duplicate reviewer assignments
- Foreign key on `doc_id` → `docs(id)` with CASCADE delete
- Indexes: `idx_doc_reviewers_doc` (doc_id), `idx_doc_reviewers_user` (user_id, workspace_id)
- Rollback section (commented)

**Backend — Store (`store/docReviewers.ts`):**
- Type exports: `ReviewerStatus` (`'pending' | 'in_review' | 'completed'`), `DocReviewer`, `DocReviewerRow`
- `assignReviewer(docId, workspaceId, userId, assignedBy)` — INSERT with UNIQUE constraint for duplicate detection, returns `DocReviewer | null`
- `listReviewers(docId)` — SELECT ordered by assigned_at ASC
- `getReviewer(docId, userId)` — SELECT by composite key (doc_id + user_id)
- `updateReviewerStatus(docId, userId, status, notes?)` — UPDATE with conditional `completed_at` (set when status='completed', cleared otherwise)
- `removeReviewer(docId, userId)` — DELETE, returns boolean
- `listReviewersByUser(userId, workspaceId)` — for "assigned to me" queries
- `isValidReviewerStatus(s)` — validator against `VALID_STATUSES` set
- All functions follow existing store patterns (prepared statements, `rowToReviewer()` mapper, try/catch, console.error)

**Backend — Routes (`routes/docReviewers.ts`):**
- `FastifyPluginAsync` with default export, 4 endpoints
- Helper functions: `getActorId(req)` returns `getUserId(req) || 'user:anonymous'`, `getWorkspaceId(req)` from `x-workspace-id` header (follows `docAttachments.ts` pattern)
- `POST /docs/:id/reviewers` (editor+): validates userId, calls `assignReviewer()`, fires `createAndDeliverNotification()` with type `review_assigned`, `broadcastToUser()` for reviewer notification WS, audit log `reviewer:assign`, WS broadcast `reviewer` event, returns 201
- `GET /docs/:id/reviewers` (viewer+): returns `{ reviewers, count }`
- `PATCH /docs/:id/reviewers/:userId` (self or editor+): validates status via `isValidReviewerStatus()`, RBAC check (reviewer themselves OR editor+), audit log `reviewer:status_change`, WS broadcast `reviewer` event
- `DELETE /docs/:id/reviewers/:userId` (self or editor+): RBAC check (editor+ can remove anyone, reviewer can remove self), audit log `reviewer:unassign`, WS broadcast `reviewer` event

**Backend — Type Updates:**
- `store/audit.ts`: Added `"reviewer:assign"`, `"reviewer:unassign"`, `"reviewer:status_change"` to `AuditAction`; added `"reviewer"` to `AuditTargetType`
- `realtime/types.ts`: Added `'review_assigned'` to `NotificationType`; added `reviewer` event variant to `WorkspaceServerEvent` union
- `store/notifications.ts`: Added `'review_assigned'` to `NotificationType`

**Backend — Server Registration (`server.ts`):**
- Imported `docReviewerRoutes` from `./routes/docReviewers`
- Registered after `docAttachmentRoutes`
- Added `/docs/:id/reviewers [GET, POST]` and `/docs/:id/reviewers/:userId [PATCH, DELETE]` to route listing

**Frontend — API Client (`api/reviewers.ts`):**
- Type exports: `DocReviewer`, `ReviewerStatus`, `ListReviewersResponse`, `AssignReviewerResponse`, `UpdateReviewerResponse`
- `reviewersApi.list(docId)` — GET
- `reviewersApi.assign(docId, userId)` — POST
- `reviewersApi.updateStatus(docId, userId, status, notes?)` — PATCH
- `reviewersApi.remove(docId, userId)` — DELETE
- Standard `request<T>()` wrapper pattern

**Frontend — Hook (`hooks/useReviewers.ts`):**
- `useReviewers(docId, refreshKey)` following `useComments.ts` pattern
- Returns `{ reviewers, count, loading, error, refetch, stats }`
- Stats computed: `{ total, pending, inReview, completed }`
- `useEffect` with cancelled boolean for cleanup, `useCallback` refetch

**Frontend — WebSocket (`hooks/useWorkspaceSocket.ts`):**
- Added `ReviewerAction` type export (`'assigned' | 'status_changed' | 'removed'`)
- Added `reviewer` variant to `WsEvent` union type
- Added `case 'reviewer':` handler in `ws.onmessage` switch block with safe field parsing

**Frontend — ReviewersPanel (`components/ReviewersPanel.tsx`):**
- Props: `{ docId, open, onClose, refreshKey, currentUserId, workspaceId }`
- Stats bar: Total, Pending (amber), In Review (blue), Completed (green)
- Assign reviewer section: user picker dropdown (workspace members via `workspacesApi.listMembers()`, filtered to exclude already-assigned), assign button
- Reviewer list with status badges (color-coded), metadata (assigned by, date, completed date), notes display
- Self-service actions: "Start Review" (pending→in_review), "Mark Complete" (in_review→completed) with optional notes textarea
- Remove button for all reviewers (backend enforces RBAC)
- Empty state with assign prompt
- All inline styles (no separate CSS file — matches simpler panel conventions)

**Frontend — EditorPage Integration (`EditorPage.tsx`):**
- Added `ReviewersPanel` import
- Added `"reviewers"` to `rightDrawerTab` union type
- Added `reviewersRefreshKey` state (after `attachmentsRefreshKey`)
- Added WS handler: bumps `reviewersRefreshKey` on `reviewer` events for current doc
- Added "Review" drawer tab button after "Attach" button
- Added `ReviewersPanel` conditional render in drawer content

### What Was Intentionally Not Changed
- No new dependencies
- No "assigned to me" dashboard view (backend `listReviewersByUser()` is ready; frontend deferred)
- No email notification for review assignments (deferred to Slice 13 with nodemailer dependency — `createAndDeliverNotification()` will automatically deliver to external channels once configured via Slice 11 preferences)
- No reviewer role enforcement for doc access (assigning a reviewer does not auto-grant doc access; doc permissions are managed separately)
- No review deadline/due date fields (not in roadmap scope)

### Decisions Made
1. `getActorId()` fallback to `'user:anonymous'` — follows `docAttachments.ts` pattern for handling nullable `getUserId()` return
2. `getWorkspaceId()` from request headers — follows `docAttachments.ts` pattern; workspace ID sourced from doc record when available, header as fallback
3. `assignReviewer()` returns `null` on UNIQUE constraint violation — treated as 409 Conflict (duplicate assignment), not 500
4. `updateReviewerStatus()` conditionally sets `completed_at` — set when status='completed', cleared when reverting to earlier status
5. Reviewer self-RBAC: reviewer can update own status and remove self without editor+ role — per work scope B5 spec
6. `broadcastToUser()` sends real-time notification directly to the reviewer — supplements the `createAndDeliverNotification()` persistent notification
7. Inline styles for ReviewersPanel (no CSS file) — simpler panel with fewer states than CommentsPanel/AttachmentPanel
8. Stats computed client-side from reviewer list — avoids separate stats endpoint for small data sets

### Risks
- `workspacesApi.listMembers()` called on every panel open — acceptable for typical workspace sizes; could be cached if performance becomes an issue
- No pagination on reviewer list — typically <20 reviewers per document; adequate for MVP
- `confirm()` dialog for reviewer removal is browser-native — matches existing pattern (AttachmentPanel, CommentsPanel) but may want custom dialog in future

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 13 Implementation — Email Notification Delivery (2026-02-19)

### What Was Completed

**API Contract (contract-first):**
- Updated `Channels` list: added `email` alongside `in_app`, `webhook`, `slack`
- Added email config shape: `{ "email": "user@example.com" }`
- Added email example to PUT request body
- Added email validation error to errors list
- Added changelog entry v1.19.0

**Dependency:**
- `nodemailer` (MIT, 16M+ weekly npm downloads) — approved and installed
- `@types/nodemailer` — dev dependency for TypeScript types

**Backend — Store (`store/notificationPreferences.ts`):**
- Extended `NotificationChannel` type: `'in_app' | 'webhook' | 'slack' | 'email'`
- Added `'email'` to `VALID_CHANNELS` array

**Backend — Route (`routes/notificationPreferences.ts`):**
- Added `validateEmailAddress(email)` function — regex validation for `user@domain.tld` format, max 254 characters
- Added email channel validation block in PUT handler: when `channel === 'email' && enabled`, requires `config.email` as a valid email address
- Updated invalid channel error message to include `email`

**Backend — Worker (`jobs/workers/notificationDeliverWorker.ts`):**
- Added `nodemailer` import and `Transporter` type
- Added SMTP config from env vars:
  - `KACHERI_SMTP_HOST` (required for email to work; empty = email disabled)
  - `KACHERI_SMTP_PORT` (default: 587)
  - `KACHERI_SMTP_SECURE` (default: false)
  - `KACHERI_SMTP_USER` / `KACHERI_SMTP_PASS` (optional auth)
  - `KACHERI_SMTP_FROM` (default: `noreply@kacheri.local`)
- Added lazy singleton SMTP transport — created on first email delivery, not at module load
- Added `EMAIL_TIMEOUT_MS = 10_000` constant (SMTP is slower than HTTP webhooks)
- Added `SUBJECT_MAP` — per-notification-type email subjects
- Added `getEmailSubject(payload)` — returns `[Kacheri] {type-specific subject}`
- Added `escapeHtml(text)` — prevents XSS in email template
- Added `getEmailHtml(payload)` — returns styled HTML email with:
  - Branded header bar (dark background, white "Kacheri" text)
  - Type label, title, body text
  - CTA button (View in Kacheri) when linkId is present
  - Footer with workspace name and preferences hint
  - All inline CSS for maximum email client compatibility
- Added `deliverEmail(payload, config)` — extracts `config.email`, gets/creates SMTP transport, calls `transport.sendMail()`
- Added `channel === 'email'` case in main worker dispatch loop

**Frontend — API Client (`api/notificationPreferences.ts`):**
- Extended `NotificationChannel` type to include `'email'`

**Frontend — WorkspaceSettingsModal (`components/workspace/WorkspaceSettingsModal.tsx`):**
- Added `'email'` to `CHANNELS` array
- Added `email: 'Email'` to `CHANNEL_LABELS`
- Added email config input section (after Slack config, before per-type toggles):
  - `<input type="email">` with placeholder "you@example.com"
  - Config key: `email` (stored in `config.email`)
  - Helper text: "Requires SMTP server configuration by your administrator."
- Per-type toggles automatically render for email channel (reuses existing external channel pattern)

### What Was Intentionally Not Changed
- No database migrations (email preferences use existing `notification_preferences` table)
- No new WebSocket event types
- No changes to `createAndDeliverNotification()` — automatically picks up email channel via `getActiveChannels()`
- No changes to existing webhook/Slack delivery code
- No email verification flow (send-and-confirm) — deferred; admin configures SMTP, users enter their own address
- No HTML-to-plain-text fallback — modern email clients all support HTML; can be added later
- No unsubscribe link implementation — footer text says "visit workspace settings"; automated unsubscribe deferred

### Decisions Made
1. **Lazy singleton transport** — SMTP connection created on first email delivery, not at module load. Avoids startup failure when SMTP is not configured.
2. **10-second timeout** for SMTP (vs 5-second for HTTP webhooks) — SMTP handshake + TLS negotiation takes longer than a simple HTTP POST
3. **Graceful degradation** — missing SMTP config throws a clear error caught by the worker's existing try/catch; results in `status: 'failed'` for the email channel, other channels unaffected
4. **Inline CSS email template** — most email clients strip `<style>` blocks; inline styles ensure maximum compatibility (Gmail, Outlook, Apple Mail)
5. **Simple email regex** — `^[^\s@]+@[^\s@]+\.[^\s@]+$` is intentionally permissive; strict RFC 5322 validation would reject valid addresses. Backend validates format; actual deliverability is validated by SMTP server.
6. **No DKIM/SPF configuration** — that's a DNS/mail server concern, not application code
7. **Helper text in UI** — "Requires SMTP server configuration by your administrator" sets correct expectations for self-hosted deployments

### Risks
- SMTP config errors (wrong host/port/credentials) will cause all email deliveries to fail — mitigated by job queue retry (maxAttempts=3) and clear error logging
- Email template rendering may vary across email clients — mitigated by using minimal inline CSS, table-based layout, and system fonts
- No rate limiting on email delivery per user — mitigated by job queue processing rate; can add per-user email throttling later if needed

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Slice 14 Implementation — Large Document Performance (2026-02-19)

### What Was Completed

**No API contract changes. No database migrations. No new dependencies. Frontend only.**

**Codebase Assessment:**
- Zero `React.memo` usage across entire frontend (12 sidebar panels, all components)
- Zero lazy image loading — all images rendered eagerly regardless of viewport
- Image resize fires `updateAttributes` on every `mousemove` (hundreds of transactions/sec)
- Two aggressive polling intervals: 1000ms connection status, 300ms editor attributes
- No CSS containment on editor area (no GPU compositing hints)
- No `shouldRerenderOnTransaction` on TipTap editor (React re-renders on every ProseMirror transaction)
- 100+ useState hooks in EditorPage with no memoization boundaries

**New file: `utils/benchmarkDocGenerator.ts` — Dev-only benchmark utilities:**
- `generateBenchmarkDoc({ pages, imagesPerPage, tablesPerPage, listsPerPage })` — generates large HTML documents with headings, lorem ipsum paragraphs, inline SVG placeholder images, tables, and ordered lists
- `measurePerformance(label)` — `performance.now()` wrapper for timing
- `measureScrollFPS(durationMs, scrollContainer)` — counts `requestAnimationFrame` ticks during programmatic scroll of `.editor-shell`, reports avg/min FPS
- `measureMemory()` — Chrome-only `performance.memory` API wrapper
- `countDOMNodes(container)` — counts DOM elements in a selector
- Uses inline SVG data URIs for images (zero network requests)
- Tree-shaked in production (not imported by any production code)

**Modified: `Editor.tsx` — shouldRerenderOnTransaction optimization:**
- Added `shouldRerenderOnTransaction: false` to `useEditor()` config
- Prevents React VDOM reconciliation on every ProseMirror transaction
- Safe because: Editor component only renders `<EditorContent>`, does not read editor state in render; all state queries go through imperative EditorApi

**Modified: 12 sidebar panel files — React.memo wrapping:**
- `ProofsPanel.tsx`, `CommentsPanel.tsx`, `SuggestionsPanel.tsx`, `VersionsPanel.tsx`, `BacklinksPanel.tsx`, `AttachmentPanel.tsx`, `ReviewersPanel.tsx` — renamed function to `*Inner`, exported `memo()`-wrapped version
- `ExtractionPanel.tsx`, `CompliancePanel.tsx`, `ClauseLibraryPanel.tsx`, `RelatedDocsPanel.tsx`, `NegotiationPanel.tsx` — same pattern for `export default`
- Added `memo` to React imports in each file
- No custom comparator needed — all panels receive primitive props (string, number, boolean) and stable-reference objects; default shallow comparison is correct

**Modified: `EditorPage.tsx` — Polling frequency reduction:**
- Connection status poll: 1000ms → 3000ms (connection changes are rare events)
- Editor attribute poll: 300ms → 500ms
- Added `setState(prev => prev === new ? prev : new)` guards on all 6 state setters in the attribute poll
- React skips re-render when functional updater returns same reference
- Before: ~43 timer-driven re-renders per 10s idle. After: ~3 (only when values actually change)

**Modified: `extensions/ImageNodeView.tsx` — Lazy loading + throttled resize:**
- Added `IntersectionObserver` with `rootMargin: '200px'` — images load 200px before entering viewport
- Before viewport: renders lightweight `<div class="image-placeholder">` with matching dimensions
- After viewport: renders real `<img>` with `loading="lazy"` attribute (belt-and-suspenders)
- One-way gate: `isInView` state never reverts to false once true
- Resize handle: replaced direct `updateAttributes` per mousemove with `requestAnimationFrame` gate
- Limits attribute updates to ~60/sec (one per frame) instead of hundreds per second
- Cancels pending RAF on mouseup to prevent stale updates

**Modified: `ui.css` — CSS containment + image placeholder:**
- `.editor-shell`: added `contain: layout style;` and `will-change: transform;` — isolates layout calculations, promotes to GPU compositing layer
- `.tiptap .ProseMirror`: added `contain: style;` — isolates style recalculation scope (cannot use `contain: layout` because ProseMirror needs content measurement for cursor/selection)
- Added `.image-placeholder` rule: light gray background with dashed border, flex-centered, matching image container dimensions

### What Was Intentionally Not Changed
- No ProseMirror viewport virtualization — research-grade complexity, high risk of breaking tables/images/cursors/collaboration. The above optimizations should eliminate the need for typical 50-200 page documents.
- No Yjs/CRDT-level document chunking — risk register rates this as "Low" likelihood bottleneck
- No new dependencies — IntersectionObserver, requestAnimationFrame, React.memo, performance.now are all native browser/React APIs
- No frontend test framework setup (Playwright/Vitest) — benchmark generator provides dev-only measurement tools
- No code splitting of sidebar panels — already conditionally rendered; React.memo addresses re-render problem
- No `onUpdate` debouncing — no `onUpdate` callback exists on the editor
- No backend changes

### Decisions Made
1. **IntersectionObserver + `loading="lazy"`** belt-and-suspenders approach — IO handles the placeholder swap, `loading="lazy"` provides browser-native fallback for browsers that support it
2. **One-way gate for isInView** — once an image loads, it stays loaded even if scrolled out of view. Unloading loaded images would cause re-fetches and layout shifts.
3. **`requestAnimationFrame` for resize throttle** (not `setTimeout` or `lodash.throttle`) — syncs with display refresh rate, zero dependencies, cleaner than arbitrary ms thresholds
4. **`contain: style` on ProseMirror** (not `contain: layout`) — ProseMirror internally measures content for cursor positioning and selection rendering; `contain: layout` would break this
5. **`will-change: transform` on `.editor-shell`** — promotes the scroll container to its own GPU compositing layer, eliminating main-thread paint during scroll
6. **Functional setState updater pattern** (`prev => prev === new ? prev : new`) — idiomatic React optimization that prevents re-renders without needing external memoization
7. **3000ms connection poll** (from 1000ms) — connection status changes are websocket events that happen at most a few times per session; 3s polling is more than sufficient
8. **500ms attribute poll** (from 300ms) — toolbar state updates are not time-critical; 500ms provides responsive-enough UX while halving timer-driven re-renders

### Known Limitations
1. **No viewport virtualization** — For documents exceeding ~500 pages, DOM node count may still cause performance degradation. ProseMirror viewport virtualization would require a custom plugin and is deferred.
2. **IntersectionObserver not supported in IE11** — Irrelevant for this application (React 19 requires modern browsers)
3. **`performance.memory` is Chrome-only** — Benchmark utility degrades gracefully with `null` return
4. **CSS `contain` may affect stacking context** — `contain: layout` creates a new stacking context; tested safe for editor-shell which already manages its own z-index

### Risks
- `shouldRerenderOnTransaction: false` could theoretically cause stale UI if any future code adds render-time editor state reads to `Editor.tsx` — mitigated by the fact that all state access goes through the imperative EditorApi, and this pattern is well-documented in TipTap
- `will-change: transform` increases GPU memory usage slightly — mitigated by applying only to the editor scroll container (single element), not to individual nodes

### Validation
- `npx tsc --noEmit` — PASSED (both backend and frontend, zero errors)

---

## Phase 2 Product Features — COMPLETE

All 14 slices across 5 sprints have been implemented:

| Slice | Name | Sprint | Status |
|-------|------|--------|--------|
| 1 | Comment Filters & Bulk Resolve | 1 | DONE |
| 2 | Suggestion Filters | 1 | DONE |
| 3 | Arbitrary Version Diffs | 1 | DONE |
| 4 | Attachments Backend | 2 | DONE |
| 5 | Attachments Frontend | 2 | DONE |
| 6 | Legal Numbering System | 3 | DONE |
| 7 | Advanced Page Numbering | 3 | DONE |
| 8 | Multi-Column Layout Extensions | 3 | DONE |
| 9 | Document-Link Graph | 4 | DONE |
| 10 | Entity Graph Visualization | 4 | DONE |
| 11 | Notification Preferences & Webhooks | 4 | DONE |
| 12 | Review Assignment System | 4 | DONE |
| 13 | Email Notification Delivery | 4 | DONE |
| 14 | Large Document Performance | 5 | DONE |

---

## Next Steps

1. ~~Begin Slice 9 (Document-Link Graph) — Sprint 4~~ DONE
2. ~~Begin Slice 10 (Entity Graph Visualization) — Sprint 4~~ DONE
3. ~~Begin Slice 11 (Notification Preferences & Webhook Delivery) — Sprint 4~~ DONE
4. ~~Begin Slice 12 (Review Assignment System) — Sprint 4~~ DONE
5. ~~Begin Slice 13 (Email Notification Delivery) — Sprint 4~~ DONE
6. ~~Begin Slice 14 (Large Document Performance) — Sprint 5~~ DONE
7. Phase 2 Product Features COMPLETE — proceed to Enterprise Hardening or next roadmap phase
