# Session Report: Design Studio Scope Finalization

**Date:** 2026-02-21
**Goal:** Review and finalize Beyle Design Studio work scope, incorporating user feedback on direct manipulation editing, and promoting several features from out-of-scope to in-scope.

---

## Documents Read

- `Docs/Roadmap/beyle-design-studio-work-scope.md` (draft)
- `Docs/blueprint/architecture blueprint.md`
- `Docs/Roadmap/docs roadmap.md`

## Architecture & Roadmap Sections Involved

- Architecture Blueprint: Phase 6 (Slides & Sheets scaffolding), System Architecture Diagram, Product Line
- Roadmap: New Design Studio phase addition

## Assumptions Ruled Out

- Non-technical users cannot rely solely on AI chat for all edits — a direct manipulation layer is required
- "Out of scope" does not mean "never" — several features are viable with labor/time investment only

## Key Decisions Made

### 1. Direct Manipulation Layer (Edit Mode)
- User identified gap: non-coders need visual editing (click to edit text, drag to reposition, resize handles, properties panel)
- Decision: Add "Edit Mode" as a third editing mode alongside Simple and Power
- Approach: Smart Properties Panel — select any element in viewport, see editable controls (text, colors, font, size, padding, data). NOT full drag-and-drop canvas builder.

### 2. Features Promoted from Out-of-Scope to In-Scope

| Feature | Reason for inclusion | Approach |
|---------|---------------------|----------|
| Video Export (MP4) | Puppeteer + ffmpeg, no licensing cost, high wow factor | New slice in Phase D |
| AI-Generated Imagery | High differentiator, build with credit system for cost control | New slice in Phase B |
| External Embeds (YouTube, Maps) | Whitelist approach manages security, low effort | New slice in Phase E |
| Real-Time Collaboration | Yjs already in stack, frame-level locking simplifies | New slice in Phase E |
| Mobile Simple Mode Editing | Chat UI is naturally mobile-friendly, responsive CSS | New slice in Phase E |
| Save Frame as Template | 80% of custom KCL value at 20% of effort | New slice in Phase D |

### 3. Features Remaining Out of Scope (with rationale)

| Feature | Reason |
|---------|--------|
| Custom KCL Component Authoring | Security complexity, replaced by "Save Frame as Template" |
| Kacheri Sheets Integration | Sheets doesn't exist yet |
| Offline Editing | Poor effort-to-wow ratio, architectural complexity |
| Multi-Page Site Routing | Scope creep into website builder territory |

## Risks Identified

- AI image generation introduces per-API-call cost (not purely labor) — needs pricing/credit strategy
- Edit Mode (Properties Panel) adds architectural complexity: bidirectional mapping between HTML and visual properties
- Real-time collaboration on canvases is simpler than Docs (frame-level locking vs character-level CRDT) but still adds surface area

## Documents Updated

1. `Docs/Roadmap/beyle-design-studio-work-scope.md` — Full update with all new features, slices, architecture, and effort estimates
2. `Docs/blueprint/architecture blueprint.md` — Design Studio product line, architecture layers, diagram update
3. `Docs/Roadmap/docs roadmap.md` — Design Studio phase addition

## Next Steps

- User to review and approve final work scope
- Dependency decisions to be made before Phase A begins
- Image generation pricing/credit strategy to be designed
