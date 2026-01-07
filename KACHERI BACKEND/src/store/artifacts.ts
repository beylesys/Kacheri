// KACHERI BACKEND/src/store/artifacts.ts
// P4.1: Artifacts store - data access layer for proofs/artifacts
//
// The proofs table serves as the artifacts registry with enhanced columns:
// - storage_provider: 'local' | 's3' | 'gcs'
// - storage_key: normalized path within storage provider
// - verified_at: timestamp of last verification
// - verification_status: 'pending' | 'pass' | 'fail' | 'miss'

import { db } from "../db";

/* ---------- Types ---------- */
export type StorageProvider = "local" | "s3" | "gcs";
export type VerificationStatus = "pending" | "pass" | "fail" | "miss";

export interface Artifact {
  id: number;
  docId: string;
  kind: string;
  hash: string;
  path: string | null;
  storageProvider: StorageProvider;
  storageKey: string | null;
  verifiedAt: number | null;
  verificationStatus: VerificationStatus;
  meta: Record<string, unknown>;
  payload: string;
  ts: number;
}

export interface ArtifactRow {
  id: number;
  doc_id: string;
  kind: string;
  hash: string;
  path: string | null;
  storage_provider: string | null;
  storage_key: string | null;
  verified_at: number | null;
  verification_status: string | null;
  meta: string | null;
  payload: string;
  ts: number;
}

export interface CreateArtifactInput {
  docId: string;
  kind: string;
  hash: string;
  path?: string;
  storageProvider?: StorageProvider;
  storageKey?: string;
  meta?: Record<string, unknown>;
  payload: string;
}

export interface ArtifactFilter {
  docId?: string;
  kind?: string;
  storageProvider?: StorageProvider;
  verificationStatus?: VerificationStatus;
  limit?: number;
  offset?: number;
}

/* ---------- Row to Artifact mapper ---------- */
function rowToArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    docId: row.doc_id,
    kind: row.kind ?? "",
    hash: row.hash ?? "",
    path: row.path,
    storageProvider: (row.storage_provider as StorageProvider) ?? "local",
    storageKey: row.storage_key,
    verifiedAt: row.verified_at,
    verificationStatus: (row.verification_status as VerificationStatus) ?? "pending",
    meta: row.meta ? JSON.parse(row.meta) : {},
    payload: row.payload,
    ts: row.ts,
  };
}

/* ---------- Store Implementation ---------- */

