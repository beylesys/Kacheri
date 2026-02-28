# Document Intelligence / Auto-Extract — Full Work Scope

**Created:** 2026-02-05
**Status:** APPROVED FOR IMPLEMENTATION
**Scope Level:** Full (Any doc type, custom schemas, View + actions + alerts)
**UI Location:** Sidebar Panel

---

## Executive Summary

Document Intelligence transforms Kacheri from a document creation tool into a document *understanding* tool. When users import any document (PDF, DOCX, etc.), AI automatically extracts structured data (parties, dates, amounts, terms, obligations) and presents it in an actionable sidebar panel with anomaly detection and proof integration.

---

## Feature Requirements

### Core Capabilities

1. **Auto-Extraction on Import**
   - Trigger extraction automatically when document is imported
   - Support manual re-extraction for existing documents
   - Handle all supported import formats (PDF, DOCX, HTML, images via OCR)

2. **Document Type Detection**
   - Auto-detect document type (contract, invoice, proposal, meeting notes, report, other)
   - Allow manual override of detected type
   - Support custom document type definitions

3. **Structured Data Extraction**
   - Extract type-specific fields based on document type
   - Return confidence scores for each extracted field
   - Support nested/complex field structures

4. **Anomaly Detection**
   - Flag missing expected fields ("No termination clause found")
   - Flag unusual values ("Payment terms 120 days exceeds typical 30-60 days")
   - Compare against workspace standards (if defined)

5. **Actions**
   - Set reminders based on extracted dates
   - Export extracted data (JSON, CSV)
   - Flag for review (creates comment/task)
   - Compare to standard terms (future: Compliance Checker integration)

6. **Proof Integration**
   - Every extraction is a proofed AI action
   - Store extraction inputs, outputs, confidence scores
   - Support verification/replay of extractions

---

## Document Type Schemas

### Contract Schema
```typescript
interface ContractExtraction {
  documentType: 'contract';
  title: string;
  parties: Array<{
    name: string;
    role: 'party_a' | 'party_b' | 'other';
    address?: string;
  }>;
  effectiveDate?: string;
  expirationDate?: string;
  termLength?: string;
  autoRenewal?: boolean;
  paymentTerms?: {
    amount?: number;
    currency?: string;
    frequency?: string;
    dueDate?: string;
    netDays?: number;
  };
  terminationClause?: {
    noticePeriod?: string;
    conditions?: string[];
  };
  liabilityLimit?: {
    amount?: number;
    currency?: string;
  };
  governingLaw?: string;
  keyObligations?: string[];
  signatures?: Array<{
    party: string;
    signedDate?: string;
  }>;
}
```

### Invoice Schema
```typescript
interface InvoiceExtraction {
  documentType: 'invoice';
  invoiceNumber: string;
  vendor: {
    name: string;
    address?: string;
    taxId?: string;
  };
  customer: {
    name: string;
    address?: string;
  };
  issueDate: string;
  dueDate: string;
  lineItems: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
  }>;
  subtotal: number;
  tax?: number;
  total: number;
  currency: string;
  paymentInstructions?: string;
}
```

### Proposal Schema
```typescript
interface ProposalExtraction {
  documentType: 'proposal';
  title: string;
  vendor: string;
  client: string;
  date: string;
  validUntil?: string;
  executiveSummary?: string;
  scope: string[];
  deliverables: Array<{
    name: string;
    description?: string;
    timeline?: string;
  }>;
  pricing: {
    total?: number;
    currency?: string;
    breakdown?: Array<{
      item: string;
      amount: number;
    }>;
    paymentSchedule?: string;
  };
  timeline?: {
    startDate?: string;
    endDate?: string;
    milestones?: Array<{
      name: string;
      date: string;
    }>;
  };
  assumptions?: string[];
  exclusions?: string[];
}
```

### Meeting Notes Schema
```typescript
interface MeetingNotesExtraction {
  documentType: 'meeting_notes';
  title: string;
  date: string;
  attendees: string[];
  absentees?: string[];
  agenda?: string[];
  discussions: Array<{
    topic: string;
    summary: string;
    decisions?: string[];
  }>;
  actionItems: Array<{
    task: string;
    assignee?: string;
    dueDate?: string;
    status?: string;
  }>;
  nextMeeting?: {
    date?: string;
    agenda?: string[];
  };
}
```

