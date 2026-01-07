// KACHERI BACKEND/src/provenance.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db, repoPath } from "./db";

export type ProvFilters = {
  action?: string;      // e.g., "create", "rename", "export:pdf", "ai:compose", "ai:action"
  limit?: number;       // default 50
  before?: number;      // timestamp cursor (exclusive)
  from?: number;        // start ts (inclusive)
  to?: number;          // end ts (inclusive)
};

export function recordProvenance(opts: {
  docId: string;
  action: string;
  actor: string; // "human" | "system" | "ai"
  details?: any;
}) {
  const ts = Date.now();
  const stmt = db.prepare(
    `INSERT INTO provenance (doc_id, action, actor, ts, details)
     VALUES (@doc_id, @action, @actor, @ts, @details)`
  );
  const info = stmt.run({
    doc_id: opts.docId,
    action: opts.action,
    actor: opts.actor,
    ts,
    details: opts.details ? JSON.stringify(opts.details) : null,
  });
  return { id: Number(info.lastInsertRowid), ts };
}

/**
 * Production-grade timeline:
 * - Primary source: provenance rows (human/system/ai).
 * - Plus AI proof rows from `proofs` where kind IN (compose/rewrites),
 *   so AI operations appear even if a provenance row wasn't written.
 * - Supports filters and cursors. Results are newest-first.
 * - Dedupe: if a provenance row and a proof row share the same
 *   (docId, action, proofHash), we keep the proof-backed row only.
 */
export function listProvenance(docId: string, f: ProvFilters = {}) {
  const limit = Math.min(f.limit ?? 50, 200);

  const byTs = (a: any, b: any) =>
    a.ts === b.ts ? (b.id - a.id) : (b.ts - a.ts);

  const inRange = (ts: number) =>
    (f.before ? ts < f.before : true) &&
    (f.from ? ts >= f.from : true) &&
    (f.to ? ts <= f.to : true);

  // 1) Provenance table
  const params: any = { doc_id: docId };
  const where: string[] = ["doc_id = @doc_id"];
  if (f.before) { where.push("ts < @before"); params.before = f.before; }
  if (f.from)   { where.push("ts >= @from");  params.from = f.from; }
  if (f.to)     { where.push("ts <= @to");    params.to = f.to; }

  const sql = `
    SELECT id, doc_id as docId, action, actor, ts,
           COALESCE(details,'null') as details
    FROM provenance
    WHERE ${where.join(" AND ")}
    ORDER BY ts DESC
    LIMIT 500
  `;
  const provRowsRaw = db.prepare(sql).all(params) as Array<any>;
  const provRows = provRowsRaw
    .map((r: any) => ({
      id: Number(r.id),
      docId: String(r.docId),
      action: String(r.action),
      actor: String(r.actor),
      ts: Number(r.ts),
      details: safeParseJson(r.details),
    }))
    .filter(r => (!f.action ? true : matchActionFilter(r.action, f.action)));

  // 2) AI proof rows (compose + rewrites)
  const aiKinds = [
    "ai:compose",
    "ai:rewriteSelection",
    "ai:constrainedRewrite",
    "ai:rewriteConstrained",
  ] as const;

  const proofs = db.prepare(`
    SELECT id, doc_id, kind, hash, meta, ts
    FROM proofs
    WHERE doc_id = ? AND kind IN (${aiKinds.map(() => '?').join(',')})
    ORDER BY ts DESC
    LIMIT 500
  `).all(
    docId,
    ...aiKinds
  ) as Array<{
    id: number;
    doc_id: string;
    kind: string | null;
    hash: string | null;
    meta: string | null;
    ts: number;
  }>;

  const aiRows = proofs
    .map((p) => ({
      id: Number(p.id),
      docId: String(p.doc_id),
      action: String(p.kind || "ai:action"),
      actor: "ai",
      ts: Number(p.ts),
      details: withProofHash(safeParseJson(p.meta), String(p.hash || "")),
    }))
    .filter((r) => inRange(r.ts))
    .filter((r) => (!f.action ? true : matchActionFilter(r.action, f.action)));

  // 2b) Build a key-set of proof-backed AI actions for dedupe:
  // key = `${docId}|${action}|${proofHash}`
  const aiKeys = new Set<string>();
  for (const r of aiRows) {
    const h = (r as any)?.details?.proofHash;
    if (typeof h === "string" && h.length) {
      aiKeys.add(`${r.docId}|${r.action}|${h}`);
    }
  }

  // 2c) Drop provenance AI rows that are clearly backed by a proof row.
  // - Non-AI provenance rows are always kept (create/rename/delete/export/etc).
  // - AI provenance rows without a proofHash are kept as-is (older data).
  const provDeduped = provRows.filter((r) => {
    if (!r.action.startsWith("ai:")) return true;
    const h = (r as any)?.details?.proofHash;
    if (typeof h !== "string" || !h.length) return true;
    const key = `${r.docId}|${r.action}|${h}`;
    return !aiKeys.has(key);
  });

  // 3) Merge, sort, limit
  const merged = [...provDeduped, ...aiRows].sort(byTs).slice(0, limit);
  return merged;
}

