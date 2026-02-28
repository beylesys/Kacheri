// KACHERI BACKEND/src/routes/docAttachments.ts
// Document attachment upload, listing, serving, and deletion
// Records proofs and provenance for all attachment operations
// Roadmap 2.8: Document Attachments (Phase 2 Sprint 2, Slice 4)

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash, type BinaryLike } from 'crypto';
import { recordProof } from '../provenance';
import { recordProvenance } from '../provenance';
import { db, repoPath } from '../db';
import { checkDocAccess, getUserId } from '../workspace/middleware';
import { getStorage, StorageNotFoundError } from '../storage';
import { logAuditEvent } from '../store/audit';
import { wsBroadcast } from '../realtime/globalHub';
import {
  createAttachment,
  listAttachments,
  getAttachment,
  deleteAttachment,
  getDocAttachmentStats,
  checkDocAttachmentLimits,
  checkWorkspaceAttachmentLimits,
  ATTACHMENT_LIMITS,
} from '../store/docAttachments';

// --- Helpers ---
async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function sha256Hex(data: BinaryLike): string {
  return createHash('sha256').update(data).digest('hex');
}

function normalizeId(raw: string): string {
  return raw.startsWith('doc-') ? raw.slice(4) : raw;
}

function nanoid(size = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function getWorkspaceId(req: FastifyRequest): string | undefined {
  const w = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
  return w && w.length ? w : undefined;
}

// Allowed attachment MIME types
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

// Extension mapping
const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// Sanitize filename: remove path separators, null bytes, and collapse whitespace
function sanitizeFilename(raw: string): string {
  return raw
    .replace(/[\\/:\0]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

export default fp(async function docAttachmentPlugin(app: FastifyInstance) {
  // Register multipart if not already registered
  if (!app.hasContentTypeParser('multipart/form-data')) {
    await app.register(require('@fastify/multipart'), {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max file size
    });
  }

  /**
   * POST /docs/:id/attachments
   * Upload a file attachment for a document
   * Auth: editor+ on doc
   */
  app.post('/docs/:id/attachments', async (req: any, reply: FastifyReply) => {
    const { id: rawId } = req.params as { id: string };
    const docId = normalizeId(rawId);
    if (!checkDocAccess(db, req, reply, docId, 'editor')) return;

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return reply.code(400).send({ error: 'X-Workspace-Id header required for attachments' });
    }

    const userId = getUserId(req) || 'user:anonymous';

    // Get the uploaded file
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded (field "file")' });
    }

    const mimeType = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return reply.code(400).send({
        error: 'Invalid file type',
        allowed: [...ALLOWED_MIME_TYPES],
        received: mimeType,
      });
    }

    const buf: Buffer = await file.toBuffer();
    const bytes = buf.byteLength;

    // Check limits
    const docLimitCheck = await checkDocAttachmentLimits(docId, bytes);
    if (!docLimitCheck.allowed) {
      return reply.code(413).send({ error: docLimitCheck.reason });
    }

    const wsLimitCheck = await checkWorkspaceAttachmentLimits(workspaceId, bytes);
    if (!wsLimitCheck.allowed) {
      return reply.code(413).send({ error: wsLimitCheck.reason });
    }

    // Generate storage key and write via storage client
    const hash = sha256Hex(buf);
    const attachmentId = nanoid();
    const ext = MIME_TO_EXT[mimeType] || 'bin';
    const storageFilename = `${attachmentId}.${ext}`;
    const storageKey = `${workspaceId}/attachments/doc-${docId}/${storageFilename}`;
    await getStorage().write(storageKey, buf, mimeType);

    const safeFilename = sanitizeFilename(file.filename || `attachment.${ext}`);

    // Create DB record
    const attachment = await createAttachment({
      id: attachmentId,
      docId,
      workspaceId,
      filename: safeFilename,
      mimeType,
      sizeBytes: bytes,
      storageKey,
      sha256: hash,
      uploadedBy: userId,
    });

    // Record proof
    const proofHash = `sha256:${hash}`;
    const proofResult = await recordProof({
      doc_id: docId,
      kind: 'attachment:upload',
      hash: proofHash,
      path: storageKey,
      meta: {
        attachmentId,
        filename: safeFilename,
        mimeType,
        bytes,
        actorId: userId,
        workspaceId,
        storageKey,
      },
      storageKey,
      storageProvider: getStorage().type,
    });

    // Record provenance
    recordProvenance({
      docId,
      action: 'attachment:upload',
      actor: 'human',
      actorId: userId,
      workspaceId,
      details: {
        attachmentId,
        filename: safeFilename,
        mimeType,
        bytes,
        sha256: hash,
      },
    });

    // Audit log
    logAuditEvent({
      workspaceId,
      actorId: userId,
      action: 'attachment:upload',
      targetType: 'attachment',
      targetId: attachmentId,
      details: { docId, filename: safeFilename, mimeType, bytes },
    });

    // WebSocket broadcast
    wsBroadcast(workspaceId, {
      type: 'attachment',
      action: 'uploaded',
      docId,
      attachmentId,
      filename: safeFilename,
      uploadedBy: userId,
      ts: Date.now(),
    });

    return reply.code(201).send({
      attachment: {
        id: attachment.id,
        docId: attachment.docId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        sha256: attachment.sha256,
        uploadedBy: attachment.uploadedBy,
        uploadedAt: attachment.uploadedAt,
        metadata: attachment.metadata,
      },
      proof: {
        id: proofResult.doc_id,
        hash: proofHash,
      },
    });
  });

  /**
   * GET /docs/:id/attachments
   * List all attachments for a document
   * Auth: viewer+ on doc
   */
  app.get('/docs/:id/attachments', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: rawId } = req.params as { id: string };
    const docId = normalizeId(rawId);
    if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

    const attachments = await listAttachments(docId);
    const stats = await getDocAttachmentStats(docId);

    return reply.send({
      attachments: attachments.map((a) => ({
        id: a.id,
        docId: a.docId,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        sha256: a.sha256,
        uploadedBy: a.uploadedBy,
        uploadedAt: a.uploadedAt,
        metadata: a.metadata,
      })),
      totalSize: stats.totalSize,
      count: stats.count,
      limits: {
        maxCount: ATTACHMENT_LIMITS.maxCount,
        maxTotalBytes: ATTACHMENT_LIMITS.maxTotalBytes,
      },
    });
  });

  /**
   * GET /docs/:id/attachments/:attachmentId/file
   * Serve an attachment file
   * Auth: viewer+ on doc
   */
  app.get('/docs/:id/attachments/:attachmentId/file', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: rawId, attachmentId } = req.params as { id: string; attachmentId: string };
    const docId = normalizeId(rawId);
    if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

    const attachment = await getAttachment(attachmentId);
    if (!attachment || attachment.docId !== docId || attachment.deletedAt) {
      return reply.code(404).send({ error: 'Attachment not found' });
    }

    // Read via storage client with legacy fallback
    let buf: Buffer;
    try {
      buf = await getStorage().read(attachment.storageKey);
    } catch (err) {
      if (!(err instanceof StorageNotFoundError)) throw err;
      try {
        // Legacy fallback: resolve storage key as filesystem path
        const filePath = repoPath(attachment.storageKey);
        buf = await fs.readFile(filePath);
      } catch {
        return reply.code(404).send({ error: 'Attachment file not found on disk' });
      }
    }
    return reply
      .type(attachment.mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Disposition', `inline; filename="${attachment.filename}"`)
      .send(buf);
  });

  /**
   * DELETE /docs/:id/attachments/:attachmentId
   * Soft-delete an attachment
   * Auth: editor+ on doc (or uploader can delete own)
   */
  app.delete('/docs/:id/attachments/:attachmentId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: rawId, attachmentId } = req.params as { id: string; attachmentId: string };
    const docId = normalizeId(rawId);

    const userId = getUserId(req) || 'user:anonymous';
    const workspaceId = getWorkspaceId(req);

    // Look up the attachment first to check ownership
    const attachment = await getAttachment(attachmentId);
    if (!attachment || attachment.docId !== docId || attachment.deletedAt) {
      return reply.code(404).send({ error: 'Attachment not found' });
    }

    // Uploader can delete their own; otherwise require editor+
    const isUploader = attachment.uploadedBy === userId;
    if (!isUploader) {
      if (!checkDocAccess(db, req, reply, docId, 'editor')) return;
    } else {
      // Still need at least viewer access
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;
    }

    const deleted = await deleteAttachment(attachmentId);
    if (!deleted) {
      return reply.code(404).send({ error: 'Attachment not found' });
    }

    // Record proof for deletion
    recordProof({
      doc_id: docId,
      kind: 'attachment:delete',
      hash: `sha256:${attachment.sha256}`,
      path: attachment.storageKey,
      meta: {
        attachmentId,
        filename: attachment.filename,
        actorId: userId,
        workspaceId,
        deletedAt: new Date().toISOString(),
      },
    });

    // Record provenance
    recordProvenance({
      docId,
      action: 'attachment:delete',
      actor: 'human',
      actorId: userId,
      workspaceId: workspaceId ?? null,
      details: {
        attachmentId,
        filename: attachment.filename,
        sha256: attachment.sha256,
      },
    });

    // Audit log
    if (workspaceId) {
      logAuditEvent({
        workspaceId,
        actorId: userId,
        action: 'attachment:delete',
        targetType: 'attachment',
        targetId: attachmentId,
        details: { docId, filename: attachment.filename },
      });
    }

    // WebSocket broadcast
    if (workspaceId) {
      wsBroadcast(workspaceId, {
        type: 'attachment',
        action: 'deleted',
        docId,
        attachmentId,
        filename: attachment.filename,
        uploadedBy: userId,
        ts: Date.now(),
      });
    }

    return reply.send({ deleted: true });
  });
});
