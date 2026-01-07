// KACHERI BACKEND/src/routes/imageUpload.ts
// Image upload, serving, and deletion for documents
// Records proofs for all image operations

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash, type BinaryLike } from 'crypto';
import { recordProof } from '../provenanceStore';
import { repoPath } from '../db';

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

    // Storage path: storage/images/doc-{docId}/{filename}
    const imageDir = repoPath('storage', 'images', `doc-${docId}`);
    await ensureDir(imageDir);
    const filePath = path.join(imageDir, filename);
    await fs.writeFile(filePath, buf);

    // Record proof
    const relativePath = path.relative(process.cwd(), filePath);
    recordProof({
      doc_id: docId,
      kind: 'image:upload',
      hash,
      path: relativePath,
      meta: {
        filename,
        mimeType,
        bytes,
        actor: userId,
        workspaceId,
        originalName: file.filename,
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

    const imageDir = repoPath('storage', 'images', `doc-${docId}`);
    const filePath = path.join(imageDir, safeFilename);

    try {
      const buf = await fs.readFile(filePath);
      return reply
        .type(mimeType)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(buf);
    } catch {
      return reply.code(404).send({ error: 'Image not found' });
    }
  });

  /**
   * DELETE /docs/:id/images/:filename
   * Delete an uploaded image
   */
  app.delete('/docs/:id/images/:filename', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: rawId, filename } = req.params as { id: string; filename: string };
    const docId = normalizeId(rawId);
    const workspaceId = getWorkspaceId(req);
    const userId = getUserId(req);

    // Security: use basename to prevent path traversal
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    const imageDir = repoPath('storage', 'images', `doc-${docId}`);
    const filePath = path.join(imageDir, safeFilename);

    try {
      // Get file hash before deletion for proof
      const buf = await fs.readFile(filePath);
      const hash = 'sha256:' + sha256Hex(buf);
      const relativePath = path.relative(process.cwd(), filePath);

      // Delete the file
      await fs.unlink(filePath);

      // Record proof
      recordProof({
        doc_id: docId,
        kind: 'image:delete',
        hash,
        path: relativePath,
        meta: {
          filename: safeFilename,
          actor: userId,
          workspaceId,
          deletedAt: new Date().toISOString(),
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

    const imageDir = repoPath('storage', 'images', `doc-${docId}`);

    try {
      const files = await fs.readdir(imageDir);
      const images = files
        .filter((f) => {
          const ext = path.extname(f).slice(1).toLowerCase();
          return EXT_TO_MIME[ext] !== undefined;
        })
        .map((f) => ({
          filename: f,
          url: `/docs/${rawId}/images/${f}`,
        }));

      return reply.send({ images });
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return reply.send({ images: [] });
      }
      throw e;
    }
  });
});
