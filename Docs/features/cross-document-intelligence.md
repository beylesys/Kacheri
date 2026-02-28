# Cross-Document Intelligence

Cross-Document Intelligence automatically harvests entities from your documents, builds a workspace-wide knowledge graph, and enables natural language search across all your content — with full proof integration.

---

## Overview

When documents are extracted via Document Intelligence, Kacheri automatically:

1. **Harvests entities** (people, organizations, dates, amounts, locations, products, terms, concepts) from extraction data
2. **Normalizes entities** across documents — deduplicating "Acme Corp" / "Acme Corporation" / "ACME" into a single canonical entity
3. **Detects relationships** between entities that co-occur across documents
4. **Indexes content** for full-text keyword search via SQLite FTS5
5. **Enables semantic search** — ask natural language questions and get AI-generated answers with document citations
6. **Surfaces related documents** via shared entities

---

## Core Capabilities

### Entity Harvesting

Entities are automatically extracted from Document Intelligence extraction data when you import or extract a document. Supported entity types:

| Entity Type | Color | Examples |
|-------------|-------|---------|
| Person | Blue | John Smith, Jane Doe |
| Organization | Purple | Acme Corp, Beyle Inc |
| Date | Amber | 2026-01-15, Effective Date |
| Amount | Green | $150,000, Net-30 |
| Location | Red | New York, State of Delaware |
| Product | Teal | Software License, Consulting Services |
| Term | Gray | Termination Clause, Force Majeure |
| Concept | Indigo | Liability, Intellectual Property |

Entity harvesting maps extraction fields to entity types automatically:
- Contract: parties, dates, amounts, governing law, obligations, signatures
- Invoice: vendor, customer, line items, amounts, dates
- Proposal: vendor, client, deliverables, pricing, timeline
- Meeting Notes: attendees, action items, discussions
- Report: author, metrics, risks, findings

### Entity Normalization

Duplicate entities are detected using a two-stage pipeline:
1. **String similarity pre-filter** — Levenshtein distance and Jaccard keyword overlap identify candidate pairs
2. **AI comparison** — For ambiguous cases, AI evaluates whether two entities are the same, scoring confidence 0-100

High-confidence duplicates (score >= 90) are auto-merged. Lower-confidence suggestions are presented for manual review. Merged entities preserve all aliases and consolidate mentions.

### Relationship Detection

Relationships between entities are created automatically:
- **Co-occurrence** — Entities appearing in the same document get a baseline relationship
- **AI-labeled** — For entity pairs sharing 2+ documents, AI labels the relationship type (contractual, financial, organizational, temporal, custom)
- **Strength scoring** — Based on co-occurrence frequency (40%) and AI confidence (60%)
- **Evidence tracking** — Each relationship records which documents support it

### Full-Text Search (FTS5)

SQLite FTS5 provides instant keyword search across:
- Document titles and content
- Entity names and aliases

Results are ranked by BM25 relevance with highlighted snippet extraction.

### Semantic Search

Ask natural language questions like "What are our payment terms with Acme Corp?" and get:
- An AI-generated answer with document citations
- Ranked results with relevance scores
- Matched entity highlights
- Context snippets from source documents

The pipeline: extract search terms (AI) → FTS5 candidate search → gather context → AI synthesis with citations.

### Related Documents

For any document, see other documents that share entities with it. Related documents are ranked by:
- Number of shared entities
- Entity importance (entities appearing in fewer documents score higher)
- Optional AI re-ranking for top candidates

---

## User Workflows

### Exploring the Knowledge Graph

Navigate to the **Workspace Knowledge Explorer** page:

1. Open the workspace sidebar and click **Knowledge** (or navigate to `/workspaces/:id/knowledge`)
2. View the dashboard: entity count, relationships, indexed documents, coverage percentage
3. Browse entity type breakdown (clickable chips to filter by type)
4. See top entities (most connected) and recent queries
5. Search, filter, and sort the full entity list

### Searching Across Documents

From the Knowledge Explorer page:

**Keyword Search (Quick):**
- Toggle to "Quick" mode in the search bar
- Type a keyword and press Enter or click "Search"
- Instant FTS5 results: matching entities and documents with highlighted snippets

**Semantic Search (AI-Powered):**
- Toggle to "Semantic" mode in the search bar
- Type a natural language question and press Enter or click "Ask"
- AI generates an answer with `[Doc N]` citation badges linking to source documents
- Below the answer, ranked result cards show documents with relevance scores, snippets, and matched entities

### Viewing Related Documents

From the editor sidebar:

