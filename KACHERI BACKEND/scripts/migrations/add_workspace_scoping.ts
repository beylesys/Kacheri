// KACHERI BACKEND/scripts/migrations/add_workspace_scoping.ts
// Migration script to add workspace_id columns to docs and fs_nodes tables.
// Also creates the docs table if it doesn't exist and migrates from docs.json.
//
// Run with: npx tsx scripts/migrations/add_workspace_scoping.ts

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

function repoRoot(): string {
  return path.resolve(process.cwd(), "..");
}

const DB_PATH =
  process.env.KACHERI_DB_PATH || path.resolve(repoRoot(), "data/db/kacheri.db");

const JSON_DOCS_PATH = path.resolve(repoRoot(), "data/docs.json");

console.log("=== Workspace Scoping Migration ===");
console.log(`Database: ${DB_PATH}`);
console.log(`JSON docs: ${JSON_DOCS_PATH}`);

// Ensure DB directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

type ColInfo = { name: string };

function tableExists(name: string): boolean {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(name) as { name?: string } | undefined;
  return !!row;
}

function currentCols(table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info('${table}')`).all() as ColInfo[];
  return new Set(rows.map(r => r.name));
}

function addColumnIfMissing(table: string, name: string, type: string) {
  const cols = currentCols(table);
  if (!cols.has(name)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
    console.log(`[${table}] added column: ${name} ${type}`);
  } else {
    console.log(`[${table}] column exists: ${name}`);
  }
}

function createIndexIfMissing(indexName: string, table: string, column: string) {
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column})`).run();
    console.log(`[${table}] index ensured: ${indexName}`);
  } catch (e) {
    console.log(`[${table}] index error for ${indexName}:`, e);
  }
}

// === 1. Create docs table if not exists ===
if (!tableExists("docs")) {
  console.log("\n[docs] Creating table...");
  db.exec(`
    CREATE TABLE docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_docs_workspace ON docs(workspace_id);
    CREATE INDEX idx_docs_updated ON docs(updated_at DESC);
  `);
  console.log("[docs] Table created with workspace_id support");
} else {
  console.log("\n[docs] Table exists, checking columns...");
  addColumnIfMissing("docs", "workspace_id", "TEXT");
  createIndexIfMissing("idx_docs_workspace", "docs", "workspace_id");
}

// === 2. Add workspace_id to fs_nodes if missing ===
if (tableExists("fs_nodes")) {
  console.log("\n[fs_nodes] Checking columns...");
  addColumnIfMissing("fs_nodes", "workspace_id", "TEXT");
  createIndexIfMissing("idx_fs_nodes_workspace", "fs_nodes", "workspace_id");
} else {
  console.log("\n[fs_nodes] Table does not exist - will be created on server start");
}

// === 3. Migrate docs from JSON if file exists ===
if (fs.existsSync(JSON_DOCS_PATH)) {
  console.log("\n[migration] Found docs.json, migrating to SQLite...");

  try {
    const raw = fs.readFileSync(JSON_DOCS_PATH, "utf8");
    const docs = JSON.parse(raw) as Array<{
      id: string;
      title: string;
      createdAt?: string;
      updatedAt?: string;
    }>;

    if (!Array.isArray(docs)) {
      console.log("[migration] docs.json is not an array, skipping");
    } else {
      let migrated = 0;
      let skipped = 0;

      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO docs (id, title, workspace_id, created_at, updated_at)
        VALUES (@id, @title, NULL, @created_at, @updated_at)
      `);

      for (const doc of docs) {
        const createdAt = doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now();
        const updatedAt = doc.updatedAt ? new Date(doc.updatedAt).getTime() : createdAt;

        const info = insertStmt.run({
          id: doc.id,
          title: doc.title || "Untitled",
          created_at: createdAt,
          updated_at: updatedAt,
        });

        if (info.changes > 0) {
          migrated++;
        } else {
          skipped++;
        }
      }

      console.log(`[migration] Migrated: ${migrated}, Skipped (already exist): ${skipped}`);
    }
  } catch (err: any) {
    console.log(`[migration] Error reading docs.json: ${err.message}`);
  }
} else {
  console.log("\n[migration] No docs.json found, skipping JSON migration");
}

// === Summary ===
const docCount = (db.prepare("SELECT COUNT(*) as c FROM docs").get() as { c: number }).c;
const fsNodeCount = tableExists("fs_nodes")
  ? (db.prepare("SELECT COUNT(*) as c FROM fs_nodes").get() as { c: number }).c
  : 0;

console.log("\n=== Migration Complete ===");
console.log(`Total docs in SQLite: ${docCount}`);
console.log(`Total fs_nodes: ${fsNodeCount}`);

db.close();
