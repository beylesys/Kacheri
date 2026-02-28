# Redline / Negotiation AI

Redline / Negotiation AI transforms Kacheri into a multi-party contract negotiation platform — import a counterparty's document, see a semantic redline comparison, receive AI-powered change analysis with risk assessment, generate counterproposals, and maintain a full audit trail of every round — all backed by the proof pipeline.

---

## Overview

When you start a negotiation on a document, Kacheri:

1. **Creates a negotiation session** linked to the document and counterparty
2. **Tracks rounds** as numbered snapshots (proposals, counterproposals, revisions)
3. **Compares rounds** using a two-level semantic diff (paragraph + sentence level)
4. **Categorizes every change** as substantive, editorial, or structural
5. **Provides AI analysis** of each change — risk level, impact, historical context, recommendation
6. **Generates AI counterproposals** in three modes (balanced, favorable, minimal change)
7. **Records proof packets** for all AI operations for auditability
8. **Runs cross-feature integrations** — compliance check, extraction, clause library, knowledge graph

---

## Negotiation Lifecycle

Each negotiation session follows a defined lifecycle:

| Status | Description |
|--------|-------------|
| **Draft** | Session created, initial proposal being prepared |
| **Active** | Initial proposal submitted, negotiation in progress |
| **Awaiting Response** | Waiting for counterparty's response |
| **Reviewing** | Counterparty's document imported, reviewing changes |
| **Settled** | All changes resolved, negotiation complete |
| **Abandoned** | Negotiation discontinued (auto-archived after 90 days of inactivity) |

---

## Round Management

Negotiation proceeds through numbered rounds. Each round captures a complete document snapshot.

### Round Types

| Type | When Used |
|------|-----------|
| **Initial Proposal** | First round (your starting document) |
| **Counterproposal** | External party's response (imported document) |
| **Revision** | Internal revision before sending |
| **Final** | Final agreed version |

### Importing External Documents

Import a counterparty's document (DOCX or PDF) as a new round:

1. Open the Negotiate panel in the editor
2. Navigate to the active session
3. Click "Import Round" and upload the counterparty's file
4. Kacheri converts the document, creates a round snapshot, and runs a redline comparison against the previous round
5. All detected changes appear in the change list

File size limit: 50 MB. Conversion timeout: 30 seconds.

---

## Semantic Redline Comparison

When a new round is imported, Kacheri compares it against the previous round using a two-level algorithm:

### Level 1: Paragraph Diff
- Splits both documents into paragraphs
- Uses LCS (Longest Common Subsequence) to identify matching paragraphs
- Unmatched paragraphs are paired by text similarity (threshold: 70%)
- Paragraphs above the threshold are treated as delete + insert (structural)

### Level 2: Sentence Refinement
- For paired (modified) paragraphs, splits into sentences
- Runs sentence-level LCS for precise change boundaries
- Identifies exact insertions, deletions, and replacements within each paragraph

### Change Categories

| Category | Description | Examples |
|----------|-------------|----------|
| **Substantive** | Changes to terms, amounts, obligations, rights | Monetary amounts, legal keywords (liability, indemnity, termination), modal verbs (shall, must, may not), percentages, party names |
| **Editorial** | Grammar, formatting, punctuation changes | Punctuation corrections, capitalization, minor rewording with no legal impact |
| **Structural** | Large-scale reorganization | Whole-section replacement (>500 chars), heading changes, section reordering |

---

## AI Change Analysis

### Single Change Analysis (Deep Dive)

For any change, request a detailed AI analysis that includes:

- **Risk level:** Low, Medium, High, or Critical
- **Summary:** One-sentence description of what changed
- **Impact:** Business and legal impact assessment
- **Historical context:** How this compares to past deals with the same counterparty (e.g., "73% of the time you accepted similar terms")
- **Clause comparison:** How the proposed language differs from your clause library standards
- **Compliance flags:** Any violations of your active compliance policies
- **Recommendation:** Accept, Reject, Counter, or Review — with reasoning

### Batch Analysis

Analyze all changes in a round at once:

- Substantive and structural changes are analyzed individually (highest priority)
- Editorial changes are grouped together (up to 8 per AI call) for efficiency
- Maximum 10 AI calls per batch to control cost
- Already-analyzed changes are skipped (cached)
- Changes that cannot be analyzed by AI receive a heuristic fallback

### Risk Level Guide

