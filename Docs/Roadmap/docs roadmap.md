Kacheri Docs – Pilot vs Prod-Ready Work Scope
This document outlines the work scope for the Kacheri Docs slice in two phases:
1) Pilot-ready scope: what must be in place for an impressive pilot with enterprises.
2) Next prod-ready scope: what comes next to harden, scale, and polish for broad rollout.

All items from the Docs Completion Roadmap and the Kacheri Docs Parity Backlog are assigned to one of these phases.
1. Pilot-Ready Docs Scope
Goal: Deliver a docs experience that feels on par with existing enterprise tools (Google Docs / Notion / Confluence) while showcasing Kacheri’s AI-with-proofs moat.
1.1 Editor & Layout (Parity + “Wow” Layer)
•	Tables: insert, resize, merge/split cells, basic formatting (header row, alignment).
•	Images: insert, resize, align, optional captions.
•	Page layout v1: page size (A4/Letter), margins, orientation, headers/footers, page numbers.
•	Document structure: section/page breaks and basic 1–2 column layouts per section.
•	Table of contents generated from headings, with clickable navigation.
•	Advanced lists v1: multi-level bullets and numbered lists with simple legal-style patterns.
•	Find & replace with in-document navigation (jump between matches, headings navigation).
1.2 Collaboration & Review
•	Inline comments anchored to selections/blocks, with threaded replies.
•	Resolve / reopen comment threads; @mentions of workspace users.
•	Suggestions / track changes mode with accept / reject (including accept/reject all).
•	Document-level version history v1: named versions with restore and basic diff.
•	Template gallery for common doc types (PRD, one-pager, meeting notes, etc.).
1.3 Workspace, Auth, RBAC & Sharing
•	Real authentication (e.g. OIDC/JWT) with stable user IDs used in proofs and provenance.
•	Workspace boundaries via workspace_id on docs, fs_nodes, proofs, provenance, artifacts.
•	Doc-level permissions: owner, editor, commenter, viewer, enforced on read/write/AI/export.
•	Workspace-level roles (owner/admin/member) controlling sharing and configuration.
•	Share dialog with per-user access (view/comment/edit) and workspace-wide share toggles.
•	Audit log v1 for membership changes, sharing updates, role changes, and destructive actions.
•	Trash / recovery for soft-deleted docs and folders.
1.4 File Manager, Home & Cross-Doc Linking
•	File Manager as primary home: two-panel layout (folders/docs tree + All Documents rail).
•	Folders + docs tree backed by fs_nodes, with create/rename/delete/move and attach existing docs.
•	All Documents panel with status chips for In File Manager / Not in File Manager.
•	Cross-doc links: insert link to another doc with title-aware picker and rename-safe references.
•	Backlinks: each doc shows a list of docs that link to it (simple backlink list; graph view later).
1.5 AI, Proofs & AI Watch (Pilot Slice)
•	All AI flows (compose, selective rewrite, constrained rewrite, imports) follow Propose → Preview → Approve.
•	Diff modal for all AI edits, with clear before/after and explicit approval step.
•	Proofs & Activity panel showing exports, AI actions, and provenance with hash verification.
•	PDF and DOCX exports produce proof packets and are listed with Verified/Unverified status.
•	AI Watch dashboard MVP: overall AI activity, export verification summary, simple Compose determinism check.
1.6 Import, Export & Artifacts (Pilot Slice)
•	Universal /docs/import route with layered converters (DOCX, PDF, HTML/MD/TXT, images via OCR).
•	Never-blank guarantee and Import Review diff; Accept applies imported HTML and records proofs.
•	Export to PDF and DOCX with layout fidelity for headers/footers, ToC, and page breaks.
•	Stable paths for exports/imports; proof rows include kind, hash, path, and metadata.
•	Artifacts model v0 relying on filesystem plus proofs table; full artifacts table deferred to next phase.
1.7 Ops, Safety & Platform (Pilot Level)
•	CLI scripts for replaying exports and AI compose to verify proofs on demand.
•	Basic guardrails: timeouts, retries, rate limits, and friendly error messages around AI calls.
•	Desktop-first responsive layout (laptop and large screen); basic tablet handling.
•	Keyboard shortcuts for core editing and navigation (bold/italic, headings, comments, palette).
2. Next Prod-Ready Docs Scope
Goal: Build on the pilot to harden the system for broad enterprise rollout, large documents, strict compliance, and long-term operations. This phase completes all remaining items from the Docs Completion Roadmap and the Parity Backlog.
2.1 Editor & Layout Extras
•	Richer multi-column layouts (2–3+ columns, section-specific headers/footers).
•	More advanced page numbering formats (i, ii, iii / 1, 2, 3 / section-based numbering). **COMPLETE** — DOCX: full format/position/startAt/section-reset support via OOXML post-processing. PDF: position mapping only (format/startAt/section-reset are Puppeteer limitations).
•	Full legal numbering system for lists (1.01, 1.02, 1.1.1, etc.).
•	Performance optimizations for very large docs (virtualization / lazy loading of content).
2.2 Collaboration Depth & History
•	Richer version history with visual diffs between arbitrary versions.
•	Filters in comments (by author, unresolved, type) and bulk operations (resolve all).
•	Notification hooks/integrations (email/Slack) for mentions and review assignments.
2.3 Advanced RBAC & Enterprise IT
•	Group-based roles (teams) and default permissions at workspace/organization level.
•	Optional external viewer role for read-only external sharing.
•	Directory sync / SCIM integration for user and group management (where required).
•	Legal hold and retention policies at doc/workspace level.
•	Expanded audit log with filters and export for compliance reviews.
2.4 Knowledge Graph & Wiki Features
•	Wiki-style graph view of docs and their links, with filters by tag, folder, or status.
•	Cross-workspace link controls (if allowed) with strict RBAC honoring. [DEFERRED alongside Section 2.3 — requires Advanced RBAC model for permission enforcement across workspace boundaries.]
•	Semantic search layer on top of cross-doc indexes, grounded in proofs.
2.5 Ops, Verification & Infra Hardening
•	verify:nightly script combining replay of exports and AI actions with PASS/FAIL/MISS reports.
•	CI/cron integration to run verification jobs automatically and archive JSON reports.
•	Full artifacts table with referential integrity, treating artifacts as canonical over filesystem.
•	Storage abstraction (putArtifact/getArtifact) ready for S3/GCS or similar object stores.
•	Background workers/queues for heavy imports, exports, and verification jobs.
•	Structured logs and metrics (AI latency/error, import/export success, WS health) integrated with observability stack.
2.6 Proof-Driven Moat & AI Safety UX
•	Per-doc proof health badges and AI-usage heatmaps highlighting AI-touched vs human-written sections.
•	Workspace-level AI Safety overview aggregating drift, verification failures, and AI usage hotspots.
•	Explicit provider/model/seed display in diff modals and Proofs views for transparency.
•	Onboarding flows, inline help, and micro-interactions that explain proof-driven AI to new users.
2.7 Platform Polish: Mobile, Accessibility, Offline Hardening
•	Responsive, mobile-friendly editor and File Manager layout for tablet and phone.
•	Accessibility improvements: ARIA roles, focus management, and screen reader support.
•	Offline behavior hardening: clear offline/online indicators, robust reconnect logic, better conflict UX.
•	Big-doc stability and regression tests for 100+ page documents.
2.8 Document Attachments System
Allow documents to have file attachments (PDFs, images, reference documents) that can be viewed without conversion. This addresses the "single window" need where users want to reference original files alongside editable content.
•	Per-document attachments: Upload and attach files (PDF, images, Office docs) to any document.
•	Inline attachment viewer: View attached PDFs/images directly within Kacheri without conversion.
•	Attachment storage: Files stored via existing storage abstraction (local/S3/GCS) with size limits per workspace.
•	Supported formats: PDF, PNG, JPG, GIF, WEBP, DOCX, XLSX, PPTX (view-only, no conversion).
•	Attachment proofs: SHA256 hashing and provenance tracking for all attachments.
•	RBAC integration: Attachment access follows document permissions (viewer+ can view, editor+ can add/remove).
•	Attachment panel UI: Collapsible sidebar or panel showing all attachments with preview thumbnails.
•	Maximum attachments per doc: Configurable limit (default 20 files, 100MB total per document).
3. Summary
Pilot-ready scope focuses on delivering a first impression that feels on par with existing tools, with strong collaboration, layout, File Manager, and AI-with-proofs experiences. The next prod-ready scope completes enterprise RBAC, ops, verification, performance, mobile, accessibility, and knowledge-graph capabilities so Kacheri Docs can scale as a core system of record.

