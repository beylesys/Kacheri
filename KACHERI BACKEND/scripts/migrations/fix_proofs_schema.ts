// KACHERI BACKEND/scripts/migrations/fix_proofs_schema.ts
// Standalone script to add missing columns to proofs table
// Run this BEFORE importing db.ts if the schema is out of sync

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

function repoRoot(): string {
  return path.resolve(process.cwd(), "..");
}

const DB_PATH =
  process.env.KACHERI_DB_PATH || path.resolve(repoRoot(), "data/db/kacheri.db");

if (!fs.existsSync(DB_PATH)) {
  console.log("Database does not exist yet. Nothing to fix.");
  process.exit(0);
}

const db = new Database(DB_PATH);

type ColInfo = { name: string };

function currentCols(table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info('${table}')`).all() as ColInfo[];
  return new Set(rows.map(r => r.name));
}

function addIfMissing(table: string, name: string, type: string) {
  const cols = currentCols(table);
  if (!cols.has(name)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
    console.log(`[${table}] added: ${name} ${type}`);
  } else {
    console.log(`[${table}] exists: ${name}`);
  }
}

// Fix proofs table
const proofsCols = currentCols("proofs");
if (proofsCols.size > 0) {
  addIfMissing("proofs", "kind", "TEXT");
  addIfMissing("proofs", "hash", "TEXT");
  addIfMissing("proofs", "meta", "TEXT");

  // Create index if it doesn't exist
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_proofs_kind ON proofs(kind)`).run();
    console.log("[proofs] index idx_proofs_kind ensured");
  } catch (e) {
    console.log("[proofs] index idx_proofs_kind already exists or error:", e);
  }
} else {
  console.log("proofs table does not exist or is empty");
}

db.close();
console.log("Schema fix complete.");
