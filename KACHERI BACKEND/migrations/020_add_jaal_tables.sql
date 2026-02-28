-- Migration: add_jaal_tables
-- Version: 020
-- Created: 2026-02-26
-- Purpose: JAAL Research Browser backend tables for research sessions and
--          cryptographic proof packets. Supports the JAAL backend service
--          module (Slice S5, Phase B).

-- =============================================================================
-- JAAL_SESSIONS TABLE
-- Research session tracking. Each session captures a period of research
-- activity with actions (proofs) linked via jaal_proofs.session_id.
-- =============================================================================
CREATE TABLE IF NOT EXISTS jaal_sessions (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'abandoned')),
  action_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,                         -- JSON: arbitrary session metadata
  started_at INTEGER NOT NULL,                -- unix ms
  ended_at INTEGER,                           -- unix ms, NULL when active
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jaal_sessions_workspace
  ON jaal_sessions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_jaal_sessions_user
  ON jaal_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_jaal_sessions_status
  ON jaal_sessions(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_jaal_sessions_started
  ON jaal_sessions(workspace_id, started_at DESC);

-- =============================================================================
-- JAAL_PROOFS TABLE
-- Proof packets for JAAL actions: summarize, extract_links, compare, capture.
-- Links to sessions when the action occurred during an active research session.
-- =============================================================================
CREATE TABLE IF NOT EXISTS jaal_proofs (
  id TEXT PRIMARY KEY,                        -- crypto.randomUUID()
  session_id TEXT,                            -- nullable: proofs can exist outside sessions
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,                         -- 'summarize', 'extract_links', 'compare', 'capture'
  hash TEXT NOT NULL,                         -- sha256 hex of payload_json
  payload_json TEXT NOT NULL,                 -- full proof packet JSON
  created_at INTEGER NOT NULL,                -- unix ms
  FOREIGN KEY (session_id) REFERENCES jaal_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jaal_proofs_session
  ON jaal_proofs(session_id);

CREATE INDEX IF NOT EXISTS idx_jaal_proofs_workspace
  ON jaal_proofs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_jaal_proofs_kind
  ON jaal_proofs(workspace_id, kind);

CREATE INDEX IF NOT EXISTS idx_jaal_proofs_created
  ON jaal_proofs(workspace_id, created_at DESC);

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_jaal_proofs_created;
-- DROP INDEX IF EXISTS idx_jaal_proofs_kind;
-- DROP INDEX IF EXISTS idx_jaal_proofs_workspace;
-- DROP INDEX IF EXISTS idx_jaal_proofs_session;
-- DROP TABLE IF EXISTS jaal_proofs;
--
-- DROP INDEX IF EXISTS idx_jaal_sessions_started;
-- DROP INDEX IF EXISTS idx_jaal_sessions_status;
-- DROP INDEX IF EXISTS idx_jaal_sessions_user;
-- DROP INDEX IF EXISTS idx_jaal_sessions_workspace;
-- DROP TABLE IF EXISTS jaal_sessions;
