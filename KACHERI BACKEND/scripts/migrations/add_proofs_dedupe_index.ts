// scripts/migrations/add_proofs_dedupe_index.ts
import { db } from "../../src/db";

function indexExists(table: string, name: string): boolean {
  const rows = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => String(r.name) === name);
}

export function up(): void {
  db.exec("BEGIN");
  try {
    if (!indexExists("proofs", "proofs_dedupe")) {
      db.prepare(`
        CREATE UNIQUE INDEX proofs_dedupe
        ON proofs (doc_id, kind, ts, hash)
      `).run();
    }
    db.exec("COMMIT");
    console.log("ok: created unique index proofs_dedupe");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

if (require.main === module) {
  up();
}
