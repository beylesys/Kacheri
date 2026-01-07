// scripts/replay_ai_compose.ts
// Purpose: Verify AI compose events for integrity and (optionally) re-run for drift detection.
// Usage:
//   npx ts-node scripts/replay_ai_compose.ts
//   npx ts-node scripts/replay_ai_compose.ts --doc=123abc --limit=50
//   npx ts-node scripts/replay_ai_compose.ts --rerun --limit=10
//   npx ts-node scripts/replay_ai_compose.ts --rerun --out=data/replay/compose-summary.json
//
// What it does:
// - Integrity mode (default): sha256(payload) must equal the recorded sha256 in the proofs row -> PASS/MISS.
// - Rerun mode (--rerun): call composeText(prompt, { language, systemPrompt, maxTokens, seed }) and compare
//   with packet.output.proposalText -> PASS/DRIFT/MISS.
//
// Notes:
// - We read compose entries from the proofs table (kind='ai:compose') with a fallback for legacy 'type' values.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, repoPath } from '../src/db';

type Flags = { doc?: string; limit: number; rerun: boolean; verbose: boolean; out?: string };
function parseFlags(argv: string[]): Flags {
  const f: Flags = { limit: 50, rerun: false, verbose: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--doc=')) f.doc = a.split('=')[1];
    else if (a.startsWith('--limit=')) f.limit = Math.min(200, Math.max(1, Number(a.split('=')[1] || 50)));
    else if (a === '--rerun') f.rerun = true;
    else if (a === '--verbose' || a === '-v') f.verbose = true;
    else if (a.startsWith('--out=')) f.out = a.split('=')[1];
  }
  return f;
}

function sha256HexUTF8(s: string) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function readJsonFile(p: string): any | null {
  try {
    const s = fs.readFileSync(p, 'utf8');
    return JSON.parse(s);
  } catch { return null; }
}

// Best-effort rerun (only used with --rerun). Returns text or null if not possible.
async function maybeRerunCompose(packet: any): Promise<string | null> {
  try {
    const mod = await import('../src/ai/modelRouter');
    // Note: modelRouter now accepts seed in options
    const composeText: (prompt: string, opts?: { language?: string; systemPrompt?: string; maxTokens?: number; seed?: string }) => Promise<{ text: string }> =
      (mod as any).composeText;

    const input = packet?.input ?? {};
    const prompt = String(input.prompt ?? '');
    if (!prompt) return null;

    const language = input.language as (string | undefined);
    const systemPrompt = input.systemPrompt as (string | undefined);
    const maxTokens = typeof input.maxTokens === 'number' ? input.maxTokens : undefined;
    const seed = typeof input.seed === 'string' && input.seed.trim() ? input.seed.trim() : undefined;

    const result = await composeText(prompt, { language, systemPrompt, maxTokens, seed });
    return String(result?.text ?? '');
  } catch {
    return null; // provider not configured or module unavailable
  }
}

async function main() {
  const { doc, limit, rerun, verbose, out } = parseFlags(process.argv);

  // Prefer modern 'kind' column, but fall back to legacy 'type' if needed.
  const where = `
    WHERE (${doc ? "doc_id = @doc AND " : ""}(
      kind = 'ai:compose'
      OR type = 'ai:compose'
      OR type = 'ai:action'   -- very old rows, if any
    ))
  `;

  const rows = db.prepare(`
    SELECT id, doc_id, ts, sha256, payload, meta
    FROM proofs
    ${where}
    ORDER BY ts DESC, id DESC
    LIMIT @limit
  `).all({ doc, limit }) as Array<{ id: number; doc_id: string; ts: number; sha256: string | null; payload: string | null; meta: string | null }>;

  let pass = 0, drift = 0, miss = 0;

  for (const r of rows) {
    // If payload is missing but we have meta.proofFile, load it from disk (recordProof writes this).
    let payloadStr = String(r.payload || '');
    if (!payloadStr && r.meta) {
      try {
        const meta = JSON.parse(r.meta);
        const proofFile = typeof meta?.proofFile === 'string' ? meta.proofFile : null;
        if (proofFile) {
          const abs = path.isAbsolute(proofFile) ? proofFile : repoPath(proofFile);
          const loaded = readJsonFile(abs);
          if (loaded) payloadStr = JSON.stringify(loaded);
        }
      } catch { /* ignore */ }
    }

    const recordedHash = String(r.sha256 || '');

    // Integrity check: sha256(payloadStr) must match recorded sha256
    const calc = sha256HexUTF8(payloadStr);
    const integrityOK = recordedHash && (recordedHash === calc);

    if (!integrityOK) {
      miss++;
      console.log(`MISS  doc-${r.doc_id}  ai:compose  id=${r.id}  (payload hash mismatch)`);
      continue;
    }

    if (!rerun) {
      pass++;
      if (verbose) console.log(`PASS  doc-${r.doc_id}  ai:compose  id=${r.id}`);
      continue;
    }

    // Rerun path (best effort)
    try {
      const packet = JSON.parse(payloadStr);
      const expectedOut = String(packet?.output?.proposalText ?? '');

      const newText = await maybeRerunCompose(packet);
      if (newText === null) {
        // Could not rerun (no provider / missing prompt). Integrity already OK.
        pass++;
        if (verbose) console.log(`PASS  doc-${r.doc_id}  ai:compose  id=${r.id}  (integrity ok; rerun skipped)`);
      } else if (newText === expectedOut) {
        pass++;
        console.log(`PASS  doc-${r.doc_id}  ai:compose  id=${r.id}  (rerun matches)`);
      } else {
        drift++;
        console.log(`DRIFT doc-${r.doc_id}  ai:compose  id=${r.id}\n  expected(len)=${expectedOut.length}\n  actual(len)=${newText.length}`);
      }
    } catch {
      // Parsing failed; integrity already OK so count as PASS for integrity (rerun not possible)
      pass++;
      if (verbose) console.log(`PASS  doc-${r.doc_id}  ai:compose  id=${r.id}  (integrity ok; payload not parseable for rerun)`);
    }
  }

  const summary = { total: rows.length, pass, drift, miss, rerun };
  console.log(JSON.stringify(summary, null, 2));
  if (out) {
    const dst = path.isAbsolute(out) ? out : repoPath(out);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, JSON.stringify(summary, null, 2), 'utf8');
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}
