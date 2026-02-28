// KACHERI BACKEND/src/store/docAttachments.ts
// Store for document attachments — CRUD + limits enforcement
// Roadmap 2.8: Document Attachments (Phase 2 Sprint 2, Slice 4)

import { db } from "../db";

// ---------------------------------------------------------------------------
// Limit constants (configurable via env)
// ---------------------------------------------------------------------------
const MAX_ATTACHMENTS_PER_DOC = Number(process.env.KACHERI_MAX_ATTACHMENTS_PER_DOC) || 20;
const MAX_ATTACHMENT_SIZE_PER_DOC = Number(process.env.KACHERI_MAX_ATTACHMENT_SIZE_PER_DOC) || 100 * 1024 * 1024; // 100 MB
const MAX_ATTACHMENT_FILE_SIZE = Number(process.env.KACHERI_MAX_ATTACHMENT_FILE_SIZE) || 25 * 1024 * 1024; // 25 MB
const MAX_ATTACHMENT_SIZE_PER_WORKSPACE = Number(process.env.KACHERI_MAX_ATTACHMENT_SIZE_PER_WORKSPACE) || 1024 * 1024 * 1024; // 1 GB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DocAttachment {
  id: string;
  docId: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  storageKey: string;
  sha256: string;
  uploadedBy: string;
  uploadedAt: number;
  deletedAt: number | null;
  metadata: Record<string, unknown> | null;
}

export interface CreateAttachmentOpts {
  id: string;
  docId: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  uploadedBy: string;
  metadata?: Record<string, unknown> | null;
}

export interface AttachmentStats {
  count: number;
  totalSize: number;
}

export interface LimitCheck {
  allowed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------
function rowToAttachment(row: any): DocAttachment {
  return {
    id: row.id,
    docId: row.doc_id,
    workspaceId: row.workspace_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    sha256: row.sha256,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    deletedAt: row.deleted_at ?? null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createAttachment(opts: CreateAttachmentOpts): Promise<DocAttachment> {
  const now = Date.now();
  await db.run(`
    INSERT INTO doc_attachments (id, doc_id, workspace_id, filename, mime_type, size_bytes,
      storage_provider, storage_key, sha256, uploaded_by, uploaded_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?, ?, ?, ?)
  `, [
    opts.id,
    opts.docId,
    opts.workspaceId,
    opts.filename,
    opts.mimeType,
    opts.sizeBytes,
    opts.storageKey,
    opts.sha256,
    opts.uploadedBy,
    now,
    opts.metadata ? JSON.stringify(opts.metadata) : null,
  ]);

  return {
    id: opts.id,
    docId: opts.docId,
    workspaceId: opts.workspaceId,
    filename: opts.filename,
    mimeType: opts.mimeType,
    sizeBytes: opts.sizeBytes,
    storageProvider: "local",
    storageKey: opts.storageKey,
    sha256: opts.sha256,
    uploadedBy: opts.uploadedBy,
    uploadedAt: now,
    deletedAt: null,
    metadata: opts.metadata ?? null,
  };
}

export async function listAttachments(docId: string): Promise<DocAttachment[]> {
  const rows = await db.queryAll<any>(`
    SELECT id, doc_id, workspace_id, filename, mime_type, size_bytes,
      storage_provider, storage_key, sha256, uploaded_by, uploaded_at, deleted_at, metadata_json
    FROM doc_attachments
    WHERE doc_id = ? AND deleted_at IS NULL
    ORDER BY uploaded_at DESC
  `, [docId]);
  return rows.map(rowToAttachment);
}

export async function getAttachment(id: string): Promise<DocAttachment | null> {
  const row = await db.queryOne<any>(`
    SELECT id, doc_id, workspace_id, filename, mime_type, size_bytes,
      storage_provider, storage_key, sha256, uploaded_by, uploaded_at, deleted_at, metadata_json
    FROM doc_attachments
    WHERE id = ?
  `, [id]);
  return row ? rowToAttachment(row) : null;
}

export async function deleteAttachment(id: string): Promise<boolean> {
  const result = await db.run(
    `UPDATE doc_attachments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
    [Date.now(), id]
  );
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Stats & Limits
// ---------------------------------------------------------------------------

export async function getDocAttachmentStats(docId: string): Promise<AttachmentStats> {
  const row = await db.queryOne<{ count: number; totalSize: number }>(`
    SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as totalSize
    FROM doc_attachments
    WHERE doc_id = ? AND deleted_at IS NULL
  `, [docId]);
  return { count: row?.count ?? 0, totalSize: row?.totalSize ?? 0 };
}

export async function getWorkspaceAttachmentStats(workspaceId: string): Promise<AttachmentStats> {
  const row = await db.queryOne<{ totalSize: number }>(`
    SELECT COALESCE(SUM(size_bytes), 0) as totalSize
    FROM doc_attachments
    WHERE workspace_id = ? AND deleted_at IS NULL
  `, [workspaceId]);
  return { count: 0, totalSize: row?.totalSize ?? 0 };
}

export async function checkDocAttachmentLimits(docId: string, newFileSize: number): Promise<LimitCheck> {
  // Per-file size check
  if (newFileSize > MAX_ATTACHMENT_FILE_SIZE) {
    return {
      allowed: false,
      reason: `File exceeds maximum size of ${Math.round(MAX_ATTACHMENT_FILE_SIZE / (1024 * 1024))}MB`,
    };
  }

  const stats = await getDocAttachmentStats(docId);

  // Per-doc count check
  if (stats.count >= MAX_ATTACHMENTS_PER_DOC) {
    return {
      allowed: false,
      reason: `Document already has ${MAX_ATTACHMENTS_PER_DOC} attachments (maximum)`,
    };
  }

  // Per-doc total size check
  if (stats.totalSize + newFileSize > MAX_ATTACHMENT_SIZE_PER_DOC) {
    return {
      allowed: false,
      reason: `Adding this file would exceed the per-document limit of ${Math.round(MAX_ATTACHMENT_SIZE_PER_DOC / (1024 * 1024))}MB`,
    };
  }

  return { allowed: true };
}

export async function checkWorkspaceAttachmentLimits(workspaceId: string, newFileSize: number): Promise<LimitCheck> {
  const stats = await getWorkspaceAttachmentStats(workspaceId);

  if (stats.totalSize + newFileSize > MAX_ATTACHMENT_SIZE_PER_WORKSPACE) {
    return {
      allowed: false,
      reason: `Adding this file would exceed the workspace limit of ${Math.round(MAX_ATTACHMENT_SIZE_PER_WORKSPACE / (1024 * 1024))}MB`,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Exported constants for response payloads
// ---------------------------------------------------------------------------
export const ATTACHMENT_LIMITS = {
  maxCount: MAX_ATTACHMENTS_PER_DOC,
  maxTotalBytes: MAX_ATTACHMENT_SIZE_PER_DOC,
  maxFileBytes: MAX_ATTACHMENT_FILE_SIZE,
  maxWorkspaceBytes: MAX_ATTACHMENT_SIZE_PER_WORKSPACE,
} as const;
