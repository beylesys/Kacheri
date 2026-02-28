# Redline / Negotiation AI — Full Work Scope

**Created:** 2026-02-09
**Status:** PLANNING
**Phase:** Enhancement Plan Phase 4 (from docs-enhancement-planning.md)
**Prerequisite:** Document Intelligence (complete), Compliance Checker & Clause Library (complete), Cross-Document Intelligence (complete)

---

## Executive Summary

Redline / Negotiation AI transforms Kacheri from a single-party editing tool into a **multi-party negotiation platform**. Users can import an external counterparty's document, see a semantic redline comparison against their version, receive AI-powered analysis of every change ("They reduced liability from $1M to $500K — your historical acceptance rate for this range is 73%"), generate AI counterproposals, and maintain a full audit trail of every negotiation round — all backed by the proof pipeline.

**Core value propositions:**
1. **Semantic redline** — Not just text diff; AI understands what each change *means*
2. **Negotiation intelligence** — Historical deal analysis, clause library comparison, risk assessment
3. **AI counterproposals** — Generate middle-ground language automatically
4. **Full audit trail** — Every round, every change, every decision — proofed and permanent
5. **Side-by-side comparison** — Visual your-version vs their-version vs compromise

---

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| `suggestions` table + accept/reject system | Extended model for negotiation-sourced suggestions with round tracking |
| `SuggestionsPanel.tsx` + track changes mode | Enhanced with negotiation context, change analysis, AI annotations |
| Version History (snapshots, diff, restore) | Negotiation rounds create named version snapshots automatically |
| `DiffModal.tsx` | Extended into full `RedlineView` with side-by-side semantic comparison |
| `composeText()` in modelRouter | AI analysis, counterproposal generation, risk assessment |
| `clauseMatcher.ts` two-stage similarity | Compare counterparty clauses against clause library standard language |
| Knowledge Graph entities + relationships | Historical deal analysis (e.g., "73% of the time you accepted $750K") |
| Extraction engine (Document Intelligence) | Auto-extract key terms from counterparty's version for structured comparison |
| Compliance Checker policies | Check counterparty's proposed language against your compliance policies |
| Proof pipeline (`ai:compose`, `ai:extraction`) | New `negotiation:analyze`, `negotiation:counterproposal` proof kinds |
| EditorPage right drawer (9 tabs) | New "Negotiate" tab (10th) |
| WebSocket real-time events | Negotiation status broadcasts, round completion events |
| Audit log system | New negotiation-specific audit actions |

---

## Feature Requirements

### Core Capabilities

1. **Negotiation Sessions**
   - Create a negotiation session for any document
   - Track lifecycle: draft → active → awaiting_response → reviewing → settled → abandoned
   - Associate counterparty name/label (no auth required — external party)
   - Link to the document being negotiated
   - Track multiple concurrent negotiations on different documents

2. **Round Management**
   - Each negotiation proceeds through numbered rounds
   - Round types: `initial_proposal`, `counterproposal`, `revision`, `final`
   - Each round captures: who proposed, document snapshot (HTML + text), timestamp
   - Auto-create version snapshot on round creation
   - Import external document as a new round (DOCX/PDF → parse → compare)

3. **Semantic Redline Comparison**
   - Compare two rounds to produce a structured change list
   - Beyond text diff: identify clause-level changes, term modifications, additions, deletions
   - Categorize changes: `substantive` (terms, amounts, obligations), `editorial` (grammar, formatting), `structural` (section reorder, split/merge)
   - Map changes to document sections/headings for navigation

4. **AI Change Analysis**
   - For each substantive change, generate AI analysis:
     - What changed and why it matters
     - Risk assessment (low/medium/high/critical)
     - Historical context from knowledge graph ("You accepted similar terms in 3 of 4 past deals")
     - Clause library comparison ("Your standard language says X; they propose Y")
     - Compliance policy check ("This violates your 'max liability cap' policy")
   - Batch analysis: analyze all changes in a round at once
   - Per-change analysis: deep-dive into a specific change on demand

5. **AI Counterproposal Generation**
   - Given a change, generate compromise language
   - Modes: `balanced` (split the difference), `favorable` (lean toward your position), `minimal_change` (smallest acceptable modification)
   - Reference clause library for standard language alternatives
   - Generate full counterproposal document or per-clause alternatives
   - Proof trail for every AI-generated counterproposal

6. **Side-by-Side Comparison View**
   - Two-pane view: Your Version | Their Version
   - Synchronized scrolling
   - Inline highlights: red (removed), green (added), yellow (modified)
   - Click a change to see AI analysis
   - Optional third pane: Compromise Version

7. **Negotiation Timeline**
   - Visual history of all rounds
   - Per-round summary: what changed, who proposed, when
   - Navigate to any round's snapshot
   - Track accept/reject decisions on individual changes

8. **Integration with Existing Features**
   - Suggestions created from negotiation changes can be accepted/rejected using existing system
   - Compliance checker auto-runs on counterparty's proposed version
   - Extraction engine runs on imported external documents
   - Knowledge graph queried for historical deal context
   - Clause library searched for standard alternatives

---

## Database Schema

### negotiation_sessions
Top-level negotiation tracking. One session per document per counterparty.

