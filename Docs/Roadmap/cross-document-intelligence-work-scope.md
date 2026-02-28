# Cross-Document Intelligence / Knowledge Graph — Full Work Scope

**Created:** 2026-02-08
**Status:** APPROVED FOR IMPLEMENTATION
**Phase:** Enhancement Plan Phase 3 (from docs-enhancement-planning.md)
**Prerequisite:** Document Intelligence (complete), Compliance Checker (complete), Clause Library (complete)

---

## Executive Summary

Cross-Document Intelligence transforms Kacheri from a per-document tool into a workspace-wide knowledge platform. Entities (people, organizations, dates, amounts, terms) are automatically harvested from every document's extraction data, normalized into a canonical knowledge graph, and made searchable via natural language. Users can ask "What did we agree with Acme Corp about liability?" and get AI-generated answers with citations linking to specific documents and paragraphs.

**Core value propositions:**
1. **Entity search** — "Find all docs mentioning Acme Corp"
2. **Related documents** — "What other docs are connected to this contract?"
3. **Semantic search** — "What are our active contracts over $50K?"
4. **Cross-doc awareness** — Know your workspace's knowledge, not just individual files

---

## How It Extends Existing Infrastructure

| Existing Component | How It's Extended |
|---|---|
| `extractions` table + AI extraction engine | Entity harvester reads extraction_json to populate entity tables |
| `anomalyDetector.ts` rule engine | Entity anomalies (orphaned entities, stale mentions) |
| `clauseMatcher.ts` two-stage similarity | Reused for entity normalization (keyword pre-filter + AI scoring) |
| `composeText()` in modelRouter | AI-powered semantic search, entity normalization, relationship detection |
| `ExtractionPanel.tsx` sidebar pattern | New "Related" drawer tab following identical patterns |
| `WorkspaceStandardsPage.tsx` workspace page pattern | New WorkspaceKnowledgeExplorerPage |
| Proof pipeline (`ai:extraction`) | New `knowledge:search` and `knowledge:index` proof kinds |
| Job queue + workers | New indexing worker for background entity processing |
| SQLite database | FTS5 virtual tables for full-text search (no new dependency) |

---

## Feature Requirements

### Core Capabilities

1. **Entity Harvesting**
   - Automatically extract entities from Document Intelligence extraction data
   - Support entity types: person, organization, date, amount, location, product, term, concept
   - Track where each entity appears (document, field path, surrounding context)
   - Handle both new documents (on extraction) and existing corpus (batch re-index)

2. **Entity Normalization**
   - Detect duplicate entities ("Acme Corp" vs "Acme Corporation" vs "ACME")
   - AI-assisted merging with alias tracking
   - Canonical name selection with manual override
   - Workspace-scoped deduplication

3. **Relationship Detection**
   - Co-occurrence relationships (entities appearing in the same document)
   - AI-labeled relationships ("contracted with", "pays", "reports to")
   - Relationship strength scoring (based on frequency + AI confidence)
   - Evidence tracking (which documents support each relationship)

4. **Full-Text Search**
   - SQLite FTS5 index on document titles and content
   - FTS5 index on entity names and aliases
   - Fast keyword search across workspace

5. **Semantic Search**
   - Natural language queries ("What are our payment terms with Acme?")
   - AI-ranked results with relevance scoring
   - Document citations with context snippets
   - Query history with proof integration

6. **Related Documents**
   - Per-document: find other docs sharing entities with this one
   - Ranked by entity overlap + AI relevance
   - Show shared entities as connection reason

7. **Proof Integration**
   - Semantic search queries are proofed AI actions
   - Entity indexing tracked in provenance
   - Query results traceable to source documents

---

## Database Schema

### workspace_entities
Canonical, deduplicated entities at workspace level (the "nodes" of the knowledge graph).

```sql
CREATE TABLE IF NOT EXISTS workspace_entities (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'person', 'organization', 'date', 'amount',
    'location', 'product', 'term', 'concept'
  )),
  name TEXT NOT NULL,                         -- canonical display name
  normalized_name TEXT NOT NULL,              -- lowercase, trimmed, for dedup matching
  aliases_json TEXT NOT NULL DEFAULT '[]',    -- JSON string array of alternative names
  metadata_json TEXT,                         -- type-specific metadata (address, title, etc.)
  mention_count INTEGER NOT NULL DEFAULT 0,   -- total mentions across all docs
  doc_count INTEGER NOT NULL DEFAULT 0,       -- number of distinct documents
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX idx_ws_entities_workspace ON workspace_entities(workspace_id);
CREATE INDEX idx_ws_entities_type ON workspace_entities(workspace_id, entity_type);
CREATE INDEX idx_ws_entities_normalized ON workspace_entities(workspace_id, normalized_name);
CREATE INDEX idx_ws_entities_doc_count ON workspace_entities(workspace_id, doc_count DESC);
```

