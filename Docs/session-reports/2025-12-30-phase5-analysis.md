# Phase 5: Replay Analytics & Verification Dashboard — Implementation Tracker

**Date:** 2025-12-30
**Session Goal:** Complete Phase 5 to production-grade
**Status:** IN PROGRESS
**Full Spec:** [phase5-work-scope.md](../Roadmap/phase5-work-scope.md)

---

## Documents Read

| Document | Location | Status |
|----------|----------|--------|
| Architecture Blueprint | `Docs/blueprint/architecture blueprint.md` | Read |
| Roadmap | `Docs/Roadmap/docs roadmap.md` | Read |
| API Contract | `Docs/API_CONTRACT.md` | Read (AI Watch sections) |
| Session Report | `Docs/session-reports/2025-12-30-phase4-completion.md` | Read |
| Session Report | `Docs/session-reports/2025-12-30-repo-analysis.md` | Read |

---

## Phase 5 Progress Overview

| Priority | Category | Items | Complete | Status |
|----------|----------|-------|----------|--------|
| P0 | Automation | 3 | 2/3 | MOSTLY COMPLETE |
| P1 | Visual Trust Indicators | 4 | 4/4 | COMPLETE |
| P2 | Workspace Intelligence | 3 | 3/3 | COMPLETE |
| P3 | User Education | 3 | 3/3 | COMPLETE |
| P4 | Infrastructure Hardening | 4 | 4/4 | COMPLETE |
| P5 | Observability | 4 | 4/4 | COMPLETE |
| **Total** | | **21** | **20/21** | **95%** |

---

## CHECKPOINT P0: AUTOMATION (Critical)

**Status:** MOSTLY COMPLETE (P0.2 Deferred)
**Target:** Automated daily verification with notifications and report archiving

### P0.1 GitHub Actions Nightly Verification Workflow
- [x] Create `.github/workflows/nightly-verify.yml`
- [x] Configure cron schedule (2 AM UTC daily)
- [x] Set up Node.js environment
- [x] Run `npx tsx scripts/nightly_verify.ts`
- [x] Upload JSON report as workflow artifact
- [x] Configure repository secrets (documented in workflow)
- [x] Test manual trigger via workflow_dispatch

**Files Created:**
| File | Purpose |
|------|---------|
| `.github/workflows/nightly-verify.yml` | GitHub Actions workflow for automated nightly verification |

**Files Modified:**
| File | Changes |
|------|---------|
| None | |

---

### P0.2 Verification Failure Notifications
**Status:** DEFERRED (Slack webhook not configured)
- [ ] Add Slack webhook integration to `nightly_verify.ts`
- [ ] Add email notification option (SendGrid/SES)
- [ ] Create notification payload with failure summary
- [ ] Add `--notify` flag to script
- [ ] Configure secrets in GitHub Actions
- [ ] Test notification on failure

> **Note:** Slack notification step is included in workflow but commented out. Can be enabled by uncommenting and adding `SLACK_WEBHOOK_URL` secret.

**Files Created:**
| File | Purpose |
|------|---------|
| | |

**Files Modified:**
| File | Changes |
|------|---------|
| | |

---

### P0.3 Report Archiving System
- [x] Add `verification_reports` table to `db.ts`
- [x] Create `src/store/verificationReports.ts`
- [x] Create `src/routes/verificationReports.ts` with endpoints
- [x] Update `nightly_verify.ts` to save report to database
- [x] Add retention policy (90-day auto-delete via cleanup endpoint)
- [x] Register routes in `server.ts`
- [x] Update `API_CONTRACT.md`
- [x] Create frontend `ReportHistoryTable.tsx`
- [x] Create frontend `ReportDetailModal.tsx`
- [x] Add "Report History" section to AIDashboard
- [x] Add status filter
- [ ] Add date range filter (deferred — status filter implemented)
- [ ] Add trend chart (deferred)

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/store/verificationReports.ts` | CRUD operations for verification reports |
| `KACHERI BACKEND/src/routes/verificationReports.ts` | REST API endpoints for reports |
| `KACHERI FRONTEND/src/components/ReportHistoryTable.tsx` | Paginated report history table |
| `KACHERI FRONTEND/src/components/ReportDetailModal.tsx` | Modal for viewing full report details |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/db.ts` | Added `verification_reports` table with indexes |
| `KACHERI BACKEND/src/server.ts` | Registered verificationReports routes |
| `KACHERI BACKEND/scripts/nightly_verify.ts` | Added database save with status parsing |
| `KACHERI FRONTEND/src/api.ts` | Added verification report types and API functions |
| `KACHERI FRONTEND/src/AIDashboard.tsx` | Integrated ReportHistoryTable and ReportDetailModal |
| `Docs/API_CONTRACT.md` | Added Verification Report Endpoints section |

---

### P0 Completion Criteria
- [x] Nightly verification runs automatically via GitHub Actions
- [x] Manual trigger available
- [ ] Failures trigger Slack notification (DEFERRED)
- [x] Reports archived to database
- [x] Reports viewable in dashboard with history
- [x] 90-day retention policy active (via cleanup endpoint)