```sql
CREATE TABLE IF NOT EXISTS negotiation_sessions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,                        -- "Acme Corp — Services Agreement Negotiation"
  counterparty_name TEXT NOT NULL,            -- "Acme Corp Legal Team"
  counterparty_label TEXT,                    -- "External Counsel" / "Procurement"
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'awaiting_response', 'reviewing', 'settled', 'abandoned')),
  current_round INTEGER NOT NULL DEFAULT 0,
  total_changes INTEGER NOT NULL DEFAULT 0,
  accepted_changes INTEGER NOT NULL DEFAULT 0,
  rejected_changes INTEGER NOT NULL DEFAULT 0,
  pending_changes INTEGER NOT NULL DEFAULT 0,
  started_by TEXT NOT NULL,                   -- user who created the session
  settled_at INTEGER,                         -- timestamp when settled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_neg_sessions_doc ON negotiation_sessions(doc_id);
CREATE INDEX idx_neg_sessions_workspace ON negotiation_sessions(workspace_id);
CREATE INDEX idx_neg_sessions_status ON negotiation_sessions(workspace_id, status);
```

### negotiation_rounds
Individual rounds within a negotiation. Each round is a snapshot of proposals.

```sql
CREATE TABLE IF NOT EXISTS negotiation_rounds (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  session_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  round_type TEXT NOT NULL
    CHECK (round_type IN ('initial_proposal', 'counterproposal', 'revision', 'final')),
  proposed_by TEXT NOT NULL,                  -- 'internal' or 'external'
  proposer_label TEXT,                        -- "John Smith" or "Acme Legal"
  snapshot_html TEXT NOT NULL,                -- full document HTML at this round
  snapshot_text TEXT NOT NULL,                -- plain text for diff/comparison
  snapshot_hash TEXT NOT NULL,                -- sha256 of snapshot_html
  version_id TEXT,                            -- FK to version history (auto-created snapshot)
  import_source TEXT,                         -- 'upload:docx', 'upload:pdf', 'manual', 'ai:counterproposal'
  notes TEXT,                                 -- round-level notes ("Initial draft sent Jan 15")
  change_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES negotiation_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_neg_rounds_session ON negotiation_rounds(session_id);
CREATE INDEX idx_neg_rounds_number ON negotiation_rounds(session_id, round_number);
```

### negotiation_changes
Individual changes detected between rounds. Links to suggestions system.

```sql
CREATE TABLE IF NOT EXISTS negotiation_changes (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  session_id TEXT NOT NULL,
  round_id TEXT NOT NULL,                     -- the round that introduced this change
  change_type TEXT NOT NULL
    CHECK (change_type IN ('insert', 'delete', 'replace')),
  category TEXT NOT NULL DEFAULT 'editorial'
    CHECK (category IN ('substantive', 'editorial', 'structural')),
  section_heading TEXT,                       -- nearest heading for navigation
  original_text TEXT,                         -- text from previous round
  proposed_text TEXT,                         -- text in this round
  from_pos INTEGER NOT NULL,                  -- position in previous round's text
  to_pos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'countered')),
  suggestion_id INTEGER,                      -- FK to suggestions table (if converted)
  risk_level TEXT
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  ai_analysis_json TEXT,                      -- JSON: AI analysis result
  resolved_by TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES negotiation_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES negotiation_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE SET NULL
);

CREATE INDEX idx_neg_changes_session ON negotiation_changes(session_id);
CREATE INDEX idx_neg_changes_round ON negotiation_changes(round_id);
CREATE INDEX idx_neg_changes_status ON negotiation_changes(session_id, status);
CREATE INDEX idx_neg_changes_risk ON negotiation_changes(session_id, risk_level);
```

### negotiation_counterproposals
AI-generated counterproposal alternatives for specific changes.

```sql
CREATE TABLE IF NOT EXISTS negotiation_counterproposals (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  change_id TEXT NOT NULL,
  mode TEXT NOT NULL
    CHECK (mode IN ('balanced', 'favorable', 'minimal_change')),
  proposed_text TEXT NOT NULL,                -- the AI-generated alternative
  rationale TEXT NOT NULL,                    -- why this compromise works
  clause_id TEXT,                             -- FK to clause library if based on standard clause
  proof_id TEXT,                              -- FK to proofs (AI generation proof)
  accepted INTEGER NOT NULL DEFAULT 0,        -- 0 = suggested, 1 = accepted by user
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (change_id) REFERENCES negotiation_changes(id) ON DELETE CASCADE,
  FOREIGN KEY (clause_id) REFERENCES clauses(id) ON DELETE SET NULL,
  FOREIGN KEY (proof_id) REFERENCES proofs(id) ON DELETE SET NULL
);

CREATE INDEX idx_neg_cp_change ON negotiation_counterproposals(change_id);
```

---

## AI Prompt Specifications

