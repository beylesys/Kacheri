# Session Report: Cross-Document Intelligence / Knowledge Graph

**Date:** 2026-02-08
**Status:** COMPLETE
**Full Spec:** [cross-document-intelligence-work-scope.md](../Roadmap/cross-document-intelligence-work-scope.md)

---

## Session Goal

Implement the Cross-Document Intelligence / Knowledge Graph feature — a full-scope implementation that automatically harvests entities from document extractions, builds a normalized knowledge graph, enables natural language semantic search across workspace documents, and surfaces related documents via shared entities.

---

## Documents Read

| Document | Location | Status |
|----------|----------|--------|
| Architecture Blueprint | `Docs/blueprint/architecture blueprint.md` | Read |
| Roadmap | `Docs/Roadmap/docs roadmap.md` | Read |
| API Contract | `Docs/API_CONTRACT.md` | Read (structure + ToC) |
| Enhancement Planning | `Docs/Roadmap/docs-enhancement-planning.md` | Read |
| Deferred Work Scope | `Docs/Roadmap/deferred-work-scope.md` | Read |
| Document Intelligence Work Scope | `Docs/Roadmap/document-intelligence-work-scope.md` | Read |
| Document Intelligence Session | `Docs/session-reports/2026-02-05-document-intelligence.md` | Read |
| Pilot Completion Session | `Docs/session-reports/2026-02-06-pilot-completion.md` | Read |
| Compliance & Clause Library Session | `Docs/session-reports/2026-02-07-compliance-checker-clause-library.md` | Read |
| Cross-Doc Intelligence Work Scope | `Docs/Roadmap/cross-document-intelligence-work-scope.md` | Created |

### Codebase Areas Inspected

| Area | Files Read | Purpose |
|------|-----------|---------|
| Document Store | `store/docs.ts` | Doc structure, workspace scoping, listing patterns |
| Extraction Store | `store/extractions.ts` | Extraction schemas, entity data available for harvesting |
| Extraction Types | `ai/extractors/types.ts` | All extraction interfaces (parties, amounts, dates, etc.) |
| Clause Matcher | `ai/clauseMatcher.ts` | Two-stage similarity pattern (keyword pre-filter + AI scoring) |
| AI Model Router | `ai/modelRouter.ts` | composeText interface, retry logic, provider abstraction |
| Migration Files | `migrations/001-007` | Latest migration is 007; next = 008 |
| Server Routes | `server.ts` | Route registration patterns |
| Frontend App | `App.tsx` | Route patterns, 10 existing routes |
| Editor Page | `EditorPage.tsx` | 8 existing drawer tabs, toolbar, command palette patterns |
| Frontend Panels | `ExtractionPanel.tsx`, `CommentsPanel.tsx` | Sidebar panel patterns |
| Frontend Pages | `WorkspaceStandardsPage.tsx`, `WorkspaceClausesPage.tsx` | Workspace page patterns |
| Frontend API | `api/extraction.ts`, `types/extraction.ts` | API client patterns |

---

## Architecture & Roadmap Alignment

### Roadmap Status

Cross-Document Intelligence originates from the enhancement planning document (`docs-enhancement-planning.md`), Phase 3. It relates to:

- **Section 2.4** (Knowledge Graph & Wiki Features) in the main roadmap:
  > Wiki-style graph view of docs and their links, with filters by tag, folder, or status.
  > Semantic search layer on top of cross-doc indexes, grounded in proofs.

- Builds directly on **Document Intelligence** (Phase 1, complete) which provides the entity extraction foundation.

The user has explicitly requested this feature for implementation.

### Architecture Alignment

- **Backend:** Fastify routes + SQLite stores + AI via modelRouter — no new patterns
- **Search:** SQLite FTS5 (built-in, no external dependency) for full-text search
- **Frontend:** React panels following existing sidebar/drawer/modal patterns
- **Proofs:** New proof kinds (`knowledge:search`, `knowledge:index`) following existing pipeline
- **Workspace:** Scoped to workspace, admin-only for entity management
- **Jobs:** New indexing worker following existing worker patterns (reminderWorker, etc.)
- **No new dependencies required**

---

## Constraints & Assumptions

1. Entities are harvested from existing Document Intelligence extraction data — no separate AI entity extraction
2. FTS5 (SQLite built-in) used for keyword search — no vector embeddings or external search engine
3. Semantic search uses FTS5 pre-filter + AI ranking — not pure embedding similarity
4. Entity normalization is semi-automated: AI suggests merges, high-confidence merges auto-applied, others presented to user
5. Relationships are informational (not enforced or actionable yet)
6. No graph visualization in this scope (list/card views only — graph view deferred to prod-ready Section 2.4)
7. No real-time entity detection as-you-type — only on extraction completion
8. Workspace-scoped only — no cross-workspace search
9. Entity limits: 10,000 entities, 5,000 relationships per workspace (configurable)
10. Search timeout: 20s for semantic search, fallback to FTS5 results on timeout

---

## Risks & Drift

| Risk | Severity | Mitigation |
|------|----------|------------|
| Entity normalization quality varies | Medium | Two-stage approach + manual merge; threshold-based auto-merge |
| Semantic search latency | Medium | FTS5 pre-filter; 20s timeout with graceful FTS5 fallback |
| Large workspace entity explosion | Medium | Configurable limits; batch processing; pagination |
| FTS5 query injection | Low | Sanitize all user input; escape special FTS5 characters |
| EditorPage drawer tab bar at 9 tabs | Low | Current layout fits; consider grouping in future polish |
| Stale entities after doc deletion | Low | Cleanup function removes 0-mention entities |
| AI costs for normalization/search | Medium | Pre-filters minimize calls; rate limiting; search uses compose rate limit |
| No graph view (only list/card) | Low | Explicit scope choice; graph view is in prod-ready roadmap Section 2.4 |

---

## Implementation Progress Overview

| Slice | Description | Status |
|-------|-------------|--------|
| 1 | Database Schema & Store Layer | Complete |
| 2 | FTS5 Search Index Sync | Complete |
| 3 | Entity Harvester | Complete |
| 4 | Entity Normalizer (AI-Assisted) | Complete |
| 5 | Relationship Detector | Complete |
| 6 | Semantic Search Engine | Complete |
| 7 | Related Documents Engine | Complete |
| 8 | Knowledge Graph API Routes — Entities & Relationships | Complete |
| 9 | Knowledge Graph API Routes — Search, Indexing & Summary | Complete |
| 10 | Auto-Index Integration Hook | Complete |
| 11 | Background Indexing Worker | Complete |
| 12 | Frontend API Layer | Complete |
| 13 | Related Documents Panel UI | Complete |
| 14 | Workspace Knowledge Explorer Page | Complete |
| 15 | Semantic Search UI | Complete |
| 16 | Entity Detail Modal | Complete |
| 17 | Editor Integration | Complete |
| 18 | Proof Integration | Complete |
| 19 | Polish & Edge Cases | Complete |
| 20 | Documentation & Testing | Complete |

**Legend:** Pending | In Progress | Complete | Blocked

**Overall Progress:** 20 / 20 slices (100%)

---

## Architecture Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| SQLite FTS5 over external search (Elasticsearch) | No new dependency; sufficient for workspace-scale (thousands of docs); can migrate later | 2026-02-08 |
| Two-level entity model (canonical + mentions) | Enables deduplication, alias tracking, and accurate cross-doc counting | 2026-02-08 |
| Harvest from extraction data, not raw doc content | Leverage existing extraction quality; avoid re-parsing documents | 2026-02-08 |
| No graph visualization (list/card views only) | Reduces complexity; graph view explicitly deferred to prod-ready 2.4 | 2026-02-08 |
| FTS5 pre-filter + AI ranking for semantic search | Balances speed (FTS5 <500ms) with quality (AI ranking); reduces AI costs | 2026-02-08 |
| Entity limits per workspace (10K/5K) | Prevents unbounded growth; configurable for large workspaces | 2026-02-08 |
| Co-occurrence as baseline relationship | Simple, reliable; AI labeling adds semantic richness on top | 2026-02-08 |
| Semi-automated normalization (not fully automatic) | Prevents false merges; user has control; high-confidence merges can be auto-applied | 2026-02-08 |
| No new dependencies | FTS5 is built into SQLite; all AI via existing modelRouter | 2026-02-08 |

---

## Dependencies on Completed Features

| Feature | What This Feature Uses |
|---------|----------------------|
| Document Intelligence (19 slices) | Extraction data (extraction_json), entity types, extraction store |
| Pilot Completion (6 slices) | User IDs in provenance, workspace_id scoping, doc-level permissions |
| Compliance Checker (12 slices) | Proof pipeline pattern for knowledge:search events |
| Clause Library (15 slices) | clauseMatcher.ts two-stage similarity pattern |

---

## Verification Steps

After full implementation:
1. Import a contract document → Verify entities harvested (parties, amounts, dates)
2. Import a second document mentioning same parties → Verify entities deduplicated
3. Check Related Documents panel → Verify both docs shown as related
4. Run semantic search: "What are our payment terms?" → Verify AI answer with citations
5. Run keyword search → Verify fast FTS5 results
6. Open Workspace Knowledge Explorer → Verify entity list with stats
7. Click entity → Verify detail modal with mentions and relationships
8. Trigger full re-index → Verify background job completes
9. Check Proofs Panel → Verify knowledge:search events tracked
10. Merge duplicate entities → Verify mentions consolidated

---

## Slice Completion Log

### Slice 1: Database Schema & Store Layer — COMPLETE

**Files Created:**
- `KACHERI BACKEND/migrations/008_add_knowledge_graph.sql` — 4 tables + 2 FTS5 virtual tables + all indexes
- `KACHERI BACKEND/src/store/workspaceEntities.ts` — Canonical entity CRUD + merge + count recalculation
- `KACHERI BACKEND/src/store/entityMentions.ts` — Entity-doc mention CRUD with JOIN queries
- `KACHERI BACKEND/src/store/entityRelationships.ts` — Entity relationship CRUD with pair lookup
- `KACHERI BACKEND/src/store/knowledgeQueries.ts` — Search query log CRUD

**What Was Implemented:**
- Migration 008: workspace_entities, entity_mentions, entity_relationships, knowledge_queries tables
- FTS5 virtual tables: docs_fts (document search), entities_fts (entity search)
- All indexes from work scope schema (workspace, type, normalized_name, doc_count, unique constraints)
- WorkspaceEntitiesStore: create, getById, getByNormalizedName, getByWorkspace (paginated/filtered/sorted), search, update, delete, incrementCounts, recalculateCounts, merge (transactional), count
- EntityMentionsStore: create (INSERT OR IGNORE), getById, getByEntity (with doc JOIN), getByDoc, getByWorkspace, delete, deleteByDoc, deleteByEntity, countByEntity, countDistinctDocsByEntity
- EntityRelationshipsStore: create (INSERT OR IGNORE), getById, getByEntity, getByPair, getByWorkspace (filtered), update, delete, deleteByEntity, count
- KnowledgeQueriesStore: create, getById, getByWorkspace (filtered/paginated), getRecent, count

**What Was NOT Changed:**
- No existing files modified
- No routes, server.ts, or types changed (those are Slice 8+)
- No new dependencies added

**Decisions:**
- Used INSERT OR IGNORE for mentions and relationships (unique constraints prevent duplicates silently)
- Merge is transactional using db.transaction() to ensure atomicity
- EntityMentionWithDoc extended type with LEFT JOIN for doc title (needed by API)

**Next:** Slice 2 (FTS5 Search Index Sync)

---

### Slice 2: FTS5 Search Index Sync — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/knowledge/ftsSync.ts` — FTS5 sync and query module (first file in `knowledge/` directory)

**What Was Implemented:**
- **Query sanitization:** `sanitizeFtsQuery()` — wraps each token in double quotes, escapes internal quotes via doubling. Prevents FTS5 operator injection (AND, OR, NOT, NEAR, *, ^, :, etc.)
- **Document FTS sync:** `syncDocToFts()` — DELETE + INSERT in transaction; converts HTML to plain text via `htmlToPlainText` (reused from `compliance/engine.ts`). `removeDocFromFts()` — DELETE by doc_id. `syncWorkspaceDocsToFts()` — clears workspace entries, batch inserts with prepared statement reuse.
- **Entity FTS sync:** `syncEntityToFts()` — DELETE + INSERT; aliases joined as space-separated string. `removeEntityFromFts()` — DELETE by entity_id. `syncWorkspaceEntitiesToFts()` — reads from workspace_entities table, clears + batch inserts (self-contained, no external input needed).
- **FTS5 query helpers:** `searchDocsFts()` — MATCH query with `snippet()` function (column 3 = content_text, `<mark>` markers), BM25 rank ordering. `searchEntitiesFts()` — MATCH query on name + aliases, BM25 ranking.
- **Aggregated export:** `FtsSync` object with all 9 functions following codebase store pattern.

**What Was NOT Changed:**
- No existing files modified
- No new dependencies added
- Reused existing `htmlToPlainText` from `compliance/engine.ts` (import, not duplication)

