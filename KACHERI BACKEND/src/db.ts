// KACHERI BACKEND/src/db.ts
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createMigrationRunner } from "./migrations/runner";

function repoRoot(): string {
  // We run the backend from: <repo>/KACHERI BACKEND
  // So repo root is the parent folder.
  return path.resolve(process.cwd(), "..");
}

const DB_PATH =
  process.env.KACHERI_DB_PATH || path.resolve(repoRoot(), "data/db/kacheri.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Migration runner for P4.4
const migrationsDir = path.resolve(process.cwd(), "migrations");
export const migrationRunner = createMigrationRunner(db, migrationsDir);

// Minimal auto-migrations (idempotent)
db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS provenance(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  ts INTEGER NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_prov_doc_ts ON provenance(doc_id, ts DESC);

CREATE TABLE IF NOT EXISTS proofs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  related_provenance_id INTEGER,
  type TEXT NOT NULL,              -- e.g., "export:pdf", "ai:action" (legacy)
  sha256 TEXT NOT NULL,
  path TEXT,                       -- file path if any (e.g., PDF)
  payload TEXT NOT NULL,           -- full proof packet JSON as string
  ts INTEGER NOT NULL,
  kind TEXT,                       -- normalized kind e.g., "ai:compose", "pdf", "docx"
  hash TEXT,                       -- normalized hash (same as sha256 typically)
  meta TEXT,                       -- JSON metadata object
  FOREIGN KEY (related_provenance_id) REFERENCES provenance(id)
);
CREATE INDEX IF NOT EXISTS idx_proofs_doc_ts ON proofs(doc_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_proofs_kind ON proofs(kind);

-- Auth tables
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Workspace tables (no FK to users - dev mode uses synthetic user IDs)
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON workspaces (created_by);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members (user_id);

-- Documents table (migrated from JSON file to SQLite for workspace scoping)
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  workspace_id TEXT,               -- NULL = unscoped (legacy), otherwise scoped to workspace
  created_at INTEGER NOT NULL,     -- Unix timestamp ms
  updated_at INTEGER NOT NULL      -- Unix timestamp ms
  -- deleted_at added via migration below
);
CREATE INDEX IF NOT EXISTS idx_docs_workspace ON docs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updated_at DESC);

-- File system nodes (folders + doc references for file manager)
CREATE TABLE IF NOT EXISTS fs_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  kind TEXT NOT NULL,              -- 'folder' | 'doc'
  name TEXT NOT NULL,
  doc_id TEXT,                     -- for kind='doc' links into docs registry
  workspace_id TEXT,               -- NULL = unscoped (legacy), otherwise scoped to workspace
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  -- deleted_at added via migration below
);
CREATE INDEX IF NOT EXISTS idx_fs_nodes_parent ON fs_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_fs_nodes_doc ON fs_nodes(doc_id);

