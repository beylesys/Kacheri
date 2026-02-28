# Document Intelligence

Document Intelligence automatically extracts structured data from imported documents, detects anomalies, and enables actions like reminders and review flags — all with full proof integration.

---

## Overview

When you import a document (PDF, DOCX, HTML, or image via OCR), Kacheri's AI automatically:

1. **Detects the document type** (contract, invoice, proposal, meeting notes, report, or generic)
2. **Extracts structured fields** specific to that document type
3. **Calculates confidence scores** for each extracted field
4. **Detects anomalies** (missing clauses, overdue dates, unusual terms)
5. **Creates a proof record** for auditability

The extraction results appear in the **Intel** panel in the editor sidebar.

---

## Supported Document Types

### Contract
Extracted fields: title, parties (name, role, address), effective date, expiration date, term length, auto-renewal, payment terms (amount, currency, frequency, net days), termination clause, liability limit, governing law, key obligations, signatures.

### Invoice
Extracted fields: invoice number, vendor (name, address, tax ID), customer (name, address), issue date, due date, line items (description, quantity, unit price, amount), subtotal, tax, total, currency, payment instructions.

### Proposal
Extracted fields: title, vendor, client, date, valid-until date, executive summary, scope items, deliverables (name, description, timeline), pricing (total, currency, breakdown, payment schedule), timeline (start/end dates, milestones), assumptions, exclusions.

### Meeting Notes
Extracted fields: title, date, attendees, absentees, agenda items, discussions (topic, summary, decisions), action items (task, assignee, due date, status), next meeting details.

### Report
Extracted fields: title, author, date, reporting period, executive summary, key findings, metrics (name, value, change, trend), recommendations, risks (description, severity, mitigation).

### Generic (Other)
For unrecognized document types: title, date, author, summary, key points, entities (people, organizations, dates, amounts, locations), dates with context, monetary amounts with context.

---

## Anomaly Detection

Document Intelligence automatically flags potential issues in extracted data.

### Universal Rules (All Document Types)
- **Missing Title** — Document has no meaningful title
- **No Dates Found** — No dates were identified
- **No Parties Identified** — No people or organizations found
- **Low Confidence Critical Field** — A key field has confidence below 50%

### Contract-Specific Rules
- **No Termination Clause** — No termination terms found
- **No Liability Limit** — No liability cap specified
- **Unusual Payment Terms** — Payment terms exceed 90 days
- **Missing Signature Dates** — Signatures exist but lack dates
- **No Governing Law** — No jurisdiction specified
- **Long Term Without Auto-Renewal** — Term > 5 years without renewal option

### Invoice-Specific Rules
- **Due Date in Past** — Invoice is overdue
- **Missing Invoice Number** — No invoice number found
- **Line Items Sum Mismatch** — Line items don't add up to total
- **Missing Tax** — No tax on significant amount (>$100)
- **Unusual Payment Terms** — Payment window exceeds 90 days

### Proposal-Specific Rules
- **No Pricing Information** — No cost estimates found
- **No Timeline/Deliverables** — Missing deliverables or timeline
- **Validity Period Expired** — Proposal valid-until date has passed
- **Missing Scope** — No scope definition found

### Meeting Notes-Specific Rules
- **No Action Items** — No follow-up tasks identified
- **Action Items Without Assignees** — Tasks lack owners
- **Action Items Without Due Dates** — Tasks lack deadlines
- **No Attendees Listed** — No participants recorded

---

## Using the Extraction Panel

### Accessing the Panel

Open the extraction panel from the editor in any of these ways:

- Click the **Intel** tab in the right sidebar
- Click the **Intel** button in the toolbar
- Use the command palette (Ctrl/Cmd+K) and select **Extract Intelligence**

### Reading Extraction Results

The panel shows:

1. **Summary Card** — Document type, detection confidence, extraction timestamp, anomaly counts by severity
2. **Document Type Selector** — Override the auto-detected type and re-extract
3. **Anomaly Alerts** — Flagged issues with severity indicators (info, warning, error) and suggestions
4. **Extracted Fields** — All fields with per-field confidence badges (green >= 85%, amber >= 60%, red < 60%)
5. **Actions Panel** — List of scheduled reminders and review flags

### Editing Extracted Fields

- **Inline Edit** — Hover over any field and click the pencil icon to edit in place
- **Bulk Edit** — Click "Edit All" to open a modal for editing all fields at once
- **Correction History** — All edits are tracked; view history in the edit modal

### Re-extracting

- Click **Re-extract** in the panel footer to run extraction again
- Change the document type in the summary card to re-extract as a different type

---

## Actions

### Set Reminder

For date fields (effective dates, due dates, expiration dates):

1. Hover over the date field
2. Click the clock icon
3. Set reminder date and message in the dialog
4. Click "Set Reminder"

When the reminder fires, you receive an in-app notification linking to the document.

### Flag for Review

For any extracted field:

1. Hover over the field
2. Click the flag icon
3. A comment is created on the document for team review

---

## Export

Export extracted data from the panel footer dropdown:

- **JSON** — Download as a structured JSON file
- **CSV** — Download as a flat CSV file
- **Copy to Clipboard** — Copy JSON to clipboard

---

## Workspace Standards

Workspace admins can create custom anomaly detection rules that apply to all extractions within the workspace.

### Accessing Standards

Navigate to **Workspace Settings > Extraction Standards** (admin access required).

### Rule Types

- **Required Field** — Flag when a specific field is missing (e.g., require `terminationClause` on all contracts)
- **Value Range** — Flag when a numeric field is outside bounds (e.g., `paymentTerms.netDays` must be 0-60)
- **Comparison** — Compare two fields (e.g., `startDate` must be before `endDate`)
- **Custom** — Custom validation expression (future use)

### Managing Rules

- Create rules from templates or manually
- Set severity level (info, warning, error)
- Enable/disable individual rules
- Filter by document type

---

## Proof Integration

Every extraction creates a verifiable proof record. From the extraction panel:

- Click **View Proof Record** to navigate to the Proofs panel
- The proof shows: document type, confidence, anomaly count, AI provider/model used, and proof hash
- Filter the Proofs panel by "AI Extraction" to see all extraction proofs

---

## API Reference

See [API_CONTRACT.md](../API_CONTRACT.md) for full endpoint documentation:

- `POST /docs/:id/extract` — Trigger extraction
- `GET /docs/:id/extraction` — Get existing extraction
- `PATCH /docs/:id/extraction` — Apply manual corrections
- `GET /docs/:id/extraction/export?format=json|csv` — Export data
- `POST /docs/:id/extraction/actions` — Create action (reminder/flag)
- `GET /docs/:id/extraction/actions` — List actions
- `DELETE /docs/:id/extraction/actions/:actionId` — Delete/cancel action
- `GET /workspaces/:id/extraction-standards` — List standards
- `POST /workspaces/:id/extraction-standards` — Create standard
- `PATCH /workspaces/:id/extraction-standards/:id` — Update standard
- `DELETE /workspaces/:id/extraction-standards/:id` — Delete standard

---

## Technical Notes

- Extraction runs automatically after document import (non-blocking — import succeeds even if extraction fails)
- Large documents are truncated to 60K characters (12K for Ollama) before extraction
- Documents with insufficient text (<50 chars or <20 alphanumeric) show an "empty document" message
- Extraction timeouts: 10 seconds for type detection, 20 seconds for data extraction
- Multilingual support: extraction works in any language; dates and amounts are normalized
- All AI calls include retry with exponential backoff (max 2 retries)
