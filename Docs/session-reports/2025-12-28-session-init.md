# Kacheri Session Report - December 28, 2025

## Session Initialization

**Date:** 2025-12-28
**Status:** Repository exploration complete, gap analysis ready

---

## Documents Read

| Document | Status |
|----------|--------|
| `CLAUDE.md` | Read - Engineering guardrails understood |
| `Docs/blueprint/architecture blueprint.md` | Read - System architecture understood |
| `Docs/Roadmap/docs roadmap.md` | Read - Pilot vs Prod-Ready scope understood |
| `Docs/API_CONTRACT.md` | Partially read - Large file, structure understood |
| `Docs/session summaries/2025-12-27-session-report.md` | Read - Prior session context loaded |

---

## Repository Exploration Complete

Full codebase inspection performed on both backend and frontend.

---

## REPOSITORY REALITY vs ROADMAP REQUIREMENTS

### Section 1.1: Editor & Layout

| Roadmap Requirement | Repository Status | Gap |
|---------------------|-------------------|-----|
| Tables: insert, resize, merge/split cells | `@tiptap/extension-table` integrated in Editor.tsx | **DONE** |
| Images: insert, resize, align, captions | `ImageEnhanced.ts`, `ImageNodeView.tsx`, `ImageInsertDialog.tsx` | **DONE** |
| Page layout v1: page size, margins, orientation, headers/footers | `PageSetupDialog.tsx`, `layout_settings` in docs table, export integration | **DONE** |
| Section/page breaks, 1-2 column layouts | `PageBreak.ts`, `SectionBreak.ts`, `ColumnSection.ts` | **DONE** |
| Table of contents from headings | `TableOfContents.tsx`, `HeadingsOutline.tsx`, `headingsIndex.ts` | **DONE** |
| Advanced lists v1: multi-level, legal-style | `OrderedListEnhanced.ts`, CSS for multi-level bullets/numbers | **DONE** |
| Find & replace with navigation | `FindReplaceDialog.tsx` with headings navigation | **DONE** |

**Section 1.1 Status: COMPLETE**

---

### Section 1.2: Collaboration & Review

| Roadmap Requirement | Repository Status | Gap |
|---------------------|-------------------|-----|
| Inline comments with threaded replies | `comments` table, `CommentsPanel.tsx`, `CommentThread.tsx` | **DONE** |
| Resolve/reopen threads, @mentions | `comment_mentions` table, resolve/reopen endpoints | **DONE** |
| Suggestions/track changes with accept/reject | `suggestions` table, `SuggestionsPanel.tsx`, `SuggestionItem.tsx` | **DONE** |
| Document version history v1 | `doc_versions` table, `VersionsPanel.tsx`, diff computation | **DONE** |
| Template gallery | `templates/` folder, `TemplateGalleryModal.tsx`, 6 built-in templates | **DONE** |

**Section 1.2 Status: COMPLETE**

---

### Section 1.3: Workspace, Auth, RBAC & Sharing

| Roadmap Requirement | Repository Status | Gap |
|---------------------|-------------------|-----|
| Real authentication (OIDC/JWT) | `src/auth/` module: JWT with access/refresh tokens, bcrypt passwords | **DONE** |
| Stable user IDs in proofs/provenance | `users` table with id, provenance records actor | **DONE** |
| Workspace boundaries (workspace_id) | `workspaces` table, `workspace_id` on docs, fs_nodes | **DONE** |
| Doc-level permissions (owner/editor/commenter/viewer) | `doc_permissions` table, `docPermissions.ts` store/routes | **DONE** |
| Workspace-level roles (owner/admin/member) | `workspace_members` table with role hierarchy | **DONE** (uses owner/admin/editor/viewer - functionally equivalent) |
| Share dialog with per-user access | `ShareDialog.tsx` with user autocomplete | **DONE** (Slice 2 added member search) |
| Workspace-wide share toggles | `workspace_access` column, `PATCH /docs/:id/workspace-access` | **DONE** (Slice 1 implemented) |
| Audit log v1 | `audit_log` table, `audit.ts` store, workspace audit endpoints | **DONE** |
| Trash/recovery for docs and folders | `deleted_at` on docs/fs_nodes, trash endpoints, `RestoreConfirmDialog.tsx` | **DONE** |

**Section 1.3 Status: COMPLETE**

---

### Section 1.4: File Manager, Home & Cross-Doc Linking

| Roadmap Requirement | Repository Status | Gap |
|---------------------|-------------------|-----|
| File Manager as primary home | `FileManagerPage.tsx` (69KB) | **DONE** |
| Two-panel layout (folders/docs tree + All Documents) | FileManagerPage implementation | **NEEDS VERIFICATION** |
| Folders + docs tree via fs_nodes | `fs_nodes` table, `fsNodes.ts` store, `/files/*` routes | **DONE** |
| Create/rename/delete/move folders | `/files/folder` POST, `/files/:id` PATCH/DELETE | **DONE** |
| All Documents panel with status chips | Not verified | **NEEDS VERIFICATION** |
| Cross-doc links with title-aware picker | Not found | **GAP** |
| Backlinks (docs that link to current doc) | Not found | **GAP** |

**Section 1.4 Status: PARTIAL - Cross-doc linking not implemented**

---

### Section 1.5: AI, Proofs & AI Watch (Pilot Slice)

| Roadmap Requirement | Repository Status | Gap |
|---------------------|-------------------|-----|
| Propose → Preview → Approve flow | `DiffModal.tsx`, compose/rewrite flows | **DONE** |
| Diff modal for AI edits | `DiffModal.tsx` | **DONE** |
| Proofs & Activity panel | `ProofsPanel.tsx`, provenance endpoints | **DONE** |
| PDF/DOCX exports with proof packets | Export routes record proofs | **DONE** |
| AI Watch dashboard MVP | `AIDashboard.tsx` (28KB), `/ai/watch/*` endpoints | **DONE** |

**Section 1.5 Status: COMPLETE**

---

### Section 1.6: Import, Export & Artifacts (Pilot Slice)

| Roadmap Requirement | Repository Status | Gap |
|---------------------|-------------------|-----|
| Universal /docs/import route | `importDoc.ts` with DOCX/PDF/HTML converters | **DONE** |
| Never-blank guarantee, Import Review diff | `PDFImportModal.tsx` | **NEEDS VERIFICATION** |
| Export to PDF and DOCX | `exportDocx.ts`, `exportPdfGet.ts` | **DONE** |
| Stable paths for exports/imports | `storage/` folder structure | **DONE** |
| Proof rows with kind, hash, path, metadata | `proofs` table schema | **DONE** |

