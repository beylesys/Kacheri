# Work Scope: Compliance Checker & Clause Library

**Created:** 2026-02-07
**Status:** PLANNING
**Phase:** Post-Pilot Enhancement (from docs-enhancement-planning.md Phase 2)
**Prerequisite:** Document Intelligence (complete), Pilot-Ready Scope (complete)

---

## Table of Contents

1. [Feature A: Compliance Checker](#feature-a-compliance-checker)
2. [Feature B: Clause Library](#feature-b-clause-library)
3. [Shared Infrastructure](#shared-infrastructure)
4. [Execution Order](#execution-order)

---

# Feature A: Compliance Checker

## Vision

Real-time policy enforcement that checks document content against workspace-defined rules. Writers get instant feedback when they violate business rules, and compliance teams can define and manage policies centrally.

**Key differentiator:** Grammarly checks grammar. This checks *business rules* specific to your organization.

## How It Extends Existing Infrastructure

The Compliance Checker builds directly on the Document Intelligence foundation:

| Existing Component | How It's Extended |
|---|---|
| `anomalyDetector.ts` + rule engine | New rule types for text/content scanning (not just extracted fields) |
| `workspace_extraction_standards` table | New `compliance_policies` table with richer rule types |
| `WorkspaceStandardsPage.tsx` | Extended or parallel admin page for compliance policies |
| `ExtractionPanel.tsx` pattern | New `CompliancePanel.tsx` following the same sidebar pattern |
| Proof pipeline (`ai:extraction`) | New `compliance:check` proof kind |
| `composeText()` in modelRouter | AI-powered clause validation and suggestion generation |

## Database Schema

### compliance_policies
Workspace-level policy definitions that documents are checked against.

```sql
CREATE TABLE IF NOT EXISTS compliance_policies (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,                         -- human-readable policy name
  description TEXT,                           -- what this policy enforces
  category TEXT NOT NULL DEFAULT 'general',   -- general, legal, financial, privacy, custom
  rule_type TEXT NOT NULL,                    -- text_match, regex_pattern, required_section,
                                              -- forbidden_term, numeric_constraint, ai_check
  rule_config_json TEXT NOT NULL,             -- JSON: rule-specific configuration
  severity TEXT NOT NULL DEFAULT 'warning',   -- info, warning, error
  document_types_json TEXT NOT NULL DEFAULT '["all"]', -- which doc types this applies to
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_check INTEGER NOT NULL DEFAULT 1,     -- 1 = check on save, 0 = manual only
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

### compliance_checks
Results of running compliance checks against a document.

```sql
CREATE TABLE IF NOT EXISTS compliance_checks (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending, running, passed, failed, error
  total_policies INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  violations INTEGER NOT NULL DEFAULT 0,
  results_json TEXT,                          -- JSON: per-policy results array
  proof_id INTEGER,
  triggered_by TEXT NOT NULL,                 -- 'manual', 'auto_save', 'pre_export'
  checked_by TEXT NOT NULL,                   -- user who triggered
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);
```

## Rule Types

| Rule Type | Config | Example |
|---|---|---|
| `text_match` | `{ pattern: string, matchType: 'contains'\|'exact'\|'startsWith', caseSensitive: boolean }` | "Document must contain 'CONFIDENTIAL' header" |
| `regex_pattern` | `{ pattern: string, flags: string, mustMatch: boolean }` | "No email addresses in external docs" |
| `required_section` | `{ heading: string, minWords?: number }` | "Must have a 'Terms and Conditions' section" |
| `forbidden_term` | `{ terms: string[], caseSensitive: boolean }` | "Never use 'guarantee', 'promise', 'ensure'" |
| `numeric_constraint` | `{ fieldPath: string, operator: 'lt'\|'lte'\|'gt'\|'gte'\|'eq', value: number }` | "SLA must not exceed 99.9%" |
| `ai_check` | `{ instruction: string, failIf: 'yes'\|'no' }` | "Does this document promise unlimited liability?" |

## API Endpoints

```
POST   /docs/:id/compliance/check          -- Trigger compliance check
GET    /docs/:id/compliance                 -- Get latest check result
GET    /docs/:id/compliance/history         -- List past checks

GET    /workspaces/:wid/compliance-policies             -- List policies
POST   /workspaces/:wid/compliance-policies             -- Create policy
PATCH  /workspaces/:wid/compliance-policies/:pid        -- Update policy
DELETE /workspaces/:wid/compliance-policies/:pid        -- Delete policy
GET    /workspaces/:wid/compliance-policies/templates   -- Built-in policy templates
```

## Slices (A1 through A12)

### Slice A1: Database Schema & Store Layer
**Files to create:**
- `KACHERI BACKEND/migrations/006_add_compliance.sql`
- `KACHERI BACKEND/src/store/compliancePolicies.ts`
- `KACHERI BACKEND/src/store/complianceChecks.ts`

**Tasks:**
- Create compliance_policies table with indexes
- Create compliance_checks table with indexes
- Implement CompliancePoliciesStore (CRUD + getEnabled + getByCategory)
- Implement ComplianceChecksStore (create, getLatest, getHistory, updateStatus)
- Row-to-domain converters following existing patterns

---

### Slice A2: Compliance Rule Engine
**Files to create:**
- `KACHERI BACKEND/src/compliance/types.ts`
- `KACHERI BACKEND/src/compliance/engine.ts`
- `KACHERI BACKEND/src/compliance/evaluators/textMatch.ts`
- `KACHERI BACKEND/src/compliance/evaluators/regexPattern.ts`
- `KACHERI BACKEND/src/compliance/evaluators/requiredSection.ts`
- `KACHERI BACKEND/src/compliance/evaluators/forbiddenTerm.ts`
- `KACHERI BACKEND/src/compliance/evaluators/numericConstraint.ts`
- `KACHERI BACKEND/src/compliance/evaluators/index.ts`

**Tasks:**
- Define PolicyEvaluator interface (evaluate function returning ComplianceResult)
- Implement each evaluator as a pure function
- Create engine orchestrator: takes document text/HTML + policies, returns results
- HTML-to-text + heading extraction utilities for section detection
- Error handling per-evaluator (one failure doesn't crash check)

---

### Slice A3: AI-Powered Compliance Check
**Files to create:**
- `KACHERI BACKEND/src/compliance/evaluators/aiCheck.ts`

**Files to modify:**
- `KACHERI BACKEND/src/compliance/evaluators/index.ts` (register ai_check evaluator)

**Tasks:**
- Implement AI-based policy check using `composeText()`
- System prompt: "You are a compliance checker. Answer YES or NO: [instruction]"
- Parse AI response to boolean pass/fail
- Include confidence score from AI response
- Timeout (15s) and retry via existing `withRetry` in modelRouter
- Proof metadata includes AI provider/model

---

### Slice A4: Built-in Policy Templates
**Files to create:**
- `KACHERI BACKEND/src/compliance/templates.ts`

**Tasks:**
- Define 10-15 built-in policy templates across categories:
  - **Legal:** No unlimited liability, require termination clause, require governing law
  - **Financial:** SLA cap (99.9%), payment terms max (Net-90), require pricing section
  - **Privacy:** GDPR clause required, no PII in titles, data processing terms
  - **General:** Confidentiality notice, required disclaimer, forbidden promotional language
- Each template: name, description, category, ruleType, defaultConfig, severity
- Templates are read-only suggestions (users clone into workspace policies)

---

### Slice A5: Compliance Check API Routes
**Files to create:**
- `KACHERI BACKEND/src/routes/compliance.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `KACHERI BACKEND/src/types/proofs.ts` (add `compliance:check` to ProofKind)
- `Docs/API_CONTRACT.md` (document endpoints)

**Tasks:**
- POST /docs/:id/compliance/check: Run all enabled policies, store result, create proof
- GET /docs/:id/compliance: Return latest check with per-policy breakdown
- GET /docs/:id/compliance/history: Paginated history of past checks
- Rate limiting (reuse AI_RATE_LIMITS.compose for AI checks)
- Doc-level permission checks (editor+ for triggering, viewer+ for reading)
- WebSocket broadcast on check completion

---

### Slice A6: Policy Management API Routes
**Files to create:**
- `KACHERI BACKEND/src/routes/compliancePolicies.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `Docs/API_CONTRACT.md` (document endpoints)

**Tasks:**
- CRUD endpoints for workspace compliance policies (admin-only write, member read)
- GET /templates endpoint returning built-in templates
- Validation per rule_type (same pattern as extractionStandards validation)
- Bulk enable/disable toggle

---

### Slice A7: Auto-Check Integration (Save/Export Hooks)
**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (document save handler)
- `KACHERI BACKEND/src/routes/exportDocx.ts`
- `KACHERI BACKEND/src/routes/exportPdfGet.ts` (if exists as a route with doc save)

**Tasks:**
- After document save (PATCH /docs/:id with content change): queue async compliance check if auto_check policies exist
- Before export: run compliance check if policies require pre-export validation
- Non-blocking: compliance check runs in background, results pushed via WebSocket
- Debounce: don't re-check if last check was <30s ago and content unchanged

---

### Slice A8: Frontend API Layer
**Files to create:**
- `KACHERI FRONTEND/src/types/compliance.ts`
- `KACHERI FRONTEND/src/api/compliance.ts`

**Tasks:**
- Define TypeScript types for all compliance schemas
- Implement complianceApi (check, getLatest, getHistory)
- Implement compliancePoliciesApi (list, create, update, delete, getTemplates)
- Follow existing extraction API client patterns

---

### Slice A9: Compliance Panel UI
**Files to create:**
- `KACHERI FRONTEND/src/components/compliance/CompliancePanel.tsx`
- `KACHERI FRONTEND/src/components/compliance/ComplianceResultCard.tsx`
- `KACHERI FRONTEND/src/components/compliance/PolicyViolation.tsx`
- `KACHERI FRONTEND/src/components/compliance/ComplianceBadge.tsx`
- `KACHERI FRONTEND/src/components/compliance/compliance.css`
- `KACHERI FRONTEND/src/components/compliance/index.ts`

**Tasks:**
- Main CompliancePanel: shows latest check results, "Check Now" button
- ComplianceResultCard: summary (X/Y passed, N warnings, M violations)
- PolicyViolation: per-violation card with severity, message, suggestion, location
- ComplianceBadge: green check / amber warning / red error badge
- Loading/error/empty/no-policies states
- Follow ExtractionPanel patterns exactly

---

### Slice A10: Editor Integration
**Files to modify:**
- `KACHERI FRONTEND/src/EditorPage.tsx`

**Tasks:**
- Add "Comply" tab to right drawer (alongside Proofs, Comments, Versions, Suggest, Links, Intel)
- Add CompliancePanel in drawer content
- Add "Comply" toolbar button
- Add "Check Compliance" command palette entry
- WS event listener for compliance check completion
- Compliance status badge in toolbar (green/amber/red based on latest check)

---

### Slice A11: Policy Management UI
**Files to create:**
- `KACHERI FRONTEND/src/pages/WorkspaceCompliancePage.tsx`
- `KACHERI FRONTEND/src/components/compliance/PolicyEditor.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` (add route)

**Tasks:**
- Admin page listing all workspace compliance policies
- PolicyEditor modal for creating/editing (same pattern as StandardRuleEditor)
- Template browser: click a built-in template to clone into workspace
- Category filter, enable/disable toggle, severity badges
- Rule type-specific config fields (text input, regex tester, term list editor)

---

### Slice A12: Polish, Proofs & Testing
**Files to modify:**
- Various compliance files for edge cases

**Files to create:**
- Test files in `KACHERI BACKEND/src/compliance/__tests__/`

**Tasks:**
- Proof integration: compliance checks appear in Proofs panel
- Pre-export compliance gate (optional): warn if violations exist before export
- Large document handling (truncation for AI checks)
- Multilingual policy evaluation
- Unit tests for all evaluators (pure functions)
- Integration tests for engine orchestrator

---

# Feature B: Clause Library

## Vision

A workspace-scoped library of reusable content blocks (clauses, boilerplate, standard language) that users can save, version, search, and insert. AI detects when you're writing something similar to a saved clause and suggests the standard version.

**Key differentiator:** Not static templates. This is *living reusable content* that learns from usage patterns.

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| Templates store (JSON files) | New DB-backed clause store with versioning |
| `composeText()` in modelRouter | AI similarity detection for auto-suggest |
| `TemplateGalleryModal.tsx` pattern | Clause browser modal with search/preview |
| Editor selection handling | "Save as Clause" from selected text |
| Proof pipeline | `clause:insert` and `clause:suggest` proof kinds |
| Workspace scoping | Clauses scoped to workspace with visibility controls |

## Database Schema

### clauses
Workspace-scoped reusable content blocks.

```sql
CREATE TABLE IF NOT EXISTS clauses (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_html TEXT NOT NULL,                 -- Tiptap HTML content
  content_text TEXT NOT NULL,                 -- Plain text for search/AI comparison
  category TEXT NOT NULL DEFAULT 'general',   -- general, legal, financial, boilerplate, custom
  tags_json TEXT DEFAULT '[]',                -- JSON string array for filtering
  language TEXT DEFAULT 'en',
  version INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
```

### clause_versions
Version history for clause content changes.

```sql
CREATE TABLE IF NOT EXISTS clause_versions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  clause_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_html TEXT NOT NULL,
  content_text TEXT NOT NULL,
  change_note TEXT,                           -- "Updated liability cap from $1M to $2M"
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (clause_id) REFERENCES clauses(id) ON DELETE CASCADE
);
```

### clause_usage_log
Tracks where and when clauses are inserted for analytics and provenance.

```sql
CREATE TABLE IF NOT EXISTS clause_usage_log (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  clause_id TEXT NOT NULL,
  clause_version INTEGER NOT NULL,
  doc_id TEXT NOT NULL,
  inserted_by TEXT NOT NULL,
  insertion_method TEXT NOT NULL,             -- 'manual', 'ai_suggest', 'template'
  created_at INTEGER NOT NULL,
  FOREIGN KEY (clause_id) REFERENCES clauses(id) ON DELETE SET NULL,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);
```

## API Endpoints

```
GET    /workspaces/:wid/clauses                      -- List clauses (search, filter)
POST   /workspaces/:wid/clauses                      -- Create clause
GET    /workspaces/:wid/clauses/:cid                 -- Get clause with content
PATCH  /workspaces/:wid/clauses/:cid                 -- Update clause (creates version)
DELETE /workspaces/:wid/clauses/:cid                 -- Archive clause
GET    /workspaces/:wid/clauses/:cid/versions        -- List versions
GET    /workspaces/:wid/clauses/:cid/versions/:vid   -- Get specific version

POST   /docs/:id/clauses/insert                      -- Insert clause into doc (logs usage)
POST   /docs/:id/clauses/suggest                     -- AI: find similar clauses for selection
POST   /workspaces/:wid/clauses/from-selection        -- Create clause from selected text
```

## Slices (B1 through B15)

### Slice B1: Database Schema & Store Layer
**Files to create:**
- `KACHERI BACKEND/migrations/007_add_clauses.sql` (or 006 if compliance is 006)
- `KACHERI BACKEND/src/store/clauses.ts`
- `KACHERI BACKEND/src/store/clauseVersions.ts`

**Tasks:**
- Create clauses table with full-text search index
- Create clause_versions table
- Create clause_usage_log table
- Implement ClausesStore (CRUD + search + getByCategory + incrementUsage)
- Implement ClauseVersionsStore (create, list, getByVersion)
- Row-to-domain converters following existing patterns

---

### Slice B2: Clause CRUD API Routes
**Files to create:**
- `KACHERI BACKEND/src/routes/clauses.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `Docs/API_CONTRACT.md` (document endpoints)

**Tasks:**
- Full CRUD for workspace clauses (workspace member+ for read, editor+ for write)
- GET list with search (title, content_text LIKE), category filter, tag filter
- POST creates clause + initial version record
- PATCH updates content, creates new version, bumps version number
- DELETE archives (soft delete) rather than hard delete
- Pagination support on list endpoint

---

### Slice B3: Clause Versioning API
**Files to modify:**
- `KACHERI BACKEND/src/routes/clauses.ts` (add version endpoints)
- `Docs/API_CONTRACT.md`

**Tasks:**
- GET /clauses/:cid/versions — list all versions with metadata
- GET /clauses/:cid/versions/:vid — get specific version content
- Version created automatically on PATCH (not a separate endpoint)
- Include change_note in PATCH body for version annotation

---

### Slice B4: Clause Insertion & Usage Tracking
**Files to create:**
- `KACHERI BACKEND/src/routes/clauseInsert.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register route)
- `KACHERI BACKEND/src/types/proofs.ts` (add `clause:insert` to ProofKind)
- `Docs/API_CONTRACT.md`

**Tasks:**
- POST /docs/:id/clauses/insert: log usage, increment clause usage_count, return clause HTML
- Create provenance record for clause insertion
- Create proof packet with clause metadata (id, version, title)
- Doc-level permission check (editor+)

---

### Slice B5: AI Similarity Detection Engine
**Files to create:**
- `KACHERI BACKEND/src/ai/clauseMatcher.ts`

**Tasks:**
- `findSimilarClauses(text: string, workspaceId: string)`: given a text selection, find similar clauses
- Step 1: Fast pre-filter using keyword overlap (no AI call for obvious mismatches)
- Step 2: AI comparison for top candidates using `composeText()` with similarity scoring
- System prompt: "Compare this text to the following clauses. Rate similarity 0-100."
- Return ranked list of matches with similarity scores and diff highlights
- Timeout (15s) and token limits

---

### Slice B6: Clause Suggestion API
**Files to modify:**
- `KACHERI BACKEND/src/routes/clauseInsert.ts` (add suggest endpoint)
- `Docs/API_CONTRACT.md`

**Tasks:**
- POST /docs/:id/clauses/suggest: takes selected text, returns similar clauses with scores
- Rate limited (reuse AI_RATE_LIMITS.compose)
- Doc-level permission (editor+)
- Returns: `{ suggestions: [{ clause, similarity, diff }] }`

---

### Slice B7: Create Clause from Selection
**Files to modify:**
- `KACHERI BACKEND/src/routes/clauses.ts` (add from-selection endpoint)
- `Docs/API_CONTRACT.md`

**Tasks:**
- POST /workspaces/:wid/clauses/from-selection: takes HTML + text + metadata, creates clause
- AI auto-generates title and description from content if not provided
- Auto-detect category from content using simple heuristics
- Creates initial version record

---

### Slice B8: Frontend API Layer
**Files to create:**
- `KACHERI FRONTEND/src/types/clause.ts`
- `KACHERI FRONTEND/src/api/clauses.ts`

**Tasks:**
- Define TypeScript types for all clause schemas
- Implement clausesApi (list, get, create, update, archive, listVersions, getVersion)
- Implement clauseActionsApi (insert, suggest, fromSelection)
- Follow existing extraction API client patterns

---

### Slice B9: Clause Library Panel UI
**Files to create:**
- `KACHERI FRONTEND/src/components/clauses/ClauseLibraryPanel.tsx`
- `KACHERI FRONTEND/src/components/clauses/ClauseCard.tsx`
- `KACHERI FRONTEND/src/components/clauses/ClausePreviewModal.tsx`
- `KACHERI FRONTEND/src/components/clauses/clauses.css`
- `KACHERI FRONTEND/src/components/clauses/index.ts`

**Tasks:**
- ClauseLibraryPanel: searchable, filterable list of workspace clauses
- ClauseCard: title, description, category badge, usage count, version, "Insert" button
- ClausePreviewModal: full content preview with HTML rendering, version info, usage stats
- Search input with debounced API calls
- Category filter dropdown
- Empty state: "No clauses yet. Save text from your documents to build your library."
- Follow ExtractionPanel / TemplateGalleryModal patterns

---

### Slice B10: Save as Clause UI
**Files to create:**
- `KACHERI FRONTEND/src/components/clauses/SaveClauseDialog.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/EditorPage.tsx` (selection context menu + toolbar action)

**Tasks:**
- SaveClauseDialog: modal to name, describe, categorize, and tag the clause
- Pre-fill content from editor selection (HTML + text)
- AI-assisted title/description suggestion (optional, uses composeText)
- Category picker + tag input
- Integrate with editor selection: context menu "Save as Clause" option
- Toolbar button (when text is selected): "Save Clause"

---

### Slice B11: Clause Insertion UI
**Files to modify:**
- `KACHERI FRONTEND/src/components/clauses/ClauseLibraryPanel.tsx`
- `KACHERI FRONTEND/src/components/clauses/ClauseCard.tsx`
- `KACHERI FRONTEND/src/EditorPage.tsx`

**Tasks:**
- "Insert" button on each ClauseCard in the library panel
- Clicking Insert: calls clauseActionsApi.insert(), then inserts HTML at cursor via Tiptap
- Provenance toast: "Clause 'Liability Cap' inserted (tracked)"
- Also accessible via command palette: "Insert Clause" opens library panel

---

### Slice B12: AI Auto-Suggest UI
**Files to create:**
- `KACHERI FRONTEND/src/components/clauses/ClauseSuggestionPopover.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/EditorPage.tsx` (integrate suggestion trigger)

**Tasks:**
- When user selects text (>50 chars), show subtle "Similar clause available" indicator
- Debounced API call to POST /docs/:id/clauses/suggest on selection change
- Popover showing top match: clause title, similarity %, "Replace with standard" button
- Dismissible (user can ignore suggestions)
- Only triggers if workspace has clauses (check clause count on editor load)

---

### Slice B13: Clause Version History UI
**Files to create:**
- `KACHERI FRONTEND/src/components/clauses/ClauseVersionHistory.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/components/clauses/ClausePreviewModal.tsx` (add versions tab)

**Tasks:**
- Version list with timestamps, authors, change notes
- View any past version content
- "Restore" button to revert clause to a previous version (creates new version)
- Simple text diff between versions (reuse existing diff patterns)

---

### Slice B14: Workspace Clause Management Page
**Files to create:**
- `KACHERI FRONTEND/src/pages/WorkspaceClausesPage.tsx`
- `KACHERI FRONTEND/src/components/clauses/ClauseEditor.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` (add route)

**Tasks:**
- Full-page clause management for workspace admins/editors
- Table view with columns: title, category, tags, version, usage count, last updated
- Bulk actions: archive selected, change category
- ClauseEditor: create/edit clause with rich text content (mini Tiptap instance or textarea)
- Import clauses from a document (select text regions to save as clauses)
- Route: /workspaces/:id/clauses

---

### Slice B15: Proof Integration, Polish & Testing
**Files to modify:**
- `KACHERI FRONTEND/src/ProofsPanel.tsx` (add clause:insert to filters/formatting)
- `KACHERI FRONTEND/src/utils/tooltipHelpers.ts` (add clause tooltips)
- Various clause files for edge cases

**Files to create:**
- Test files in `KACHERI BACKEND/src/store/__tests__/clauses.test.ts`
- Test files in `KACHERI BACKEND/src/ai/__tests__/clauseMatcher.test.ts`

**Tasks:**
- Clause insertions appear in Proofs panel with clause metadata
- ProofsPanel formatting for clause:insert events
- Large clause handling (content size limits)
- Search performance (index tuning)
- Unit tests for store operations
- Unit tests for similarity matching (keyword overlap)
- Edge case handling (empty clauses, duplicate titles, concurrent edits)

---

# Shared Infrastructure

Both features share:
- Existing proof/provenance pipeline
- Existing AI modelRouter with retry/timeout
- Existing workspace middleware and RBAC
- Existing WebSocket broadcast infrastructure
- Existing right-drawer panel pattern in EditorPage

No new shared infrastructure is required. Both features are independent and can be built in parallel or sequentially.

---

# Execution Order

**Recommended sequence:**

```
Phase 1: Compliance Checker (Slices A1-A12)
  - Builds on Document Intelligence anomaly engine
  - Higher enterprise value for pilots
  - 12 slices

Phase 2: Clause Library (Slices B1-B15)
  - Builds on templates and AI compose
  - Higher vertical value (legal/sales)
  - 15 slices
```

**Alternative (interleaved):**
If both features are needed sooner, backend slices (A1-A7, B1-B7) can run before frontend slices (A8-A12, B8-B15) since they're independent.

**Total scope:** 27 slices across both features.

---

*This document is the authoritative work scope for Compliance Checker and Clause Library features.*
