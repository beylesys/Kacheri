// KACHERI BACKEND/src/routes/imageUpload.ts
// Image upload, serving, and deletion for documents
// Records proofs for all image operations

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash, type BinaryLike } from 'crypto';
import { recordProof } from '../provenanceStore';
import { repoPath, db } from '../db';
import { checkDocAccess } from '../workspace/middleware';
import { getStorage, StorageNotFoundError } from '../storage';

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

function getUserId(req: FastifyRequest): string | undefined {
  const u = (req.headers['x-dev-user'] as string | undefined)?.toString().trim();
  return u && u.length ? u : 'user:anonymous';
}

// Allowed image MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

// Extension mapping
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export default fp(async function imageUploadPlugin(app: FastifyInstance) {
  // Register multipart if not already registered
  // Note: importDoc.ts may have already registered it, so we check first
  if (!app.hasContentTypeParser('multipart/form-data')) {
    await app.register(require('@fastify/multipart'), {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB for images
    });
  }

  /**
   * POST /docs/:id/images
   * Upload an image for a document
   * Form: image=<binary>
   */
  app.post('/docs/:id/images', async (req: any, reply: FastifyReply) => {
    const { id: rawId } = req.params as { id: string };
    const docId = normalizeId(rawId);
    if (!checkDocAccess(db, req, reply, docId, 'editor')) return;
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);

    // Get the uploaded file
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded (field "image")' });
    }

    const mimeType = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return reply.code(400).send({
        error: 'Invalid image type',
        allowed: [...ALLOWED_MIME_TYPES],
        received: mimeType,
      });
    }

    const buf: Buffer = await file.toBuffer();
    const bytes = buf.byteLength;
    const hash = 'sha256:' + sha256Hex(buf);

    // Generate filename: {timestamp}_{nanoid}.{ext}
    const ts = Date.now();
    const ext = MIME_TO_EXT[mimeType] || 'bin';
    const filename = `${ts}_${nanoid()}.${ext}`;

    // Storage path via storage client
    const wsPrefix = workspaceId || '_global';
    const storageKey = `${wsPrefix}/images/doc-${docId}/${filename}`;
    await getStorage().write(storageKey, buf, mimeType);

    // Record proof
    await recordProof({
      doc_id: docId,
      kind: 'image:upload',
      hash,
      path: storageKey,
      meta: {
        filename,
        mimeType,
        bytes,
        actor: userId,
        workspaceId,
        originalName: file.filename,
        storageKey,
        storageProvider: getStorage().type,
      },
    });

    // Return URL for the image
    const url = `/docs/${rawId}/images/${filename}`;

    return reply.code(201).send({
      url,
      filename,
      hash,
      bytes,
      mimeType,
    });
  });

  /**
   * GET /docs/:id/images/:filename
   * Serve an uploaded image
   */
  app.get('/docs/:id/images/:filename', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: rawId, filename } = req.params as { id: string; filename: string };
    const docId = normalizeId(rawId);
    if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

    // Security: use basename to prevent path traversal
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    // Validate extension
    const ext = path.extname(safeFilename).slice(1).toLowerCase();
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return reply.code(400).send({ error: 'Invalid image extension' });
    }

    // Read via storage client with fallback chain for backward compat
    const wsId = getWorkspaceId(req);
    let buf: Buffer;
    try {
      // Try workspace-scoped key first
      const storageKey = `${wsId || '_global'}/images/doc-${docId}/${safeFilename}`;
      buf = await getStorage().read(storageKey);
    } catch (err) {
      if (!(err instanceof StorageNotFoundError)) throw err;
      try {
        // Fallback: basePath-relative key (old files without workspace prefix)
        buf = await getStorage().read(`images/doc-${docId}/${safeFilename}`);
      } catch (err2) {
        if (!(err2 instanceof StorageNotFoundError)) throw err2;
        try {
          // Legacy fallback: direct filesystem path
          const imageDir = repoPath('storage', 'images', `doc-${docId}`);
          const filePath = path.join(imageDir, safeFilename);
          buf = await fs.readFile(filePath);
        } catch {
          return reply.code(404).send({ error: 'Image not found' });
        }
      }
    }
    return reply
      .type(mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(buf);
  });

  /**
   * DELETE /docs/:id/images/:filename
   * Delete an uploaded image
   */
  app.delete('/docs/:id/images/:filename', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: rawId, filename } = req.params as { id: string; filename: string };
    const docId = normalizeId(rawId);
    if (!checkDocAccess(db, req, reply, docId, 'editor')) return;
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);

    // Security: use basename to prevent path traversal
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    // Read via storage client to get hash, then delete
    const wsPrefix = workspaceId || '_global';
    const storageKey = `${wsPrefix}/images/doc-${docId}/${safeFilename}`;

    try {
      // Try to read from storage client (workspace-scoped, then basePath-relative)
      let buf: Buffer;
      try {
        buf = await getStorage().read(storageKey);
      } catch (readErr) {
        if (!(readErr instanceof StorageNotFoundError)) throw readErr;
        try {
          buf = await getStorage().read(`images/doc-${docId}/${safeFilename}`);
        } catch (readErr2) {
          if (!(readErr2 instanceof StorageNotFoundError)) throw readErr2;
          // Legacy fallback
          const imageDir = repoPath('storage', 'images', `doc-${docId}`);
          buf = await fs.readFile(path.join(imageDir, safeFilename));
        }
      }

      const hash = 'sha256:' + sha256Hex(buf);

      // Delete via storage client + legacy cleanup
      await getStorage().delete(storageKey);
      await getStorage().delete(`images/doc-${docId}/${safeFilename}`).catch(() => {});
      try {
        const imageDir = repoPath('storage', 'images', `doc-${docId}`);
        await fs.unlink(path.join(imageDir, safeFilename));
      } catch { /* legacy path may not exist */ }

      // Record proof
      await recordProof({
        doc_id: docId,
        kind: 'image:delete',
        hash,
        path: storageKey,
        meta: {
          filename: safeFilename,
          actor: userId,
          workspaceId,
          deletedAt: new Date().toISOString(),
          storageKey,
          storageProvider: getStorage().type,
        },
      });

      return reply.code(204).send();
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return reply.code(404).send({ error: 'Image not found' });
      }
      throw e;
    }
  });

  /**
   * GET /docs/:id/images
   * List all images for a document
   */
  app.get('/docs/:id/images', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: rawId } = req.params as { id: string };
    const docId = normalizeId(rawId);
    if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

    // List via storage client with legacy fallback
    const wsId = getWorkspaceId(req);
    const wsPrefix = wsId || '_global';
    let filenames: string[] = [];

    try {
      // Try workspace-scoped prefix
      const keys = await getStorage().list(`${wsPrefix}/images/doc-${docId}/`);
      filenames = keys.map((k) => path.basename(k));
    } catch { /* ignore */ }

    if (filenames.length === 0) {
      try {
        // Fallback: basePath-relative prefix (old files)
        const keys = await getStorage().list(`images/doc-${docId}/`);
        filenames = keys.map((k) => path.basename(k));
      } catch { /* ignore */ }
    }

    if (filenames.length === 0) {
      try {
        // Legacy fallback: direct filesystem readdir
        const imageDir = repoPath('storage', 'images', `doc-${docId}`);
        filenames = await fs.readdir(imageDir);
      } catch { /* directory may not exist */ }
    }

    const images = filenames
      .filter((f) => {
        const ext = path.extname(f).slice(1).toLowerCase();
        return EXT_TO_MIME[ext] !== undefined;
      })
      .map((f) => ({
        filename: f,
        url: `/docs/${rawId}/images/${f}`,
      }));

    return reply.send({ images });
  });
});
