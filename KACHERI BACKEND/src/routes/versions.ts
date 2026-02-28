// KACHERI BACKEND/src/routes/versions.ts
// REST endpoints for document version history with snapshots and diff.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbAdapter } from '../db/types';
import {
  createVersion,
  getVersion,
  getVersionMeta,
  listVersions,
  renameVersion,
  deleteVersion,
  diffVersions,
  getVersionCount,
  type CreateVersionParams,
} from '../store/versions';
import { getDoc } from '../store/docs';
import { logAuditEvent } from '../store/audit';
import { hasDocPermission } from '../store/docPermissions';
import {
  getEffectiveDocRole,
  getUserId,
} from '../workspace/middleware';
import { wsBroadcast } from '../realtime/globalHub';

export function createVersionRoutes(db: DbAdapter) {
  return async function versionRoutes(app: FastifyInstance) {
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
    async function checkDocAccess(
      req: FastifyRequest,
      reply: FastifyReply,
      docId: string,
      requiredRole: 'viewer' | 'commenter' | 'editor' | 'owner'
    ): Promise<boolean> {
      const role = await getEffectiveDocRole(db, docId, req);
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
    // GET /docs/:id/versions
    // List all versions for a document
    // Requires: viewer access
    // -------------------------------------------
    app.get<{
      Params: { id: string };
      Querystring: { limit?: string; offset?: string };
    }>(
      '/docs/:id/versions',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = await getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check viewer+ access
        if (!await checkDocAccess(req, reply, docId, 'viewer')) return;

        const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 200);
        const offset = parseInt(req.query.offset ?? '0', 10);

        try {
          const versions = await listVersions(docId, { limit, offset });
          const total = await getVersionCount(docId);

          return { versions, total };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to list versions');
          return reply.code(500).send({ error: 'Failed to list versions' });
        }
      }
    );

    // -------------------------------------------
    // POST /docs/:id/versions
    // Create a new version snapshot
    // Requires: editor access
    // -------------------------------------------
    app.post<{
      Params: { id: string };
      Body: {
        name?: string;
        snapshotHtml: string;
        snapshotText: string;
        metadata?: { wordCount?: number; charCount?: number; notes?: string };
      };
    }>(
      '/docs/:id/versions',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = await getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!await checkDocAccess(req, reply, docId, 'editor')) return;

        const body = req.body ?? {};
        const snapshotHtml = body.snapshotHtml;
        const snapshotText = body.snapshotText;

        if (!snapshotHtml || typeof snapshotHtml !== 'string') {
          return reply.code(400).send({ error: 'snapshotHtml is required' });
        }

        if (!snapshotText || typeof snapshotText !== 'string') {
          return reply.code(400).send({ error: 'snapshotText is required' });
        }

        const params: CreateVersionParams = {
          docId,
          name: body.name?.trim() || null,
          snapshotHtml,
          snapshotText,
          createdBy: userId,
          metadata: body.metadata,
        };

        try {
          const version = await createVersion(params);

          if (!version) {
            return reply.code(500).send({ error: 'Failed to create version' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'version:create',
              targetType: 'version',
              targetId: version.id.toString(),
              details: { docId, versionNumber: version.versionNumber, name: version.name },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'version',
              action: 'created',
              docId,
              versionId: version.id,
              versionNumber: version.versionNumber,
              name: version.name,
              createdBy: userId,
              ts: Date.now(),
            });
          }

          return reply.code(201).send(version);
        } catch (err: any) {
          req.log.error({ err }, 'Failed to create version');
          return reply.code(500).send({ error: 'Failed to create version' });
        }
      }
    );

    // -------------------------------------------
    // GET /docs/:id/versions/:versionId
    // Get full version snapshot
    // Requires: viewer access
    // -------------------------------------------
    app.get<{
      Params: { id: string; versionId: string };
    }>(
      '/docs/:id/versions/:versionId',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;
        const versionId = parseInt(req.params.versionId, 10);

        if (isNaN(versionId)) {
          return reply.code(400).send({ error: 'Invalid version ID' });
        }

        // Check doc exists
        const doc = await getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check viewer+ access
        if (!await checkDocAccess(req, reply, docId, 'viewer')) return;

        try {
          const version = await getVersion(versionId);

          if (!version) {
            return reply.code(404).send({ error: 'Version not found' });
          }

          // Verify version belongs to this doc
          if (version.docId !== docId) {
            return reply.code(404).send({ error: 'Version not found' });
          }

          return version;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to get version');
          return reply.code(500).send({ error: 'Failed to get version' });
        }
      }
    );

    // -------------------------------------------
    // PATCH /docs/:id/versions/:versionId
    // Rename a version
    // Requires: editor access
    // -------------------------------------------
    app.patch<{
      Params: { id: string; versionId: string };
      Body: { name: string | null };
    }>(
      '/docs/:id/versions/:versionId',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;
        const versionId = parseInt(req.params.versionId, 10);

        if (isNaN(versionId)) {
          return reply.code(400).send({ error: 'Invalid version ID' });
        }

        // Check doc exists
        const doc = await getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!await checkDocAccess(req, reply, docId, 'editor')) return;

        // Verify version belongs to this doc
        const existing = await getVersionMeta(versionId);
        if (!existing || existing.docId !== docId) {
          return reply.code(404).send({ error: 'Version not found' });
        }

        const body = req.body ?? {};
        const name = body.name === null ? null : (body.name?.trim() || null);

        try {
          const updated = await renameVersion(versionId, name);

          if (!updated) {
            return reply.code(404).send({ error: 'Version not found' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'version:rename',
              targetType: 'version',
              targetId: versionId.toString(),
              details: { docId, versionNumber: existing.versionNumber, oldName: existing.name, newName: name },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'version',
              action: 'renamed',
              docId,
              versionId,
              versionNumber: existing.versionNumber,
              name,
              createdBy: userId,
              ts: Date.now(),
            });
          }

          return updated;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to rename version');
          return reply.code(500).send({ error: 'Failed to rename version' });
        }
      }
    );

    // -------------------------------------------
    // DELETE /docs/:id/versions/:versionId
    // Delete a version
    // Requires: editor access
    // -------------------------------------------
    app.delete<{
      Params: { id: string; versionId: string };
    }>(
      '/docs/:id/versions/:versionId',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;
        const versionId = parseInt(req.params.versionId, 10);

        if (isNaN(versionId)) {
          return reply.code(400).send({ error: 'Invalid version ID' });
        }

        // Check doc exists
        const doc = await getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!await checkDocAccess(req, reply, docId, 'editor')) return;

        // Verify version belongs to this doc
        const existing = await getVersionMeta(versionId);
        if (!existing || existing.docId !== docId) {
          return reply.code(404).send({ error: 'Version not found' });
        }

        try {
          const deleted = await deleteVersion(versionId);

          if (!deleted) {
            return reply.code(404).send({ error: 'Version not found' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'version:delete',
              targetType: 'version',
              targetId: versionId.toString(),
              details: { docId, versionNumber: existing.versionNumber, name: existing.name },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'version',
              action: 'deleted',
              docId,
              versionId,
              versionNumber: existing.versionNumber,
              name: existing.name,
              createdBy: userId,
              ts: Date.now(),
            });
          }

          return reply.code(204).send();
        } catch (err: any) {
          req.log.error({ err }, 'Failed to delete version');
          return reply.code(500).send({ error: 'Failed to delete version' });
        }
      }
    );

    // -------------------------------------------
    // GET /docs/:id/versions/:versionId/diff
    // Compute diff between two versions
    // Requires: viewer access
    // Query: compareWith - version number to compare against
    // -------------------------------------------
    app.get<{
      Params: { id: string; versionId: string };
      Querystring: { compareWith: string };
    }>(
      '/docs/:id/versions/:versionId/diff',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;
        const versionId = parseInt(req.params.versionId, 10);
        const compareWith = parseInt(req.query.compareWith, 10);

        if (isNaN(versionId)) {
          return reply.code(400).send({ error: 'Invalid version ID' });
        }

        if (isNaN(compareWith)) {
          return reply.code(400).send({ error: 'compareWith query parameter is required and must be a number' });
        }

        // Check doc exists
        const doc = await getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check viewer+ access
        if (!await checkDocAccess(req, reply, docId, 'viewer')) return;

        // Get the version to get its version number
        const version = await getVersionMeta(versionId);
        if (!version || version.docId !== docId) {
          return reply.code(404).send({ error: 'Version not found' });
        }

        try {
          const diff = await diffVersions(docId, compareWith, version.versionNumber);

          if (!diff) {
            return reply.code(404).send({ error: 'One or both versions not found' });
          }

          return diff;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to compute diff');
          return reply.code(500).send({ error: 'Failed to compute diff' });
        }
      }
    );

    // -------------------------------------------
    // POST /docs/:id/restore-version
    // Restore document to a prior version
    // Creates a backup version first, then returns the snapshot to apply
    // Requires: editor access
    // -------------------------------------------
    app.post<{
      Params: { id: string };
      Body: {
        versionId: number;
        currentHtml: string;
        currentText: string;
      };
    }>(
      '/docs/:id/restore-version',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = await getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!await checkDocAccess(req, reply, docId, 'editor')) return;

        const body = req.body ?? {};
        const versionId = body.versionId;
        const currentHtml = body.currentHtml;
        const currentText = body.currentText;

        if (!versionId || typeof versionId !== 'number') {
          return reply.code(400).send({ error: 'versionId is required' });
        }

        if (!currentHtml || typeof currentHtml !== 'string') {
          return reply.code(400).send({ error: 'currentHtml is required' });
        }

        if (!currentText || typeof currentText !== 'string') {
          return reply.code(400).send({ error: 'currentText is required' });
        }

        // Get the version to restore
        const targetVersion = await getVersion(versionId);
        if (!targetVersion || targetVersion.docId !== docId) {
          return reply.code(404).send({ error: 'Version not found' });
        }

        try {
          // Create a backup version of current state
          const backupVersion = await createVersion({
            docId,
            name: `Before restore to v${targetVersion.versionNumber}`,
            snapshotHtml: currentHtml,
            snapshotText: currentText,
            createdBy: userId,
            metadata: { notes: `Auto-backup before restoring to version ${targetVersion.versionNumber}` },
          });

          if (!backupVersion) {
            return reply.code(500).send({ error: 'Failed to create backup version' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'version:restore',
              targetType: 'version',
              targetId: versionId.toString(),
              details: {
                docId,
                restoredFromVersion: targetVersion.versionNumber,
                backupVersionId: backupVersion.id,
                backupVersionNumber: backupVersion.versionNumber,
              },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'version',
              action: 'restored',
              docId,
              versionId,
              versionNumber: targetVersion.versionNumber,
              name: targetVersion.name,
              createdBy: userId,
              ts: Date.now(),
            });
          }

          return {
            ok: true,
            restoredFromVersion: targetVersion.versionNumber,
            newVersionCreated: backupVersion.versionNumber,
            snapshotHtml: targetVersion.snapshotHtml,
            snapshotText: targetVersion.snapshotText,
          };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to restore version');
          return reply.code(500).send({ error: 'Failed to restore version' });
        }
      }
    );
  };
}