### Report Schema
```typescript
interface ReportExtraction {
  documentType: 'report';
  title: string;
  author?: string;
  date: string;
  period?: {
    from: string;
    to: string;
  };
  executiveSummary?: string;
  keyFindings: string[];
  metrics?: Array<{
    name: string;
    value: string | number;
    change?: string;
    trend?: 'up' | 'down' | 'stable';
  }>;
  recommendations?: string[];
  risks?: Array<{
    description: string;
    severity?: 'low' | 'medium' | 'high';
    mitigation?: string;
  }>;
}
```

### Generic/Other Schema
```typescript
interface GenericExtraction {
  documentType: 'other';
  title: string;
  date?: string;
  author?: string;
  summary: string;
  keyPoints: string[];
  entities: Array<{
    type: 'person' | 'organization' | 'date' | 'amount' | 'location' | 'other';
    value: string;
    context?: string;
  }>;
  dates: Array<{
    date: string;
    context: string;
  }>;
  amounts: Array<{
    value: number;
    currency?: string;
    context: string;
  }>;
}
```

---

## Anomaly Detection Rules

### Universal Rules
- Missing title
- No dates found
- No parties/entities identified
- Very low confidence on critical fields (<50%)

### Contract-Specific Rules
- No termination clause
- No liability limit specified
- Unusual payment terms (>90 days)
- Missing signature dates
- No governing law specified
- Term > 5 years without auto-renewal option

### Invoice-Specific Rules
- Due date in past
- Missing invoice number
- Line items don't sum to total
- Missing tax for taxable jurisdiction
- Unusual payment terms

### Proposal-Specific Rules
- No pricing information
- No timeline/deliverables
- Valid-until date passed
- Missing scope definition

### Meeting Notes-Specific Rules
- No action items
- Action items without assignees
- Action items without due dates
- No attendees listed

---

## API Contract Additions

### Extract Document Intelligence

```http
POST /docs/:id/extract
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "forceDocType": "contract",  // optional, override auto-detection
  "reextract": false           // optional, force re-extraction even if exists
}
```

**Response:** `200 OK`
```json
{
  "extractionId": "ext_abc123",
  "docId": "doc_xyz789",
  "documentType": "contract",
  "confidence": 0.92,
  "extraction": {
    "title": "Services Agreement",
    "parties": [
      { "name": "Acme Corp", "role": "party_a" },
      { "name": "Beyle Inc", "role": "party_b" }
    ],
    "effectiveDate": "2026-01-01",
    "paymentTerms": {
      "amount": 150000,
      "currency": "USD",
      "frequency": "annual",
      "netDays": 30
    }
  },
  "fieldConfidences": {
    "title": 0.98,
    "parties": 0.95,
    "effectiveDate": 0.88,
    "paymentTerms": 0.85
  },
  "anomalies": [
    {
      "code": "MISSING_TERMINATION_CLAUSE",
      "severity": "warning",
      "message": "No termination clause found in this contract",
      "suggestion": "Consider adding a termination clause"
    }
  ],
  "proofId": "proof_ext_123",
  "extractedAt": "2026-02-05T10:30:00Z"
}
```

---

### Get Document Extraction

```http
GET /docs/:id/extraction
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "extractionId": "ext_abc123",
  "docId": "doc_xyz789",
  "documentType": "contract",
  "extraction": { ... },
  "anomalies": [ ... ],
  "extractedAt": "2026-02-05T10:30:00Z",
  "proofId": "proof_ext_123"
}
```

**Response:** `404 Not Found` (if no extraction exists)

---

### Update Extraction (Manual Corrections)

```http
PATCH /docs/:id/extraction
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "documentType": "contract",
  "corrections": {
    "effectiveDate": "2026-02-01",
    "paymentTerms.netDays": 45
  }
}
```

**Response:** `200 OK`
```json
{
  "extractionId": "ext_abc123",
  "extraction": { ... },
  "correctedFields": ["effectiveDate", "paymentTerms.netDays"],
  "correctedAt": "2026-02-05T11:00:00Z",
  "correctedBy": "usr_xyz"
}
```