1. Open the **Related** tab in the right drawer (9th tab)
2. Or click the **Related** button in the toolbar (shows entity count badge)
3. Or use the command palette (Ctrl/Cmd+K) and select **Find Related Documents**

The panel shows documents related to the current document, ranked by shared entity overlap. Each card shows:
- Document title (click to navigate)
- Relevance percentage
- Shared entity chips (colored by type)

### Entity Detail

Click any entity in the Knowledge Explorer to open the detail modal:

- **Header:** Entity name, type badge, aliases
- **Stats:** Mention count, document count, first/last seen dates
- **Metadata:** Type-specific fields (e.g., title/organization for a person, address/industry for an organization)
- **Mentions tab:** Paginated list of documents where this entity appears, with context snippets and confidence badges
- **Relationships tab:** Related entities with type, label, strength bar, and evidence count

Click a related entity to navigate to it within the same modal.

### Managing Entities (Admin Only)

Workspace admins can:

- **Edit entity:** Click the edit button in the entity detail modal to update name, aliases, or metadata
- **Merge duplicates:** Select entities on the Knowledge Explorer and merge them — all mentions are consolidated under the canonical entity
- **Delete entities:** Remove stale or incorrect entities
- **Re-index workspace:** Click "Re-index Workspace" to trigger a full entity harvesting, normalization, and relationship detection pass
- **Clean up stale entities:** Remove entities with zero mentions

### Re-indexing

When you need to rebuild the knowledge graph:

1. Navigate to the Knowledge Explorer page
2. Click **Re-index Workspace** (admin only)
3. A background job processes all documents:
   - Harvests entities from extraction data
   - Cleans up stale entities (0 mentions)
   - Runs AI-assisted normalization (dedup detection)
   - Detects relationships between entities
   - Rebuilds FTS5 search indexes
4. Progress is displayed in real-time via WebSocket (percentage + current stage)

Incremental mode only processes documents modified since the last index.

---

## Proof Integration

All AI-powered operations create verifiable proof records:

- **knowledge:search** — Semantic search queries are proofed with query text, result count, duration, and proof hash
- **knowledge:index** — Workspace indexing events are proofed with mode, document count, entity/relationship counts, and error summary

View these in the **Proofs & Activity** panel:
- Filter by "Knowledge Search" or "Knowledge Index"
- Each event shows structured details (query, results, duration for searches; mode, counts, errors for indexing)

---

## API Reference

See [API_CONTRACT.md](../API_CONTRACT.md) for full endpoint documentation:

- `GET /workspaces/:wid/knowledge/entities` — List entities (paginated, filterable)
- `GET /workspaces/:wid/knowledge/entities/:eid` — Entity detail with mentions and relationships
- `PATCH /workspaces/:wid/knowledge/entities/:eid` — Update entity (admin)
- `DELETE /workspaces/:wid/knowledge/entities/:eid` — Delete entity (admin)
- `POST /workspaces/:wid/knowledge/entities/merge` — Merge duplicate entities (admin)
- `GET /workspaces/:wid/knowledge/relationships` — List relationships (filterable)
- `GET /docs/:id/entities` — Entities in a document
- `GET /docs/:id/related` — Related documents via shared entities
- `POST /workspaces/:wid/knowledge/search` — Semantic search (AI-powered)
- `GET /workspaces/:wid/knowledge/search?q=term` — Keyword search (FTS5)
- `POST /workspaces/:wid/knowledge/index` — Trigger workspace re-index (admin)
- `GET /workspaces/:wid/knowledge/status` — Index status
- `GET /workspaces/:wid/knowledge/summary` — Dashboard summary stats
- `POST /workspaces/:wid/knowledge/cleanup` — Clean up stale entities (admin)

---

## Technical Notes

- Entity harvesting runs automatically after document extraction (non-blocking — extraction succeeds even if harvesting fails)
- FTS5 indexes are updated on document import and extraction
- Semantic search has a 20-second timeout; on timeout, falls back to FTS5 keyword results
- Semantic search is rate-limited (matches AI compose rate limits)
- Entity normalization compares within same entity type only (person vs person, org vs org)
- Normalizer caps at 500 entities per type for comparison (top by mention count) to bound processing time
- Workspace limits: 10,000 entities, 5,000 relationships (configurable via `KACHERI_ENTITY_LIMIT` and `KACHERI_RELATIONSHIP_LIMIT` environment variables)
- FTS5 query input is sanitized to prevent operator injection
- Stale entities (0 mentions after document deletion) are cleaned up during re-indexing and via manual cleanup endpoint
- All entity names are Unicode NFC-normalized for consistent deduplication across character compositions