**Decisions:**
- DELETE + INSERT pattern for FTS5 updates (FTS5 virtual tables don't support UPDATE)
- Token-quoting sanitization strategy (safest approach per SQLite docs)
- Batch sync clears-then-inserts (atomic via transaction, simpler than diffing)
- Error handling: throw on write ops, return `[]` on read ops (matches codebase patterns)
- Entity batch sync reads directly from workspace_entities table (data in SQLite, unlike doc content in Yjs)

**Syntax Check:**
- `npx tsc --noEmit` — zero errors in ftsSync.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 3 (Entity Harvester)

---

### Slice 3: Entity Harvester — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/knowledge/types.ts` — Shared types for knowledge module (RawEntity, HarvestResult)
- `KACHERI BACKEND/src/knowledge/entityHarvester.ts` — Entity harvester with per-document-type mappers

**What Was Implemented:**
- **Shared types (types.ts):** `RawEntity` (intermediate entity from extraction data with name, entityType, fieldPath, context, confidence, metadata) and `HarvestResult` (counts of created/reused entities, created/skipped mentions, errors)
- **Name normalization:** `normalizeName()` — trim + lowercase for dedup matching
- **Person vs Organization heuristic:** `looksLikeOrganization()` — suffix matching against common org indicators (Corp, LLC, Inc, Ltd, LLP, GmbH, etc.)
- **Amount formatting:** `formatAmount()` — formats numbers as entity names with currency ($150,000 / 150,000 EUR)
- **Per-document-type harvesters (6 functions):**
  - `harvestContract()` — parties → person/organization (via heuristic) + address → location; effectiveDate, expirationDate → date; paymentTerms.amount → amount; liabilityLimit → amount; governingLaw → location; signatures → person + date; keyObligations → term
  - `harvestInvoice()` — vendor/customer → organization + address → location; issueDate, dueDate → date; lineItems → product; total, subtotal, tax → amount (with currency)
  - `harvestProposal()` — vendor/client → organization; dates → date; deliverables → product; pricing → amount (total + breakdown); timeline → date + term (milestones); scope → term
  - `harvestMeetingNotes()` — date → date; attendees/absentees → person; actionItems → person (assignee) + date (dueDate) + term (task); discussions → concept (topic); nextMeeting → date
  - `harvestReport()` — author → person/organization (via heuristic); date, period → date; metrics → term (name) + amount (numeric value); risks → concept; keyFindings, recommendations → concept
  - `harvestGeneric()` — entities array → directly mapped by type (other → term); dates array → date; amounts array → amount; author → person/organization; date → date
- **Core processing:** `processRawEntities()` — for each RawEntity: normalize name, look up existing canonical entity via `getByNormalizedName()`, create new if not found (+ FTS5 sync), create mention (INSERT OR IGNORE), track new-doc associations for accurate `doc_count` increment
- **Public API:** `harvestFromExtraction()` (routes to per-type harvester), `harvestFromDoc()` (loads extraction first), `harvestWorkspace()` (iterates all workspace docs)
- **Idempotency:** Safe to run multiple times — INSERT OR IGNORE on mentions, getByNormalizedName prevents duplicate entities, incrementCounts only fires when new mention actually created

**What Was NOT Changed:**
- No existing files modified
- No routes, server.ts, or types changed
- No new dependencies added
- No AI calls (deterministic mapping only — AI normalization is Slice 4)

**Decisions:**
- Person vs Organization classification uses suffix matching heuristic; AI normalizer (Slice 4) will refine
- Field confidence from extraction's fieldConfidences used when available, else default 0.75
- Amount entities named with formatted values ($150,000) with raw value + currency in metadata
- Each extraction field produces a separate mention with distinct fieldPath (same entity can have multiple mentions per doc from different fields)
- New-doc tracking uses Set of entity IDs from existing mentions + current batch to correctly compute doc_count delta
- Errors per-entity are caught and collected in result.errors (non-fatal), harvesting continues

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from types.ts or entityHarvester.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts, docLinks.ts)

**Next:** Slice 4 (Entity Normalizer — AI-Assisted)

---

### Slice 4: Entity Normalizer (AI-Assisted) — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/knowledge/entityNormalizer.ts` — AI-assisted entity normalization / deduplication engine

**What Was Implemented:**
- **Types:** `DuplicateCandidate` (pre-filter pair with string similarity), `NormalizationSuggestion` (AI-scored merge suggestion with confidence, recommended name, reason, autoMerge flag), `NormalizationResult` (summary of normalization pass with counts and suggestions)
- **Levenshtein distance:** `levenshteinDistance()` — Wagner-Fischer DP algorithm, O(min(m,n)) space. `levenshteinSimilarity()` — normalized to 0-1. Skips names shorter than 3 chars to avoid false positives.
- **Combined similarity:** `combinedSimilarity()` — max of Levenshtein on normalized names, Jaccard on keywords (reused from `clauseMatcher.ts`), and alias overlap check (0.85 boost). Unicode NFC normalization applied before comparison.
- **Pre-filter (Stage 1):** `findDuplicateCandidates()` — groups entities by type, compares all pairs within each type (O(n^2), acceptable at <10K entity workspace scale). Skips exact normalized-name matches (already handled by harvester). Returns pairs above 0.3 threshold, sorted by similarity descending.
- **AI comparison (Stage 2):** System prompt instructs AI to rate entity pairs as same/different with 0-100 confidence, recommended canonical name, and reason. `parseAiNormalizationResponse()` — regex parser for "N: SCORE - CANONICAL_NAME - REASON" format (adapted from clauseMatcher pattern). `aiScoreCandidates()` — batches pairs (max 10 per AI call), includes mention contexts for AI. Uses `withTimeout()` at 15s. On AI failure: graceful fallback to string-similarity-only suggestions (never auto-merges without AI).
- **Merge execution:** `executeMerge()` — determines target (higher docCount, or matching recommended name), collects merged aliases (union of all names minus canonical), calls `WorkspaceEntitiesStore.merge()` (transactional), syncs FTS5 for target, removes source from FTS5.
- **Main entry:** `normalizeWorkspaceEntities()` — full two-stage pipeline with optional auto-merge (default true). Auto-merges suggestions with confidence >= 90. Returns all non-auto-merged suggestions for user review. Supports filtering by entity type.
- **Aggregated export:** `EntityNormalizer` object with all public functions + test-exposed internals.

**What Was NOT Changed:**
- No existing files modified
- No routes, server.ts, or types changed
- No new dependencies added

**Reused From Existing Code:**
- `extractKeywords()` + `jaccardSimilarity()` from `ai/clauseMatcher.ts` — keyword extraction and Jaccard set similarity
- `composeText()` from `ai/modelRouter.ts` — AI text generation
- `withTimeout()` from `ai/extractors/index.ts` — promise timeout wrapper
- `WorkspaceEntitiesStore.merge()` from `store/workspaceEntities.ts` — transactional entity merge
- `FtsSync.syncEntity()` / `FtsSync.removeEntity()` from `knowledge/ftsSync.ts` — FTS5 index maintenance

**Decisions:**
- Two-stage pipeline matches clauseMatcher.ts pattern (fast pre-filter + AI scoring)
- Auto-merge threshold at 90 (high confidence only); suggest threshold at 50
- Pre-filter threshold at 0.3 (permissive, lets AI make the final call)
- Combined similarity uses max(Levenshtein, Jaccard, aliasBoost) — catches different types of near-matches
- AI fallback: on failure, suggestions are generated from string similarity alone but never auto-merged
- Target selection: higher docCount wins (preserves the more-referenced entity as canonical)
- Batch processing: max 10 pairs per AI call to stay within token limits
- Mention contexts included in AI prompt (up to 2 per entity) for better disambiguation

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from entityNormalizer.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 5 (Relationship Detector)

---

### Slice 5: Relationship Detector — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/knowledge/relationshipDetector.ts` — Relationship detector with co-occurrence detection + AI labeling

**What Was Implemented:**
- **Types:** `CoOccurrence` (entity pair with shared docs), `RelationshipDetectionResult` (summary with counts), `CoOccurrenceRow` (raw SQL result)
- **Constants:** `DETECTOR_TIMEOUT_MS = 15_000`, `MAX_AI_BATCH = 8`, `MIN_COOCCURRENCE_DOCS_FOR_AI = 2`, `MAX_EVIDENCE_DOCS = 5`, `STRENGTH_CAP_DOCS = 10`
- **Co-occurrence detection (Stage 1):** `findCoOccurrences()` — raw SQL self-join on `entity_mentions` to find entity pairs sharing documents. Uses `em1.entity_id < em2.entity_id` to avoid duplicate pairs. `GROUP_CONCAT(DISTINCT doc_id)` collects shared doc IDs. Hydrates entity objects from `WorkspaceEntitiesStore.getById()`.
- **Per-entity co-occurrence:** `findCoOccurrencesForEntity()` — scoped version for incremental updates, finds all entities sharing docs with a specific entity.
- **Evidence gathering:** `gatherEvidence()` — looks up mention contexts from both entities in shared documents (up to `MAX_EVIDENCE_DOCS`). Builds evidence array with `{ docId, context }` format matching `RelationshipEvidence` type.
- **Base strength calculation:** `calculateBaseStrength()` — linear scale from 0.1 (1 shared doc) to 1.0 (`STRENGTH_CAP_DOCS` shared docs).
- **Co-occurrence relationship creation:** `createCoOccurrenceRelationships()` — for each co-occurring pair: calculates strength, gathers evidence, checks for existing relationship via `getByPair()`, creates or updates accordingly. Deterministic, no AI.
- **AI relationship labeling (Stage 2):** `aiLabelRelationships()` — filters pairs with 2+ shared docs, builds AI prompt with entity names/types/contexts/aliases, processes in batches of `MAX_AI_BATCH`, uses `composeText()` with `withTimeout(15s)`. AI output format: `N: TYPE - LABEL - CONFIDENCE - REASON`. Blended strength formula: `baseStrength * 0.4 + aiConfidence/100 * 0.6`. Skips AI results where type is `co_occurrence` with confidence < 50. On AI failure: graceful fallback (co_occurrence relationships already exist from Stage 1).
- **AI response parser:** `parseAiRelationshipResponse()` — regex-based line parser (same pattern as `entityNormalizer.ts`). Validates TYPE against allowed relationship types, falls back to `custom` for unknown types.
- **Full workspace detection:** `detectWorkspaceRelationships()` — main entry point. Pipeline: find co-occurrences → create co_occurrence relationships → AI-label pairs with 2+ docs. Returns aggregated result summary.
- **Incremental update:** `updateRelationshipsForEntity()` — called after new entity mention. Finds co-occurrences for the specific entity, normalizes pair direction (smaller ID = fromEntityId), creates/updates co_occurrence relationships, then triggers AI labeling for pairs with 2+ shared docs.
- **Aggregated export:** `RelationshipDetector` object with `findCoOccurrences`, `detectWorkspaceRelationships`, `updateRelationshipsForEntity`, plus test-exposed `gatherEvidence`, `calculateBaseStrength`, `parseAiRelationshipResponse`.

**What Was NOT Changed:**
- No existing files modified
- No routes, server.ts, or types changed
- No new dependencies added

**Reused From Existing Code:**
- `composeText()` from `ai/modelRouter.ts` — AI text generation
- `withTimeout()` from `ai/extractors/index.ts` — promise timeout wrapper
- `EntityRelationshipsStore` from `store/entityRelationships.ts` — relationship CRUD (create, getByPair, update)
- `EntityMentionsStore` from `store/entityMentions.ts` — mention queries (getByDoc)
- `WorkspaceEntitiesStore` from `store/workspaceEntities.ts` — entity lookup (getById)
- `db` from `db.ts` — raw SQL for co-occurrence self-join queries
- AI response parsing pattern from `knowledge/entityNormalizer.ts` — regex-based line parsing

**Decisions:**
- Two-stage pipeline matches entityNormalizer.ts and clauseMatcher.ts patterns (deterministic pre-filter + AI scoring)
- Co-occurrence SQL uses `entity_id < entity_id` to ensure each pair found once (avoids duplicate A→B / B→A)
- AI labeling only for pairs with 2+ shared docs (reduces AI costs, pairs with 1 doc are likely coincidental)
- Blended strength: 40% co-occurrence frequency + 60% AI confidence — weights AI judgment higher
- Base strength scales linearly to 1.0 at 10 shared docs (reasonable cap for most workspaces)
- Incremental update normalizes pair direction to match full-workspace direction for consistent dedup
- Evidence limited to 5 docs per relationship (keeps data size reasonable)
- AI fallback: on timeout/failure, co_occurrence relationships already exist — no data loss
- `label: undefined` instead of `null` for optional string fields per TypeScript strict types

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from relationshipDetector.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 6 (Semantic Search Engine)

---

### Slice 6: Semantic Search Engine — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/knowledge/semanticSearch.ts` — Semantic search engine with 4-step AI-augmented pipeline

**What Was Implemented:**
- **Types:** `SemanticSearchOptions` (limit, queriedBy, timeoutMs), `SearchResultSnippet` (text, fieldPath, highlightRanges), `SearchResult` (docId, docTitle, relevance, snippets, matchedEntities), `SemanticSearchResult` (queryId, query, answer, results, resultCount, proofId, durationMs), `CandidateDoc` (internal context object), `AISynthesisResult` (internal parsed AI response)
- **Constants:** `OVERALL_TIMEOUT_MS = 20_000`, `TERM_EXTRACTION_TIMEOUT_MS = 5_000`, `SYNTHESIS_TIMEOUT_MS = 12_000`, `MAX_CANDIDATES = 10`, `MAX_FTS_RESULTS = 20`, `DEFAULT_RELEVANCE = 0.5`
- **Step 1 — Term Extraction:** `extractSearchTerms()` — AI-assisted query parsing via `composeText()` with 5s timeout. System prompt instructs AI to output one search term per line (entity names + keywords, no common words). Fallback: raw whitespace-split tokens with punctuation stripped and length filter (>2 chars).
- **Step 2 — FTS5 Candidate Search:** `gatherFtsCandidates()` — searches both `docs_fts` (direct doc matches) and `entities_fts` (entity name matches → look up their doc mentions via `EntityMentionsStore.getByEntity`). Deduplicates by docId using Map. Returns up to `MAX_CANDIDATES` unique candidates with titles and snippets.
- **Step 3 — Context Gathering:** `buildCandidateContext()` — for each candidate doc, loads extraction via `ExtractionsStore.getByDocId()` and entity mentions via `EntityMentionsStore.getByDoc()`. `summarizeExtraction()` produces concise per-document-type summaries (contract: parties/dates/payment; invoice: vendor/customer/total; etc.) capped at 500 chars. `formatCandidatesForAI()` formats all candidates as numbered text blocks for the AI prompt.
- **Step 4 — AI Synthesis:** `synthesizeAnswer()` — sends query + formatted candidate context to `composeText()` with 12s timeout. System prompt instructs AI to produce `ANSWER:` line with citations `[Doc N]` and `RESULT N:` lines with relevance/entities/reason. `parseSynthesisResponse()` — regex parser for `RESULT N: RELEVANCE - ENTITIES - REASON` format, extracts answer from `ANSWER:` prefix, validates relevance to 0-1 range, sorts results by relevance descending.
- **Main entry:** `semanticSearch()` — orchestrates the full pipeline wrapped in 20s overall timeout. On timeout: executes quick FTS5-only fallback search. On AI synthesis failure: returns FTS5 candidates with default relevance and "AI summarization unavailable" message. Logs every query (success, failure, or timeout) to `knowledge_queries` table via `KnowledgeQueriesStore.create()` with duration_ms, result count, and full results JSON.
- **Graceful fallback at every stage:**
  - Term extraction fails → raw token split
  - Zero FTS5 results → immediate "No matching documents" return
  - AI synthesis fails → FTS5 results with default relevance
  - Overall timeout → quick FTS5 fallback + timeout message