---

### Export Extraction

```http
GET /docs/:id/extraction/export?format=json|csv
Authorization: Bearer <accessToken>
```

**Response:** File download with extracted data

---

### Create Action from Extraction

```http
POST /docs/:id/extraction/actions
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "reminder",
  "field": "expirationDate",
  "config": {
    "reminderDate": "2026-12-15",
    "message": "Contract expires in 2 weeks"
  }
}
```

**Response:** `201 Created`
```json
{
  "actionId": "act_123",
  "type": "reminder",
  "status": "scheduled",
  "scheduledFor": "2026-12-15T09:00:00Z"
}
```

---

### List Extraction Actions

```http
GET /docs/:id/extraction/actions
Authorization: Bearer <accessToken>
```

---

### Delete Extraction Action

```http
DELETE /docs/:id/extraction/actions/:actionId
Authorization: Bearer <accessToken>
```

---

### Workspace Extraction Standards (Custom Rules)

```http
GET /workspaces/:id/extraction-standards
POST /workspaces/:id/extraction-standards
PATCH /workspaces/:id/extraction-standards/:standardId
DELETE /workspaces/:id/extraction-standards/:standardId
```

---

## Database Schema

### extractions table
```sql
CREATE TABLE extractions (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL,
  type_confidence REAL NOT NULL,
  extraction_json TEXT NOT NULL,
  field_confidences_json TEXT,
  anomalies_json TEXT,
  proof_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);
CREATE INDEX idx_extractions_doc ON extractions(doc_id);
CREATE INDEX idx_extractions_type ON extractions(document_type);
```

### extraction_corrections table
```sql
CREATE TABLE extraction_corrections (
  id TEXT PRIMARY KEY,
  extraction_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  corrected_by TEXT NOT NULL,
  corrected_at INTEGER NOT NULL,
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
);
CREATE INDEX idx_corrections_extraction ON extraction_corrections(extraction_id);
```

### extraction_actions table
```sql
CREATE TABLE extraction_actions (
  id TEXT PRIMARY KEY,
  extraction_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('reminder', 'flag_review', 'export', 'compare')),
  field_path TEXT,
  config_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled')),
  scheduled_for INTEGER,
  completed_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
);
CREATE INDEX idx_actions_extraction ON extraction_actions(extraction_id);
CREATE INDEX idx_actions_status ON extraction_actions(status);
CREATE INDEX idx_actions_scheduled ON extraction_actions(scheduled_for);
```

### workspace_extraction_standards table
```sql
CREATE TABLE workspace_extraction_standards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('required_field', 'value_range', 'comparison', 'custom')),
  rule_config_json TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX idx_standards_workspace ON workspace_extraction_standards(workspace_id);
CREATE INDEX idx_standards_doctype ON workspace_extraction_standards(document_type);
```

---

## Implementation Slices

### Slice 1: Database Schema & Store Layer
**Files to create:**
- `KACHERI BACKEND/migrations/004_add_extractions.sql`
- `KACHERI BACKEND/src/store/extractions.ts`
- `KACHERI BACKEND/src/store/extractionActions.ts`

**Scope:**
- Create database migrations for all 4 tables
- Implement CRUD operations for extractions
- Implement CRUD for extraction_corrections
- Implement CRUD for extraction_actions
- Unit tests for store functions

**Acceptance Criteria:**
- All tables created via migration
- Store functions work for create/read/update/delete
- Indexes verified

---

### Slice 2: AI Extraction Engine
**Files to create:**
- `KACHERI BACKEND/src/ai/extractors/types.ts`
- `KACHERI BACKEND/src/ai/extractors/documentTypeDetector.ts`
- `KACHERI BACKEND/src/ai/extractors/contractExtractor.ts`
- `KACHERI BACKEND/src/ai/extractors/invoiceExtractor.ts`
- `KACHERI BACKEND/src/ai/extractors/proposalExtractor.ts`
- `KACHERI BACKEND/src/ai/extractors/meetingNotesExtractor.ts`
- `KACHERI BACKEND/src/ai/extractors/reportExtractor.ts`
- `KACHERI BACKEND/src/ai/extractors/genericExtractor.ts`
- `KACHERI BACKEND/src/ai/extractors/index.ts`

