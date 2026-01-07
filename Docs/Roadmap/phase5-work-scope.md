# Phase 5: Replay Analytics & Verification Dashboard — Complete Work Scope

**Created:** 2025-12-30
**Status:** Production-Grade Specification
**Baseline:** Current implementation at ~33% complete

---

## Executive Summary

Phase 5 transforms Kacheri from a proof-recording system into a **proof-verification system**. The goal is automated, continuous validation of all AI actions with visual trust indicators and enterprise-grade observability.

---

## Work Scope Overview

| Category | Items | Priority |
|----------|-------|----------|
| P0 - Automation | 3 | Critical |
| P1 - Visual Trust Indicators | 4 | High |
| P2 - Workspace Intelligence | 3 | High |
| P3 - User Education | 3 | Medium |
| P4 - Infrastructure Hardening | 4 | Medium |
| P5 - Observability | 4 | Medium |
| **Total** | **21** | |

---

## P0 — AUTOMATION (Critical)

### P0.1 GitHub Actions Nightly Verification Workflow

**Goal:** Automated daily verification of all proofs and exports

**Backend Tasks:**
- [ ] Create `.github/workflows/nightly-verify.yml`
- [ ] Configure cron schedule (`0 2 * * *` for 2 AM UTC daily)
- [ ] Set up Node.js environment with SQLite access
- [ ] Run `npx tsx scripts/nightly_verify.ts`
- [ ] Upload JSON report as workflow artifact
- [ ] Configure workflow to use repository secrets for any API keys
- [ ] Set exit code based on verification result (0=pass, 1=fail)

**Workflow Spec:**
```yaml
name: Nightly Verification
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch: # Manual trigger

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: ./KACHERI BACKEND
      - run: npx tsx scripts/nightly_verify.ts
        working-directory: ./KACHERI BACKEND
      - uses: actions/upload-artifact@v4
        with:
          name: nightly-report-${{ github.run_id }}
          path: ./KACHERI BACKEND/.reports/
```

**Acceptance Criteria:**
- Workflow runs daily at scheduled time
- Manual trigger available via workflow_dispatch
- JSON report uploaded as artifact
- Workflow fails if verification fails

---

### P0.2 Verification Failure Notifications

**Goal:** Alert team when verification fails

**Backend Tasks:**
- [ ] Add Slack webhook integration to `nightly_verify.ts`
- [ ] Add email notification option (via SendGrid/SES)
- [ ] Create notification payload with failure summary
- [ ] Add `--notify` flag to script
- [ ] Configure secrets in GitHub Actions

**Notification Payload:**
```json
{
  "status": "FAIL",
  "timestamp": "2025-12-30T02:00:00Z",
  "summary": {
    "exports": { "pass": 45, "fail": 2, "miss": 1 },
    "compose": { "pass": 120, "drift": 3, "miss": 0 }
  },
  "failures": [
    { "type": "export", "docId": "doc_xyz", "reason": "hash_mismatch" }
  ],
  "reportUrl": "https://github.com/org/repo/actions/runs/123"
}
```

**Acceptance Criteria:**
- Slack message sent on any FAIL status
- Email sent to configured recipients
- Notification includes direct link to report

---

### P0.3 Report Archiving System

**Goal:** Persistent storage and retrieval of verification reports

**Database Schema:**
```sql
CREATE TABLE verification_reports (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'partial')),
  exports_pass INTEGER DEFAULT 0,
  exports_fail INTEGER DEFAULT 0,
  exports_miss INTEGER DEFAULT 0,
  compose_pass INTEGER DEFAULT 0,
  compose_drift INTEGER DEFAULT 0,
  compose_miss INTEGER DEFAULT 0,
  report_json TEXT NOT NULL,
  workspace_id TEXT,
  triggered_by TEXT DEFAULT 'cron'
);
CREATE INDEX idx_reports_created ON verification_reports(created_at DESC);
CREATE INDEX idx_reports_status ON verification_reports(status);
```

