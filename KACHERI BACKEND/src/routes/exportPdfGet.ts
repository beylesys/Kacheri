// backend/src/routes/exportPdfGet.ts
import type { FastifyPluginAsync } from 'fastify';
import { constants as FS, createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

const exportPdfGetRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/docs/:id/exports/pdf/:file', async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string };

    // Basic filename safety: basename check + .pdf extension
    if (file !== path.basename(file) || !/\.pdf$/i.test(file)) {
      reply.code(400);
      return { error: 'Invalid file name' };
    }

    // Files are stored under storage/exports/doc-{id}/{file}
    const baseDir = path.resolve(process.cwd(), 'storage', 'exports', `doc-${id}`);
    const filePath = path.resolve(baseDir, file);

    // Prevent path traversal: resolved path must remain inside baseDir
    if (!filePath.startsWith(baseDir + path.sep)) {
      reply.code(400);
      return { error: 'Invalid path' };
    }

    try {
      await access(filePath, FS.R_OK);
    } catch {
      reply.code(404);
      return { error: 'File not found' };
    }

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${file}"`);
    return reply.send(createReadStream(filePath));
  });
};

export default exportPdfGetRoute;
