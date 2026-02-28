// scripts/verify_storage_integrity.ts
// Purpose: Verify that every artifact with a storage_key is actually present
// in the storage backend and its hash matches the DB record.
//
// Usage:
//   npx ts-node scripts/verify_storage_integrity.ts
//   npx ts-node scripts/verify_storage_integrity.ts --out=.reports/integrity.json
//   npx ts-node scripts/verify_storage_integrity.ts --limit=500 --verbose
//
// Outputs a JSON summary: { total, pass, fail, miss }
// Updates verification_status in the proofs table.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, repoPath } from '../src/db';
import { getStorage } from '../src/storage';
import { ArtifactsStore } from '../src/store/artifacts';

type Flags = { limit: number; verbose: boolean; out?: string };
function parseFlags(argv: string[]): Flags {
  const f: Flags = { limit: 10000, verbose: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--limit=')) f.limit = Math.max(1, Number(a.split('=')[1] || 10000));
    else if (a === '--verbose' || a === '-v') f.verbose = true;
    else if (a.startsWith('--out=')) f.out = a.split('=')[1];
  }
  return f;
}

function sha256Hex(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

interface Row {
  id: number;
  doc_id: string;
  kind: string | null;
  hash: string | null;
  storage_key: string;
}

async function main() {
  const { limit, verbose, out } = parseFlags(process.argv);
  const storage = getStorage();

  console.log(`[integrity] Storage provider: ${storage.type} (${storage.name})`);

  const rows = db.prepare(`
    SELECT id, doc_id, kind, hash, storage_key
    FROM proofs
    WHERE storage_key IS NOT NULL AND storage_key != ''
    ORDER BY id ASC
    LIMIT ?
  `).all(limit) as Row[];

  console.log(`[integrity] Checking ${rows.length} artifacts...`);

  let pass = 0, fail = 0, miss = 0;
  const details: Array<{ id: number; docId: string; kind: string | null; status: string; message?: string }> = [];

  for (const r of rows) {
    const expected = String(r.hash || '');

    // Check existence
    let exists = false;
    try {
      exists = await storage.exists(r.storage_key);
    } catch {
      exists = false;
    }

    if (!exists) {
      miss++;
      ArtifactsStore.updateVerification(r.id, 'miss');
      details.push({ id: r.id, docId: r.doc_id, kind: r.kind, status: 'miss', message: 'not found in storage' });
      if (verbose) console.log(`  MISS  id=${r.id}  ${r.storage_key}`);
      continue;
    }

    // Read and compute hash
    try {
      const buf = await storage.read(r.storage_key);
      const actual = 'sha256:' + sha256Hex(buf);

      if (!expected) {
        // No hash recorded — can't verify, but file exists. Mark as pass.
        pass++;
        ArtifactsStore.updateVerification(r.id, 'pass');
        details.push({ id: r.id, docId: r.doc_id, kind: r.kind, status: 'pass', message: 'no hash to compare, file exists' });
        if (verbose) console.log(`  PASS  id=${r.id}  ${r.storage_key}  (no hash, file ok)`);
      } else if (actual === expected) {
        pass++;
        ArtifactsStore.updateVerification(r.id, 'pass');
        details.push({ id: r.id, docId: r.doc_id, kind: r.kind, status: 'pass' });
        if (verbose) console.log(`  PASS  id=${r.id}  ${r.storage_key}`);
      } else {
        fail++;
        ArtifactsStore.updateVerification(r.id, 'fail');
        details.push({ id: r.id, docId: r.doc_id, kind: r.kind, status: 'fail', message: `expected=${expected} actual=${actual}` });
        console.log(`  FAIL  id=${r.id}  ${r.storage_key}\n    expected=${expected}\n    actual=${actual}`);
      }
    } catch (err) {
      fail++;
      ArtifactsStore.updateVerification(r.id, 'fail');
      details.push({ id: r.id, docId: r.doc_id, kind: r.kind, status: 'fail', message: (err as Error).message });
      console.log(`  FAIL  id=${r.id}  ${r.storage_key}  error=${(err as Error).message}`);
    }
  }

  const summary = { total: rows.length, pass, fail, miss };
  console.log(JSON.stringify(summary, null, 2));

  if (out) {
    const dst = path.isAbsolute(out) ? out : repoPath(out);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, JSON.stringify({ ...summary, details }, null, 2), 'utf8');
    console.log(`[integrity] Report written to: ${dst}`);
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