**Backend Tasks:**
- [ ] Add `verification_reports` table to `db.ts`
- [ ] Create `src/store/verificationReports.ts` with CRUD operations
- [ ] Create `src/routes/verificationReports.ts` with endpoints:
  - `GET /ai/watch/reports` — List reports (paginated)
  - `GET /ai/watch/reports/:id` — Get single report
  - `GET /ai/watch/reports/latest` — Get most recent report
  - `DELETE /ai/watch/reports/:id` — Delete old report (admin only)
- [ ] Update `nightly_verify.ts` to save report to database
- [ ] Add retention policy (delete reports older than 90 days)
- [ ] Register routes in `server.ts`
- [ ] Update `API_CONTRACT.md`

**Frontend Tasks:**
- [ ] Add "Report History" section to AIDashboard
- [ ] Create `ReportHistoryTable.tsx` component
- [ ] Create `ReportDetailModal.tsx` for viewing full report
- [ ] Add date range filter
- [ ] Add status filter (pass/fail/partial)
- [ ] Show trend chart of pass/fail over time

**Acceptance Criteria:**
- Reports persisted to database after each run
- Reports viewable in dashboard
- Historical trend visible
- Old reports auto-deleted per retention policy

---

## P1 — VISUAL TRUST INDICATORS (High Priority)

### P1.1 Per-Document Proof Health Badges

**Goal:** Visual indicator of document verification status at a glance

**Backend Tasks:**
- [ ] Create `GET /docs/:id/proof-health` endpoint
- [ ] Calculate health score based on:
  - Last verification timestamp
  - Verification result (pass/fail/miss)
  - Number of unverified AI actions since last check
  - Export verification status
- [ ] Return health status: `verified` | `stale` | `failed` | `unverified`
- [ ] Add proof health to `GET /docs/:id` response
- [ ] Add proof health to `GET /docs` list response
- [ ] Update `API_CONTRACT.md`

**Health Calculation Logic:**
```typescript
type ProofHealth = 'verified' | 'stale' | 'failed' | 'unverified';

function calculateProofHealth(doc: Doc): ProofHealth {
  const lastVerification = getLastVerification(doc.id);
  if (!lastVerification) return 'unverified';
  if (lastVerification.status === 'fail') return 'failed';

  const hoursSinceVerification = (Date.now() - lastVerification.ts) / 3600000;
  const actionsAfterVerification = countActionsAfter(doc.id, lastVerification.ts);

  if (hoursSinceVerification > 24 || actionsAfterVerification > 0) return 'stale';
  return 'verified';
}
```

**Frontend Tasks:**
- [ ] Create `ProofHealthBadge.tsx` component
  - `verified` → Green shield with checkmark
  - `stale` → Yellow clock icon
  - `failed` → Red X icon
  - `unverified` → Gray question mark
- [ ] Add badge to FileManager document rows
- [ ] Add badge to EditorPage header (next to title)
- [ ] Add badge to AllDocsModal
- [ ] Add tooltip explaining each status
- [ ] Add click action to open ProofsPanel

**Acceptance Criteria:**
- Badge visible on all document listings
- Badge updates in real-time after verification
- Tooltip explains status and last verification time
- Click navigates to proof details

---

### P1.2 AI-Usage Heatmap Overlay

**Goal:** Visual differentiation of AI-generated vs human-written content

**Backend Tasks:**
- [ ] Create `GET /docs/:id/ai-ranges` endpoint
- [ ] Query provenance for AI actions with position data
- [ ] Return array of ranges with action type:
  ```json
  {
    "ranges": [
      { "start": 0, "end": 150, "action": "ai:compose", "ts": 1704067200 },
      { "start": 300, "end": 450, "action": "ai:rewriteSelection", "ts": 1704068000 }
    ]
  }
  ```
- [ ] Include action metadata (provider, model, proofId)
- [ ] Update `API_CONTRACT.md`

**Frontend Tasks:**
- [ ] Create `AIHeatmapOverlay.tsx` component
- [ ] Create Tiptap decoration plugin for AI ranges
- [ ] Color coding by action type:
  - `ai:compose` → Blue highlight (generated)
  - `ai:rewriteSelection` → Purple highlight (rewritten)
  - `ai:constrainedRewrite` → Teal highlight (constrained)
  - `ai:translate` → Orange highlight (translated)
