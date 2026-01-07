# Session Report: Enhanced PDF Import with Side-by-Side View + AI Field Detection

**Date:** December 25, 2025
**Session Duration:** Full implementation session
**Focus Area:** PDF Import Enhancement

---

## Executive Summary

This session implemented a comprehensive enhanced PDF import experience for Kacheri. The implementation adds a side-by-side view showing the original PDF alongside extracted editable text, AI-powered field detection to highlight editable fields (dates, names, amounts), improved structure detection using font metadata, and original PDF preservation for reference viewing.

---

## Goals Achieved

1. **Side-by-side PDF import view** - Original PDF on the left, extracted editable text on the right
2. **AI-powered field detection** - Identify and highlight editable fields with color coding
3. **Improved structure detection** - Font size heuristics for heading detection
4. **Original PDF preservation** - Source PDFs stored and viewable alongside extracted text
5. **Full provenance tracking** - All operations recorded with proof packets
6. **API Contract updated** - All new endpoints documented

---

## Implementation Details

### Phase 1: Backend Enhancements

#### Files Modified

**`KACHERI BACKEND/src/routes/importDoc.ts`**

Added three new features:

1. **PDF Source Serving Endpoint** (`GET /docs/:id/import/source`)
   - Finds the most recent `*_source.pdf` in the upload directory
   - Streams the PDF with `application/pdf` MIME type
   - Returns 404 if no source file found

2. **Import Metadata Endpoint** (`GET /docs/:id/import/meta`)
   - Queries the `proofs` table for import records
   - Returns `kind`, `sourceUrl`, `meta`, and `ts`
   - Frontend uses this to decide which modal to show

3. **Enhanced PDF Extraction with Font Metadata**
   - New `TextBlock` interface capturing `text`, `fontSize`, `fontFamily`, `isBold`, `y`, `x`, `pageNum`
   - `extractPdfTextWithMetadata()` function using pdfjs-dist's `getTextContent()` API
   - Extracts font size from `item.transform[0]`, font name from `item.fontName`
   - Falls back to simple extraction on error

4. **Improved `textToHtmlWithStructure()` Function**
   - Calculates base font size as median of all font sizes
   - Heading detection thresholds:
     - h1: fontSize > 1.5x base
     - h2: fontSize > 1.3x base
     - h3: fontSize > 1.15x base OR bold text
   - Groups text blocks by proximity for paragraphs

#### New Files Created

**`KACHERI BACKEND/src/routes/ai/detectFields.ts`**

AI-powered field detection endpoint:

```typescript
POST /docs/:id/ai/detectFields
```

- Accepts `text`, optional `fieldTypes`, `provider`, `model`
- Uses AI to identify fields in 4 categories: `date`, `name`, `amount`, `custom`
- Returns array of `DetectedField` objects with `type`, `value`, `start`, `end`, `confidence`
- Records proof packet and provenance for audit trail
- Broadcasts WebSocket events for real-time UI updates

**`KACHERI BACKEND/src/server.ts`** (Modified)

- Imported and registered `aiDetectFieldsRoutes`
- Added `/docs/:id/ai/detectFields` to the routes index

---

### Phase 2: Frontend - PDF Viewer Component

**`KACHERI FRONTEND/package.json`** (Modified)

Added dependency:
```json
"pdfjs-dist": "^4.0.379"
```

**`KACHERI FRONTEND/src/components/PDFViewer.tsx`** (Created)

Canvas-based PDF renderer with:
- pdfjs-dist integration using CDN worker
- Page navigation (Prev/Next buttons)
- Page counter display
- Loading and error states
- Scale prop for zoom control
- `onPageChange` callback for parent synchronization

---

### Phase 3: Frontend - PDF Import Modal

**`KACHERI FRONTEND/src/components/PDFImportModal.tsx`** (Created)

Side-by-side modal component featuring:

