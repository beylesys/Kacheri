// scripts/replay_exports.ts
// Purpose: Read normalized proofs for exports and verify the on-disk artifact hash
// matches the recorded hash. Reports PASS / FAIL / MISS.
// Usage:
//   npx ts-node scripts/replay_exports.ts
//   npx ts-node scripts/replay_exports.ts --doc=123abc
//   npx ts-node scripts/replay_exports.ts --kind=docx
//
// Notes:
// - Works for both 'docx' and 'pdf' proof rows (where present).  :contentReference[oaicite:4]{index=4}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db, repoPath } from '../src/db';

type Flags = { doc?: string; kind?: string; verbose: boolean };
function parseFlags(argv: string[]): Flags {
  const f: Flags = { verbose: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--doc=')) f.doc = a.split('=')[1];
    else if (a.startsWith('--kind=')) f.kind = a.split('=')[1];
    else if (a === '--verbose' || a === '-v') f.verbose = true;
  }
  return f;
}

function sha256Hex(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

interface Row { doc_id: string; kind: string | null; hash: string | null; path: string | null; }

async function main() {
  const { doc: onlyDoc, kind, verbose } = parseFlags(process.argv);

  // Basic query: kind IN ('docx','pdf') unless overridden by --kind
  const kinds = kind ? [kind] : ['docx', 'pdf'];

  const placeholders = kinds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT doc_id, kind, hash, path
    FROM proofs
    WHERE kind IN (${placeholders})
      ${onlyDoc ? 'AND doc_id = ?' : ''}
    ORDER BY ts DESC, id DESC
  `).all(...kinds, ...(onlyDoc ? [onlyDoc] as any : [])) as Row[];

  const exportRoot = repoPath('storage', 'exports');
  let pass = 0, fail = 0, miss = 0;

  for (const r of rows) {
    const docId = r.doc_id;
    const expected = String(r.hash || '');
    const absolute = r.path
      ? r.path
      : ''; // legacy entries without path → treat as MISS below

    // Derive relative path for display
    const rel = absolute.startsWith(exportRoot) ? path.relative(exportRoot, absolute) : absolute;

    try {
      if (!absolute) throw new Error('no path recorded');
      const buf = await fs.readFile(absolute);
      const actual = 'sha256:' + sha256Hex(buf);
      if (actual === expected) {
        pass++;
        if (verbose) console.log(`PASS  doc-${docId}  ${r.kind}  ${rel}`);
      } else {
        fail++;
        console.log(`FAIL  doc-${docId}  ${r.kind}  ${rel}\n  expected=${expected}\n  actual=${actual}`);
      }
    } catch {
      miss++;
      console.log(`MISS  doc-${docId}  ${r.kind}  ${rel || '(no path)'}  (file not found)`);
    }
  }

  console.log(JSON.stringify({ total: rows.length, pass, fail, miss }, null, 2));
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
