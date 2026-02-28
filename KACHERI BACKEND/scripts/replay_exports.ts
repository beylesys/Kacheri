// scripts/replay_exports.ts
// Purpose: Read normalized proofs for exports and verify the artifact hash
// matches the recorded hash. Resolves artifacts via storage client first,
// falling back to legacy filesystem paths.
// Usage:
//   npx ts-node scripts/replay_exports.ts
//   npx ts-node scripts/replay_exports.ts --doc=123abc
//   npx ts-node scripts/replay_exports.ts --kind=docx

import path from 'node:path';
import { createHash } from 'node:crypto';
import { db, repoPath } from '../src/db';
import { readArtifactBuffer } from '../src/storage';

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

interface Row {
  doc_id: string;
  kind: string | null;
  hash: string | null;
  path: string | null;
  storage_key: string | null;
}

async function main() {
  const { doc: onlyDoc, kind, verbose } = parseFlags(process.argv);

  // Basic query: kind IN ('docx','pdf') unless overridden by --kind
  const kinds = kind ? [kind] : ['docx', 'pdf'];

  const placeholders = kinds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT doc_id, kind, hash, path, storage_key
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
    const absolute = r.path ? r.path : '';

    // Derive relative path for display
    const rel = absolute.startsWith(exportRoot) ? path.relative(exportRoot, absolute) : absolute;
    const displayPath = r.storage_key || rel || '(no path)';

    // Storage-first read with filesystem fallback
    const buf = await readArtifactBuffer(r.storage_key, absolute || null);

    if (!buf) {
      miss++;
      console.log(`MISS  doc-${docId}  ${r.kind}  ${displayPath}  (file not found)`);
      continue;
    }

    const actual = 'sha256:' + sha256Hex(buf);
    if (actual === expected) {
      pass++;
      if (verbose) console.log(`PASS  doc-${docId}  ${r.kind}  ${displayPath}`);
    } else {
      fail++;
      console.log(`FAIL  doc-${docId}  ${r.kind}  ${displayPath}\n  expected=${expected}\n  actual=${actual}`);
    }
  }

  console.log(JSON.stringify({ total: rows.length, pass, fail, miss }, null, 2));
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
