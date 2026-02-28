# Session Report: View Original Feature Implementation

**Date:** 2026-01-09
**Context:** Adding "View Original" button for imported documents

---

## Session Goal

Implement a "View Original" button that allows users to view the original source file (PDF, DOCX, etc.) after a document has been imported, extending the import workflow beyond the initial review modal.

---

## Documents Read

- `Docs/Roadmap/docs roadmap.md` - Section 1.6 (Import, Export & Artifacts)
- `Docs/blueprint/architecture blueprint.md` - Client/Backend layers
- `Docs/API_CONTRACT.md` - Import endpoints (lines 1034-1085)
- `KACHERI FRONTEND/src/EditorPage.tsx` - Main editor integration point
- `KACHERI FRONTEND/src/components/PDFViewer.tsx` - Existing PDF viewer to reuse
- `KACHERI FRONTEND/src/components/PDFImportModal.tsx` - Reference for modal patterns
- `KACHERI BACKEND/src/routes/importDoc.ts` - Backend endpoints (already complete)

---

## Architecture & Roadmap Alignment

**Roadmap Section 1.6 (Pilot-Ready):**
> "Universal /docs/import route with layered converters... Never-blank guarantee and Import Review diff"

This feature extends the import experience post-acceptance. No new backend work required.

**Architecture:**
- Frontend-only changes
- Uses existing `GET /docs/:id/import/source` and `GET /docs/:id/import/meta` endpoints
- Follows existing modal patterns (DiffModal, PDFImportModal)

---

## Constraints & Assumptions

1. Backend endpoints are complete and documented - no changes needed
2. Original source files are already stored at `storage/uploads/doc-{docId}/`
3. Button should only appear for imported documents (not new documents)
4. Non-PDF formats (DOCX) cannot be previewed - download link shown instead

---

## Implementation Plan

### Files to Create
- `KACHERI FRONTEND/src/components/OriginalSourceModal.tsx` (~120 lines)

### Files to Modify
- `KACHERI FRONTEND/src/EditorPage.tsx` (~20 lines added)

### Changes Overview
1. Create `OriginalSourceModal` component with PDF/image/download support
2. Add `importMeta` state to EditorPage
3. Fetch import metadata on document load
4. Add "Original" button to toolbar (conditional)
5. Add command palette entry
6. Render modal

---

## Risks Identified

- None significant. Backend is complete, pattern is established.

---

## Progress Log

### Slice 1: Session initialization
- Created session report
- Reviewed architecture and roadmap
- Confirmed backend readiness

### Slice 2: Implementation complete
- Created `OriginalSourceModal.tsx` (~200 lines)
  - PDF viewing via existing PDFViewer component
  - Image viewing via native `<img>` tag
  - Download link for non-viewable formats (DOCX, etc.)
  - Full-screen toggle, metadata display
- Modified `EditorPage.tsx`:
  - Added import for OriginalSourceModal
  - Added `importMeta` and `originalSourceOpen` state
  - Added useEffect to fetch import metadata on doc load
  - Added "Original" button in toolbar (conditional, after DOCX button)
  - Added "View Original Source" command palette entry
  - Rendered OriginalSourceModal

---

## What Changed

| File | Change |
|------|--------|
| `src/components/OriginalSourceModal.tsx` | NEW - View-only modal for imported source files |
| `src/EditorPage.tsx` | Added state, button, command, modal rendering |

---

## Verification Steps

1. Import a PDF file → Accept import → Verify "Original" button appears
2. Click "Original" button → PDF should display in modal
3. Test full-screen toggle and close (button + Escape key)
4. Import DOCX → Verify download link appears instead of preview
5. Create new document (not imported) → Verify button is hidden
6. Open command palette (Cmd+K) → Search "original" → Verify command works

---

## Follow-ups

- Option 2 (Attachments System) added to roadmap Section 2.8 for Prod-Ready scope
