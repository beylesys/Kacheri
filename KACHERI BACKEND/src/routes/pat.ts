/**
 * Personal Access Token (PAT) Routes
 *
 * Endpoints:
 * - POST   /auth/tokens      — Create a new PAT
 * - GET    /auth/tokens      — List user's PATs (token values masked)
 * - DELETE /auth/tokens/:id  — Revoke a PAT
 *
 * Phase 1, Slice P4 — Personal Access Tokens for External Clients
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { DbAdapter } from '../db/types';
import { createPatStore, VALID_SCOPES, type PatScope } from '../auth/pat';
import { logAuditEvent } from '../store/audit';

/* ---------- Request Types ---------- */

interface CreateTokenBody {
  name: string;
  workspaceId: string;
  scopes?: string[];
  expiresInSeconds?: number;
}

interface TokenIdParams {
  id: string;
}

/* ---------- Plugin ---------- */

export function createPatRoutes(db: DbAdapter): FastifyPluginAsync {
  const patStore = createPatStore(db);

  return async (app) => {

    // POST /tokens — Create a new PAT
    app.post('/tokens', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Authentication required',
        });
      }

      const body = req.body as CreateTokenBody;

      if (!body.name || !body.name.trim()) {
        return reply.status(400).send({
          error: 'validation',
          message: 'Token name is required',
        });
      }

      if (!body.workspaceId || !body.workspaceId.trim()) {
        return reply.status(400).send({
          error: 'validation',
          message: 'workspaceId is required',
        });
      }

      if (body.scopes && body.scopes.length > 0) {
        const invalid = body.scopes.filter(s => !VALID_SCOPES.includes(s as PatScope));
        if (invalid.length > 0) {
          return reply.status(400).send({
            error: 'validation',
            message: `Invalid scopes: ${invalid.join(', ')}. Valid scopes: ${VALID_SCOPES.join(', ')}`,
          });
        }
      }

      if (body.expiresInSeconds !== undefined) {
        if (typeof body.expiresInSeconds !== 'number' || body.expiresInSeconds <= 0) {
          return reply.status(400).send({
            error: 'validation',
            message: 'expiresInSeconds must be a positive number',
          });
        }
      }

      try {
        const result = await patStore.create({
          userId: req.user.id,
          workspaceId: body.workspaceId.trim(),
          name: body.name.trim(),
          scopes: body.scopes as PatScope[] | undefined,
          expiresInSeconds: body.expiresInSeconds,
        });

        logAuditEvent({
          workspaceId: body.workspaceId.trim(),
          actorId: req.user.id,
          action: 'pat:create',
          targetType: 'pat',
          targetId: result.pat.id,
          details: {
            name: result.pat.name,
            scopes: result.pat.scopes,
            expiresAt: result.pat.expiresAt,
          },
        });

        return reply.status(201).send({
          token: result.token,
          pat: {
            id: result.pat.id,
            name: result.pat.name,
            workspaceId: result.pat.workspaceId,
            scopes: result.pat.scopes,
            expiresAt: result.pat.expiresAt,
            createdAt: result.pat.createdAt,
          },
        });
      } catch (err: any) {
        if (err.message?.includes('Maximum of')) {
          return reply.status(409).send({
            error: 'limit_exceeded',
            message: err.message,
          });
        }
        if (err.message?.includes('Invalid scopes') ||
            err.message?.includes('name is required') ||
            err.message?.includes('Expiry')) {
          return reply.status(400).send({
            error: 'validation',
            message: err.message,
          });
        }
        throw err;
      }
    });

    // GET /tokens — List user's PATs (no token value exposed)
    app.get('/tokens', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Authentication required',
        });
      }

      const pats = await patStore.listByUser(req.user.id);

      return {
        tokens: pats.map(pat => ({
          id: pat.id,
          name: pat.name,
          workspaceId: pat.workspaceId,
          scopes: pat.scopes,
          expiresAt: pat.expiresAt,
          lastUsedAt: pat.lastUsedAt,
          createdAt: pat.createdAt,
        })),
      };
    });

    // DELETE /tokens/:id — Revoke a PAT
    app.delete('/tokens/:id', async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Authentication required',
        });
      }

      const { id } = req.params as TokenIdParams;

      if (!id || !id.startsWith('pat_')) {
        return reply.status(400).send({
          error: 'validation',
          message: 'Invalid token ID',
        });
      }

      const revoked = await patStore.revoke(id, req.user.id);

      if (!revoked) {
        return reply.status(404).send({
          error: 'not_found',
          message: 'Token not found or already revoked',
        });
      }

      logAuditEvent({
        workspaceId: req.workspaceId || 'platform',
        actorId: req.user.id,
        action: 'pat:revoke',
        targetType: 'pat',
        targetId: id,
      });

      return reply.status(200).send({ ok: true });
    });
  };
}