- [ ] Add toggle button to EditorPage toolbar ("Show AI")
- [ ] Add opacity slider for highlight intensity
- [ ] Click on highlighted section → show proof details popover
- [ ] Persist toggle state to localStorage

**Acceptance Criteria:**
- AI-touched sections visually distinguishable
- Toggle to show/hide overlay
- Click reveals proof details for that section
- Performance acceptable for large documents

---

### P1.3 Export Verification Badges

**Goal:** Visual indicator on exported files showing verification status

**Backend Tasks:**
- [ ] Add `verified_at` and `verified_status` columns to proofs table
- [ ] Update `replay_exports.ts` to update verification status
- [ ] Include verification status in `GET /docs/:id/exports` response
- [ ] Add `GET /exports/:proofId/verify` endpoint for on-demand verification

**Frontend Tasks:**
- [ ] Update ProofsPanel export list with verification badges
- [ ] Add "Verify Now" button for unverified exports
- [ ] Show verification timestamp
- [ ] Add verification badge to export download links

**Acceptance Criteria:**
- Each export shows PASS/FAIL/PENDING status
- On-demand verification available
- Status updates after verification run

---

### P1.4 Compose Determinism Indicator

**Goal:** Visual indicator of AI compose reproducibility

**Backend Tasks:**
- [ ] Add `determinism_status` to compose proof records
- [ ] Track rerun attempts and results
- [ ] Create `GET /docs/:id/compose-determinism` endpoint

**Frontend Tasks:**
- [ ] Add determinism badge to AIDashboard compose section
- [ ] Add "Test Determinism" button for individual compose actions
- [ ] Show drift percentage if non-deterministic
- [ ] Color code: Green (deterministic), Yellow (minor drift), Red (major drift)

**Acceptance Criteria:**
- Determinism status visible for each compose action
- Drift percentage calculated and displayed
- Easy to identify non-deterministic AI calls

---

## P2 — WORKSPACE INTELLIGENCE (High Priority)

### P2.1 Workspace AI Safety Dashboard

**Goal:** Aggregate AI safety metrics at workspace level

**Backend Tasks:**
- [ ] Create `GET /workspaces/:id/ai-safety` endpoint
- [ ] Aggregate metrics:
  - Total AI actions in workspace
  - Verification pass rate
  - Documents with failed verifications
  - Drift rate across compose actions
  - AI usage by member
  - AI usage by document
- [ ] Support date range filtering
- [ ] Update `API_CONTRACT.md`

**Response Schema:**
```json
{
  "workspaceId": "ws_abc",
  "period": { "from": "2025-12-01", "to": "2025-12-30" },
  "summary": {
    "totalAIActions": 1250,
    "verificationRate": 0.94,
    "passRate": 0.98,
    "driftRate": 0.02
  },
  "byDocument": [
    { "docId": "doc_xyz", "title": "Contract", "actions": 45, "passRate": 1.0 }
  ],
  "byMember": [
    { "userId": "usr_abc", "name": "John", "actions": 300, "passRate": 0.97 }
  ],
  "alerts": [
    { "type": "high_drift", "docId": "doc_123", "message": "3 drift events detected" }
  ]
}
```

**Frontend Tasks:**
- [ ] Create `WorkspaceAISafetyDashboard.tsx` page
- [ ] Add route `/workspace/:id/ai-safety`
- [ ] Create summary cards (total actions, pass rate, drift rate)
- [ ] Create "Documents at Risk" table
- [ ] Create "AI Usage by Member" chart
- [ ] Create "AI Activity Timeline" chart
- [ ] Add alerts/warnings section
- [ ] Add navigation from FileManagerPage

**Acceptance Criteria:**
- Workspace-level AI metrics visible
- Drill-down to problematic documents
- Alerts for high-risk situations
- Date range filtering works

---

### P2.2 AI Usage Hotspot Detection

**Goal:** Identify documents with unusually high AI usage or failures

**Backend Tasks:**
- [ ] Create `GET /ai/watch/hotspots` endpoint
- [ ] Detect hotspots based on:
  - AI actions per document (above threshold)
  - Verification failures
  - Drift events
  - Rapid succession of AI calls
- [ ] Return ranked list of hotspot documents
- [ ] Include reason for hotspot classification

