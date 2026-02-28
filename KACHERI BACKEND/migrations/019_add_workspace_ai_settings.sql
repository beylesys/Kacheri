-- 019_add_workspace_ai_settings.sql
-- Adds per-workspace AI provider/model preferences and encrypted BYOK API key storage.

CREATE TABLE IF NOT EXISTS workspace_ai_settings (
  workspace_id TEXT PRIMARY KEY,
  provider     TEXT,
  model        TEXT,
  api_key_enc  TEXT,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- DOWN
DROP TABLE IF EXISTS workspace_ai_settings;
