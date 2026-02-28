-- Migration: extend_memory_graph
-- Version: 013
-- Created: 2026-02-22
-- Purpose: Memory Graph Schema Extension (Platform Slice P1)
--          1. Remove entity_type CHECK on workspace_entities (new types validated at app layer)
--          2. Make doc_id nullable on entity_mentions (non-doc products use source_ref)
--          3. Add product_source and source_ref columns to entity_mentions
--          4. Add index on entity_mentions(product_source)
--          See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice P1
--
-- SQLite does not support ALTER COLUMN or modifying CHECK constraints.
-- Both tables are recreated with data preserved.
-- All existing data is unchanged - no data migration needed.
-- Foreign keys are not enforced in this codebase (no PRAGMA foreign_keys = ON).

-- =============================================================================
-- STEP 1: Recreate workspace_entities without entity_type CHECK
-- The CHECK constraint is removed; validation moves to application layer
-- (VALID_ENTITY_TYPES array in workspaceEntities.ts).
-- This allows new entity types (web_page, research_source, design_asset,
-- event, citation) to be inserted without future schema changes.
-- =============================================================================

ALTER TABLE workspace_entities RENAME TO workspace_entities_old;

CREATE TABLE workspace_entities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,                    -- CHECK removed, validated at app layer
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT,
  mention_count INTEGER NOT NULL DEFAULT 0,
  doc_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

INSERT INTO workspace_entities
SELECT * FROM workspace_entities_old;

-- Drop old indexes (SQLite keeps index names after table rename)
DROP INDEX IF EXISTS idx_ws_entities_workspace;
DROP INDEX IF EXISTS idx_ws_entities_type;
DROP INDEX IF EXISTS idx_ws_entities_normalized;
DROP INDEX IF EXISTS idx_ws_entities_doc_count;

CREATE INDEX idx_ws_entities_workspace ON workspace_entities(workspace_id);
CREATE INDEX idx_ws_entities_type ON workspace_entities(workspace_id, entity_type);
CREATE INDEX idx_ws_entities_normalized ON workspace_entities(workspace_id, normalized_name);
CREATE INDEX idx_ws_entities_doc_count ON workspace_entities(workspace_id, doc_count DESC);

DROP TABLE workspace_entities_old;

-- =============================================================================
-- STEP 2: Recreate entity_mentions with doc_id nullable + new columns
-- doc_id is now nullable for non-doc products (design-studio, research, etc.)
-- product_source tracks which product created this mention
-- source_ref holds the non-doc reference (canvas_id, session_id, etc.)
-- =============================================================================

ALTER TABLE entity_mentions RENAME TO entity_mentions_old;

CREATE TABLE entity_mentions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  doc_id TEXT,                                  -- NOW NULLABLE for non-doc products
  context TEXT,
  field_path TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT 'extraction'
    CHECK (source IN ('extraction', 'manual', 'ai_index')),
  product_source TEXT NOT NULL DEFAULT 'docs'
    CHECK (product_source IN ('docs', 'design-studio', 'research', 'notes', 'sheets')),
  source_ref TEXT,                              -- canvas_id, session_id, etc.
  created_at INTEGER NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES workspace_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);

INSERT INTO entity_mentions (
  id, workspace_id, entity_id, doc_id, context, field_path,
  confidence, source, product_source, source_ref, created_at
)
SELECT
  id, workspace_id, entity_id, doc_id, context, field_path,
  confidence, source, 'docs', NULL, created_at
FROM entity_mentions_old;

-- Drop old indexes (SQLite keeps index names after table rename)
DROP INDEX IF EXISTS idx_mentions_entity;
DROP INDEX IF EXISTS idx_mentions_doc;
DROP INDEX IF EXISTS idx_mentions_workspace;
DROP INDEX IF EXISTS idx_mentions_unique;

CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX idx_mentions_doc ON entity_mentions(doc_id);
CREATE INDEX idx_mentions_workspace ON entity_mentions(workspace_id);
CREATE UNIQUE INDEX idx_mentions_unique ON entity_mentions(entity_id, doc_id, field_path);
CREATE INDEX idx_mentions_product_source ON entity_mentions(product_source);

DROP TABLE entity_mentions_old;

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- To rollback: recreate both tables with original constraints.
-- See migration 008_add_knowledge_graph.sql for original schema.
--
-- ALTER TABLE workspace_entities RENAME TO workspace_entities_old;
-- CREATE TABLE workspace_entities ( ... original with CHECK ... );
-- INSERT INTO workspace_entities SELECT * FROM workspace_entities_old;
-- ... recreate indexes ...
-- DROP TABLE workspace_entities_old;
--
-- ALTER TABLE entity_mentions RENAME TO entity_mentions_old;
-- CREATE TABLE entity_mentions ( ... original with doc_id NOT NULL, no product_source/source_ref ... );
-- INSERT INTO entity_mentions (id, workspace_id, entity_id, doc_id, context, field_path, confidence, source, created_at)
-- SELECT id, workspace_id, entity_id, doc_id, context, field_path, confidence, source, created_at
-- FROM entity_mentions_old;
-- ... recreate indexes ...
-- DROP TABLE entity_mentions_old;
