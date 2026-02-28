# Deferred Work Scope

Items explicitly deferred during implementation, tracked here for future prioritization.

---

## 1. Email Notification Infrastructure — RESOLVED

**Deferred from:** Document Intelligence — Slice 17 (Notifications Integration)
**Deferred on:** 2026-02-06
**Resolved on:** 2026-02-19
**Resolved by:** Phase 2 Product Features — Slice 13 (Email Notification Delivery)
**Original requirement:** "Email notification option (if configured)" — extraction reminders should optionally send email when enabled.

> **Resolution:** `nodemailer` (^8.0.1) installed as runtime dependency. Full SMTP transport in `notificationDeliverWorker.ts` with lazy singleton, HTML email templates, and per-user email preference in `notificationPreferences` store. SMTP config via `KACHERI_SMTP_HOST`, `KACHERI_SMTP_PORT`, `KACHERI_SMTP_SECURE`, `KACHERI_SMTP_USER`, `KACHERI_SMTP_PASS`, `KACHERI_SMTP_FROM`.

### Why Deferred

No email infrastructure exists anywhere in the codebase:
- No email library installed (nodemailer, SendGrid, Mailgun, etc.)
- No SMTP configuration or env variables
- No email service module
- No user email preference settings (opt-in/out)

Building email from scratch is a cross-cutting concern that affects more than just extraction reminders. It should be implemented as a shared service usable by all notification types (mentions, comment replies, doc shares, suggestions, reminders).

### Scope When Implemented

1. **Dependency:** Install `nodemailer` (or equivalent)
2. **Configuration:** Add SMTP env variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
3. **Email service module:** `KACHERI BACKEND/src/services/email.ts`
   - `sendEmail(to, subject, body)` — generic sender
   - `sendNotificationEmail(notification)` — formats notification as email
   - Graceful fallback when SMTP not configured (log + skip)
4. **User preferences:** Add `email_notifications` column to users table (boolean, default false)
5. **Integration points:** Wire into `createNotification()` or add post-notification hook
   - Check user preference before sending
   - Rate limit email sends (digest mode for high-frequency notifications)
6. **Templates:** HTML email templates for each notification type
7. **Affected notification types:** All — `mention`, `comment_reply`, `doc_shared`, `suggestion_pending`, `reminder`

### Current State

- In-app notifications work for all types (including `reminder` added in Slice 17)
- WebSocket real-time push works for all types
- Email is the only missing notification channel

### Dependencies

- None blocking other work
- Can be implemented independently at any time

### Estimated Effort

1-2 days (service + config + user preference + integration)

---

## 2. Graph Visualization for Knowledge Graph — RESOLVED

**Deferred from:** Cross-Document Intelligence — Slice 19 (Polish & Edge Cases)
**Deferred on:** 2026-02-08
**Resolved on:** 2026-02-19
**Resolved by:** Phase 2 Product Features — Slices 9 (Doc-Link Graph) & 10 (Entity Graph)
**Original requirement:** Roadmap Section 2.4 — "Wiki-style graph view of docs and their links, with filters by tag, folder, or status."

> **Resolution:** Two custom SVG force-directed graph components built with zero external dependencies: `DocLinkGraph.tsx` (document link visualization with zoom/pan/drag, click-to-navigate, filters) and `EntityGraph.tsx` (entity-relationship graph with 8 type colors, 6 relationship colors, edge opacity by strength). Both integrated into `WorkspaceKnowledgeExplorerPage` as tabbed views.

### Why Deferred

The current scope explicitly chose list/card views only. Graph visualization is a significant UI effort requiring a graph rendering library (e.g., D3.js, vis.js, or react-force-graph) and introduces a new dependency. The entity and relationship data model fully supports graph rendering — only the frontend visualization layer is missing.

### Scope When Implemented

1. **Dependency:** Install graph rendering library (e.g., `react-force-graph` or `d3-force`)
2. **Graph component:** `KACHERI FRONTEND/src/components/knowledge/KnowledgeGraphView.tsx`
   - Nodes = workspace entities (colored by type, sized by doc_count)
   - Edges = entity relationships (labeled, thickness by strength)
   - Click node → entity detail modal
   - Click edge → show evidence documents
