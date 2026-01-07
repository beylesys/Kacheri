// scripts/clean_stale_artifacts.ts
// Purpose: Identify (and optionally clean) stale artifacts.
// Usage:
//   npx ts-node scripts/clean_stale_artifacts.ts
//   npx ts-node scripts/clean_stale_artifacts.ts --doc=123abc
//   npx ts-node scripts/clean_stale_artifacts.ts --delete-db-stale
//   npx ts-node scripts/clean_stale_artifacts.ts --delete-orphan-files

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db, repoPath } from '../src/db';

type Flags = { doc?: string; deleteDbStale: boolean; deleteOrphanFiles: boolean; verbose: boolean };
function parseFlags(argv: string[]): Flags {
  const f: Flags = { deleteDbStale: false, deleteOrphanFiles: false, verbose: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--doc=')) f.doc = a.split('=')[1];
    else if (a === '--delete-db-stale') f.deleteDbStale = true;
    else if (a === '--delete-orphan-files') f.deleteOrphanFiles = true;
    else if (a === '--verbose' || a === '-v') f.verbose = true;
  }
  return f;
}

async function main() {
  const { doc, deleteDbStale, deleteOrphanFiles, verbose } = parseFlags(process.argv);
  const exportRoot = repoPath('storage', 'exports');

  const proofRows = db.prepare(`
    SELECT id, doc_id, kind, path
    FROM proofs
    WHERE kind IN ('pdf','docx') ${doc ? 'AND doc_id = ?' : ''}
  `).all(doc ?? undefined).map((r: any) => ({id: r.id, doc_id: String(r.doc_id), kind: String(r.kind), path: String(r.path || '')}));

  const recordedPaths = new Set(proofRows.map(r => r.path));
  const dbStale: typeof proofRows = [];

  for (const r of proofRows) {
    try {
      if (!r.path) throw new Error('no path');
      await fs.access(r.path);
    } catch {
      dbStale.push(r);
    }
  }

  // Build FS list
  const fsFiles: string[] = [];
  try {
    const docDirs = await fs.readdir(exportRoot, { withFileTypes: true });
    for (const d of docDirs) {
      if (!d.isDirectory()) continue;
      if (!d.name.startsWith('doc-')) continue;
      const dir = path.join(exportRoot, d.name);
      const files = await fs.readdir(dir);
      for (const f of files) {
        if (!/\.(pdf|docx)$/i.test(f)) continue;
        fsFiles.push(path.join(dir, f));
      }
    }
  } catch {
    // no exports folder
  }

  const fsOrphan = fsFiles.filter(p => !recordedPaths.has(p));

  // Report
  for (const r of dbStale) {
    console.log(`DB-STALE  doc-${r.doc_id}  ${r.kind}  ${r.path || '(no path)'}`);
  }
  for (const p of fsOrphan) {
    const rel = p.startsWith(exportRoot) ? path.relative(exportRoot, p) : p;
    console.log(`FS-ORPHAN ${rel}`);
  }

  console.log(JSON.stringify({ dbStale: dbStale.length, fsOrphan: fsOrphan.length }, null, 2));

  // Optional destructive actions
  if (deleteDbStale && dbStale.length) {
    for (const r of dbStale) {
      db.prepare(`DELETE FROM proofs WHERE id = ?`).run(r.id);
      if (verbose) console.log(`- deleted DB row id=${r.id} (doc-${r.doc_id}, ${r.kind})`);
    }
  }

  if (deleteOrphanFiles && fsOrphan.length) {
    for (const p of fsOrphan) {
      await fs.rm(p, { force: true });
      if (verbose) console.log(`- deleted file ${p}`);
    }
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
