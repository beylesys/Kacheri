# Kacheri Session Report - December 26, 2025 (Afternoon)

## Session Overview

This session implemented **Section 1.1: Editor & Layout** from the roadmap, specifically Phases 1, 3, and 4 to establish the complete page layout flow. The goal was to make the editor "pro-grade" with configurable page settings that persist and apply to exports.

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Focus Area** | Section 1.1 - Editor & Layout |
| **Phases Completed** | 3 of 7 |
| **New Files Created** | 2 |
| **Files Modified** | 7 |
| **API Endpoints Added** | 2 |
| **Database Columns Added** | 1 |

---

## Work Completed

### Phase 1: Database & API Foundation

**Goal:** Add `layout_settings` storage to documents

#### Database Migration (`db.ts`)

Added layout_settings column using existing migration pattern:

```typescript
addColumnIfMissing('docs', 'layout_settings', 'TEXT');
```

#### Layout Settings Schema (`store/docs.ts`)

```typescript
interface LayoutSettings {
  pageSize: 'a4' | 'letter' | 'legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;    // mm
    bottom: number;
    left: number;
    right: number;
  };
  header?: {
    enabled: boolean;
    content: string;  // HTML content
    height: number;   // mm
  };
  footer?: {
    enabled: boolean;
    content: string;  // HTML content
    height: number;   // mm
    showPageNumbers: boolean;
  };
}
```

#### API Endpoints (`server.ts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/docs/:id/layout` | Update document layout settings |
| `GET` | `/docs/:id/layout` | Get document layout settings (with defaults) |

---

### Phase 3: Page Layout UI

**Goal:** Page Setup dialog and live preview with CSS variables

#### PageSetupDialog Component

Created full-featured dialog with:
- Page size selector (A4, Letter, Legal)
- Orientation toggle (Portrait/Landscape)
- Margin inputs (Top, Bottom, Left, Right in mm)
- Header section with enable toggle, height, and content input
- Footer section with enable toggle, height, content, and page numbers checkbox
- Live preview showing page proportions and margin visualization

#### CSS Variable System

Added dynamic CSS variables to `ui.css`:

```css
.editor-shell {
  --page-width: 210mm;
  --page-height: 297mm;
  --page-margin-top: 24mm;
  --page-margin-bottom: 24mm;
  --page-margin-left: 24mm;
  --page-margin-right: 24mm;
}

.tiptap {
  padding-top: var(--page-margin-top);
  padding-bottom: var(--page-margin-bottom);
  padding-left: var(--page-margin-left);
  padding-right: var(--page-margin-right);
  width: var(--page-width);
  min-height: var(--page-height);
}
```

#### EditorPage Integration

- Added "Page" button to toolbar
- State management for layout settings
- Auto-load layout settings when document changes
- Dynamic CSS variable application based on settings

---

### Phase 4: Export Integration

**Goal:** PDF and DOCX exports respect layout settings

#### PDF Export (Puppeteer)

Updated `server.ts` export to use layout settings:

```typescript
const pdfOptions = {
  format: layout.pageSize.toUpperCase(),  // 'A4', 'LETTER', 'LEGAL'
  landscape: layout.orientation === 'landscape',
  margin: {
    top: `${margins.top}mm`,
    bottom: `${margins.bottom}mm`,
    left: `${margins.left}mm`,
    right: `${margins.right}mm`,
  },
  displayHeaderFooter: true,  // when header/footer enabled
  headerTemplate: layout.header?.content || '',
  footerTemplate: /* page numbers template */,
};
```

#### DOCX Export (html-to-docx)

Updated `exportDocx.ts` with twips conversion:

```typescript
const MM_TO_TWIPS = 56.7;  // 1mm = 56.7 twips

const docxOptions = {
  orientation: layout.orientation,
  pageSize: {
    width: Math.round((isLandscape ? size.height : size.width) * MM_TO_TWIPS),
    height: Math.round((isLandscape ? size.width : size.height) * MM_TO_TWIPS),
  },
  margins: {
    top: Math.round(layout.margins.top * MM_TO_TWIPS),
    bottom: Math.round(layout.margins.bottom * MM_TO_TWIPS),
    left: Math.round(layout.margins.left * MM_TO_TWIPS),
    right: Math.round(layout.margins.right * MM_TO_TWIPS),
  },
};
```