---

4. BEYLE Platform — Unified Product Suite
**Status:** Unified roadmap finalized (2026-02-22). Implementation pending.
**Unified implementation roadmap:** `Docs/Roadmap/beyle-platform-unified-roadmap.md`
**Design Studio work scope:** `Docs/Roadmap/beyle-design-studio-work-scope.md`
**Historical Design Studio roadmap:** `Docs/Roadmap/beyle-design-studio-roadmap.md` (superseded by unified roadmap)
**Prerequisite:** Kacheri Docs pilot-ready scope (complete), Prod-ready Docs scope (substantially complete)
**Architecture Blueprint Phase:** Phase 6+

The BEYLE Platform is a unified system where one user identity accesses all products (Docs, Research Browser, Design Studio, future Sheets/Notes/Dev Studio), connected by a shared **Memory Graph** — a cross-product intelligence layer that knows about everything the user has worked on.

**Products:**
- **Kacheri Docs** — AI-native document editing with proofs (complete)
- **Beyle Design Studio** — AI-powered interactive content engine (implementation pending)
- **Beyle Jaal Research** — Verifiable research browser (standalone Electron app, sync connector pending)
- **Future:** Sheets, Notes, Dev Studio

**Memory Graph:** Extends the existing knowledge graph (workspace_entities, entity_mentions, entity_relationships) with multi-product support via `product_source` column, new entity types (web_page, research_source, design_asset, citation, event), and a unified ingest endpoint (`POST /platform/memory/ingest`). Each product can operate independently — the Memory Graph is a toggleable enhancement (`MEMORY_GRAPH_ENABLED`), not a dependency.

