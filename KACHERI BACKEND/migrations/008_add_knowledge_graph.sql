-- Migration: add_knowledge_graph
-- Version: 008
-- Created: 2026-02-08
-- Purpose: Cross-Document Intelligence - tables for knowledge graph entities,
--          mentions, relationships, queries, and FTS5 search indexes

-- =============================================================================
-- WORKSPACE_ENTITIES TABLE
-- Canonical, deduplicated entities at workspace level (the "nodes" of the graph)
-- =============================================================================
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

CREATE INDEX IF NOT EXISTS idx_ws_entities_workspace
  ON workspace_entities(workspace_id);

CREATE INDEX IF NOT EXISTS idx_ws_entities_type
  ON workspace_entities(workspace_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_ws_entities_normalized
  ON workspace_entities(workspace_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_ws_entities_doc_count
  ON workspace_entities(workspace_id, doc_count DESC);

-- =============================================================================
-- ENTITY_MENTIONS TABLE
-- Occurrences of entities in specific documents (edges from entities to documents)
-- =============================================================================
CREATE TABLE IF NOT EXISTS entity_mentions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,                    -- FK to workspace_entities
  doc_id TEXT NOT NULL,
  context TEXT,                               -- surrounding sentence for citation
  field_path TEXT,                            -- extraction field origin (e.g., "parties[0].name")
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'extraction'
    CHECK (source IN ('extraction', 'manual', 'ai_index')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES workspace_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mentions_entity
  ON entity_mentions(entity_id);

CREATE INDEX IF NOT EXISTS idx_mentions_doc
  ON entity_mentions(doc_id);

CREATE INDEX IF NOT EXISTS idx_mentions_workspace
  ON entity_mentions(workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mentions_unique
  ON entity_mentions(entity_id, doc_id, field_path);

-- =============================================================================
-- ENTITY_RELATIONSHIPS TABLE
-- Relationships between entities (edges between nodes in the graph)
-- =============================================================================
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

CREATE INDEX IF NOT EXISTS idx_rel_from
  ON entity_relationships(from_entity_id);

CREATE INDEX IF NOT EXISTS idx_rel_to
  ON entity_relationships(to_entity_id);

CREATE INDEX IF NOT EXISTS idx_rel_workspace
  ON entity_relationships(workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_pair
  ON entity_relationships(from_entity_id, to_entity_id, relationship_type);

-- =============================================================================
-- KNOWLEDGE_QUERIES TABLE
-- Log of semantic search queries for provenance and audit
-- =============================================================================
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

CREATE INDEX IF NOT EXISTS idx_kq_workspace
  ON knowledge_queries(workspace_id);

CREATE INDEX IF NOT EXISTS idx_kq_type
  ON knowledge_queries(query_type);

CREATE INDEX IF NOT EXISTS idx_kq_created
  ON knowledge_queries(created_at DESC);

-- =============================================================================
-- FTS5 VIRTUAL TABLES
-- Full-text search indexes using SQLite's built-in FTS5 (no external dependency)
-- =============================================================================

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

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS entities_fts;
-- DROP TABLE IF EXISTS docs_fts;

-- DROP INDEX IF EXISTS idx_kq_created;
-- DROP INDEX IF EXISTS idx_kq_type;
-- DROP INDEX IF EXISTS idx_kq_workspace;
-- DROP TABLE IF EXISTS knowledge_queries;

-- DROP INDEX IF EXISTS idx_rel_pair;
-- DROP INDEX IF EXISTS idx_rel_workspace;
-- DROP INDEX IF EXISTS idx_rel_to;
-- DROP INDEX IF EXISTS idx_rel_from;
-- DROP TABLE IF EXISTS entity_relationships;

-- DROP INDEX IF EXISTS idx_mentions_unique;
-- DROP INDEX IF EXISTS idx_mentions_workspace;
-- DROP INDEX IF EXISTS idx_mentions_doc;
-- DROP INDEX IF EXISTS idx_mentions_entity;
-- DROP TABLE IF EXISTS entity_mentions;

-- DROP INDEX IF EXISTS idx_ws_entities_doc_count;
-- DROP INDEX IF EXISTS idx_ws_entities_normalized;
-- DROP INDEX IF EXISTS idx_ws_entities_type;
-- DROP INDEX IF EXISTS idx_ws_entities_workspace;
-- DROP TABLE IF EXISTS workspace_entities;
