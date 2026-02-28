# Session Report: Pilot-Ready Scope Completion

**Date:** 2026-02-06
**Status:** COMPLETE
**Context:** Closing the 3 remaining gaps in Section 1.3 (Auth, RBAC & Sharing) to complete the Pilot-Ready Docs scope.

---

## Session Goal

Complete the Pilot-Ready Docs scope by implementing the 3 remaining gaps identified during the full audit:

1. **Gap 1 — User IDs missing from proofs & provenance:** Add actor/user tracking to proof and provenance records.
2. **Gap 2 — workspace_id missing from proofs & provenance:** Add workspace scoping to proof and provenance tables.
3. **Gap 3 — Doc-level permissions not enforced on routes:** Apply permission checks across all doc-scoped endpoints.

---

## Documents Read

| Document | Location | Status |
|----------|----------|--------|
| Architecture Blueprint | `Docs/blueprint/architecture blueprint.md` | Read |
| Roadmap | `Docs/Roadmap/docs roadmap.md` | Read |
| API Contract | `Docs/API_CONTRACT.md` | Read (first 200 lines + structure) |
| Enhancement Planning | `Docs/Roadmap/docs-enhancement-planning.md` | Read |
| Deferred Work Scope | `Docs/Roadmap/deferred-work-scope.md` | Read |
| Document Intelligence Session | `Docs/session-reports/2026-02-05-document-intelligence.md` | Read |
| View Original Session | `Docs/session-reports/2026-01-09-view-original-feature.md` | Read |

---

## Architecture & Roadmap Alignment

**Roadmap Section 1.3 (Pilot-Ready):**
> - Real authentication (e.g. OIDC/JWT) with stable user IDs used in proofs and provenance.
> - Workspace boundaries via workspace_id on docs, fs_nodes, proofs, provenance, artifacts.
> - Doc-level permissions: owner, editor, commenter, viewer, enforced on read/write/AI/export.

All 3 gaps are explicitly required by the roadmap for pilot readiness. No scope expansion.

**Architecture Alignment:**
- Backend-only changes (schema migration + route guards)
- No new frontend components required
- No new dependencies required
- Follows existing migration and middleware patterns

---

## Constraints & Assumptions

1. OIDC is NOT in scope — JWT-only auth is sufficient for pilot (OIDC is not listed as a hard requirement, roadmap says "e.g. OIDC/JWT")
2. Existing proofs/provenance rows will be backfilled with workspace_id from their linked docs
3. Permission enforcement uses existing `getEffectiveDocRole()` resolution logic
4. Export download endpoints need auth + permission checks added
5. No breaking API changes — only additive columns and new middleware

---

## Risks & Drift

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration on existing data | Low | Backfill workspace_id from docs table; actor columns nullable for existing rows |
| Route changes break frontend | Low | No response shape changes; only 403s added for unauthorized access |
| Performance of per-request permission checks | Low | Single DB query per request; can cache if needed later |

---

## Work Scope

### Gap 1: User IDs in Proofs & Provenance

**Current state:**
- `provenance.actor` is free text ("human", "ai", "system") — not a user ID
- `proofs` table has no user/actor column

**Required changes:**
- Add `actor_id TEXT` column to `provenance` table
- Add `created_by TEXT` column to `proofs` table
- Update all proof-creation call sites to pass authenticated user ID
- Update all provenance-creation call sites to pass authenticated user ID

### Gap 2: workspace_id on Proofs & Provenance

**Current state:**
- `proofs` and `provenance` only have `doc_id`
- Cannot query by workspace without joining through docs

**Required changes:**
- Add `workspace_id TEXT` column to `proofs` table
- Add `workspace_id TEXT` column to `provenance` table
- Add indexes on new columns
- Backfill existing rows from docs table
- Update all proof/provenance creation call sites to pass workspace_id

### Gap 3: Doc-Level Permission Enforcement

**Current state:**
- Permission model fully built (storage, 4 roles, resolution via `getEffectiveDocRole()`)
- Routes do NOT check doc-level permissions

**Required changes:**
- Create `assertDocAccess(req, docId, minRole)` guard function
- Apply to all doc-scoped routes:
  - `GET /docs/:id` — viewer+
  - `PATCH /docs/:id` — editor+
  - `DELETE /docs/:id` — owner
  - `POST /docs/:id/ai/*` — editor+
  - `POST /docs/:id/export/*` — viewer+
  - `GET /docs/:id/exports/*` — viewer+
  - `POST /docs/:id/comments` — commenter+
  - `GET /docs/:id/comments` — viewer+
  - `POST /docs/:id/versions` — editor+
  - `GET /docs/:id/versions` — viewer+
  - `POST /docs/:id/suggestions` — editor+
  - `GET /docs/:id/suggestions` — viewer+
  - `POST /docs/:id/extract` — editor+
  - `GET /docs/:id/extraction` — viewer+
  - `PATCH /docs/:id/extraction` — editor+
  - `GET /docs/:id/extraction/export` — viewer+
  - `POST /docs/:id/extraction/actions` — editor+
  - `GET /docs/:id/extraction/actions` — viewer+
  - `DELETE /docs/:id/extraction/actions/:actionId` — editor+
  - `GET /docs/:id/permissions` — viewer+
  - `POST /docs/:id/permissions` — owner
  - `GET /docs/:id/backlinks` — viewer+
  - `GET /docs/:id/doc-links` — viewer+