**Frontend Tasks:**
- [ ] Add "Hotspots" section to AIDashboard
- [ ] Create `HotspotCard.tsx` component
- [ ] Show top 5 hotspot documents
- [ ] Color code by severity
- [ ] Click to navigate to document

**Acceptance Criteria:**
- Hotspots automatically detected
- Severity ranking works
- Easy navigation to investigate

---

### P2.3 AI Provider Analytics

**Goal:** Track AI provider performance and usage

**Backend Tasks:**
- [ ] Create `GET /ai/watch/providers` endpoint
- [ ] Aggregate metrics by provider:
  - Total calls
  - Average latency
  - Error rate
  - Token usage (if available)
  - Cost estimate (if configured)
- [ ] Track by model within provider

**Frontend Tasks:**
- [ ] Add "Provider Analytics" section to AIDashboard
- [ ] Create provider comparison chart
- [ ] Show latency distribution
- [ ] Show error rate trends
- [ ] Add provider filter to events table

**Acceptance Criteria:**
- Provider performance visible
- Can compare providers
- Latency and error trends trackable

---

## P3 — USER EDUCATION (Medium Priority)

### P3.1 Proof System Onboarding Modal

**Goal:** Educate new users about the proof-driven AI system

**Frontend Tasks:**
- [ ] Create `ProofOnboardingModal.tsx` component
- [ ] Design 3-4 step walkthrough:
  1. "Every AI action is recorded" (show proof icon)
  2. "Proofs include before/after snapshots" (show diff example)
  3. "Exports are hash-verified" (show verification badge)
  4. "Review your AI history anytime" (show ProofsPanel)
- [ ] Trigger on first login (check localStorage flag)
- [ ] Add "Learn about Proofs" button to AIDashboard
- [ ] Add "Don't show again" checkbox
- [ ] Store completion in user preferences

**Acceptance Criteria:**
- New users see onboarding on first visit
- Can dismiss permanently
- Can re-access from help menu

---

### P3.2 Inline Proof Tooltips

**Goal:** Contextual education throughout the UI

**Frontend Tasks:**
- [ ] Create `ProofTooltip.tsx` component
- [ ] Add tooltips to:
  - Proof health badges ("This document's AI actions are verified")
  - Export verification status ("This export matches the recorded hash")
  - DiffModal proof info ("This proof ensures reproducibility")
  - AI Watch metrics ("Verification rate measures proof integrity")
- [ ] Use consistent tooltip styling
- [ ] Include "Learn more" links

**Acceptance Criteria:**
- Tooltips appear on hover
- Language is user-friendly
- Links to documentation work

---

### P3.3 Proof System Documentation Page

**Goal:** Comprehensive documentation accessible in-app

**Backend Tasks:**
- [ ] Create `/docs/proof-system` static route (or use frontend routing)

**Frontend Tasks:**
- [ ] Create `ProofSystemDocs.tsx` page
- [ ] Add route `/help/proofs`
- [ ] Document:
  - What proofs are and why they matter
  - How AI actions are recorded
  - How verification works
  - How to read the AI Watch dashboard
  - How to interpret health badges
  - FAQ section
- [ ] Add navigation from help menu
- [ ] Add navigation from onboarding modal

**Acceptance Criteria:**
- Documentation accessible in-app
- Covers all proof concepts
- Includes screenshots/diagrams

---

## P4 — INFRASTRUCTURE HARDENING (Medium Priority)

### P4.1 Full Artifacts Table

**Goal:** Canonical artifact storage with referential integrity

**Database Schema:**
```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('export:pdf', 'export:docx', 'proof', 'import')),
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  workspace_id TEXT,
  metadata TEXT,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);
CREATE INDEX idx_artifacts_doc ON artifacts(doc_id);
CREATE INDEX idx_artifacts_kind ON artifacts(kind);
CREATE INDEX idx_artifacts_hash ON artifacts(hash);
```

**Backend Tasks:**
- [ ] Add `artifacts` table to `db.ts`
- [ ] Create `src/store/artifacts.ts` with CRUD operations
- [ ] Create `src/routes/artifacts.ts` with endpoints:
  - `GET /docs/:id/artifacts` — List artifacts for document
  - `GET /artifacts/:id` — Get artifact metadata
  - `GET /artifacts/:id/download` — Download artifact file
  - `DELETE /artifacts/:id` — Delete artifact (admin only)