- **Export:** `SemanticSearch` object with `search` + test-exposed `extractSearchTerms`, `gatherFtsCandidates`, `buildCandidateContext`, `synthesizeAnswer`, `parseSynthesisResponse`, `summarizeExtraction`, `formatCandidatesForAI`

**What Was NOT Changed:**
- No existing files modified
- No routes, server.ts, or types changed (those are Slice 8-9)
- No new dependencies added

**Reused From Existing Code:**
- `composeText()` from `ai/modelRouter.ts` — AI text generation (2 calls: term extraction + synthesis)
- `withTimeout()` from `ai/extractors/index.ts` — promise timeout wrapper (3 uses: term extraction, synthesis, overall pipeline)
- `FtsSync.searchDocs()` / `FtsSync.searchEntities()` from `knowledge/ftsSync.ts` — FTS5 full-text search
- `ExtractionsStore.getByDocId()` from `store/extractions.ts` — extraction data for context
- `EntityMentionsStore.getByDoc()` / `getByEntity()` from `store/entityMentions.ts` — entity mention lookup
- `WorkspaceEntitiesStore.getById()` from `store/workspaceEntities.ts` — entity name lookup
- `KnowledgeQueriesStore.create()` from `store/knowledgeQueries.ts` — query logging for provenance

**Decisions:**
- Two AI calls: one for term extraction (lightweight, 5s), one for synthesis (heavier, 12s). Budget fits within 20s overall.
- Term extraction prompt is minimal (one term per line) to keep response fast and parseable
- Synthesis prompt uses structured `ANSWER:` / `RESULT N:` format matching existing AI response parsing patterns (entityNormalizer, relationshipDetector)
- Candidate docs include extraction summaries, FTS snippets, and entity lists — gives AI rich context for ranking
- Unmentioned candidates added at relevance 0.1 to ensure FTS5 matches aren't lost if AI doesn't rank them
- summarizeExtraction is per-document-type (contract, invoice, proposal, meeting_notes, report) for focused context
- Query logging happens on all code paths (success, synthesis failure, overall timeout) — no provenance gaps
- Response structure matches API contract from work scope (queryId, answer, results with snippets and matchedEntities)

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from semanticSearch.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 7 (Related Documents Engine)

---

### Slice 7: Related Documents Engine — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/knowledge/relatedDocs.ts` — Related documents engine with 4-step pipeline

**What Was Implemented:**
- **Types:** `SharedEntity` (name + entityType), `RelatedDoc` (docId, title, relevance, sharedEntities, sharedEntityCount), `RelatedDocsResult` (relatedDocs array, entityCount, totalRelated), `RelatedDocsOptions` (limit, aiRerank, timeoutMs), `RelatedDocCandidate` (internal intermediate with weightedScore)
- **Constants:** `DEFAULT_LIMIT = 10`, `MAX_CANDIDATES_FOR_AI = 10`, `AI_RERANK_TIMEOUT_MS = 5_000`, `AI_RERANK_MAX_TOKENS = 400`, `MIN_CANDIDATES_FOR_AI = 3`, `MAX_MENTIONS_PER_ENTITY = 50`
- **Step 1 — Entity Collection:** `buildRelatedDocsMap()` — gets all entity mentions for source doc via `EntityMentionsStore.getByDoc()`, collects unique entity IDs, looks up each via `WorkspaceEntitiesStore.getById()`. Returns early with empty result if no entities found (graceful empty state).
- **Step 2 — Cross-Doc Lookup:** For each entity in source doc, queries `EntityMentionsStore.getByEntity()` to find all documents mentioning it. Builds `Map<docId, RelatedDocCandidate>` aggregating shared entities per related doc. Excludes source doc. Deduplicates entities per candidate (same entity name+type recorded only once). Uses `EntityMentionWithDoc.docTitle` for title lookup, falls back to `getDoc()`.
- **Step 3 — Relevance Scoring:** `entityWeight()` — inverse log importance: `1 / log2(docCount + 1)`. Entities appearing in fewer documents contribute more weight (more discriminating). `calculateRelevance()` — normalizes weighted score to 0-1: `weightedScore / maxPossibleScore`. Results sorted by relevance descending.
- **Step 4 — AI Re-ranking:** `aiRerank()` — sends source doc summary + top candidates (max 10) with shared entities and extraction summaries to `composeText()` with 5s timeout. `formatForAiRerank()` — builds prompt with source doc info and numbered candidate list including extraction summaries via `SemanticSearch.summarizeExtraction()`. `parseAiRerankResponse()` — regex parser for `RANK N: RELEVANCE - REASON` format. On failure: graceful fallback to deterministic ranking (no data loss). Only triggers when 3+ candidates exist.
- **Main entry:** `findRelated()` — orchestrates the full 4-step pipeline. AI re-ranking is optional (default: enabled). Handles no-entities gracefully. Top-level try/catch returns empty result on unexpected errors.
- **Export:** `RelatedDocs` object with `findRelated` + test-exposed `calculateRelevance`, `buildRelatedDocsMap`, `aiRerank`, `parseAiRerankResponse`, `entityWeight`

**What Was NOT Changed:**
- No existing files modified
- No routes, server.ts, or types changed (those are Slice 8+)
- No new dependencies added

**Reused From Existing Code:**
- `composeText()` from `ai/modelRouter.ts` — AI text generation (1 call: re-ranking)
- `withTimeout()` from `ai/extractors/index.ts` — promise timeout wrapper (1 use: AI re-ranking)
- `EntityMentionsStore.getByDoc()` / `getByEntity()` from `store/entityMentions.ts` — entity mention lookup
- `WorkspaceEntitiesStore.getById()` from `store/workspaceEntities.ts` — entity details (name, type, docCount)
- `ExtractionsStore.getByDocId()` from `store/extractions.ts` — extraction data for AI context
- `getDoc()` from `store/docs.ts` — doc title lookup (fallback)
- `SemanticSearch.summarizeExtraction()` from `knowledge/semanticSearch.ts` — extraction summarizer reuse

**Decisions:**
- Entity importance uses inverse log2: `1 / log2(docCount + 1)` — entities appearing in many docs contribute less to relevance (more discriminating entities score higher)
- AI re-ranking only triggers with 3+ candidates (too few to meaningfully rerank otherwise)
- AI unranked candidates get 0.8x multiplier (slight penalty, not dropped entirely)
- MAX_MENTIONS_PER_ENTITY = 50 cap prevents expensive queries for very common entities
- buildRelatedDocsMap is synchronous (all store calls are synchronous SQLite); only AI re-ranking is async
- Response matches API contract format from work scope: `{ relatedDocs[], entityCount, totalRelated }`
- totalRelated reports count before limit applied (user knows there are more)

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from relatedDocs.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 8 (Knowledge Graph API Routes — Entities & Relationships)

---

### Slice 8: Knowledge Graph API Routes — Entities & Relationships — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/routes/knowledge.ts` — Fastify plugin with 8 API endpoints for entity/relationship CRUD and doc-level queries

**Files Modified:**
- `KACHERI BACKEND/src/server.ts` — Import + register knowledgeRoutes; added route paths to index listing
- `KACHERI BACKEND/src/types/proofs.ts` — Added `knowledge:search` and `knowledge:index` to ProofKind union type
- `Docs/API_CONTRACT.md` — Added ToC entry + full "Cross-Document Intelligence (Knowledge Graph) Endpoints (Slice 8)" section with all 8 endpoints documented

**What Was Implemented:**
- **GET /workspaces/:wid/knowledge/entities** — List entities with pagination, type filter, name/alias search, sort (doc_count, name, created_at, mention_count), order (asc/desc). Workspace member read access.
- **GET /workspaces/:wid/knowledge/entities/:eid** — Entity detail with hydrated mentions (doc titles via JOIN) and relationships (related entity name/type via lookup). Workspace member read access.
- **PATCH /workspaces/:wid/knowledge/entities/:eid** — Update entity name/aliases/metadata. Auto-updates normalizedName when name changes. Syncs FTS5 index. Admin only.
- **DELETE /workspaces/:wid/knowledge/entities/:eid** — Delete entity (CASCADE handles mentions/relationships). Removes from FTS5 index. Admin only.
- **POST /workspaces/:wid/knowledge/entities/merge** — Merge duplicate entities. Validates all IDs exist in workspace, prevents self-merge, collects union of all names/aliases, calls transactional WorkspaceEntitiesStore.merge(), syncs FTS5 for target, removes sources from FTS5. Returns merged entity + deleted IDs. Admin only.
- **GET /workspaces/:wid/knowledge/relationships** — List relationships with filters (entityId, type, minStrength). Hydrates fromEntity/toEntity with name/type. Workspace member read access.
- **GET /docs/:id/entities** — List entities mentioned in a document. Deduplicates by entity ID (keeps first mention per entity). Doc-level viewer access via checkDocAccess().
- **GET /docs/:id/related** — Related documents via shared entities. Calls RelatedDocs.findRelated() (async, optional AI re-ranking). Doc-level viewer access.
- **ProofKind additions:** `knowledge:search` and `knowledge:index` added for use by Slice 9 (search/index routes) and Slice 18 (proof integration).

**What Was NOT Changed:**
- No existing route files modified (only server.ts registration)
- No store files modified
- No knowledge engine files modified
- No new dependencies added

**Reused From Existing Code:**
- `WorkspaceEntitiesStore` from `store/workspaceEntities.ts` — all entity CRUD operations
- `EntityMentionsStore` from `store/entityMentions.ts` — mention queries (getByEntity, getByDoc, countByEntity)
- `EntityRelationshipsStore` from `store/entityRelationships.ts` — relationship queries (getByEntity, getByWorkspace, count)
- `RelatedDocs.findRelated()` from `knowledge/relatedDocs.ts` — related documents engine
- `FtsSync.syncEntity()` / `FtsSync.removeEntity()` from `knowledge/ftsSync.ts` — FTS5 index maintenance
- `getDoc()` from `store/docs.ts` — document existence check
- `hasWorkspaceAdminAccess()` / `checkDocAccess()` from `workspace/middleware.ts` — RBAC guards
- `db` from `db.ts` — passed to checkDocAccess

**Decisions:**
- Route file follows FastifyPluginAsync pattern matching compliance.ts, clauses.ts
- Workspace membership check uses `req.workspaceRole` (populated by workspace middleware) rather than a separate guard function — matches existing patterns for read-only workspace endpoints
- Admin-only write operations use `hasWorkspaceAdminAccess(req)` — matches existing compliance/clause patterns
- Entity detail endpoint hydrates relationship "other entity" inline (avoids N+1 but acceptable at entity scale)
- Merge endpoint collects all names into aliases union before calling store merge — ensures no name data lost
- FTS5 sync errors are caught and silently ignored (non-fatal) — entity data integrity takes priority
- Doc-level endpoints use `checkDocAccess(db, req, reply, docId, 'viewer')` — matches all other per-doc routes
- Related docs endpoint extracts workspaceId from headers or doc record — handles both workspace-scoped and standalone docs
- API contract section placed after "Create Clause from Selection" and before "Export & Import" in body, with ToC entry before "Health & Debug"

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from knowledge.ts, server.ts, or proofs.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 9 (Knowledge Graph API Routes — Search, Indexing & Summary)

---

### Slice 9: Knowledge Graph API Routes — Search, Indexing & Summary — COMPLETE

**Files Modified:**
- `KACHERI BACKEND/src/routes/knowledge.ts` — Added 5 new endpoints + 10 new imports + sha256 helper
- `KACHERI BACKEND/src/server.ts` — Added 5 new route paths to index listing
- `Docs/API_CONTRACT.md` — Added full "Cross-Document Intelligence — Search, Indexing & Summary (Slice 9)" section with all 5 endpoints documented + ToC entry

**What Was Implemented:**
- **POST /workspaces/:wid/knowledge/search** — AI-powered semantic search. Workspace member access. Rate limited via `AI_RATE_LIMITS.compose` (matches compliance check pattern). Validates query (required, non-empty) and limit (1-20, default 10). Calls `SemanticSearch.search()` (full 4-step pipeline: term extraction → FTS5 candidates → context gathering → AI synthesis). Creates proof record via `recordProof()` with kind `knowledge:search`, including SHA256 hash of query+results, workspaceId, queryId, and userId in meta. Returns `{ queryId, query, answer, results[], resultCount, proofId, durationMs }`.
- **GET /workspaces/:wid/knowledge/search?q=term** — Fast FTS5 keyword search (no AI, no rate limiting). Validates `q` parameter (required). Calls `FtsSync.searchEntities()` and `FtsSync.searchDocs()` in parallel. Logs query to `knowledge_queries` table via `KnowledgeQueriesStore.create()` with queryType `entity_search`. Returns `{ entities[], documents[] }` matching work scope format.
- **POST /workspaces/:wid/knowledge/index** — Trigger full workspace re-index. Admin only via `hasWorkspaceAdminAccess()`. Validates mode (full/incremental, default full). Counts estimated docs via `listDocs()`. Returns `202 Accepted` with `{ jobId, status: "queued", estimatedDocs }`. Fire-and-forget async pipeline: `EntityHarvester.harvestWorkspace()` → `EntityNormalizer.normalizeWorkspaceEntities()` → `RelationshipDetector.detectWorkspaceRelationships()` → `FtsSync.syncWorkspaceEntities()`. Records `knowledge:index` proof on completion.
- **GET /workspaces/:wid/knowledge/status** — Index status. Workspace member access. Queries counts directly: `WorkspaceEntitiesStore.count()` for entities, raw SQL for mention count and indexed doc count (no dedicated store functions), `EntityRelationshipsStore.count()` for relationships, `listDocs()` for total docs, raw SQL for last indexed timestamp from `workspace_entities.last_seen_at`. Returns `{ entityCount, mentionCount, relationshipCount, indexedDocCount, totalDocCount, lastIndexedAt, indexingInProgress }`.
- **GET /workspaces/:wid/knowledge/summary** — Dashboard summary. Workspace member access. Aggregates: stats (entity/relationship/doc/query counts), top 10 entities by `doc_count`, entity type breakdown via raw SQL `GROUP BY entity_type`, recent 5 queries via `KnowledgeQueriesStore.getRecent()`. Response format matches work scope exactly.

