-- Migration: add_canvas_publish
-- Version: 017
-- Created: 2026-02-24
-- Purpose: Add publish support for canvas embed/widget mode.
--          Adds is_published flag and published_at timestamp to canvases table.
--          Part of Phase 7 (Slice E5) of the BEYLE Platform Unified Roadmap.
--          See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice E5

-- UP
ALTER TABLE canvases ADD COLUMN is_published INTEGER NOT NULL DEFAULT 0;
ALTER TABLE canvases ADD COLUMN published_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_canvases_published
  ON canvases(is_published)
  WHERE is_published = 1;

-- DOWN
-- SQLite does not support DROP COLUMN in older versions.
-- For rollback: recreate table without is_published/published_at columns.
-- DROP INDEX IF EXISTS idx_canvases_published;
