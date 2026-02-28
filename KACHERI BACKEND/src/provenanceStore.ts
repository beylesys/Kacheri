// src/provenanceStore.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db } from "./db";
import { getStorage } from "./storage";
// NEW: workspace broadcast
import { wsBroadcast } from "./realtime/globalHub";

// Keep dual-write to the old NDJSON log so nothing is lost during the transition.
const NDJSON_PATH = path.resolve(process.cwd(), "data", "provenance.log");

// Accept ANY action string (e.g., "export:pdf"), not just a fixed union.
export type ProvenanceAction = string;

export type ActorType = "human" | "ai" | "system";

export interface ProvenanceEntry {
  id: string;
  doc_id: string;
  action: ProvenanceAction;
  actor_type: ActorType;
  actor_id?: string | null;
  payload?: any;
  proof_id?: string | null;
  proof_hash?: string | null;
  ts: number; // unix ms
}

export interface ProofRow {
  id: string;
  doc_id: string;
  kind: string; // e.g., "pdf"
  hash: string; // expected to be 'sha256:<hex>' of the exported file bytes (or output text)
  path: string; // repo-relative/absolute path to export ('' for text-only proofs)
  ts: number;
  meta?: any;
}

/** Utility: UUID */
function uid() {
  // @ts-ignore
  return (
    (crypto.randomUUID && crypto.randomUUID()) ||
    `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

/** Utility: safe JSON.parse */
function parseJSON<T = any>(v: any): T | null {
  if (v == null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** Dual-write helper: append a line to data/provenance.log as NDJSON */
function appendNdjson(entry: ProvenanceEntry) {
  try {
    const dir = path.dirname(NDJSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(NDJSON_PATH, JSON.stringify(entry) + "\n", {
      encoding: "utf8",
    });
  } catch {
    // If file-write fails, DB remains source of truth.
  }
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

async function getTableColumns(table: string): Promise<Set<string>> {
  try {
    const rows = await db.queryAll<{ name: string }>(`PRAGMA table_info('${table}')`);
    return new Set(rows.map((r) => r.name));
  } catch {
    return new Set<string>();
  }
}

function sha256Hex(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function stripSha256Prefix(
  maybePrefixed: string | null | undefined
): string | null {
  if (!maybePrefixed) return null;
  const s = String(maybePrefixed);
  const parts = s.split(":");
  if (parts.length === 2 && parts[0].toLowerCase() === "sha256") return parts[1];
  return s; // already hex
}

/* -------------------------------------------------------------------------- */
/* Provenance (kept for backward compatibility; writes to NDJSON only)        */
/* NOTE: The canonical provenance DB writer lives in src/provenance.ts.       */
/* -------------------------------------------------------------------------- */

/** Write a provenance entry to NDJSON; DB writing is handled in src/provenance.ts */
export function recordProvenance(
  _e: Omit<ProvenanceEntry, "id" | "ts"> & { ts?: number }
): ProvenanceEntry {
  const entry: ProvenanceEntry = {
    id: uid(),
    ts: Date.now(),
    doc_id: _e.doc_id,
    action: _e.action,
    actor_type: _e.actor_type,
    actor_id: _e.actor_id ?? null,
    payload: _e.payload ?? null,
    proof_id: _e.proof_id ?? null,
    proof_hash: _e.proof_hash ?? null,
  };
  appendNdjson(entry);
  return entry;
}

/* -------------------------------------------------------------------------- */
/* Proofs                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Record a proof (e.g., a generated PDF) into the proofs table.
 * - Avoids setting `id` (INTEGER PRIMARY KEY) to prevent datatype mismatch.
 * - Dual-writes legacy columns (type/sha256/payload) and new columns (kind/hash/meta).
 * - If meta.proofFile is present, payload is loaded from that JSON; otherwise a minimal packet is synthesized.
 * - If meta.workspaceId is present, emits a workspace `proof_added` broadcast.
 */
export async function recordProof(
  p: Omit<ProofRow, "id" | "ts"> & { ts?: number }
): Promise<ProofRow> {
  const cols = await getTableColumns("proofs");

  const ts = p.ts ?? Date.now();
  const legacyType = p.kind === "pdf" ? "export:pdf" : p.kind; // map kind→type
  let payloadStr: string;

  // Prefer the proof packet JSON written by the caller (server.ts) if available.
  const proofFile = (p.meta as any)?.proofFile as string | undefined;
  if (proofFile && fs.existsSync(proofFile)) {
    try {
      payloadStr = fs.readFileSync(proofFile, "utf8");
    } catch {
      // fallback to synthesized packet
      payloadStr = JSON.stringify(
        {
          artifactId: p.doc_id,
          action: legacyType,
          timestamp: new Date(ts).toISOString(),
          input: (p.meta as any)?.input ?? null,
          output: { pdfHash: p.hash, path: p.path },
          runtime: { source: "server:provenanceStore" },
        },
        null,
        2
      );
    }
  } else {
    payloadStr = JSON.stringify(
      {
        artifactId: p.doc_id,
        action: legacyType,
        timestamp: new Date(ts).toISOString(),
        input: (p.meta as any)?.input ?? null,
        output: { pdfHash: p.hash, path: p.path },
        runtime: { source: "server:provenanceStore" },
      },
      null,
      2
    );
  }

  const payloadSha256 = sha256Hex(Buffer.from(payloadStr, "utf8"));
  const pdfSha256Hex = stripSha256Prefix(p.hash) ?? "";

  // Build INSERT statement dynamically to match whatever columns exist.
  const insertCols: string[] = [];
  const paramValues: any[] = [];

  function add(col: string, value: any) {
    insertCols.push(col);
    paramValues.push(value);
  }

  // Common columns
  if (cols.has("doc_id")) add("doc_id", p.doc_id);
  if (cols.has("path")) add("path", p.path);
  if (cols.has("ts")) add("ts", ts);

  // Legacy schema columns
  if (cols.has("type")) add("type", legacyType);
  if (cols.has("sha256")) add("sha256", payloadSha256);
  if (cols.has("payload")) add("payload", payloadStr);
  if (cols.has("related_provenance_id")) add("related_provenance_id", null);

  // New schema columns
  if (cols.has("kind")) add("kind", p.kind);
  if (cols.has("hash")) add("hash", p.hash);
  if (cols.has("meta")) {
    let metaStr: string | null = null;
    if (p.meta != null) {
      try {
        metaStr = JSON.stringify(p.meta);
      } catch {
        metaStr = null;
      }
    }
    add("meta", metaStr);
  }

  // Gap 1 & 2: user tracking and workspace scoping
  if (cols.has("created_by")) {
    add("created_by", (p.meta as any)?.createdBy ?? (p.meta as any)?.actorId ?? (p.meta as any)?.userId ?? null);
  }
  if (cols.has("workspace_id")) {
    add("workspace_id", (p.meta as any)?.workspaceId ?? null);
  }

  // Storage client columns — always derive storage_key when not in meta
  if (cols.has("storage_key")) {
    let storageKey = (p.meta as any)?.storageKey ?? null;
    if (!storageKey && p.path) {
      const wsPrefix = (p.meta as any)?.workspaceId ?? "_global";
      const basename = path.basename(p.path);
      storageKey = `${wsPrefix}/proofs/doc-${p.doc_id}/${basename || `${ts}-${p.kind}`}`;
    }
    add("storage_key", storageKey);
  }
  if (cols.has("storage_provider")) {
    add("storage_provider", (p.meta as any)?.storageProvider ?? getStorage().type);
  }

  // Safety: ensure we at least have doc_id and ts to avoid empty INSERTs
  if (insertCols.length === 0) {
    throw new Error("proofs table not found or has no expected columns");
  }

  const colsSql = insertCols.join(", ");
  const valsSql = insertCols.map(() => "?").join(", ");
  const sql = `INSERT INTO proofs (${colsSql}) VALUES (${valsSql})`;

  const info = await db.run(sql, paramValues);

  // Return a normalized ProofRow object for callers
  const out: ProofRow = {
    id: String(info.lastInsertRowid ?? ""),
    doc_id: p.doc_id,
    kind: p.kind,
    hash: p.hash,
    path: p.path,
    ts,
    meta: p.meta ?? null,
  };

  // Optional: broadcast to workspace if caller provided workspaceId in meta
  try {
    const workspaceId = (p.meta as any)?.workspaceId as string | undefined;
    if (workspaceId) {
      wsBroadcast(workspaceId, {
        type: "proof_added",
        docId: p.doc_id,
        proofId: out.id,
        sha256: p.hash, // may be sha256 of file or output text
        ts,
      });
    }
  } catch {
    // never crash on broadcast
  }

  return out;
}

/** List proofs for a doc (most recent first). Tolerates legacy/new schemas. */
export async function listProofsForDoc(docId: string, limit = 50): Promise<ProofRow[]> {
  const cols = await getTableColumns("proofs");

  // NOTE: use single-quoted string literals inside SQL, not "..."
  const kindExpr =
    cols.has("kind") && cols.has("type")
      ? "COALESCE(kind, CASE WHEN type LIKE 'export:%' THEN substr(type, 8) ELSE type END) AS kind"
      : cols.has("kind")
      ? "kind"
      : cols.has("type")
      ? "CASE WHEN type LIKE 'export:%' THEN substr(type, 8) ELSE type END AS kind"
      : "NULL AS kind";

  // Prefer new `hash` (sha256:<hex> of exported file). Legacy `sha256` is payload JSON hash;
  // we still return it if `hash` is absent by prefixing with 'payload:'.
  const hashExpr =
    cols.has("hash") && cols.has("sha256")
      ? "COALESCE(hash, 'payload:' || sha256) AS hash"
      : cols.has("hash")
      ? "hash"
      : cols.has("sha256")
      ? "'payload:' || sha256 AS hash"
      : "NULL AS hash";

  const metaExpr =
    cols.has("meta") && cols.has("payload")
      ? "COALESCE(meta, payload) AS meta"
      : cols.has("meta")
      ? "meta"
      : cols.has("payload")
      ? "payload AS meta"
      : "NULL AS meta";

  const sql = `
    SELECT id, doc_id, ${kindExpr}, ${hashExpr}, path, ts, ${metaExpr}
    FROM proofs
    WHERE doc_id = ?
    ORDER BY ts DESC, id DESC
    LIMIT ?
  `;

  const rows = await db.queryAll<any>(sql, [docId, limit]);

  return rows.map((r) => ({
    id: String(r.id ?? ""),
    doc_id: r.doc_id,
    kind: r.kind ?? null,
    hash: r.hash ?? null,
    path: r.path ?? "",
    ts: Number(r.ts),
    meta: parseJSON(r.meta),
  }));
}