**What Was NOT Changed:**
- No existing route handlers modified (only new endpoints added)
- No store files modified
- No knowledge engine files modified
- No new dependencies added
- `jobs/types.ts` not modified (knowledge:index job type deferred to Slice 11)
- `jobs/workers/index.ts` not modified (background worker deferred to Slice 11)

**New Imports Added:**
- `createHash` from `crypto` — SHA256 for proof hashes
- `nanoid` from `nanoid` — Job ID generation for index endpoint
- `SemanticSearch` from `knowledge/semanticSearch` — Semantic search pipeline
- `EntityHarvester` from `knowledge/entityHarvester` — Workspace entity harvesting
- `EntityNormalizer` from `knowledge/entityNormalizer` — AI entity normalization
- `RelationshipDetector` from `knowledge/relationshipDetector` — Relationship detection
- `KnowledgeQueriesStore` from `store/knowledgeQueries` — Query logging and retrieval
- `listDocs` from `store/docs` — Doc counting for status/summary
- `recordProof` from `provenanceStore` — Proof record creation
- `AI_RATE_LIMITS` from `middleware/rateLimit` — Rate limiting config

**Reused From Existing Code:**
- `SemanticSearch.search()` — complete 4-step pipeline from Slice 6
- `FtsSync.searchDocs()` / `FtsSync.searchEntities()` / `FtsSync.syncWorkspaceEntities()` — FTS5 operations from Slice 2
- `EntityHarvester.harvestWorkspace()` — entity harvesting from Slice 3
- `EntityNormalizer.normalizeWorkspaceEntities()` — normalization from Slice 4
- `RelationshipDetector.detectWorkspaceRelationships()` — relationship detection from Slice 5
- `KnowledgeQueriesStore` — query logging from Slice 1
- `recordProof()` — proof recording matching clauseInsert.ts and compliance.ts patterns
- `AI_RATE_LIMITS.compose` — rate limiting config matching compliance.ts pattern
- `hasWorkspaceAdminAccess()` / workspace membership check — RBAC patterns from Slice 8
- `clampLimit()` / `clampOffset()` / `getUserId()` / `getWorkspaceId()` — helper functions from Slice 8

**Decisions:**
- Rate limiting on semantic search uses `AI_RATE_LIMITS.compose` (10/hr) — same as compliance checks, matching the pattern for expensive AI endpoints
- Keyword search (GET) has no rate limiting — FTS5 is fast, no AI calls
- GET vs POST on same `/knowledge/search` path: Fastify routes by method correctly; GET for keyword, POST for semantic
- Index endpoint returns 202 immediately with fire-and-forget async processing — real background job queue is Slice 11
- Job ID uses `kidx_` prefix + nanoid(12) for easy identification in logs
- Mention count and indexed doc count use raw SQL since dedicated store functions don't exist (acceptable in route file, matches existing `db.prepare()` usage)
- Indexed doc count computed via JOIN on `extractions` + `docs` tables, filtering by workspace and non-deleted status
- Last indexed timestamp derived from `MAX(last_seen_at)` on workspace_entities — reflects when entities were last updated
- `indexingInProgress` hardcoded to `false` — real progress tracking added in Slice 11 with WebSocket broadcasts
- Proof recording uses `doc_id: ""` for workspace-level operations (knowledge:search and knowledge:index are not doc-specific)
- Keyword search entity results don't include entityType/docCount — FTS5 virtual table doesn't store these; client can look up via entity detail endpoint if needed

**API Contract:**
- Added full Slice 9 section with all 5 endpoints documented
- Request/response schemas match work scope exactly
- ToC entry added before "Health & Debug"
- Follows identical formatting to Slice 8 section

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from knowledge.ts or server.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 10 (Auto-Index Integration Hook)

---

### Slice 10: Auto-Index Integration Hook — COMPLETE

**Files Modified:**
- `KACHERI BACKEND/src/routes/extraction.ts` — Added auto-index hook after POST /docs/:id/extract
- `KACHERI BACKEND/src/routes/importDoc.ts` — Added auto-index hook after auto-extraction on import

**What Was Implemented:**
- **extraction.ts hook:** After `ExtractionsStore.create()` and WS broadcasts, calls `EntityHarvester.harvestFromExtraction(extraction, workspaceId)` to harvest entities from the new extraction, then `FtsSync.syncDoc(docId, workspaceId, doc.title, text)` to index document content in FTS5. Wrapped in try/catch — failure does not affect extraction response. Only runs when `workspaceId` header is present.
- **importDoc.ts hook:** After the auto-extraction try/catch block (step 4.5), calls `FtsSync.syncDoc()` to index document content (regardless of extraction success), then if extraction succeeded, calls `EntityHarvester.harvestFromExtraction()` to harvest entities. Extracts workspace ID from `x-workspace-id` header. Error logging follows existing `(app.log as any)?.warn?.()` pattern. Only runs when workspace ID is present.
- **FTS5 entity sync handled internally:** `processRawEntities()` in entityHarvester already calls `FtsSync.syncEntity()` for each newly created entity — no additional entity FTS sync needed in the hooks.

**What Was NOT Changed:**
- No store files modified
- No knowledge engine files modified
- No new dependencies added
- No API contract changes (no new endpoints)
- No types/proofs changes

**New Imports Added:**
- `EntityHarvester` from `knowledge/entityHarvester` — in both extraction.ts and importDoc.ts
- `FtsSync` from `knowledge/ftsSync` — in both extraction.ts and importDoc.ts

**Decisions:**
- Synchronous wrapping (not fire-and-forget async) — `harvestFromExtraction()` is synchronous SQLite; simple try/catch is sufficient
- FTS doc sync in importDoc runs regardless of extraction success — document content should be searchable even without entities
- Entity harvesting in importDoc requires successful extraction — guarded by `extractionSummary?.extractionId`
- Uses `ExtractionsStore.getByDocId()` in importDoc to retrieve the full stored extraction (the original variable is scoped inside an inner try block)
- Skip all indexing when no workspace ID — knowledge graph is workspace-scoped
- Error logging follows existing patterns per file (console.warn in extraction.ts, app.log?.warn in importDoc.ts)

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from extraction.ts or importDoc.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts)

**Next:** Slice 11 (Background Indexing Worker)

---

### Slice 11: Background Indexing Worker — COMPLETE

**Files Created:**
- `KACHERI BACKEND/src/jobs/workers/knowledgeIndexWorker.ts` — Background worker for `knowledge:index` jobs with full/incremental mode and WebSocket progress broadcasting

**Files Modified:**
- `KACHERI BACKEND/src/jobs/types.ts` — Added `knowledge:index` to `JobType` union, `KnowledgeIndexPayload` and `KnowledgeIndexResult` interfaces
- `KACHERI BACKEND/src/jobs/workers/index.ts` — Imported and registered `registerKnowledgeWorkers`, exported `knowledgeIndexJob`, updated console.log
- `KACHERI BACKEND/src/realtime/types.ts` — Added `knowledge_index` to `ai_job.kind` union in `WorkspaceServerEvent`
- `KACHERI BACKEND/src/routes/knowledge.ts` — Replaced fire-and-forget async with `getJobQueue().add('knowledge:index', ...)`, added real `indexingInProgress` check via jobs table query, imported `getJobQueue` and `KnowledgeIndexPayload`, removed unused imports (`nanoid`, `EntityHarvester`, `EntityNormalizer`, `RelationshipDetector`)

**What Was Implemented:**
- **Worker handler (`knowledgeIndexJob`):** 5-stage pipeline — harvest entities → normalize (AI-assisted) → detect relationships → rebuild FTS5 → record proof. Each stage wrapped in try/catch (non-fatal failures). Stage errors collected in result.
- **Full mode:** Calls `EntityHarvester.harvestWorkspace()` to process all docs in workspace.
- **Incremental mode:** Queries `MAX(last_seen_at)` from `workspace_entities` as last indexed timestamp, then queries docs with extractions `updated_at > lastTs` via SQL JOIN. Only harvests modified docs using `EntityHarvester.harvestFromDoc()` per doc. Still runs normalization and relationship detection (they handle incremental gracefully).
- **WebSocket progress broadcasting:** Uses existing `wsBroadcast()` from `realtime/globalHub.ts` with `ai_job` event type, `kind: 'knowledge_index'`. Broadcasts at each stage transition with `meta` containing stage name, progress percentage (0-100), and running counts. Progress is broadcast every 5 docs during incremental harvesting.
- **Proof recording:** On completion, records `knowledge:index` proof via `recordProof()` with full result metadata.
- **Route integration:** `POST /knowledge/index` now enqueues via `getJobQueue().add()` (SQLite job queue with retry, status tracking, claim-based processing). `GET /knowledge/status` reports real `indexingInProgress` by querying `jobs` table for pending/processing `knowledge:index` jobs matching the workspace.
- **Worker registration:** Follows `reminderWorker.ts` pattern — `registerKnowledgeWorkers()` function registered in `workers/index.ts`.

**What Was NOT Changed:**
- No knowledge engine files modified (entityHarvester, entityNormalizer, relationshipDetector, ftsSync — all consumed as-is)
- No store files modified
- No database schema changes
- No new dependencies added
- No API contract changes (endpoints unchanged, only internal implementation improved)

**Reused From Existing Code:**
- `EntityHarvester.harvestWorkspace()` / `harvestFromDoc()` from `knowledge/entityHarvester.ts`
- `EntityNormalizer.normalizeWorkspaceEntities()` from `knowledge/entityNormalizer.ts`
- `RelationshipDetector.detectWorkspaceRelationships()` from `knowledge/relationshipDetector.ts`
- `FtsSync.syncWorkspaceEntities()` from `knowledge/ftsSync.ts`
- `wsBroadcast()` from `realtime/globalHub.ts` — WebSocket broadcasting
- `recordProof()` from `provenanceStore.ts` — proof recording
- `getJobQueue()` from `jobs/queue.ts` — SQLite job queue singleton
- `listDocs()` from `store/docs.ts` — doc listing
- `db` from `db.ts` — incremental mode SQL queries
- Worker pattern from `reminderWorker.ts` — handler + registerHandler export

**Decisions:**
- `maxAttempts: 1` for knowledge:index jobs — indexing is idempotent but potentially long-running; retry could cause duplicate work. Failed jobs should be manually re-triggered.
- Incremental mode determines "modified docs" via `extractions.updated_at > MAX(workspace_entities.last_seen_at)` — entities track their own recency, extractions track when data changed.
- Full mode delegates to `harvestWorkspace()` (single call); incremental mode iterates per-doc for granular progress reporting.
- Stage failures are non-fatal — if normalization fails, relationships still attempt; if FTS rebuild fails, entities/relationships are still correct. Errors collected and returned.
- Progress percentages: harvesting 0-25%, normalizing 25-50%, relationships 50-80%, FTS rebuild 80-95%, completion 100%.
- `indexingInProgress` uses `payload LIKE ?` query on jobs table — acceptable for workspace-scoped check; no full JSON parsing needed.
- Removed unused imports from knowledge.ts after replacing fire-and-forget with queue: `nanoid`, `EntityHarvester`, `EntityNormalizer`, `RelationshipDetector`.
- Broadcast `phase: 'failed'` only when errors array is non-empty — individual stage errors don't prevent completion.

**Syntax Check:**
- `npx tsc --noEmit` — zero new errors from knowledgeIndexWorker.ts, types.ts, workers/index.ts, realtime/types.ts, or knowledge.ts (all pre-existing errors in unrelated files: docLinks.ts, messages.ts, notifications.ts, detectFields.ts, store/docLinks.ts)

**Next:** Slice 12 (Frontend API Layer)

---

### Slice 12: Frontend API Layer — COMPLETE

**Files Created:**
- `KACHERI FRONTEND/src/types/knowledge.ts` — TypeScript types for all knowledge graph schemas
- `KACHERI FRONTEND/src/api/knowledge.ts` — API client with `knowledgeApi` and `knowledgeAdminApi` exports

**What Was Implemented:**
- **Types (types/knowledge.ts):**
  - Base types: `EntityType` (8 values), `RelationshipType` (6 values), `MentionSource`, `QueryType`, `IndexMode`
  - Domain types: `Entity` (list summary), `EntityDetail` (full with normalizedName + metadata), `EntityMention`, `EntityRelationship` (per-entity detail view), `RelationshipListItem` (workspace list view with both entities), `DocEntity`, `SharedEntity`, `RelatedDoc`, `SearchResultSnippet`, `SearchResult`, `KnowledgeQuerySummary`, `TopEntity`, `KeywordSearchEntity`, `KeywordSearchDocument`
  - Request types: `ListEntitiesOptions` (type, search, sort, order, limit, offset), `UpdateEntityParams`, `MergeEntitiesParams`, `ListRelationshipsOptions` (entityId, type, minStrength, limit, offset), `SemanticSearchParams`, `TriggerIndexParams`
  - Response types: `ListEntitiesResponse`, `GetEntityDetailResponse`, `UpdateEntityResponse`, `MergeEntitiesResponse`, `ListRelationshipsResponse`, `DocEntitiesResponse`, `RelatedDocsResponse`, `SemanticSearchResponse`, `KeywordSearchResponse`, `TriggerIndexResponse`, `IndexStatusResponse`, `KnowledgeSummaryResponse`
