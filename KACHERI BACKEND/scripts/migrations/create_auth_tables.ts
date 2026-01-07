// KACHERI BACKEND/scripts/migrations/create_auth_tables.ts
// Purpose: Create users and sessions tables for authentication.

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function dbPath(): string {
  const p = path.resolve(process.cwd(), 'data', 'db', 'kacheri.db');
  ensureDir(path.dirname(p));
  return p;
}

function main() {
  const db = new Database(dbPath());
  db.pragma('journal_mode = WAL');

  // Users table
  db.exec(`
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
  `);

  // Email index for login lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  `);

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // Session lookup indices
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
  `);

  console.log(`[migrate] auth tables (users, sessions) ready at ${dbPath()}`);
}

main();