- [ ] Create migration script to populate from existing filesystem
- [ ] Update export routes to create artifact records
- [ ] Update import routes to create artifact records
- [ ] Update proof routes to reference artifacts
- [ ] Register routes in `server.ts`
- [ ] Update `API_CONTRACT.md`

**Migration Tasks:**
- [ ] Create `scripts/migrate_artifacts.ts`
- [ ] Scan `exports/` directory for existing files
- [ ] Calculate hashes and create artifact records
- [ ] Verify migration completeness
- [ ] Add rollback capability

**Acceptance Criteria:**
- All artifacts tracked in database
- Referential integrity enforced
- Existing files migrated
- No data loss during migration

---

### P4.2 Storage Abstraction Layer

**Goal:** Abstract file storage for S3/GCS compatibility

**Backend Tasks:**
- [ ] Create `src/storage/types.ts` with interface:
  ```typescript
  interface StorageProvider {
    put(key: string, data: Buffer, metadata?: Record<string, string>): Promise<string>;
    get(key: string): Promise<Buffer>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    getSignedUrl(key: string, expiresIn: number): Promise<string>;
  }
  ```
- [ ] Create `src/storage/local.ts` — Local filesystem implementation
- [ ] Create `src/storage/s3.ts` — AWS S3 implementation
- [ ] Create `src/storage/gcs.ts` — Google Cloud Storage implementation
- [ ] Create `src/storage/index.ts` — Factory based on config
- [ ] Add `STORAGE_PROVIDER` environment variable
- [ ] Add S3/GCS configuration options
- [ ] Update export routes to use storage abstraction
- [ ] Update import routes to use storage abstraction
- [ ] Update artifact routes to use storage abstraction
- [ ] Add health check for storage provider

**Configuration:**
```env
STORAGE_PROVIDER=local|s3|gcs
S3_BUCKET=kacheri-artifacts
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
GCS_BUCKET=kacheri-artifacts
GCS_PROJECT_ID=xxx
GCS_KEY_FILE=/path/to/key.json
```

**Acceptance Criteria:**
- Storage provider configurable via env
- Local storage works (default)
- S3 storage works when configured
- GCS storage works when configured
- No code changes needed to switch providers

---

### P4.3 Background Job Queue

**Goal:** Async processing for heavy operations

**Backend Tasks:**
- [ ] Add BullMQ dependency (`npm install bullmq ioredis`)
- [ ] Create `src/jobs/queue.ts` — Queue configuration
- [ ] Create `src/jobs/workers/exportWorker.ts` — PDF/DOCX export processing
- [ ] Create `src/jobs/workers/importWorker.ts` — Document import processing
- [ ] Create `src/jobs/workers/verifyWorker.ts` — Proof verification processing
- [ ] Create `src/jobs/workers/index.ts` — Worker orchestration
- [ ] Add `REDIS_URL` environment variable
- [ ] Add job status tracking
- [ ] Add retry logic with exponential backoff
- [ ] Create `GET /jobs/:id` status endpoint
- [ ] Update export routes to queue jobs instead of sync processing
- [ ] Update import routes to queue jobs
- [ ] Add WebSocket events for job completion

**Job Schema:**
```typescript
interface Job {
  id: string;
  type: 'export:pdf' | 'export:docx' | 'import' | 'verify';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  docId: string;
  userId: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: any;
  error?: string;
}
```

**Frontend Tasks:**
- [ ] Create `JobStatusIndicator.tsx` component
- [ ] Show job progress for exports/imports
- [ ] Show job queue status in UI
- [ ] Handle job completion via WebSocket

**Acceptance Criteria:**
- Heavy operations processed asynchronously
- Job progress visible to users
- Failed jobs retry automatically
- Job history queryable

---

### P4.4 Database Migrations System

**Goal:** Formal migration system for schema changes

**Backend Tasks:**
- [ ] Add `better-sqlite3-migrations` or similar
- [ ] Create `migrations/` directory structure
- [ ] Create migration for each schema change:
  - `001_initial_schema.sql`
  - `002_add_artifacts.sql`
  - `003_add_verification_reports.sql`
  - etc.