- **API Client (api/knowledge.ts):**
  - `knowledgeApi` object (10 functions): `listEntities`, `getEntity`, `updateEntity`, `deleteEntity`, `mergeEntities`, `listRelationships`, `getDocEntities`, `getRelatedDocs`, `semanticSearch`, `keywordSearch`
  - `knowledgeAdminApi` object (3 functions): `triggerIndex`, `getStatus`, `getSummary`
  - Infra: same `request<T>()` pattern as extraction/compliance/clauses API clients (API_BASE, authHeader, devUserHeader, timeout, error handling, abort controller)
  - Query string building via URLSearchParams for all filtered/paginated endpoints

**What Was NOT Changed:**
- No existing files modified
- No backend files touched
- No new dependencies added
- No API contract changes (Slice 12 is frontend-only, consuming existing Slice 8+9 endpoints)

**Reused From Existing Code:**
- File structure: header comment → base types → domain types → request types → response types (matching `types/extraction.ts`, `types/compliance.ts`, `types/clause.ts`)
- API client infra: `API_BASE`, `authHeader()`, `devUserHeader()`, `REQUEST_TIMEOUT_MS`, `request<T>()` with abort controller + error parsing (matching `api/extraction.ts`, `api/compliance.ts`, `api/clauses.ts`)
- Two API objects: `knowledgeApi` + `knowledgeAdminApi` (matching `extractionApi` + `extractionStandardsApi` pattern)
- URLSearchParams query string building (matching `api/clauses.ts:119`, `api/compliance.ts:148`)

**Decisions:**
- `Entity` vs `EntityDetail`: list endpoint returns summary (no normalizedName/metadata), detail endpoint returns full — two separate types to match backend response shapes exactly
- `EntityRelationship` (detail view, shows "relatedEntity") vs `RelationshipListItem` (list view, shows "fromEntity"/"toEntity") — two types needed because the API returns different shapes in different contexts
- `KeywordSearchEntity.entityType` and `docCount` typed as `string | null` and `number | null` — FTS5 virtual table doesn't store these columns, so backend returns null (documented in API contract)
- `UpdateEntityResponse` is an alias for `EntityDetail` — PATCH returns the updated entity object directly
- Request timeout 45s — longer than backend's 20s semantic search timeout, matching existing frontend API clients
- `deleteEntity` returns `Promise<void>` — backend returns 204 No Content, handled by `if (res.status === 204) return undefined as T`

**API Coverage:**
- Slice 8 endpoints (8/8): listEntities, getEntity, updateEntity, deleteEntity, mergeEntities, listRelationships, getDocEntities, getRelatedDocs
- Slice 9 endpoints (5/5): semanticSearch, keywordSearch, triggerIndex, getStatus, getSummary
- Total: 13/13 endpoints covered

**Syntax Check:**
- `npx tsc --noEmit` — zero errors (clean pass, no pre-existing errors in frontend codebase)

**Next:** Slice 13 (Related Documents Panel UI)

---

### Slice 13: Related Documents Panel UI — COMPLETE

**Files Created:**
- `KACHERI FRONTEND/src/components/knowledge/knowledge.css` — Full CSS styles for related docs panel, entity chips, card components, and status states
- `KACHERI FRONTEND/src/components/knowledge/EntityChip.tsx` — Colored badge component for entity type + name (8 entity types, 8 colors)
- `KACHERI FRONTEND/src/components/knowledge/RelatedDocCard.tsx` — Card component for a single related document with title, relevance badge, shared entity chips
- `KACHERI FRONTEND/src/components/knowledge/RelatedDocsPanel.tsx` — Main sidebar panel following ExtractionPanel.tsx pattern
- `KACHERI FRONTEND/src/components/knowledge/index.ts` — Barrel exports for all knowledge UI components

**Files Modified:**
- `KACHERI FRONTEND/src/EditorPage.tsx` — Added `"related"` to drawer tab type union, added "Related" tab button (9th tab), added RelatedDocsPanel render in drawer content, added import

**What Was Implemented:**
- **EntityChip:** Compact colored badge with dot + name per entity type. Color scheme: person=blue, organization=purple, amount=green, date=amber, location=red, product=teal, term=gray, concept=indigo. Title attribute shows full name + type on hover.
- **RelatedDocCard:** Card rendered as `<a>` linking to `/doc/:docId` (opens in new tab). Header row: doc title (ellipsis on overflow) + relevance percentage badge (green >70%, amber 40-70%, gray <40%). Body: up to 4 EntityChip components with "+N" overflow indicator. Footer: shared entity count.
- **RelatedDocsPanel:** Main panel following ExtractionPanel pattern exactly. Props: `docId`, `open`, `onClose`, `refreshKey`, `embedded`. Fetches via `knowledgeApi.getRelatedDocs(docId, 10)` on mount/refresh. States: loading (3 skeleton card shimmers), error (categorized messages + retry button), empty/no-entities ("extract document first"), empty/no-related ("no related documents found"), data (summary bar + RelatedDocCard list + refresh button). Embedded mode overrides positioning for drawer tab integration.
- **EditorPage integration:** "Related" is now the 9th drawer tab. Tab button renders after "Clauses". Panel renders embedded with `docId` and `onClose` props.
- **CSS:** Full stylesheet following extraction.css patterns — panel positioning (fixed + embedded override), skeleton shimmer animation, error/empty states, card with hover border highlight, entity chip colors per type, relevance badge levels, responsive mobile layout, footer with ghost button.

**What Was NOT Changed:**
- No backend files modified
- No API contract changes (consumes existing GET /docs/:id/related from Slice 8)
- No new dependencies added
- No types files modified (all types from Slice 12 used as-is)
- No route changes (panel is drawer-embedded, not a separate page)

**Reused From Existing Code:**
- `knowledgeApi.getRelatedDocs()` from `api/knowledge.ts` (Slice 12)
- `RelatedDoc`, `SharedEntity`, `EntityType`, `RelatedDocsResponse` from `types/knowledge.ts` (Slice 12)
- ExtractionPanel.tsx pattern: props interface, useState/useEffect/useCallback, loading/error/empty state handling, embedded mode CSS
- extraction.css pattern: panel positioning, skeleton shimmer, error/retry, empty icon+text, summary card, footer buttons, responsive breakpoint

**Decisions:**
- Panel is drawer-tab-only (no standalone fixed mode needed — RelatedDocsPanel is always embedded in the editor drawer)
- Standalone positioning CSS kept for potential future reuse (e.g., floating panel from toolbar button in Slice 17)
- RelatedDocCard uses `<a>` element (not `<div>` with onClick) for correct link semantics (right-click, ctrl+click, accessibility)
- Max 4 visible entity chips per card with "+N" overflow to prevent card height explosion
- Relevance displayed as percentage (0-100%) — more intuitive than raw 0-1 float
- 3 skeleton cards in loading state (matches typical result count, avoids layout shift)
- Two distinct empty states: "no entities" (needs extraction) vs "no related docs" (entities exist but no cross-doc overlap) — guides user action
- Refresh button in footer (not auto-refresh) — related docs don't change frequently, manual refresh is sufficient
- Summary bar shows total related + entity count for context

**Acceptance Criteria Check:**
- [x] Panel displays related documents ranked by relevance
- [x] Shared entities shown as colored chips
- [x] Clicking a related doc navigates to it (new tab)
- [x] Loading/error/empty states handled
- [x] Looks consistent with other panels (extraction.css patterns)

**Syntax Check:**
- `npx tsc --noEmit` — zero errors (clean pass)

**Next:** Slice 14 (Workspace Knowledge Explorer Page)

---

### Slice 14: Workspace Knowledge Explorer Page — COMPLETE

**Files Created:**
- `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx` — Full workspace knowledge graph explorer page (450+ lines)

**Files Modified:**
- `KACHERI FRONTEND/src/App.tsx` — Added import + route `/workspaces/:id/knowledge`

**What Was Implemented:**
- **Header:** Eyebrow "KNOWLEDGE GRAPH", workspace name, subtitle, index status badge (green "Index Ready" / amber "Indexing..."), re-index button (admin only), back button
- **Stats bar:** 4 stat cards in CSS grid — Entity Count, Relationships, Indexed Docs (x/y), Coverage % (color-coded: green >=80%, amber >=50%, red <50%)
- **Entity type breakdown:** Clickable colored chips per entity type with counts (person=blue, org=purple, amount=green, date=amber, location=red, product=teal, term=gray, concept=indigo). Click chips to filter entity table. "Clear filter" button when active.
- **Top entities section:** Horizontal card row (up to 6) showing most-connected entities with type dot, name, doc count. Clickable (triggers entity detail placeholder).
- **Recent queries section:** List of up to 5 recent semantic queries with query text, result count, timestamp.
- **Filter bar:** Entity type dropdown + search input (300ms debounced) + sort dropdown (Doc Count, Name, Mentions, Created) + ascending/descending toggle + total count badge.
- **Entity table:** Rows with name (+ aliases "aka" if present), type badge (colored dot + label), doc count, mention count, last seen date. Rows are clickable with hover highlight. Table follows exact `tableShellStyle`/`tableStyle`/`thStyle`/`tdStyle` patterns from WorkspaceClausesPage.
- **Pagination:** Prev/Next buttons with "Page X of Y · Showing A-B of C" text. 20 items per page.
- **Empty states:** Two distinct empty states — "No entities match your filters" (with clear button) and "No entities in your knowledge graph yet" (with guidance text + index button for admin).
- **Error handling:** Error banner with retry button. Re-index error banner. Non-fatal summary/status errors (entity list still works independently).
- **Re-index button:** Admin-only. Confirmation dialog. Disabled while indexing or when `status.indexingInProgress`. Refreshes summary + entities after 1.5s delay.
- **Entity detail placeholder:** Modal overlay showing entity ID with "Close" button. Placeholder for Slice 16 EntityDetailModal integration.
- **Route:** `/workspaces/:id/knowledge` added after `/workspaces/:id/clauses` in App.tsx.

**What Was NOT Changed:**
- No backend files modified
- No API contract changes (page consumes existing Slice 8+9+12 endpoints)
- No new dependencies added
- No existing component files modified (only App.tsx route addition)
- No new CSS files (inline CSSProperties following workspace page convention)

**Reused From Existing Code:**
- `knowledgeApi.listEntities()` from `api/knowledge.ts` (Slice 12)
- `knowledgeAdminApi.getSummary()` / `getStatus()` / `triggerIndex()` from `api/knowledge.ts` (Slice 12)
- `Entity`, `EntityType`, `KnowledgeSummaryResponse`, `IndexStatusResponse`, `ListEntitiesOptions` from `types/knowledge.ts` (Slice 12)
- `useWorkspace()` from `workspace/WorkspaceContext` — workspace context (workspaceId, currentWorkspace, role)
- `useNavigate()` from `react-router-dom` — navigation
- Page structure pattern from WorkspaceClausesPage.tsx: pageStyle, shellStyle, headerStyle, eyebrowStyle, titleStyle, subtitleStyle, headerRightStyle, backButtonStyle, filterSelectStyle, errorBannerStyle, retryButtonStyle, emptyStyle, tableShellStyle, tableStyle, thStyle, tdStyle
- Entity type color map from EntityChip.tsx (Slice 13): 8 colors for 8 entity types
- `formatDate()` helper matching WorkspaceClausesPage pattern
- `isAdmin()` helper matching WorkspaceStandardsPage/WorkspaceCompliancePage pattern
- `ProtectedRoute` wrapper from `auth` (in App.tsx route)

**Decisions:**
- Page accessible to all workspace members (read access) — not restricted to admin unlike Standards/Compliance pages
- Stats bar uses CSS grid `repeat(4, 1fr)` for responsive equal-width cards
- Entity type chips are interactive buttons (click to filter) rather than static badges — reduces clicks to find specific entity types
- Search uses 300ms debounce via `useRef<setTimeout>` + `useEffect` cleanup — no external debounce dependency
- Sort/order state resets offset to 0 on change — prevents viewing empty pages
- Summary and status loaded in parallel via `Promise.all()` — single loading state for both
- Entity detail uses `selectedEntityId` state + placeholder modal — clean integration point for Slice 16
- Re-index auto-refreshes after 1.5s delay — gives background job time to start before status check
- Inline CSSProperties at bottom of file — consistent with all workspace pages (no separate CSS file)
- No `useCallback` on `fetchEntities` dependencies — eslint-disable-next-line matches existing page patterns

**Acceptance Criteria Check:**
- [x] Page displays workspace knowledge graph stats (stats bar with 4 cards)
- [x] Entity list with filters and search (type dropdown, search input, sort, pagination)
- [x] Entity type breakdown visible (colored clickable chips)
- [x] Admin-only re-index button (hidden for non-admin roles)
- [x] Route registered and navigable (`/workspaces/:id/knowledge`)
- [x] Top entities section (horizontal cards, top 6 by doc count)
- [x] Recent queries section (up to 5 with text, results, date)
- [x] Index status indicator (badge in header)
- [x] Click entity opens detail placeholder (Slice 16 integration ready)
- [x] Loading/error/empty states handled

**Syntax Check:**
- `npx tsc --noEmit` — zero errors (clean pass)

**Next:** Slice 15 (Semantic Search UI)

---

### Slice 15: Semantic Search UI — COMPLETE

**Files Created:**
- `KACHERI FRONTEND/src/components/knowledge/SemanticSearchBar.tsx` — Dual-mode search bar (Quick/Semantic) with input, mode toggle, loading/error states
- `KACHERI FRONTEND/src/components/knowledge/SearchResultCard.tsx` — Individual search result card with title, relevance badge, snippets with highlight rendering, matched entities
- `KACHERI FRONTEND/src/components/knowledge/SearchAnswerPanel.tsx` — AI-generated answer display with citations, proof badge, duration, and result cards list

**Files Modified:**
- `KACHERI FRONTEND/src/components/knowledge/knowledge.css` — Added 300+ lines of CSS for search components (search bar, mode pills, answer panel, result cards, keyword results, snippets, highlights)
- `KACHERI FRONTEND/src/components/knowledge/index.ts` — Added barrel exports for SemanticSearchBar, SearchResultCard, SearchAnswerPanel
- `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx` — Integrated search section, added state management, keyword result rendering, made recent queries clickable