-- Audit log table for tracking workspace activity
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_ts ON audit_log(workspace_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- Document-level permissions table
CREATE TABLE IF NOT EXISTS doc_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,              -- owner | editor | commenter | viewer
  granted_by TEXT NOT NULL,        -- user who granted this permission
  granted_at INTEGER NOT NULL,     -- Unix timestamp ms
  UNIQUE(doc_id, user_id),
  FOREIGN KEY (doc_id) REFERENCES docs(id)
);
CREATE INDEX IF NOT EXISTS idx_doc_perms_doc ON doc_permissions(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_perms_user ON doc_permissions(user_id);

-- Comments table for inline document comments
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  thread_id TEXT,                    -- NULL for root comments, thread ID for replies
  parent_id INTEGER,                 -- NULL for root, parent comment ID for replies
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  anchor_from INTEGER,               -- Plain text start position (nullable for doc-level)
  anchor_to INTEGER,                 -- Plain text end position
  anchor_text TEXT,                  -- Original anchored text (for display if moved)
  resolved_at INTEGER,               -- NULL = unresolved, timestamp = resolved
  resolved_by TEXT,                  -- User ID who resolved
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,                -- Soft delete
  FOREIGN KEY (doc_id) REFERENCES docs(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(doc_id);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_deleted ON comments(deleted_at);

-- Comment mentions for @user notifications
CREATE TABLE IF NOT EXISTS comment_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS idx_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_mentions_user ON comment_mentions(user_id);

-- Document version history
CREATE TABLE IF NOT EXISTS doc_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  name TEXT,
  snapshot_html TEXT NOT NULL,
  snapshot_text TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  proof_id INTEGER,
  metadata TEXT,
  FOREIGN KEY (doc_id) REFERENCES docs(id),
  UNIQUE(doc_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON doc_versions(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_num ON doc_versions(doc_id, version_number DESC);

-- Suggestions table for track changes mode
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  change_type TEXT NOT NULL,
  from_pos INTEGER NOT NULL,
  to_pos INTEGER NOT NULL,
  original_text TEXT,
  proposed_text TEXT,
  comment TEXT,
  resolved_by TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES docs(id)
);
CREATE INDEX IF NOT EXISTS idx_suggestions_doc ON suggestions(doc_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_doc_status ON suggestions(doc_id, status);
CREATE INDEX IF NOT EXISTS idx_suggestions_author ON suggestions(author_id);

-- Cross-document links table (for doc-to-doc references)
CREATE TABLE IF NOT EXISTS doc_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_doc_id TEXT NOT NULL,
  to_doc_id TEXT NOT NULL,
  workspace_id TEXT,
  link_text TEXT,
  position INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(from_doc_id, to_doc_id, position),
  FOREIGN KEY (from_doc_id) REFERENCES docs(id),
  FOREIGN KEY (to_doc_id) REFERENCES docs(id)
);
CREATE INDEX IF NOT EXISTS idx_doc_links_from ON doc_links(from_doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_links_to ON doc_links(to_doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_links_workspace ON doc_links(workspace_id);

-- Workspace messages (chat)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reply_to_id INTEGER,
  edited_at INTEGER,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_workspace_ts ON messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON messages(deleted_at);
CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);

-- User notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_type TEXT,
  link_id TEXT,
  actor_id TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_ts ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_deleted ON notifications(deleted_at);

-- Message mentions for @user tracking
CREATE TABLE IF NOT EXISTS message_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_message_mentions_message ON message_mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_user ON message_mentions(user_id);

-- Workspace invites for member invite flow
CREATE TABLE IF NOT EXISTS workspace_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  invite_token TEXT UNIQUE NOT NULL,
  invited_email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  accepted_by TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_invites_token ON workspace_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_invites_workspace_status ON workspace_invites(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_invites_email ON workspace_invites(invited_email);

-- Verification reports for nightly verification runs (Phase 5)
CREATE TABLE IF NOT EXISTS verification_reports (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'partial')),
  exports_pass INTEGER DEFAULT 0,
  exports_fail INTEGER DEFAULT 0,
  exports_miss INTEGER DEFAULT 0,
  compose_pass INTEGER DEFAULT 0,
  compose_drift INTEGER DEFAULT 0,
  compose_miss INTEGER DEFAULT 0,
  report_json TEXT NOT NULL,
  triggered_by TEXT DEFAULT 'cron'
);
CREATE INDEX IF NOT EXISTS idx_vr_created ON verification_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vr_status ON verification_reports(status);
`);

// Add workspace_id columns to existing tables if missing (migration for existing databases)
function addColumnIfMissing(table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
}

// Ensure workspace_id exists on fs_nodes (for existing databases)
addColumnIfMissing('fs_nodes', 'workspace_id', 'TEXT');
db.exec(`CREATE INDEX IF NOT EXISTS idx_fs_nodes_workspace ON fs_nodes(workspace_id);`);

// Ensure deleted_at exists on docs and fs_nodes (for trash/recovery feature)
addColumnIfMissing('docs', 'deleted_at', 'INTEGER');
addColumnIfMissing('fs_nodes', 'deleted_at', 'INTEGER');
db.exec(`CREATE INDEX IF NOT EXISTS idx_docs_deleted ON docs(deleted_at);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_fs_nodes_deleted ON fs_nodes(deleted_at);`);

// Add created_by column to docs (for doc ownership tracking in permissions)
addColumnIfMissing('docs', 'created_by', 'TEXT');

// Add layout_settings column to docs (for page layout configuration)
addColumnIfMissing('docs', 'layout_settings', 'TEXT');

// Add workspace_access column to docs (for workspace-wide share toggle)
// Values: NULL (use workspace role) | 'none' | 'viewer' | 'commenter' | 'editor'
addColumnIfMissing('docs', 'workspace_access', 'TEXT');

export function repoPath(...parts: string[]) {
  return path.resolve(repoRoot(), ...parts);
}
