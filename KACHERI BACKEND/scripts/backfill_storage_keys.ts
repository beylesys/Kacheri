// scripts/backfill_storage_keys.ts
// Purpose: Backfill storage_key for existing proof rows that have a filesystem path
// but no storage_key. Reads each file from disk, writes to storage client under
// a canonical key, and updates the DB row.
//
// Usage:
//   npx ts-node scripts/backfill_storage_keys.ts
//   npx ts-node scripts/backfill_storage_keys.ts --dry-run
//   npx ts-node scripts/backfill_storage_keys.ts --batch=50
//
// Idempotent: skips rows that already have storage_key set.

import { promises as fsP } from 'node:fs';
import path from 'node:path';
import { db } from '../src/db';
import { getStorage } from '../src/storage';
import { ArtifactsStore } from '../src/store/artifacts';

type Flags = { dryRun: boolean; batchSize: number; verbose: boolean };
function parseFlags(argv: string[]): Flags {
  const f: Flags = { dryRun: false, batchSize: 100, verbose: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') f.dryRun = true;
    else if (a.startsWith('--batch=')) f.batchSize = Math.max(1, Number(a.split('=')[1] || 100));
    else if (a === '--verbose' || a === '-v') f.verbose = true;
  }
  return f;
}

interface Row {
  id: number;
  doc_id: string;
  kind: string | null;
  hash: string | null;
  path: string | null;
  workspace_id: string | null;
  meta: string | null;
}

/**
 * Derive a canonical storage key from the proof row metadata.
 * Pattern: {workspace_id}/{bucket}/doc-{doc_id}/{filename}
 */
function deriveStorageKey(row: Row): string {
  const wsPrefix = row.workspace_id || '_global';
  const basename = row.path ? path.basename(row.path) : `${Date.now()}-${row.kind || 'proof'}`;

  // Determine bucket from kind or file extension
  const ext = row.path ? path.extname(row.path).toLowerCase() : '';
  let bucket = 'proofs';
  if (row.kind === 'pdf' || row.kind === 'docx' || ext === '.pdf' || ext === '.docx') {
    bucket = 'exports';
  } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp') {
    bucket = 'images';
  }

  return `${wsPrefix}/${bucket}/doc-${row.doc_id}/${basename}`;
}

async function main() {
  const { dryRun, batchSize, verbose } = parseFlags(process.argv);
  const storage = getStorage();

  console.log(`[backfill] Storage provider: ${storage.type} (${storage.name})`);
  if (dryRun) console.log('[backfill] DRY RUN — no writes will be made');

  // Query rows with a path but no storage_key
  const total = (db.prepare(
    `SELECT COUNT(*) as cnt FROM proofs WHERE storage_key IS NULL AND path IS NOT NULL AND path != ''`
  ).get() as { cnt: number }).cnt;

  console.log(`[backfill] Found ${total} rows to backfill`);
  if (total === 0) {
    console.log('[backfill] Nothing to do.');
    return;
  }

  let processed = 0, success = 0, skipped = 0, failed = 0;

  while (processed < total) {
    const rows = db.prepare(`
      SELECT id, doc_id, kind, hash, path, workspace_id, meta
      FROM proofs
      WHERE storage_key IS NULL AND path IS NOT NULL AND path != ''
      ORDER BY id ASC
      LIMIT ?
    `).all(batchSize) as Row[];

    if (rows.length === 0) break;

    for (const row of rows) {
      processed++;
      const filePath = String(row.path || '');

      // Read the file from disk
      let buf: Buffer;
      try {
        buf = await fsP.readFile(filePath);
      } catch {
        skipped++;
        if (verbose) console.log(`  SKIP  id=${row.id}  (file not found: ${filePath})`);
        // Still set storage_key to mark it as processed (with the derived key)
        // so we don't re-process on next run. The file is genuinely missing.
        if (!dryRun) {
          const key = deriveStorageKey(row);
          ArtifactsStore.updateStorageLocation(row.id, storage.type as any, key);
        }
        continue;
      }

      const storageKey = deriveStorageKey(row);

      if (dryRun) {
        success++;
        if (verbose) console.log(`  DRY   id=${row.id}  → ${storageKey}  (${buf.byteLength} bytes)`);
        continue;
      }

      try {
        // Write to storage client
        await storage.write(storageKey, buf);
        // Update DB
        ArtifactsStore.updateStorageLocation(row.id, storage.type as any, storageKey);
        success++;
        if (verbose) console.log(`  OK    id=${row.id}  → ${storageKey}  (${buf.byteLength} bytes)`);
      } catch (err) {
        failed++;
        console.error(`  FAIL  id=${row.id}  ${storageKey}  error=${(err as Error).message}`);
      }
    }

    console.log(`[backfill] Progress: ${processed}/${total} (${success} ok, ${skipped} skipped, ${failed} failed)`);
  }

  console.log(`[backfill] Complete: ${success} backfilled, ${skipped} skipped (file missing), ${failed} failed`);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
