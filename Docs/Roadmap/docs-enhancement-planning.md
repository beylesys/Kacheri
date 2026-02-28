# Docs Enhancement Planning — Feature Differentiators

**Created:** 2026-01-09
**Status:** PLANNING (Ideas Captured)
**Next Action:** Prioritize and scope for future phases

---

## Context

Kacheri Docs has a strong foundation: AI-native editing with a cryptographic proof/evidence layer. This provides enterprise value (compliance, audit trails, tamper detection), but we need **consumer-grade differentiators** — features that solve real pain points and make regular users *want* to use Kacheri over Google Docs, Notion, or Word.

This document captures potential feature differentiators for Docs, following the same approach used for Decks planning (see `phase6-decks-planning.md`).

---

## Strategic Challenge

### The Verification Layer Isn't Enough

The proof pipeline is powerful but invisible to most users. They don't wake up thinking "I need verifiable AI editing." They wake up thinking:

- "I need to understand this contract I just received"
- "I keep rewriting the same clauses over and over"
- "Did they change something in this document?"
- "Does this comply with our company policies?"

**We need features that solve these daily pains** — with the proof layer as the underlying infrastructure, not the headline.

---

## Feature Differentiator Ideas

### 1. Document Intelligence / Auto-Extract (RECOMMENDED)

**Pain point:** People receive contracts, proposals, and reports but must manually read and extract key information (dates, amounts, parties, obligations).

**Feature:**
- Drop any document (PDF, DOCX) into Kacheri
- AI auto-extracts structured data:
  - Contract: parties, effective date, term, payment terms, termination clauses
  - Invoice: vendor, amount, due date, line items
  - Proposal: pricing, scope, timeline, deliverables
- Creates a structured "summary card" you can act on
- Flag anomalies: "This contract has no termination clause" or "Payment terms differ from your standard (Net 30 vs Net 60)"

**Why it's different:** Other tools help you *create* documents. This helps you *understand* documents you receive.

**Proof integration:** Extraction results are proofed; you can verify the AI's interpretation.

**Example flow:**
1. User imports a contract PDF
2. Kacheri extracts: "Services Agreement between Acme Corp and Beyle Inc, effective Jan 1, 2026, $150,000/year, Net-30 payment, 90-day termination notice"
3. Structured card appears in sidebar
4. User can act: "Set reminder", "Compare to standard terms", "Flag for legal review"

**Effort:** Medium
**Value:** Very High
**Uniqueness:** High

---

### 2. Smart Clause Library with Auto-Suggest

**Pain point:** Lawyers, sales teams, and business people constantly rewrite the same clauses, terms, and boilerplate. They copy-paste from old documents and often introduce errors or use outdated language.

**Feature:**
- Build a personal/team "clause library" as you write
- AI detects when you're writing something similar to a saved clause: "You have a liability clause that's been used 12 times. Insert it?"
- Auto-suggest standard language based on document type
- Track clause versions and usage across documents
- "This clause was last updated 3 months ago; here's the current version"

**Why it's different:** Not templates (static). This is *living reusable content* that learns from your writing patterns.

**Proof integration:** Every clause insertion is tracked; you can audit "where did this language come from?"

**Effort:** Medium
**Value:** High (especially legal/sales verticals)
**Uniqueness:** Medium-High

---

### 3. Compliance Checker / Policy Enforcer

**Pain point:** Enterprises have style guides, legal requirements, and policies. Writers constantly violate them unknowingly. Legal/compliance teams spend hours reviewing documents.

**Feature:**
- Define rules: "Never promise SLAs above 99.9%", "Always include GDPR clause in EU contracts", "Use approved disclaimer language"
- Real-time checking as you write
- Flag violations: "Line 23 promises 99.99% uptime. Your policy allows maximum 99.9%"
- Suggest fixes: "Replace with approved language"
- Pre-submit validation: "This document passes 12/12 compliance checks"

**Why it's different:** Grammarly checks grammar. This checks *business rules* specific to your organization.

