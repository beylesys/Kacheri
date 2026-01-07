// debug-proof-dump.js
// Run with:  node debug-proof-dump.js

const path = require("node:path");
const Database = require("better-sqlite3");

// Point at the same DB the app uses.
// From KACHERI BACKEND/, this resolves to: C:\BEYLE KACHERI\data\db\kacheri.db
const DB_PATH = path.join(__dirname, "..", "data", "db", "kacheri.db");
console.log("Using DB file:", DB_PATH);

const db = new Database(DB_PATH);

// 1) Show columns in proofs table
const cols = db.prepare("PRAGMA table_info(proofs)").all();
console.log("\nColumns in proofs table:");
console.log(cols);

// 2) Last 30 rows (any kind/type)
const lastRows = db
  .prepare(
    `
    SELECT
      id,
      doc_id,
      type,
      kind,
      sha256,
      hash,
      path,
      ts,
      meta
    FROM proofs
    ORDER BY ts DESC
    LIMIT 30
  `
  )
  .all();

console.log("\nLast 30 rows from proofs:");
console.log(JSON.stringify(lastRows, null, 2));

// 3) AI-related rows (type OR kind starting with 'ai:')
const aiRows = db
  .prepare(
    `
    SELECT
      id,
      doc_id,
      type,
      kind,
      sha256,
      hash,
      path,
      ts,
      meta
    FROM proofs
    WHERE type LIKE 'ai:%' OR kind LIKE 'ai:%'
    ORDER BY ts DESC
    LIMIT 80
  `
  )
  .all();

console.log("\nAI rows (type/kind LIKE 'ai:%'):");
console.log(JSON.stringify(aiRows, null, 2));

// 4) Count by kind (so we see how many of each stored kind)
const byKind = db
  .prepare(
    `
    SELECT
      kind,
      COUNT(*) AS c
    FROM proofs
    GROUP BY kind
    ORDER BY c DESC
  `
  )
  .all();

console.log("\nCounts by kind:");
console.log(byKind);

// 5) Count by type (true “event type” column)
const byType = db
  .prepare(
    `
    SELECT
      type,
      COUNT(*) AS c
    FROM proofs
    GROUP BY type
    ORDER BY c DESC
  `
  )
  .all();

console.log("\nCounts by type:");
console.log(byType);

// Optional: breakdown of ai:action payloads by action field,
// useful to sanity-check what /ai/watch is seeing.
try {
  const aiActionBreakdown = db
    .prepare(
      `
      SELECT
        json_extract(payload, '$.action') AS action,
        COUNT(*) AS c
      FROM proofs
      WHERE type = 'ai:action'
      GROUP BY action
      ORDER BY c DESC
    `
    )
    .all();

  console.log("\nai:action breakdown by payload.action:");
  console.log(aiActionBreakdown);
} catch (err) {
  console.warn(
    "\n(ai:action breakdown skipped — SQLite JSON1 extension might be missing):",
    err.message
  );
}

db.close();
