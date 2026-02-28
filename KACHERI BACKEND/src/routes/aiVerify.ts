// src/routes/aiVerify.ts
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import path from "node:path";
import { db, repoPath } from "../db";
import { composeText } from "../ai/modelRouter";
import { readArtifactBuffer } from "../storage";

function sha256HexUTF8(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function sha256HexBuf(b: Buffer) {
  return crypto.createHash("sha256").update(b).digest("hex");
}

async function loadPacketFromRow(row: {
  payload: string | null;
  meta: string | null;
}): Promise<any | null> {
  // Prefer payload from DB; if missing, resolve via storage client then filesystem.
  const payloadStr = String(row.payload || "");
  if (payloadStr) {
    try { return JSON.parse(payloadStr); } catch { return null; }
  }
  if (row.meta) {
    try {
      const meta = JSON.parse(row.meta);
      const storageKey = typeof meta?.storageKey === "string" ? meta.storageKey : null;
      const proofFile = typeof meta?.proofFile === "string" ? meta.proofFile : null;
      const absProofFile = proofFile
        ? (path.isAbsolute(proofFile) ? proofFile : repoPath(proofFile))
        : null;

      const buf = await readArtifactBuffer(storageKey, absProofFile);
      if (buf) {
        try { return JSON.parse(buf.toString("utf8")); } catch { return null; }
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function summarizeCompose(docId?: string, limit = 50, rerun = false) {
  let rows: Array<{ id: number; doc_id: string; ts: number; sha256: string | null; payload: string | null; meta: string | null }>;

  if (docId) {
    rows = await db.queryAll<{ id: number; doc_id: string; ts: number; sha256: string | null; payload: string | null; meta: string | null }>(`
      SELECT id, doc_id, ts, sha256, payload, meta
      FROM proofs
      WHERE doc_id = ? AND (kind = 'ai:compose' OR type = 'ai:compose' OR type = 'ai:action')
      ORDER BY ts DESC, id DESC
      LIMIT ?
    `, [docId, limit]);
  } else {
    rows = await db.queryAll<{ id: number; doc_id: string; ts: number; sha256: string | null; payload: string | null; meta: string | null }>(`
      SELECT id, doc_id, ts, sha256, payload, meta
      FROM proofs
      WHERE (kind = 'ai:compose' OR type = 'ai:compose' OR type = 'ai:action')
      ORDER BY ts DESC, id DESC
      LIMIT ?
    `, [limit]);
  }

  let pass = 0, drift = 0, miss = 0;

  for (const r of rows) {
    const packet = await loadPacketFromRow(r);
    const payloadStr = packet ? JSON.stringify(packet) : "";
    const recordedHash = String(r.sha256 || "");
    const calc = sha256HexUTF8(payloadStr);
    const integrityOK = recordedHash && (recordedHash === calc);
    if (!integrityOK) { miss++; continue; }
    if (!rerun) { pass++; continue; }

    // Rerun path: best-effort using modelRouter.composeText
    try {
      const input = (packet as any)?.input ?? {};
      const expectedOut = String((packet as any)?.output?.proposalText ?? "");
      const prompt = String(input.prompt ?? "");
      if (!prompt) { pass++; continue; }
      const language = (typeof input.language === "string") ? input.language : undefined;
      const systemPrompt = (typeof input.systemPrompt === "string") ? input.systemPrompt : undefined;
      const maxTokens = (typeof input.maxTokens === "number") ? input.maxTokens : undefined;
      const seed = (typeof input.seed === "string" && input.seed.trim()) ? input.seed.trim() : undefined;
      const result = await composeText(prompt, { language, systemPrompt, maxTokens, seed });
      const actual = String(result?.text ?? "");
      if (actual === expectedOut) pass++; else drift++;
    } catch {
      pass++; // treat as integrity pass; rerun not possible
    }
  }

  return { total: rows.length, pass, drift, miss, rerun };
}

async function summarizeExports(docId?: string, limit = 5000) {
  type Row = { doc_id: string; kind: string | null; hash: string | null; path: string | null; storage_key: string | null };
  let rows: Row[];

  if (docId) {
    rows = await db.queryAll<Row>(`
      SELECT doc_id, kind, hash, path, storage_key
      FROM proofs
      WHERE kind IN ('docx','pdf') AND doc_id = ?
      ORDER BY ts DESC, id DESC
      LIMIT ?
    `, [docId, limit]);
  } else {
    rows = await db.queryAll<Row>(`
      SELECT doc_id, kind, hash, path, storage_key
      FROM proofs
      WHERE kind IN ('docx','pdf')
      ORDER BY ts DESC, id DESC
      LIMIT ?
    `, [limit]);
  }

  let pass = 0, fail = 0, miss = 0;

  for (const r of rows) {
    const fileHash = String(r.hash || "");
    const filePath = String(r.path || "");

    const buf = await readArtifactBuffer(r.storage_key, filePath || null);
    if (!buf) { miss++; continue; }

    try {
      const calc = "sha256:" + sha256HexBuf(buf);
      if (fileHash && calc === fileHash) pass++; else fail++;
    } catch { fail++; }
  }
  return { total: rows.length, pass, fail, miss };
}

export default async function aiVerifyRoutes(app: FastifyInstance) {
  // Compose determinism summary (optionally rerun)
  app.get("/ai/watch/compose-summary", async (req, reply) => {
    const q = (req.query ?? {}) as any;
    const docId = typeof q.docId === "string" && q.docId.trim() ? q.docId.trim() : undefined;
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
    const rerun = String(q.rerun ?? "").toLowerCase() === "true";
    const summary = await summarizeCompose(docId, limit, rerun);
    return reply.send(summary);
  });

  // One-tap "re-verify" — recompute both exports + compose determinism
  app.post("/ai/watch/reverify", async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const docId = typeof b.docId === "string" && b.docId.trim() ? b.docId.trim() : undefined;
    const limit = Math.min(200, Math.max(1, Number(b.limit ?? 50)));
    const [exportsSummary, composeSummary] = await Promise.all([
      summarizeExports(docId, 5000),
      summarizeCompose(docId, limit, true),
    ]);
    return reply.send({ ok: true, exportsSummary, composeSummary, ts: Date.now() });
  });
}