**Proof integration:** Compliance check results logged; audit shows document was validated before sending.

**Effort:** Medium
**Value:** Very High (enterprise)
**Uniqueness:** High

---

### 4. Redline/Negotiation Mode with AI Assist

**Pain point:** Contract negotiation is painful. Send Word doc, they mark it up, compare versions, manually accept/reject, track who said what across multiple rounds.

**Feature:**
- Native redline/track changes (suggestions mode exists)
- **AI Negotiation Assistant:**
  - "They want to change liability from $1M to $500K. Here's similar language from your past deals. 73% of the time you accepted $750K."
  - "This indemnification clause is more aggressive than your standard."
  - Auto-generate counterproposal: "Suggest middle-ground version"
- Full audit trail of every proposal/counter-proposal
- Side-by-side: "Your version vs Their version vs Compromise"

**Why it's different:** Not just diff/merge. AI *understands* negotiation and helps you strategize.

**Proof integration:** Every negotiation round permanently recorded.

**Effort:** High
**Value:** Very High
**Uniqueness:** Very High

---

### 5. Cross-Document Intelligence (Knowledge Graph)

**Pain point:** Information is scattered across hundreds of documents. "What did we agree with Acme Corp?" requires searching through emails and old files.

**Feature:**
- As you write, Kacheri builds a knowledge graph:
  - Entities: People, companies, products, dates, amounts
  - Relationships: "Contract X mentions Company Y with payment terms Z"
- Ask questions across your document corpus:
  - "What are all our active contracts with payment terms over $50K?"
  - "Show me every document mentioning Project Alpha"
  - "What did we last agree with Acme Corp regarding liability?"
- AI answers with citations linking to specific documents and paragraphs

**Why it's different:** Not keyword search. *Semantic understanding* across your entire workspace.

**Proof integration:** Query results traceable to source documents.

**Effort:** High
**Value:** High
**Uniqueness:** Very High

---

## Prioritization Matrix

| Feature | Pain Intensity | Uniqueness | Effort | Enterprise Value | Consumer Value |
|---------|----------------|------------|--------|------------------|----------------|
| **Document Intelligence/Auto-Extract** | Very High | High | Medium | High | High |
| **Compliance Checker** | High | High | Medium | Very High | Low |
| **Clause Library** | High | Medium | Medium | High | Medium |
| **Redline/Negotiation AI** | Very High | Very High | High | Very High | Medium |
| **Cross-Doc Intelligence** | High | Very High | High | High | Medium |

---

## Recommendation

### Phase 1: Document Intelligence / Auto-Extract

**Why start here:**
1. **Immediate value on import** — extends existing robust import pipeline
2. **Solves daily pain** — everyone receives documents they need to understand quickly
3. **Differentiates clearly** — Google Docs, Notion, Word don't do this
4. **Natural proof integration** — extraction becomes a proofed AI action
5. **Foundation for more** — once you extract structured data, you can build Compliance Checker, Cross-Doc Intelligence, etc.

### Phase 2: Compliance Checker (Enterprise) OR Clause Library (Vertical)

Depends on go-to-market strategy:
- **Enterprise focus:** Compliance Checker first
- **Legal/Sales vertical:** Clause Library first

### Phase 3: Cross-Document Intelligence

Strategic long-term play. Requires corpus of documents to be valuable.

### Phase 4: Redline/Negotiation AI

High-impact but complex. Best tackled after foundational features are solid.

---

## Comparison to Decks Planning

| Aspect | Decks Differentiators | Docs Differentiators |
|--------|----------------------|---------------------|
| **Top pick** | AI Story Coach + Confidence Mode | Document Intelligence/Auto-Extract |
| **Theme** | Help you *present better* | Help you *understand and manage* documents |
| **Proof leverage** | Track improvements over time | Verify AI interpretations |
| **Consumer appeal** | Rehearsal mode, story feedback | Quick extraction, anomaly detection |
| **Enterprise appeal** | Collaborative AI attribution | Compliance checking, audit trails |

---

## Decisions Made