- Return 403 with `{ error: "forbidden", message: "Requires <role>+ access" }` when denied

---

## Implementation Progress

| Slice | Description | Status | Notes |
|-------|-------------|--------|-------|
| 1 | Database migration 005 (add columns + backfill) | Complete | `migrations/005_add_user_workspace_to_proofs_provenance.sql` |
| 2 | Shared `checkDocAccess`/`requireUser` in middleware.ts | Complete | Centralized in `workspace/middleware.ts` |
| 3 | Update proof/provenance creation functions | Complete | `provenance.ts`, `provenanceStore.ts`, `artifacts.ts` |
| 4 | Thread user/workspace context through all callers | Complete | All route files updated |
| 5 | Doc-level permission enforcement on all routes | Complete | 30+ routes guarded |
| 6 | Update API contract + session report | Complete | Data models + changelog updated |

**Overall Progress:** 6 / 6 slices — **COMPLETE**

---

## Implementation Log

### Slice 1: Migration 005
- Created `KACHERI BACKEND/migrations/005_add_user_workspace_to_proofs_provenance.sql`
- Added `created_by TEXT` to proofs, `actor_id TEXT` to provenance, `workspace_id TEXT` to both
- 4 indexes: `idx_proofs_workspace`, `idx_proofs_created_by`, `idx_prov_workspace`, `idx_prov_actor_id`
- Backfill `workspace_id` from docs table for existing rows

### Slice 2: Shared Middleware
- Added `requireUser()` and `checkDocAccess()` to `src/workspace/middleware.ts`
- Matches the pattern already copy-pasted in comments.ts, versions.ts, suggestions.ts, docLinks.ts, docPermissions.ts
- Existing local copies left in place (refactoring deferred to avoid scope creep)

### Slice 3: Proof/Provenance Creation Functions
- `provenance.ts` → `recordProvenance()`: added `actorId`/`workspaceId` params + INSERT columns
- `provenance.ts` → `recordProof()`: added `createdBy`/`workspaceId` params + INSERT columns
- `provenance.ts` → `writeProofPacket()`: both new-style and legacy INSERT branches updated
- `provenanceStore.ts` → `recordProof()`: dynamic column detection for `created_by`/`workspace_id`
- `store/artifacts.ts` → `createArtifact()`: added `createdBy`/`workspaceId` to `CreateArtifactInput`

### Slice 4: Thread Context Through All Callers
Files updated with `actorId`/`workspaceId` on `recordProvenance()` calls:
- `routes/ai/compose.ts`, `routes/ai/translate.ts`, `routes/ai/rewriteSelection.ts`
- `routes/ai/constrainedRewrite.ts`, `routes/ai/detectFields.ts`, `routes/ai.ts`
- `routes/extraction.ts` (POST /extract + PATCH /extraction)
- `server.ts` (all 13+ recordProvenance calls)

### Slice 5: Doc-Level Permission Enforcement
All doc-scoped routes now guarded with `checkDocAccess()`:

**server.ts (13 routes):**
- GET/PATCH /docs/:id, GET/PATCH /docs/:id/layout, DELETE /docs/:id
- POST /docs/:id/restore, DELETE /docs/:id/permanent
- POST /docs/:id/export/pdf, GET /docs/:id/exports/pdf/:file
- GET /docs/:id/exports/docx/:file, GET /docs/:id/exports
- GET/POST /docs/:id/provenance

**AI routes (6 files):**
- compose.ts, translate.ts, rewriteSelection.ts, constrainedRewrite.ts, detectFields.ts, ai.ts — all `editor+`

**extraction.ts (7 routes):**
- POST /extract → editor, GET /extraction → viewer, PATCH /extraction → editor
- GET /extraction/export → viewer, POST /extraction/actions → editor
- GET /extraction/actions → viewer, DELETE /extraction/actions/:actionId → editor

**exportDocx.ts:** POST /docs/:id/export/docx → viewer

**imageUpload.ts (4 routes):**
- POST /docs/:id/images → editor, GET /docs/:id/images/:filename → viewer
- DELETE /docs/:id/images/:filename → editor, GET /docs/:id/images → viewer

**importDoc.ts (2 routes):**
- GET /docs/:id/import/source → viewer, GET /docs/:id/import/meta → viewer

### Slice 6: Documentation
- Updated `ProofPacket` data model with `created_by`, `workspace_id` fields
- Updated `ProvenanceEntry` data model with `actor_id`, `workspace_id` fields
- Added v1.13.0 changelog entry documenting all permission enforcement

### Decisions Made
1. Combined Slices 4 & 5 per-file for efficiency (same files touched)
2. `DELETE /docs/:id` uses `editor` role (soft delete); `DELETE /docs/:id/permanent` uses `owner`
3. Export download routes (PDF/DOCX file serving) use `viewer` — you can view exports if you can view the doc
4. `POST /docs/import` (no docId) left without doc-level check — it creates a new doc
5. `GET /images/:imageId` (global, no doc context) left unguarded — restricting would break image rendering

---

*This session report is the authoritative tracker for Pilot-Ready completion work.*
*Status: COMPLETE — All 3 gaps in Section 1.3 have been addressed.*