| Left Panel | Right Panel |
|------------|-------------|
| PDFViewer component | Editable extracted HTML |
| Page navigation | "Detect Fields" button |
| PDF controls | Field highlighting |

Key features:
- Font size controls (A-, A+)
- Fullscreen toggle
- Escape key to close
- ContentEditable div for text editing
- Field highlighting with color-coded `<mark>` tags
- Field count badge when fields detected

**`KACHERI FRONTEND/src/EditorPage.tsx`** (Modified)

Integration changes:
- Imported `PDFImportModal` component
- Added `pdfImportOpen` and `pdfImportData` state
- Modified import handoff detection to check `DocsAPI.getImportMeta()`
- If `kind` contains "pdf", show `PDFImportModal` instead of `DiffModal`
- Added `onDetectFields` callback that calls `AiAPI.detectFields()`
- Records `import:apply:pdf` provenance on accept

**`KACHERI FRONTEND/src/api.ts`** (Modified)

Added API methods:
```typescript
// Get import metadata
DocsAPI.getImportMeta(id: string)

// Detect fields using AI
AiAPI.detectFields(id: string, body: {
  text: string;
  fieldTypes?: string[];
  provider?: ProviderName;
  model?: string;
})

// DetectedField type export
export type DetectedField = {
  type: "date" | "name" | "amount" | "custom";
  value: string;
  start: number;
  end: number;
  confidence: number;
};
```

---

### Phase 4: CSS Styles

**`KACHERI FRONTEND/src/ui.css`** (Modified)

Added comprehensive styles for:

**PDF Viewer:**
```css
.pdf-viewer
.pdf-controls
.pdf-canvas-container
.pdf-canvas
```

**Field Highlighting (color-coded by type):**
| Field Type | Background Color | Text Color |
|------------|-----------------|------------|
| `date` | #dbeafe (blue) | #1e40af |
| `name` | #fef3c7 (amber) | #92400e |
| `amount` | #dcfce7 (green) | #166534 |
| `custom` | #f3e8ff (purple) | #6b21a8 |

**PDF Import Modal:**
```css
.pdf-import-editable
.pdf-import-editable h1/h2/h3/h4
.field-badge
```

---

### Phase 5: API Contract Update

**`docs/API_CONTRACT.md`** (Modified)

Added documentation for:

1. **`GET /docs/:id/import/source`**
   - Retrieve original uploaded PDF for side-by-side viewing

2. **`GET /docs/:id/import/meta`**
   - Get import metadata including `kind`, `sourceUrl`, `meta`

3. **`POST /docs/:id/ai/detectFields`**
   - Full documentation with request/response schemas
   - Supported field types table
   - Example payloads

4. **Data Models:**
   - Added `DetectedField` interface
   - Updated `ProofKind` union type with new values

5. **Changelog:**
   - Added v1.1.0 section documenting all enhancements

---

## Files Summary

### New Files (3)

| File | Lines | Purpose |
|------|-------|---------|
| `KACHERI FRONTEND/src/components/PDFViewer.tsx` | ~210 | pdfjs-dist wrapper with navigation |
| `KACHERI FRONTEND/src/components/PDFImportModal.tsx` | ~280 | Side-by-side modal component |
| `KACHERI BACKEND/src/routes/ai/detectFields.ts` | ~220 | AI field detection endpoint |

### Modified Files (7)

| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/routes/importDoc.ts` | +2 GET routes, enhanced extraction |
| `KACHERI BACKEND/src/server.ts` | Register detectFields route |
| `KACHERI FRONTEND/package.json` | Add pdfjs-dist dependency |
| `KACHERI FRONTEND/src/api.ts` | Add getImportMeta, detectFields, DetectedField type |
| `KACHERI FRONTEND/src/EditorPage.tsx` | PDFImportModal integration |
| `KACHERI FRONTEND/src/ui.css` | PDF viewer + field highlighting styles |
| `docs/API_CONTRACT.md` | New endpoints + v1.1.0 changelog |

---

## Data Flow

```
User uploads PDF
       │
       ▼
