import { db } from "../../src/db";
try {
  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS provenance_ai_unique
    ON provenance (
      doc_id,
      action,
      json_extract(details, '$.proofHash')
    )
  `).run();
  console.log("OK: provenance_ai_unique");
} catch (e) {
  console.error("migration failed", e);
  process.exitCode = 1;
}