### Change Analysis Prompt
```
System: You are a contract negotiation analyst. Given a specific change between two document versions, analyze its significance.

Context:
- Document type: {extractionType}
- Section: {sectionHeading}
- Previous text: {originalText}
- Proposed text: {proposedText}
- Historical data: {historicalContext from knowledge graph}
- Standard clause: {matchingClause from clause library}
- Compliance policies: {relevantPolicies}

Respond with JSON:
{
  "category": "substantive" | "editorial" | "structural",
  "riskLevel": "low" | "medium" | "high" | "critical",
  "summary": "One-sentence description of what changed",
  "impact": "Explanation of business/legal impact",
  "historicalContext": "How this compares to past deals (if available)",
  "clauseComparison": "How this differs from your standard language (if available)",
  "complianceFlags": ["Any policy violations"],
  "recommendation": "accept" | "reject" | "counter" | "review",
  "recommendationReason": "Why this recommendation"
}
```

### Counterproposal Generation Prompt
```
System: You are a contract negotiation expert. Generate compromise language for a disputed clause.

Context:
- Your version: {originalText}
- Their version: {proposedText}
- Mode: {balanced | favorable | minimal_change}
- Your standard clause: {standardClause if available}
- Historical acceptances: {historicalData}

Respond with JSON:
{
  "proposedText": "The compromise language",
  "rationale": "Why this compromise is appropriate",
  "changes_from_yours": "What you're conceding",
  "changes_from_theirs": "What they're conceding",
  "preserves": "Key terms preserved from your original"
}
```

### Round Summary Prompt
```
System: Summarize the changes in this negotiation round.

Context:
- Round number: {roundNumber}
- Proposed by: {internal/external}
- Changes: {changesList with categories}

Respond with JSON:
{
  "summary": "2-3 sentence overview",
  "substantiveChanges": number,
  "editorialChanges": number,
  "structuralChanges": number,
  "riskAssessment": "overall risk level",
  "keyChanges": ["Most important changes, max 5"],
  "recommendedActions": ["What to do next"]
}
```

---

## Implementation Slices

### Slice 1: Database Schema & Store Layer
**Files to create:**
- `KACHERI BACKEND/migrations/009_add_negotiations.sql`
- `KACHERI BACKEND/src/store/negotiationSessions.ts`
- `KACHERI BACKEND/src/store/negotiationRounds.ts`
- `KACHERI BACKEND/src/store/negotiationChanges.ts`
- `KACHERI BACKEND/src/store/negotiationCounterproposals.ts`

**Scope:**
- Create migration with all 4 tables + all indexes
- Implement NegotiationSessionsStore (CRUD + getByDoc + getByWorkspace + updateStatus + updateCounts)
- Implement NegotiationRoundsStore (create, getBySession, getById, getLatest)
- Implement NegotiationChangesStore (create, getByRound, getBySession, updateStatus, batchCreate, getByStatus)
- Implement NegotiationCounterproposalsStore (create, getByChange, accept)

**Acceptance Criteria:**
- All tables created via migration
- Store functions work for all CRUD operations
- Indexes verified for performance
- Foreign keys enforce referential integrity

---

### Slice 2: Redline Comparator Engine
**Files to create:**
- `KACHERI BACKEND/src/negotiation/redlineComparator.ts`
- `KACHERI BACKEND/src/negotiation/types.ts`

**Scope:**
- Accept two text snapshots (previous round + current round) and produce structured change list
- Paragraph-level diff: split text by paragraphs, diff at paragraph level for structural changes
- Sentence-level diff within modified paragraphs for precise change boundaries
- Categorize changes:
  - `substantive`: terms, amounts, dates, party names, obligations, rights modified
  - `editorial`: grammar, punctuation, formatting, word choice (non-legal meaning)
  - `structural`: section added/removed/reordered, heading changes
- Map each change to nearest section heading (for navigation)
- Calculate positions (from_pos, to_pos) relative to source text
- Return structured array of `DetectedChange` objects

**Acceptance Criteria:**
- Detects insertions, deletions, and replacements accurately
- Categorizes changes with >80% accuracy (substantive vs editorial)
- Maps changes to section headings
- Handles large documents (50+ page contracts) within 5s
- Graceful handling of completely different documents

---

### Slice 3: Change Analyzer (AI-Powered)
**Files to create:**
- `KACHERI BACKEND/src/negotiation/changeAnalyzer.ts`

**Scope:**
- For a given negotiation change, produce AI analysis:
  - Risk level assessment (low/medium/high/critical)
  - Business/legal impact description
  - Historical context from knowledge graph (query entities involved in the change)
  - Clause library comparison (search for similar standard clauses)
  - Compliance policy check (run relevant policies against proposed text)
  - Recommendation (accept/reject/counter/review) with reasoning
- Batch analysis mode: analyze all changes in a round efficiently
  - Group changes to minimize AI calls (batch similar/small changes)
  - Rate limit: max 10 AI calls per batch
- Single change deep-dive mode: thorough analysis of one change
- Uses `composeText()` from modelRouter — no new AI infrastructure

**Acceptance Criteria:**
- Produces structured analysis for any change
- Risk levels are reasonable (amounts/liability = high, grammar = low)
- Historical context uses knowledge graph when entities are present
- Clause library comparison finds relevant standard clauses
- Compliance flags raised when policies are violated
- Batch mode completes within 30s for typical round (20-50 changes)

---

### Slice 4: Counterproposal Generator (AI-Powered)
**Files to create:**
- `KACHERI BACKEND/src/negotiation/counterproposalGenerator.ts`