---

## Files Summary

### New Files Created

| File | Description |
|------|-------------|
| `FRONTEND/src/components/PageSetupDialog.tsx` | Page Setup dialog component |
| `FRONTEND/src/components/pageSetupDialog.css` | Dialog styling (dark theme) |

### Files Modified

| File | Changes |
|------|---------|
| `BACKEND/src/db.ts` | Added `layout_settings` column migration |
| `BACKEND/src/store/docs.ts` | Added `LayoutSettings` interface, `updateDocLayout()`, `getDocLayout()` |
| `BACKEND/src/server.ts` | Added layout endpoints, updated PDF export |
| `BACKEND/src/routes/exportDocx.ts` | Added layout settings to DOCX generation |
| `FRONTEND/src/api.ts` | Added `LayoutSettings` types, `DocsAPI.getLayout()`, `DocsAPI.updateLayout()` |
| `FRONTEND/src/EditorPage.tsx` | Integrated Page Setup button and dialog |
| `FRONTEND/src/ui.css` | Added CSS variables for dynamic page dimensions |

---

## Default Settings

```typescript
const DEFAULT_LAYOUT_SETTINGS = {
  pageSize: 'a4',
  orientation: 'portrait',
  margins: {
    top: 24,     // mm
    bottom: 24,
    left: 24,
    right: 24,
  },
};
```

---

## Page Size Reference

| Size | Width (mm) | Height (mm) |
|------|------------|-------------|
| A4 | 210 | 297 |
| Letter | 216 | 279 |
| Legal | 216 | 356 |

---

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `SqliteError: no such column: deleted_at` | Auto-resolved after server restart; migration ran successfully |

---

## Test Checklist

- [ ] Create new document, verify default A4 portrait layout
- [ ] Open Page Setup, change to Letter Landscape
- [ ] Verify editor preview shows wider page dimensions
- [ ] Set custom margins (30mm all sides)
- [ ] Enable footer with page numbers
- [ ] Export to PDF - verify Letter size, landscape, margins
- [ ] Export to DOCX - verify settings in Word
- [ ] Close and reopen document - verify settings persist

---

## Remaining Phases (Section 1.1)

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 2 | Image Enhancements (resize, align, captions) | Pending |
| Phase 5 | Document Structure (page/section breaks, columns) | Pending |
| Phase 6 | Advanced Lists (legal numbering 1.01, 1.1.1) | Pending |
| Phase 7 | Find & Replace | Pending |

---

## Architecture Decisions

### Why CSS Variables?

CSS variables allow the editor to dynamically reflect page dimensions without React re-renders. The variables are set as inline styles on the `.editor-shell` element and cascade to child elements.

### Why Store Layout Per-Document?

Each document may have different layout requirements (legal documents vs. letters vs. reports). Storing layout settings in the `docs` table allows per-document customization.

### Why Twips for DOCX?

Microsoft Office uses twips (1/1440 inch) for measurements. Converting mm to twips ensures accurate reproduction in Word.

---

## API Contract Additions

```markdown
### Document Layout

#### Get Layout Settings
- **GET** `/docs/:id/layout`
- Returns: `LayoutSettings` object with defaults if not set

#### Update Layout Settings
- **PATCH** `/docs/:id/layout`
- Body: `{ pageSize, orientation, margins, header?, footer? }`
- Returns: Updated `DocMeta` with `layoutSettings`
```

---

## Summary

Phases 1, 3, and 4 of Section 1.1 are complete. Documents now support configurable page layouts with:

- Persistent storage in SQLite
- Full UI for configuration
- Live preview in the editor
- Applied to both PDF and DOCX exports

The editor is now significantly closer to pro-grade document creation parity with Google Docs/Word.