**Total unified effort:** 89-122 days (55 slices across 8 phases, including 9 Platform slices (P1-P9) adding ~8.5 days to the original 46-slice Design Studio roadmap).

4.1 Beyle Design Studio — AI-Powered Interactive Content Engine

Goal: Deliver Beyle Design Studio — the second major product in the Beyle Kacheri suite. An AI-powered content runtime where AI generates HTML/CSS/JS code for presentations, web pages, notebooks, and embeddable widgets, all backed by the Kacheri proof model.

4.1.1 Design Studio — Foundation (Phase A)
• Database schema: canvases, canvas_frames, canvas_conversations, canvas_versions, canvas_exports, canvas_assets, canvas_templates.
• Store layer: CRUD for all canvas entities with pagination, reordering, versioning.
• Canvas API routes: full CRUD for canvases and frames, workspace-scoped with RBAC.
• KCL v1 core components (13): kcl-slide, kcl-text, kcl-layout, kcl-image, kcl-list, kcl-quote, kcl-metric, kcl-icon, kcl-animate, kcl-code, kcl-embed, kcl-source.
• KCL v1 data visualization (4): kcl-chart, kcl-table, kcl-timeline, kcl-compare.
• KCL build system: standalone JS/CSS bundle, version pinning, multi-version serving.

4.2 Design Studio — AI Engine (Phase B)
• AI code generation engine: generate, edit, and restyle frames using KCL components.
• Doc cross-reference engine: pull content from Kacheri Docs with provenance links.
• AI image generation: text-to-image via configurable provider (DALL-E/Stability AI) with credit system.
• Canvas conversation API: per-canvas AI chat with streaming, proof packets, rate limiting.
• Canvas version and export API: named versions, snapshot/restore, export triggers.

