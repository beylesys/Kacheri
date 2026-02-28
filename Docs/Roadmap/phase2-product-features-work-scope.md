# Phase 2 Product Features — Full Work Scope

**Created:** 2026-02-19
**Status:** PLANNING
**Phase:** Phase 2 Prod-Ready (from docs roadmap.md, Sections 2.1, 2.2, 2.4 (partial — semantic search already complete from Cross-Doc Intelligence; cross-workspace links deferred), 2.8)
**Prerequisite:** Pilot-Ready Scope (complete), Document Intelligence (complete), Compliance Checker (complete), Clause Library (complete), Cross-Document Intelligence (complete), Redline/Negotiation AI (complete)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature A: Editor & Layout Extras](#feature-a-editor--layout-extras)
3. [Feature B: Collaboration Depth](#feature-b-collaboration-depth) (incl. B5: Review Assignments)
4. [Feature C: Document Attachments](#feature-c-document-attachments)
5. [Feature D: Knowledge Graph & Doc-Link Visualization](#feature-d-knowledge-graph-visualization) (incl. D0: Doc-Link Graph)
6. [Shared Infrastructure](#shared-infrastructure)
7. [Execution Order — Slice Map](#execution-order--slice-map) (14 slices, 5 sprints)
8. [Deferred to Enterprise Hardening](#deferred-to-enterprise-hardening)

---

## Executive Summary

This work scope covers the **product-facing features** from Phase 2 (Prod-Ready) of the docs roadmap. Enterprise hardening items (RBAC groups, SCIM, S3 storage, verify:nightly, accessibility, mobile) are explicitly deferred — their existing base is verified solid and requires no refactoring before these product features are built.

**What we're building:**
- **Editor power features** — Legal numbering, multi-column layouts, advanced page numbering, large-doc performance
- **Collaboration polish** — Comment filters, arbitrary version diffs, bulk operations, notification webhooks, **review assignments**
- **Document attachments** — Per-doc file attachments with inline viewer, proofs, RBAC, and workspace-level limits
- **Knowledge graph & doc-link visualization** — Interactive **document-link graph** (wiki-style doc map) + **entity-relationship graph** across the workspace

**What's already complete (from prior phases):**
- Semantic search layer (Roadmap 2.4) — fully implemented in Cross-Document Intelligence phase

**What we're NOT building (deferred):**
- Group-based RBAC, SCIM, legal hold (Roadmap 2.3)
- S3/GCS storage abstraction, verify:nightly (Roadmap 2.5)
- Accessibility, mobile, offline hardening (Roadmap 2.7)
- AI Safety UX polish (Roadmap 2.6 — already 90% complete)
- Cross-workspace link controls (Roadmap 2.4 — pending real user validation)

---

# Feature A: Editor & Layout Extras

## Roadmap Reference
> Docs Roadmap Section 2.1

## Vision

Elevate the editor from "good enough" to best-in-class for legal and enterprise document authoring. Legal numbering, rich multi-column layouts, and large-document performance are the three capabilities most frequently demanded by legal teams evaluating document platforms.

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| `OrderedListEnhanced.ts` extension | Add full legal numbering patterns (1.01, 1.1.1, a, b, i, ii) |
| `ColumnSection.ts` extension | Extend from 1-2 columns to 2-3+ with section-specific config |
| `SectionBreak.ts` extension | Add per-section headers/footers and orientation overrides |
| `PageSetupDialog.tsx` | Add page numbering format picker (decimal, roman, alpha) |
| `exportDocx.ts` route | Export fidelity for legal numbering, columns, advanced page numbers |
| TipTap `useEditor` in `Editor.tsx` | Editor performance profiling and virtualization for large docs |

## A1: Legal Numbering System

### Current State
- `OrderedListEnhanced.ts` supports two styles: `decimal` (1, 2, 3) and `outline` (uses CSS counters with `legal-numbering` class)
- StarterKit's default OrderedList is disabled in favor of the enhanced version
- No support for mixed patterns (1.01, 1.1.1), lettered sub-levels (a, b, c), or roman numerals (i, ii, iii)

### What to Build

**Extension changes (`OrderedListEnhanced.ts`):**
- Add `numberingStyle` options: `decimal`, `outline`, `legal`, `alpha-lower`, `alpha-upper`, `roman-lower`, `roman-upper`
- `legal` style produces deep hierarchical numbering: `1` → `1.1` → `1.1.1` → `1.1.1.1`
- Each nesting level can independently choose its numbering format
- CSS counters generate the composite label (e.g., "Section 1.2.3(a)")
- Attribute: `numberingStyle`, `startFrom` (override start number), `prefix` (e.g., "Section"), `suffix` (e.g., ".")

**Toolbar UI:**
- Numbering style dropdown in list formatting toolbar
- Preview of each style inline
- "Continue from previous" / "Restart at" toggle

**Export fidelity (`exportDocx.ts`):**
- Map CSS counter patterns to DOCX numbering definitions
- Preserve legal numbering hierarchy in exported DOCX
- Handle roman/alpha sub-levels in DOCX numbering XML

### Database/Schema Changes
None. Numbering is stored as HTML attributes in document content (Yjs).

### API Contract Changes
None. Document content is opaque HTML/Yjs — no API changes required.

---

## A2: Multi-Column Layouts (2-3+ Columns)

### Current State
- `ColumnSection.ts` exists with `columns` attribute (default: 2)
- Commands: `wrapInColumns()`, `unwrapColumns()`, `toggleColumns()`, `setColumnCount()`
- HTML: `<div class="kacheri-columns" data-columns="2">`
- `SectionBreak.ts` exists with `columns` attribute (default: 1)
- CSS renders columns via `column-count` property

### What to Build

**Extension changes (`ColumnSection.ts`):**
- Extend `columns` to support 3-4 column layouts
- Add `columnGap` attribute (narrow/medium/wide or exact px value)
- Add `columnRule` attribute (none/thin/medium — vertical separator line)
- Per-column width ratios for asymmetric layouts (e.g., 2:1, 1:1:1, 1:2:1)

**Section-specific headers/footers (`SectionBreak.ts`):**
- Add `headerHtml` and `footerHtml` attributes per section
- Section breaks create distinct regions with independent header/footer content
- First-page-different option per section

**Toolbar UI:**
- Column count selector (1-4) in toolbar
- Column settings popover (gap, rule, width ratios)
- Section break insertion with layout options

**Export fidelity:**
- Map column layouts to DOCX section properties
- DOCX `<w:cols>` element with column count and spacing
- Section-specific headers/footers map to DOCX `<w:sectPr>` boundaries

### Database/Schema Changes
None. Stored as HTML attributes in document content.

### API Contract Changes
None.

---

## A3: Advanced Page Numbering

### Current State
- `PageSetupDialog.tsx` exists with page size, margins, orientation, header/footer content
- Page numbering is a `showPageNumbers` boolean toggle in `FooterSettings` interface — no format selection, no placeholder token system
- No roman numeral or section-based numbering
- Backend export reads page setup from document metadata

### What to Build

**Frontend (`PageSetupDialog.tsx`):**
- Page number format picker: `1, 2, 3` | `i, ii, iii` | `I, II, III` | `a, b, c` | `A, B, C`
- "Start at" override (e.g., start from page 5)
- Section-based page numbering reset (restart at 1 per section)
- Position picker: header-left, header-center, header-right, footer-left, footer-center, footer-right

**Backend export (`exportDocx.ts`):**
- Map format to DOCX `<w:numFmt>` (decimal, lowerRoman, upperRoman, lowerLetter, upperLetter)
- Support `<w:pgNumType w:start="...">` for custom start numbers
- Per-section page number resets via `<w:sectPr>` boundaries

### Database/Schema Changes
None. Page setup metadata stored in document `meta_json` field.

### API Contract Changes
None.

---

## A4: Large Document Performance

### Current State
- Editor loads full document content into TipTap/ProseMirror DOM
- Yjs syncs the entire document state
- No virtualization, lazy loading, or chunking
- Works fine for typical documents (1-20 pages), untested for 100+ pages

### What to Build

**Assessment first (before implementation):**
- Create benchmark documents (50, 100, 200 pages) with tables, images, and lists
- Profile: initial load time, scroll performance, memory consumption, Yjs sync overhead
- Identify specific bottlenecks (DOM size? Yjs update overhead? Re-render cycles?)

**Potential strategies (pick based on profiling):**
1. **ProseMirror viewport virtualization** — Only render visible blocks in the DOM; placeholder heights for off-screen content
2. **Lazy image loading** — Use `loading="lazy"` and IntersectionObserver for images
3. **Document chunking** — Split very large docs into logical sections that load on demand
4. **Debounced re-renders** — Throttle TipTap's `onUpdate` callback frequency
5. **React.memo boundaries** — Prevent sidebar panels from re-rendering on every keystroke

**Big-doc regression tests:**
- Automated test that creates a 100-page doc and measures load + scroll + edit latency
- Threshold: initial load < 3s, scroll FPS > 30, no memory leak over 5 minutes

### Database/Schema Changes
None.

### API Contract Changes
None.

---

# Feature B: Collaboration Depth

## Roadmap Reference
> Docs Roadmap Section 2.2

## Vision

Take the existing comment/suggestion/version infrastructure from "functional" to "delightful." Enterprise users with 50+ comments per document need filters, bulk operations, and smart notifications — not just a linear list.

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| `GET /docs/:id/comments` route | Add author, dateRange, mentionsMe, unresolved-only filters |
| `GET /docs/:id/suggestions` route | Add changeType, dateRange filters |
| `GET /docs/:id/versions` route | Add creator, dateRange, search-by-name filters |
| `GET /docs/:id/versions/:versionId/diff` | Already supports `compareWith` param — extend frontend UI |
| `store/comments.ts` | Add bulk resolve function |
| `store/notifications.ts` | Add webhook delivery worker |
| `CommentsPanel.tsx` frontend | Add filter bar, bulk actions |
| `SuggestionsPanel.tsx` frontend | Add filter bar |
| `VersionsPanel.tsx` frontend | Add comparison picker UI |

## B1: Comment Filters & Bulk Operations

### Current State
- Backend `ListCommentsOptions`: `includeDeleted`, `includeResolved`, `threadId`
- No author filter, no date range, no search, no pagination
- No bulk resolve endpoint
- Frontend shows a flat list with resolve/reopen per thread

### What to Build

**Backend (`routes/comments.ts` + `store/comments.ts`):**

New query parameters for `GET /docs/:id/comments`:
- `authorId` (string) — filter by comment author
- `mentionsUser` (string) — filter comments that @mention a specific user
- `unresolvedOnly` (boolean) — shortcut for includeResolved=false
- `from` / `to` (integer, epoch ms) — date range filter
- `search` (string) — full-text search in comment content
- `limit` / `offset` (integer) — pagination (default 100, max 200)
- `sortBy` (string) — `created_at_asc` | `created_at_desc` (default: asc)

New endpoint:
```
POST /docs/:id/comments/bulk-resolve
Body: { threadIds?: string[] }  // if empty, resolve all unresolved
Response: { resolved: number }
```

**Frontend (`CommentsPanel.tsx`):**
- Filter bar at top: author dropdown, unresolved toggle, search input
- "Resolve All" button (calls bulk-resolve)
- Comment count badge updates with filter context
- Pagination or infinite scroll for large comment sets

### API Contract Update
Add to Comment Endpoints section:
- Updated query params for `GET /docs/:id/comments`
- New `POST /docs/:id/comments/bulk-resolve` endpoint

---

## B2: Suggestion Filters

### Current State
- Backend `ListSuggestionsOptions`: `status`, `authorId`, `limit`, `offset` — already good
- No `changeType` filter (insert/delete/replace)
- No date range filter
- Frontend has basic filter toggles

### What to Build

**Backend (`routes/suggestions.ts` + `store/suggestions.ts`):**

New query parameters for `GET /docs/:id/suggestions`:
- `changeType` (string) — filter by `insert`, `delete`, or `replace`
- `from` / `to` (integer, epoch ms) — date range filter

**Frontend (`SuggestionsPanel.tsx`):**
- Add change type filter chips (Insert | Delete | Replace | All)
- Date range picker (optional — may be overkill for MVP)

### API Contract Update
Add `changeType`, `from`, `to` to Suggestion Endpoints query params.

---

## B3: Arbitrary Version Diffs

### Current State
- Backend: `GET /docs/:id/versions/:versionId/diff?compareWith=<versionNumber>` already works
- Frontend: `VersionDiffModal` shows diff between a selected version and current doc
- User cannot pick two arbitrary historical versions to compare

### What to Build

**Frontend only (`VersionsPanel.tsx` + `VersionDiffModal.tsx`):**
- "Compare" mode: user selects two versions from the list
- "Compare" button opens diff modal with both version IDs
- Dropdown pickers: "Compare version X with version Y"
- The backend already supports this — purely a frontend UI change

### API Contract Update
None — endpoint already supports arbitrary comparison.

---

## B4: Email/Slack Notification Webhooks

### Current State
- `store/notifications.ts`: in-app notifications with WebSocket push
- Types: `mention`, `comment_reply`, `doc_shared`, `suggestion_pending`, `reminder`
- No external delivery (email, Slack, webhooks)
- No user notification preferences

### What to Build

**Backend:**

New migration — notification preferences:
```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  channel TEXT NOT NULL,            -- 'in_app', 'email', 'slack', 'webhook'
  notification_type TEXT NOT NULL,  -- 'mention', 'comment_reply', 'doc_shared', 'suggestion_pending', 'reminder', 'all'
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,                 -- channel-specific config (email address, slack channel, webhook URL)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, workspace_id, channel, notification_type)
);
```

New routes:
```
GET    /workspaces/:id/notification-preferences
PUT    /workspaces/:id/notification-preferences
```

New job type — `notification:deliver`:
- Reads notification + user preferences
- Dispatches to configured channels
- For email: uses configurable SMTP transport (Nodemailer)
- For Slack: uses incoming webhook URL (no SDK dependency — plain HTTP POST)
- For webhook: POST to user-configured URL with notification payload

**Dependency decision required:**
- Email: `nodemailer` (well-established, MIT, no external service required)
- Slack: No dependency — use native `fetch()` to Slack incoming webhook URL
- Alternative: defer email/Slack to a later slice and implement webhook-only first

**Frontend:**
- Notification preferences page in workspace settings
- Per-channel toggles (in-app, email, Slack, webhook)
- Per-type toggles (mentions, replies, shares, suggestions)

### API Contract Update
Add Notification Preferences endpoints.

---

## B5: Review Assignment & Notifications

### Roadmap Alignment
> Roadmap 2.2: "Notification hooks/integrations (email/Slack) for mentions **and review assignments**."

### Current State
- No review assignment concept exists in the codebase
- No `reviewer`, `assigned_to`, `assignee`, or review queue anywhere in routes or store files
- Related but distinct concepts exist: `flag_review` action in extraction (posts a comment), negotiation session `reviewing` status

### What to Build

**Database schema — new `doc_reviewers` table:**
```sql
CREATE TABLE IF NOT EXISTS doc_reviewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,             -- the reviewer
  assigned_by TEXT NOT NULL,         -- who assigned them
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'in_review', 'completed'
  assigned_at INTEGER NOT NULL,
  completed_at INTEGER,
  notes TEXT,                        -- optional reviewer notes on completion
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  UNIQUE(doc_id, user_id)           -- one assignment per user per doc
);

CREATE INDEX idx_doc_reviewers_doc ON doc_reviewers(doc_id);
CREATE INDEX idx_doc_reviewers_user ON doc_reviewers(user_id, workspace_id);
```

**Backend (`store/docReviewers.ts` + `routes/docReviewers.ts`):**

New endpoints:
```
POST /docs/:id/reviewers
Body: { userId: string }
Auth: editor+ on doc
Response 201: { reviewer: { id, docId, userId, assignedBy, status, assignedAt } }
Side effects: creates `review_assigned` notification, audit log entry

GET /docs/:id/reviewers
Auth: viewer+ on doc
Response 200: { reviewers: [...], count: number }

PATCH /docs/:id/reviewers/:userId
Body: { status: 'in_review' | 'completed', notes?: string }
Auth: the reviewer themselves or editor+ on doc
Response 200: { reviewer: { ... } }

DELETE /docs/:id/reviewers/:userId
Auth: editor+ on doc (or the reviewer can remove themselves)
Response 200: { deleted: true }
```

**New notification type:**
- Add `review_assigned` to notification types (alongside `mention`, `comment_reply`, `doc_shared`, `suggestion_pending`, `reminder`)
- Fires when `POST /docs/:id/reviewers` is called
- Includes doc title, assigner name, doc link

**WebSocket event:**
- Extend existing `notification` event type — `review_assigned` notifications push via the existing WebSocket notification pipeline

**Frontend:**
- Reviewer list in document sidebar (or share dialog extension)
- "Assign Reviewer" button (visible to editor+ users)
- User picker for reviewer selection
- Reviewer status badges: Pending / In Review / Completed
- Reviewer can update their status (start review, mark complete with optional notes)
- Review assignment appears in notification feed

### API Contract Update
Add Document Reviewer endpoints to the contract.

---

# Feature C: Document Attachments

## Roadmap Reference
> Docs Roadmap Section 2.8

## Vision

Allow documents to have file attachments (PDFs, images, reference documents) that can be viewed without conversion. This solves the "single window" need where users want to reference original files alongside editable content without importing/converting them.

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| `routes/imageUpload.ts` | Same upload pattern (multipart, MIME validation, direct local FS write via `fs.writeFile`, proof recording) |
| `store/artifacts.ts` | Attachment metadata follows artifact storage pattern. Note: `StorageProvider` is a type alias (`"local" | "s3" | "gcs"`) labeling proof records — not a working storage abstraction. No cloud storage client exists. `updateStorageLocation()` is metadata-only. |
| `recordProof()` in provenance.ts | SHA256 hashing + provenance for attachments |
| `checkDocAccess()` middleware | RBAC enforcement (viewer+ read, editor+ upload/delete) |
| `wsBroadcast()` | New `attachment` event type for real-time panel updates |
| Editor sidebar panel pattern | New `AttachmentPanel.tsx` following CommentsPanel pattern |

## Database Schema

### doc_attachments

```sql
CREATE TABLE IF NOT EXISTS doc_attachments (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  filename TEXT NOT NULL,                     -- original filename (sanitized)
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',  -- 'local' for now; tagged for future S3/GCS migration
  storage_key TEXT NOT NULL,                  -- relative path: storage/attachments/doc-{id}/{nanoid}.{ext}
  sha256 TEXT NOT NULL,                       -- hex digest of file content
  uploaded_by TEXT NOT NULL,                  -- user_id
  uploaded_at INTEGER NOT NULL,
  deleted_at INTEGER,                         -- soft delete
  metadata_json TEXT,                         -- optional: page count (PDF), dimensions (image), etc.
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);

CREATE INDEX idx_doc_attachments_doc ON doc_attachments(doc_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_attachments_workspace ON doc_attachments(workspace_id);
```

### Storage approach
Attachment upload follows the same direct local-filesystem pattern as `imageUpload.ts` (write via `fs.writeFile`, read via `fs.readFile`). Records are tagged with `storage_provider='local'` for future S3/GCS migration during the Enterprise Hardening phase. No cloud storage abstraction is built in this phase.

### Limits enforcement
- Max attachments per doc: 20 (configurable via `KACHERI_MAX_ATTACHMENTS_PER_DOC`)
- Max total size per doc: 100MB (configurable via `KACHERI_MAX_ATTACHMENT_SIZE_PER_DOC`)
- Max single file: 25MB (configurable via `KACHERI_MAX_ATTACHMENT_FILE_SIZE`)
- Max total attachment storage per workspace: 1GB (configurable via `KACHERI_MAX_ATTACHMENT_SIZE_PER_WORKSPACE`) — per roadmap 2.8 "size limits per workspace"

## Supported MIME Types

| Format | MIME Type | Viewer |
|---|---|---|
| PDF | `application/pdf` | Inline `<iframe>` or pdf.js |
| PNG | `image/png` | `<img>` tag |
| JPG | `image/jpeg` | `<img>` tag |
| GIF | `image/gif` | `<img>` tag |
| WebP | `image/webp` | `<img>` tag |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Icon + download |
| XLSX | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Icon + download |
| PPTX | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Icon + download |

## API Endpoints

### Upload Attachment
```
POST /docs/:id/attachments
Content-Type: multipart/form-data
Field: file (binary)

Auth: editor+ on doc
Rate limit: 10 uploads/minute/user

Response 201:
{
  "attachment": {
    "id": "abc123",
    "docId": "doc-xyz",
    "filename": "reference-contract.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 245678,
    "sha256": "a1b2c3...",
    "uploadedBy": "user_123",
    "uploadedAt": 1708300800000,
    "metadata": { "pageCount": 12 }
  },
  "proof": { "id": 45, "hash": "sha256:..." }
}

Errors:
  400: File missing, invalid MIME type
  403: Requires editor role
  413: File too large / attachment limit reached
```

### List Attachments
```
GET /docs/:id/attachments

Auth: viewer+ on doc

Response 200:
{
  "attachments": [ ... ],
  "totalSize": 1245678,
  "count": 3,
  "limits": { "maxCount": 20, "maxTotalBytes": 104857600 }
}
```

### Download/View Attachment
```
GET /docs/:id/attachments/:attachmentId/file

Auth: viewer+ on doc
Headers: Content-Type (from stored MIME), Content-Disposition: inline
Cache: public, max-age=31536000, immutable (content-addressed)
```

### Delete Attachment
```
DELETE /docs/:id/attachments/:attachmentId

Auth: editor+ on doc (or uploader can delete own)

Response 200:
{ "deleted": true }
```

## WebSocket Events

```typescript
| attachment: {
    action: 'uploaded' | 'deleted',
    docId: string,
    attachmentId: string,
    filename: string,
    uploadedBy: string,
    ts: number
  }
```

## Frontend Components

### AttachmentPanel.tsx (Sidebar)
- Collapsible sidebar panel (follows CommentsPanel pattern)
- Upload dropzone area at top
- File list with thumbnail previews (images) / icons (office docs)
- Per-file actions: View, Download, Delete
- Storage usage bar (e.g., "3.2 MB / 100 MB used")
- Empty state with upload prompt

### AttachmentViewer.tsx (Modal/Overlay)
- PDF: inline viewer using native `<iframe>` with `#toolbar=0` or pdf.js
- Images: centered image with zoom controls
- Office docs: download prompt with file icon
- Close button, filename display, file metadata

---

# Feature D: Knowledge Graph Visualization

## Roadmap Reference
> Docs Roadmap Section 2.4

## Vision

Transform the existing entity data (person, organization, date, amount, location, product, term, concept) into an interactive visual graph that reveals hidden connections across workspace documents.

## Roadmap 2.4 Coverage Note

Roadmap Section 2.4 contains three items:
1. **Wiki-style graph view of docs and their links** → Covered by D0 (doc-link graph) below
2. **Cross-workspace link controls** → Deferred (D2) — pending real user validation
3. **Semantic search layer on top of cross-doc indexes, grounded in proofs** → **Already fully implemented** in the Cross-Document Intelligence phase. Backend: `knowledge/semanticSearch.ts` (4-step NL search pipeline with AI term extraction → FTS5 candidates → context gathering → AI synthesis). Frontend: `SemanticSearchBar.tsx` + `SearchAnswerPanel.tsx` (dual-mode semantic/quick search with citation rendering). Not re-scoped here.

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| `doc_links` table (baseline schema) | Read-only data source for doc-link graph edges |
| `docs` table | Read-only data source for doc-link graph nodes |
| `workspace_entities` table | Read-only data source for entity graph nodes |
| `entity_relationships` table | Read-only data source for entity graph edges |
| `entity_mentions` table | Used for entity node sizing (mention count) and drill-down |
| `GET /workspaces/:id/knowledge/entities` | Data API for entity graph nodes |
| `GET /workspaces/:id/knowledge/relationships` | Data API for entity graph edges |
| `GET /docs` (workspace-scoped) | Data API for doc-link graph nodes |
| `GET /docs/:id/links` | Data API for doc-link graph edges |
| `WorkspaceKnowledgeExplorerPage.tsx` | Add graph views to existing unified layout |
| `EntityChip.tsx`, `EntityDetailModal.tsx` | Reuse for entity graph node interaction |

---

## D0: Document-Link Graph Visualization

### Roadmap Alignment
> Roadmap 2.4: "Wiki-style graph view of docs and their links, with filters by tag, folder, or status."

### Current State
- `doc_links` table exists in baseline schema (`001_baseline_schema.sql`) with `from_doc_id`, `to_doc_id`, `workspace_id`
- WebSocket events for `doc_link` (single create/delete) and `doc_links` (bulk sync) already exist
- `GET /docs/:id/links` endpoint returns doc links for a document
- No graph visualization of document relationships exists

### What to Build

**Frontend only — no new backend work required.**

**New component (`DocLinkGraph.tsx`):**
- Interactive force-directed graph where nodes = documents and edges = doc_links
- Nodes colored by folder membership or document status
- Node size scaled by link count (inbound + outbound)
- Edge direction arrows showing link directionality
- Click node → navigate to document
- Hover node → tooltip with doc title, folder path, link count
- Click edge → show link context (which doc references which)

**Integration into `WorkspaceKnowledgeExplorerPage.tsx`:**
- The page currently renders a single unified view (SemanticSearchBar, stats, entity chips, entity table — no tabs)
- Refactor into a tabbed layout with three tabs: **Documents** (doc-link graph), **Entities** (entity graph, D1), **Explorer** (existing search + entity table view)
- Or add as a collapsible "Document Map" section above the existing layout

**Filters:**
- Folder filter (show docs from specific folders)
- Status filter (if doc status exists)
- Minimum link count slider (hide orphan documents)
- Search-to-focus (type doc title → graph centers on it)

**Data source:**
- Fetch all workspace docs + their links via existing APIs
- Build adjacency list client-side
- Reuses the same graph library as D1 (recommended: `@xyflow/react`)

### Database/Schema Changes
None.

### API Contract Changes
None — uses existing doc and doc_links endpoints.

---

## D1: Interactive Entity Graph View

### What to Build

**Frontend (`WorkspaceKnowledgeExplorerPage.tsx`):**
- New "Entities" tab (or section) in the refactored page layout — the current page is a single unified view with SemanticSearchBar, stats bar, entity type chips, top entities, recent queries, filter bar, and paginated entity table
- Interactive force-directed graph using a visualization library
- Nodes = entities (sized by mention count, colored by type)
- Edges = relationships (labeled by type, weighted by strength)
- Zoom, pan, drag nodes
- Click node → shows EntityDetailModal (existing)
- Click edge → shows relationship details with source documents

**Dependency required:**
- **Option A: `@xyflow/react` (React Flow)** — MIT, 20K+ stars, React-native, good for node-based UIs
- **Option B: `cytoscape.js`** — MIT, 10K+ stars, canvas-based, better for large graphs
- **Option C: `d3-force` + custom SVG** — No dependency, most control, most work
- **Recommended: `@xyflow/react`** — best React integration, active maintenance, handles 500+ nodes well

### Filters
- Entity type checkboxes (show/hide person, organization, etc.)
- Relationship type checkboxes
- Minimum connection count slider (hide lightly-connected nodes)
- Document scope filter (show entities from specific docs/folders)
- Search-to-focus (type entity name → graph centers on it)

### API Changes
None — existing knowledge endpoints provide all needed data. May add a dedicated graph-optimized endpoint later if performance requires it:
```
GET /workspaces/:id/knowledge/graph?entityTypes=person,organization&minConnections=2&limit=200
```

---

## D2: Cross-Workspace Link Controls

### Current State
- All knowledge graph data is workspace-scoped
- No cross-workspace entity references exist
- Doc links (`doc_links` table) are workspace-internal

### What to Build

**This is primarily a policy/RBAC feature, not a visualization feature.**

- Workspace setting: `allow_cross_workspace_links` (boolean, default: false)
- When enabled: entity search can return results from other workspaces the user has access to
- Cross-workspace results are clearly labeled and require viewer+ access on the source workspace
- Link creation across workspaces requires editor+ on both sides

**Deferred until cross-workspace use cases are validated by real users.**

---

# Shared Infrastructure

## New Migration Files

Following the existing one-purpose-per-migration pattern (001–009):

```
KACHERI BACKEND/migrations/010_add_doc_attachments.sql        (Sprint 2)
KACHERI BACKEND/migrations/011_add_notification_preferences.sql (Sprint 4)
KACHERI BACKEND/migrations/012_add_doc_reviewers.sql           (Sprint 4)
```

Contents:
- `010`: `doc_attachments` table + indexes
- `011`: `notification_preferences` table + indexes
- `012`: `doc_reviewers` table + indexes

## New WebSocket Event Types

Add to `realtime/types.ts`:
```typescript
| attachment: { action: 'uploaded' | 'deleted', docId, attachmentId, filename, uploadedBy, ts }
```

## New Job Types

Add to `jobs/types.ts`:
```typescript
| "notification:deliver"
```

---

# Execution Order — Slice Map

Slices are ordered for maximum early value delivery with minimal cross-dependencies.

## Sprint 1: Quick Wins (Collaboration Polish)

### Slice 1 — Comment Filters & Bulk Resolve
- **Backend:** Add query params to `GET /docs/:id/comments` (authorId, mentionsUser, unresolvedOnly, from, to, search, limit, offset, sortBy)
- **Backend:** Add `POST /docs/:id/comments/bulk-resolve` endpoint
- **Backend:** Update `store/comments.ts` list function with new filter options
- **Frontend:** Add filter bar to CommentsPanel (author dropdown, unresolved toggle, search)
- **Frontend:** Add "Resolve All" button
- **API Contract:** Update Comment Endpoints section
- **Tests:** Filter combinations, bulk resolve correctness, permission checks

### Slice 2 — Suggestion Filters
- **Backend:** Add `changeType`, `from`, `to` query params to `GET /docs/:id/suggestions`
- **Backend:** Update `store/suggestions.ts` list function
- **Frontend:** Add change type filter chips to SuggestionsPanel
- **API Contract:** Update Suggestion Endpoints section
- **Tests:** Filter by changeType, date range, combined filters

### Slice 3 — Arbitrary Version Diffs (Frontend Only)
- **Frontend:** Add "Compare" mode to VersionsPanel
- **Frontend:** Two-version picker UI (dropdowns or click-to-select)
- **Frontend:** Wire to existing `GET /docs/:id/versions/:versionId/diff?compareWith=` endpoint
- **No backend changes** — endpoint already supports arbitrary comparison
- **Tests:** UI interaction, diff display correctness

## Sprint 2: Document Attachments

### Slice 4 — Attachments Backend (Schema + Routes)
- **Migration:** `010_add_doc_attachments.sql` — `doc_attachments` table + indexes
- **Backend:** `store/docAttachments.ts` — CRUD + limits enforcement
- **Backend:** `routes/docAttachments.ts` — upload, list, serve, delete endpoints
- **Backend:** Proof integration — SHA256 hash + provenance on upload/delete
- **Backend:** WebSocket broadcast — `attachment` event type
- **Backend:** RBAC — viewer+ read, editor+ upload/delete
- **API Contract:** Add Document Attachment Endpoints section
- **Tests:** Upload, list, serve, delete, MIME validation, size limits, permission checks

### Slice 5 — Attachments Frontend (Panel + Viewer)
- **Frontend:** `AttachmentPanel.tsx` — sidebar panel with upload dropzone, file list, thumbnails
- **Frontend:** `AttachmentViewer.tsx` — modal with PDF viewer (iframe), image viewer, download fallback
- **Frontend:** Wire into EditorPage sidebar tabs
- **Frontend:** Storage usage display + limit warnings
- **Tests:** Upload flow, viewer rendering, delete confirmation, empty state

## Sprint 3: Editor Power Features

### Slice 6 — Legal Numbering System
- **Frontend:** Extend `OrderedListEnhanced.ts` with `legal`, `alpha-lower`, `alpha-upper`, `roman-lower`, `roman-upper` styles
- **Frontend:** Add `startFrom`, `prefix`, `suffix` attributes
- **Frontend:** CSS counter rules for each numbering pattern
- **Frontend:** Numbering style dropdown in toolbar
- **Backend:** Export fidelity — map legal numbering to DOCX numbering definitions
- **Tests:** Each numbering style renders correctly, nesting works, export preserves numbering

### Slice 7 — Advanced Page Numbering
- **Frontend:** Extend `PageSetupDialog.tsx` with format picker (decimal, roman, alpha)
- **Frontend:** Add "Start at" override and section-based reset option
- **Frontend:** Position picker (header/footer × left/center/right)
- **Backend:** Map format to DOCX `<w:numFmt>` and `<w:pgNumType>` in export
- **Tests:** Format picker UI, export produces correct numbering, section resets work

### Slice 8 — Multi-Column Layout Extensions
- **Frontend:** Extend `ColumnSection.ts` to support 3-4 columns
- **Frontend:** Add `columnGap`, `columnRule` attributes
- **Frontend:** Column settings popover in toolbar
- **Frontend:** Per-column width ratios for asymmetric layouts
- **Backend:** Map multi-column to DOCX `<w:cols>` with spacing
- **Frontend:** Extend `SectionBreak.ts` with per-section header/footer HTML attributes
- **Tests:** Column rendering, gap/rule display, export fidelity

## Sprint 4: Knowledge Graph + Notifications

### Slice 9 — Document-Link Graph (Frontend Only)
- **Dependency decision:** Graph library (recommended: `@xyflow/react`) — shared with Slice 10
- **Frontend:** `DocLinkGraph.tsx` — force-directed graph with docs as nodes, doc_links as edges
- **Frontend:** Node styling (color by folder/status, size by link count)
- **Frontend:** Directional edges, hover tooltips, click-to-navigate
- **Frontend:** Filters (folder, min link count, search-to-focus)
- **Frontend:** Refactor `WorkspaceKnowledgeExplorerPage.tsx` into tabbed layout (Documents / Entities / Explorer)
- **No backend changes** — uses existing docs + doc_links APIs
- **Tests:** Graph renders with real data, filters work, navigation works

### Slice 10 — Entity Graph Visualization
- **Frontend:** Entity graph tab in refactored WorkspaceKnowledgeExplorerPage
- **Frontend:** Force-directed graph component with entity nodes + relationship edges
- **Frontend:** Node styling (size by mention count, color by type)
- **Frontend:** Edge styling (label by type, weight by strength)
- **Frontend:** Zoom, pan, drag, click-to-detail (EntityDetailModal)
- **Frontend:** Filter panel (entity types, relationship types, min connections, document scope, search-to-focus)
- **Tests:** Graph renders with real data, filters work, interactions work

### Slice 11 — Notification Preferences & Webhook Delivery
- **Migration:** `011_add_notification_preferences.sql` — `notification_preferences` table
- **Backend:** `store/notificationPreferences.ts` — CRUD
- **Backend:** `routes/notificationPreferences.ts` — get/update preferences per workspace
- **Backend:** `jobs/workers/notificationDeliverWorker.ts` — webhook delivery
- **Backend:** Slack delivery via `fetch()` to incoming webhook URL
- **Frontend:** Notification preferences UI in workspace settings
- **API Contract:** Add Notification Preferences endpoints
- **Dependency decision:** Email delivery (Nodemailer for SMTP) — can defer to separate slice
- **Tests:** Preference CRUD, webhook delivery, Slack payload format

### Slice 12 — Review Assignment System
- **Migration:** `012_add_doc_reviewers.sql` — `doc_reviewers` table + indexes
- **Backend:** `store/docReviewers.ts` — CRUD (assign, list, update status, unassign)
- **Backend:** `routes/docReviewers.ts` — POST/GET/PATCH/DELETE endpoints with RBAC
- **Backend:** New `review_assigned` notification type — fires on assignment
- **Backend:** Audit log entries for assign/unassign/status-change
- **Frontend:** Reviewer list in document sidebar with status badges (Pending / In Review / Completed)
- **Frontend:** "Assign Reviewer" button with user picker (editor+ only)
- **Frontend:** Reviewer self-service: start review, mark complete with optional notes
- **API Contract:** Add Document Reviewer endpoints
- **Tests:** Assignment CRUD, notification firing, RBAC enforcement, status transitions

### Slice 13 — Email Notification Delivery
- **Dependency:** `nodemailer` (pending approval)
- **Backend:** Email transport configuration (SMTP settings via env vars)
- **Backend:** Email templates for each notification type (mention, reply, share, suggestion, review_assigned)
- **Backend:** Extend `notificationDeliverWorker.ts` with email channel
- **Frontend:** Email address management in notification preferences
- **Tests:** Email sending, template rendering, SMTP failure handling

## Sprint 5: Performance

### Slice 14 — Large Document Performance
- **Benchmarking:** Create 50/100/200 page test documents
- **Profiling:** Measure load time, scroll FPS, memory, Yjs sync overhead
- **Implementation:** Based on profiling results — likely some combination of:
  - Lazy image loading
  - Debounced onUpdate callbacks
  - React.memo boundaries for sidebar panels
  - ProseMirror viewport virtualization (if DOM size is the bottleneck)
- **Regression tests:** Automated big-doc load/scroll/edit benchmarks
- **Tests:** Performance thresholds (load < 3s, scroll > 30 FPS, no memory leak)

---

# Deferred to Enterprise Hardening

These items have verified solid foundations and require no refactoring before product features:

| Roadmap | Item | Base Status | Extension Path |
|---|---|---|---|
| 2.3 | Group-based RBAC | 4-level role hierarchy, permission resolver | Add `groups` + `group_members` tables, modify resolver |
| 2.3 | SCIM integration | User + workspace store pattern | Add SCIM route module |
| 2.3 | Legal hold | Soft-delete exists | Add `legal_holds` table + pre-delete hook |
| 2.3 | External viewer | Doc permission system | Add `external_viewers` table + public route |
| 2.3 | Audit log export | `audit_log` table with 60+ action types | Add CSV/JSON export endpoint with filters |
| 2.5 | S3/GCS storage | `StorageProvider` type alias labels proof records (`local`/`s3`/`gcs`); no cloud client yet | Build `StorageClient` interface + S3/GCS implementations; migrate `imageUpload.ts` and attachment routes |
| 2.5 | verify:nightly | Proof data + job queue | Orchestration script over existing data |
| 2.5 | Full artifacts table | Schema supports referential integrity | Add foreign keys + canonicalize |
| 2.5 | Structured metrics | Prometheus endpoint, counters exist | Wire real values to existing collectors |
| 2.6 | AI Safety UX polish | Dashboard + badges + heatmaps done | Onboarding micro-interactions |
| 2.7 | Accessibility | — | ARIA roles, focus management, screen reader |
| 2.7 | Mobile responsive | Desktop-first layout | Media queries, touch handlers |
| 2.7 | Offline hardening | y-indexeddb exists | Online/offline indicators, conflict UX |

---

# Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Legal numbering CSS counters don't map cleanly to DOCX numbering XML | Medium | High | Spike on DOCX numbering format early; accept degraded export as fallback |
| Graph visualization library adds significant bundle size | Medium | Low | Lazy-load graph tab; code-split the dependency |
| Large-doc profiling reveals Yjs as the bottleneck (not DOM) | Low | High | Yjs lazy-loading is harder; may need document chunking at CRDT level |
| Nodemailer SMTP config complexity for self-hosted deployments | Medium | Medium | Default to webhook-only; email as opt-in with clear config docs |
| Multi-column export to DOCX has layout drift | Medium | Medium | Accept minor differences; document known limitations |
| Attachment storage consumes disk rapidly without S3 | Medium | Medium | Enforce per-doc limits strictly; S3 migration in enterprise hardening phase |
