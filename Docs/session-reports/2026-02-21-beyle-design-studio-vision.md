# Session Report: Beyle Design Studio — Vision & Work Scope

**Date:** 2026-02-21
**Goal:** Brainstorm, architect, and document the full work scope for Beyle Design Studio — the AI-powered interactive content engine
**Branch:** main

---

## Documents Read

| Document | Path | Relevant Section |
|----------|------|-----------------|
| Roadmap | `Docs/Roadmap/docs roadmap.md` | Full document — pilot and prod-ready scope |
| Architecture Blueprint | `Docs/blueprint/architecture blueprint.md` | Phase 6: Slides & Sheets scaffolding |
| Cross-Doc Intelligence Work Scope | `Docs/Roadmap/cross-document-intelligence-work-scope.md` | Format reference |
| Editor Layout Session Report | `Docs/session-reports/2026-02-21-editor-layout-completion.md` | Current project status |
| API Contract | `Docs/API_CONTRACT.md` | Existing endpoint patterns |

## Session Context

All Docs roadmap phases (pilot + prod-ready) are substantially complete. The architecture blueprint identifies Phase 6 as "Slides & Sheets scaffolding" with current status at ~10%. This session establishes the vision and full work scope for the Slides surface, now evolved into a broader product: **Beyle Design Studio**.

---

## Key Decisions Made

### 1. Product Direction: AI-Powered Code Generation, Not Static Slides

Instead of building a traditional slide editor (drag-and-drop boxes on a canvas), the product direction is an AI-powered content engine where:
- AI writes HTML/CSS/JS code that renders as interactive visual content
- Users direct the AI through conversation (Simple Mode) or edit code directly (Power Mode)
- Output is not limited to "slides" — it encompasses presentations, web pages, notebooks, and embeddable widgets

### 2. Product Name: Beyle Design Studio

Chosen over alternatives (Kacheri Slides, Kacheri Canvas, Kacheri Stage). "Design Studio" communicates the generative/creative nature of the tool and positions it as a professional content creation platform, not just a slide maker.

### 3. Architecture: Layered Runtime

Four-layer architecture validated through external review (ChatGPT):
- **Layer 4 (App Shell):** React — consistent with Kacheri Docs frontend
- **Layer 3 (Frame Isolation):** Sandboxed iframes with strict CSP
- **Layer 2 (KCL):** Kacheri Component Library — vanilla JS custom elements, framework-agnostic, version-pinned
- **Layer 1 (AI Engine):** Generates HTML/CSS/JS targeting KCL components

### 4. Content Model: Frames, Not Slides

The atomic unit is a **Frame** — a self-contained HTML document. Frames compose into different output modes (Deck, Page, Notebook, Widget). A **Canvas** holds frames, conversation history, and composition settings.

### 5. Frame Independence

Frames are independent — no cross-frame shared state. All interactivity lives inside a single frame. Cross-frame concerns (transitions, theme consistency) handled at composition level only.

### 6. Fully Generative Design

No templates. AI controls all design decisions (typography, color, layout, animation). Constrained only by optional brand guidelines, accessibility standards, and KCL component contracts.

### 7. KCL Narrow Waist

KCL is opinionated about structure (charts, layouts, animations) but flexible about styling (CSS handles all visual customization). This prevents KCL from becoming "React but worse" while keeping 80% of outputs clean and consistent.

---

## External Architecture Review

ChatGPT was consulted for an independent architecture review. Key findings incorporated:

1. **KCL version pinning** — mandatory per canvas to prevent "why did my old canvas change?" drift
2. **Frame lock mode** — finalized canvases become immutable
3. **Data binding via `<script data-for>`** — avoids attribute escaping nightmares
4. **Three render modes** — thumbnail/live/presentation to handle 200+ frame canvases
5. **No cross-frame state** — explicit constraint to avoid accidentally building a mini-app framework
6. **Security: frames as pure functions** — data in, visual out, no side effects

All findings are documented as "Architectural Guardrails" in the work scope.

---

## Deliverables

| Deliverable | Path | Status |
|-------------|------|--------|
| Beyle Design Studio Work Scope | `Docs/Roadmap/beyle-design-studio-work-scope.md` | COMPLETE (Draft) |
| This Session Report | `Docs/session-reports/2026-02-21-beyle-design-studio-vision.md` | COMPLETE |

---

## Work Scope Summary

| Phase | Slices | Focus | Estimated Effort |
|-------|--------|-------|-----------------|
| A | A1–A6 | Foundation: Database, Store, API, KCL v1 | 14-17 days |
| B | B1–B4 | AI Engine & Conversation | 7-11 days |
| C | C1–C5 | Frontend: App Shell & Simple Mode | 10-14 days |
| D | D1–D7 | Frontend: Power Mode & Exports | 11-17 days |
| E | E1–E6 | Polish, Security & Testing | 9-12 days |
| **Total** | **28 slices** | | **49-68 days** |

## Dependency Decisions Pending

1. **Chart rendering library** — Custom SVG vs Chart.js vs uPlot
2. **Code editor** — CodeMirror 6 (recommended) vs Monaco
3. **PPTX generation** — pptxgenjs (recommended) vs python-pptx
4. **Thumbnail capture** — html2canvas vs iframe canvas API
5. **Icon set for KCL** — Lucide subset vs custom SVG sprites

---

## Risks Identified

1. **KCL scope creep** — Must maintain narrow waist; new components require work scope amendment
2. **AI code generation reliability** — HTML is the most reliable target, but complex layouts may fail; retry + rollback mitigates
3. **PPTX fidelity** — PowerPoint's object model is fundamentally different from HTML; lossy conversion is expected and communicated
4. **Performance at scale** — 200+ frame canvases need careful iframe management; three-render-mode system addresses this

---

## Next Steps

1. **Get work scope approval** from user
2. **Resolve dependency decisions** (chart library, code editor, PPTX lib)
3. **Begin Phase A** — database schema + KCL core components can start in parallel
4. **Update architecture blueprint** to reflect Beyle Design Studio addition

---

## What Was NOT Changed

- No code modified
- No dependencies added
- No migrations created
- No API contract changes
- No roadmap changes

This was a pure planning/documentation session.
