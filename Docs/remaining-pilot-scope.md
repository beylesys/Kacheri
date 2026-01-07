# Kacheri Docs — Remaining Pilot Scope

**Created:** 2025-12-29
**Status:** Active tracking document
**Current Completion:** 100% (updated 2025-12-29 — 10/10 items complete, PILOT READY)

---

## Overview

This document tracks all remaining work to reach **Pilot-Ready** status per the roadmap (`Docs/Roadmap/docs roadmap.md`). Items are prioritized by criticality for enterprise pilot demos.

---

## CRITICAL (Must Fix Before Pilot)

### 1. Headers & Footers Rendering
**Section:** 1.1 Editor & Layout, 1.6 Import/Export
**Gap:** ~~Schema supports headers/footers but they don't render in editor or exports.~~ **IMPLEMENTED 2025-12-29**
**Implementation:**
- Editor rendering: Header/footer zones in EditorPage.tsx with rich text support
- PDF export: Already working, updated page number format to "Page X of Y"
- DOCX export: Header HTML injection added, footer via `footerHTMLString` option
**Files modified:**
- `KACHERI FRONTEND/src/EditorPage.tsx` — Added header/footer zones with `dangerouslySetInnerHTML`
- `KACHERI FRONTEND/src/ui.css` — Added `.page-header`, `.page-footer` styles
- `KACHERI BACKEND/src/routes/exportDocx.ts` — Added header/footer content injection
- `KACHERI BACKEND/src/server.ts` — Updated PDF page number format
**Estimate:** ~~3-5 days~~ Done
**Status:** [x] Complete

---

### 2. Template Gallery
**Section:** 1.2 Collaboration & Review
**Gap:** ~~`TemplateGalleryModal.tsx` exists but no templates are seeded.~~ **VERIFIED COMPLETE**
**Finding (2025-12-29):** Templates are fully implemented with 6 seeded templates:
- `blank.json` - Basic blank document
- `prd.json` - Product Requirements Document
- `one-pager.json` - Executive summary format
- `meeting-notes.json` - Meeting notes with task lists
- `project-brief.json` - Full project planning structure
- `weekly-report.json` - Weekly status report
**Files verified:**
- `KACHERI BACKEND/templates/*.json` — 6 templates seeded
- `KACHERI BACKEND/src/store/templates.ts` — Load/list/get functions working
- `KACHERI BACKEND/src/routes/templates.ts` — GET /templates and GET /templates/:id working
- `KACHERI FRONTEND/src/api/templates.ts` — API client with list/get/createFromTemplate
- `KACHERI FRONTEND/src/components/TemplateGalleryModal.tsx` — 2-column grid UI working
**Estimate:** 0 days (already done)
**Status:** [x] Complete

---

### 3. CLI Verification Scripts
**Section:** 1.7 Ops, Safety & Platform
**Gap:** ~~Roadmap requires CLI scripts for replaying exports and AI compose. None found.~~ **VERIFIED COMPLETE 2025-12-29**
**Finding:** Scripts exist with different naming but identical functionality:

| Roadmap Request | Actual Implementation |
|-----------------|----------------------|
| `verify-exports.ts` | `scripts/replay_exports.ts` |
| `verify-ai.ts` | `scripts/replay_ai_compose.ts` |
| `verify-nightly.ts` | `scripts/nightly_verify.ts` |

**Capabilities:**
- Export verification: SHA256 hash comparison for PDF/DOCX files (PASS/FAIL/MISS)
- AI compose verification: Payload integrity + optional `--rerun` for drift detection
- Combined nightly report: JSON output to `.reports/` folder
- npm script: `npm run verify:nightly` (already in package.json)
**Estimate:** ~~1-2 days~~ Done (already existed)
**Status:** [x] Complete

---

## IMPORTANT (Should Fix)