- [ ] Create `scripts/migrate.ts` to run migrations
- [ ] Add migration status tracking table
- [ ] Add rollback support
- [ ] Add migration dry-run mode
- [ ] Document migration process

**Acceptance Criteria:**
- All schema changes via migrations
- Migrations are idempotent
- Rollback works
- Migration history tracked

---

## P5 — OBSERVABILITY (Medium Priority)

### P5.1 Structured JSON Logging

**Goal:** Machine-readable logs for analysis

**Backend Tasks:**
- [ ] Add `pino` logger (already in Fastify)
- [ ] Configure JSON output format
- [ ] Add structured fields to all log calls:
  - `requestId`
  - `userId`
  - `workspaceId`
  - `docId`
  - `action`
  - `duration`
  - `status`
- [ ] Create logging middleware for request/response
- [ ] Add log levels configuration via env
- [ ] Add log rotation configuration
- [ ] Remove console.log statements, replace with logger

**Log Schema:**
```json
{
  "level": "info",
  "time": 1704067200000,
  "requestId": "req_abc123",
  "userId": "usr_xyz",
  "workspaceId": "ws_123",
  "msg": "AI compose completed",
  "action": "ai:compose",
  "docId": "doc_456",
  "duration": 1523,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "tokens": 450
}
```

**Acceptance Criteria:**
- All logs in JSON format
- Consistent field structure
- Request ID correlation works
- Log levels configurable

---

### P5.2 Metrics Collection

**Goal:** Prometheus-compatible metrics export

**Backend Tasks:**
- [ ] Add `prom-client` dependency
- [ ] Create `src/metrics/index.ts` with metrics:
  - `kacheri_ai_requests_total` (counter, labels: action, provider, status)
  - `kacheri_ai_request_duration_seconds` (histogram, labels: action, provider)
  - `kacheri_export_requests_total` (counter, labels: kind, status)
  - `kacheri_verification_runs_total` (counter, labels: status)
  - `kacheri_active_websocket_connections` (gauge)
  - `kacheri_documents_total` (gauge)
  - `kacheri_proofs_total` (gauge)
- [ ] Create `GET /metrics` endpoint (Prometheus format)
- [ ] Add metrics collection to AI routes
- [ ] Add metrics collection to export routes
- [ ] Add metrics collection to WebSocket handlers

**Acceptance Criteria:**
- Metrics endpoint returns Prometheus format
- All key operations instrumented
- Histograms have appropriate buckets
- Gauges update in real-time

---

### P5.3 Health Check Endpoints

**Goal:** Comprehensive health monitoring

**Backend Tasks:**
- [ ] Enhance `GET /health` endpoint with detailed checks:
  - Database connectivity
  - Storage provider connectivity
  - Redis connectivity (if using queues)
  - AI provider availability
- [ ] Add `GET /health/ready` for Kubernetes readiness
- [ ] Add `GET /health/live` for Kubernetes liveness
- [ ] Add response time thresholds
- [ ] Add degraded state handling