3. **Filters:** By entity type, minimum relationship strength, entity search
4. **Layout:** Force-directed graph with zoom/pan
5. **Integration:** New tab on WorkspaceKnowledgeExplorerPage (list view vs graph view toggle)
6. **Performance:** Limit to top 200 entities by doc_count for rendering; full list available in table view

### Current State

- All backend data (entities, relationships, strengths, evidence) is available via existing API endpoints
- List/card views fully functional as interim solution
- WorkspaceKnowledgeExplorerPage is the integration point

### Dependencies

- Requires a new frontend dependency (graph rendering library) — needs approval per dependency policy

### Estimated Effort

3-5 days (library selection + graph component + filters + integration + performance tuning)

---

## 3. Vector Embeddings / External Search Engine

**Deferred from:** Cross-Document Intelligence — Architecture Decision
**Deferred on:** 2026-02-08
**Original requirement:** Enhanced semantic search beyond keyword matching + AI ranking.

### Why Deferred

SQLite FTS5 with AI ranking is sufficient for workspace-scale workloads (thousands of documents). Vector embeddings would require either an external service (Pinecone, Weaviate) or a new dependency (e.g., `better-sqlite3-vec`), adding infrastructure complexity. The current FTS5 pre-filter + AI synthesis pipeline delivers relevant results without embeddings.

### Scope When Implemented

1. **Approach A — External vector DB:** Integrate Pinecone/Weaviate/Qdrant for embedding storage and similarity search
2. **Approach B — SQLite vector extension:** Use `sqlite-vec` or similar for in-process vector search
3. **Embedding pipeline:** Generate embeddings on document extraction/import using OpenAI/Anthropic embedding models
4. **Search modification:** Replace FTS5 candidate stage with vector similarity search; keep AI synthesis stage
5. **Incremental indexing:** Embed new/modified documents on extraction completion
6. **Storage:** Embedding vectors per document chunk (not per entity)

### Current State

- FTS5 keyword search works for candidate retrieval (<500ms)
- AI synthesis provides semantic understanding on top of keyword candidates
- System works well for workspaces with up to ~10K documents

### Dependencies

- New dependency (vector DB client or SQLite extension)
- Embedding model API costs
- Storage increase for embedding vectors

### Estimated Effort

5-8 days (embedding pipeline + vector storage + search integration + migration)

---

## 4. Cross-Workspace Search

**Deferred from:** Cross-Document Intelligence — Constraint #8
**Deferred on:** 2026-02-08
**Original requirement:** Ability to search across multiple workspaces simultaneously.

### Why Deferred

All knowledge graph operations are strictly workspace-scoped by design. Cross-workspace search raises significant RBAC concerns (users must only see results from workspaces they have access to) and would require a fundamentally different query architecture (multi-workspace aggregation with permission filtering).

### Scope When Implemented

1. **Authorization model:** Define cross-workspace search permissions (e.g., org-level admin only, or users see results from all their workspaces)
2. **Query aggregation:** Search across multiple workspace FTS5 indexes or a unified index
3. **Result merging:** Deduplicate entities that appear in multiple workspaces
4. **RBAC filtering:** Ensure results only include documents/entities from authorized workspaces
5. **UI:** Cross-workspace search mode toggle in SemanticSearchBar
6. **Roadmap alignment:** Relates to Section 2.4 — "Cross-workspace link controls (if allowed) with strict RBAC honoring"

### Current State

- Each workspace has independent entity, mention, relationship, and FTS5 tables
- No cross-workspace queries exist in any module
- Workspace middleware enforces single-workspace scoping on all routes

### Dependencies

- Requires advanced RBAC model (roadmap Section 2.3)
- May require org-level entity deduplication

### Estimated Effort

5-8 days (auth model + query aggregation + RBAC filtering + UI)

---

## 5. Real-Time Entity Detection (As-You-Type)