### entity_mentions
Occurrences of entities in specific documents (edges from entities to documents).

```sql
CREATE TABLE IF NOT EXISTS entity_mentions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,                    -- FK to workspace_entities
  doc_id TEXT NOT NULL,
  context TEXT,                               -- surrounding sentence for citation
  field_path TEXT,                            -- extraction field origin (e.g., "parties[0].name")
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'extraction'   -- extraction, manual, ai_index
    CHECK (source IN ('extraction', 'manual', 'ai_index')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES workspace_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);
CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX idx_mentions_doc ON entity_mentions(doc_id);
CREATE INDEX idx_mentions_workspace ON entity_mentions(workspace_id);
CREATE UNIQUE INDEX idx_mentions_unique ON entity_mentions(entity_id, doc_id, field_path);
```

### entity_relationships
Relationships between entities (edges between nodes in the graph).

```sql
CREATE TABLE IF NOT EXISTS entity_relationships (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'co_occurrence', 'contractual', 'financial',
    'organizational', 'temporal', 'custom'
  )),
  label TEXT,                                 -- human-readable (e.g., "pays", "contracted with")
  strength REAL NOT NULL DEFAULT 0.5,         -- 0.0-1.0 confidence/strength
  evidence_json TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ docId, context }]
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (from_entity_id) REFERENCES workspace_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (to_entity_id) REFERENCES workspace_entities(id) ON DELETE CASCADE
);
CREATE INDEX idx_rel_from ON entity_relationships(from_entity_id);
CREATE INDEX idx_rel_to ON entity_relationships(to_entity_id);
CREATE INDEX idx_rel_workspace ON entity_relationships(workspace_id);
CREATE UNIQUE INDEX idx_rel_pair ON entity_relationships(from_entity_id, to_entity_id, relationship_type);
```

### knowledge_queries
Log of semantic search queries for provenance and audit.

```sql
CREATE TABLE IF NOT EXISTS knowledge_queries (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_type TEXT NOT NULL CHECK (query_type IN (
    'semantic_search', 'entity_search', 'related_docs'
  )),
  results_json TEXT,                          -- JSON: array of results
  result_count INTEGER NOT NULL DEFAULT 0,
  proof_id TEXT,
  queried_by TEXT NOT NULL,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);
CREATE INDEX idx_kq_workspace ON knowledge_queries(workspace_id);
CREATE INDEX idx_kq_type ON knowledge_queries(query_type);
CREATE INDEX idx_kq_created ON knowledge_queries(created_at DESC);
```

### FTS5 Virtual Tables
Full-text search indexes using SQLite's built-in FTS5 (no external dependency).

```sql
-- Full-text search on document content
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  doc_id UNINDEXED,
  workspace_id UNINDEXED,
  title,
  content_text,
  tokenize='porter unicode61'
);

-- Full-text search on entity names
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  entity_id UNINDEXED,
  workspace_id UNINDEXED,
  name,
  aliases,
  tokenize='porter unicode61'
);
```

---

## Entity Type Schemas

### Person
```typescript
interface PersonMetadata {
  title?: string;       // "CEO", "Attorney"
  organization?: string; // associated organization
  email?: string;
  phone?: string;
}
```

### Organization
```typescript
interface OrganizationMetadata {
  type?: string;        // "corporation", "llc", "partnership"
  address?: string;
  taxId?: string;
  industry?: string;
}
```

### Amount
```typescript
interface AmountMetadata {
  value: number;
  currency: string;
  frequency?: string;   // "annual", "monthly", "one-time"
  context: string;       // "payment", "liability cap", "invoice total"
}
```

### Date
```typescript
interface DateMetadata {
  isoDate: string;       // "2026-01-15"
  context: string;       // "effective date", "expiration", "due date"
  isRecurring?: boolean;
}
```

### Location
```typescript
interface LocationMetadata {
  city?: string;
  state?: string;
  country?: string;
  context?: string;      // "governing law", "headquarters", "venue"
}
```

### Product / Term / Concept
```typescript
interface GenericEntityMetadata {
  category?: string;
  description?: string;
}
```

---

## API Contract Additions

### Entity Endpoints

```http
GET /workspaces/:wid/knowledge/entities
Authorization: Bearer <accessToken>
Query: ?type=person&search=acme&sort=doc_count&order=desc&limit=50&offset=0
```