### P0 Implementation Notes
> **Session 2025-12-30:**
> - Completed P0.1 (GitHub Actions workflow) and P0.3 (Report Archiving) in full
> - P0.2 (Slack notifications) deferred until webhook is configured — step is ready in workflow
> - Frontend components use inline CSS-in-JS matching existing AIDashboard patterns
> - Backend follows existing store/routes patterns with Fastify typed routes
> - Report status: 'pass' (all green), 'fail' (any failures/drift), 'partial' (only misses)
> - triggeredBy field detects GitHub Actions environment automatically

---

## CHECKPOINT P1: VISUAL TRUST INDICATORS (High Priority)

**Status:** COMPLETE
**Target:** Visual proof status indicators throughout the UI

### P1.1 Per-Document Proof Health Badges
- [x] Create `GET /docs/:id/proof-health` endpoint
- [x] Calculate health score (healthy/stale/failed/unverified)
- [x] Add `POST /docs/proof-health/batch` for multiple docs
- [x] Update `API_CONTRACT.md`
- [x] Create `ProofHealthBadge.tsx` component
- [x] Add badge to FileManager document rows
- [x] Add badge to EditorPage header
- [x] Add tooltip explaining status

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/routes/proofHealth.ts` | Health calculation endpoint with batch support |
| `KACHERI FRONTEND/src/components/ProofHealthBadge.tsx` | Visual badge component with tooltip |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/server.ts` | Registered proofHealth routes |
| `KACHERI FRONTEND/src/api.ts` | Added ProofHealthAPI and types |
| `KACHERI FRONTEND/src/FileManagerPage.tsx` | Added badge to doc rows |
| `KACHERI FRONTEND/src/EditorPage.tsx` | Added badge to header |

---

### P1.2 AI-Usage Heatmap Overlay
- [x] Create `GET /docs/:id/ai-ranges` endpoint
- [x] Query proofs for AI actions with position data
- [x] Return array of ranges with action type, position, provider, model
- [x] Update `API_CONTRACT.md`
- [x] Create `AIHeatmark.ts` Tiptap Mark extension
- [x] Create `positionMapper.ts` utility (plain text ↔ ProseMirror)
- [x] Color coding by action type (compose=green, rewrite=blue, translate=yellow)
- [x] Create `AIHeatmapToggle.tsx` toggle button
- [x] Add toggle button to EditorPage toolbar
- [x] Persist toggle state to localStorage

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI FRONTEND/src/extensions/AIHeatmark.ts` | Tiptap Mark extension for highlighting |
| `KACHERI FRONTEND/src/utils/positionMapper.ts` | Plain text ↔ ProseMirror position mapping |
| `KACHERI FRONTEND/src/components/AIHeatmapToggle.tsx` | Toggle button component |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/routes/aiWatch.ts` | Added /docs/:id/ai-ranges endpoint |
| `KACHERI FRONTEND/src/extensions/index.ts` | Export AIHeatmark |
| `KACHERI FRONTEND/src/Editor.tsx` | Register AIHeatmark extension, expose editor |
| `KACHERI FRONTEND/src/EditorPage.tsx` | Added AIHeatmapToggle to toolbar |
| `KACHERI FRONTEND/src/api.ts` | Added AIRangesAPI and types |

---

### P1.3 Export Verification Badges
- [x] Enhanced verification badge in ProofsPanel (pass/fail/miss/pending/checking)
- [x] Add `POST /docs/:id/exports/:proofId/verify` endpoint
- [x] Update ProofsPanel export list with enhanced badges
- [x] Add "Verify Now" button
- [x] Show verification timestamp (relative time)
- [x] Tooltips explaining each status

