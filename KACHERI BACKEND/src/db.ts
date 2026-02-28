// KACHERI BACKEND/src/db.ts
// S16: Database initialization — exports `db` as a unified DbAdapter.
//
// For SQLite (default / local mode):
//   - better-sqlite3 Database is created synchronously at module load
//   - All base tables and schema migrations run synchronously
//   - SqliteAdapter wraps the initialized Database
//
// For PostgreSQL (cloud mode, when DATABASE_URL starts with 'postgres://'):
//   - pg.Pool is created at module load (no queries issued yet)
//   - Call `await initDb()` before the server starts listening (done in createApp())
//   - initDb() runs base table creation and file-based migrations via AsyncMigrationRunner

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { config } from "./config";
import { SqliteAdapter } from "./db/sqlite";
import { PostgresAdapter } from "./db/postgres";
import type { DbAdapter } from "./db/types";
import { createMigrationRunner, AsyncMigrationRunner } from "./migrations/runner";

/* ─────────────────────────────────────────────────────────────────────────────
 * SQLite helpers (sync — used only in the local/SQLite path)
 * ─────────────────────────────────────────────────────────────────────────── */

function addColumnIfMissing(rawDb: Database.Database, table: string, column: string, type: string): void {
  const cols = rawDb.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has(column)) {
    rawDb.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
}

function initSqliteBase(rawDb: Database.Database): void {
  // Minimal auto-migrations (idempotent)
  rawDb.exec(`
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

-- Documents table
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  workspace_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_workspace ON docs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updated_at DESC);

-- File system nodes (folders + doc references for file manager)
CREATE TABLE IF NOT EXISTS fs_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  doc_id TEXT,
  workspace_id TEXT,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_fs_nodes_parent ON fs_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_fs_nodes_doc ON fs_nodes(doc_id);

-- Audit log table
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
  role TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  UNIQUE(doc_id, user_id),
  FOREIGN KEY (doc_id) REFERENCES docs(id)
);
CREATE INDEX IF NOT EXISTS idx_doc_perms_doc ON doc_permissions(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_perms_user ON doc_permissions(user_id);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  thread_id TEXT,
  parent_id INTEGER,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  anchor_from INTEGER,
  anchor_to INTEGER,
  anchor_text TEXT,
  resolved_at INTEGER,
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (doc_id) REFERENCES docs(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(doc_id);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_deleted ON comments(deleted_at);

-- Comment mentions
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

-- Suggestions table
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

-- Cross-document links table
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

-- Message mentions
CREATE TABLE IF NOT EXISTS message_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_message_mentions_message ON message_mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_user ON message_mentions(user_id);

-- Workspace invites
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

-- Verification reports
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

  // Add workspace_id columns to existing tables if missing
  addColumnIfMissing(rawDb, 'fs_nodes', 'workspace_id', 'TEXT');
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_fs_nodes_workspace ON fs_nodes(workspace_id);`);

  // Ensure deleted_at exists on docs and fs_nodes
  addColumnIfMissing(rawDb, 'docs', 'deleted_at', 'INTEGER');
  addColumnIfMissing(rawDb, 'fs_nodes', 'deleted_at', 'INTEGER');
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_docs_deleted ON docs(deleted_at);`);
  rawDb.exec(`CREATE INDEX IF NOT EXISTS idx_fs_nodes_deleted ON fs_nodes(deleted_at);`);

  // Add created_by column to docs
  addColumnIfMissing(rawDb, 'docs', 'created_by', 'TEXT');

  // Add layout_settings column to docs
  addColumnIfMissing(rawDb, 'docs', 'layout_settings', 'TEXT');

  // Add workspace_access column to docs
  addColumnIfMissing(rawDb, 'docs', 'workspace_access', 'TEXT');
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Path helpers (must be defined before createSqliteAdapter uses repoRoot)
 * ─────────────────────────────────────────────────────────────────────────── */

function repoRoot(): string {
  // We run the backend from: <repo>/KACHERI BACKEND
  // So repo root is the parent folder.
  return path.resolve(process.cwd(), "..");
}

export function repoPath(...parts: string[]) {
  return path.resolve(repoRoot(), ...parts);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Adapter creation
 * ─────────────────────────────────────────────────────────────────────────── */

function createSqliteAdapter(): SqliteAdapter {
  const DB_PATH =
    process.env.KACHERI_DB_PATH ||
    path.resolve(repoRoot(), "data/db/kacheri.db");

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const rawDb = new Database(DB_PATH);
  rawDb.pragma("journal_mode = WAL");

  // Initialize base schema (sync — must run before any store imports use db)
  initSqliteBase(rawDb);

  // Auto-run pending file-based migrations (idempotent).
  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const runner = createMigrationRunner(rawDb, migrationsDir);
  const result = runner.runAll();
  if (result.applied.length > 0) {
    console.log(`[db] Applied ${result.applied.length} migration(s):`, result.applied.join(', '));
  }

  return new SqliteAdapter(rawDb);
}

// ── The exported adapter (DbAdapter interface) ─────────────────────────────
const _adapter: SqliteAdapter | PostgresAdapter =
  config.database.driver === 'postgresql'
    ? new PostgresAdapter(config.database.url)
    : createSqliteAdapter();

export const db: DbAdapter = _adapter;

/* ─────────────────────────────────────────────────────────────────────────────
 * PostgreSQL async initialization
 * Called by createApp() in server.ts before the server starts listening.
 * No-op for SQLite (already initialized synchronously above).
 * ─────────────────────────────────────────────────────────────────────────── */
export async function initDb(): Promise<void> {
  if (config.database.driver !== 'postgresql') return;

  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const runner = new AsyncMigrationRunner(db, migrationsDir);
  const result = await runner.runAll();
  if (result.applied.length > 0) {
    console.log(`[db] Applied ${result.applied.length} migration(s):`, result.applied.join(', '));
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Migration runner export (SQLite-only convenience for CLI scripts).
 * PostgreSQL: use AsyncMigrationRunner from migrations/runner directly.
 * ─────────────────────────────────────────────────────────────────────────── */
const _migrationsDir = path.resolve(process.cwd(), "migrations");

export const migrationRunner =
  config.database.driver === 'sqlite'
    ? createMigrationRunner((_adapter as SqliteAdapter).raw, _migrationsDir)
    : null;
