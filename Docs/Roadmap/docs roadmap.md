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
•	More advanced page numbering formats (i, ii, iii / 1, 2, 3 / section-based numbering).
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
•	Cross-workspace link controls (if allowed) with strict RBAC honoring.
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
3. Summary
Pilot-ready scope focuses on delivering a first impression that feels on par with existing tools, with strong collaboration, layout, File Manager, and AI-with-proofs experiences. The next prod-ready scope completes enterprise RBAC, ops, verification, performance, mobile, accessibility, and knowledge-graph capabilities so Kacheri Docs can scale as a core system of record.