4.3 Design Studio — Frontend Simple Mode (Phase C)
• Frontend types and API layer matching all backend schemas.
• Design Studio app shell: three-panel layout (rail + viewport + chat/properties).
• Frame viewport: sandboxed iframe renderer with KCL injection, thumbnail capture, error handling.
• Conversation panel: AI chat with streaming, diff preview, approve/reject, doc references.
• Presentation mode: fullscreen with transitions, keyboard navigation, presenter view.

4.4 Design Studio — Power Mode, Edit Mode & Export (Phase D)
• Power Mode code editor: syntax highlighting, KCL autocompletion, live preview, format on save.
• Export engine: HTML bundle, standalone HTML, PNG, SVG, PDF (Puppeteer), PPTX (pptxgenjs), video/MP4 (Puppeteer + ffmpeg).
• Canvas listing and file manager integration.
• Speaker notes with Tiptap.
• Canvas versions and history UI.
• Frame templates: save any frame as reusable template, template gallery with tags.

4.5 Design Studio — Edit Mode for Non-Coders (Phase F)
• KCL inspection protocol: editable property schema per component, selection bridge via postMessage.
• Properties Panel: visual controls for selected element (text, color, font, size, data grid).
• Inline text editing: double-click to edit text directly in viewport.

4.6 Design Studio — Polish, Security & Collaboration (Phase E)
• Frame security hardening: CSP audit, asset proxy, code sanitization.
• Performance optimization: three-render-mode system, virtual frame rail, iframe recycling.
• Proof integration: design proof kinds in ProofsPanel, proof links from conversation.
• Notebook composition mode: frames interleaved with Tiptap narrative blocks.
• Embed/widget mode: public embed routes, publish toggle, responsive embed snippets.
• External embed whitelist: YouTube, Vimeo, Google Maps, Codepen, Loom with per-frame CSP.
• Real-time collaboration: frame-level locking, presence indicators, canvas metadata sync via Yjs.
• Mobile Simple Mode: responsive layout, swipe navigation, touch-friendly prompt input.
• Documentation and testing: store tests, AI engine tests, KCL component tests, user docs.

**Estimated effort:** 73-101 days (36 implementation slices across 6 phases).
**Key dependencies requiring approval before start:** CodeMirror 6, chart rendering library, pptxgenjs, html2canvas, ffmpeg-static, image generation API provider, color picker component.

4.2 Platform Layer — Memory Graph & Product Independence
**Estimated effort:** ~8.5 additional days (9 Platform slices woven into Design Studio phases)

Platform slices establish the shared infrastructure for multi-product operation:
- **P1:** Memory Graph Schema Extension — extend entity_mentions with product_source + source_ref columns; make doc_id nullable; add new entity types (0.5 days, Phase 0)
- **P2:** Memory Graph Ingest Endpoint — POST /platform/memory/ingest for any product to push entities (1.5 days, Phase 1)
- **P3:** Platform Config — Memory Graph feature flag via MEMORY_GRAPH_ENABLED env var (0.5 days, Phase 0)
- **P4:** Personal Access Tokens — PAT CRUD + auth middleware for external clients like JAAL (1 day, Phase 1)
- **P5:** JAAL Sync Connector — maps research sessions to memory graph entities, batch upload (1 day, Phase 3)
- **P6:** Cross-Product Entity Display — product badges + filters + click-to-navigate in Knowledge Explorer (1 day, Phase 4)
- **P7:** Design Studio Memory Graph Awareness — AI queries memory graph for context during frame generation (1 day, Phase 3)
- **P8:** Docs Knowledge Indexer Memory Graph Bridge — update entityMentions store to explicitly tag docs mentions with product_source: 'docs'; add productSource/sourceRef fields (0.5 days, Phase 1)
- **P9:** Canvas Frame Embedding in Docs — Tiptap CanvasEmbed node extension for embedding Design Studio canvas frames inline in documents; read-only display with graceful placeholder when Design Studio disabled (1.5 days, Phase 5)

No new external dependencies required for Platform slices.