**Files Created:**
| File | Purpose |
|------|---------|
| (none - enhanced existing) | |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI FRONTEND/src/ProofsPanel.tsx` | Enhanced badges, added Verify Now button |
| `KACHERI FRONTEND/src/api.ts` | Added verifyExport function to ProofHealthAPI |

---

### P1.4 Compose Determinism Indicator
- [x] Create `GET /docs/:id/compose-determinism` endpoint
- [x] Track pass/drift counts and rate
- [x] Create `ComposeDeterminismIndicator.tsx` component
- [x] Add indicator to EditorPage header (compact mode)
- [x] Color coded: green (>95%), yellow (70-95%), red (drift detected)
- [x] Tooltip with details

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI FRONTEND/src/components/ComposeDeterminismIndicator.tsx` | Determinism status component |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/routes/aiWatch.ts` | Added /docs/:id/compose-determinism endpoint |
| `KACHERI FRONTEND/src/api.ts` | Added ComposeDeterminismAPI and types |
| `KACHERI FRONTEND/src/EditorPage.tsx` | Added indicator to header |

---

### P1 Completion Criteria
- [x] Every document shows proof health badge
- [x] AI-touched sections visually distinguishable (heatmap toggle)
- [x] Exports show verification status with Verify Now button
- [x] Compose actions show determinism status
- [x] All badges have tooltips

### P1 Implementation Notes
> **Session 2025-12-30:**
> - Implemented all 4 sub-items of P1 Visual Trust Indicators
> - ProofHealthBadge shows healthy (green) / stale (yellow) / unverified (gray) / failed (red)
> - Health score calculation: based on export pass rates, compose drift, and staleness (7-day threshold)
> - AI Heatmap uses Tiptap Mark extension with color-coded backgrounds by action type
> - Position mapping utility handles plain-text offsets to ProseMirror positions
> - Export verification badges enhanced with live re-verification via "Verify Now" button
> - Compose determinism indicator shows rate percentage with color coding
> - All new endpoints documented in API_CONTRACT.md under "Document Trust Indicator Endpoints"

---

## CHECKPOINT P2: WORKSPACE INTELLIGENCE (High Priority)

**Status:** COMPLETE
**Target:** Workspace-level AI safety metrics and analytics

### P2.1 Workspace AI Safety Dashboard
- [x] Create `GET /workspaces/:id/ai-safety` endpoint
- [x] Aggregate metrics (total actions, pass rate, drift rate)
- [x] Health distribution (healthy, stale, unverified, failed)
- [x] Recent AI activity list
- [x] Top providers used in workspace
- [x] Update `API_CONTRACT.md`
- [x] Create `WorkspaceAISafetyPage.tsx` page
- [x] Add route `/workspaces/:id/ai-safety`
- [x] Create summary cards (MetricTile components)
- [x] Create health distribution bars
- [x] Create recent activity table
- [x] Create top providers table

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/routes/workspaceAISafety.ts` | Workspace-scoped AI safety endpoint |
| `KACHERI FRONTEND/src/WorkspaceAISafetyPage.tsx` | Workspace safety dashboard page |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/server.ts` | Registered workspaceAISafety routes |
| `KACHERI FRONTEND/src/App.tsx` | Added /workspaces/:id/ai-safety route |
| `KACHERI FRONTEND/src/api.ts` | Added WorkspaceAISafetyAPI and types |
| `Docs/API_CONTRACT.md` | Added Workspace Intelligence Endpoints section |

---

### P2.2 AI Usage Hotspot Detection
- [x] Create `GET /ai/watch/hotspots` endpoint
- [x] Detect hotspots (high AI usage, failures, drift)
- [x] Return ranked list with risk levels
- [x] Configurable thresholds (high: 50+ actions OR 3+ failures OR 2+ drift)
- [x] Period filtering (24h, 7d, 30d)
- [x] Add "Usage Hotspots" section to AIDashboard
- [x] Create `HotspotCard.tsx` component
- [x] Show top 6 hotspot documents in grid
- [x] Color code by risk level (red/yellow/green)
- [x] Click to navigate to document

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI FRONTEND/src/components/HotspotCard.tsx` | Hotspot display card component |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/routes/aiWatch.ts` | Added /ai/watch/hotspots endpoint |
| `KACHERI FRONTEND/src/AIDashboard.tsx` | Added Usage Hotspots section with period selector |
| `KACHERI FRONTEND/src/api.ts` | Added HotspotsAPI and types |

---

### P2.3 AI Provider Analytics
- [x] Create `GET /ai/watch/providers` endpoint
- [x] Aggregate by provider (calls, latency, error rate)
- [x] Track by model within provider
- [x] Calculate percentiles (p50, p95, p99) for latency
- [x] Add "Provider Analytics" section to AIDashboard
- [x] Create provider summary cards (Total Calls, Avg Latency, Providers, Models)
- [x] Create provider table with latency metrics
- [x] Show last used timestamp

**Files Created:**
| File | Purpose |
|------|---------|
| (Integrated into aiWatch.ts) | |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/routes/aiWatch.ts` | Added /ai/watch/providers endpoint with percentile calculation |
| `KACHERI FRONTEND/src/AIDashboard.tsx` | Added Provider Analytics section with metrics and table |
| `KACHERI FRONTEND/src/api.ts` | Added ProviderAnalyticsAPI and types |

---

### P2 Completion Criteria
- [x] Workspace-level AI safety metrics available
- [x] Health distribution shows document status across workspace
- [x] Hotspot documents automatically detected with risk levels
- [x] Provider performance tracked with latency percentiles
- [x] Period filtering works for hotspots (24h/7d/30d)

### P2 Implementation Notes
> **Session 2025-12-30:**
> - Implemented all 3 sub-items of P2 Workspace Intelligence
> - **Critical insight:** proofs table has no workspace_id column; all workspace-scoped queries JOIN through docs table
> - Provider Analytics calculates percentiles (p50, p95, p99) in JavaScript (SQLite lacks percentile functions)
> - Hotspot detection uses configurable thresholds: high (50+ actions, 3+ failures, 2+ drift), medium (20+ actions, 1+ failure, 1 drift)
> - Workspace AI Safety page shows comprehensive metrics: summary stats, health distribution, recent activity, top providers
> - All new endpoints documented in API_CONTRACT.md under "Workspace Intelligence Endpoints (Phase 5 - P2)"
> - Frontend components follow existing AIDashboard styling patterns (CSS-in-JS, MetricTile, MiniMetric, PanelHeader)

---

## CHECKPOINT P3: USER EDUCATION (Medium Priority)

**Status:** COMPLETE
**Target:** Help users understand the proof-driven AI system

### P3.1 Proof System Onboarding Modal
- [x] Create `ProofOnboardingModal.tsx` component with 4-step wizard
- [x] Design walkthrough: Welcome → Export Verification → AI Tracking → Health Badges
- [x] Trigger on first document visit (localStorage flag)
- [x] Add "Onboarding" button to AIDashboard (resets onboarding state)
- [x] Add "Don't show again" checkbox
- [x] Store completion/dismissal in localStorage with version tracking

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI FRONTEND/src/components/ProofOnboardingModal.tsx` | 4-step onboarding wizard component |
| `KACHERI FRONTEND/src/components/proofOnboardingModal.css` | Onboarding modal styles |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI FRONTEND/src/EditorPage.tsx` | Added onboarding modal trigger |
| `KACHERI FRONTEND/src/AIDashboard.tsx` | Added Onboarding reset button |

