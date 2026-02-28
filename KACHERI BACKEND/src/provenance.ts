// KACHERI BACKEND/src/provenance.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db, repoPath } from "./db";
import { getStorage, readArtifactBuffer } from "./storage";

export type ProvFilters = {
  action?: string;      // e.g., "create", "rename", "export:pdf", "ai:compose", "ai:action"
  limit?: number;       // default 50
  before?: number;      // timestamp cursor (exclusive)
  from?: number;        // start ts (inclusive)
  to?: number;          // end ts (inclusive)
};

export async function recordProvenance(opts: {
  docId: string;
  action: string;
  actor: string; // "human" | "system" | "ai"
  actorId?: string | null;
  workspaceId?: string | null;
  details?: any;
}): Promise<{ id: number; ts: number }> {
  const ts = Date.now();
  const info = await db.run(
    `INSERT INTO provenance (doc_id, action, actor, actor_id, workspace_id, ts, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.docId,
      opts.action,
      opts.actor,
      opts.actorId ?? null,
      opts.workspaceId ?? null,
      ts,
      opts.details ? JSON.stringify(opts.details) : null,
    ]
  );
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
export async function listProvenance(docId: string, f: ProvFilters = {}): Promise<any[]> {
  const limit = Math.min(f.limit ?? 50, 200);

  const byTs = (a: any, b: any) =>
    a.ts === b.ts ? (b.id - a.id) : (b.ts - a.ts);

  const inRange = (ts: number) =>
    (f.before ? ts < f.before : true) &&
    (f.from ? ts >= f.from : true) &&
    (f.to ? ts <= f.to : true);

  // 1) Provenance table
  const where: string[] = ["doc_id = ?"];
  const params: any[] = [docId];
  if (f.before) { where.push("ts < ?"); params.push(f.before); }
  if (f.from)   { where.push("ts >= ?"); params.push(f.from); }
  if (f.to)     { where.push("ts <= ?"); params.push(f.to); }

  const sql = `
    SELECT id, doc_id as docId, action, actor, ts,
           COALESCE(details,'null') as details
    FROM provenance
    WHERE ${where.join(" AND ")}
    ORDER BY ts DESC
    LIMIT 500
  `;
  const provRowsRaw = await db.queryAll<any>(sql, params);
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

  const proofs = await db.queryAll<{
    id: number;
    doc_id: string;
    kind: string | null;
    hash: string | null;
    meta: string | null;
    ts: number;
  }>(
    `SELECT id, doc_id, kind, hash, meta, ts
     FROM proofs
     WHERE doc_id = ? AND kind IN (${aiKinds.map(() => '?').join(',')})
     ORDER BY ts DESC
     LIMIT 500`,
    [docId, ...aiKinds]
  );

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

/**
 * Canvas-scoped provenance timeline.
 * Queries provenance rows where details.canvasId matches,
 * plus canvas AI proof rows from the proofs table.
 * Same merge/dedupe pattern as listProvenance.
 */
export async function listCanvasProvenance(canvasId: string, f: ProvFilters = {}): Promise<any[]> {
  const limit = Math.min(f.limit ?? 50, 200);

  const byTs = (a: any, b: any) =>
    a.ts === b.ts ? (b.id - a.id) : (b.ts - a.ts);

  const inRange = (ts: number) =>
    (f.before ? ts < f.before : true) &&
    (f.from ? ts >= f.from : true) &&
    (f.to ? ts <= f.to : true);

  // 1) Provenance table: canvas ops stored with json_extract on details
  const where: string[] = ["json_extract(details, '$.canvasId') = ?"];
  const params: any[] = [canvasId];
  if (f.before) { where.push("ts < ?"); params.push(f.before); }
  if (f.from)   { where.push("ts >= ?"); params.push(f.from); }
  if (f.to)     { where.push("ts <= ?"); params.push(f.to); }

  const sql = `
    SELECT id, doc_id as docId, action, actor, ts,
           COALESCE(details,'null') as details
    FROM provenance
    WHERE ${where.join(" AND ")}
    ORDER BY ts DESC
    LIMIT 500
  `;
  const provRowsRaw = await db.queryAll<any>(sql, params);
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

  // 2) Canvas proof rows (design:* kinds)
  const designKinds = [
    "design:generate",
    "design:edit",
    "design:style",
    "design:content",
    "design:compose",
    "design:export",
    "design:image",
  ] as const;

  const proofs = await db.queryAll<{
    id: number;
    doc_id: string;
    kind: string | null;
    hash: string | null;
    meta: string | null;
    ts: number;
  }>(
    `SELECT id, doc_id, kind, hash, meta, ts
     FROM proofs
     WHERE kind IN (${designKinds.map(() => '?').join(',')})
       AND json_extract(meta, '$.canvasId') = ?
     ORDER BY ts DESC
     LIMIT 500`,
    [...designKinds, canvasId]
  );

  const aiRows = proofs
    .map((p) => ({
      id: Number(p.id),
      docId: String(p.doc_id),
      action: String(p.kind || "design:generate"),
      actor: "ai",
      ts: Number(p.ts),
      details: withProofHash(safeParseJson(p.meta), String(p.hash || "")),
    }))
    .filter((r) => inRange(r.ts))
    .filter((r) => (!f.action ? true : matchActionFilter(r.action, f.action)));

  // 2b) Dedupe key-set
  const aiKeys = new Set<string>();
  for (const r of aiRows) {
    const h = (r as any)?.details?.proofHash;
    if (typeof h === "string" && h.length) {
      aiKeys.add(`${canvasId}|${r.action}|${h}`);
    }
  }

  const provDeduped = provRows.filter((r) => {
    if (!r.action.startsWith("design:")) return true;
    const h = (r as any)?.details?.proofHash;
    if (typeof h !== "string" || !h.length) return true;
    const key = `${canvasId}|${r.action}|${h}`;
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
export async function writeProofPacket(...args: any[]) {
  const isNewStyle = args.length === 2 && typeof args[0] === "string";
  if (isNewStyle) {
    const [docId, packet] = args as [string, any];
    const type = String(packet?.type || packet?.kind || "proof");
    const wsId = packet?.workspaceId ?? null;
    const { onDisk, storageKey } = await writeProofJson(docId, type, packet, wsId);
    const sha = sha256(JSON.stringify(packet));
    await db.run(
      `INSERT INTO proofs (doc_id, type, sha256, path, payload, ts, created_by, workspace_id, storage_key, storage_provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        type,
        sha,
        onDisk,
        JSON.stringify(packet),
        Date.now(),
        packet?.createdBy ?? packet?.actorId ?? null,
        wsId,
        storageKey,
        getStorage().type,
      ]
    );
    return { ts: Date.now(), path: onDisk, sha256: sha, storageKey };
  }

  // legacy shape
  const opts = args[0] as {
    docId: string;
    relatedProvenanceId: number | null;
    type: string;
    filePath?: string | null;
    payload: any;
  };
  const wsId = opts.payload?.workspaceId ?? null;
  const { onDisk, storageKey } = await writeProofJson(opts.docId, opts.type, opts.payload, wsId);
  const sha = sha256(JSON.stringify(opts.payload));
  await db.run(
    `INSERT INTO proofs (doc_id, related_provenance_id, type, sha256, path, payload, ts, created_by, workspace_id, storage_key, storage_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.docId,
      opts.relatedProvenanceId ?? null,
      opts.type,
      sha,
      opts.filePath || onDisk,
      JSON.stringify(opts.payload),
      Date.now(),
      opts.payload?.createdBy ?? opts.payload?.actorId ?? null,
      wsId,
      storageKey,
      getStorage().type,
    ]
  );
  return { ts: Date.now(), path: onDisk, sha256: sha, storageKey };
}

async function writeProofJson(
  docId: string,
  type: string,
  payload: any,
  workspaceId?: string | null
): Promise<{ onDisk: string; storageKey: string }> {
  const ts = Date.now();
  const safeType = String(type || "proof").replace(/[^a-z0-9._-]/gi, "_");
  const filename = `${ts}-${safeType}.json`;

  // Workspace-scoped storage key
  const wsPrefix = workspaceId || "_global";
  const storageKey = `${wsPrefix}/proofs/doc-${docId}/${filename}`;

  const data = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  await getStorage().write(storageKey, data, "application/json");

  // Compute legacy onDisk path for backward compat (DB `path` column)
  const proofsDir = repoPath("data/proofs", `doc-${docId}`);
  const onDisk = path.resolve(proofsDir, filename);

  return { onDisk, storageKey };
}

/**
 * Convenience insert for normalized proofs (kind/hash/path/meta).
 * Accepts either { docId, ... } or { doc_id, ... }.
 */
export async function recordProof(opts: {
  docId?: string;
  doc_id?: string;
  kind: string;
  hash: string;
  path: string;
  meta?: any;
  createdBy?: string | null;
  workspaceId?: string | null;
  storageKey?: string | null;
  storageProvider?: string | null;
}): Promise<{ doc_id: string; ts: number }> {
  const doc_id = String(opts.docId ?? opts.doc_id ?? "");
  const ts = Date.now();

  // Derive storage_key if not explicitly provided
  let storageKey = opts.storageKey ?? (opts.meta as any)?.storageKey ?? null;
  if (!storageKey && opts.path) {
    const wsPrefix = opts.workspaceId ?? (opts.meta as any)?.workspaceId ?? "_global";
    const safeKind = String(opts.kind || "proof").replace(/[^a-z0-9._-]/gi, "_");
    const basename = path.basename(opts.path);
    storageKey = `${wsPrefix}/proofs/doc-${doc_id}/${basename || `${ts}-${safeKind}`}`;
  }

  const storageProvider = opts.storageProvider ?? (opts.meta as any)?.storageProvider ?? getStorage().type;

  await db.run(
    `INSERT INTO proofs (doc_id, kind, hash, path, meta, ts, created_by, workspace_id, storage_key, storage_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      doc_id,
      String(opts.kind),
      String(opts.hash),
      String(opts.path),
      opts.meta ? JSON.stringify(opts.meta) : null,
      ts,
      opts.createdBy ?? null,
      opts.workspaceId ?? null,
      storageKey,
      storageProvider,
    ]
  );
  return { doc_id, ts };
}

export async function listExports(docId: string) {
  const rows = await db.queryAll<any>(
    `SELECT id, ts, sha256, path, storage_key, payload
     FROM proofs
     WHERE doc_id = ? AND type = 'export:pdf'
     ORDER BY ts DESC`,
    [docId]
  );

  const results = [];
  for (const r of rows) {
    let verified = false;
    const buf = await readArtifactBuffer(r.storage_key, r.path);
    if (buf) {
      verified = sha256(buf) === r.sha256;
    }
    results.push({
      id: r.id,
      ts: r.ts,
      sha256: r.sha256,
      path: r.path,
      verified,
      proof: JSON.parse(r.payload),
    });
  }
  return results;
}
