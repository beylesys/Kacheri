-- Migration: add_clauses
-- Version: 007
-- Created: 2026-02-08
-- Purpose: Clause Library - tables for workspace clauses, versions, and usage tracking

-- =============================================================================
-- CLAUSES TABLE
-- Workspace-scoped reusable content blocks
-- =============================================================================
CREATE TABLE IF NOT EXISTS clauses (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_html TEXT NOT NULL,                 -- Tiptap HTML content
  content_text TEXT NOT NULL,                 -- Plain text for search/AI comparison
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'legal', 'financial', 'boilerplate', 'custom')),
  tags_json TEXT DEFAULT '[]',                -- JSON string array for filtering
  language TEXT DEFAULT 'en',
  version INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,     -- 0 = active, 1 = archived (soft delete)
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  updated_at INTEGER NOT NULL,                -- Unix timestamp ms
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clauses_workspace
  ON clauses(workspace_id);

CREATE INDEX IF NOT EXISTS idx_clauses_category
  ON clauses(category);

-- Composite index for fetching active clauses by workspace
CREATE INDEX IF NOT EXISTS idx_clauses_workspace_active
  ON clauses(workspace_id, is_archived)
  WHERE is_archived = 0;

-- =============================================================================
-- CLAUSE_VERSIONS TABLE
-- Version history for clause content changes
-- =============================================================================
CREATE TABLE IF NOT EXISTS clause_versions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  clause_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_html TEXT NOT NULL,
  content_text TEXT NOT NULL,
  change_note TEXT,                           -- "Updated liability cap from $1M to $2M"
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  FOREIGN KEY (clause_id) REFERENCES clauses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clause_versions_clause
  ON clause_versions(clause_id);

-- Composite index for fetching versions by clause in order
CREATE INDEX IF NOT EXISTS idx_clause_versions_clause_version
  ON clause_versions(clause_id, version DESC);

-- =============================================================================
-- CLAUSE_USAGE_LOG TABLE
-- Tracks where and when clauses are inserted for analytics and provenance
-- =============================================================================
CREATE TABLE IF NOT EXISTS clause_usage_log (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  clause_id TEXT NOT NULL,
  clause_version INTEGER NOT NULL,
  doc_id TEXT NOT NULL,
  inserted_by TEXT NOT NULL,
  insertion_method TEXT NOT NULL
    CHECK (insertion_method IN ('manual', 'ai_suggest', 'template')),
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  FOREIGN KEY (clause_id) REFERENCES clauses(id) ON DELETE SET NULL,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clause_usage_log_clause
  ON clause_usage_log(clause_id);

CREATE INDEX IF NOT EXISTS idx_clause_usage_log_doc
  ON clause_usage_log(doc_id);

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_clause_usage_log_doc;
-- DROP INDEX IF EXISTS idx_clause_usage_log_clause;
-- DROP TABLE IF EXISTS clause_usage_log;

-- DROP INDEX IF EXISTS idx_clause_versions_clause_version;
-- DROP INDEX IF EXISTS idx_clause_versions_clause;
-- DROP TABLE IF EXISTS clause_versions;

-- DROP INDEX IF EXISTS idx_clauses_workspace_active;
-- DROP INDEX IF EXISTS idx_clauses_category;
-- DROP INDEX IF EXISTS idx_clauses_workspace;
-- DROP TABLE IF EXISTS clauses;