---

### P3.2 Inline Proof Tooltips
- [x] Create `tooltipHelpers.ts` with centralized PROOF_TOOLTIPS constants
- [x] Add tooltips to proof health badges (status explanation + score)
- [x] Add tooltips to export verification status (proof type + status)
- [x] Add tooltips to AI heatmap toggle (feature explanation)
- [x] Add tooltips to Verify Now button
- [x] Include "Learn more" hints pointing to /help/proofs

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI FRONTEND/src/utils/tooltipHelpers.ts` | Centralized tooltip content and builders |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI FRONTEND/src/components/ProofHealthBadge.tsx` | Enhanced tooltips using PROOF_TOOLTIPS |
| `KACHERI FRONTEND/src/ProofsPanel.tsx` | Enhanced verification badge tooltips |
| `KACHERI FRONTEND/src/components/AIHeatmapToggle.tsx` | Added feature explanation tooltip |

---

### P3.3 Proof System Documentation Page
- [x] Create `ProofSystemDocsPage.tsx` page
- [x] Add route `/help/proofs`
- [x] Document all proof concepts (Export, Compose, Rewrite)
- [x] Visual health badge examples with color indicators
- [x] Add FAQ section with 8 expandable items (aria-expanded)
- [x] Add "? Guide" button to AIDashboard header
- [x] Add navigation from onboarding modal ("View Docs" button)
- [x] Quick actions to navigate to AI Dashboard or Documents

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI FRONTEND/src/pages/ProofSystemDocsPage.tsx` | Documentation page with FAQ |
| `KACHERI FRONTEND/src/pages/proofSystemDocsPage.css` | Documentation page styles |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI FRONTEND/src/App.tsx` | Added /help/proofs route |
| `KACHERI FRONTEND/src/AIDashboard.tsx` | Added "? Guide" button |

---

### P3 Completion Criteria
- [x] New users see onboarding walkthrough
- [x] Can dismiss permanently via checkbox
- [x] Contextual tooltips on all proof UI
- [x] In-app documentation accessible at /help/proofs
- [x] FAQ covers 8 common questions

### P3 Implementation Notes
> **Session 2025-12-30:**
> - Implemented all 3 sub-items of P3 User Education
> - Implementation order was P3.3 → P3.2 → P3.1 due to dependencies (tooltips and onboarding link to docs page)
> - Onboarding modal uses localStorage with version tracking for future re-showing when content updates
> - PROOF_TOOLTIPS constant in tooltipHelpers.ts centralizes all help text for consistency
> - Native HTML `title` attribute used throughout (no tooltip library added)
> - FAQ uses aria-expanded for accessibility with expandable sections
> - AIDashboard has both "? Guide" (opens docs) and "Onboarding" (resets wizard state) buttons
> - Onboarding triggered on EditorPage mount via shouldShowOnboarding() check
> - **API_CONTRACT.md:** No updates needed — P3 is frontend-only (no new backend endpoints)

---

## CHECKPOINT P4: INFRASTRUCTURE HARDENING (Medium Priority)

**Status:** COMPLETE
**Target:** Production-grade data management and async processing

### P4.4 Database Migrations System
- [x] Create `src/migrations/runner.ts` with up/down support
- [x] Create `scripts/migrate.ts` CLI entry point
- [x] Create `migrations/` directory structure
- [x] Create `001_baseline_schema.sql` (baseline of existing schema)
- [x] Create `002_add_artifacts_columns.sql` (storage_provider, storage_key, verified_at, verification_status)
- [x] Create `003_add_jobs_table.sql` (jobs table with priority queue support)
- [x] Update `db.ts` to integrate migration runner
- [x] Add npm scripts: migrate, migrate:status, migrate:up, migrate:down, migrate:create
- [x] Transaction-wrapped migrations for safety
- [x] Rollback support via `-- DOWN` SQL marker

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/migrations/runner.ts` | Migration runner with getApplied/getPending/runAll/rollback |
| `KACHERI BACKEND/scripts/migrate.ts` | CLI entry point with run/status/up/down/create commands |
| `KACHERI BACKEND/migrations/001_baseline_schema.sql` | Baseline schema (docs, proofs, provenance, etc.) |
| `KACHERI BACKEND/migrations/002_add_artifacts_columns.sql` | Artifacts enhancement columns |
| `KACHERI BACKEND/migrations/003_add_jobs_table.sql` | Jobs table for background processing |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/db.ts` | Added import and instantiation of migrationRunner |
| `KACHERI BACKEND/package.json` | Added migrate scripts |

---

### P4.1 Artifacts Table Enhancement
- [x] Create `src/store/artifacts.ts` data access layer
- [x] Create `src/routes/artifacts.ts` REST API routes
- [x] Enhanced proofs table via migration (storage_provider, storage_key, verified_at, verification_status)
- [x] CRUD operations: create, getById, getByDoc, getByHash, delete
- [x] Verification management: updateVerification, getPendingVerification, getFailedVerification
- [x] Statistics: countByVerificationStatus, countByStorageProvider
- [x] API endpoints: GET/DELETE /artifacts/:id, GET /artifacts, GET /artifacts/stats
- [x] Document artifacts: GET /docs/:docId/artifacts
- [x] Register routes in `server.ts`
- [x] Update `API_CONTRACT.md`

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/store/artifacts.ts` | ArtifactsStore with CRUD + verification management |
| `KACHERI BACKEND/src/routes/artifacts.ts` | REST API for artifacts (list, get, delete, verify, stats) |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/server.ts` | Registered artifacts routes |
| `Docs/API_CONTRACT.md` | Added Infrastructure Endpoints section |

