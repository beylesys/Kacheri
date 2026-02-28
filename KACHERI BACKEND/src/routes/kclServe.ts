// KACHERI BACKEND/src/routes/kclServe.ts — KCL Bundle & Asset Serving (Slices A6, E1)
import type { FastifyPluginAsync } from 'fastify';
import { constants as FS, createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { CanvasAssetStore } from '../store/canvasAssets';
import { getStorage, StorageNotFoundError } from '../storage';

/** Allowed KCL bundle files */
const ALLOWED_FILES: Record<string, string> = {
  'kcl.js': 'application/javascript',
  'kcl.css': 'text/css',
};

/** Semver-like version pattern (digits and dots only) */
const VERSION_RE = /^\d+\.\d+\.\d+$/;

const kclServeRoutes: FastifyPluginAsync = async (fastify) => {
  // Public endpoints — no auth required (frames render in sandboxed iframes)
  fastify.get('/kcl/:version/:file', async (req, reply) => {
    const { version, file } = req.params as { version: string; file: string };

    // Validate version format (alphanumeric + dots, strict semver)
    if (!VERSION_RE.test(version)) {
      reply.code(400);
      return { error: 'Invalid version format' };
    }

    // Validate file is one of the allowed bundle files
    const contentType = ALLOWED_FILES[file];
    if (!contentType) {
      reply.code(400);
      return { error: 'Invalid file name' };
    }

    // Resolve file path inside storage/kcl/{version}/
    const baseDir = path.resolve(process.cwd(), 'storage', 'kcl', version);
    const filePath = path.resolve(baseDir, file);

    // Path traversal protection
    if (!filePath.startsWith(baseDir + path.sep) && filePath !== path.join(baseDir, file)) {
      reply.code(400);
      return { error: 'Invalid path' };
    }

    // Check file exists
    try {
      await access(filePath, FS.R_OK);
    } catch {
      reply.code(404);
      return { error: 'KCL version not found' };
    }

    // Immutable cache headers — versioned URLs never change
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(createReadStream(filePath));
  });

  // ────────────────────────────────────────────────────────────────
  // Asset Proxy — Slice E1 (Frame Security Hardening)
  // Public endpoint for sandboxed iframes to load canvas assets
  // (images, fonts, icons). Iframes cannot authenticate (no cookies,
  // no same-origin), so this follows the same public pattern as
  // /kcl/:version/:file above. Asset IDs are nanoid (12 chars, ~72
  // bits entropy) — not enumerable.
  // ────────────────────────────────────────────────────────────────

  /** Nanoid-compatible ID pattern */
  const ASSET_ID_RE = /^[A-Za-z0-9_-]{8,24}$/;

  /** Asset types allowed through the frame proxy */
  const PROXY_ALLOWED_TYPES = new Set(['image', 'font', 'icon']);

  fastify.get('/kcl-assets/:assetId', async (req, reply) => {
    const { assetId } = req.params as { assetId: string };

    // Validate asset ID format
    if (!ASSET_ID_RE.test(assetId)) {
      reply.code(400);
      return { error: 'Invalid asset ID format' };
    }

    // Look up asset in database
    const asset = await CanvasAssetStore.getById(assetId);
    if (!asset) {
      reply.code(404);
      return { error: 'Asset not found' };
    }

    // Only serve image, font, and icon assets through the proxy
    if (!PROXY_ALLOWED_TYPES.has(asset.assetType)) {
      reply.code(403);
      return { error: 'Asset type not allowed via frame proxy' };
    }

    // Read from storage and stream to client
    try {
      const buf = await getStorage().read(asset.filePath);

      reply.header('Content-Type', asset.mimeType);
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      // CORS: iframe has null origin, so we must allow any origin
      reply.header('Access-Control-Allow-Origin', '*');
      return reply.send(buf);
    } catch (err) {
      if (err instanceof StorageNotFoundError) {
        reply.code(404);
        return { error: 'Asset file not found in storage' };
      }
      req.log.error(err, '[kcl-assets] asset proxy serve failed');
      reply.code(500);
      return { error: 'Internal error serving asset' };
    }
  });
};

export default kclServeRoutes;
