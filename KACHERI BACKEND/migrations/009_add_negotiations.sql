-- Migration: add_negotiations
-- Version: 009
-- Created: 2026-02-09
-- Purpose: Redline / Negotiation AI - tables for negotiation sessions,
--          rounds, changes, and counterproposals

-- =============================================================================
-- NEGOTIATION_SESSIONS TABLE
-- Top-level negotiation tracking. One session per document per counterparty.
-- =============================================================================
CREATE TABLE IF NOT EXISTS negotiation_sessions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,                        -- "Acme Corp — Services Agreement Negotiation"
  counterparty_name TEXT NOT NULL,            -- "Acme Corp Legal Team"
  counterparty_label TEXT,                    -- "External Counsel" / "Procurement"
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'awaiting_response', 'reviewing', 'settled', 'abandoned')),
  current_round INTEGER NOT NULL DEFAULT 0,
  total_changes INTEGER NOT NULL DEFAULT 0,
  accepted_changes INTEGER NOT NULL DEFAULT 0,
  rejected_changes INTEGER NOT NULL DEFAULT 0,
  pending_changes INTEGER NOT NULL DEFAULT 0,
  started_by TEXT NOT NULL,                   -- user who created the session
  settled_at INTEGER,                         -- timestamp when settled
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_neg_sessions_doc
  ON negotiation_sessions(doc_id);

CREATE INDEX IF NOT EXISTS idx_neg_sessions_workspace
  ON negotiation_sessions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_neg_sessions_status
  ON negotiation_sessions(workspace_id, status);

-- =============================================================================
-- NEGOTIATION_ROUNDS TABLE
-- Individual rounds within a negotiation. Each round is a snapshot of proposals.
-- =============================================================================
CREATE TABLE IF NOT EXISTS negotiation_rounds (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  session_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  round_type TEXT NOT NULL
    CHECK (round_type IN ('initial_proposal', 'counterproposal', 'revision', 'final')),
  proposed_by TEXT NOT NULL,                  -- 'internal' or 'external'
  proposer_label TEXT,                        -- "John Smith" or "Acme Legal"
  snapshot_html TEXT NOT NULL,                -- full document HTML at this round
  snapshot_text TEXT NOT NULL,                -- plain text for diff/comparison
  snapshot_hash TEXT NOT NULL,                -- sha256 of snapshot_html
  version_id TEXT,                            -- FK to version history (auto-created snapshot)
  import_source TEXT,                         -- 'upload:docx', 'upload:pdf', 'manual', 'ai:counterproposal'
  notes TEXT,                                 -- round-level notes ("Initial draft sent Jan 15")
  change_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES negotiation_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_neg_rounds_session
  ON negotiation_rounds(session_id);

CREATE INDEX IF NOT EXISTS idx_neg_rounds_number
  ON negotiation_rounds(session_id, round_number);

-- =============================================================================
-- NEGOTIATION_CHANGES TABLE
-- Individual changes detected between rounds. Links to suggestions system.
-- =============================================================================
CREATE TABLE IF NOT EXISTS negotiation_changes (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  session_id TEXT NOT NULL,
  round_id TEXT NOT NULL,                     -- the round that introduced this change
  change_type TEXT NOT NULL
    CHECK (change_type IN ('insert', 'delete', 'replace')),
  category TEXT NOT NULL DEFAULT 'editorial'
    CHECK (category IN ('substantive', 'editorial', 'structural')),
  section_heading TEXT,                       -- nearest heading for navigation
  original_text TEXT,                         -- text from previous round
  proposed_text TEXT,                         -- text in this round
  from_pos INTEGER NOT NULL,                  -- position in previous round's text
  to_pos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'countered')),
  suggestion_id INTEGER,                      -- FK to suggestions table (if converted)
  risk_level TEXT
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  ai_analysis_json TEXT,                      -- JSON: AI analysis result
  resolved_by TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES negotiation_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (round_id) REFERENCES negotiation_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_neg_changes_session
  ON negotiation_changes(session_id);

CREATE INDEX IF NOT EXISTS idx_neg_changes_round
  ON negotiation_changes(round_id);

CREATE INDEX IF NOT EXISTS idx_neg_changes_status
  ON negotiation_changes(session_id, status);

CREATE INDEX IF NOT EXISTS idx_neg_changes_risk
  ON negotiation_changes(session_id, risk_level);

-- =============================================================================
-- NEGOTIATION_COUNTERPROPOSALS TABLE
-- AI-generated counterproposal alternatives for specific changes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS negotiation_counterproposals (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  change_id TEXT NOT NULL,
  mode TEXT NOT NULL
    CHECK (mode IN ('balanced', 'favorable', 'minimal_change')),
  proposed_text TEXT NOT NULL,                -- the AI-generated alternative
  rationale TEXT NOT NULL,                    -- why this compromise works
  clause_id TEXT,                             -- FK to clause library if based on standard clause
  proof_id TEXT,                              -- FK to proofs (AI generation proof)
  accepted INTEGER NOT NULL DEFAULT 0,        -- 0 = suggested, 1 = accepted by user
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (change_id) REFERENCES negotiation_changes(id) ON DELETE CASCADE,
  FOREIGN KEY (clause_id) REFERENCES clauses(id) ON DELETE SET NULL,
  FOREIGN KEY (proof_id) REFERENCES proofs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_neg_cp_change
  ON negotiation_counterproposals(change_id);

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_neg_cp_change;
-- DROP TABLE IF EXISTS negotiation_counterproposals;

-- DROP INDEX IF EXISTS idx_neg_changes_risk;
-- DROP INDEX IF EXISTS idx_neg_changes_status;
-- DROP INDEX IF EXISTS idx_neg_changes_round;
-- DROP INDEX IF EXISTS idx_neg_changes_session;
-- DROP TABLE IF EXISTS negotiation_changes;

-- DROP INDEX IF EXISTS idx_neg_rounds_number;
-- DROP INDEX IF EXISTS idx_neg_rounds_session;
-- DROP TABLE IF EXISTS negotiation_rounds;

-- DROP INDEX IF EXISTS idx_neg_sessions_status;
-- DROP INDEX IF EXISTS idx_neg_sessions_workspace;
-- DROP INDEX IF EXISTS idx_neg_sessions_doc;
-- DROP TABLE IF EXISTS negotiation_sessions;
