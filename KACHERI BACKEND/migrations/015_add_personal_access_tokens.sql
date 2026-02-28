-- Migration: add_personal_access_tokens
-- Version: 015
-- Created: 2026-02-22
-- Purpose: Create personal_access_tokens table for external client authentication.
--          PATs allow API access for scripts, integrations, and external apps (e.g. JAAL).
--          Part of Phase 1, Slice P4 — Personal Access Tokens for External Clients.

-- =============================================================================
-- PERSONAL_ACCESS_TOKENS TABLE
-- Workspace-scoped bearer tokens for external API clients.
-- Token format: bpat_<nanoid(32)> — stored as SHA256 hash (never plaintext).
-- Max 10 active tokens per user.
-- =============================================================================
CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id TEXT PRIMARY KEY,                    -- pat_<nanoid(12)>
  user_id TEXT NOT NULL,                  -- owner of the token
  workspace_id TEXT NOT NULL,             -- workspace this token is scoped to
  name TEXT NOT NULL,                     -- human-readable label (max 100 chars)
  token_hash TEXT UNIQUE NOT NULL,        -- SHA256 hash of the raw token
  scopes TEXT,                            -- comma-separated scope strings, NULL = unrestricted
  expires_at INTEGER,                     -- unix timestamp (seconds), NULL = no expiry
  last_used_at INTEGER,                   -- unix timestamp (seconds), updated on each use
  created_at INTEGER NOT NULL,            -- unix timestamp (seconds)
  revoked_at INTEGER,                     -- unix timestamp (seconds), NULL = active
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Index for listing tokens by user
CREATE INDEX IF NOT EXISTS idx_pat_user
  ON personal_access_tokens(user_id);

-- Index for listing tokens by user + workspace
CREATE INDEX IF NOT EXISTS idx_pat_workspace
  ON personal_access_tokens(user_id, workspace_id);

-- Index for auth middleware hot path: lookup by token hash
CREATE INDEX IF NOT EXISTS idx_pat_token_hash
  ON personal_access_tokens(token_hash);

-- Partial index for counting active (non-revoked) tokens per user
CREATE INDEX IF NOT EXISTS idx_pat_active
  ON personal_access_tokens(user_id, revoked_at)
  WHERE revoked_at IS NULL;

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_pat_active;
-- DROP INDEX IF EXISTS idx_pat_token_hash;
-- DROP INDEX IF EXISTS idx_pat_workspace;
-- DROP INDEX IF EXISTS idx_pat_user;
-- DROP TABLE IF EXISTS personal_access_tokens;
