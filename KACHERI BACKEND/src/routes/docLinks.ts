// KACHERI BACKEND/src/routes/docLinks.ts
// REST endpoints for cross-document links and backlinks.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  createDocLink,
  getDocLink,
  listLinksFromDoc,
  listLinksToDoc,
  deleteDocLink,
  syncDocLinks,
  type CreateDocLinkParams,
  type SyncLinkInput,
} from '../store/docLinks';
import { getDoc } from '../store/docs';
import { logAuditEvent } from '../store/audit';
import { hasDocPermission } from '../store/docPermissions';
import {
  getEffectiveDocRole,
  getUserId,
} from '../workspace/middleware';
import { wsBroadcast } from '../realtime/globalHub';

export function createDocLinkRoutes(db: Database) {
  return async function docLinkRoutes(app: FastifyInstance) {
    // Helper to get user ID from request
    function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
      const userId = getUserId(req);
      if (!userId) {
        reply.code(401).send({ error: 'Authentication required' });
        return null;
      }
      return userId;
    }

    // Helper to check doc access
    function checkDocAccess(
      req: FastifyRequest,
      reply: FastifyReply,
      docId: string,
      requiredRole: 'viewer' | 'commenter' | 'editor' | 'owner'
    ): boolean {
      const role = getEffectiveDocRole(db, docId, req);
      if (!role) {
        reply.code(403).send({ error: 'Access denied' });
        return false;
      }
      if (!hasDocPermission(role, requiredRole)) {
        reply.code(403).send({ error: `Requires ${requiredRole} role or higher` });
        return false;
      }
      req.docRole = role;
      return true;
    }

    // -------------------------------------------
    // GET /docs/:id/links
    // List all outgoing links from a document
    // Requires: viewer access
    // -------------------------------------------
    app.get<{ Params: { id: string } }>(
      '/docs/:id/links',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check viewer+ access
        if (!checkDocAccess(req, reply, docId, 'viewer')) return;

        const links = listLinksFromDoc(docId);
        return { links };
      }
    );

    // -------------------------------------------
    // GET /docs/:id/backlinks
    // List all documents that link to this document
    // Requires: viewer access
    // -------------------------------------------
    app.get<{ Params: { id: string } }>(
      '/docs/:id/backlinks',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check viewer+ access
        if (!checkDocAccess(req, reply, docId, 'viewer')) return;

        const backlinks = listLinksToDoc(docId);
        return { backlinks };
      }
    );

    // -------------------------------------------
    // POST /docs/:id/links
    // Create a new link from this document to another
    // Requires: editor access
    // -------------------------------------------
    app.post<{
      Params: { id: string };
      Body: {
        toDocId: string;
        linkText?: string;
        position?: number;
      };
    }>(
      '/docs/:id/links',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check source doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access on source doc
        if (!checkDocAccess(req, reply, docId, 'editor')) return;

        const body = req.body ?? {};
        const toDocId = (body.toDocId ?? '').toString().trim();

        if (!toDocId) {
          return reply.code(400).send({ error: 'toDocId is required' });
        }

        // Check target doc exists
        const targetDoc = getDoc(toDocId);
        if (!targetDoc) {
          return reply.code(400).send({ error: 'Target document not found' });
        }

        // Prevent self-links
        if (toDocId === docId) {
          return reply.code(400).send({ error: 'Cannot link a document to itself' });
        }

        const params: CreateDocLinkParams = {
          fromDocId: docId,
          toDocId,
          createdBy: userId,
          workspaceId: doc.workspaceId ?? null,
          linkText: body.linkText ?? null,
          position: body.position ?? null,
        };

        try {
          const link = createDocLink(params);

          if (!link) {
            return reply.code(400).send({ error: 'Failed to create link' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'doc:link:create',
              targetType: 'doc_link',
              targetId: link.id.toString(),
              details: { fromDocId: docId, toDocId, linkText: body.linkText },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'doc_link',
              action: 'created',
              fromDocId: docId,
              toDocId,
              linkId: link.id,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return reply.code(201).send(link);
        } catch (err: any) {
          req.log.error({ err }, 'Failed to create doc link');
          return reply.code(500).send({ error: 'Failed to create link' });
        }
      }
    );

    // -------------------------------------------
    // DELETE /docs/:id/links/:linkId
    // Remove a link
    // Requires: editor access
    // -------------------------------------------
    app.delete<{ Params: { id: string; linkId: string } }>(
      '/docs/:id/links/:linkId',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;
        const linkId = parseInt(req.params.linkId, 10);

        if (isNaN(linkId)) {
          return reply.code(400).send({ error: 'Invalid link ID' });
        }

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!checkDocAccess(req, reply, docId, 'editor')) return;

        // Get the link to verify it belongs to this doc
        const existing = getDocLink(linkId);
        if (!existing) {
          return reply.code(404).send({ error: 'Link not found' });
        }

        if (existing.fromDocId !== docId) {
          return reply.code(403).send({ error: 'Link does not belong to this document' });
        }

        try {
          const deleted = deleteDocLink(linkId);

          if (!deleted) {
            return reply.code(404).send({ error: 'Link not found' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'doc:link:delete',
              targetType: 'doc_link',
              targetId: linkId.toString(),
              details: { fromDocId: docId, toDocId: existing.toDocId },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'doc_link',
              action: 'deleted',
              fromDocId: docId,
              toDocId: existing.toDocId,
              linkId,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return reply.code(204).send();
        } catch (err: any) {
          req.log.error({ err }, 'Failed to delete doc link');
          return reply.code(500).send({ error: 'Failed to delete link' });
        }
      }
    );

    // -------------------------------------------
    // PUT /docs/:id/links/sync
    // Bulk synchronize all links in a document
    // Called when document is saved
    // Requires: editor access
    // -------------------------------------------
    app.put<{
      Params: { id: string };
      Body: {
        links: Array<{
          toDocId: string;
          linkText?: string;
          position?: number;
        }>;
      };
    }>(
      '/docs/:id/links/sync',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!checkDocAccess(req, reply, docId, 'editor')) return;

        const body = req.body ?? {};
        const inputLinks = body.links ?? [];

        // Validate links array
        if (!Array.isArray(inputLinks)) {
          return reply.code(400).send({ error: 'links must be an array' });
        }

        // Validate each link and filter self-links
        const validLinks: SyncLinkInput[] = [];
        for (const link of inputLinks) {
          const toDocId = (link.toDocId ?? '').toString().trim();
          if (!toDocId) {
            continue; // Skip invalid entries
          }
          if (toDocId === docId) {
            continue; // Skip self-links
          }
          validLinks.push({
            toDocId,
            linkText: link.linkText ?? null,
            position: link.position ?? null,
          });
        }

        try {
          const result = syncDocLinks(
            docId,
            validLinks,
            userId,
            doc.workspaceId
          );

          // Log audit event if doc is workspace-scoped and there were changes
          if (doc.workspaceId && (result.added > 0 || result.removed > 0)) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'doc:links:sync',
              targetType: 'doc',
              targetId: docId,
              details: {
                added: result.added,
                removed: result.removed,
                total: result.total,
              },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'doc_links',
              action: 'synced',
              docId,
              added: result.added,
              removed: result.removed,
              total: result.total,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return result;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to sync doc links');
          return reply.code(500).send({ error: 'Failed to sync links' });
        }
      }
    );
  };
}