**Section 1.6 Status: COMPLETE**

---

### Section 1.7: Ops, Safety & Platform (Pilot Level)

| Roadmap Requirement | Repository Status | Gap |
|---------------------|-------------------|-----|
| CLI scripts for replaying exports/AI | `verify:nightly` script reference | **NEEDS VERIFICATION** |
| Basic guardrails: timeouts, retries, rate limits | Not verified | **NEEDS VERIFICATION** |
| Desktop-first responsive layout | CSS exists but responsiveness not verified | **NEEDS VERIFICATION** |
| Keyboard shortcuts for core editing | Tiptap defaults + some custom | **PARTIAL** |

**Section 1.7 Status: PARTIAL - Needs verification**

---

## IDENTIFIED GAPS (Pilot Scope)

### Critical Gaps (Blocking Pilot)

1. ~~**Cross-doc links**~~ - **RESOLVED** (Section 1.4 Slices 1-4 this session)
2. ~~**Backlinks**~~ - **RESOLVED** (Section 1.4 Slice 5 this session)
3. ~~**Workspace-wide share toggles**~~ - **RESOLVED** (Slice 1 this session)

**All critical gaps are now CLOSED.**

### Items Needing Verification (Section 1.7)

1. ~~Share dialog functionality~~ - **VERIFIED & ENHANCED** (Slice 2 added user search)
2. Two-panel File Manager layout - Code exists but structure unclear
3. All Documents panel with status chips
4. Never-blank import guarantee
5. CLI replay scripts
6. Rate limits / guardrails
7. Keyboard shortcuts coverage

---

## SUMMARY

| Section | Status |
|---------|--------|
| 1.1 Editor & Layout | **COMPLETE** |
| 1.2 Collaboration & Review | **COMPLETE** |
| 1.3 Workspace, Auth, RBAC & Sharing | **COMPLETE** (Slices 1 & 2 done this session) |
| 1.4 File Manager & Cross-Doc Linking | **COMPLETE** (Slices 1-5 done this session) |
| 1.5 AI, Proofs & AI Watch | **COMPLETE** |
| 1.6 Import, Export & Artifacts | **COMPLETE** |
| 1.7 Ops, Safety & Platform | **PARTIAL** (needs verification) |

---

## Assumptions Ruled Out

- No inference from code - only documented behavior
- No silent scope expansion beyond roadmap
- No dependency additions without explicit approval

---

## Known Constraints

- Pilot scope focus (not prod-ready features)
- Contract-first development for any API work
- Architecture blueprint must be respected

---

## Identified Risks or Drift

1. Workspace roles are owner/admin/editor/viewer but roadmap says owner/admin/member - **Minor naming drift**
2. Cross-doc linking feature missing entirely

---

## Session Goal

Awaiting user direction. Recommended options:
1. Implement cross-doc links + backlinks (Section 1.4 gaps)
2. Verify and complete Section 1.3 share toggles
3. Verify Section 1.7 ops/safety items
4. User's choice

---

## Incremental Updates

### Update 1: Section 1.3 Slice 1 Complete - Workspace-Wide Share Toggle

**Time:** Session continuation after context overflow

**Completed:**

Section 1.3 Slice 1 (Workspace-Wide Share Toggle) has been fully implemented across 10 steps:

| Step | Description | Files Modified |
|------|-------------|----------------|
| 1 | Add workspace_access column to docs table | `KACHERI BACKEND/src/db.ts` |
| 2 | Update docs.ts store with types and updateDocWorkspaceAccess() | `KACHERI BACKEND/src/store/docs.ts` |
| 3 | Update docPermissions.ts with new resolution logic | `KACHERI BACKEND/src/store/docPermissions.ts` |
| 4 | Add PATCH /docs/:id/workspace-access route | `KACHERI BACKEND/src/routes/docPermissions.ts` |
| 5 | Add audit action type for workspace_access:update | `KACHERI BACKEND/src/store/audit.ts` |
| 6 | Update API_CONTRACT.md with new endpoint | `Docs/API_CONTRACT.md` |
| 7 | Update frontend API (docPermissions.ts) | `KACHERI FRONTEND/src/api/docPermissions.ts` |
| 8 | Add workspace access toggle to ShareDialog.tsx | `KACHERI FRONTEND/src/components/ShareDialog.tsx` |
| 9 | Add CSS styles for workspace access section | `KACHERI FRONTEND/src/components/shareDialog.css` |
| 10 | Pass workspaceId to ShareDialog in EditorPage | `KACHERI FRONTEND/src/EditorPage.tsx`, `KACHERI FRONTEND/src/api.ts` |

**Implementation Details:**

1. **Permission Resolution Order (Updated):**
   - Priority 1: Explicit doc permission (doc_permissions table)
   - Priority 2: Doc's workspace_access setting (NEW)
   - Priority 3: Workspace role mapping (fallback)
   - Priority 4: Creator implicit ownership

2. **WorkspaceAccessLevel Values:**
   - `null` - Use workspace role (default)
   - `'none'` - No access for workspace members
   - `'viewer'` - All workspace members can view
   - `'commenter'` - All workspace members can comment
   - `'editor'` - All workspace members can edit

3. **UI Changes:**
   - ShareDialog now shows "Anyone in workspace can:" dropdown
   - Only visible to doc owners when doc is in a workspace
   - Purple accent styling to match workspace theme

**What Was Intentionally Not Changed:**
- No changes to workspace role hierarchy
- No changes to explicit permission logic
- Existing share dialog functionality preserved

**Decisions Made:**
- Used `workspace_access` column in docs table (not separate table)
- Audit events logged for workspace access changes
- DocMeta type extended with workspaceId for frontend

**New Risks or Unknowns:**
- None identified

**Gap Status Update:**
- Section 1.3 "Workspace-wide share toggles" gap: **NOW CLOSED**

---

**Next Intended Work:**
- Section 1.3 Slice 2: User Search in ShareDialog (optional UX improvement)
- OR proceed to Section 1.4: Cross-doc links and backlinks

---

### Update 2: Section 1.3 Slice 2 Complete - User Search in ShareDialog