**Deferred from:** Cross-Document Intelligence — Constraint #7
**Deferred on:** 2026-02-08
**Original requirement:** Detect and highlight entities in real-time as users type in the editor.

### Why Deferred

Entity detection currently only runs on extraction completion (after a document is processed by Document Intelligence). Real-time detection would require a lightweight NER (named entity recognition) model running client-side or a streaming backend endpoint, adding significant complexity and latency to the editing experience.

### Scope When Implemented

1. **Approach A — Client-side NER:** Use a lightweight WASM-based NER model (e.g., Compromise.js) for in-browser entity detection
2. **Approach B — Backend streaming:** Debounced backend calls to detect entities in changed paragraphs
3. **Editor integration:** Tiptap extension to highlight detected entities with colored underlines matching EntityChip colors
4. **Entity linking:** Click highlighted entity → show EntityDetailModal or create new entity
5. **Performance:** Must not degrade editor typing latency (<50ms response)
6. **Dedup:** Detected entities compared against workspace canonical entities for linking

### Current State

- Entities only created via extraction pipeline (POST /docs/:id/extract)
- Auto-index hook triggers on extraction completion
- No editor-level entity awareness

### Dependencies

- May require new dependency (NER library) — needs approval per dependency policy
- Tiptap extension development

### Estimated Effort

5-8 days (NER integration + Tiptap extension + entity linking + performance tuning)

---

## 6. N+1 Query Optimization in Knowledge Engine

**Deferred from:** Cross-Document Intelligence Audit — 2026-02-09
**Identified on:** 2026-02-09
**Issue:** Multiple knowledge engine modules reload the same extraction data independently, causing redundant SQLite reads.

### Why Deferred

Performance is acceptable at workspace scale (SQLite reads are fast, typically <1ms). Optimization adds code complexity without measurable user-facing improvement at current scale. Should be revisited if workspaces exceed ~10K documents or if search latency becomes a concern.

### Scope When Implemented

1. **Extraction cache:** Add a per-request extraction cache (Map<docId, Extraction>) shared across semanticSearch, relatedDocs, and relationshipDetector
2. **Evidence caching:** Cache `gatherEvidence()` results in relationshipDetector to avoid double-fetching during prompt building and relationship creation
3. **Candidate context sharing:** Pass enriched candidate objects between pipeline stages instead of re-fetching

### Affected Modules

- `KACHERI BACKEND/src/knowledge/semanticSearch.ts` (buildCandidateContext)
- `KACHERI BACKEND/src/knowledge/relatedDocs.ts` (aiRerank)
- `KACHERI BACKEND/src/knowledge/relationshipDetector.ts` (gatherEvidence)

### Current State

- Redundant reads occur but don't cause user-visible latency
- All modules function correctly

### Dependencies

- None

### Estimated Effort

0.5-1 day

---

## 7. Improved Entity Normalizer Scaling

**Deferred from:** Cross-Document Intelligence Audit — 2026-02-09
**Identified on:** 2026-02-09
**Issue:** Entity normalizer compares all pairs within each type (O(n^2)), capped at 500 entities per type. Entities beyond 500 in a single type are never compared for duplicates.

### Why Deferred

The 500 cap is sufficient for typical workspaces (<10K entities, <500 per type). The O(n^2) algorithm is fast for these sizes (125K comparisons × simple string operations). More efficient algorithms (e.g., LSH, blocking strategies) add complexity without benefit at current scale.

### Scope When Implemented

1. **Approach A — Blocking strategy:** Group entities by first N characters or phonetic key before pairwise comparison
2. **Approach B — LSH (Locality-Sensitive Hashing):** Hash entity names into buckets, only compare within same bucket
3. **Approach C — Incremental normalization:** Only compare new entities against existing corpus (avoid full O(n^2) rebuild)
4. **Remove 500 cap** or increase dynamically based on workspace size

### Current State

- Works correctly for workspaces with <500 entities per type
- Warns when cap is reached (console.warn)
- Entities beyond cap are still created and searchable, just not compared for duplicates

### Dependencies

- None (no new libraries needed for blocking/incremental approaches)