**What Was Implemented:**
- **SemanticSearchBar:** Self-contained search component with dual mode toggle (Semantic = AI-powered via `knowledgeApi.semanticSearch()`, Quick = FTS5 via `knowledgeApi.keywordSearch()`). Text input with placeholder text per mode, "Ask"/"Search" submit button, Enter key submission, clear button, loading spinner animation, error display with retry. Props include `workspaceId`, result callbacks, loading state callback, `onClear`, `compact` (for future Slice 17 toolbar integration), and `initialQuery` (for re-running recent queries). Results dispatched to parent via `onSemanticResult` / `onKeywordResult` callbacks.
- **SearchAnswerPanel:** Displays AI-generated answer with `[Doc N]` citation badges rendered as styled inline spans. Shows proof badge (green "Proofed"), duration in seconds, and result count. Loading state reuses `related-docs-skeleton` shimmer animation with spinner + "Searching your documents with AI..." text. Below the answer block, renders `SearchResultCard` list with numbered index badges. Empty state guides user to try different terms.
- **SearchResultCard:** Card rendered as `<a>` linking to `/doc/:docId` (new tab). Header row: optional numeric index badge (indigo circle) + doc title (ellipsis on overflow) + relevance percentage badge (green/amber/gray per threshold). Snippets section: up to 3 snippets with `<mark>` highlight rendering (sanitized via `sanitizeSnippet()` — only `<mark>` tags allowed, all other HTML stripped for XSS prevention). Field path shown in italic below each snippet. Matched entities as `EntityChip` components (up to 5 with overflow indicator).
- **CSS:** Full stylesheet additions following existing `knowledge.css` patterns — search bar with focus ring, mode toggle pills with active state, input row with clear/submit buttons, spinner animation, error state, answer panel with indigo gradient border, citation badges, proof badge, result cards matching `related-doc-card` pattern, snippet highlights with amber `<mark>` styling, keyword search entity/document rows with hover states.
- **Page Integration:** Search section placed between header and stats bar. New state: `semanticResult`, `keywordResult`, `searchLoading`, `searchInitialQuery`. Semantic results show `SearchAnswerPanel` (answer + result cards). Keyword results show entity rows (clickable, open entity detail) and document rows (links to doc, with snippet highlights). Recent queries section now clickable — clicking a query populates `searchInitialQuery` which re-renders `SemanticSearchBar` with pre-filled text via `key` prop.

**What Was NOT Changed:**
- No backend files modified
- No API contract changes (consumes existing Slice 9 endpoints)
- No new dependencies added
- No route changes
- No types files modified (all types from Slice 12 used as-is)

**Reused From Existing Code:**
- `knowledgeApi.semanticSearch()` from `api/knowledge.ts` (Slice 12) — AI-powered search
- `knowledgeApi.keywordSearch()` from `api/knowledge.ts` (Slice 12) — Fast FTS5 search
- `EntityChip` from `components/knowledge/EntityChip.tsx` (Slice 13) — Entity type badges in result cards
- `SemanticSearchResponse`, `KeywordSearchResponse`, `SearchResult`, `KeywordSearchEntity`, `KeywordSearchDocument` from `types/knowledge.ts` (Slice 12)
- `.related-docs-skeleton` shimmer animation from `knowledge.css` (Slice 13) — loading state
- `.related-doc-card` pattern from `knowledge.css` (Slice 13) — result card structure
- `.entity-chip-overflow` from `knowledge.css` (Slice 13) — overflow indicator
- `ENTITY_TYPE_COLORS` from `WorkspaceKnowledgeExplorerPage.tsx` (Slice 14) — entity type colors for keyword results

**Decisions:**
- Dual mode (Quick/Semantic) as toggle pills rather than separate inputs — simpler UX, single input field serves both modes
- SemanticSearchBar is self-contained with callbacks — allows reuse in both WorkspaceKnowledgeExplorerPage (Slice 14) and future editor toolbar (Slice 17) without state coupling
- `key={searchInitialQuery}` on SemanticSearchBar forces remount when clicking a recent query — ensures `initialQuery` prop is re-read (useState initial value only read on mount)
- Snippet HTML sanitized via regex: only `<mark>` tags allowed, all other HTML stripped — prevents XSS from backend FTS5 snippet() output
- Results capped at display: 3 snippets per card, 5 entity chips per card, 10 entities and 10 documents for keyword results — prevents UI overload
- Search section placed above stats bar — search is the primary action on the knowledge explorer page
- Answer citations rendered as `[N]` superscript badges matching academic citation style — links visually to numbered result cards below
- Keyword search results show entity type color dot inline (not EntityChip) — lighter weight for simple list display
- `compact` prop on SemanticSearchBar reserved for Slice 17 toolbar integration — no functional difference yet, just CSS class
- No search history component created — recent queries section in WorkspaceKnowledgeExplorerPage already serves this purpose (from summary endpoint)

**Acceptance Criteria Check:**
- [x] Can submit natural language queries (SemanticSearchBar with "Ask" button + Enter key)
- [x] AI answer displayed with citations (SearchAnswerPanel with `[Doc N]` badges)
- [x] Results show relevant documents with snippets (SearchResultCard with highlight rendering)
- [x] Quick search returns fast FTS5 results (keyword mode shows entity/doc matches)
- [x] Search history viewable (recent queries section, clickable to re-run)

**Syntax Check:**
- `npx tsc --noEmit` — zero errors (clean pass, exit code 0)

**Next:** Slice 16 (Entity Detail Modal)

---

### Slice 16: Entity Detail Modal — COMPLETE

**Date:** 2026-02-09

**Files Created:**
- `KACHERI FRONTEND/src/components/knowledge/EntityDetailModal.tsx` — Full modal for entity detail with header, stats, metadata, tabs (mentions/relationships), admin edit mode
- `KACHERI FRONTEND/src/components/knowledge/EntityMentionsList.tsx` — Paginated list of entity mentions with doc links, context snippets, confidence badges
- `KACHERI FRONTEND/src/components/knowledge/EntityRelationshipsList.tsx` — List of related entities with type badges, strength bars, evidence counts, click-to-navigate

**Files Modified:**
- `KACHERI FRONTEND/src/components/knowledge/knowledge.css` — Added 300+ lines of CSS for modal overlay, header, stats, metadata, tabs, mentions, relationships, strength bars, edit form
- `KACHERI FRONTEND/src/components/knowledge/index.ts` — Added barrel exports for EntityDetailModal, EntityMentionsList, EntityRelationshipsList
- `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx` — Replaced placeholder modal with EntityDetailModal, removed unused placeholder styles, added import

**What Was Implemented:**
- **EntityDetailModal:** Full-featured modal following OriginalSourceModal.tsx patterns (Escape key close, scroll lock, `role="dialog"` + `aria-modal`, overlay click-to-close, fixed z-index 1000). Fetches entity detail via `knowledgeApi.getEntity()`. Shows header (name + EntityChip type badge + aliases), stats row (mention count, doc count, first/last seen), type-specific metadata section (Person: title/org/email/phone; Organization: type/address/industry; Amount: value/currency/frequency; Date: isoDate/context/recurring; Location: city/state/country; Product/Term/Concept: category/description), tab switcher (Mentions/Relationships with counts), scrollable tab content area. Admin edit mode: name input, aliases (comma-separated), metadata (JSON textarea), save/cancel with error handling. Related entity navigation: clicking a relationship entity re-fetches the modal for that entity (stays open, navigates in-place). Loading state reuses `related-docs-skeleton` shimmer pattern. Error state with retry button. `onEntityChange` callback refreshes parent entity list and summary.
- **EntityMentionsList:** Paginated (10 per page, local pagination). Each mention: doc title as `<a>` link to `/doc/:docId` (new tab), context snippet (2-line clamp), field path (italic), confidence badge (green >=80%, amber >=50%, gray <50%). Pagination with Prev/Next buttons + "N–M of total" text. Empty state.
- **EntityRelationshipsList:** Each relationship row: EntityChip for related entity, relationship type badge, label (italic), strength bar (gradient `#6366f1` to `#a5b4fc`), strength percentage, evidence count. Clickable rows with keyboard accessibility (Enter/Space). Empty state.
- **CSS:** Full set of styles matching dark theme palette (`#0f172a` background, `#e5e7ff` text, indigo accents). Modal 700px max-width, 85vh max-height. Tab switcher matches `.semantic-search-mode-pill` pattern. Strength bar with gradient fill. Edit form with focus rings. All buttons match existing `reindexButtonStyle` / `backButtonStyle` patterns.
- **Page integration:** Placeholder modal block replaced with `<EntityDetailModal>` component. Passes `entityId`, `workspaceId`, `isAdmin`, `onClose`, `onEntityChange` props. Removed `placeholderModalStyle` and `placeholderModalContentStyle` unused CSS-in-JS objects.

**What Was NOT Changed:**
- No backend files modified
- No API contract changes (consumes existing GET /workspaces/:wid/knowledge/entities/:eid from Slice 8)
- No new dependencies added
- No route changes
- No other component files modified (only knowledge/ components + WorkspaceKnowledgeExplorerPage)

**Reused From Existing Code:**
- `knowledgeApi.getEntity()` / `knowledgeApi.updateEntity()` from `api/knowledge.ts` (Slice 12) — entity data fetch and admin update
- `EntityDetail`, `EntityMention`, `EntityRelationship`, `EntityType`, `UpdateEntityParams` from `types/knowledge.ts` (Slice 12)
- `EntityChip` from `components/knowledge/EntityChip.tsx` (Slice 13) — entity type badges in header and relationships
- Modal patterns from `OriginalSourceModal.tsx` — Escape key, scroll lock, overlay, dialog role
- `.related-docs-skeleton` shimmer animation from `knowledge.css` (Slice 13) — loading state
- Tab switcher pattern from `.semantic-search-mode-pill` in `knowledge.css` (Slice 15)
- Button styles from `WorkspaceKnowledgeExplorerPage.tsx` (Slice 14) — reindexButtonStyle, backButtonStyle patterns
- Confidence badge pattern from `.related-doc-card-relevance` in `knowledge.css` (Slice 13) — high/medium/low levels

**Decisions:**
- Modal navigates between entities in-place (clicking a related entity changes `currentEntityId` state and re-fetches) rather than stacking modals — simpler UX and avoids z-index management
- Edit mode is inline within the same modal (toggle view/edit) rather than a separate form modal — matches the "detail with edit" pattern, reduces modals
- Metadata editor uses raw JSON textarea rather than per-field form — handles all entity types uniformly; type-specific forms would require 8 separate form components
- Local pagination for mentions list (max expected ~50 mentions per entity in typical workspaces) — avoids extra API calls
- Confidence badge thresholds (>=80% high, >=50% medium, <50% low) match existing `.related-doc-card-relevance` thresholds
- Strength bar uses CSS gradient (`#6366f1` to `#a5b4fc`) matching the indigo accent palette
- `onEntityChange` callback is called on save AND on close after editing — parent can decide when to refetch
- Escape key in edit mode cancels editing; Escape key in view mode closes modal — expected behavior for nested states

**Acceptance Criteria Check:**
- [x] Modal shows comprehensive entity information (name, type, aliases, stats, metadata)
- [x] Mentions listed with doc links and context
- [x] Relationships shown with strength indicators
- [x] Admin can edit entity details (name, aliases, metadata)
- [x] Navigation to documents works (mention doc links open in new tab)
- [x] Navigation to related entities works (click relationship → same modal shows that entity)
- [x] Loading/error states handled (skeleton shimmer + error banner with retry)

**Syntax Check:**
- `npx tsc --noEmit` — zero errors (clean pass)

**Next:** Slice 17 (Editor Integration)

---

### Slice 17: Editor Integration — COMPLETE

**Date:** 2026-02-09

**Files Modified:**
- `KACHERI FRONTEND/src/EditorPage.tsx` — Added knowledgeApi import, state, WS handler, toolbar button with entity count badge, 2 command palette entries, refreshKey prop on RelatedDocsPanel