**Scope:**
- Given a specific change + mode, generate compromise language
- Three modes:
  - `balanced`: split the difference, fair to both parties
  - `favorable`: lean toward user's original position
  - `minimal_change`: smallest modification to counterparty's text that protects key terms
- Context gathering:
  - Fetch matching clause from clause library (if exists)
  - Fetch historical deal data from knowledge graph entities
  - Fetch compliance policies that apply
- Generate rationale explaining the compromise
- Track what's conceded from each side
- Create proof record for every AI generation

**Acceptance Criteria:**
- Generates grammatically correct, legally reasonable compromise text
- Three modes produce meaningfully different outputs
- Clause library referenced when relevant match exists
- Proof record created for every generation
- Handles edge cases: very short clauses, numerical terms, date terms

---

### Slice 5: Round Import Pipeline
**Files to create:**
- `KACHERI BACKEND/src/negotiation/roundImport.ts`

**Scope:**
- Import external counterparty document as a new negotiation round
- Supported formats: DOCX, PDF (reuse existing import converters)
- Pipeline:
  1. Convert uploaded file to HTML using existing import pipeline
  2. Extract plain text for diffing
  3. Compute SHA256 hash of HTML
  4. Auto-create a negotiation round with `proposed_by: 'external'`
  5. Run redline comparison against previous round
  6. Create `negotiation_changes` for all detected differences
  7. Auto-create version snapshot in version history
  8. Optionally trigger extraction on imported content (for entity/term detection)
- Handle re-imports (same round, different file version)

**Acceptance Criteria:**
- DOCX upload creates a new external round
- PDF upload creates a new external round
- Redline changes auto-detected and stored
- Version snapshot auto-created
- Previous round correctly identified for comparison
- Hash computed and stored for integrity

---