### Estimated Effort

1-2 days

---

## 8. Frontend Unit Tests for Knowledge Components

**Deferred from:** Cross-Document Intelligence — Slice 20 (Documentation & Testing)
**Deferred on:** 2026-02-09
**Original requirement:** Work scope Slice 20 specifies frontend component tests.

### Why Deferred

Backend tests were prioritized. Frontend components follow established patterns (same as ExtractionPanel, CompliancePanel) and were verified via TypeScript compilation and manual testing. Automated frontend tests should be added for regression safety.

### Scope When Implemented

1. **Test files to create:**
   - `KACHERI FRONTEND/src/components/knowledge/__tests__/EntityChip.test.tsx`
   - `KACHERI FRONTEND/src/components/knowledge/__tests__/RelatedDocsPanel.test.tsx`
   - `KACHERI FRONTEND/src/components/knowledge/__tests__/SemanticSearchBar.test.tsx`
   - `KACHERI FRONTEND/src/components/knowledge/__tests__/EntityDetailModal.test.tsx`
   - `KACHERI FRONTEND/src/pages/__tests__/WorkspaceKnowledgeExplorerPage.test.tsx`
2. **Coverage:** Render tests, user interaction (click, type, submit), loading/error/empty states, API mock responses
3. **Framework:** Match existing test setup (Vitest + React Testing Library assumed)

### Current State

- All components pass TypeScript compilation
- Manual verification checklist in session report
- No automated frontend tests yet

### Dependencies

- Frontend test infrastructure (Vitest + Testing Library) must be set up if not already present

### Estimated Effort

2-3 days

---

## 9. Enforce KACHERI_ADMIN_USERS Before Production Deployment

**Deferred from:** Security Hardening — Slice 3 (Global Endpoint Scoping)
**Deferred on:** 2026-02-21
**Severity:** HIGH — Must be resolved before production deployment

### Why Deferred

Slice 3 introduces a platform admin gate (`isPlatformAdmin()`) that restricts access to global admin endpoints (`/artifacts`, `/jobs`, `/ai/watch/*`). The gate reads from the `KACHERI_ADMIN_USERS` environment variable (comma-separated user IDs). When this env var is **not set**, the gate allows all authenticated users through — preserving the current open behavior for development workflows.

This is intentionally permissive in development but **must be locked down before production deployment**.

### Scope When Implemented

1. **Set `KACHERI_ADMIN_USERS`** in all production environment configurations (e.g., `.env.production`, deployment configs) with the list of platform admin user IDs
2. **Verify** that global endpoints return 403 for non-admin authenticated users
3. **Optional enhancement:** Change the default behavior from "allow all" to "deny all" when the env var is unset (flip the `PLATFORM_ADMINS.size === 0` check in `src/workspace/middleware.ts` from `return true` to `return false`)
4. **Roadmap alignment:** When Roadmap 2.3 (Advanced RBAC) is implemented, replace the env var gate with database-backed admin roles

### Affected Endpoints

- `GET /artifacts`, `GET /artifacts/stats`, `GET /artifacts/pending`, `GET /artifacts/failed`, `GET /artifacts/:id`, `DELETE /artifacts/:id`, `POST /artifacts/:id/verify`
- `GET /jobs`, `GET /jobs/stats`, `GET /jobs/:id`, `POST /jobs`, `DELETE /jobs/:id`, `POST /jobs/:id/retry`, `POST /jobs/cleanup`
- `GET /ai/watch/summary`, `GET /ai/watch/events`, `GET /ai/watch/exports-summary`, `GET /ai/watch/providers`, `GET /ai/watch/hotspots`

### Current State

- `isPlatformAdmin()` implemented in `src/workspace/middleware.ts`
- When `KACHERI_ADMIN_USERS` is set: only listed users can access global endpoints
- When `KACHERI_ADMIN_USERS` is unset: all authenticated users can access global endpoints (dev-friendly default)

### Dependencies

- None (can be done independently)
- Superseded by Roadmap 2.3 when implemented

### Estimated Effort

0.5 days (env config + verification)

