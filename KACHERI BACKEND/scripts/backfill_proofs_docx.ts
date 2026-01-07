// scripts/backfill_proofs_docx.ts
// Purpose: Scan storage/exports/doc-*/ for .docx files not yet recorded in the proofs table,
// and insert normalized DOCX proof rows. Safe flags: --dry-run, --doc=<id>
//
// Usage:
//   npx ts-node scripts/backfill_proofs_docx.ts --dry-run
//   npx ts-node scripts/backfill_proofs_docx.ts
//   npx ts-node scripts/backfill_proofs_docx.ts --doc=123abc
//
// Notes:
// - Only affects .docx (we normalized DOCX in the exporter). PDF parity is tracked via replay.  :contentReference[oaicite:3]{index=3}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db, repoPath } from '../src/db';
import { recordProof } from '../src/provenanceStore';

type Flags = { dryRun: boolean; doc?: string; verbose: boolean };

function parseFlags(argv: string[]): Flags {
  const f: Flags = { dryRun: false, verbose: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run' || a === '--dry') f.dryRun = true;
    else if (a.startsWith('--doc=')) f.doc = a.split('=')[1];
    else if (a === '--verbose' || a === '-v') f.verbose = true;
  }
  return f;
}

function sha256Hex(buf: Buffer) {
  return createHash('sha256').update(buf).digest('hex');
}

async function* walkDocs(exportRoot: string, onlyDoc?: string) {
  const entries = await fs.readdir(exportRoot, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!ent.name.startsWith('doc-')) continue;
    const docId = ent.name.slice(4);
    if (onlyDoc && docId !== onlyDoc) continue;
    yield { docId, dir: path.join(exportRoot, ent.name) };
  }
}

async function main() {
  const { dryRun, doc: onlyDoc, verbose } = parseFlags(process.argv);
  const exportRoot = repoPath('storage', 'exports');

  // Quick sanity: ensure table exists enough to SELECT.
  db.prepare('SELECT 1').get();

  let inspected = 0, inserted = 0, skipped = 0, errors = 0;

  try {
    await fs.access(exportRoot);
  } catch {
    console.log(`No exports found at ${exportRoot}. Nothing to backfill.`);
    return;
  }

  for await (const { docId, dir } of walkDocs(exportRoot, onlyDoc)) {
    const files = await fs.readdir(dir);
    const docxFiles = files.filter(f => /\.docx$/i.test(f));
    if (docxFiles.length === 0 && verbose) {
      console.log(`doc-${docId}: no .docx files`);
    }
    for (const f of docxFiles) {
      inspected++;
      const abs = path.join(dir, f);
      try {
        const buf = await fs.readFile(abs);
        const hash = 'sha256:' + sha256Hex(buf);

        // Skip if an identical proof already exists
        const dup = db.prepare(`
          SELECT id FROM proofs
          WHERE doc_id = ? AND kind = 'docx' AND hash = ?
          LIMIT 1
        `).get(docId, hash) as { id: number } | undefined;

        if (dup) {
          skipped++;
          if (verbose) console.log(`= doc-${docId}: ${f} (already recorded)`);
          continue;
        }

        if (dryRun) {
          console.log(`[DRY] would record: doc-${docId} ${f} ${hash}`);
        } else {
          await recordProof({
            doc_id: docId,
            kind: 'docx',
            hash,
            path: abs,
            meta: {
              source: 'backfill',
              filename: f,
              bytes: buf.length
            }
          });
          inserted++;
          console.log(`+ doc-${docId}: ${f}`);
        }
      } catch (e: any) {
        errors++;
        console.error(`! failed doc-${docId}: ${f} → ${e?.message || e}`);
      }
    }
  }

  console.log(JSON.stringify({ inspected, inserted, skipped, errors }, null, 2));
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
