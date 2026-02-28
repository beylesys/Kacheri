-- Migration: 016_add_workspace_image_credits
-- Created: 2026-02-23
-- Purpose: Per-workspace image generation credit tracking for Slice B5
-- See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice B5

-- Tracks image generation credits per workspace.
-- One row per workspace, lazy-initialized on first image generation.
-- credits_total defaults to IMAGE_CREDITS_DEFAULT env var (default: 100) at runtime.
-- Atomic deduction: UPDATE ... SET credits_used = credits_used + 1 WHERE credits_used < credits_total

CREATE TABLE IF NOT EXISTS workspace_image_credits (
  workspace_id TEXT PRIMARY KEY,
  credits_total INTEGER NOT NULL DEFAULT 100,
  credits_used INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