**Scope:**
- Define TypeScript types for all schemas
- Implement document type detection via AI
- Implement extraction prompts for each document type
- Parse AI responses into structured schemas
- Calculate confidence scores
- Handle extraction errors gracefully

**Acceptance Criteria:**
- Can detect document type from text
- Each extractor returns typed schema
- Confidence scores calculated for all fields
- Errors don't crash extraction

---

### Slice 3: Anomaly Detection Engine
**Files to create:**
- `KACHERI BACKEND/src/ai/extractors/anomalyDetector.ts`
- `KACHERI BACKEND/src/ai/extractors/rules/universalRules.ts`
- `KACHERI BACKEND/src/ai/extractors/rules/contractRules.ts`
- `KACHERI BACKEND/src/ai/extractors/rules/invoiceRules.ts`
- `KACHERI BACKEND/src/ai/extractors/rules/proposalRules.ts`
- `KACHERI BACKEND/src/ai/extractors/rules/meetingNotesRules.ts`

**Scope:**
- Implement rule engine for anomaly detection
- Universal rules (missing title, no dates, etc.)
- Document-type-specific rules
- Return anomalies with severity and suggestions
- Support workspace custom rules

**Acceptance Criteria:**
- Universal rules trigger correctly
- Type-specific rules work
- Anomalies include code, severity, message, suggestion
- Custom workspace rules respected

---