**Response:** `200 OK`
```json
{
  "entities": [
    {
      "id": "ent_abc123",
      "entityType": "organization",
      "name": "Acme Corp",
      "aliases": ["Acme Corporation", "ACME"],
      "mentionCount": 15,
      "docCount": 7,
      "firstSeenAt": "2026-01-15T10:00:00Z",
      "lastSeenAt": "2026-02-07T14:30:00Z"
    }
  ],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

---

```http
GET /workspaces/:wid/knowledge/entities/:eid
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "entity": {
    "id": "ent_abc123",
    "entityType": "organization",
    "name": "Acme Corp",
    "normalizedName": "acme corp",
    "aliases": ["Acme Corporation", "ACME"],
    "metadata": { "type": "corporation", "industry": "technology" },
    "mentionCount": 15,
    "docCount": 7,
    "firstSeenAt": "2026-01-15T10:00:00Z",
    "lastSeenAt": "2026-02-07T14:30:00Z"
  },
  "mentions": [
    {
      "docId": "doc_xyz789",
      "docTitle": "Services Agreement",
      "context": "...between Acme Corp and Beyle Inc...",
      "fieldPath": "parties[0].name",
      "confidence": 0.95
    }
  ],
  "relationships": [
    {
      "id": "rel_123",
      "relatedEntity": { "id": "ent_def456", "name": "Beyle Inc", "entityType": "organization" },
      "relationshipType": "contractual",
      "label": "contracted with",
      "strength": 0.88,
      "evidenceCount": 3
    }
  ]
}
```

---

```http
PATCH /workspaces/:wid/knowledge/entities/:eid
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Acme Corporation",
  "aliases": ["Acme Corp", "ACME"],
  "metadata": { "type": "corporation", "industry": "technology" }
}
```

**Response:** `200 OK`

---

```http
DELETE /workspaces/:wid/knowledge/entities/:eid
Authorization: Bearer <accessToken>
```

**Response:** `204 No Content`

---

```http
POST /workspaces/:wid/knowledge/entities/merge
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "sourceEntityIds": ["ent_dup1", "ent_dup2"],
  "targetEntityId": "ent_canonical",
  "mergedName": "Acme Corporation"
}
```

**Response:** `200 OK`
```json
{
  "mergedEntity": { ... },
  "mergedMentionCount": 3,
  "deletedEntityIds": ["ent_dup1", "ent_dup2"]
}
```

---

### Relationship Endpoints

```http
GET /workspaces/:wid/knowledge/relationships
Authorization: Bearer <accessToken>
Query: ?entityId=ent_abc123&type=contractual&minStrength=0.5&limit=50
```

**Response:** `200 OK`
```json
{
  "relationships": [
    {
      "id": "rel_123",
      "fromEntity": { "id": "ent_abc", "name": "Acme Corp", "entityType": "organization" },
      "toEntity": { "id": "ent_def", "name": "Beyle Inc", "entityType": "organization" },
      "relationshipType": "contractual",
      "label": "contracted with",
      "strength": 0.88,
      "evidenceCount": 3
    }
  ],
  "total": 24
}
```

---

### Search Endpoints

```http
POST /workspaces/:wid/knowledge/search
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "query": "What are our payment terms with Acme Corp?",
  "queryType": "semantic_search",
  "limit": 10
}
```

**Response:** `200 OK`
```json
{
  "queryId": "kq_abc123",
  "query": "What are our payment terms with Acme Corp?",
  "answer": "Based on 3 documents, your standard payment terms with Acme Corp are Net-30, with the most recent contract specifying $150,000/year payable monthly.",
  "results": [
    {
      "docId": "doc_xyz789",
      "docTitle": "Services Agreement — Acme Corp",
      "relevance": 0.95,
      "snippets": [
        {
          "text": "Payment shall be made within thirty (30) days of invoice receipt...",
          "fieldPath": "paymentTerms",
          "highlightRanges": [[0, 7]]
        }
      ],
      "matchedEntities": ["Acme Corp", "$150,000"]
    }
  ],
  "resultCount": 3,
  "proofId": "proof_kq_123",
  "durationMs": 2340
}
```

---

```http
GET /workspaces/:wid/knowledge/search?q=acme
Authorization: Bearer <accessToken>
```

Quick keyword search (FTS5, no AI). Returns matching entities and documents.

**Response:** `200 OK`
```json
{
  "entities": [
    { "id": "ent_abc", "name": "Acme Corp", "entityType": "organization", "docCount": 7 }
  ],
  "documents": [
    { "docId": "doc_xyz", "title": "Services Agreement — Acme Corp", "snippet": "...between <mark>Acme</mark> Corp and..." }
  ]
}
```

---

### Per-Document Endpoints

```http
GET /docs/:id/related
Authorization: Bearer <accessToken>
Query: ?limit=10
```

**Response:** `200 OK`
```json
{
  "relatedDocs": [
    {
      "docId": "doc_abc",
      "title": "Invoice #1234 — Acme Corp",
      "relevance": 0.82,
      "sharedEntities": [
        { "name": "Acme Corp", "entityType": "organization" },
        { "name": "$150,000", "entityType": "amount" }
      ],
      "sharedEntityCount": 2
    }
  ],
  "entityCount": 12,
  "totalRelated": 5
}
```

---

```http
GET /docs/:id/entities
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "entities": [
    {
      "entityId": "ent_abc",
      "entityType": "organization",
      "name": "Acme Corp",
      "context": "...between Acme Corp and Beyle Inc...",
      "confidence": 0.95,
      "fieldPath": "parties[0].name"
    }
  ],
  "total": 12
}
```

---

### Indexing Endpoints

```http
POST /workspaces/:wid/knowledge/index
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "mode": "full",
  "forceReindex": false
}
```

**Response:** `202 Accepted`
```json
{
  "jobId": "job_idx_123",
  "status": "queued",
  "estimatedDocs": 45
}
```

---

```http
GET /workspaces/:wid/knowledge/status
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "entityCount": 142,
  "mentionCount": 487,
  "relationshipCount": 68,
  "indexedDocCount": 45,
  "totalDocCount": 48,
  "lastIndexedAt": "2026-02-08T10:00:00Z",
  "indexingInProgress": false
}
```

---

### Summary Endpoint

```http
GET /workspaces/:wid/knowledge/summary
Authorization: Bearer <accessToken>
```

**Response:** `200 OK`
```json
{
  "stats": {
    "entityCount": 142,
    "relationshipCount": 68,
    "indexedDocs": 45,
    "totalDocs": 48,
    "queryCount": 23
  },
  "topEntities": [
    { "id": "ent_abc", "name": "Acme Corp", "entityType": "organization", "docCount": 7 },
    { "id": "ent_def", "name": "John Smith", "entityType": "person", "docCount": 5 }
  ],
  "entityTypeBreakdown": {
    "organization": 28,
    "person": 45,
    "amount": 32,
    "date": 22,
    "location": 8,
    "term": 7
  },
  "recentQueries": [
    { "id": "kq_abc", "query": "Payment terms with Acme", "resultCount": 3, "createdAt": "2026-02-08T09:30:00Z" }
  ]
}
```

---

## Implementation Slices

### Slice 1: Database Schema & Store Layer
**Files to create:**
- `KACHERI BACKEND/migrations/008_add_knowledge_graph.sql`
- `KACHERI BACKEND/src/store/workspaceEntities.ts`
- `KACHERI BACKEND/src/store/entityMentions.ts`
- `KACHERI BACKEND/src/store/entityRelationships.ts`
- `KACHERI BACKEND/src/store/knowledgeQueries.ts`

**Scope:**
- Create migration with all 4 tables + 2 FTS5 virtual tables + all indexes
- Implement WorkspaceEntitiesStore (CRUD + search + getByType + merge + incrementCounts)
- Implement EntityMentionsStore (create, getByEntity, getByDoc, delete)
- Implement EntityRelationshipsStore (create, getByEntity, getByPair, update, delete)
- Implement KnowledgeQueriesStore (create, getByWorkspace, getById)

**Acceptance Criteria:**
- All tables created via migration
- Store functions work for all CRUD operations
- FTS5 tables created and usable
- Indexes verified

---

### Slice 2: FTS5 Search Index Sync
**Files to create:**
- `KACHERI BACKEND/src/knowledge/ftsSync.ts`

**Scope:**
- Functions to sync document content to docs_fts (insert, update, delete)
- Functions to sync entity data to entities_fts (insert, update, delete)
- Batch sync function for re-indexing entire workspace
- HTML-to-plain-text conversion for indexing document content
- FTS5 query helpers (MATCH syntax, snippet extraction, rank ordering)

**Acceptance Criteria:**
- Can add/update/remove documents from FTS index
- Can add/update/remove entities from FTS index
- FTS MATCH queries return ranked results with snippets
- Batch sync handles full workspace

---

### Slice 3: Entity Harvester
**Files to create:**
- `KACHERI BACKEND/src/knowledge/entityHarvester.ts`
- `KACHERI BACKEND/src/knowledge/types.ts`

**Scope:**
- Read extraction data (extraction_json from extractions table) and extract entities
- Map extraction schema fields to entity types:
  - Contract: parties → person/organization, dates → date, amounts → amount, governingLaw → location
  - Invoice: vendor/customer → organization, amounts → amount, dates → date
  - Proposal: vendor/client → organization, deliverables → product, pricing → amount
  - Meeting Notes: attendees → person, action items → term/concept
  - Report: metrics → amount, risks → concept
  - Generic: entities array directly mapped
- Normalize entity names (trim, lowercase for matching)
- Check for existing canonical entity (by normalized_name + entity_type in workspace)
- Create new workspace_entity if not found, or add mention to existing one
- Update mention_count and doc_count on workspace_entities
- Store context snippets from extraction data

**Acceptance Criteria:**
- Can harvest entities from any document type extraction
- Creates canonical entities with correct types
- Deduplicates by normalized name within workspace
- Tracks mentions with context and field paths
- Updates counts correctly

---

### Slice 4: Entity Normalizer (AI-Assisted)
**Files to create:**
- `KACHERI BACKEND/src/knowledge/entityNormalizer.ts`

**Scope:**
- Find potential duplicate entities in workspace (same type, similar normalized names)
- Stage 1: Fast pre-filter using string similarity (Levenshtein / Jaccard on names + aliases)
- Stage 2: AI comparison for ambiguous cases using composeText()
  - System prompt: "Are these the same entity? Compare names and context."
  - Return: confidence score + recommended canonical name
- Suggest merges (don't auto-merge — present to user or auto-merge above threshold)
- Merge function: combine mentions, update aliases, recalculate counts, delete source entities
- Handle edge cases: same name different entity types, abbreviations, multilingual names

**Acceptance Criteria:**
- Finds duplicate candidates via string similarity
- AI scoring for ambiguous cases
- Merge function correctly combines all mentions and aliases
- Counts recalculated after merge
- Pre-filter reduces unnecessary AI calls

---

### Slice 5: Relationship Detector
**Files to create:**
- `KACHERI BACKEND/src/knowledge/relationshipDetector.ts`

**Scope:**
- **Co-occurrence detection:** Entities appearing in the same document get a co_occurrence relationship
- **AI relationship labeling:** For entity pairs co-occurring in 2+ documents, use AI to label the relationship type
  - System prompt: "Given these two entities and the documents they appear in, what is their relationship?"
  - Return: relationship_type, label, strength
- **Strength calculation:** Based on co-occurrence frequency + AI confidence
- **Evidence tracking:** Store document IDs and context snippets as evidence for each relationship
- **Incremental updates:** On new entity mention, check for new co-occurrences and update relationships

**Acceptance Criteria:**
- Co-occurrence relationships created for entities sharing documents
- AI labels relationships with appropriate types
- Strength reflects frequency and confidence
- Evidence array tracks supporting documents
- Incremental update works without full rebuild

---

### Slice 6: Semantic Search Engine
**Files to create:**
- `KACHERI BACKEND/src/knowledge/semanticSearch.ts`

**Scope:**
- Accept natural language query from user
- Step 1: Extract key terms and entity names from query (AI-assisted)
- Step 2: FTS5 keyword search on docs_fts and entities_fts for candidate documents
- Step 3: For top candidates (max 10), gather extraction summaries and entity contexts
- Step 4: AI synthesis — given query + candidate doc summaries, generate:
  - Ranked results with relevance scores
  - Answer summary with citations
  - Matched entities highlighted
- Timeout: 20s for full pipeline
- Log query + results to knowledge_queries table

**Acceptance Criteria:**
- Natural language queries return relevant documents
- AI answer includes citations to specific documents
- FTS5 pre-filter reduces AI processing to top candidates
- Results ranked by relevance
- Query logged for provenance

---

### Slice 7: Related Documents Engine
**Files to create:**
- `KACHERI BACKEND/src/knowledge/relatedDocs.ts`

**Scope:**
- Given a document ID, find other documents that share entities
- Step 1: Get all entity mentions for the document
- Step 2: Find other documents with mentions of the same entities
- Step 3: Rank by shared entity count + entity importance (doc_count as inverse relevance)
- Step 4: Optional AI re-ranking for top candidates (using document summaries)
- Return: ranked list of related docs with shared entities listed as "connection reasons"

**Acceptance Criteria:**
- Returns related documents ranked by shared entities
- Shows which entities are shared as connection reasons
- AI re-ranking improves relevance for top results
- Handles documents with no entities gracefully
- Performance acceptable (<5s for typical workspace)

---

### Slice 8: Knowledge Graph API Routes — Entities & Relationships
**Files to create:**
- `KACHERI BACKEND/src/routes/knowledge.ts`

**Files to modify:**
- `KACHERI BACKEND/src/server.ts` (register routes)
- `KACHERI BACKEND/src/types/proofs.ts` (add `knowledge:search`, `knowledge:index` to ProofKind)
- `Docs/API_CONTRACT.md` (document all endpoints)

**Scope:**
- GET /workspaces/:wid/knowledge/entities — List entities (paginated, filterable by type, searchable)
- GET /workspaces/:wid/knowledge/entities/:eid — Entity detail with mentions and relationships
- PATCH /workspaces/:wid/knowledge/entities/:eid — Update entity (admin only)
- DELETE /workspaces/:wid/knowledge/entities/:eid — Delete entity (admin only)
- POST /workspaces/:wid/knowledge/entities/merge — Merge entities (admin only)
- GET /workspaces/:wid/knowledge/relationships — List relationships (filterable)
- GET /docs/:id/entities — Entities in a document
- GET /docs/:id/related — Related documents via shared entities
- Workspace middleware + RBAC (member read, admin write)

**Acceptance Criteria:**
- All endpoints return correct responses
- Pagination works
- Filters and search work
- Admin-only write operations enforced
- Doc-level permissions respected for per-doc endpoints

---

### Slice 9: Knowledge Graph API Routes — Search, Indexing & Summary
**Files to modify:**
- `KACHERI BACKEND/src/routes/knowledge.ts`
- `Docs/API_CONTRACT.md`

**Scope:**
- POST /workspaces/:wid/knowledge/search — Semantic search (AI-powered)
- GET /workspaces/:wid/knowledge/search?q=term — Quick keyword search (FTS5)
- POST /workspaces/:wid/knowledge/index — Trigger full workspace re-index (admin only)
- GET /workspaces/:wid/knowledge/status — Index status
- GET /workspaces/:wid/knowledge/summary — Dashboard summary stats
- Rate limiting on semantic search (uses AI calls)
- Create proof records for semantic search queries

**Acceptance Criteria:**
- Semantic search returns AI answer with citations
- Keyword search returns entities + documents via FTS5
- Index trigger queues background job
- Status shows correct counts
- Summary includes top entities and type breakdown

---

### Slice 10: Auto-Index Integration Hook
**Files to modify:**
- `KACHERI BACKEND/src/routes/extraction.ts` (after successful extraction)
- `KACHERI BACKEND/src/routes/importDoc.ts` (after auto-extraction on import)

**Scope:**
- After extraction completes (POST /docs/:id/extract), trigger entity harvesting
- After auto-extraction on import, trigger entity harvesting
- Non-blocking: harvesting runs async, failure doesn't affect extraction
- Update FTS5 docs_fts index when document content changes
- Update FTS5 entities_fts index when new entities are created

**Acceptance Criteria:**
- Extracting a document auto-harvests entities
- Importing a document auto-harvests entities (after extraction)
- FTS indexes updated on content changes
- Harvesting failures don't affect extraction
- Entities appear in knowledge graph after extraction

---

### Slice 11: Background Indexing Worker
**Files to create:**
- `KACHERI BACKEND/src/jobs/workers/knowledgeIndexWorker.ts`

**Files to modify:**
- `KACHERI BACKEND/src/jobs/types.ts` (add `knowledge:index` job type)
- `KACHERI BACKEND/src/jobs/workers/index.ts` (register worker)

**Scope:**
- Full workspace re-index job: iterate all docs with extractions, harvest entities, detect relationships
- Incremental mode: only process docs modified since last index
- Progress tracking via WebSocket broadcasts
- Entity normalization pass after harvesting (find and suggest duplicates)
- Relationship detection pass after normalization
- FTS5 full rebuild option

**Acceptance Criteria:**
- Full re-index processes all workspace documents
- Incremental mode skips already-indexed docs
- Progress reported via WebSocket
- Normalization suggestions generated
- Relationships detected after entity harvesting

---

### Slice 12: Frontend API Layer
**Files to create:**
- `KACHERI FRONTEND/src/types/knowledge.ts`
- `KACHERI FRONTEND/src/api/knowledge.ts`

**Scope:**
- TypeScript types for all knowledge graph schemas (entities, mentions, relationships, queries, search results)
- API client: knowledgeApi (entities CRUD, merge, relationships, search, related docs, per-doc entities)
- API client: knowledgeAdminApi (index, status, summary)
- Error handling following existing patterns

**Acceptance Criteria:**
- All types match backend schemas
- All API functions implemented
- Error handling works
- No TypeScript errors

---

### Slice 13: Related Documents Panel UI
**Files to create:**
- `KACHERI FRONTEND/src/components/knowledge/RelatedDocsPanel.tsx`
- `KACHERI FRONTEND/src/components/knowledge/RelatedDocCard.tsx`
- `KACHERI FRONTEND/src/components/knowledge/EntityChip.tsx`
- `KACHERI FRONTEND/src/components/knowledge/knowledge.css`
- `KACHERI FRONTEND/src/components/knowledge/index.ts`

**Scope:**
- RelatedDocsPanel: sidebar panel showing docs related to current document
- RelatedDocCard: card with doc title, relevance score, shared entities as chips
- EntityChip: small colored badge for entity type + name (person=blue, org=purple, amount=green, etc.)
- Loading/error/empty states
- "No entities yet — extract document first" empty state
- Click on related doc navigates to that document
- Refresh button

**Acceptance Criteria:**
- Panel displays related documents ranked by relevance
- Shared entities shown as colored chips
- Clicking a related doc navigates to it
- Loading/error/empty states handled
- Looks consistent with other panels

---

### Slice 14: Workspace Knowledge Explorer Page
**Files to create:**
- `KACHERI FRONTEND/src/pages/WorkspaceKnowledgeExplorerPage.tsx`

**Files to modify:**
- `KACHERI FRONTEND/src/App.tsx` (add route)

**Scope:**
- Full-page workspace knowledge graph explorer
- Stats bar: entity count, relationship count, indexed docs, coverage %
- Entity type breakdown (bar or chip counts)
- Filterable entity list (by type, search by name)
- Each entity row: name, type badge, doc count, mention count, last seen
- Click entity → opens entity detail (Slice 16)
- Top entities section (most connected)
- Recent queries section
- "Re-index Workspace" button (admin only)
- Index status indicator
- Route: `/workspaces/:id/knowledge`

**Acceptance Criteria:**
- Page displays workspace knowledge graph stats
- Entity list with filters and search
- Entity type breakdown visible
- Admin-only re-index button
- Route registered and navigable

---

### Slice 15: Semantic Search UI
**Files to create:**
- `KACHERI FRONTEND/src/components/knowledge/SemanticSearchBar.tsx`
- `KACHERI FRONTEND/src/components/knowledge/SearchResultCard.tsx`
- `KACHERI FRONTEND/src/components/knowledge/SearchAnswerPanel.tsx`

**Scope:**
- SemanticSearchBar: text input for natural language queries, with "Ask" button
- SearchAnswerPanel: shows AI-generated answer with citations
- SearchResultCard: individual result with doc title, relevance, snippets with highlights, matched entities
- Loading state with progress animation during AI processing
- Quick search mode (FTS5, fast) vs Semantic search mode (AI, slower)
- Search history (from knowledge_queries)
- Integrated into WorkspaceKnowledgeExplorerPage
- Also accessible as a standalone search bar component for the editor toolbar

**Acceptance Criteria:**
- Can submit natural language queries
- AI answer displayed with citations
- Results show relevant documents with snippets
- Quick search returns fast FTS5 results
- Search history viewable

---

### Slice 16: Entity Detail Modal
**Files to create:**
- `KACHERI FRONTEND/src/components/knowledge/EntityDetailModal.tsx`
- `KACHERI FRONTEND/src/components/knowledge/EntityMentionsList.tsx`
- `KACHERI FRONTEND/src/components/knowledge/EntityRelationshipsList.tsx`

**Scope:**
- EntityDetailModal: full modal showing entity information
  - Header: entity name, type badge, aliases
  - Metadata section (type-specific fields)
  - Mentions tab: list of documents where this entity appears, with context snippets
  - Relationships tab: list of related entities with type, label, strength
  - Stats: mention count, doc count, first/last seen dates
- EntityMentionsList: paginated list of mentions with doc links and context
- EntityRelationshipsList: list of relationships with strength indicators
- Edit entity button (admin only): rename, add aliases, update metadata
- Merge suggestion indicator if duplicates detected
- Click on mentioned doc → navigates to doc

**Acceptance Criteria:**
- Modal shows comprehensive entity information
- Mentions listed with doc links and context
- Relationships shown with strength indicators
- Admin can edit entity details
- Navigation to documents works

---

### Slice 17: Editor Integration
**Files to modify:**
- `KACHERI FRONTEND/src/EditorPage.tsx`

**Scope:**
- Add "Related" tab to right drawer (9th tab)
- Render RelatedDocsPanel in drawer content
- Add "Related" toolbar button
- Add "Find Related Documents" command to command palette
- Add "Search Knowledge" command to command palette (opens semantic search)
- WS event listener for knowledge indexing events
- Show entity count badge on toolbar button when entities exist

**Acceptance Criteria:**
- Panel accessible from editor via tab, toolbar, or command palette
- Auto-loads related docs for current document
- WS events refresh panel on indexing
- Command palette entries work
- Toolbar button shows entity count

---

### Slice 18: Proof Integration
**Files to modify:**
- `KACHERI FRONTEND/src/ProofsPanel.tsx` (add knowledge:search and knowledge:index to filters/formatting)
- `KACHERI FRONTEND/src/utils/tooltipHelpers.ts` (add knowledge tooltips)

**Scope:**
- Semantic search queries create proof records
- Entity indexing tracked in provenance
- ProofsPanel shows knowledge:search events with query + result count
- ProofsPanel shows knowledge:index events with entity/relationship counts
- Tooltip helpers for knowledge proof types

**Acceptance Criteria:**
- Semantic search queries appear in proofs list
- Indexing events appear in provenance
- Rich rendering of knowledge events in ProofsPanel
- Tooltips added

---

### Slice 19: Polish & Edge Cases
**Scope:**
- Large workspace handling (pagination on all entity queries, batch processing for indexing)
- Empty workspace (no extractions yet — guide user to extract documents first)
- Documents without extractions (skip during harvesting, show "Extract first" in related panel)
- Multilingual entity names (normalize Unicode, handle non-Latin scripts)
- FTS5 query sanitization (escape special characters in user input)
- Entity count limits per workspace (configurable, default 10,000)
- Relationship count limits (max 5,000 per workspace)
- Search timeout handling (20s limit, graceful fallback to FTS5 results)
- Indexing progress (WebSocket broadcasts with % complete)
- Stale entity cleanup (entities with 0 mentions after doc deletion)

**Acceptance Criteria:**
- Large workspaces don't crash or timeout
- Empty states guide users appropriately
- Multilingual names handled correctly
- FTS5 queries safe from injection
- Limits enforced with clear error messages
- Stale entities cleaned up

---

### Slice 20: Documentation & Testing
**Files to create:**
- `KACHERI BACKEND/src/knowledge/__tests__/entityHarvester.test.ts`
- `KACHERI BACKEND/src/knowledge/__tests__/entityNormalizer.test.ts`
- `KACHERI BACKEND/src/knowledge/__tests__/relationshipDetector.test.ts`
- `KACHERI BACKEND/src/knowledge/__tests__/ftsSync.test.ts`
- `KACHERI BACKEND/src/store/__tests__/workspaceEntities.test.ts`
- `Docs/features/cross-document-intelligence.md`

**Files to modify:**
- `Docs/API_CONTRACT.md` (final review, add to ToC)

**Scope:**
- Unit tests for entity harvester (mapping extraction types to entities)
- Unit tests for entity normalizer (string similarity, merge logic)
- Unit tests for relationship detector (co-occurrence, strength calculation)
- Unit tests for FTS5 sync (insert, update, delete, query building)
- Store tests for workspace entities CRUD
- User documentation
- API contract finalization

**Acceptance Criteria:**
- All tests pass
- User docs explain feature
- API contract complete and in ToC

---

## Estimated Effort by Slice

| Slice | Description | Effort |
|-------|-------------|--------|
| 1 | Database Schema & Store Layer | 1-2 days |
| 2 | FTS5 Search Index Sync | 1 day |
| 3 | Entity Harvester | 2 days |
| 4 | Entity Normalizer (AI) | 2 days |
| 5 | Relationship Detector | 2 days |
| 6 | Semantic Search Engine | 2-3 days |
| 7 | Related Documents Engine | 1-2 days |
| 8 | API Routes — Entities & Relationships | 2 days |
| 9 | API Routes — Search, Indexing & Summary | 1-2 days |
| 10 | Auto-Index Integration Hook | 0.5 days |
| 11 | Background Indexing Worker | 1-2 days |
| 12 | Frontend API Layer | 0.5 days |
| 13 | Related Documents Panel UI | 2 days |
| 14 | Workspace Knowledge Explorer Page | 2-3 days |
| 15 | Semantic Search UI | 2 days |
| 16 | Entity Detail Modal | 1-2 days |
| 17 | Editor Integration | 1 day |
| 18 | Proof Integration | 0.5 days |
| 19 | Polish & Edge Cases | 2-3 days |
| 20 | Documentation & Testing | 1-2 days |
| **Total** | | **27-38 days** |

---

## Dependencies

| Slice | Depends On |
|-------|------------|
| 2 (FTS5 Sync) | 1 (Database) |
| 3 (Harvester) | 1 (Database) |
| 4 (Normalizer) | 3 (Harvester) |
| 5 (Relationships) | 3 (Harvester) |
| 6 (Semantic Search) | 2 (FTS5), 3 (Harvester) |
| 7 (Related Docs) | 3 (Harvester) |
| 8 (API — Entities) | 1, 3, 4, 5 |
| 9 (API — Search) | 6, 7, 8 |
| 10 (Auto-Index) | 3 (Harvester) |
| 11 (Index Worker) | 3, 4, 5, 10 |
| 12 (Frontend API) | 8, 9 |
| 13-17 (All Frontend UI) | 12 |
| 18 (Proofs) | 9 |
| 19 (Polish) | All above |
| 20 (Docs/Tests) | All above |

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Entity normalization quality | Two-stage: string similarity + AI scoring; manual merge as fallback |
| Semantic search latency (AI calls) | FTS5 pre-filter reduces candidates; 20s timeout with FTS5 fallback |
| Large workspace entity explosion | Configurable limits (10K entities); batch processing with pagination |
| FTS5 query injection | Sanitize all user input before FTS5 MATCH queries |
| Stale entities after doc deletion | Cleanup job removes entities with 0 mentions |
| AI costs for normalization/search | Pre-filters minimize AI calls; rate limiting on search endpoint |
| EditorPage drawer tab bar crowded (9 tabs) | Consider grouping or overflow in future; current layout still fits |
| Relationship graph cycles | No cycle prevention needed — relationships are informational, not navigational |
| SQLite FTS5 limitations | Sufficient for workspace-scale (thousands of docs); can migrate to Elasticsearch later if needed |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Entity harvesting accuracy | > 85% of extraction entities captured |
| Entity normalization dedup rate | > 70% of true duplicates detected |
| Semantic search relevance (top-3) | > 80% of queries return relevant results in top 3 |
| Related documents precision | > 75% of suggested related docs are genuinely related |
| Search response time (semantic) | < 15 seconds |
| Search response time (keyword/FTS5) | < 500ms |
| Entity indexing time per document | < 2 seconds |
| Full workspace re-index time (100 docs) | < 5 minutes |

---

*This document is the authoritative work scope for Cross-Document Intelligence. All implementation must follow these specifications.*