| Level | Meaning |
|-------|---------|
| **Low** | Editorial or minor changes with no legal/financial impact |
| **Medium** | Obligation changes, percentage modifications, generic substantive edits |
| **High** | Monetary amounts, liability keywords, negative obligations (shall not, may not), termination/penalty clauses |
| **Critical** | Flagged by AI as requiring immediate legal review |

---

## AI Counterproposals

Generate compromise language for any disputed change. Three modes are available:

### Balanced
Splits the difference between both positions. Both sides make roughly equal concessions. Best for standard negotiation where maintaining the relationship is important.

### Favorable
Leans toward your original position while making minimal acceptable concessions. Preserves your key protections and terms. Best when you have strong leverage.

### Minimal Change
Makes the smallest possible modification to the counterparty's proposed text that preserves your key terms. Keeps as much of their language as possible while re-inserting critical terms they removed or weakened. Best for minor adjustments.

### How It Works

1. Select a change and choose "Generate Counterproposal"
2. Pick a mode (Balanced, Favorable, or Minimal Change)
3. AI gathers context: clause library standards, historical deals, compliance policies
4. AI generates compromise language with a full rationale
5. The rationale includes: what you concede, what they concede, and what is preserved
6. Review, edit if needed, then accept to apply

If a clause library match is found, it is linked to the counterproposal for traceability.

---

## Side-by-Side Redline View

Compare two rounds visually:

- **Left pane:** Previous round (your version)
- **Right pane:** Current round (their version)
- **Color coding:** Red (removed text), green (added text), yellow (modified text)
- **Synchronized scrolling** between panes
- **Click any highlight** to see the change details and AI analysis
- **Summary bar:** Counts of substantive, editorial, and structural changes
- **Keyboard navigation:** Arrow keys or j/k to move between changes

---

## Cross-Feature Integration

When a round is imported, several subsystems activate automatically:

### Compliance Auto-Check
Active compliance policies are automatically checked against the imported document. Results are stored for audit.

### Document Extraction
Key terms are extracted from the counterparty's document and fed into the knowledge graph for entity enrichment.

### Historical Deal Analysis
The AI change analyzer and counterproposal generator query the knowledge graph for:
- Past negotiation history with the counterparty (sessions, outcomes, average rounds)
- Acceptance rates by change category and risk level
- Monetary amount trends across past deals
- Similar past changes and their resolutions

### Clause Library Integration
During counterproposal generation, the clause library is searched for standard language alternatives. When a counterproposal references a clause library entry, acceptance tracks usage for future reference.

---

## Using the Negotiate Panel

### Starting a Negotiation

1. Open any document in the editor
2. Click the "Negotiate" button in the toolbar (or press Ctrl/Cmd+Shift+N)
3. Click "Start Negotiation"
4. Enter the counterparty name and session title
5. The current document becomes Round 1 (initial proposal)

### Importing a Counterparty Document

1. Open the Negotiate panel
2. Navigate to the active session
3. Click "Import Round"
4. Upload the counterparty's DOCX or PDF
5. Review the detected changes in the change list

### Analyzing Changes

1. View the change list for any round
2. Click "Analyze All" for batch analysis, or click individual changes for deep-dive analysis
3. Review risk levels, recommendations, and historical context
4. Accept, reject, or counter each change

### Settling a Negotiation

1. Resolve all pending changes (accept, reject, or counter)
2. Click "Settle" to finalize the negotiation
3. Accepted changes are converted to editor suggestions
4. Apply suggestions to update the document

---

## Workspace Negotiations Page

View all negotiations across your workspace at `/workspaces/:id/negotiations`:

- **Stats bar:** Active negotiations, settled this month, average rounds, acceptance rate
- **Filters:** Filter by status and search by counterparty name
- **Table:** Document, counterparty, status, rounds, change counts (accepted/rejected/pending), last activity
- **Navigation:** Click any row to open the document with the Negotiate panel

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd+Shift+N | Toggle Negotiate panel |

### Command Palette Entries

| Command | Description |
|---------|-------------|
| Start Negotiation | Create a new negotiation session |
| Import Counterparty Document | Import a document into the active negotiation |
| View Redline Comparison | Open side-by-side redline view |
| Analyze Changes | View the change list with AI analysis |

---

## Proof Integration

All AI operations in the negotiation workflow create proof records:

### negotiation:analyze
Records AI-powered change analysis. Includes session ID, change ID, risk level, recommendation, and whether the result was from cache (batch mode).

### negotiation:counterproposal
Records AI-generated counterproposals. Includes session ID, change ID, counterproposal ID, and the generation mode used.

Both proof kinds appear in the Proofs & Activity panel with structured rendering — risk level badges, mode indicators, and batch statistics.
