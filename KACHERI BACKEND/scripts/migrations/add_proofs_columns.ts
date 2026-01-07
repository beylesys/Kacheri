// KACHERI BACKEND/scripts/migrations/add_proofs_columns.ts
import { db } from "../../src/db";

type ColInfo = { name: string };

function currentCols(): Set<string> {
  const rows = db.prepare(`PRAGMA table_info('proofs')`).all() as ColInfo[];
  return new Set(rows.map(r => r.name));
}

function addIfMissing(name: string, type: string) {
  const cols = currentCols();
  if (!cols.has(name)) {
    db.prepare(`ALTER TABLE proofs ADD COLUMN ${name} ${type}`).run();
    console.log(`added: ${name} ${type}`);
  } else {
    console.log(`exists: ${name}`);
  }
}

addIfMissing("kind", "TEXT");
addIfMissing("hash", "TEXT");
addIfMissing("path", "TEXT");
addIfMissing("meta", "TEXT");

console.log("migration complete.");
