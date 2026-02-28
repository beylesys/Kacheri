-- Migration: 018_add_workspace_embed_whitelist
-- Created: 2026-02-24
-- Purpose: Per-workspace external embed domain whitelist for Slice E7
-- See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice E7

-- Stores workspace-level custom embed domain whitelist.
-- One row per workspace, lazy-initialized on first PUT.
-- domains_json holds a JSON array of custom domain strings
-- (e.g. '["example.com","custom-video.io"]').
-- The default whitelist (YouTube, Vimeo, Google Maps, Codepen, Loom)
-- is defined in code; this table only stores workspace-specific additions.

CREATE TABLE IF NOT EXISTS workspace_embed_whitelist (
  workspace_id TEXT PRIMARY KEY,
  domains_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