### 1. Which feature to prioritize first?
- [x] **Document Intelligence / Auto-Extract** ✅ SELECTED (2026-02-05)
- [ ] Compliance Checker (Phase 2)
- [ ] Clause Library (Phase 2)
- [ ] Other

### 2. Target document types for extraction?
- [x] **All of the above (general)** ✅ SELECTED (2026-02-05)
  - Contracts (legal)
  - Invoices/Financial docs
  - Proposals/SOWs
  - Meeting notes/Reports
  - Generic/Other (fallback)

### 3. Integration with existing features?
- **Proofs Panel:** Extractions appear as proofed AI actions ✅
- **UI Location:** Sidebar panel ✅ SELECTED (2026-02-05)
- **Confidence display:** Per-field badges with percentage ✅

### 4. Scope level?
| Level | Extraction Types | Actions | Effort | Status |
|-------|------------------|---------|--------|--------|
| Lean | 1-2 doc types, basic fields | View only | 2-3 weeks | |
| Moderate | 3-4 doc types, rich fields | View + export | 4-6 weeks | |
| **Full** | Any doc type, custom schemas | View + actions + alerts | 8+ weeks | ✅ SELECTED |

---

## Implementation Status

### Phase 1: Document Intelligence / Auto-Extract
**Status:** ✅ COMPLETE (19/19 slices)
**Work Scope:** [document-intelligence-work-scope.md](document-intelligence-work-scope.md)
**Session:** [2026-02-05-document-intelligence.md](../session-reports/2026-02-05-document-intelligence.md)

### Phase 2: Compliance Checker & Clause Library
**Status:** ✅ COMPLETE (27/27 slices — 12 Compliance + 15 Clause Library)
**Work Scope:** [compliance-checker-clause-library-work-scope.md](compliance-checker-clause-library-work-scope.md)
**Session:** [2026-02-07-compliance-checker-clause-library.md](../session-reports/2026-02-07-compliance-checker-clause-library.md)

### Phase 3: Cross-Document Intelligence / Knowledge Graph
**Status:** ✅ COMPLETE (20/20 slices)
**Work Scope:** [cross-document-intelligence-work-scope.md](cross-document-intelligence-work-scope.md)
**Session:** [2026-02-08-cross-document-intelligence.md](../session-reports/2026-02-08-cross-document-intelligence.md)

### Phase 4: Redline / Negotiation AI
**Status:** ✅ COMPLETE (21/21 slices)
**Work Scope:** [redline-negotiation-ai-work-scope.md](redline-negotiation-ai-work-scope.md)
**Session:** [2026-02-09-redline-negotiation-ai.md](../session-reports/2026-02-09-redline-negotiation-ai.md)

---

## Session Notes

**2026-01-09:** Strategic discussion on Docs differentiators. Identified need for features beyond the proof layer. Documented 5 potential differentiators with analysis. Recommended Document Intelligence/Auto-Extract as top priority. Questions captured for next planning session.

**2026-02-05:** Decisions made — Full scope selected with sidebar UI. Created comprehensive work scope document with 19 implementation slices. Created session tracker. Ready to begin implementation.

**2026-02-05–06:** Document Intelligence fully implemented (19/19 slices, 165 tests). Email notifications deferred.

**2026-02-06:** Pilot-ready scope completed (3 gaps: user IDs in proofs, workspace scoping, doc-level permissions).

**2026-02-07:** Compliance Checker (12 slices) and Clause Library (15 slices) fully implemented.

**2026-02-08:** Cross-Document Intelligence work scope created (20 slices). Implementation beginning.

**2026-02-09:** Redline / Negotiation AI (Phase 4) fully scoped — 21 implementation slices, 35-50 day estimate. Work scope and session report created. Implementation began immediately.

**2026-02-10:** Redline / Negotiation AI (Phase 4) fully implemented — 21/21 slices complete. Unit tests, feature documentation, and API contract finalized.

---

*All four enhancement phases are complete. See individual work scope documents and session reports for details.*
