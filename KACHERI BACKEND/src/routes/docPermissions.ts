// KACHERI BACKEND/src/routes/docPermissions.ts
// REST endpoints for document-level permissions management.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  type DocRole,
  isValidDocRole,
  listDocPermissions,
  grantDocPermission,
  updateDocPermission,
  revokeDocPermission,
  getDocPermission,
  hasDocPermission,
} from '../store/docPermissions';
import { getDoc, updateDocWorkspaceAccess, type WorkspaceAccessLevel } from '../store/docs';
import { logAuditEvent } from '../store/audit';
import {
  getEffectiveDocRole,
  getUserId,
} from '../workspace/middleware';
import { createNotification } from '../store/notifications';
import { broadcastToUser } from '../realtime/globalHub';

export function createDocPermissionRoutes(db: Database) {
  return async function docPermissionRoutes(app: FastifyInstance) {
    // Helper to get user ID from request
    function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
      const userId = getUserId(req);
      if (!userId) {
        reply.code(401).send({ error: 'Authentication required' });
        return null;
      }
      return userId;
    }

    // Helper to check doc access and set req.docRole
    function checkDocAccess(
      req: FastifyRequest,
      reply: FastifyReply,
      docId: string,
      requiredRole: DocRole
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
    // GET /docs/:id/permissions
    // List all permissions for a document
    // Requires: viewer access (sees own permission) / owner (sees all)
    // -------------------------------------------
    app.get<{ Params: { id: string } }>(
      '/docs/:id/permissions',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Get user's role
        const role = getEffectiveDocRole(db, docId, req);
        if (!role) {
          return reply.code(403).send({ error: 'Access denied' });
        }

        // If owner, return all permissions + workspaceAccess setting
        // Otherwise, return only their own permission
        if (hasDocPermission(role, 'owner')) {
          const permissions = listDocPermissions(docId);
          return {
            permissions,
            workspaceAccess: doc.workspaceAccess ?? null,
          };
        } else {
          // Non-owners can only see their own permission
          const ownPerm = getDocPermission(docId, userId);
          if (ownPerm) {
            return {
              permissions: [{
                docId: ownPerm.docId,
                userId: ownPerm.userId,
                role: ownPerm.role,
                grantedBy: ownPerm.grantedBy,
                grantedAt: new Date(ownPerm.grantedAt).toISOString(),
              }],
            };
          }
          // User has access via workspace role or as creator - synthesize permission info
          return {
            permissions: [{
              docId,
              userId,
              role,
              grantedBy: 'workspace',
              grantedAt: doc.createdAt,
            }],
          };
        }
      }
    );

    // -------------------------------------------
    // POST /docs/:id/permissions
    // Grant access to a user
    // Requires: owner or editor role
    // -------------------------------------------
    app.post<{
      Params: { id: string };
      Body: { userId: string; role: DocRole };
    }>(
      '/docs/:id/permissions',
      async (req, reply) => {
        const actorId = requireUser(req, reply);
        if (!actorId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check actor has editor+ access
        if (!checkDocAccess(req, reply, docId, 'editor')) return;

        const body = req.body ?? {};
        const targetUserId = (body.userId ?? '').toString().trim();
        const role = body.role;

        if (!targetUserId) {
          return reply.code(400).send({ error: 'userId is required' });
        }
        if (!role || !isValidDocRole(role)) {
          return reply.code(400).send({ error: 'role must be owner, editor, commenter, or viewer' });
        }

        // Only owners can grant owner role
        if (role === 'owner' && !hasDocPermission(req.docRole!, 'owner')) {
          return reply.code(403).send({ error: 'Only owners can grant owner role' });
        }

        // Check if user already has permission
        const existingPerm = getDocPermission(docId, targetUserId);
        if (existingPerm) {
          return reply.code(409).send({
            error: 'User already has permission on this document',
            existingRole: existingPerm.role,
          });
        }

        try {
          const permission = grantDocPermission(docId, targetUserId, role, actorId);

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId,
              action: 'doc:permission:grant',
              targetType: 'doc',
              targetId: docId,
              details: { userId: targetUserId, role },
            });

            // Create notification for the user who was granted access
            if (targetUserId !== actorId) {
              const notification = createNotification({
                userId: targetUserId,
                workspaceId: doc.workspaceId,
                type: 'doc_shared',
                title: 'A document was shared with you',
                body: `"${doc.title || 'Untitled'}" - ${role} access`,
                linkType: 'doc',
                linkId: docId,
                actorId,
              });
              if (notification) {
                broadcastToUser(targetUserId, {
                  type: 'notification',
                  notificationId: notification.id,
                  userId: targetUserId,
                  notificationType: 'doc_shared',
                  title: notification.title,
                  ts: Date.now(),
                });
              }
            }
          }

          return reply.code(201).send(permission);
        } catch (err: any) {
          req.log.error({ err }, 'Failed to grant doc permission');
          return reply.code(500).send({ error: 'Failed to grant permission' });
        }
      }
    );

    // -------------------------------------------
    // PATCH /docs/:id/permissions/:userId
    // Update a user's role
    // Requires: owner role
    // -------------------------------------------
    app.patch<{
      Params: { id: string; userId: string };
      Body: { role: DocRole };
    }>(
      '/docs/:id/permissions/:userId',
      async (req, reply) => {
        const actorId = requireUser(req, reply);
        if (!actorId) return;

        const docId = req.params.id;
        const targetUserId = req.params.userId;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Only owners can update permissions
        if (!checkDocAccess(req, reply, docId, 'owner')) return;

        const body = req.body ?? {};
        const role = body.role;

        if (!role || !isValidDocRole(role)) {
          return reply.code(400).send({ error: 'role must be owner, editor, commenter, or viewer' });
        }

        // Check if target user has permission
        const existingPerm = getDocPermission(docId, targetUserId);
        if (!existingPerm) {
          return reply.code(404).send({ error: 'User does not have explicit permission on this document' });
        }

        // Can't demote owner to non-owner (must transfer ownership first)
        if (existingPerm.role === 'owner' && role !== 'owner') {
          return reply.code(403).send({ error: 'Cannot demote owner. Transfer ownership first.' });
        }

        try {
          const previousRole = existingPerm.role;
          const updated = updateDocPermission(docId, targetUserId, role);

          if (!updated) {
            return reply.code(404).send({ error: 'Permission not found' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId,
              action: 'doc:permission:update',
              targetType: 'doc',
              targetId: docId,
              details: { userId: targetUserId, from: previousRole, to: role },
            });
          }

          return updated;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to update doc permission');
          return reply.code(500).send({ error: 'Failed to update permission' });
        }
      }
    );

    // -------------------------------------------
    // DELETE /docs/:id/permissions/:userId
    // Revoke a user's permission
    // Requires: owner role (or self-removal for non-owners)
    // -------------------------------------------
    app.delete<{
      Params: { id: string; userId: string };
    }>(
      '/docs/:id/permissions/:userId',
      async (req, reply) => {
        const actorId = requireUser(req, reply);
        if (!actorId) return;

        const docId = req.params.id;
        const targetUserId = req.params.userId;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Get actor's role
        const actorRole = getEffectiveDocRole(db, docId, req);
        if (!actorRole) {
          return reply.code(403).send({ error: 'Access denied' });
        }

        // Self-removal is allowed (leave document)
        const isSelfRemoval = actorId === targetUserId;
        if (!isSelfRemoval && !hasDocPermission(actorRole, 'owner')) {
          return reply.code(403).send({ error: 'Only owners can revoke other users\' permissions' });
        }

        // Check if target has permission
        const existingPerm = getDocPermission(docId, targetUserId);
        if (!existingPerm) {
          return reply.code(404).send({ error: 'User does not have explicit permission on this document' });
        }

        // Can't remove owner
        if (existingPerm.role === 'owner') {
          return reply.code(403).send({ error: 'Cannot remove document owner' });
        }

        try {
          const previousRole = existingPerm.role;
          const revoked = revokeDocPermission(docId, targetUserId);

          if (!revoked) {
            return reply.code(404).send({ error: 'Permission not found' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId,
              action: 'doc:permission:revoke',
              targetType: 'doc',
              targetId: docId,
              details: { userId: targetUserId, previousRole },
            });
          }

          return reply.code(204).send();
        } catch (err: any) {
          req.log.error({ err }, 'Failed to revoke doc permission');
          return reply.code(500).send({ error: 'Failed to revoke permission' });
        }
      }
    );

    // -------------------------------------------
    // PATCH /docs/:id/workspace-access
    // Update workspace-wide access level for a document
    // Requires: owner role
    // -------------------------------------------
    app.patch<{
      Params: { id: string };
      Body: { workspaceAccess: WorkspaceAccessLevel | null };
    }>(
      '/docs/:id/workspace-access',
      async (req, reply) => {
        const actorId = requireUser(req, reply);
        if (!actorId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Only owners can change workspace access
        if (!checkDocAccess(req, reply, docId, 'owner')) return;

        // Validate workspaceAccess value
        const body = req.body ?? {};
        const workspaceAccess = body.workspaceAccess;
        const validValues: (WorkspaceAccessLevel | null)[] = ['none', 'viewer', 'commenter', 'editor', null];
        if (!validValues.includes(workspaceAccess)) {
          return reply.code(400).send({
            error: 'workspaceAccess must be none, viewer, commenter, editor, or null',
          });
        }

        try {
          const previousAccess = doc.workspaceAccess ?? null;
          const updated = updateDocWorkspaceAccess(docId, workspaceAccess);

          if (!updated) {
            return reply.code(500).send({ error: 'Failed to update workspace access' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId,
              action: 'doc:workspace_access:update',
              targetType: 'doc',
              targetId: docId,
              details: { from: previousAccess, to: workspaceAccess },
            });
          }

          return {
            docId,
            workspaceAccess: updated.workspaceAccess ?? null,
            updatedAt: updated.updatedAt,
          };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to update workspace access');
          return reply.code(500).send({ error: 'Failed to update workspace access' });
        }
      }
    );
  };
}