### 4. @Mentions UI in Comments
**Section:** 1.2 Collaboration & Review
**Gap:** ~~`comment_mentions` table exists in DB. UI does NOT have @mention picker.~~ **IMPLEMENTED 2025-12-29**
**Implementation:**
- Created `MentionInput.tsx` — Textarea with @mention autocomplete popup
- Created `mentionInput.css` — Popup and mention tag styling
- Updated `CommentThread.tsx` — MentionInput for reply form, mention highlighting in rendered comments
- Updated `CommentsPanel.tsx` — Workspace members fetch, MentionInput for new comment form
**Features:**
- Type `@` to trigger autocomplete with workspace members
- Arrow keys / Enter / Tab for navigation and selection
- Mentions tracked in array and sent to API
- @mentions highlighted in rendered comments
**Estimate:** ~~0.5 days~~ Done
**Status:** [x] Complete

---

### 5. AI Watch Standalone Dashboard
**Section:** 1.5 AI, Proofs & AI Watch
**Gap:** ~~AI Watch metrics are buried in `FileManagerPage.tsx`. Not a dedicated view.~~ **VERIFIED COMPLETE 2025-12-29**
**Finding:** Full standalone dashboard already exists:
- `KACHERI FRONTEND/src/AIDashboard.tsx` — 909-line dashboard component
- Route `/ai-watch` already wired in `App.tsx:21`
- Backend endpoints: `/ai/watch/summary`, `/ai/watch/events`, `/ai/watch/exports-summary`
- Features: Metric tiles, export verification, AI insight generation, compose determinism, events feed
- FileManagerPage has summary widget + "Open full dashboard" link
**Estimate:** ~~1 day~~ 0 days (already done)
**Status:** [x] Complete

---

### 6. Keyboard Shortcuts Documentation
**Section:** 1.7 Ops, Safety & Platform
**Gap:** ~~Various shortcuts exist but no central documentation or discovery mechanism.~~ **IMPLEMENTED 2025-12-29**
**Implementation:**
- Created `KeyboardShortcutsModal.tsx` — Modal with categorized shortcuts
- Created `keyboardShortcutsModal.css` — Dark theme with keyboard key styling
- Updated `EditorPage.tsx` — State, Ctrl/Cmd+? hotkey, ? button in toolbar, rendered modal
**Features:**
- Organized shortcuts by category: General, Text Formatting, History, Selection, AI Actions
- Platform-aware modifier key display (⌘ on Mac, Ctrl on Windows)
- Ctrl/Cmd + Shift + ? opens modal
- ? button in toolbar for mouse access
- Escape and backdrop click to close
**Estimate:** ~~0.5 days~~ Done
**Status:** [x] Complete

---

## POLISH (Nice to Have)

### 7. Share Dialog Workspace Toggle
**Section:** 1.3 Workspace, Auth, RBAC & Sharing
**Gap:** ~~`workspace_access` column exists in DB but unclear if Share dialog exposes workspace-wide sharing toggle.~~ **VERIFIED COMPLETE 2025-12-29**
**Finding:** ShareDialog.tsx lines 262-296 already implement full workspace access toggle:
- Dropdown with options: "Use workspace role", "No access", "Can view", "Can comment", "Can edit"
- Only shown to owners when doc is in a workspace
- Calls `docPermissionsApi.updateWorkspaceAccess()` on change
**Estimate:** ~~0.5 days~~ 0 days (already done)
**Status:** [x] Complete

---

### 8. Rate Limiting on AI Calls
**Section:** 1.7 Ops, Safety & Platform
**Gap:** ~~No rate limiting middleware exists.~~ **IMPLEMENTED 2025-12-29**
**Implementation:**
- Installed `@fastify/rate-limit` plugin
- Created `src/middleware/rateLimit.ts` with per-route configuration
- Applied rate limits to all AI routes:
  - `/ai/compose`: 10/hour (strictest)
  - `/ai/rewriteSelection`: 30/hour
  - `/ai/constrainedRewrite`: 30/hour
  - `/ai/detectFields`: 50/hour
  - `/ai/:action`: 20/hour (generic)
- User-based keying (x-user-id > x-dev-user > IP)
- Standard rate limit headers in responses
**Estimate:** ~~0.5 days~~ Done
**Status:** [x] Complete

---

