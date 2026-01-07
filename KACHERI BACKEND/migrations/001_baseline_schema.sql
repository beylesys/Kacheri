-- Migration: baseline_schema
-- Version: 001
-- Created: 2025-12-30
-- Purpose: Baseline schema for existing databases. No-op if tables already exist.

-- Schema Migrations Table (self-referential - already exists from runner)
-- Included here for documentation completeness

-- Provenance Table
CREATE TABLE IF NOT EXISTS provenance(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  ts INTEGER NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_prov_doc_ts ON provenance(doc_id, ts DESC);

-- Proofs Table
CREATE TABLE IF NOT EXISTS proofs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  related_provenance_id INTEGER,
  type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  path TEXT,
  payload TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT,
  hash TEXT,
  meta TEXT,
  FOREIGN KEY (related_provenance_id) REFERENCES provenance(id)
);
CREATE INDEX IF NOT EXISTS idx_proofs_doc_ts ON proofs(doc_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_proofs_kind ON proofs(kind);

-- Users Table
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

-- Sessions Table
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

-- Workspaces Table
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON workspaces (created_by);

-- Workspace Members Table
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members (user_id);

-- Documents Table
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  workspace_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_workspace ON docs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updated_at DESC);

-- File System Nodes Table
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
CREATE INDEX IF NOT EXISTS idx_fs_nodes_workspace ON fs_nodes(workspace_id);

-- Audit Log Table
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

-- Document Permissions Table
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

-- Comments Table
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

-- Comment Mentions Table
CREATE TABLE IF NOT EXISTS comment_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (comment_id) REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS idx_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX IF NOT EXISTS idx_mentions_user ON comment_mentions(user_id);

-- Document Versions Table
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

-- Suggestions Table
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

-- Document Links Table
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

-- Messages Table
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

-- Notifications Table
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

-- Message Mentions Table
CREATE TABLE IF NOT EXISTS message_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_message_mentions_message ON message_mentions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_user ON message_mentions(user_id);

-- Workspace Invites Table
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

-- Verification Reports Table
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

-- DOWN
-- Baseline migration cannot be rolled back (would destroy entire schema)
-- This is intentional - baseline is the starting point