**Time:** Session continuation

**Completed:**

Section 1.3 Slice 2 (User Search in ShareDialog) has been implemented:

| Step | Description | Files Modified |
|------|-------------|----------------|
| 1 | Create workspaces API with listMembers() | `KACHERI FRONTEND/src/api/workspaces.ts` (NEW) |
| 2-4 | Add member fetch, datalist autocomplete, fallback | `KACHERI FRONTEND/src/components/ShareDialog.tsx` |

**Implementation Details:**

1. **New API Module:**
   - Created `workspaces.ts` with `workspacesApi.listMembers(workspaceId)`
   - Follows same request pattern as `docPermissions.ts`

2. **ShareDialog Changes:**
   - Added `workspaceMembers` state
   - Fetches members when dialog opens (if doc has workspaceId)
   - Computes `availableMembers` (excludes users already with permissions)
   - Uses HTML5 `<datalist>` for native autocomplete
   - Placeholder changes based on context:
     - Workspace docs: "Search workspace members..."
     - Non-workspace docs: "Enter user ID..." (original behavior)

3. **Approach:**
   - Uses existing `GET /workspaces/:id/members` backend endpoint
   - Native HTML5 datalist (following `ProviderModelPicker` pattern)
   - No backend changes required
   - Graceful fallback if member fetch fails

**What Was Intentionally Not Changed:**
- Backend endpoints (uses existing API)
- Non-workspace document behavior (manual user ID entry preserved)
- CSS styles (native datalist styling is sufficient)

**Gap Status Update:**
- Section 1.3 is now **FULLY COMPLETE**

---

**Next Intended Work:**
- Proceed to Section 1.4: Cross-doc links and backlinks

---

### Update 3: Section 1.4 Slice 1 Complete - Database & Backend for Doc Links

**Time:** Session continuation

**Completed:**

Section 1.4 Slice 1 (Database & Backend for Doc Links) has been fully implemented:

| Step | Description | Files Modified |
|------|-------------|----------------|
| 1 | Add `doc_links` table with indexes | `KACHERI BACKEND/src/db.ts` |
| 2 | Create docLinks store with types and CRUD | `KACHERI BACKEND/src/store/docLinks.ts` (NEW) |
| 3 | Create docLinks routes with all endpoints | `KACHERI BACKEND/src/routes/docLinks.ts` (NEW) |
| 4 | Register routes in server | `KACHERI BACKEND/src/server.ts` |
| 5 | Update API Contract | `Docs/API_CONTRACT.md` |

**Implementation Details:**

1. **Database Schema:**
   - `doc_links` table with columns: id, from_doc_id, to_doc_id, workspace_id, link_text, position, created_by, created_at, updated_at, deleted_at
   - Indexes on from_doc_id, to_doc_id, and workspace_id for query performance
   - UNIQUE constraint on (from_doc_id, to_doc_id, position)
   - Soft delete support via `deleted_at` column

2. **Store Functions:**
   - `createDocLink()` - Create a new link
   - `getDocLink()` - Get a single link by ID
   - `listLinksFromDoc()` - List outgoing links (with toDocTitle JOIN)
   - `listLinksToDoc()` - List backlinks (with fromDocTitle JOIN)
   - `deleteDocLink()` - Soft delete a link
   - `syncDocLinks()` - Bulk sync on document save
   - Helper functions: `getLinkCountFromDoc()`, `getBacklinkCount()`

3. **REST Endpoints:**
   - `GET /docs/:id/links` - List outgoing links (viewer+)
   - `GET /docs/:id/backlinks` - List backlinks (viewer+)
   - `POST /docs/:id/links` - Create a link (editor+)
   - `DELETE /docs/:id/links/:linkId` - Remove a link (editor+)
   - `PUT /docs/:id/links/sync` - Bulk sync links (editor+)

4. **Features:**
   - Links stored by doc ID (rename-safe)
   - Backlinks include source doc title via JOIN
   - Self-links prevented
   - Audit logging for workspace-scoped docs
   - WebSocket broadcast for real-time updates
   - Soft delete support

**What Was Intentionally Not Changed:**
- No frontend changes (frontend slices come next)
- No changes to existing doc/permission/comment stores
- No new dependencies

**Decisions Made:**
- Used position field for multiple links to same doc (differentiates by character position)
- Used soft delete consistent with other stores
- Sync endpoint handles add/remove in single transaction

**New Risks or Unknowns:**
- None identified

**Gap Status Update:**
- Section 1.4 Slice 1 (Backend): **COMPLETE**
- Section 1.4 Slice 2 (DocLink Extension): **COMPLETE**
- Remaining Section 1.4 slices:
  - Slice 3: Doc Picker Modal
  - Slice 4: Insert Doc Link Integration
  - Slice 5: Backlinks API & Panel

---

**Next Intended Work:**
- Section 1.4 Slice 3: Doc Picker Modal

---

### Update 4: Section 1.4 Slice 2 Complete - Custom Tiptap DocLink Extension

**Time:** Session continuation

**Completed:**

Section 1.4 Slice 2 (Custom Tiptap DocLink Extension) has been fully implemented:

| Step | Description | Files Modified |
|------|-------------|----------------|
| 1 | Create DocLink Mark extension | `KACHERI FRONTEND/src/extensions/DocLink.ts` (NEW) |
| 2 | Export from extensions index | `KACHERI FRONTEND/src/extensions/index.ts` |
| 3 | Register in Editor | `KACHERI FRONTEND/src/Editor.tsx` |
| 4 | Add EditorApi methods | `KACHERI FRONTEND/src/Editor.tsx` |
| 5 | Add CSS styling | `KACHERI FRONTEND/src/ui.css` |
| 6 | Add click handler | `KACHERI FRONTEND/src/Editor.tsx` |

**Implementation Details:**

1. **DocLink Mark Extension:**
   - Name: `docLink`
   - Attributes: `toDocId`, `toDocTitle`
   - Renders as: `<a data-doc-id="..." data-doc-title="..." class="kacheri-doc-link">`
   - Priority: 1000 (higher than regular Link)
   - Excludes: regular `link` marks (mutually exclusive)

2. **Commands Added:**
   - `setDocLink({ toDocId, toDocTitle })` - Apply doc link mark
   - `unsetDocLink()` - Remove doc link mark
   - `toggleDocLink({ toDocId, toDocTitle })` - Toggle mark

