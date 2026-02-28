-- Migration: add_design_studio
-- Version: 014
-- Created: 2026-02-22
-- Purpose: Create Design Studio tables (canvases, frames, conversations, versions,
--          exports, assets, templates, permissions) and FTS5 search index.
--          Part of Phase 1 (Slice A1) of the BEYLE Platform Unified Roadmap.
--          See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A1
--
-- Tables created: 8 + 1 FTS5 virtual table
-- No foreign keys to Docs-specific tables (product modularity).
-- All child tables use ON DELETE CASCADE from canvases.

-- =============================================================================
-- CANVASES — Top-level canvas container
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Canvas',
  description TEXT,
  workspace_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  composition_mode TEXT NOT NULL DEFAULT 'deck'
    CHECK (composition_mode IN ('deck', 'page', 'notebook', 'widget')),
  theme_json TEXT,
  kcl_version TEXT NOT NULL DEFAULT '1.0.0',
  is_locked INTEGER NOT NULL DEFAULT 0,
  locked_by TEXT,
  locked_at INTEGER,
  workspace_access TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_canvases_workspace
  ON canvases(workspace_id);

CREATE INDEX IF NOT EXISTS idx_canvases_workspace_active
  ON canvases(workspace_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canvases_updated
  ON canvases(updated_at DESC);

-- =============================================================================
-- CANVAS_FRAMES — Individual frames within a canvas
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvas_frames (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  title TEXT,
  code TEXT NOT NULL DEFAULT '',
  code_hash TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  speaker_notes TEXT,
  thumbnail_url TEXT,
  duration_ms INTEGER DEFAULT 5000,
  transition TEXT DEFAULT 'fade',
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_frames_canvas
  ON canvas_frames(canvas_id);

CREATE INDEX IF NOT EXISTS idx_canvas_frames_canvas_order
  ON canvas_frames(canvas_id, sort_order);

-- =============================================================================
-- CANVAS_CONVERSATIONS — Per-canvas AI conversation history
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvas_conversations (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  frame_id TEXT,
  role TEXT NOT NULL
    CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  action_type TEXT
    CHECK (action_type IS NULL OR action_type IN ('generate', 'edit', 'style', 'content', 'compose')),
  doc_refs_json TEXT,
  proof_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_conv_canvas
  ON canvas_conversations(canvas_id, created_at);

CREATE INDEX IF NOT EXISTS idx_canvas_conv_frame
  ON canvas_conversations(frame_id)
  WHERE frame_id IS NOT NULL;

-- =============================================================================
-- CANVAS_VERSIONS — Named version snapshots
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvas_versions (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_versions_canvas
  ON canvas_versions(canvas_id, created_at DESC);

-- =============================================================================
-- CANVAS_EXPORTS — Export history with proof records
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvas_exports (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  format TEXT NOT NULL
    CHECK (format IN ('pdf', 'pptx', 'html_bundle', 'html_standalone', 'png', 'svg', 'embed', 'mp4')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_path TEXT,
  file_size INTEGER,
  proof_id TEXT,
  error_message TEXT,
  metadata_json TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_exports_canvas
  ON canvas_exports(canvas_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canvas_exports_status
  ON canvas_exports(canvas_id, status);

-- =============================================================================
-- CANVAS_ASSETS — Generated/uploaded images, fonts, and other assets
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvas_assets (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  asset_type TEXT NOT NULL
    CHECK (asset_type IN ('image', 'font', 'icon', 'video', 'audio', 'other')),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'ai_generated', 'external')),
  proof_id TEXT,
  metadata_json TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_assets_canvas
  ON canvas_assets(canvas_id);

CREATE INDEX IF NOT EXISTS idx_canvas_assets_workspace
  ON canvas_assets(workspace_id);

-- =============================================================================
-- CANVAS_TEMPLATES — Reusable frame templates, workspace-scoped with tags
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvas_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT NOT NULL,
  thumbnail_url TEXT,
  tags TEXT,
  composition_mode TEXT
    CHECK (composition_mode IS NULL OR composition_mode IN ('deck', 'page', 'notebook', 'widget')),
  is_public INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvas_templates_workspace
  ON canvas_templates(workspace_id);

CREATE INDEX IF NOT EXISTS idx_canvas_templates_workspace_mode
  ON canvas_templates(workspace_id, composition_mode);

-- =============================================================================
-- CANVAS_PERMISSIONS — Per-canvas permission overrides
-- Mirrors doc_permissions pattern: workspace RBAC as baseline, canvas_permissions
-- as overrides. Canvas creator is automatically owner.
-- =============================================================================
CREATE TABLE IF NOT EXISTS canvas_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canvas_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  UNIQUE(canvas_id, user_id),
  FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_perms_canvas
  ON canvas_permissions(canvas_id);

CREATE INDEX IF NOT EXISTS idx_canvas_perms_user
  ON canvas_permissions(user_id);

-- =============================================================================
-- CANVASES_FTS — Full-text search for canvases (title + description)
-- Follows pattern from docs_fts and entities_fts (migration 008).
-- =============================================================================
CREATE VIRTUAL TABLE IF NOT EXISTS canvases_fts USING fts5(
  canvas_id UNINDEXED,
  workspace_id UNINDEXED,
  title,
  description,
  tokenize='porter unicode61'
);

-- DOWN
DROP TABLE IF EXISTS canvases_fts;
DROP TABLE IF EXISTS canvas_permissions;
DROP TABLE IF EXISTS canvas_templates;
DROP TABLE IF EXISTS canvas_assets;
DROP TABLE IF EXISTS canvas_exports;
DROP TABLE IF EXISTS canvas_versions;
DROP TABLE IF EXISTS canvas_conversations;
DROP TABLE IF EXISTS canvas_frames;
DROP TABLE IF EXISTS canvases;
