-- Migration: add_compliance
-- Version: 006
-- Created: 2026-02-07
-- Purpose: Compliance Checker - tables for workspace policies and document compliance checks

-- =============================================================================
-- COMPLIANCE_POLICIES TABLE
-- Workspace-level policy definitions that documents are checked against
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance_policies (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,                         -- human-readable policy name
  description TEXT,                           -- what this policy enforces
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'legal', 'financial', 'privacy', 'custom')),
  rule_type TEXT NOT NULL
    CHECK (rule_type IN ('text_match', 'regex_pattern', 'required_section',
                         'forbidden_term', 'numeric_constraint', 'ai_check')),
  rule_config_json TEXT NOT NULL,             -- JSON: rule-specific configuration
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'error')),
  document_types_json TEXT NOT NULL DEFAULT '["all"]', -- which doc types this applies to
  enabled INTEGER NOT NULL DEFAULT 1,         -- 0 = disabled, 1 = enabled
  auto_check Integer NOT NULL DEFAULT 1,     -- 1 = check on save, 0 = manual only
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  updated_at INTEGER NOT NULL,                -- Unix timestamp ms
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_compliance_policies_workspace
  ON compliance_policies(workspace_id);

CREATE INDEX IF NOT EXISTS idx_compliance_policies_category
  ON compliance_policies(category);

-- Composite index for fetching enabled policies by workspace
CREATE INDEX IF NOT EXISTS idx_compliance_policies_active
  ON compliance_policies(workspace_id, enabled)
  WHERE enabled = 1;

-- =============================================================================
-- COMPLIANCE_CHECKS TABLE
-- Results of running compliance checks against a document
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance_checks (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'passed', 'failed', 'error')),
  total_policies INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  warnings INTEGER NOT NULL DEFAULT 0,
  violations INTEGER NOT NULL DEFAULT 0,
  results_json TEXT,                          -- JSON: per-policy results array
  proof_id INTEGER,
  triggered_by TEXT NOT NULL
    CHECK (triggered_by IN ('manual', 'auto_save', 'pre_export')),
  checked_by TEXT NOT NULL,                   -- user who triggered
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  completed_at INTEGER,                       -- Unix timestamp ms
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_doc
  ON compliance_checks(doc_id);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_workspace
  ON compliance_checks(workspace_id);

-- Composite index for fetching latest check per document
CREATE INDEX IF NOT EXISTS idx_compliance_checks_doc_latest
  ON compliance_checks(doc_id, created_at DESC);

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_compliance_checks_doc_latest;
-- DROP INDEX IF EXISTS idx_compliance_checks_workspace;
-- DROP INDEX IF EXISTS idx_compliance_checks_doc;
-- DROP TABLE IF EXISTS compliance_checks;

-- DROP INDEX IF EXISTS idx_compliance_policies_active;
-- DROP INDEX IF EXISTS idx_compliance_policies_category;
-- DROP INDEX IF EXISTS idx_compliance_policies_workspace;
-- DROP TABLE IF EXISTS compliance_policies;