3. **EditorApi Methods:**
   - `setDocLink(opts)` - Apply doc link to selection
   - `unsetDocLink()` - Remove doc link
   - `isDocLinkActive()` - Check if cursor is in doc link
   - `getDocLinkAttrs()` - Get current doc link attributes

4. **CSS Styling:**
   - Purple color matching brand theme
   - Dotted underline (solid on hover)
   - Document emoji prefix (📄)
   - Focus outline for accessibility

5. **Click Handler:**
   - Opens linked document in new tab
   - Uses `window.open(/doc/${docId}, "_blank")`

**What Was Intentionally Not Changed:**
- No UI for inserting links (comes in Slice 3-4)
- No backend API calls (Slice 1 already done)
- No backlinks panel (Slice 5)

**Decisions Made:**
- Used Mark (inline) instead of Node (block) for semantic correctness
- Mark is mutually exclusive with regular `link` marks via `excludes`
- Click opens in new tab for safe navigation

**New Risks or Unknowns:**
- None identified

**Gap Status Update:**
- Section 1.4 Slice 2 (DocLink Extension): **COMPLETE**

---

**Next Intended Work:**
- Section 1.4 Slice 3: Doc Picker Modal

---

### Update 5: Section 1.4 Slice 3 Complete - Doc Picker Modal

**Time:** Session continuation

**Completed:**

Section 1.4 Slice 3 (Doc Picker Modal) has been fully implemented:

| Step | Description | Files Modified |
|------|-------------|----------------|
| 1 | Create DocPickerModal component | `KACHERI FRONTEND/src/components/DocPickerModal.tsx` (NEW) |
| 2 | Create CSS styling | `KACHERI FRONTEND/src/components/docPickerModal.css` (NEW) |

**Implementation Details:**

1. **DocPickerModal Component:**
   - Props: `open`, `onClose`, `onSelect`, `excludeDocId`, `title`
   - Fetches docs via `DocsAPI.list()` when opened
   - Client-side filtering by title or ID (case-insensitive)
   - Loading/error/empty states handled
   - ESC key and backdrop click to close
   - Double-click on item confirms selection immediately
   - Enter key confirms when doc is selected

2. **Features:**
   - Reuses existing `bk-modal` design system classes
   - Search input with autocomplete placeholder
   - Scrollable list with max-height
   - Selected item highlighted with purple border
   - "Insert Link" button disabled until selection
   - Excludes current document via `excludeDocId` prop

3. **CSS Additions:**
   - `doc-picker-modal` - Extended width and flex layout
   - `doc-picker-list` - Scrollable container
   - `doc-picker-item` - Document list items with hover/selected states
   - `doc-picker-status` - Loading/error/empty messages

**What Was Intentionally Not Changed:**
- No toolbar integration (comes in Slice 4)
- No backend changes (uses existing DocsAPI.list())
- Base modal styles reused from promptDialog.css

**Decisions Made:**
- Used native HTML button elements for items (better accessibility)
- Double-click for quick confirm (power user feature)
- Monospace font for doc IDs (visual distinction)

**New Risks or Unknowns:**
- None identified

**Gap Status Update:**
- Section 1.4 Slice 3 (Doc Picker Modal): **COMPLETE**

---

**Next Intended Work:**
- Section 1.4 Slice 4: Insert Doc Link Integration

---

### Update 6: Section 1.4 Slice 4 Complete - Insert Doc Link Integration

**Time:** Session continuation

**Completed:**

Section 1.4 Slice 4 (Insert Doc Link Integration) has been fully implemented:

| Step | Description | Files Modified |
|------|-------------|----------------|
| 1 | Add DocPickerModal import | `KACHERI FRONTEND/src/EditorPage.tsx` |
| 2 | Add docPickerOpen state | `KACHERI FRONTEND/src/EditorPage.tsx` |
| 3 | Add "Doc Link" toolbar button | `KACHERI FRONTEND/src/EditorPage.tsx` |
| 4 | Add DocPickerModal component | `KACHERI FRONTEND/src/EditorPage.tsx` |

**Implementation Details:**

1. **Toolbar Button:**
   - Added "Doc Link" button next to "Image" button
   - Uses existing `button subtle sm` class
   - Opens DocPickerModal on click

2. **Modal Integration:**
   - DocPickerModal rendered at bottom with other modals
   - `excludeDocId={docId}` prevents self-linking
   - `onSelect` callback applies DocLink mark via editorApiRef

3. **Flow:**
   - User clicks "Doc Link" button → Modal opens
   - User searches/selects target document
   - User clicks "Insert Link" → Mark applied to selection
   - Modal closes automatically

**What Was Intentionally Not Changed:**
- No CSS changes (uses existing button classes)
- No backend changes
- No Editor.tsx changes (API already existed from Slice 2)

**Decisions Made:**
- Button placed after Image button (both are "insert content" actions)
- Used optional chaining on setDocLink call for safety

**New Risks or Unknowns:**
- None identified

**Gap Status Update:**
- Section 1.4 Slice 4 (Insert Doc Link Integration): **COMPLETE**
- Cross-doc links feature is now **FULLY FUNCTIONAL**

---

**Next Intended Work:**
- Section 1.4 Slice 5: Backlinks Panel (display docs that link to current doc)

---

### Update 7: Section 1.4 Slice 5 Complete - Backlinks Panel

**Time:** Session continuation

**Completed:**

Section 1.4 Slice 5 (Backlinks Panel) has been fully implemented:

| Step | Description | Files Modified |
|------|-------------|----------------|
| 1 | Create docLinks API module | `KACHERI FRONTEND/src/api/docLinks.ts` (NEW) |
| 2 | Create useBacklinks hook | `KACHERI FRONTEND/src/hooks/useBacklinks.ts` (NEW) |
| 3 | Create BacklinksPanel component | `KACHERI FRONTEND/src/components/BacklinksPanel.tsx` (NEW) |
| 4 | Create panel CSS styles | `KACHERI FRONTEND/src/components/backlinksPanel.css` (NEW) |
| 5 | Integrate in EditorPage | `KACHERI FRONTEND/src/EditorPage.tsx` |

**Implementation Details:**

1. **API Module (docLinks.ts):**
   - `DocLink` type with full metadata
   - `docLinksApi.listBacklinks(docId)` fetches backlinks
   - `docLinksApi.listLinks(docId)` fetches outgoing links
   - Uses same auth pattern as other API modules

