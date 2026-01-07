// KACHERI BACKEND/src/routes/templates.ts
// REST endpoints for document templates.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import { listTemplates, getTemplate } from '../store/templates';

export function createTemplateRoutes(_db: Database) {
  return async function templateRoutes(app: FastifyInstance) {
    // -------------------------------------------
    // GET /templates
    // List all available templates (without content)
    // No auth required - templates are public
    // -------------------------------------------
    app.get(
      '/templates',
      async (_req, _reply) => {
        const templates = listTemplates();
        return { templates };
      }
    );

    // -------------------------------------------
    // GET /templates/:id
    // Get a single template with content
    // No auth required - templates are public
    // -------------------------------------------
    app.get<{
      Params: { id: string };
    }>(
      '/templates/:id',
      async (req, reply) => {
        const templateId = req.params.id;

        const template = getTemplate(templateId);
        if (!template) {
          return reply.code(404).send({ error: 'Template not found' });
        }

        return { template };
      }
    );
  };
}
