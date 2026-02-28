-- Migration: add_notification_preferences
-- Version: 011
-- Created: 2026-02-19
-- Purpose: User notification channel preferences per workspace.
--          Enables webhook and Slack delivery for notifications (Roadmap 2.2).

-- =============================================================================
-- NOTIFICATION_PREFERENCES TABLE
-- Per-user, per-workspace notification channel configuration.
-- Channels: in_app, webhook, slack (email deferred to Slice 13).
-- Uses UNIQUE constraint for upsert on (user_id, workspace_id, channel, notification_type).
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  channel TEXT NOT NULL,                -- 'in_app', 'webhook', 'slack'
  notification_type TEXT NOT NULL,      -- 'mention', 'comment_reply', 'doc_shared', 'suggestion_pending', 'reminder', 'all'
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,                     -- channel-specific config (webhook URL, Slack webhook URL, etc.)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, workspace_id, channel, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_workspace
  ON notification_preferences(user_id, workspace_id);

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_notification_preferences_user_workspace;
-- DROP TABLE IF EXISTS notification_preferences;