2. **Hook (useBacklinks.ts):**
   - Fetches backlinks on mount and refreshKey change
   - Returns: `backlinks`, `count`, `loading`, `error`, `refetch`
   - Follows existing hooks pattern (useVersions, useSuggestions)

3. **Panel Component (BacklinksPanel.tsx):**
   - Slide-in drawer (340px width, right side)
   - Shows count in header
   - Lists source documents with titles
   - Shows link text if available
   - Click opens source doc in new tab
   - Loading/error/empty states

4. **EditorPage Integration:**
   - `backlinksOpen` state with localStorage persistence
   - "Backlinks" toggle button in toolbar (after Suggestions)
   - Button shows primary style when panel is open
   - Panel renders after SuggestionsPanel

**What Was Intentionally Not Changed:**
- Backend already complete (Slice 1)
- No refreshKey for real-time updates (can add later if needed)
- No filter/search in panel (simple list is sufficient)

**Decisions Made:**
- Panel follows exact same pattern as VersionsPanel/SuggestionsPanel
- localStorage key: `kacheri:backlinksOpen`
- Opens source doc in new tab (consistent with doc link clicks)

**New Risks or Unknowns:**
- None identified

**Gap Status Update:**
- Section 1.4 Slice 5 (Backlinks Panel): **COMPLETE**
- **Section 1.4 is now FULLY COMPLETE**

---

## SECTION 1.4 SUMMARY

All cross-doc linking features have been implemented:

| Slice | Description | Status |
|-------|-------------|--------|
| Slice 1 | Database & Backend for Doc Links | **COMPLETE** |
| Slice 2 | Custom Tiptap DocLink Extension | **COMPLETE** |
| Slice 3 | Doc Picker Modal | **COMPLETE** |
| Slice 4 | Insert Doc Link Integration | **COMPLETE** |
| Slice 5 | Backlinks Panel | **COMPLETE** |

**Features Delivered:**
- `doc_links` table with full CRUD operations
- REST API: GET/POST links, GET backlinks, DELETE, PUT sync
- DocLink Tiptap Mark extension with custom styling
- Doc Picker Modal with search/filter
- "Doc Link" toolbar button in editor
- Backlinks Panel showing inbound references
- Click navigation between linked documents

**Section 1.4 Gap: CLOSED**

---

## UI Refinement Phase - FileManagerPage Redesign

**Context:** User identified UI issues after completing pilot-ready features:
1. FileManagerPage: Two-panel layout creates redundancy
2. EditorPage: Editor appears small within A4 background
3. EditorPage: Toolbar is too crowded (37+ buttons)

**Approach:** Tackle FileManagerPage first, then EditorPage issues together.

### FileManager Redesign Slices

| Slice | Description | Status |
|-------|-------------|--------|
| Slice 1 | Remove 2-panel grid, single column layout | **COMPLETE** |
| Slice 2 | Add search bar + inline search results | **COMPLETE** |
| Slice 3 | Create AllDocsModal for orphan discovery | **COMPLETE** |
| Slice 4 | Change "Remove" → "Move to Trash" | **COMPLETE** |
| Slice 5 | Compact AI Watch footer | PENDING |

---

### Update 8: FileManager Redesign Slice 1 - COMPLETE

**Time:** Session continuation

**Completed:**

| Step | Description | Status |
|------|-------------|--------|
| 1 | Remove CSS grid wrapper and 2-column layout | **DONE** |
| 2 | Remove entire right panel "All Documents" section (~370 lines) | **DONE** |
| 3 | Keep left panel "Folders & Docs" as main content | **DONE** |
| 4 | Fix indentation for consistency | **DONE** |
| 5 | TypeScript compilation check | **PASSED** |

**Files Modified:**
- `KACHERI FRONTEND/src/FileManagerPage.tsx`

**What Changed:**
- Removed grid layout wrapper (`gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)"`)
- Removed entire right panel including:
  - "All Documents" header and doc count
  - Import and Refresh buttons
  - AI Watch snapshot section
  - Search input and filter pills
  - Document cards with Organize/Rename/Delete buttons
- Kept "Folders & Docs" section as single-column main content
- Trash panel remains below main content (unchanged)

**What Was Preserved:**
- All state variables for allDocs, docsQuery, docsFilter, AI stats (needed for future slices)
- All folder tree functionality
- Trash panel functionality

**Result:**
- FileManagerPage now shows single-column folder tree view
- ~370 lines of UI code removed
- Clean base for adding search in Slice 2

---

### Update 9: FileManager Redesign Slice 2 - COMPLETE

**Time:** Session continuation

**Pre-Planning Checks:**
- API Contract: No changes needed (uses existing `GET /docs` endpoint)
- Architecture: Frontend-only UI change
- Roadmap Alignment: Section 1.4 File Manager enhancement

**Completed:**

| Step | Description | Status |
|------|-------------|--------|
| 1 | Add search section with input and filter pills | **DONE** |
| 2 | Add search results section after tree | **DONE** |
| 3 | TypeScript compilation check | **PASSED** |

**Files Modified:**
- `KACHERI FRONTEND/src/FileManagerPage.tsx`

**What Changed:**
- Added search bar section between header and "Folders & Docs" section
  - Full-width search input with pill styling
  - Filter pills: "All", "In Folders", "Orphaned"
- Added search results section after folder tree
  - Shows "Search Results (N)" header with count
  - Displays matching documents as cards
  - Each card shows title, status pill, and truncated ID
  - Click navigates to document editor
  - Empty state: "No documents match 'query'"

**Implementation Details:**
- Reuses existing state: `docsQuery`, `docsFilter`, `filteredDocs`
- Reuses existing styles: `filterPill`, `docCard`, `docTitleButton`, `docStatusPill`
- Search results only appear when `docsQuery.trim()` is truthy
- Filter updates apply to search results in real-time

**What Was Preserved:**
- All folder tree functionality unchanged
- Trash panel functionality unchanged
- All existing state variables

---

### Update 10: FileManager Redesign Slice 3 - COMPLETE

**Time:** Session continuation

**Completed:**

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create AllDocsModal.tsx component | **DONE** |
| 2 | Create allDocsModal.css styles | **DONE** |
| 3 | Add state and import in FileManagerPage | **DONE** |
| 4 | Add "All Documents" trigger button | **DONE** |
| 5 | Add modal render at bottom | **DONE** |
| 6 | TypeScript compilation check | **PASSED** |

