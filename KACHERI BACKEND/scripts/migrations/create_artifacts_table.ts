// KACHERI BACKEND/scripts/migrations/create_artifacts_table.ts
// Purpose: Create artifacts table to register exported files (PDF/DOCX) or other artifacts.
// Repo today: exports live on disk + proofs in SQLite; no unified artifacts registry yet.

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function dbPath(): string {
  // Repo checkpoints pin DB under data/db/kacheri.db
  // Using cwd keeps this script robust in dev.
  const p = path.resolve(process.cwd(), 'data', 'db', 'kacheri.db');
  ensureDir(path.dirname(p));
  return p;
}

function main() {
  const db = new Database(dbPath());
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id TEXT NOT NULL,
      kind   TEXT NOT NULL,          -- 'pdf' | 'docx' | 'image' | etc
      path   TEXT NOT NULL,          -- filesystem path
      bytes  INTEGER NOT NULL,
      hash   TEXT,                   -- sha256 of the file (optional backfill)
      created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifacts_doc ON artifacts (doc_id, kind, created_at DESC);
  `);

  console.log(`[migrate] artifacts table ready at ${dbPath()}`);
}

main();