**Response Schema:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-30T12:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "up", "latency": 2 },
    "storage": { "status": "up", "latency": 15 },
    "redis": { "status": "up", "latency": 1 },
    "ai:openai": { "status": "up" },
    "ai:anthropic": { "status": "up" }
  }
}
```

**Acceptance Criteria:**
- Health endpoint reflects actual system state
- Individual component health visible
- Latency metrics included
- Kubernetes probe compatible

---

### P5.4 Observability Dashboard Integration

**Goal:** Ready for Grafana/similar dashboards

**Tasks:**
- [ ] Create Grafana dashboard JSON template
- [ ] Create alert rules for:
  - High AI error rate (>5%)
  - High verification failure rate (>2%)
  - High latency (p99 > 5s)
  - WebSocket connection drops
- [ ] Create runbook for each alert
- [ ] Document metrics and their meaning
- [ ] Add dashboard to repository (`monitoring/dashboards/`)

**Acceptance Criteria:**
- Grafana dashboard importable
- Alert rules defined
- Runbooks documented

---

## Implementation Order

### Sprint 1: Automation Foundation
1. P0.1 — GitHub Actions Workflow
2. P0.3 — Report Archiving System
3. P0.2 — Failure Notifications

### Sprint 2: Visual Trust
4. P1.1 — Proof Health Badges
5. P1.3 — Export Verification Badges
6. P1.4 — Compose Determinism Indicator

### Sprint 3: Workspace Intelligence
7. P2.1 — Workspace AI Safety Dashboard
8. P2.2 — AI Usage Hotspot Detection
9. P2.3 — AI Provider Analytics

### Sprint 4: User Education
10. P3.1 — Onboarding Modal
11. P3.2 — Inline Tooltips
12. P3.3 — Documentation Page

### Sprint 5: Infrastructure (Part 1)
13. P4.4 — Database Migrations System
14. P4.1 — Full Artifacts Table
15. P5.1 — Structured JSON Logging

### Sprint 6: Infrastructure (Part 2)
16. P4.2 — Storage Abstraction Layer
17. P5.2 — Metrics Collection
18. P5.3 — Health Check Endpoints

### Sprint 7: Advanced Features
19. P1.2 — AI-Usage Heatmap Overlay
20. P4.3 — Background Job Queue
21. P5.4 — Observability Dashboard

---

## Acceptance Criteria for Phase 5 Complete

### Automation
- [ ] Nightly verification runs automatically via GitHub Actions
- [ ] Failures trigger Slack/email notifications
- [ ] Reports archived and queryable for 90 days

### Visual Trust
- [ ] Every document shows proof health badge
- [ ] AI-touched sections visually distinguishable (heatmap)
- [ ] Exports show verification status
- [ ] Compose actions show determinism status

### Workspace Intelligence
- [ ] Workspace-level AI safety metrics available
- [ ] Hotspot documents automatically detected
- [ ] Provider performance tracked and comparable

### User Education
- [ ] New users see onboarding walkthrough
- [ ] Contextual tooltips explain proof concepts
- [ ] In-app documentation accessible

### Infrastructure
- [ ] All artifacts tracked in database with integrity
- [ ] Storage abstraction ready for cloud (S3/GCS)
- [ ] Heavy operations processed via job queue
- [ ] Schema changes managed via migrations

### Observability
- [ ] Structured JSON logs throughout
- [ ] Prometheus metrics exported
- [ ] Health checks comprehensive
- [ ] Grafana dashboard ready

---

## Dependencies

| Item | Depends On |
|------|------------|
| P0.2 Notifications | P0.1 GitHub Actions |
| P1.1 Health Badges | P0.3 Report Archiving |
| P1.2 Heatmap | Backend AI ranges endpoint |
| P2.1 Workspace Dashboard | P1.1 Health Badges |
| P4.1 Artifacts Table | P4.4 Migrations System |
| P4.2 Storage Abstraction | P4.1 Artifacts Table |
| P4.3 Job Queue | Redis infrastructure |
| P5.4 Grafana | P5.2 Metrics Collection |

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Artifact migration data loss | Run migration in dry-run mode first; keep filesystem backup |
| Redis dependency for queues | Make queue optional; fall back to sync processing |
| S3/GCS costs | Implement lifecycle policies; compress artifacts |
| Heatmap performance on large docs | Virtualize ranges; lazy load |
| AI provider rate limits during verification | Add rate limiting to rerun verification |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Nightly verification uptime | 99.9% |
| Verification pass rate | > 98% |
| Time to detect verification failure | < 24 hours |
| User understanding of proofs (survey) | > 80% |
| P95 export latency | < 10 seconds |
| Dashboard load time | < 2 seconds |

---

## Estimated Effort

| Priority | Items | Estimated Days |
|----------|-------|----------------|
| P0 | 3 | 5-7 days |
| P1 | 4 | 8-10 days |
| P2 | 3 | 6-8 days |
| P3 | 3 | 4-5 days |
| P4 | 4 | 12-15 days |
| P5 | 4 | 6-8 days |
| **Total** | **21** | **41-53 days** |

---

*This document represents the complete production-grade work scope for Phase 5. All items must be completed to consider Phase 5 fully complete.*
