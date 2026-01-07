// backend/scripts/migrations/20251106_add_artifacts_table.ts
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const DB_PATH =
  process.env.KACHERI_DB_PATH ||
  path.resolve(process.cwd(), 'data/db/kacheri.db');

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY,
  doc_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  bytes INTEGER,
  hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_artifacts_doc ON artifacts(doc_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts(kind);
`);

console.log('[artifacts] migration applied at', DB_PATH);
db.close();