function matchActionFilter(action: string, filter: string) {
  if (!filter) return true;
  if (filter === "ai:action") return action.startsWith("ai:");
  return action === filter;
}

function safeParseJson(s: unknown) {
  if (s == null) return null;
  try {
    return typeof s === "string" ? JSON.parse(s) : s;
  } catch {
    return { raw: String(s) };
  }
}

function withProofHash(details: any, hash: string) {
  if (!details) return { proofHash: hash };
  try {
    return { ...details, proofHash: hash };
  } catch {
    return { proofHash: hash };
  }
}

// ------- legacy + new helpers (compat) -------

export function sha256(buf: Buffer | string) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

/**
 * Back-compat wrapper:
 *  - legacy call: writeProofPacket({ docId, relatedProvenanceId, type, filePath?, payload })
 *  - new call:    writeProofPacket(docId, packet)
 * Writes JSON proof to data/proofs/doc-<id>/ and inserts into proofs(type/sha256/path/payload/ts).
 */
export function writeProofPacket(...args: any[]) {
  const isNewStyle = args.length === 2 && typeof args[0] === "string";
  if (isNewStyle) {
    const [docId, packet] = args as [string, any];
    const type = String(packet?.type || packet?.kind || "proof");
    const onDisk = writeProofJson(docId, type, packet);
    const sha = sha256(JSON.stringify(packet));
    db.prepare(`
      INSERT INTO proofs (doc_id, type, sha256, path, payload, ts)
      VALUES (@doc_id, @type, @sha, @path, @payload, @ts)
    `).run({
      doc_id: docId,
      type,
      sha,
      path: onDisk,
      payload: JSON.stringify(packet),
      ts: Date.now(),
    });
    return { ts: Date.now(), path: onDisk, sha256: sha };
  }

  // legacy shape
  const opts = args[0] as {
    docId: string;
    relatedProvenanceId: number | null;
    type: string;
    filePath?: string | null;
    payload: any;
  };
  const onDisk = writeProofJson(opts.docId, opts.type, opts.payload);
  const sha = sha256(JSON.stringify(opts.payload));
  db.prepare(`
    INSERT INTO proofs (doc_id, related_provenance_id, type, sha256, path, payload, ts)
    VALUES (@doc_id, @related, @type, @sha, @path, @payload, @ts)
  `).run({
    doc_id: opts.docId,
    related: opts.relatedProvenanceId ?? null,
    type: opts.type,
    sha,
    path: opts.filePath || onDisk,
    payload: JSON.stringify(opts.payload),
    ts: Date.now(),
  });
  return { ts: Date.now(), path: onDisk, sha256: sha };
}

function writeProofJson(docId: string, type: string, payload: any) {
  const ts = Date.now();
  const proofsDir = repoPath("data/proofs", `doc-${docId}`);
  ensureDir(proofsDir);
  const safeType = String(type || "proof").replace(/[^a-z0-9._-]/gi, "_");
  const filename = `${ts}-${safeType}.json`;
  const onDisk = path.resolve(proofsDir, filename);
  fs.writeFileSync(onDisk, JSON.stringify(payload, null, 2), "utf8");
  return onDisk;
}

/**
 * Convenience insert for normalized proofs (kind/hash/path/meta).
 * Accepts either { docId, ... } or { doc_id, ... }.
 */
export function recordProof(opts: {
  docId?: string;
  doc_id?: string;
  kind: string;
  hash: string;
  path: string;
  meta?: any;
}) {
  const doc_id = String(opts.docId ?? opts.doc_id ?? "");
  const ts = Date.now();
  db.prepare(`
    INSERT INTO proofs (doc_id, kind, hash, path, meta, ts)
    VALUES (@doc_id, @kind, @hash, @path, @meta, @ts)
  `).run({
    doc_id,
    kind: String(opts.kind),
    hash: String(opts.hash),
    path: String(opts.path),
    meta: opts.meta ? JSON.stringify(opts.meta) : null,
    ts,
  });
  return { doc_id, ts };
}

export function listExports(docId: string) {
  const rows = db
    .prepare(
      `SELECT id, ts, sha256, path, payload
       FROM proofs
       WHERE doc_id = @doc_id AND type = 'export:pdf'
       ORDER BY ts DESC`
    )
    .all({ doc_id: docId });

  return rows.map((r: any) => {
    let verified = false;
    if (r.path && fs.existsSync(r.path)) {
      const data = fs.readFileSync(r.path);
      verified = sha256(data) === r.sha256;
    }
    return {
      id: r.id,
      ts: r.ts,
      sha256: r.sha256,
      path: r.path,
      verified,
      proof: JSON.parse(r.payload),
    };
  });
}