**What Was Implemented:**
- **Import:** Added `knowledgeApi` from `api/knowledge` for entity count fetching
- **State:** `relatedRefreshKey` (number, triggers panel and entity count refresh) and `docEntityCount` (number, entity count for toolbar badge)
- **Entity count fetch:** `useEffect` calls `knowledgeApi.getDocEntities(docId)` on mount and on `relatedRefreshKey` change. Sets `docEntityCount` to `res.total`. Wrapped in try/catch (0 on error).
- **WS event listener:** Added `ai_job` event handler for `kind === "knowledge_index"` — increments `relatedRefreshKey` to trigger panel refresh and entity count re-fetch. Workspace-level (no docId filter needed — any indexing may affect current doc's related docs).
- **Toolbar button:** "Related" button after "Save Clause", before spacer. Active state matches drawer tab. Indigo (#6366f1) badge shows entity count (99+ cap). Badge only renders when `docEntityCount > 0`. Positioned absolutely relative to button.
- **Command palette — "Find Related Documents":** Opens Related drawer tab. Matches "Extract Intelligence"/"Check Compliance"/"Insert Clause" pattern.
- **Command palette — "Search Knowledge":** Navigates to `/workspaces/${workspaceId}/knowledge` (WorkspaceKnowledgeExplorerPage with integrated SemanticSearchBar from Slice 15).
- **RelatedDocsPanel refreshKey:** Passed `refreshKey={relatedRefreshKey}` prop (already supported by RelatedDocsPanel since Slice 13).

**What Was NOT Changed:**
- No backend files modified
- No API contract changes (consumes existing GET /docs/:id/entities from Slice 8)
- No new dependencies added
- No new files created
- No existing component files modified (only EditorPage.tsx)
- No CSS changes (badge uses inline styles matching toolbar pattern)
- Drawer tab and panel render from Slice 13 unchanged (only refreshKey prop added)

**Reused From Existing Code:**
- `knowledgeApi.getDocEntities()` from `api/knowledge.ts` (Slice 12) — entity count
- `RelatedDocsPanel.refreshKey` prop from `components/knowledge/RelatedDocsPanel.tsx` (Slice 13)
- Toolbar button pattern from "Intel"/"Comply"/"Clauses" buttons (active state, onClick, title, fontSize 12)
- Command palette pattern from "Extract Intelligence"/"Check Compliance"/"Insert Clause" (setRightDrawerTab + setRightDrawerOpen)
- WS event handler pattern from `compliance_check` (ai_job type + kind check via `(e as any).kind`)
- Entity count useEffect pattern from clause suggestion check (async IIFE in useEffect)

**Decisions:**
- Entity count badge uses inline styles (not CSS class) — matches all toolbar button styles in EditorPage which use inline CSSProperties
- Badge positioned absolutely at top-right (-4px offset) with indigo background (#6366f1) — matches knowledge graph accent color from Slices 13-16
- Badge caps at "99+" — prevents layout issues for docs with many entities
- Knowledge index WS events are workspace-level (no docId filter) — any indexing may create/update entities for the current document
- "Search Knowledge" navigates to workspace page (not inline modal) — SemanticSearchBar is already integrated there (Slice 15), avoiding duplicate UI in editor
- No `workspaceId` dependency needed in commands useMemo — `workspaceId` is already a stable state in scope, and navigate is in the deps array

**Acceptance Criteria Check:**
- [x] Panel accessible from editor via tab, toolbar, or command palette
- [x] Auto-loads related docs for current document (via RelatedDocsPanel)
- [x] WS events refresh panel on indexing (knowledge_index → relatedRefreshKey)
- [x] Command palette entries work (Find Related Documents + Search Knowledge)
- [x] Toolbar button shows entity count (indigo badge with number)

**Syntax Check:**
- `npx tsc --noEmit` — zero errors (clean pass)

**Next:** Slice 18 (Proof Integration)

---

### Slice 18: Proof Integration — COMPLETE

**Date:** 2026-02-09

**Files Modified:**
- `KACHERI FRONTEND/src/utils/tooltipHelpers.ts` — Added `knowledgeSearch` and `knowledgeIndex` to `PROOF_TOOLTIPS.proofTypes`
- `KACHERI FRONTEND/src/ProofsPanel.tsx` — Added filters, action labels, and two structured render functions for knowledge proof events

**What Was Implemented:**
- **Tooltip helpers:** Added two new proof type descriptions — `knowledgeSearch` ("Record of AI-powered semantic search across workspace documents with query, AI answer, and cited results.") and `knowledgeIndex` ("Record of workspace knowledge graph indexing with entity harvesting, normalization, and relationship detection counts.")
- **FILTERS array:** Added `"knowledge:search"` and `"knowledge:index"` as filter buttons in the ProofsPanel filter bar (after `clause:insert`, before `tts:read_aloud`)
- **formatAction map:** Added `"knowledge:search": "Knowledge Search"` and `"knowledge:index": "Knowledge Index"` for timeline display labels
- **renderKnowledgeSearchDetails():** Structured card for semantic search provenance events. Displays: query text (italic, truncated to 80 chars), result count (green badge), duration in seconds, proof hash (truncated). Raw details collapsible. Reads from backend meta: `query`, `resultCount`, `durationMs`, `proofHash`/`hash`.
- **renderKnowledgeIndexDetails():** Structured card for indexing provenance events. Displays: mode badge (Full Re-index / Incremental), duration, doc count, entities created (green badge), entities reused, relationships created, relationships updated, auto-merged count, error count (red badge if >0), proof hash. Raw details collapsible. Reads from backend meta: `mode`, `docsProcessed`, `entitiesCreated`, `entitiesReused`, `relationshipsCreated`, `relationshipsUpdated`, `autoMerged`, `errors`, `durationMs`, `proofHash`/`hash`.
- **Timeline chain:** Both new render functions wired into the existing conditional chain after `clause:insert`, before the generic fallback.

**What Was NOT Changed:**
- No backend files modified
- No API contract changes (ProofsPanel consumes existing provenance API)
- No new dependencies added
- No new files created
- No other component files modified

**Reused From Existing Code:**
- `renderComplianceDetails()` / `renderClauseInsertDetails()` card layout pattern (ProofsPanel.tsx:219-372) — identical structure: outer div with surface bg, header row, badge row, proof hash, collapsible raw details
- `PROOF_TOOLTIPS.proofTypes` object structure (tooltipHelpers.ts:16-25) — added two entries in same pattern
- `FILTERS` array and `formatAction` map (ProofsPanel.tsx:34-55) — added two entries in each

**Decisions:**
- Knowledge search card shows query text in italic (distinguishes from other event types where the header is a label/name)
- Query text truncated at 80 chars (not 120 like clause content preview — search queries tend to be shorter)
- Knowledge index card shows all available counts from backend meta (docsProcessed, entitiesCreated, entitiesReused, relationshipsCreated, relationshipsUpdated, autoMerged) — gives full picture of what the indexing job did
- Error count shown as red badge only when > 0 — doesn't clutter the card for successful runs
- Mode label maps "full" → "Full Re-index" and "incremental" → "Incremental" — clearer for users
- Both render functions tolerate missing/null fields via nullish coalescing defaults — handles both current and potential future meta field additions gracefully
- Proof hash field checked as both `proofHash` and `hash` — future-proofs against meta structure changes

**Acceptance Criteria Check:**
- [x] Semantic search queries appear in proofs list (knowledge:search filter + structured card)
- [x] Indexing events appear in provenance (knowledge:index filter + structured card)
- [x] Rich rendering of knowledge events in ProofsPanel (both render functions with badges and counts)
- [x] Tooltips added (knowledgeSearch and knowledgeIndex in PROOF_TOOLTIPS.proofTypes)

**Syntax Check:**
- `npx tsc --noEmit` — zero errors (clean pass)

**Next:** Slice 19 (Polish & Edge Cases)

---

### Slice 19: Polish & Edge Cases — COMPLETE

**Date:** 2026-02-09

**Files Modified:**
- `KACHERI BACKEND/src/knowledge/entityHarvester.ts` — Unicode NFC normalization in `normalizeName()` + graceful `EntityLimitExceededError` handling in `processRawEntities()`
- `KACHERI BACKEND/src/store/workspaceEntities.ts` — `ENTITY_LIMIT` (10K, env-configurable), `EntityLimitExceededError` class, limit check in `createEntity()`, `recalculateAllCounts()` function
- `KACHERI BACKEND/src/store/entityRelationships.ts` — `RELATIONSHIP_LIMIT` (5K, env-configurable), `RelationshipLimitExceededError` class, limit check in `createRelationship()`
- `KACHERI BACKEND/src/store/entityMentions.ts` — `cleanupStaleEntities()` function (deletes entities with zero mentions)
- `KACHERI BACKEND/src/knowledge/ftsSync.ts` — `FTS_BATCH_SIZE = 100` constant, batched inserts in `syncWorkspaceDocsToFts()` and `syncWorkspaceEntitiesToFts()`
- `KACHERI BACKEND/src/knowledge/entityNormalizer.ts` — `MAX_ENTITIES_PER_TYPE = 500` cap in `findDuplicateCandidates()`, sorts by mention_count desc
- `KACHERI BACKEND/src/routes/knowledge.ts` — New `POST /workspaces/:wid/knowledge/cleanup` endpoint (admin only)
- `KACHERI BACKEND/src/jobs/workers/knowledgeIndexWorker.ts` — Stage 2.5 stale entity cleanup between harvesting and normalization
- `KACHERI BACKEND/src/server.ts` — Added cleanup route to index listing
- `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx` — WebSocket indexing progress display via `useWorkspaceSocket`
- `KACHERI FRONTEND/src/components/knowledge/EntityRelationshipsList.tsx` — Local pagination (PAGE_SIZE = 10)
- `Docs/API_CONTRACT.md` — New cleanup endpoint docs, entity/relationship limits, 429 error docs

**What Was Implemented:**

1. **Unicode NFC normalization** — `normalizeName()` in entityHarvester.ts now applies `.normalize("NFC")` before `.trim().toLowerCase()`. Aligns with entityNormalizer.ts which already applies NFC during comparisons. Prevents duplicate entities from different Unicode compositions of accented characters.

2. **Entity count limit (10,000)** — `ENTITY_LIMIT` constant configurable via `KACHERI_ENTITY_LIMIT` env var (default 10,000). Custom `EntityLimitExceededError` thrown in `createEntity()` when workspace entity count >= limit. Exported from `WorkspaceEntitiesStore`.

3. **Relationship count limit (5,000)** — `RELATIONSHIP_LIMIT` constant configurable via `KACHERI_RELATIONSHIP_LIMIT` env var (default 5,000). Custom `RelationshipLimitExceededError` thrown in `createRelationship()` when workspace relationship count >= limit. Exported from `EntityRelationshipsStore`.

4. **Graceful limit handling** — Harvester catches `EntityLimitExceededError` in `processRawEntities()`, logs a warning in `result.errors`, and skips new entity creation while continuing to process mentions for existing entities. Relationship detector already had try/catch around `create()` calls — no changes needed there.

5. **Stale entity cleanup** — New `cleanupStaleEntities(workspaceId)` in entityMentions.ts deletes workspace_entities with no entity_mentions rows. New `recalculateAllCounts(workspaceId)` in workspaceEntities.ts bulk-updates `mention_count` and `doc_count` from entity_mentions aggregates. New Stage 2.5 in knowledgeIndexWorker.ts runs both cleanup functions between harvesting and normalization (broadcasts at 27–28% progress). New `POST /workspaces/:wid/knowledge/cleanup` admin endpoint for manual trigger.

6. **FTS5 batch processing** — Both `syncWorkspaceDocsToFts()` and `syncWorkspaceEntitiesToFts()` now insert in batches of `FTS_BATCH_SIZE = 100` via separate transactions. Prevents holding a SQLite write lock for the entire rebuild on large workspaces.

7. **Normalizer O(n²) cap** — `findDuplicateCandidates()` now limits each entity type group to top 500 entities by `mention_count` (desc). With `MAX_ENTITIES_PER_TYPE = 500`, worst-case comparisons are capped at 500² = 125K per type instead of 10K² = 100M. Logs a warning when capping.

8. **Frontend indexing progress** — WorkspaceKnowledgeExplorerPage.tsx connects to WebSocket via `useWorkspaceSocket`, processes `ai_job` events with `kind === 'knowledge_index'`, and displays real-time "Indexing: XX% (stage)" badge. Auto-refreshes summary and entities when indexing finishes/fails.

9. **Relationship pagination** — EntityRelationshipsList.tsx now has local pagination with PAGE_SIZE = 10, reusing `entity-mentions-pagination` CSS classes from EntityMentionsList pattern.

**What Was NOT Changed:**
- No new dependencies added
- No migration changes (all new functions operate on existing tables)
- No new files created
- No changes to relationship detector (already had try/catch)
- No changes to FTS5 query sanitization (already correct)
- No changes to search timeout handling (already has 20s timeout + FTS5 fallback)
- No changes to empty state handling (already correct in both frontend and backend)

**Areas Verified as Already Correct (No Changes Needed):**
- Empty workspace handling — both backend and frontend handle correctly
- Documents without extractions — RelatedDocsPanel shows "extract first", harvester returns early
- FTS5 query sanitization — `sanitizeFtsQuery()` wraps tokens in quotes
- Search timeout handling — semanticSearch.ts has 20s timeout with FTS5 fallback
- Pagination on list endpoints — all use `clampLimit`/`clampOffset`
- Indexing progress broadcasting — knowledgeIndexWorker.ts broadcasts at each stage

**Decisions:**
- Entity limit default of 10,000 chosen as reasonable upper bound for a workspace — covers large enterprise scenarios while preventing unbounded growth
- Relationship limit default of 5,000 is proportionally smaller since relationships grow quadratically with entities
- Both limits env-configurable for deployment flexibility without code changes
- Normalizer cap of 500 per type provides good dedup coverage (top entities by mention count are most important to normalize) while capping worst case at 125K comparisons
- FTS batch size of 100 balances between too-small transactions (overhead) and too-large (lock contention)
- Stale cleanup runs automatically during indexing (Stage 2.5) AND available as manual admin endpoint
- Frontend WS progress uses same `seenCountRef` pattern as EditorPage for event deduplication

**API Contract Updates:**
- Added `POST /workspaces/:wid/knowledge/cleanup` endpoint documentation
- Added 429 `limit_exceeded` error to merge endpoint
- Added "Entity & Relationship Limits" section documenting both limits, env overrides, and behavior

**Acceptance Criteria Check:**
- [x] Unicode NFC normalization prevents duplicate entities from combining marks
- [x] Entity count limited to 10K per workspace (configurable)
- [x] Relationship count limited to 5K per workspace (configurable)
- [x] Harvester gracefully handles limit exceeded (skips new, continues existing)
- [x] Stale entities cleaned up during indexing and via manual endpoint
- [x] FTS5 sync batched for large workspaces
- [x] Normalizer comparison capped at 500 entities per type
- [x] Frontend shows real-time indexing progress via WebSocket
- [x] Relationship list paginated (10 per page)
- [x] API contract updated with new endpoint and limits

**Syntax Check:**
- `KACHERI FRONTEND`: `npx tsc --noEmit` — zero errors (clean pass)
- `KACHERI BACKEND`: `npx tsc --noEmit` — 18 pre-existing errors in unrelated files (`docLinks.ts`, `messages.ts`, `notifications.ts`, `detectFields.ts`, `store/docLinks.ts`). Zero errors in any Slice 19 modified files.

**Next:** Slice 20 (Documentation & Testing)

---

### Slice 20: Documentation & Testing — COMPLETE

**Date:** 2026-02-09

**Files Created:**
- `KACHERI BACKEND/src/knowledge/__tests__/ftsSync.test.ts` — 13 tests: sanitizeFtsQuery pure function (12 cases) + FtsSync API surface (1 case)
- `KACHERI BACKEND/src/knowledge/__tests__/entityHarvester.test.ts` — 10 tests: normalizeName pure function (9 cases including Unicode NFC) + EntityHarvester API surface (1 case)
- `KACHERI BACKEND/src/knowledge/__tests__/entityNormalizer.test.ts` — 28 tests: levenshteinDistance (9 cases), levenshteinSimilarity (7 cases), parseAiNormalizationResponse (11 cases) + EntityNormalizer API surface (1 case)
- `KACHERI BACKEND/src/knowledge/__tests__/relationshipDetector.test.ts` — 20 tests: calculateBaseStrength (6 cases), parseAiRelationshipResponse (13 cases) + RelationshipDetector API surface (1 case)
- `KACHERI BACKEND/src/store/__tests__/workspaceEntities.test.ts` — 15 tests: validateEntityType (12 cases), ENTITY_LIMIT constant (2 cases) + WorkspaceEntitiesStore API surface (1 case)
- `Docs/features/cross-document-intelligence.md` — User documentation following document-intelligence.md template

**What Was Implemented:**
- **Unit tests for pure functions:** sanitizeFtsQuery (FTS5 query escaping), normalizeName (Unicode NFC + trim + lowercase), levenshteinDistance (Wagner-Fischer DP), levenshteinSimilarity (normalized with MIN_NAME_LENGTH guard), parseAiNormalizationResponse (regex parser for "N: SCORE - NAME - REASON"), calculateBaseStrength (linear scaling to STRENGTH_CAP_DOCS), parseAiRelationshipResponse (regex parser for "N: TYPE - LABEL - CONFIDENCE - REASON")
- **API surface validation:** All exported store and module objects verified for expected method presence (typeof === 'function')
- **Validator tests:** validateEntityType tested for all 8 valid types + reject cases (invalid, empty, uppercase, numeric)
- **Edge case coverage:** Empty inputs, boundary values (0, 100, cap values), Unicode NFC normalization, special FTS5 characters, en-dash/em-dash separators, malformed AI responses, out-of-range indices
- **User documentation:** Core capabilities, user workflows, technical details, proof integration, API reference listing all 14 endpoints, technical notes
- **API contract verification:** Confirmed all knowledge graph endpoints in ToC and body (Slices 8, 9, 19 — all complete)

**What Was NOT Changed:**
- No backend source files modified
- No frontend files modified
- No API contract changes needed (already complete from Slices 8, 9, 19)
- No new dependencies added
- No migration changes

**Reused From Existing Code:**
- Test pattern from `ai/__tests__/clauseMatcher.test.ts` — pure function tests: describe/it structure, `.js` extension imports, `.toBe()`, `.toBeCloseTo()`, `.get()?.prop`
- Test pattern from `store/__tests__/clauses.test.ts` — validator tests: accept/reject per value, API surface `typeof` checks
- Documentation pattern from `Docs/features/document-intelligence.md` — section structure: Overview → Capabilities → User Workflows → Technical Details → Proof Integration → API Reference → Technical Notes

**Test Results:**
- `npx vitest run` — **21 test files passed, 366 tests passed** (86 new tests from Slice 20)
- New test files: ftsSync (13), entityHarvester (10), entityNormalizer (28), relationshipDetector (20), workspaceEntities (15)

**Syntax Check:**
- `KACHERI FRONTEND`: `npx tsc --noEmit` — zero errors (clean pass)
- `KACHERI BACKEND`: `npx tsc --noEmit` — 18 pre-existing errors in unrelated files (`docLinks.ts`, `messages.ts`, `notifications.ts`, `detectFields.ts`, `store/docLinks.ts`). Zero errors in any Slice 20 files.

**Acceptance Criteria Check:**
- [x] All tests pass (86 new tests, 366 total)
- [x] User docs explain feature (overview, workflows, technical details, API reference)
- [x] API contract complete and in ToC (all 14 endpoints documented, ToC entries at lines 47-48)

---

## Cross-Document Intelligence — IMPLEMENTATION COMPLETE

**Total Slices:** 20 / 20 (100%)
**Total New Files Created:** 35+
**Total Files Modified:** 15+
**New Dependencies:** None
**New Test Coverage:** 86 tests across 5 test files

### Feature Summary

Cross-Document Intelligence transforms Kacheri from a per-document tool into a workspace-wide knowledge platform:

1. **Entity Harvesting** — Automatic extraction from Document Intelligence data (8 entity types, 6 document type mappers)
2. **Entity Normalization** — Two-stage deduplication (string similarity + AI scoring, auto-merge at 90+ confidence)
3. **Relationship Detection** — Co-occurrence + AI labeling (6 relationship types, strength scoring, evidence tracking)
4. **Full-Text Search** — SQLite FTS5 on documents and entities (BM25 ranking, snippet extraction, query sanitization)
5. **Semantic Search** — Natural language queries with AI-synthesized answers and document citations (20s timeout, FTS5 fallback)
6. **Related Documents** — Per-document related docs via shared entities (inverse-log entity importance, optional AI re-ranking)
7. **Background Indexing** — Full/incremental modes with WebSocket progress, stale cleanup, proof recording
8. **14 API Endpoints** — Entity CRUD, merge, relationships, semantic search, keyword search, indexing, status, summary, cleanup
9. **Frontend UI** — Knowledge Explorer page, semantic search bar, related docs panel, entity detail modal, editor integration (9th drawer tab, toolbar button, command palette)
10. **Proof Integration** — knowledge:search and knowledge:index proof kinds with structured rendering in ProofsPanel

*This session report is the authoritative tracker for Cross-Document Intelligence implementation. All 20 slices complete.*

---

## Post-Implementation Audit — 2026-02-09

### Audit Scope

Full detailed audit of the Cross-Document Intelligence implementation across all 20 slices. Verified backend modules, stores, routes, frontend components, API contract alignment, and documentation completeness.

### Documents Read

- `Docs/Roadmap/docs roadmap.md` — Section 2.4 (Knowledge Graph & Wiki Features)
- `Docs/blueprint/architecture blueprint.md` — Architecture layer compliance
- `Docs/API_CONTRACT.md` — All 14 knowledge graph endpoints (lines 2363-2924)
- `Docs/Roadmap/cross-document-intelligence-work-scope.md` — Full 20-slice spec
- `Docs/session-reports/2026-02-08-cross-document-intelligence.md` — All 20 slice reports
- `Docs/Roadmap/deferred-work-scope.md` — Existing deferred items

### Backend Modules Audited

| Module | File | Status |
|--------|------|--------|
| Types | `knowledge/types.ts` | Clean — 8 entity types, all interfaces well-defined |
| Entity Harvester | `knowledge/entityHarvester.ts` | Clean — 6 document type mappers, graceful fallback |
| Entity Normalizer | `knowledge/entityNormalizer.ts` | Clean — Two-stage dedup, O(n²) capped at 500/type (deferred) |
| Relationship Detector | `knowledge/relationshipDetector.ts` | Clean — Co-occurrence + AI labeling, evidence tracking |
| Semantic Search | `knowledge/semanticSearch.ts` | **Issue found** — FTS5 fallback flat scoring (fixed) |
| Related Docs | `knowledge/relatedDocs.ts` | Clean — Inverse-log importance, AI re-ranking optional |
| FTS Sync | `knowledge/ftsSync.ts` | Clean — FTS5 indexing, BM25 ranking, query sanitization |

### Backend Stores & Routes Audited

| Component | File | Status |
|-----------|------|--------|
| Entity Store | `store/workspaceEntities.ts` | Clean |
| Mention Store | `store/entityMentions.ts` | Clean |
| Relationship Store | `store/entityRelationships.ts` | Clean |
| Query Store | `store/knowledgeQueries.ts` | Clean |
| Routes | `routes/knowledge.ts` | Clean — All 14 endpoints match API contract |
| Background Worker | `jobs/workers/knowledgeIndexWorker.ts` | Clean — Full/incremental modes |
| Job Types | `jobs/types.ts` | Clean — knowledge:index registered |
| Worker Registry | `jobs/workers/index.ts` | Clean — Worker wired |
| Proof Types | `types/proofs.ts` | Clean — knowledge:search and knowledge:index kinds |
| Migration | `migrations/008_add_knowledge_graph.sql` | Clean — All tables, indexes, FTS5 |
| Server Registration | `server.ts` | Clean — Routes registered |
| Extraction Hook | `routes/extraction.ts` | Clean — Auto-index triggers on extraction |
| Import Hook | `routes/importDoc.ts` | Clean — Auto-index triggers on import |

### Frontend Components Audited

| Component | File | Status |
|-----------|------|--------|
| Types | `types/knowledge.ts` | Clean — Matches API contract |
| API Client | `api/knowledge.ts` | Clean — All 14 endpoints wired |
| Entity Chip | `components/knowledge/EntityChip.tsx` | Clean |
| Entity List | `components/knowledge/EntityList.tsx` | Clean |
| Entity Detail Modal | `components/knowledge/EntityDetailModal.tsx` | Clean |
| Related Docs Panel | `components/knowledge/RelatedDocsPanel.tsx` | Clean |
| Semantic Search Bar | `components/knowledge/SemanticSearchBar.tsx` | Clean |
| Search Results | `components/knowledge/SearchResultCard.tsx` | Clean |
| Relationship List | `components/knowledge/RelationshipList.tsx` | Clean |
| Knowledge Summary | `components/knowledge/KnowledgeSummaryCard.tsx` | Clean |
| Index Status | `components/knowledge/IndexStatusBanner.tsx` | Clean |
| Explorer Page | `pages/WorkspaceKnowledgeExplorerPage.tsx` | Clean |
| App Router | `App.tsx` | Clean — Route registered |
| Editor Integration | `EditorPage.tsx` | Clean — 9th drawer tab, toolbar button |
| Proofs Panel | `ProofsPanel.tsx` | Clean — knowledge:search and knowledge:index rendering |
| Tooltip Helpers | `utils/tooltipHelpers.ts` | Clean — Knowledge proof tooltips |

### Overall Audit Grade: A

Implementation is comprehensive, well-structured, and architecturally sound. All 20 slices verified against work scope. All 14 API endpoints match the API contract. No architectural violations. No dependency policy violations.

### Issues Found

#### Issue 1: FTS5 Fallback Relevance Scoring (Fixed)

**Severity:** Low (cosmetic / UX)
**Location:** `KACHERI BACKEND/src/knowledge/semanticSearch.ts`
**Problem:** When AI synthesis fails or times out, the fallback path assigns a flat `0.5` (`DEFAULT_RELEVANCE`) to all results. This discards BM25 ranking data that FTS5 already provides, causing all fallback results to show "50%" relevance in the UI.
**Root Cause:** `gatherFtsCandidates()` was discarding the `rank` field from FTS5 results during the conversion step.
**Fix Applied:** See "Fix Applied" section below.

#### Issue 2: N+1 Query Pattern (Deferred)

**Severity:** Low (performance, not user-visible at current scale)
**Location:** Multiple knowledge engine modules
**Decision:** Deferred — recorded in `deferred-work-scope.md` item #6.

#### Issue 3: Entity Normalizer O(n²) Scaling (Deferred)

**Severity:** Low (scaling concern beyond 500 entities/type)
**Location:** `knowledge/entityNormalizer.ts`
**Decision:** Deferred — recorded in `deferred-work-scope.md` item #7.

#### Issue 4: Frontend Unit Tests Missing (Deferred)

**Severity:** Medium (regression safety)
**Location:** All `components/knowledge/` files
**Decision:** Deferred — recorded in `deferred-work-scope.md` item #8.

### False Positive Retracted

Initially identified `POST /workspaces/:wid/knowledge/cleanup` as undocumented in the API contract. Upon deeper inspection, it IS documented at API_CONTRACT.md lines 2898-2924. This finding was retracted and removed from the deferred work scope.

---

## Fix Applied — FTS5 Fallback Relevance Scoring

### Date: 2026-02-09

### File Modified

`KACHERI BACKEND/src/knowledge/semanticSearch.ts`

### Changes

1. **Added `ftsRankToRelevance()` helper** — Converts FTS5 BM25 rank (negative, more negative = more relevant) to a 0-1 relevance value. Maps rank 0 → 0.1, rank -10 → 1.0.

2. **Preserved FTS5 rank in `gatherFtsCandidates()`** — Updated return type to include `rank` field. Doc-based results carry through BM25 rank from `DocFtsResult`. Entity-based results (which don't originate from doc FTS) receive a neutral rank of `-1`.

3. **Added `ftsRank` to `CandidateDoc` interface** — Carried rank through `buildCandidateContext()` into the enriched candidate objects.

4. **Updated overall timeout fallback** — Replaced `DEFAULT_RELEVANCE` (flat 0.5) with `ftsRankToRelevance(c.rank)` for differentiated scoring.

5. **Updated AI synthesis failure fallback** — Replaced `DEFAULT_RELEVANCE` with `ftsRankToRelevance(c.ftsRank)` for differentiated scoring.

6. **`DEFAULT_RELEVANCE` retained** — Still used in `parseSynthesisResponse()` as fallback for unparseable AI relevance scores. Not removed.

### What Did NOT Change

- No API contract changes (relevance field already exists as `number`)
- No frontend changes (already renders any 0-1 relevance value)
- No FTS5 query changes (rank already selected by ftsSync.ts)
- No store changes
- No new dependencies

### Verification

- `npx tsc --noEmit` — Zero new TypeScript errors. All 18 pre-existing errors are in unrelated files (`docLinks.ts`, `messages.ts`, `notifications.ts`, `detectFields.ts`, `store/docLinks.ts`).

---

## Deferred Work Scope Updates — 2026-02-09

### Items Added to `Docs/Roadmap/deferred-work-scope.md`

| # | Item | Source |
|---|------|--------|
| 2 | Graph Visualization for Knowledge Graph | Slice 19 — explicit deferral |
| 3 | Vector Embeddings / External Search Engine | Architecture decision |
| 4 | Cross-Workspace Search | Constraint #8 |
| 5 | Real-Time Entity Detection (As-You-Type) | Constraint #7 |
| 6 | N+1 Query Optimization in Knowledge Engine | Audit finding |
| 7 | Improved Entity Normalizer Scaling | Audit finding |
| 8 | Frontend Unit Tests for Knowledge Components | Slice 20 partial deferral |

### Items Removed

- **Cleanup Endpoint Documentation** (was item #6) — False positive. Endpoint is documented at API_CONTRACT.md lines 2898-2924. Removed.
- **FTS5 Fallback Relevance Scoring** (was item #10) — Fixed in this session. Removed.

### Final State

`deferred-work-scope.md` contains 8 items (1 from prior sessions + 7 from this audit).

---

*Audit and fix completed 2026-02-09. Session report updated.*