---

### P4.2 Storage Abstraction Layer
- [x] Create `src/storage/types.ts` with StorageProvider interface
- [x] Create `src/storage/local.ts` (filesystem provider)
- [x] Create `src/storage/s3.ts` (AWS S3 provider - optional dependency)
- [x] Create `src/storage/gcs.ts` (Google Cloud Storage provider - optional dependency)
- [x] Create `src/storage/index.ts` (factory + singleton)
- [x] Support STORAGE_PROVIDER environment variable (local/s3/gcs)
- [x] Support AWS_S3_BUCKET, AWS_REGION, AWS_S3_PREFIX for S3
- [x] Support GCS_BUCKET, GCS_PROJECT_ID, GCS_PREFIX for GCS
- [x] Path traversal protection in local provider
- [x] Dynamic optional dependency loading for cloud providers
- [x] Error classes: StorageNotFoundError, StorageWriteError, StorageReadError

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/storage/types.ts` | StorageProvider interface and config types |
| `KACHERI BACKEND/src/storage/local.ts` | LocalStorageProvider implementation |
| `KACHERI BACKEND/src/storage/s3.ts` | S3StorageProvider with @aws-sdk/client-s3 |
| `KACHERI BACKEND/src/storage/gcs.ts` | GCSStorageProvider with @google-cloud/storage |
| `KACHERI BACKEND/src/storage/index.ts` | Factory createStorage() and singleton getStorage() |

**Files Modified:**
| File | Changes |
|------|---------|
| None | Storage is ready for use; routes can adopt when needed |

---

### P4.3 Background Job Queue
- [x] Create `src/jobs/types.ts` with job type definitions
- [x] Create `src/jobs/queue.ts` SQLite-backed job queue
- [x] Create `src/jobs/workers/verify.ts` (verification workers)
- [x] Create `src/jobs/workers/index.ts` (worker registration)
- [x] Create `src/routes/jobs.ts` REST API routes
- [x] Jobs table via migration with priority support
- [x] Job types: export:pdf, export:docx, verify:export, verify:compose, import:file, cleanup:orphan
- [x] Job status tracking: pending, processing, completed, failed, cancelled
- [x] Retry logic with configurable maxAttempts
- [x] Worker polling with start()/stop() lifecycle
- [x] API endpoints: GET/POST /jobs, GET/DELETE /jobs/:id, POST /jobs/:id/retry
- [x] Job statistics: GET /jobs/stats
- [x] Document jobs: GET /docs/:docId/jobs
- [x] Cleanup endpoint: POST /jobs/cleanup
- [x] Register routes and start workers in `server.ts`
- [x] Optional BullMQ/Redis support (falls back to SQLite)
- [x] Update `API_CONTRACT.md`

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/jobs/types.ts` | JobType, JobStatus, Job interface, payload types |
| `KACHERI BACKEND/src/jobs/queue.ts` | SQLiteJobQueue with add/process/cancel/retry/cleanup |
| `KACHERI BACKEND/src/jobs/workers/verify.ts` | verifyExportJob and verifyComposeJob handlers |
| `KACHERI BACKEND/src/jobs/workers/index.ts` | registerAllWorkers function |
| `KACHERI BACKEND/src/routes/jobs.ts` | REST API for job management |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/server.ts` | Registered jobs routes, start queue on boot |
| `Docs/API_CONTRACT.md` | Added Jobs API endpoints to Infrastructure section |

---

### P4 Completion Criteria
- [x] All artifacts tracked in database (via enhanced proofs table)
- [x] Storage abstraction works for local/S3/GCS
- [x] Heavy operations can be processed via job queue
- [x] Job progress visible via REST API
- [x] Schema changes managed via migrations with rollback support

### P4 Implementation Notes
> **Session 2025-12-30:**
> - Implemented all 4 sub-items of P4 Infrastructure Hardening
> - **Approach Change:** Instead of creating a separate `artifacts` table, enhanced the existing `proofs` table with additional columns (storage_provider, storage_key, verified_at, verification_status). This preserves existing data relationships.
> - **Migration System:** Custom runner using SQL files with `-- DOWN` markers for rollback. Transaction-wrapped for safety. CLI via `npm run migrate` commands.
> - **Storage Abstraction:** Local provider is default. S3 and GCS providers use dynamic imports for optional dependencies (@aws-sdk/client-s3, @google-cloud/storage).
> - **Job Queue:** SQLite-backed by default (no Redis required). Optional BullMQ support when REDIS_ENABLED=true. Workers poll at 1-second intervals.
> - **Job Types:** Defined 6 job types covering exports, verification, imports, and cleanup operations.
> - **Routes Registered:** Both artifacts and jobs routes registered in server.ts. Job queue starts automatically on server boot.
> - **API Contract:** Added "Infrastructure Endpoints (Phase 5 - P4)" section with all new endpoints documented.

---

## CHECKPOINT P5: OBSERVABILITY (Medium Priority)

**Status:** COMPLETE
**Target:** Production-grade logging, metrics, and monitoring

### P5.1 Structured JSON Logging
- [x] Configure Pino JSON output (LOG_PRETTY=false for production)
- [x] Add structured fields to all logs (requestId, module, userId, workspaceId)
- [x] Create logging middleware (requestLogger.ts)
- [x] Add log levels configuration (LOG_LEVEL env var)
- [x] Replace all console.log with logger (~15+ locations)
- [x] Add request ID correlation (X-Request-ID header passthrough)

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/observability/logger.ts` | Pino logger configuration with module-scoped child loggers |
| `KACHERI BACKEND/src/observability/requestId.ts` | Request ID generation and X-Request-ID header hook |
| `KACHERI BACKEND/src/observability/requestLogger.ts` | Request/response logging middleware with timing |
| `KACHERI BACKEND/src/observability/index.ts` | Module exports and registerObservability() |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/server.ts` | Integrated observability hooks, replaced console.log with logger |
| `KACHERI BACKEND/src/jobs/queue.ts` | Replaced console.log with module logger |
| `KACHERI BACKEND/src/auth/devMode.ts` | Replaced console.log with module logger |
| `KACHERI BACKEND/src/storage/index.ts` | Replaced console.log/warn with module logger |
| `KACHERI BACKEND/src/migrations/runner.ts` | Replaced console.error with module logger |
| `KACHERI BACKEND/src/realtime/yjsStandalone.ts` | Added standalone Pino logger |

---

### P5.2 Metrics Collection
- [x] Add prom-client dependency
- [x] Create `src/observability/metrics.ts` registry
- [x] Create metrics: http_requests_total, http_request_duration_seconds
- [x] Create metrics: ai_requests_total, ai_request_duration_seconds
- [x] Create metrics: export_requests_total, verification_runs_total
- [x] Create metrics: active_websocket_connections, documents_total, proofs_total, jobs_total
- [x] Create `GET /metrics` endpoint (Prometheus format)
- [x] Create `src/observability/metricsCollector.ts` with hooks
- [x] Periodic gauge updates for document/proof/job counts

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/observability/metrics.ts` | prom-client registry with 10 metrics |
| `KACHERI BACKEND/src/observability/metricsCollector.ts` | Fastify hooks and gauge updater |
| `KACHERI BACKEND/src/routes/metrics.ts` | GET /metrics endpoint |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/server.ts` | Registered metrics route |
| `KACHERI BACKEND/package.json` | Added pino, pino-pretty, prom-client dependencies |

---

### P5.3 Health Check Endpoints
- [x] Enhance `GET /health` with detailed dependency checks
- [x] Add database connectivity check with latency
- [x] Add storage provider check with latency
- [x] Add `GET /health/ready` (Kubernetes readiness probe)
- [x] Add `GET /health/live` (Kubernetes liveness probe)
- [x] Add response time thresholds (HEALTH_CHECK_TIMEOUT)
- [x] Add degraded state handling (healthy/degraded/unhealthy)
- [x] Timeout wrapper for each check (5s default)

**Files Created:**
| File | Purpose |
|------|---------|
| `KACHERI BACKEND/src/observability/healthCheck.ts` | Health check implementations with timeout |
| `KACHERI BACKEND/src/routes/health.ts` | /health, /health/ready, /health/live endpoints |

**Files Modified:**
| File | Changes |
|------|---------|
| `KACHERI BACKEND/src/server.ts` | Registered health routes, removed minimal /health |

---

### P5.4 Observability Dashboard Integration
- [x] Create Grafana dashboard JSON template
- [x] Create Prometheus alert rules (10 rules)
- [x] Document metrics and meanings in METRICS.md
- [x] Add dashboard to `monitoring/dashboards/`
- [x] Add alerts to `monitoring/alerts/`

**Files Created:**
| File | Purpose |
|------|---------|
| `monitoring/dashboards/kacheri-grafana.json` | Grafana dashboard with 15 panels |
| `monitoring/alerts/alert-rules.yml` | Prometheus alert rules (10 alerts) |
| `monitoring/docs/METRICS.md` | Complete metrics documentation |

**Files Modified:**
| File | Changes |
|------|---------|
| `Docs/API_CONTRACT.md` | Added Observability Endpoints section |

---

### P5 Completion Criteria
- [x] All logs in structured JSON format
- [x] Request ID correlation works
- [x] Prometheus metrics exported
- [x] Health checks comprehensive
- [x] Kubernetes probe compatible
- [x] Grafana dashboard importable
- [x] Alert rules defined

### P5 Implementation Notes
> **Session 2025-12-30:**
> - Implemented all 4 sub-items of P5 Observability
> - **Logging:** Pino configured with JSON output (LOG_PRETTY=true for dev). Module-scoped loggers created via createLogger(). Request ID generation uses nanoid and supports X-Request-ID passthrough for distributed tracing.
> - **Metrics:** 10 application metrics defined using prom-client (Counter, Histogram, Gauge). Periodic gauge updates every 60 seconds for document/proof/job counts. Route normalization reduces label cardinality.
> - **Health Checks:** Three endpoints (health, ready, live). Checks database and storage with independent timeouts. Returns uptime and version info.
> - **Dashboard:** Grafana JSON with 15 panels across 5 rows (Overview, HTTP, AI, Export/Verification, Jobs). 10 Prometheus alert rules for error rates, latency, queue backlog, and service health.
> - **Dependencies Added:** pino, pino-pretty, prom-client
> - **Console.log Replacements:** ~15 locations updated across server.ts, queue.ts, devMode.ts, storage/index.ts, runner.ts, and yjsStandalone.ts

---

## Implementation Log

### Session 1: 2025-12-30 — Analysis & Planning
- Completed Phase 5 gap analysis
- Created production-grade work scope document
- Established this session report as implementation anchor
- Identified 21 items across 6 priority tiers
- Estimated 41-53 days total effort

### Session 2: 2025-12-30 — P0 Automation Implementation
- **P0.1 GitHub Actions Workflow:** Created `.github/workflows/nightly-verify.yml` with:
  - Daily cron schedule (2 AM UTC)
  - Manual trigger via workflow_dispatch
  - Node.js 20 environment with npm cache
  - Artifact upload with 90-day retention
  - Commented Slack notification step ready for future use

- **P0.3 Report Archiving System:** Implemented full stack:
  - Database: `verification_reports` table with status check constraint
  - Backend Store: `verificationReports.ts` with CRUD + retention policy
  - Backend Routes: 7 endpoints for list/get/create/delete/cleanup
  - Script Update: `nightly_verify.ts` parses child stdout and saves to DB
  - Frontend API: Added types and functions to `api.ts`
  - Frontend UI: `ReportHistoryTable.tsx` with status filter and pagination
  - Frontend UI: `ReportDetailModal.tsx` with metrics display and JSON viewer
  - Integration: Added Verification History section to AIDashboard
  - Documentation: Updated API_CONTRACT.md with all new endpoints

- **P0.2 Notifications:** Deferred (Slack webhook not yet configured)

**Outcome:** P0 is functionally complete. 2 of 3 sub-items done, 1 deferred.

### Session 3: 2025-12-30 — P2 Workspace Intelligence Implementation
- **P2.3 AI Provider Analytics:** Created `GET /ai/watch/providers` endpoint with:
  - Provider/model aggregation from proofs table
  - Latency percentile calculation (p50, p95, p99) in JavaScript
  - Summary stats (total calls, avg latency, unique providers/models)
  - Frontend: Provider Analytics section in AIDashboard with metrics cards and table

- **P2.2 AI Usage Hotspot Detection:** Created `GET /ai/watch/hotspots` endpoint with:
  - Period filtering (24h, 7d, 30d)
  - Risk level calculation based on configurable thresholds
  - JOIN through docs table to get workspace context
  - Frontend: HotspotCard component with risk badges, Usage Hotspots section in AIDashboard

- **P2.1 Workspace AI Safety Dashboard:** Created comprehensive endpoint and page:
  - `GET /workspaces/:id/ai-safety` with workspace-scoped metrics
  - Health distribution (healthy/stale/unverified/failed)
  - Recent AI activity list
  - Top providers used in workspace
  - Frontend: WorkspaceAISafetyPage with MetricTiles, health bars, and tables
  - Route: `/workspaces/:id/ai-safety`

- **Critical Discovery:** proofs table has no workspace_id column - all workspace queries must JOIN through docs table

**Outcome:** P2 complete. All 3 sub-items implemented, documented in API_CONTRACT.md.

### Session 4: 2025-12-30 — P4 Infrastructure Hardening Implementation
- **P4.4 Database Migrations System:** Created complete migration infrastructure:
  - Custom runner (`src/migrations/runner.ts`) with up/down support
  - SQL files with `-- DOWN` markers for rollback
  - CLI script (`scripts/migrate.ts`) with run/status/up/down/create commands
  - Three initial migrations: baseline schema, artifacts columns, jobs table
  - Transaction-wrapped migrations for safety
  - npm scripts added to package.json

- **P4.1 Artifacts Store & Routes:** Enhanced proofs table as artifacts registry:
  - New columns via migration: storage_provider, storage_key, verified_at, verification_status
  - Data access layer (`src/store/artifacts.ts`) with CRUD + verification management
  - REST API (`src/routes/artifacts.ts`) with list/get/delete/verify/stats endpoints
  - Statistics by verification status and storage provider

- **P4.2 Storage Abstraction Layer:** Multi-provider storage ready:
  - Interface and types (`src/storage/types.ts`)
  - LocalStorageProvider with path traversal protection
  - S3StorageProvider with optional @aws-sdk/client-s3 dependency
  - GCSStorageProvider with optional @google-cloud/storage dependency
  - Factory and singleton pattern for easy adoption

- **P4.3 Background Job Queue:** SQLite-backed job processing:
  - Job types: export:pdf, export:docx, verify:export, verify:compose, import:file, cleanup:orphan
  - SQLiteJobQueue with priority scheduling and worker polling
  - Verification workers implemented (hash check, payload integrity)
  - REST API for job management (create/cancel/retry/status)
  - Optional BullMQ/Redis support for production scaling

**Outcome:** P4 complete. All 4 sub-items implemented, documented in API_CONTRACT.md.

### Session 5: 2025-12-30 — P5 Observability Implementation
- **P5.1 Structured JSON Logging:** Complete observability module:
  - Pino logger configuration with JSON output (LOG_PRETTY for dev)
  - Module-scoped loggers via createLogger('module/name')
  - Request ID generation with nanoid and X-Request-ID header passthrough
  - Request/response logging middleware with timing and context extraction
  - Replaced ~15 console.log statements across 6 files

- **P5.2 Metrics Collection:** Prometheus metrics via prom-client:
  - 10 application metrics (http_requests, ai_requests, exports, verification, connections, data counts)
  - Counter for request totals, Histogram for latency percentiles, Gauge for current counts
  - Metrics collector hooks for automatic HTTP metrics
  - Periodic gauge updates (60s interval) for document/proof/job counts
  - GET /metrics endpoint returning Prometheus format

- **P5.3 Health Check Endpoints:** Kubernetes-ready health probes:
  - Enhanced GET /health with database and storage checks
  - GET /health/ready for Kubernetes readiness probe
  - GET /health/live for Kubernetes liveness probe
  - Status levels: healthy (all up), degraded (partial), unhealthy (all down)
  - Independent 5-second timeout per check

- **P5.4 Observability Dashboard:** Monitoring configuration:
  - Grafana dashboard JSON with 15 panels (overview, HTTP, AI, export/verify, jobs)
  - Prometheus alert rules (10 alerts) covering error rates, latency, queue backlog
  - Comprehensive METRICS.md documentation with examples

- **Dependencies Added:** pino, pino-pretty, prom-client

**Outcome:** P5 complete. All 4 sub-items implemented, documented in API_CONTRACT.md.

### Session 5 Bug Fixes: 2025-12-30

**Bug 1: Missing npm dependencies**
- **Symptom:** Server failed to start with "Cannot find module 'prom-client'"
- **Cause:** Dependencies (pino, pino-pretty, prom-client) were added to package.json but `npm install` was not run
- **Fix:** Ran `npm install` to install the new dependencies
- **Lesson:** Always run `npm install` after modifying package.json dependencies

**Bug 2: TypeScript type mismatch in requestId.ts (genReqId)**
- **Symptom:** VSCode showed TypeScript errors: "Type '(req: FastifyRequest) => string' is not assignable to type 'RequestGenId'"
- **Cause:** Fastify's `genReqId` option expects `IncomingMessage` from Node's 'http' module, not `FastifyRequest`
- **Fix:** Changed `requestIdGenerator` function signature to accept `IncomingMessage`:
  ```typescript
  import type { IncomingMessage } from "http";
  export function requestIdGenerator(req: IncomingMessage): string { ... }
  ```
- **Files Changed:** `src/observability/requestId.ts`
- **Lesson:** Fastify's low-level hooks like `genReqId` operate on raw Node.js types, not Fastify-wrapped types

**Bug 3: Missing database migrations (jobs table)**
- **Symptom:** Server started but job queue failed repeatedly with "no such table: jobs" every second
- **Cause:** The `003_add_jobs_table.sql` migration had not been applied to the database
- **Fix:** Ran `npm run migrate` to apply pending migrations
- **Lesson:** After creating new migrations, always run the migration script before starting the server

**Bug 4: TypeScript interface not assignable to Record<string, unknown>**
- **Symptom:** `npm run migrate` failed with TypeScript compilation error:
  ```
  src/observability/requestLogger.ts(77,40): error TS2345: Argument of type 'RequestContext' is not assignable to parameter of type 'Record<string, unknown>'.
  Index signature for type 'string' is missing in type 'RequestContext'.
  ```
- **Cause:** The `RequestContext` interface didn't have an index signature, making it incompatible with `Record<string, unknown>` expected by `createChildLogger()`
- **Fix:** Added index signature to the interface:
  ```typescript
  interface RequestContext {
    requestId: string;
    method: string;
    url: string;
    userId?: string;
    workspaceId?: string;
    docId?: string;
    [key: string]: unknown;  // Added index signature
  }
  ```
- **Files Changed:** `src/observability/requestLogger.ts`
- **Lesson:** When passing a TypeScript interface to a function expecting `Record<string, unknown>`, the interface needs an index signature `[key: string]: unknown`

**Note:** This is the second occurrence of TypeScript interface/Record compatibility issues in this codebase. Consider adding a linting rule or type utility to catch these earlier.

---

## Architecture Alignment

This implementation aligns with:
- `Docs/blueprint/architecture blueprint.md` — Phase 5 definition
- `Docs/Roadmap/docs roadmap.md` — Sections 1.5, 2.5, 2.6
- `Docs/Roadmap/phase5-work-scope.md` — Full specification

No drift detected between documentation and implementation intent.

---

## Final Acceptance Criteria (Phase 5 Complete)

### Automation
- [ ] Nightly verification runs automatically
- [ ] Failures trigger notifications
- [ ] Reports archived for 90 days

### Visual Trust
- [ ] Every document shows proof health badge
- [ ] AI-touched sections visually distinguishable
- [ ] Exports show verification status
- [ ] Compose actions show determinism status

### Workspace Intelligence
- [x] Workspace-level AI safety metrics available
- [x] Hotspot documents automatically detected
- [x] Provider performance tracked

### User Education
- [ ] New users see onboarding walkthrough
- [ ] Contextual tooltips explain proof concepts
- [ ] In-app documentation accessible

### Infrastructure
- [x] All artifacts tracked in database
- [x] Storage abstraction ready for cloud
- [x] Heavy operations via job queue
- [x] Schema changes via migrations

### Observability
- [x] Structured JSON logs throughout
- [x] Prometheus metrics exported
- [x] Health checks comprehensive
- [x] Grafana dashboard ready