### Slice 6: Negotiation API Routes — Sessions & Rounds
**Files to create:**
- `KACHERI BACKEND/src/routes/negotiations.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `KACHERI BACKEND/src/types/proofs.ts` (add `negotiation:analyze`, `negotiation:counterproposal` to ProofKind)
- `Docs/API_CONTRACT.md` (document all endpoints)

**Scope:**
- POST /docs/:id/negotiations — Create negotiation session
- GET /docs/:id/negotiations — List negotiations for a document
- GET /negotiations/:nid — Get session detail with rounds summary
- PATCH /negotiations/:nid — Update session (status, title, counterparty)
- DELETE /negotiations/:nid — Delete session (admin only, with confirmation)
- POST /negotiations/:nid/rounds — Create new round (manual text or snapshot from current doc)
- POST /negotiations/:nid/rounds/import — Import external document as round (file upload)
- GET /negotiations/:nid/rounds — List all rounds
- GET /negotiations/:nid/rounds/:rid — Get round detail with snapshot
- Workspace middleware + RBAC (editor+ for all negotiation operations)

**Acceptance Criteria:**
- All endpoints return correct responses per API contract
- RBAC enforced (editor+ required)
- File upload works for round import
- Session status transitions validated
- Round numbers auto-increment

---

### Slice 7: Negotiation API Routes — Changes & Analysis
**Files to modify:**
- `KACHERI BACKEND/src/routes/negotiations.ts`
- `Docs/API_CONTRACT.md`

**Scope:**
- GET /negotiations/:nid/changes — List all changes (filterable by round, status, category, risk)
- GET /negotiations/:nid/changes/:cid — Get single change with AI analysis
- PATCH /negotiations/:nid/changes/:cid — Update change status (accept/reject/counter)
- POST /negotiations/:nid/changes/:cid/analyze — Trigger AI analysis for a specific change
- POST /negotiations/:nid/rounds/:rid/analyze — Batch analyze all changes in a round
- POST /negotiations/:nid/changes/:cid/counterproposal — Generate AI counterproposal
- GET /negotiations/:nid/changes/:cid/counterproposals — List counterproposals for a change
- POST /negotiations/:nid/changes/accept-all — Accept all pending changes
- POST /negotiations/:nid/changes/reject-all — Reject all pending changes
- GET /negotiations/:nid/summary — Round summary with stats and AI overview
- Rate limiting on AI endpoints (analyze + counterproposal)
- Create proof records for AI operations

**Acceptance Criteria:**
- All endpoints return correct responses
- Filters work (by round, status, category, risk)
- AI analysis creates proof records
- Rate limiting prevents abuse
- Batch accept/reject updates counts correctly

---

### Slice 8: Negotiation Settlement & History
**Files to modify:**
- `KACHERI BACKEND/src/routes/negotiations.ts`

**Scope:**
- POST /negotiations/:nid/settle — Settle negotiation (applies all accepted changes to document)
  - Validates all changes are resolved (accepted, rejected, or countered)
  - Creates final version snapshot
  - Applies accepted changes to document content via existing suggestion system
  - Updates session status to 'settled'
  - Records settlement in provenance + proof
- POST /negotiations/:nid/abandon — Abandon negotiation
  - Marks session as abandoned
  - Preserves all rounds and changes for audit
  - No document modifications
- GET /workspaces/:wid/negotiations — List all negotiations in workspace
  - Filterable by status, counterparty, date range
  - Summary stats per negotiation
- GET /workspaces/:wid/negotiations/stats — Workspace negotiation statistics
  - Active negotiations, settled this month, average rounds, acceptance rate

**Acceptance Criteria:**
- Settlement applies accepted changes to document
- Unresolved changes block settlement
- Abandoned negotiations preserved for audit
- Workspace-level listing works with filters
- Stats calculated correctly

---

### Slice 9: Historical Deal Analyzer Integration
**Files to create:**
- `KACHERI BACKEND/src/negotiation/historicalAnalyzer.ts`

**Scope:**
- Query knowledge graph for historical context relevant to a negotiation change:
  - Find past negotiations with the same counterparty (by entity name)
  - Find similar clauses across workspace documents
  - Calculate acceptance rates for similar terms
  - Find amount trends (e.g., "liability caps with Acme: $1M → $750K → $500K")
- Data sources:
  - Knowledge graph entities + relationships (counterparty entity)
  - Clause library (similar standard clauses)
  - Past negotiation sessions (if counterparty has prior negotiations)
  - Extraction data (amounts, dates, terms from related documents)
- Returns structured context for the Change Analyzer (Slice 3)

**Acceptance Criteria:**
- Finds past deals with same counterparty
- Calculates acceptance rates for similar term types
- Identifies amount trends across negotiations
- Graceful degradation when no historical data exists
- Performance <3s per query

---

### Slice 10: Frontend Types & API Layer
**Files to create:**
- `KACHERI FRONTEND/src/types/negotiation.ts`
- `KACHERI FRONTEND/src/api/negotiations.ts`

**Scope:**
- TypeScript types for all negotiation schemas:
  - NegotiationSession, NegotiationRound, NegotiationChange, Counterproposal
  - NegotiationStatus, RoundType, ChangeCategory, RiskLevel
  - AnalysisResult, CounterproposalResult, RoundSummary
  - NegotiationStats
- API client: negotiationsApi
  - Sessions: create, list, get, update, delete, settle, abandon
  - Rounds: create, import, list, get
  - Changes: list, get, updateStatus, analyze, batchAnalyze, acceptAll, rejectAll
  - Counterproposals: generate, list, accept
  - Workspace: listAll, stats
- File upload helper for round import
- Error handling following existing patterns

**Acceptance Criteria:**
- All types match backend schemas
- All API functions implemented
- File upload works for DOCX/PDF import
- Error handling consistent with other API modules
- No TypeScript errors

---

### Slice 11: Negotiation Panel UI (Drawer Tab)
**Files to create:**
- `KACHERI FRONTEND/src/components/negotiation/NegotiationPanel.tsx`
- `KACHERI FRONTEND/src/components/negotiation/NegotiationSessionCard.tsx`
- `KACHERI FRONTEND/src/components/negotiation/CreateNegotiationDialog.tsx`
- `KACHERI FRONTEND/src/components/negotiation/negotiation.css`
- `KACHERI FRONTEND/src/components/negotiation/index.ts`

**Scope:**
- NegotiationPanel: right drawer tab showing active negotiations for current document
  - "Start Negotiation" button to create new session
  - Active session card with status, round count, change stats
  - Quick actions: import round, view changes, settle
  - Empty state: "No active negotiations" with guidance
- NegotiationSessionCard: compact card for each session
  - Counterparty name, status badge, round indicator
  - Change stats: accepted/rejected/pending counts
  - Progress bar (resolved / total changes)
- CreateNegotiationDialog: modal to start a new negotiation
  - Title, counterparty name/label fields
  - Option to start from current document or import external document
- Loading/error/empty states following existing panel patterns

**Acceptance Criteria:**
- Panel displays active negotiations for current document
- Can create new negotiation session
- Session cards show meaningful stats
- Empty state guides user
- Consistent with other drawer panels (Extraction, Compliance, etc.)

---

### Slice 12: Round Management UI
**Files to create:**
- `KACHERI FRONTEND/src/components/negotiation/RoundTimeline.tsx`
- `KACHERI FRONTEND/src/components/negotiation/RoundCard.tsx`
- `KACHERI FRONTEND/src/components/negotiation/ImportRoundDialog.tsx`

**Scope:**
- RoundTimeline: vertical timeline showing all rounds in a negotiation
  - Alternating left/right for internal/external proposals
  - Round number, type badge, proposer, timestamp
  - Change count per round
  - Click to expand round details or view comparison
- RoundCard: detailed view of a single round
  - Round metadata (type, proposer, source)
  - Notes field (editable)
  - "View Changes" button → navigates to change list
  - "Compare with Previous" button → opens RedlineView
  - Snapshot preview (collapsed, expandable)
- ImportRoundDialog: file upload modal for importing external document
  - Drag-and-drop DOCX/PDF upload
  - Proposer name field
  - Round type selection
  - Progress indicator during import + analysis
  - Preview of detected changes count before confirming

**Acceptance Criteria:**
- Timeline renders all rounds in chronological order
- Internal/external rounds visually distinguished
- File upload works for DOCX and PDF
- Import shows progress and detected change count
- Round notes editable

---

### Slice 13: Change List & Analysis UI
**Files to create:**
- `KACHERI FRONTEND/src/components/negotiation/ChangeList.tsx`
- `KACHERI FRONTEND/src/components/negotiation/ChangeCard.tsx`
- `KACHERI FRONTEND/src/components/negotiation/ChangeAnalysisPanel.tsx`
- `KACHERI FRONTEND/src/components/negotiation/RiskBadge.tsx`

**Scope:**
- ChangeList: filterable list of all changes in a negotiation
  - Filter by: round, status (pending/accepted/rejected/countered), category, risk level
  - Sort by: position, risk level, category
  - Bulk actions: accept all, reject all (with confirmation)
  - Stats header: total changes, accepted, rejected, pending, by category
- ChangeCard: individual change display
  - Original text (red strikethrough) vs proposed text (green highlight)
  - Category badge (substantive/editorial/structural)
  - Risk badge (color-coded: green/yellow/orange/red)
  - Section heading for navigation context
  - Action buttons: Accept, Reject, Counter, Analyze
  - AI analysis expandable section (if analysis exists)
- ChangeAnalysisPanel: expanded AI analysis view
  - Summary, impact, risk level
  - Historical context (from knowledge graph)
  - Clause comparison (from clause library)
  - Compliance flags
  - Recommendation with reasoning
  - "Generate Counterproposal" button
- RiskBadge: reusable risk level indicator component

**Acceptance Criteria:**
- All filters work correctly
- Bulk accept/reject with confirmation
- Change cards show clear before/after text
- AI analysis renders when available
- Risk badges are color-coded and accessible
- Clicking section heading scrolls to that part of document

---

### Slice 14: Counterproposal UI
**Files to create:**
- `KACHERI FRONTEND/src/components/negotiation/CounterproposalModal.tsx`
- `KACHERI FRONTEND/src/components/negotiation/CounterproposalCard.tsx`

**Scope:**
- CounterproposalModal: AI counterproposal generation interface
  - Shows: your original text, their proposed text
  - Mode selector: Balanced / Favorable / Minimal Change (with descriptions)
  - "Generate" button → shows loading → displays AI-generated alternative
  - Generated text is editable before accepting
  - Rationale panel: what you're conceding, what they're conceding, what's preserved
  - "Accept Counterproposal" → creates a countered status + stores the text
  - "Regenerate" → try again with same or different mode
  - Shows clause library match if one was used
- CounterproposalCard: compact card for viewing stored counterproposals
  - Mode badge, proposed text preview, rationale preview
  - Accept/discard buttons

**Acceptance Criteria:**
- Three modes generate different outputs
- Generated text is editable
- Rationale clearly explains compromise
- Accepted counterproposal updates change status
- Can regenerate with different mode
- Clause library match shown when relevant

---

### Slice 15: Side-by-Side Redline View
**Files to create:**
- `KACHERI FRONTEND/src/components/negotiation/RedlineView.tsx`
- `KACHERI FRONTEND/src/components/negotiation/RedlinePaneSide.tsx`
- `KACHERI FRONTEND/src/components/negotiation/RedlineChangeMarker.tsx`

**Scope:**
- RedlineView: full-width modal or page showing side-by-side comparison
  - Left pane: Your version (previous round)
  - Right pane: Their version (current round)
  - Optional center pane: Compromise version (togglable)
  - Synchronized scrolling between panes
  - Changes highlighted inline:
    - Red background + strikethrough: deleted text
    - Green background: added text
    - Yellow background: modified text
  - Change markers in gutter (clickable → scrolls to change, shows analysis)
  - Navigation controls: next change / previous change / jump to change
  - Summary bar: total changes, by category, by risk level
- RedlinePaneSide: individual pane rendering HTML content with highlights
- RedlineChangeMarker: gutter indicator for a change location

**Acceptance Criteria:**
- Side-by-side layout with synchronized scroll
- Changes correctly highlighted with appropriate colors
- Click on change marker shows analysis
- Navigation between changes works
- Large documents render without performance issues
- Responsive (works on different screen sizes)

---

### Slice 16: Editor Integration
**Files to modify:**
- `KACHERI FRONTEND/src/EditorPage.tsx`

**Scope:**
- Add "Negotiate" tab to right drawer (10th tab)
- Add rightDrawerTab type union: `"negotiate"`
- Render NegotiationPanel in drawer content
- Add "Negotiate" toolbar button (scales icon or handshake icon)
- Add command palette entries:
  - "Start Negotiation" → opens CreateNegotiationDialog
  - "Import Counterparty Document" → opens ImportRoundDialog (if active negotiation)
  - "View Redline Comparison" → opens RedlineView (if active negotiation with rounds)
  - "Analyze Changes" → triggers batch analysis on active round
- WebSocket event listeners for negotiation events:
  - `negotiation:round_created` → refresh panel
  - `negotiation:changes_analyzed` → refresh change list
  - `negotiation:settled` → show notification
- Show negotiation status badge on toolbar button when active negotiation exists
- Keyboard shortcut: Ctrl+Shift+N → toggle Negotiate panel

**Acceptance Criteria:**
- Panel accessible from editor via tab, toolbar, or command palette
- All command palette entries work
- WebSocket events refresh panel
- Toolbar button shows active negotiation indicator
- Keyboard shortcut works

---

### Slice 17: Proof & Provenance Integration
**Files to modify:**
- `KACHERI BACKEND/src/types/proofs.ts` (already updated in Slice 6)
- `KACHERI FRONTEND/src/ProofsPanel.tsx` (add negotiation proof kinds to filters/formatting)
- `KACHERI FRONTEND/src/utils/tooltipHelpers.ts` (add negotiation tooltips)

**Scope:**
- Proof kinds: `negotiation:analyze`, `negotiation:counterproposal`
- ProofsPanel: renders negotiation proofs with rich formatting
  - `negotiation:analyze`: shows "Analyzed 25 changes in Round 3" with risk summary
  - `negotiation:counterproposal`: shows "Generated counterproposal for liability clause"
- Provenance: negotiation actions tracked
  - Round creation
  - Change analysis
  - Counterproposal generation
  - Accept/reject decisions
  - Settlement
- Tooltip helpers for negotiation proof types
- Audit log integration for negotiation actions:
  - `negotiation:create`, `negotiation:round_add`, `negotiation:round_import`
  - `negotiation:change_accept`, `negotiation:change_reject`, `negotiation:change_counter`
  - `negotiation:analyze`, `negotiation:counterproposal`
  - `negotiation:settle`, `negotiation:abandon`

**Acceptance Criteria:**
- Negotiation proofs appear in ProofsPanel with rich rendering
- Provenance tracked for all negotiation actions
- Tooltips added
- Audit log entries created

---

### Slice 18: Workspace Negotiations Page
**Files to create:**
- `KACHERI FRONTEND/src/pages/WorkspaceNegotiationsPage.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` (add route)

**Scope:**
- Full-page workspace negotiation management
- Stats bar: active negotiations, settled this month, average rounds, overall acceptance rate
- Negotiation list with filters:
  - By status (active, awaiting response, reviewing, settled, abandoned)
  - By counterparty name
  - By date range
- Each row: document title, counterparty, status badge, round count, change stats, last activity
- Click → navigates to document with negotiation panel open
- "Settled" section: historical negotiations archive
- Route: `/workspaces/:id/negotiations`
- Navigation from workspace sidebar/menu

**Acceptance Criteria:**
- Page displays all workspace negotiations
- Filters work
- Stats correct
- Click navigates to document
- Route registered and navigable
- Consistent with other workspace pages (Compliance, Clauses, Knowledge)

---

### Slice 19: Cross-Feature Integration
**Scope:**
- **Compliance integration:** Auto-run compliance check on imported external round document
  - After round import, trigger compliance check against workspace policies
  - Surface compliance violations as additional context in change analysis
- **Extraction integration:** Auto-extract from imported external documents
  - After round import, trigger extraction for key terms
  - Extracted entities fed to change analyzer for richer context
- **Clause Library integration:** During counterproposal generation, search clause library
  - If standard clause exists for the change's section, suggest it as alternative
  - Track clause usage when counterproposal is accepted
- **Knowledge Graph integration:** Query entities for historical context
  - Counterparty entity → past negotiations, related documents
  - Amount entities → historical trends
  - Term entities → acceptance rates

**Acceptance Criteria:**
- Compliance check runs automatically on imported rounds
- Extraction runs on imported external documents
- Clause library searched during counterproposal generation
- Knowledge graph queried for historical context
- All integrations are non-blocking (failures don't break negotiation flow)

---

### Slice 20: Polish & Edge Cases
**Scope:**
- Large document handling (pagination on changes, lazy loading of round snapshots)
- Empty/new workspace handling (no historical data — graceful degradation)
- Documents without extractions (limited AI analysis — skip entity context)
- Concurrent negotiation sessions on same document (allowed, clearly labeled)
- Round import failures (corrupted files, unsupported formats — clear error messages)
- AI timeout handling (analysis timeout → partial results with retry option)
- Stale negotiation cleanup (abandoned sessions older than 90 days → soft archive)
- Change position drift (document edited between rounds — position recalculation)
- WebSocket reconnection (resume negotiation state after disconnect)
- Keyboard navigation in ChangeList and RedlineView
- Accessibility: ARIA roles on RedlineView panes, screen reader support for change cards

**Acceptance Criteria:**
- Large documents handled without timeout
- Empty states guide users appropriately
- Import failures show clear error messages
- AI timeouts handled gracefully
- Position drift handled for edited documents
- Keyboard navigation works

---

### Slice 21: Documentation & Testing
**Files to create:**
- `KACHERI BACKEND/src/negotiation/__tests__/redlineComparator.test.ts`
- `KACHERI BACKEND/src/negotiation/__tests__/changeAnalyzer.test.ts`
- `KACHERI BACKEND/src/negotiation/__tests__/counterproposalGenerator.test.ts`
- `KACHERI BACKEND/src/negotiation/__tests__/historicalAnalyzer.test.ts`
- `KACHERI BACKEND/src/store/__tests__/negotiationSessions.test.ts`
- `Docs/features/redline-negotiation-ai.md`

**Files to modify:**
- `Docs/API_CONTRACT.md` (final review, add negotiation endpoints to ToC)
- `Docs/Roadmap/docs-enhancement-planning.md` (update Phase 4 status)

**Scope:**
- Unit tests for redline comparator (paragraph diff, sentence diff, categorization)
- Unit tests for change analyzer (risk assessment, recommendation logic)
- Unit tests for counterproposal generator (three modes, clause library integration)
- Unit tests for historical analyzer (entity queries, acceptance rate calculation)
- Store tests for negotiation sessions/rounds/changes CRUD
- User documentation (feature guide)
- API contract finalization (all endpoints documented, added to ToC)
- Enhancement planning status update

**Acceptance Criteria:**
- All tests pass
- User docs explain the feature
- API contract complete and in ToC
- Enhancement planning updated

---

## Estimated Effort by Slice

| Slice | Description | Effort |
|-------|-------------|--------|
| 1 | Database Schema & Store Layer | 1-2 days |
| 2 | Redline Comparator Engine | 2-3 days |
| 3 | Change Analyzer (AI) | 2-3 days |
| 4 | Counterproposal Generator (AI) | 2 days |
| 5 | Round Import Pipeline | 1-2 days |
| 6 | API Routes — Sessions & Rounds | 2 days |
| 7 | API Routes — Changes & Analysis | 2-3 days |
| 8 | Settlement & History | 1-2 days |
| 9 | Historical Deal Analyzer | 2 days |
| 10 | Frontend Types & API Layer | 1 day |
| 11 | Negotiation Panel UI (Drawer Tab) | 2 days |
| 12 | Round Management UI | 2-3 days |
| 13 | Change List & Analysis UI | 2-3 days |
| 14 | Counterproposal UI | 2 days |
| 15 | Side-by-Side Redline View | 3-4 days |
| 16 | Editor Integration | 1 day |
| 17 | Proof & Provenance Integration | 1 day |
| 18 | Workspace Negotiations Page | 2 days |
| 19 | Cross-Feature Integration | 2-3 days |
| 20 | Polish & Edge Cases | 2-3 days |
| 21 | Documentation & Testing | 2-3 days |
| **Total** | | **35-50 days** |

---

## Dependencies

| Slice | Depends On |
|-------|------------|
| 2 (Redline Comparator) | 1 (Database) |
| 3 (Change Analyzer) | 2 (Comparator) |
| 4 (Counterproposal) | 3 (Analyzer) |
| 5 (Round Import) | 1 (Database), 2 (Comparator) |
| 6 (API — Sessions/Rounds) | 1, 5 |
| 7 (API — Changes/Analysis) | 3, 4, 6 |
| 8 (Settlement) | 7 |
| 9 (Historical Analyzer) | 3 (feeds into analyzer context) |
| 10 (Frontend API) | 6, 7, 8 |
| 11 (Negotiation Panel) | 10 |
| 12 (Round UI) | 10 |
| 13 (Change List UI) | 10 |
| 14 (Counterproposal UI) | 10 |
| 15 (Redline View) | 10 |
| 16 (Editor Integration) | 11, 12, 13, 14, 15 |
| 17 (Proofs) | 6 |
| 18 (Workspace Page) | 10 |
| 19 (Cross-Feature) | 7, 9 |
| 20 (Polish) | All above |
| 21 (Docs/Tests) | All above |

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Semantic diff accuracy (substantive vs editorial) | Two-stage: heuristic pre-categorization + AI validation for ambiguous cases |
| AI analysis latency (many changes per round) | Batch mode with parallel processing; max 10 AI calls per batch; cache results |
| Large document comparison performance | Paragraph-level diff first; sentence-level only for modified paragraphs; 5s timeout |
| Counterproposal quality (legally sound language) | Lean on clause library standard language; always editable before accepting; clear disclaimer |
| Historical data availability (new workspace) | Graceful degradation — skip historical context when unavailable, still provide analysis |
| Position drift between rounds (doc edited mid-negotiation) | Anchor changes to text content (not positions); recalculate on demand |
| EditorPage drawer crowded (10 tabs) | Negotiate tab conditionally shown only when active negotiation exists |
| Multiple concurrent negotiations on same doc | Supported but clearly labeled; each session independent |
| External document import fidelity | Reuse proven import pipeline; warn if conversion quality is low |
| Compliance/extraction integration failures | Non-blocking — failures logged, negotiation continues without that context |

---

## Constraints

1. No new runtime dependencies required — builds on existing import pipeline, AI infrastructure, and suggestion system
2. Negotiation sessions are workspace-scoped — same RBAC as documents
3. Editor+ role required for all negotiation operations (creating, importing, accepting, settling)
4. External counterparty is a label, not an authenticated user — no auth required for them
5. Settlement applies changes through existing suggestion accept mechanism — no bypass
6. AI operations (analysis, counterproposal) are rate-limited like other AI endpoints
7. All AI outputs include proof records — no untracked AI operations
8. Negotiation data preserved even after settlement/abandonment for audit purposes

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Redline comparison accuracy | > 90% of changes correctly detected |
| Change categorization accuracy | > 80% substantive vs editorial correct |
| Risk assessment accuracy | > 75% of risk levels appropriate |
| AI analysis response time (single change) | < 5 seconds |
| AI analysis response time (batch, 30 changes) | < 30 seconds |
| Counterproposal generation time | < 8 seconds |
| Round import time (50-page DOCX) | < 15 seconds |
| Side-by-side render time | < 2 seconds |
| Settlement application time | < 5 seconds |
| Historical context query time | < 3 seconds |

---

*This document is the authoritative work scope for Redline / Negotiation AI. All implementation must follow these specifications.*