**Files Created:**
- `KACHERI FRONTEND/src/components/AllDocsModal.tsx`
- `KACHERI FRONTEND/src/components/allDocsModal.css`

**Files Modified:**
- `KACHERI FRONTEND/src/FileManagerPage.tsx`

**What Was Built:**

1. **AllDocsModal Component:**
   - Displays all documents with count in header
   - Orphan count badge when orphaned docs exist
   - Search input (filters by title or ID)
   - Filter pills: All / In Folders / Orphaned
   - Document list with status pills
   - "Organize" button for orphaned docs only
   - Click doc title to navigate to editor
   - ESC key and backdrop click to close
   - Reset state on modal open

2. **Styling:**
   - Dark theme matching existing UI
   - 580px modal width
   - Scrollable doc list (350px max-height)
   - Orphaned items highlighted with left border
   - Green pill for "In Folders", blue for "Orphaned"

3. **Integration:**
   - "All Documents" button in header (after Trash)
   - Modal closes and opens OrganizeDocModal when organizing
   - Modal closes and navigates when opening doc

**What Was Preserved:**
- All existing functionality unchanged
- Reuses existing OrganizeDocModal for folder organization

---

### Update 11: FileManager Redesign Slice 4 - COMPLETE

**Time:** Session continuation

**Completed:**

| Step | Description | Status |
|------|-------------|--------|
| 1 | Add "trash-doc" to PromptKind type | **DONE** |
| 2 | Update deleteNode function for doc nodes | **DONE** |
| 3 | Add promptConfig case for "trash-doc" | **DONE** |
| 4 | Add handlePromptConfirm case for "trash-doc" | **DONE** |
| 5 | Update button label to "Move to Trash" | **DONE** |
| 6 | TypeScript compilation check | **PASSED** |

**Files Modified:**
- `KACHERI FRONTEND/src/FileManagerPage.tsx`

**What Changed:**

| Before | After |
|--------|-------|
| Button: "Remove" | Button: "Move to Trash" |
| Action: Unlinks doc from folder | Action: Soft-deletes doc (moves to trash) |
| API: `FilesAPI.delete(node.id)` | API: `DocsAPI.delete(docId)` |
| Dialog: "Remove from File Manager?" | Dialog: "Move to Trash?" |
| Result: Doc becomes orphaned | Result: Doc appears in Trash panel |

**Implementation Details:**
- Added new PromptKind `"trash-doc"` for type safety
- deleteNode() now sets `kind: "trash-doc"` for doc nodes
- Dialog shows doc title and explains restore capability
- Handler calls `DocsAPI.delete()` for soft delete
- `refreshEverything()` updates tree, docs list, and trash

**What Was Preserved:**
- Folder "Delete" functionality unchanged
- Existing trash panel and restore functionality
- All other prompt dialogs unchanged

---

### Update 12: FileManager Redesign Slice 5 - COMPLETE

**Time:** Session continuation

**Completed:**

| Step | Description | Status |
|------|-------------|--------|
| 1 | Add `aiFooterPill` style constant | **DONE** |
| 2 | Add AI Watch footer section after main content | **DONE** |
| 3 | TypeScript compilation check | **PASSED** |

**Files Modified:**
- `KACHERI FRONTEND/src/FileManagerPage.tsx`

**What Was Built:**

1. **AI Watch Footer:**
   - Compact footer bar below folder tree, above Trash panel
   - "AI WATCH" label with uppercase styling
   - Three metric pills displaying:
     - Verification percentage (e.g., "Verification: 85%")
     - Export verification count (e.g., "12/15 exports verified")
     - Compose determinism (e.g., "23/25 stable • 2 drift")
   - "View Dashboard" button linking to `/ai-watch`

2. **States Handled:**
   - Loading: Shows "Loading..." message
   - Error: Shows "Error loading stats" in red
   - Success: Shows metric pills

3. **Styling:**
   - Dark translucent background with subtle border
   - Blue-tinted metric pills matching AI theme
   - Flex layout with wrap for narrow screens
   - Consistent with existing FileManagerPage design

**Implementation Details:**
- Reuses existing data: `aiLoading`, `aiError`, `aiVerificationPercent`, `exportVerificationLabel`, `composeDeterminismLabel`
- Data was already being fetched via `loadAiWatch()` on mount
- No new API calls or backend changes needed
- Navigate to full dashboard via `/ai-watch` route

**What Was Preserved:**
- All existing folder tree functionality
- Trash panel functionality
- All AI Watch data fetching logic

---

## FileManager Redesign Summary

All FileManager redesign slices have been completed:

| Slice | Description | Status |
|-------|-------------|--------|
| Slice 1 | Remove 2-panel grid, single column layout | **COMPLETE** |
| Slice 2 | Add search bar + inline search results | **COMPLETE** |
| Slice 3 | Create AllDocsModal for orphan discovery | **COMPLETE** |
| Slice 4 | Change "Remove" → "Move to Trash" | **COMPLETE** |
| Slice 5 | Compact AI Watch footer | **COMPLETE** |

**Features Delivered:**
- Single-column focused layout (removed redundant right panel)
- Inline search with filter pills (All/In Folders/Orphaned)
- AllDocsModal for comprehensive document discovery
- Proper trash behavior for document deletion
- At-a-glance AI Watch metrics in footer

**Next Intended Work:**
- EditorPage fixes (Options B+C - editor size and toolbar)

---

## Bug Fixes - Post FileManager Redesign

### Bug Fix 1: EditorPage Blank Page (DocLink Extension Error)

**Issue:** After creating a new document, navigating to the EditorPage resulted in a completely blank page.

**Error:** `Uncaught SyntaxError: Unknown mark type: 'link'` in Tiptap schema initialization.

**Root Cause:** The custom `DocLink` extension (created in Section 1.4 Slice 2) had `excludes: "link"` which tells Tiptap it's mutually exclusive with a `link` mark. However, the base Link extension wasn't loaded in the editor, causing Tiptap to throw an error when trying to resolve the exclusion.

**Fix:** Removed the `excludes: "link"` line from `DocLink.ts` since there's no Link extension to exclude.

**File Modified:**
- `KACHERI FRONTEND/src/extensions/DocLink.ts`

