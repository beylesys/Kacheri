// KACHERI BACKEND/scripts/migrations/create_fs_nodes_table.ts
// Purpose: create fs_nodes table for the in‑app file manager (folders + docs tree).

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function dbPath(): string {
  // Same pattern as other migrations:
  // cwd = backend root → ./data/db/kacheri.db
  const p = path.resolve(process.cwd(), "data", "db", "kacheri.db");
  ensureDir(path.dirname(p));
  return p;
}

function main() {
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS fs_nodes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id  INTEGER,
      kind       TEXT NOT NULL,          -- 'folder' | 'doc'
      name       TEXT NOT NULL,
      doc_id     TEXT,                   -- for kind='doc' links into docs registry
      created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fs_nodes_parent ON fs_nodes(parent_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fs_nodes_doc ON fs_nodes(doc_id);
  `);

  console.log("[migrate] fs_nodes table ready at", dbPath());
}

main();