### Slice 4: Extraction API Routes
**Files to create:**
- `KACHERI BACKEND/src/routes/extraction.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `Docs/API_CONTRACT.md` (document endpoints)

**Scope:**
- POST /docs/:id/extract — trigger extraction
- GET /docs/:id/extraction — get existing extraction
- PATCH /docs/:id/extraction — manual corrections
- GET /docs/:id/extraction/export — export data
- Wire up to extraction engine and store
- Create proof records for extractions
- Rate limiting on extraction endpoint

**Acceptance Criteria:**
- All endpoints return correct responses
- Extraction creates proof record
- Manual corrections tracked
- Export works for JSON and CSV
- Rate limited appropriately

---

### Slice 5: Import Integration
**Files to modify:**
- `KACHERI BACKEND/src/routes/importDoc.ts`

**Scope:**
- After successful import acceptance, auto-trigger extraction
- Store extraction result
- Return extraction summary in import response
- Handle extraction failures gracefully (don't fail import)

**Acceptance Criteria:**
- Importing a document auto-extracts
- Extraction failure doesn't block import
- Import response includes extraction summary

---

### Slice 6: Extraction Actions Backend
**Files to modify:**
- `KACHERI BACKEND/src/routes/extraction.ts`

**Files to create:**
- `KACHERI BACKEND/src/jobs/workers/reminderWorker.ts`

**Scope:**
- POST /docs/:id/extraction/actions — create action
- GET /docs/:id/extraction/actions — list actions
- DELETE /docs/:id/extraction/actions/:id — delete action
- Implement reminder scheduling via job queue
- Implement flag for review (creates comment)

**Acceptance Criteria:**
- Can create/list/delete actions
- Reminders scheduled in job queue
- Flag for review creates comment on doc

---

### Slice 7: Workspace Standards Backend
**Files to create:**
- `KACHERI BACKEND/src/store/extractionStandards.ts`
- `KACHERI BACKEND/src/routes/extractionStandards.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts`

**Scope:**
- CRUD endpoints for workspace extraction standards
- Integrate custom rules into anomaly detection
- Admin-only access control

**Acceptance Criteria:**
- Can create custom anomaly rules per workspace
- Rules applied during extraction
- Only workspace admins can modify

---

### Slice 8: Frontend API Layer
**Files to create:**
- `KACHERI FRONTEND/src/api/extraction.ts`
- `KACHERI FRONTEND/src/types/extraction.ts`

**Scope:**
- TypeScript types for all extraction schemas
- API client functions for all extraction endpoints
- Error handling

**Acceptance Criteria:**
- All API functions typed correctly
- Error responses handled

---

### Slice 9: Extraction Sidebar Panel UI
**Files to create:**
- `KACHERI FRONTEND/src/components/extraction/ExtractionPanel.tsx`
- `KACHERI FRONTEND/src/components/extraction/ExtractionSummaryCard.tsx`
- `KACHERI FRONTEND/src/components/extraction/FieldDisplay.tsx`
- `KACHERI FRONTEND/src/components/extraction/ConfidenceBadge.tsx`
- `KACHERI FRONTEND/src/components/extraction/AnomalyAlert.tsx`
- `KACHERI FRONTEND/src/components/extraction/index.ts`
- `KACHERI FRONTEND/src/components/extraction/extraction.css`

**Scope:**
- Sidebar panel showing extraction results
- Summary card with document type and key fields
- Field display with confidence indicators
- Anomaly alerts with severity styling
- Loading and error states
- "Re-extract" button
- Empty state for non-imported docs

**Acceptance Criteria:**
- Panel displays all extracted fields
- Confidence badges show visually
- Anomalies displayed prominently
- Re-extract triggers new extraction
- Handles loading/error states

---

### Slice 10: Field Editing UI
**Files to create:**
- `KACHERI FRONTEND/src/components/extraction/FieldEditor.tsx`
- `KACHERI FRONTEND/src/components/extraction/EditExtractionModal.tsx`

**Scope:**
- Inline editing of extracted fields
- Modal for bulk field editing
- Save corrections via API
- Show correction history

**Acceptance Criteria:**
- Can edit individual fields inline
- Modal allows editing all fields
- Corrections saved and tracked
- History viewable

---

### Slice 11: Actions UI
**Files to create:**
- `KACHERI FRONTEND/src/components/extraction/ActionButton.tsx`
- `KACHERI FRONTEND/src/components/extraction/ReminderDialog.tsx`
- `KACHERI FRONTEND/src/components/extraction/ActionsPanel.tsx`

**Scope:**
- Action buttons per field (set reminder, flag)
- Reminder configuration dialog
- Actions list showing scheduled/completed
- Delete action functionality

**Acceptance Criteria:**
- Can set reminder from extracted date
- Can flag document for review
- Actions list shows status
- Can cancel/delete actions

---

### Slice 12: Export UI
**Files to create:**
- `KACHERI FRONTEND/src/components/extraction/ExportDropdown.tsx`

**Scope:**
- Export dropdown in extraction panel
- JSON export
- CSV export
- Copy to clipboard

**Acceptance Criteria:**
- Can export as JSON file
- Can export as CSV file
- Can copy to clipboard

---

### Slice 13: Editor Integration
**Files to modify:**
- `KACHERI FRONTEND/src/EditorPage.tsx`

**Scope:**
- Add Extraction Panel to right sidebar options
- Fetch extraction on document load
- Show extraction indicator in toolbar
- Add "Extract Intelligence" command to palette
- Toggle between panels (Comments, Versions, Extraction, etc.)

**Acceptance Criteria:**
- Extraction panel accessible from editor
- Auto-loads extraction if exists
- Command palette integration works
- Panel toggle works smoothly

---

### Slice 14: Document Type Override UI
**Files to create:**
- `KACHERI FRONTEND/src/components/extraction/DocumentTypeSelector.tsx`

**Scope:**
- Dropdown to change detected document type
- Re-extract with new type
- Show type confidence

**Acceptance Criteria:**
- Can override document type
- Re-extraction uses selected type
- Original confidence shown

---

### Slice 15: Workspace Standards UI
**Files to create:**
- `KACHERI FRONTEND/src/pages/WorkspaceStandardsPage.tsx`
- `KACHERI FRONTEND/src/components/extraction/StandardRuleEditor.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` (add route)

**Scope:**
- Page to manage workspace extraction standards
- Create/edit/delete custom rules
- Rule templates for common checks
- Admin-only access

**Acceptance Criteria:**
- Can create custom anomaly rules
- Rules applied to extractions
- Only admins see the page

---

### Slice 16: Proof Integration UI
**Files to modify:**
- `KACHERI FRONTEND/src/ProofsPanel.tsx`
- `KACHERI FRONTEND/src/components/extraction/ExtractionPanel.tsx`

**Scope:**
- Show extraction proof in Proofs Panel
- Link from extraction panel to proof
- Proof shows extraction inputs/outputs

**Acceptance Criteria:**
- Extraction appears in proofs list
- Can navigate from extraction to proof
- Proof details show extraction data

---

### Slice 17: Notifications Integration
**Files to modify:**
- `KACHERI BACKEND/src/jobs/workers/reminderWorker.ts`
- `KACHERI BACKEND/src/store/notifications.ts`

**Scope:**
- Reminder triggers create notification
- Notification links to document
- Email notification option (if configured)

**Acceptance Criteria:**
- Reminders create in-app notifications
- Can click notification to open doc
- Email sent if enabled

---

### Slice 18: Polish & Edge Cases
**Scope:**
- Handle very large documents (chunking)
- Handle documents with no extractable content
- Handle mixed-language documents
- Performance optimization
- Error recovery and retry logic
- Loading states throughout

**Acceptance Criteria:**
- Large docs don't timeout
- Empty extractions handled gracefully
- Non-English docs work
- Performance acceptable (<10s extraction)

---

### Slice 19: Documentation & Testing
**Files to create:**
- `KACHERI BACKEND/src/ai/extractors/__tests__/`
- `Docs/features/document-intelligence.md`

**Files to modify:**
- `Docs/API_CONTRACT.md` (final review)

**Scope:**
- Integration tests for extraction flow
- User documentation
- API contract finalization
- Update CLAUDE.md if needed

**Acceptance Criteria:**
- Tests pass for all extraction types
- User docs explain feature
- API contract complete

---

## Estimated Effort by Slice

| Slice | Description | Effort |
|-------|-------------|--------|
| 1 | Database Schema & Store | 1 day |
| 2 | AI Extraction Engine | 3-4 days |
| 3 | Anomaly Detection Engine | 2 days |
| 4 | Extraction API Routes | 1-2 days |
| 5 | Import Integration | 0.5 days |
| 6 | Extraction Actions Backend | 1-2 days |
| 7 | Workspace Standards Backend | 1 day |
| 8 | Frontend API Layer | 0.5 days |
| 9 | Extraction Sidebar Panel UI | 2-3 days |
| 10 | Field Editing UI | 1-2 days |
| 11 | Actions UI | 1-2 days |
| 12 | Export UI | 0.5 days |
| 13 | Editor Integration | 1 day |
| 14 | Document Type Override UI | 0.5 days |
| 15 | Workspace Standards UI | 1-2 days |
| 16 | Proof Integration UI | 1 day |
| 17 | Notifications Integration | 0.5 days |
| 18 | Polish & Edge Cases | 2-3 days |
| 19 | Documentation & Testing | 1-2 days |
| **Total** | | **21-30 days** |

---

## Dependencies

| Slice | Depends On |
|-------|------------|
| 2 (AI Engine) | 1 (Database) |
| 3 (Anomaly) | 2 (AI Engine) |
| 4 (API Routes) | 1, 2, 3 |
| 5 (Import) | 4 |
| 6 (Actions Backend) | 4 |
| 7 (Standards Backend) | 3, 4 |
| 8 (Frontend API) | 4 |
| 9-16 (All Frontend) | 8 |
| 17 (Notifications) | 6 |
| 18 (Polish) | All above |
| 19 (Docs/Tests) | All above |

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| AI extraction quality varies | Tune prompts per doc type; show confidence |
| Long extraction times | Async via job queue; show progress |
| Complex nested data structures | Start with flat fields; add nesting later |
| User corrections lost | Track all corrections with history |
| Large docs exhaust context | Chunk documents; extract iteratively |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Extraction accuracy (key fields) | > 85% |
| Document type detection accuracy | > 90% |
| Extraction time (avg) | < 10 seconds |
| User correction rate | < 20% of extractions |
| Feature adoption (% of imports) | > 50% |

---

*This document is the authoritative work scope for Document Intelligence. All implementation must follow these specifications.*