/** Create a new artifact (proof) record */
export function createArtifact(input: CreateArtifactInput): Artifact {
  const now = Date.now();
  const meta = input.meta ? JSON.stringify(input.meta) : null;

  const stmt = db.prepare(`
    INSERT INTO proofs (
      doc_id, kind, hash, path, storage_provider, storage_key,
      verified_at, verification_status, meta, payload, ts,
      type, sha256
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    input.docId,
    input.kind,
    input.hash,
    input.path ?? null,
    input.storageProvider ?? "local",
    input.storageKey ?? null,
    meta,
    input.payload,
    now,
    input.kind, // legacy type column
    input.hash  // legacy sha256 column
  );

  return getArtifactById(Number(result.lastInsertRowid))!;
}

/** Get artifact by ID */
export function getArtifactById(id: number): Artifact | null {
  const row = db
    .prepare(`SELECT * FROM proofs WHERE id = ?`)
    .get(id) as ArtifactRow | undefined;

  return row ? rowToArtifact(row) : null;
}

/** Get artifacts by document ID */
export function getArtifactsByDoc(docId: string): Artifact[] {
  const rows = db
    .prepare(`SELECT * FROM proofs WHERE doc_id = ? ORDER BY ts DESC`)
    .all(docId) as ArtifactRow[];

  return rows.map(rowToArtifact);
}

/** Get artifact by hash */
export function getArtifactByHash(hash: string): Artifact | null {
  const row = db
    .prepare(`SELECT * FROM proofs WHERE hash = ? LIMIT 1`)
    .get(hash) as ArtifactRow | undefined;

  return row ? rowToArtifact(row) : null;
}

/** Get artifacts with filters */
export function getArtifacts(filter: ArtifactFilter = {}): Artifact[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.docId) {
    conditions.push("doc_id = ?");
    params.push(filter.docId);
  }

  if (filter.kind) {
    conditions.push("kind = ?");
    params.push(filter.kind);
  }

  if (filter.storageProvider) {
    conditions.push("storage_provider = ?");
    params.push(filter.storageProvider);
  }

  if (filter.verificationStatus) {
    conditions.push("verification_status = ?");
    params.push(filter.verificationStatus);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;

  const sql = `
    SELECT * FROM proofs
    ${whereClause}
    ORDER BY ts DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(...params, limit, offset) as ArtifactRow[];
  return rows.map(rowToArtifact);
}

/** Update verification status */
export function updateVerification(
  id: number,
  status: VerificationStatus
): void {
  const now = Date.now();

  db.prepare(`
    UPDATE proofs
    SET verification_status = ?, verified_at = ?
    WHERE id = ?
  `).run(status, now, id);
}

/** Update storage location */
export function updateStorageLocation(
  id: number,
  provider: StorageProvider,
  key: string
): void {
  db.prepare(`
    UPDATE proofs
    SET storage_provider = ?, storage_key = ?
    WHERE id = ?
  `).run(provider, key, id);
}

/** Delete artifact */
export function deleteArtifact(id: number): boolean {
  const result = db
    .prepare(`DELETE FROM proofs WHERE id = ?`)
    .run(id);

  return result.changes > 0;
}

/** Count artifacts by verification status */
export function countByVerificationStatus(): Record<VerificationStatus, number> {
  const rows = db.prepare(`
    SELECT
      COALESCE(verification_status, 'pending') as status,
      COUNT(*) as count
    FROM proofs
    GROUP BY verification_status
  `).all() as Array<{ status: string; count: number }>;

  const result: Record<VerificationStatus, number> = {
    pending: 0,
    pass: 0,
    fail: 0,
    miss: 0,
  };

  for (const row of rows) {
    const status = row.status as VerificationStatus;
    if (status in result) {
      result[status] = row.count;
    }
  }

  return result;
}

/** Count artifacts by storage provider */
export function countByStorageProvider(): Record<StorageProvider, number> {
  const rows = db.prepare(`
    SELECT
      COALESCE(storage_provider, 'local') as provider,
      COUNT(*) as count
    FROM proofs
    GROUP BY storage_provider
  `).all() as Array<{ provider: string; count: number }>;

  const result: Record<StorageProvider, number> = {
    local: 0,
    s3: 0,
    gcs: 0,
  };

  for (const row of rows) {
    const provider = row.provider as StorageProvider;
    if (provider in result) {
      result[provider] = row.count;
    }
  }

  return result;
}

/** Get artifacts pending verification */
export function getPendingVerification(limit: number = 50): Artifact[] {
  const rows = db.prepare(`
    SELECT * FROM proofs
    WHERE verification_status = 'pending' OR verification_status IS NULL
    ORDER BY ts ASC
    LIMIT ?
  `).all(limit) as ArtifactRow[];

  return rows.map(rowToArtifact);
}

/** Get artifacts that failed verification */
export function getFailedVerification(limit: number = 50): Artifact[] {
  const rows = db.prepare(`
    SELECT * FROM proofs
    WHERE verification_status = 'fail'
    ORDER BY verified_at DESC
    LIMIT ?
  `).all(limit) as ArtifactRow[];

  return rows.map(rowToArtifact);
}

/* ---------- Export all functions ---------- */
export const ArtifactsStore = {
  create: createArtifact,
  getById: getArtifactById,
  getByDoc: getArtifactsByDoc,
  getByHash: getArtifactByHash,
  getAll: getArtifacts,
  updateVerification,
  updateStorageLocation,
  delete: deleteArtifact,
  countByVerificationStatus,
  countByStorageProvider,
  getPendingVerification,
  getFailedVerification,
};