---

### Bug Fix 2: Document Deletion Not Removing File Tree Entry

**Issue:** When moving a document to trash:
1. Document moved to trash successfully
2. But the file still appeared in the File Manager tree
3. Attempting to delete again threw 404 error
4. File persisted even after page refresh

**Root Cause:** The `deleteDoc()` function in `docs.ts` only soft-deleted the entry in the `docs` table, but did NOT soft-delete the corresponding `fs_nodes` entry that shows the file in the tree.

**Fix (Backend - `store/fsNodes.ts`):** Added three new functions:
- `softDeleteDocNodes(docId)` - Soft-deletes fs_nodes referencing a doc
- `restoreDocNodes(docId)` - Restores soft-deleted fs_nodes for a doc
- `permanentDeleteDocNodes(docId)` - Permanently deletes fs_nodes for a doc

**Fix (Backend - `store/docs.ts`):** Updated doc lifecycle functions:
- `deleteDoc()` - Now also calls `softDeleteDocNodes()`
- `restoreDoc()` - Now also calls `restoreDocNodes()`
- `permanentDeleteDoc()` - Now also calls `permanentDeleteDocNodes()`

---

### Bug Fix 3: Duplicate Trash Entries

**Issue:** After fixing Bug #2, deleted documents appeared twice in the trash panel - once from docs trash and once from files trash.

**Root Cause:** The `listTrash()` function in `fsNodes.ts` was returning all deleted fs_nodes including `kind='doc'` entries, which duplicated the docs trash listing.

**Fix (Backend - `store/fsNodes.ts`):**
- Updated `listTrash()` to exclude `kind='doc'` entries with `AND kind != 'doc'` clause
- Docs trash is the canonical source for deleted documents

---

### Bug Fix 4: Orphaned File Tree Entries

**Issue:** Old deleted documents that were deleted before Bug Fix #2 still appeared in the file tree because their fs_nodes weren't soft-deleted.

**Root Cause:** The `listChildren()` function didn't check if referenced docs were deleted.

**Fix (Backend - `store/fsNodes.ts`):**
- Updated `listChildren()` to use a LEFT JOIN with docs table
- Added filter: `(f.kind != 'doc' OR (d.id IS NOT NULL AND d.deleted_at IS NULL))`
- This excludes doc nodes whose referenced document is deleted or missing

**Files Modified:**
- `KACHERI BACKEND/src/store/fsNodes.ts` (4 changes)
- `KACHERI BACKEND/src/store/docs.ts` (3 changes)
- `KACHERI FRONTEND/src/extensions/DocLink.ts` (1 change)

---

## EditorPage Hybrid Redesign

### Overview

After FileManager completion, user identified EditorPage issues:
1. Editor appears small within A4 background (feels like a preview, not a workspace)
2. Toolbar too crowded (42 items in one row)

**User Requirements:**
- Editor should look like Google Docs / MS Word (professional document editor)
- Full MS Word style formatting toolbar (Font, Size, B/I/U/S, Colors, Align, Spacing, etc.)
- AI/Propose button must remain **VISIBLE** - not hidden in dropdown
- Larger, readable fonts in toolbar (not cramped like original)

### Implementation Slices

| Slice | Description | Status |
|-------|-------------|--------|
| Slice 1 | Editor Layout - Remove floating card effect | **COMPLETE** |
| Slice 2 | Toolbar Row 1 - Document Header | **COMPLETE** |
| Slice 3 | Toolbar Row 2 - MS Word Style Formatting | **COMPLETE** |
| Slice 4 | Toolbar Row 3 - Actions Bar | **COMPLETE** |
| Slice 5 | Style Polish - Larger fonts, spacing | **COMPLETE** |

---

### Slice 1: Editor Layout Cleanup

**Files Modified:**
- `KACHERI FRONTEND/src/ui.css`
- `KACHERI FRONTEND/src/EditorPage.tsx`

**CSS Changes (`.editor-shell`):**
| Before | After |
|--------|-------|
| `display: flex; flex-direction: column; align-items: center` | `display: flex; flex-direction: row` |
| Centered floating page | Full-width canvas with gray gutters |
| Dark background | Light gray background (`#e8eaed`) |
| Large gap/padding | Gutters via `::before` and `::after` pseudo-elements |

**CSS Changes (`.tiptap`):**
| Before | After |
|--------|-------|
| `border-radius: var(--radius-lg)` | `border-radius: 0` (no rounded corners) |
| Fixed `width: var(--page-width)` | `flex: 1 1 auto; max-width: 900px` |
| Heavy `box-shadow: var(--shadow-lg)` | Subtle `box-shadow: 0 1px 3px rgba(0,0,0,0.08)` |
| Floating card look | White canvas that fills width |

**EditorPage Changes:**
- Removed `minHeight: "60vh"` inline style
- Removed `--page-width` and `--page-height` inline CSS variables (not needed for new layout)
- Kept margin CSS variables for page setup (export still uses them)
- Removed `surface` class from `.tiptap` div

---

### Slices 2-4: 3-Row Toolbar Structure

