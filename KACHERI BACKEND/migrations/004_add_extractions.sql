-- Migration: add_extractions
-- Version: 004
-- Created: 2026-02-05
-- Purpose: Document Intelligence - tables for AI extraction, corrections, actions, and workspace standards

-- =============================================================================
-- EXTRACTIONS TABLE
-- Stores structured data extracted from documents via AI
-- =============================================================================
CREATE TABLE IF NOT EXISTS extractions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  doc_id TEXT NOT NULL UNIQUE,                -- one extraction per document
  document_type TEXT NOT NULL,                -- contract, invoice, proposal, meeting_notes, report, other
  type_confidence REAL NOT NULL,              -- 0.0 to 1.0
  extraction_json TEXT NOT NULL,              -- JSON: extracted structured data
  field_confidences_json TEXT,                -- JSON: per-field confidence scores
  anomalies_json TEXT,                        -- JSON: detected anomalies array
  proof_id INTEGER,                           -- link to proof record
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  updated_at INTEGER NOT NULL,                -- Unix timestamp ms
  created_by TEXT,                            -- user who triggered extraction
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (proof_id) REFERENCES proofs(id)
);

CREATE INDEX IF NOT EXISTS idx_extractions_doc ON extractions(doc_id);
CREATE INDEX IF NOT EXISTS idx_extractions_type ON extractions(document_type);

-- =============================================================================
-- EXTRACTION_CORRECTIONS TABLE
-- Tracks manual corrections to extracted fields
-- =============================================================================
CREATE TABLE IF NOT EXISTS extraction_corrections (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  extraction_id TEXT NOT NULL,                -- parent extraction
  field_path TEXT NOT NULL,                   -- dot-notation path e.g. "paymentTerms.netDays"
  old_value TEXT,                             -- previous value (JSON stringified)
  new_value TEXT,                             -- corrected value (JSON stringified)
  corrected_by TEXT NOT NULL,                 -- user who made correction
  corrected_at INTEGER NOT NULL,              -- Unix timestamp ms
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_corrections_extraction ON extraction_corrections(extraction_id);

-- =============================================================================
-- EXTRACTION_ACTIONS TABLE
-- Actions created from extractions (reminders, flags, exports)
-- =============================================================================
CREATE TABLE IF NOT EXISTS extraction_actions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  extraction_id TEXT NOT NULL,                -- parent extraction
  action_type TEXT NOT NULL CHECK (action_type IN ('reminder', 'flag_review', 'export', 'compare')),
  field_path TEXT,                            -- field this action relates to
  config_json TEXT,                           -- JSON: action-specific configuration
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled')),
  scheduled_for INTEGER,                      -- Unix timestamp ms for when action should trigger
  completed_at INTEGER,                       -- Unix timestamp ms when action completed
  created_by TEXT NOT NULL,                   -- user who created action
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_actions_extraction ON extraction_actions(extraction_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON extraction_actions(status);
CREATE INDEX IF NOT EXISTS idx_actions_scheduled ON extraction_actions(scheduled_for);

-- Composite index for fetching pending reminders
CREATE INDEX IF NOT EXISTS idx_actions_pending_reminders ON extraction_actions(action_type, status, scheduled_for)
  WHERE action_type = 'reminder' AND status IN ('pending', 'scheduled');

-- =============================================================================
-- WORKSPACE_EXTRACTION_STANDARDS TABLE
-- Custom anomaly detection rules per workspace
-- =============================================================================
CREATE TABLE IF NOT EXISTS workspace_extraction_standards (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,                 -- parent workspace
  document_type TEXT NOT NULL,                -- which doc type this rule applies to
  rule_type TEXT NOT NULL CHECK (rule_type IN ('required_field', 'value_range', 'comparison', 'custom')),
  rule_config_json TEXT NOT NULL,             -- JSON: rule configuration
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  enabled INTEGER NOT NULL DEFAULT 1,         -- 0 = disabled, 1 = enabled
  created_by TEXT NOT NULL,                   -- user who created rule
  created_at INTEGER NOT NULL,                -- Unix timestamp ms
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_standards_workspace ON workspace_extraction_standards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_standards_doctype ON workspace_extraction_standards(document_type);

-- Composite index for fetching enabled rules by workspace and doc type
CREATE INDEX IF NOT EXISTS idx_standards_active ON workspace_extraction_standards(workspace_id, document_type, enabled)
  WHERE enabled = 1;

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_standards_active;
-- DROP INDEX IF EXISTS idx_standards_doctype;
-- DROP INDEX IF EXISTS idx_standards_workspace;
-- DROP TABLE IF EXISTS workspace_extraction_standards;

-- DROP INDEX IF EXISTS idx_actions_pending_reminders;
-- DROP INDEX IF EXISTS idx_actions_scheduled;
-- DROP INDEX IF EXISTS idx_actions_status;
-- DROP INDEX IF EXISTS idx_actions_extraction;
-- DROP TABLE IF EXISTS extraction_actions;

-- DROP INDEX IF EXISTS idx_corrections_extraction;
-- DROP TABLE IF EXISTS extraction_corrections;

-- DROP INDEX IF EXISTS idx_extractions_type;
-- DROP INDEX IF EXISTS idx_extractions_doc;
-- DROP TABLE IF EXISTS extractions;