POST /docs/import
       │
       ├──► Store source: storage/uploads/doc-{id}/{ts}_source.pdf
       │
       ├──► Extract with font metadata (pdfjs-dist)
       │
       ├──► Convert to HTML with heading detection
       │
       └──► Response: { docId, html, source, meta }
              │
              ▼
       Frontend caches HTML
       Navigate to /doc/{id}?from=import
              │
              ▼
       EditorPage detects import
       Fetches GET /docs/{id}/import/meta
              │
              ├── kind='pdf:*' ──► PDFImportModal
              │                         │
              │                    ┌────┴────┐
              │                    │ PDF     │ Extracted
              │                    │ Viewer  │ Text
              │                    └────┬────┘
              │                         │
              │                    [Detect Fields]
              │                         │
              │                         ▼
              │              POST /docs/{id}/ai/detectFields
              │                         │
              │                         ▼
              │                    Highlight fields
              │                         │
              │                    [Accept & Import]
              │                         │
              └── kind='docx'... ──► DiffModal (existing)
                                        │
                                        ▼
                               Editor.setHTML(html)
```

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PDF Viewer Library | pdfjs-dist | Already in backend, proven, MIT license |
| Worker Loading | CDN | Avoid bundling issues with Vite |
| Modal Type | New PDFImportModal | Keep existing DiffModal for non-PDF imports |
| AI Detection Trigger | On-demand button | Respects provenance; user controls AI |
| AI Provider | User's current setting | Respect preferences from localStorage |
| Heading Detection | Font size heuristics | Simple, no external dependencies |
| Field Highlighting | Inline `<mark>` tags | Works with contentEditable |

---

## Key Algorithms

### Font-Based Heading Detection

```typescript
const baseFontSize = median(blocks.map(b => b.fontSize));

if (fontSize > baseFontSize * 1.5) → <h1>
else if (fontSize > baseFontSize * 1.3) → <h2>
else if (fontSize > baseFontSize * 1.15 || isBold) → <h3>
else → <p>
```

### Field Highlighting

```typescript
// Sort fields by position descending to avoid offset issues
const sorted = [...fields].sort((a, b) => b.start - a.start);

// Replace each field value with highlighted version
for (const field of sorted) {
  html = html.replace(
    field.value,
    `<mark class="field-highlight-${field.type}">${field.value}</mark>`
  );
}
```

---

## Provenance Tracking

All operations record provenance:

| Action | Proof Kind | Details |
|--------|------------|---------|
| PDF Import | `import:pdf` | Source hash, converted hash, tool used |
| Field Detection | `ai:detectFields` | Input text, detected fields, provider/model |
| Import Accept | `import:apply:pdf` | HTML preview, user actor |

---

## Testing Recommendations

- [ ] Upload multi-page PDF and verify page navigation
- [ ] Verify heading detection on PDFs with varying font sizes
- [ ] Test "Detect Fields" with different AI providers
- [ ] Confirm field highlighting colors match design
- [ ] Test Accept flow applies HTML correctly to editor
- [ ] Verify provenance records for all operations
- [ ] Check DOCX imports still use DiffModal (not PDFImportModal)
- [ ] Test escape key closes modal
- [ ] Test fullscreen toggle

---

## Future Enhancements

1. **Synchronized scrolling** - Scroll PDF and text panels together
2. **Field editing** - Click highlighted field to edit inline
3. **Custom field types** - User-defined field categories
4. **Batch field detection** - Process multiple PDFs at once
5. **ONNX model integration** - Local document layout analysis
6. **PDF annotation overlay** - Show detected fields on PDF itself

---

## Session Metrics

- **Total new files:** 3
- **Total modified files:** 7
- **New API endpoints:** 3
- **New React components:** 2
- **CSS rules added:** ~100 lines
- **API contract additions:** ~150 lines

---

*Session completed successfully. All planned phases implemented and documented.*