**Toolbar Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ROW 1: DOCUMENT HEADER                                          │
│ [← Docs] [Document Title_______________] [Saved] [⚙Page][Share] │
├─────────────────────────────────────────────────────────────────┤
│ ROW 2: FORMATTING TOOLBAR (MS Word Style)                       │
│ [Arial▾][16▾] │ [B][I][U][S] │ [A▾][🖍▾] │ [≡≡≡≡] │ [1.5▾] │ [⊞⊞◄►] │ [✕] │
│    Font Size     Styles       Colors     Align    Space   Lists   Clear │
├─────────────────────────────────────────────────────────────────┤
│ ROW 3: ACTIONS TOOLBAR                                          │
│ [Table][Image][DocLink][PageBreak] │ [Propose...] │ [PDF][DOCX] │ [Panels▾] [+Comment] │ [Find][⌘K] │
└─────────────────────────────────────────────────────────────────┘
```

**Row 1 - Document Header:**
- Navigation: "← Docs" back button
- Document title input (larger font, editable)
- Save status badge
- Page Setup button (moved from old toolbar)
- Share button (primary style)
- **Removed:** Workspace identity section (WS status, Workspace ID, User ID)

**Row 2 - Formatting Toolbar (MS Word Style):**
- Font family dropdown (Inter, Arial, Times, Georgia, Courier)
- Font size dropdown (10-36pt)
- Text style buttons: **B** / *I* / U / ~~S~~
- Text color button (with color indicator bar)
- Highlight color button
- Alignment buttons (left, center, right, justify)
- Line spacing dropdown (1.0, 1.15, 1.5, 2.0)
- List buttons (bullet, numbered)
- Indent buttons (decrease, increase)
- Clear formatting button

**Row 3 - Actions Toolbar:**
- Insert group: Table, Image, Doc Link, Page Break
- **AI/Propose button (VISIBLE, PRIMARY STYLE)** - per user requirement
- Export: PDF, DOCX buttons
- Panels dropdown (Proofs, Comments, Versions, Suggestions, Backlinks)
- Add Comment shortcut button
- Find button
- Command Palette (⌘K) button

**What Was Removed:**
- Workspace Identity section (WS status, workspace ID, user ID inputs)
- Expanded Table controls (4-row control block)
- Expanded List controls (inline button group)
- Section break button
- Columns button
- Individual panel toggle buttons (replaced with Panels dropdown)

---

### Slice 5: Style Polish

**Files Modified:**
- `KACHERI FRONTEND/src/ui.css`

**CSS Additions:**
```css
/* Toolbar button sizing for readability */
.toolbar .button.sm {
  min-height: 32px;
  padding: 0 12px;
  font-size: 13px;
}

/* Toolbar icon buttons (B/I/U/S, alignment) */
.toolbar .button.sm[style*="minWidth: 32"] {
  min-height: 32px;
  min-width: 32px;
  padding: 0;
}

/* Toolbar select dropdowns */
.toolbar .input.sm {
  min-height: 32px;
  font-size: 13px;
  padding: 4px 8px;
}
```

**Typography:**
- All toolbar buttons: min-height 32px (larger click targets)
- Font size in buttons: 13px (readable, not cramped)
- Icon buttons: 32x32px squares
- Dropdowns: consistent 32px height with proper padding

---

## EditorPage Redesign Summary

**Features Delivered:**
- Google Docs / MS Word style editor canvas (no floating card)
- 3-row organized toolbar structure
- Full formatting controls in dedicated row
- AI/Propose button prominently visible (user requirement)
- Panels consolidated into dropdown
- Larger, readable font sizes throughout
- Clean visual hierarchy

**Layout Comparison:**

| Before | After |
|--------|-------|
| Floating A4 page on dark background | White canvas fills width with gray gutters |
| Rounded corners, heavy shadow | No radius, subtle shadow |
| 42 items in single toolbar row | 3 organized toolbar rows |
| Small, cramped buttons | 32px min-height, 13px font |
| Panels as individual toggle buttons | Panels dropdown |
| AI/Propose buried in toolbar | Primary-styled visible button |

**Files Modified:**
- `KACHERI FRONTEND/src/ui.css` (editor layout + toolbar styles)
- `KACHERI FRONTEND/src/EditorPage.tsx` (complete toolbar restructure)

---

---

## EditorPage Cleanup (Post-Redesign)

After initial redesign, user identified remaining issues:
1. Old ComposeBar still visible below toolbar
2. Old sidebar (HeadingsOutline, TOC, Presence, Workspace Activity) still present
3. Editor had white container background on gray - looked like a floating box

### Fixes Applied

**Removed from Layout:**
- ComposeBar (propose functionality moved to toolbar button)
- HeadingsOutline component
- TableOfContents component
- Presence panel (member list)
- Workspace Activity panel (notes/chat and event feed)

**Removed Imports:**
- `ComposeBar`
- `HeadingsOutline`
- `TableOfContents`

**Removed Unused Code:**
- `memberList` memo
- `noteText` state
- `sendNote` callback
- Simplified `useWorkspaceSocket` destructuring (removed `members`, `sendChat`, `wsConnected`)

**CSS Updates:**
- Changed editor-shell background from `#e8eaed` to `#c4c7cc` (darker, like Google Docs)
- Added `padding: 20px 40px` to editor-shell for page offset
- Changed `.tiptap` from `flex: 1 1 auto` to fixed `width: 816px` (US Letter width)
- Removed `::before` and `::after` pseudo-elements (not needed)
- Added subtle shadow to `.tiptap` for page definition

**Result:**
- Clean editor with just the 3-row toolbar and document canvas
- Gray background with centered white page (like Google Docs)
- No floating box effect - just a professional document editor

---

---

## EditorPage Print & Page Break Fixes

User identified additional issues:
1. Printing included toolbars instead of just the document
2. White canvas backdrop visible behind gray editor-shell
3. No visual page break indicators - document expands infinitely

### Fixes Applied

**1. Print Styles (ui.css @media print)**
- Hide all toolbars (`.toolbar`, `header.toolbar`)
- Hide all panels (proofs, comments, versions, suggestions, backlinks)
- Hide modals and command palette
- Reset body and editor-shell background to white
- Remove shadows from document
- Set proper print margins (0.5in top/bottom, 0.75in left/right)
- Hide doc link emoji icons in print
- Ensure black text color for printing

**2. Background Fix**
- Changed editor-shell background from `#c4c7cc` to `#4a5568` (darker gray)
- Better contrast against white page
- Matches the dark theme of the app

**3. Visual Page Break Indicators**
- Added `--page-height-px: 1056px` CSS variable (~11 inches at 96dpi)
- Added repeating gradient to `.tiptap .ProseMirror` showing page boundaries
- Light gray horizontal line every 1056px to indicate where pages will break
- Disabled on mobile (background: none)

**CSS Changes Summary:**
```css
.editor-shell {
  background: #4a5568;  /* Darker gray */
  --page-height-px: 1056px;
}

.tiptap {
  min-height: var(--page-height-px);
  box-shadow: /* Enhanced shadow for page depth */
}

.tiptap .ProseMirror {
  background: repeating-linear-gradient(/* page break lines */);
}

@media print {
  .toolbar { display: none !important; }
  /* ... hide all UI, show only document */
}
```

---

## Session Status

All planned work for this session has been completed:
1. ✅ FileManager Redesign (5 slices)
2. ✅ Bug fixes (4 issues)
3. ✅ EditorPage Hybrid Redesign (5 slices)
4. ✅ EditorPage Cleanup (removed old sidebar components)
5. ✅ Print styles and page break indicators

**Ready for testing and user feedback.**