### 9. Multi-Level List Nesting Verification
**Section:** 1.1 Editor & Layout
**Gap:** ~~`OrderedListEnhanced.ts` exists but multi-level nesting behavior unclear.~~ **VERIFIED COMPLETE 2025-12-29**
**Finding:** Full multi-level list support exists in ui.css lines 1068-1144:
- **Bullets:** disc → circle → square (3 levels)
- **Numbers:** decimal → lower-alpha → lower-roman (3 levels)
- **Legal numbering:** 1. → 1.1 → 1.1.1 (CSS counters with `.legal-numbering` class)
- OrderedListEnhanced.ts adds `numberingStyle` attribute and `setNumberingStyle()` command
**Estimate:** ~~0.5 days~~ 0 days (already done)
**Status:** [x] Complete

---

### 10. Find & Replace + Headings Navigation
**Section:** 1.1 Editor & Layout
**Gap:** ~~`FindReplaceDialog.tsx` exists. Unclear if headings navigation (jump to heading) is connected.~~ **VERIFIED COMPLETE 2025-12-29**
**Finding:** Full implementation exists:
- **FindReplaceDialog.tsx:** Find/Replace with case-sensitive toggle, match counter, Prev/Next/Replace/All buttons
- **Headings Navigation:** Built into FindReplaceDialog (lines 330-372) with "Jump to heading" dropdown
- **HeadingsOutline.tsx:** Standalone outline component with clickable headings via `selectPlainTextRange()`
- **Ctrl/Cmd+F:** Opens Find & Replace dialog
**Estimate:** ~~0.5 days~~ 0 days (already done)
**Status:** [x] Complete

---

## Summary by Priority

| Priority | Item | Estimate | Status |
|----------|------|----------|--------|
| ~~CRITICAL~~ | ~~1. Headers & Footers~~ | ~~3-5 days~~ | **Complete** |
| ~~CRITICAL~~ | ~~2. Template Gallery~~ | ~~1-2 days~~ | **Complete** |
| ~~CRITICAL~~ | ~~3. CLI Verify Scripts~~ | ~~1-2 days~~ | **Complete** |
| ~~IMPORTANT~~ | ~~4. @Mentions UI~~ | ~~0.5 days~~ | **Complete** |
| ~~IMPORTANT~~ | ~~5. AI Watch Dashboard~~ | ~~1 day~~ | **Complete** |
| ~~IMPORTANT~~ | ~~6. Keyboard Shortcuts~~ | ~~0.5 days~~ | **Complete** |
| ~~POLISH~~ | ~~7. Share Dialog Toggle~~ | ~~0.5 days~~ | **Complete** |
| ~~POLISH~~ | ~~8. Rate Limiting~~ | ~~0.5 days~~ | **Complete** |
| ~~POLISH~~ | ~~9. List Nesting~~ | ~~0.5 days~~ | **Complete** |
| ~~POLISH~~ | ~~10. Find + Headings Nav~~ | ~~0.5 days~~ | **Complete** |

**Total Estimated Work:** 0 days — ALL ITEMS COMPLETE

---

## Recommended Order

1. ~~**Templates** (Quick win, improves first-run experience)~~ **DONE**
2. ~~**Headers & Footers** (Critical for export parity)~~ **DONE**
3. ~~**CLI Verify Scripts** (Demonstrates core moat)~~ **DONE**
4. ~~**AI Watch Dashboard** (Showcases differentiation)~~ **DONE**
5. ~~**Share Dialog Toggle** (Workspace sharing)~~ **DONE**
6. ~~**List Nesting** (Legal documents)~~ **DONE**
7. ~~**Find + Headings Nav** (Document navigation)~~ **DONE**
8. ~~**@Mentions UI** (Collaboration completeness)~~ **DONE**
9. ~~**Keyboard Shortcuts** (User discoverability)~~ **DONE**
10. ~~**Rate Limiting** (Abuse protection)~~ **DONE**

## PILOT SCOPE 100% COMPLETE

---

## Notes

- Items marked "Needs verification" should be checked before implementing — may already be complete
- UI redesign (Phase 1 & 2) completed 2025-12-29, not tracked here
- This is a living document — update status as work progresses
