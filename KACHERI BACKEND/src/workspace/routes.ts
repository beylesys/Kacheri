/**
 * Workspace Routes
 *
 * REST endpoints for workspace management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbAdapter } from '../db/types';
import { createWorkspaceStore } from './store';
import { hasPermission, type WorkspaceRole, type CreateWorkspaceInput, type UpdateWorkspaceInput } from './types';
import { getCurrentUserId, getAuthConfig } from '../auth';
import { logAuditEvent } from '../store/audit';

export function createWorkspaceRoutes(db: DbAdapter) {
  const store = createWorkspaceStore(db);

  return async function workspaceRoutes(app: FastifyInstance) {
    // Helper to get user ID from request (handles dev mode)
    function getUserId(req: FastifyRequest): string | null {
      const authConfig = getAuthConfig();

      // Dev mode: check X-Dev-User header
      if (authConfig.devBypassAuth) {
        const devUser = (req.headers['x-dev-user'] as string)?.trim();
        if (devUser) {
          return `user_${devUser}`;
        }
      }

      return getCurrentUserId(req);
    }

    // Require authenticated user
    function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
      const userId = getUserId(req);
      if (!userId) {
        reply.code(401).send({ error: 'Authentication required' });
        return null;
      }
      return userId;
    }

    // Check workspace access
    async function checkAccess(
      workspaceId: string,
      userId: string,
      requiredRole: WorkspaceRole,
      reply: FastifyReply
    ): Promise<boolean> {
      const role = await store.getUserRole(workspaceId, userId);
      if (!role) {
        reply.code(403).send({ error: 'Not a member of this workspace' });
        return false;
      }
      if (!hasPermission(role, requiredRole)) {
        reply.code(403).send({ error: `Requires ${requiredRole} role or higher` });
        return false;
      }
      return true;
    }

    // --- Workspace CRUD ---

    // List user's workspaces
    app.get('/workspaces', async (req, reply) => {
      const userId = requireUser(req, reply);
      if (!userId) return;

      const workspaces = await store.listForUser(userId);
      return { workspaces };
    });

    // Get single workspace
    app.get<{ Params: { id: string } }>('/workspaces/:id', async (req, reply) => {
      const userId = requireUser(req, reply);
      if (!userId) return;

      const workspace = await store.getById(req.params.id);
      if (!workspace) {
        return reply.code(404).send({ error: 'Workspace not found' });
      }

      const role = await store.getUserRole(workspace.id, userId);
      if (!role) {
        return reply.code(403).send({ error: 'Not a member of this workspace' });
      }

      return { ...workspace, role };
    });

    // Create workspace
    app.post<{ Body: CreateWorkspaceInput }>('/workspaces', async (req, reply) => {
      const userId = requireUser(req, reply);
      if (!userId) return;

      const body = req.body ?? {};
      const name = (body.name ?? '').toString().trim();
      if (!name) {
        return reply.code(400).send({ error: 'name is required' });
      }

      const workspace = await store.create(
        { name, description: body.description },
        userId
      );

      return reply.code(201).send({ ...workspace, role: 'owner' as WorkspaceRole });
    });

    // Update workspace
    app.patch<{ Params: { id: string }; Body: UpdateWorkspaceInput }>(
      '/workspaces/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const workspaceId = req.params.id;
        if (!await checkAccess(workspaceId, userId, 'admin', reply)) return;

        const body = req.body ?? {};
        const updated = await store.update(workspaceId, {
          name: body.name,
          description: body.description,
        });

        if (!updated) {
          return reply.code(404).send({ error: 'Workspace not found' });
        }

        const role = await store.getUserRole(workspaceId, userId);
        return { ...updated, role };
      }
    );

    // Delete workspace
    app.delete<{ Params: { id: string } }>('/workspaces/:id', async (req, reply) => {
      const userId = requireUser(req, reply);
      if (!userId) return;

      const workspaceId = req.params.id;
      if (!await checkAccess(workspaceId, userId, 'owner', reply)) return;

      const deleted = await store.delete(workspaceId);
      if (!deleted) {
        return reply.code(404).send({ error: 'Workspace not found' });
      }

      return reply.code(204).send();
    });

    // --- Membership ---

    // List members
    app.get<{ Params: { id: string } }>('/workspaces/:id/members', async (req, reply) => {
      const userId = requireUser(req, reply);
      if (!userId) return;

      const workspaceId = req.params.id;
      if (!await checkAccess(workspaceId, userId, 'viewer', reply)) return;

      const members = await store.listMembers(workspaceId);
      return { members };
    });

    // Add member
    app.post<{ Params: { id: string }; Body: { userId: string; role: WorkspaceRole } }>(
      '/workspaces/:id/members',
      async (req, reply) => {
        const actorId = requireUser(req, reply);
        if (!actorId) return;

        const workspaceId = req.params.id;
        if (!await checkAccess(workspaceId, actorId, 'admin', reply)) return;

        const body = req.body ?? {};
        const targetUserId = (body.userId ?? '').toString().trim();
        const role = body.role;

        if (!targetUserId) {
          return reply.code(400).send({ error: 'userId is required' });
        }
        if (!['viewer', 'editor', 'admin'].includes(role)) {
          return reply.code(400).send({ error: 'role must be viewer, editor, or admin' });
        }

        // Only owner can add admins
        const actorRole = await store.getUserRole(workspaceId, actorId);
        if (role === 'admin' && actorRole !== 'owner') {
          return reply.code(403).send({ error: 'Only owner can add admins' });
        }

        const member = await store.addMember(workspaceId, targetUserId, role);

        // Log audit event
        logAuditEvent({
          workspaceId,
          actorId,
          action: 'member:add',
          targetType: 'user',
          targetId: targetUserId,
          details: { role },
        });

        return reply.code(201).send(member);
      }
    );

    // Update member role
    app.patch<{ Params: { id: string; userId: string }; Body: { role: WorkspaceRole } }>(
      '/workspaces/:id/members/:userId',
      async (req, reply) => {
        const actorId = requireUser(req, reply);
        if (!actorId) return;

        const workspaceId = req.params.id;
        const targetUserId = req.params.userId;

        if (!await checkAccess(workspaceId, actorId, 'admin', reply)) return;

        const body = req.body ?? {};
        const role = body.role;

        if (!['viewer', 'editor', 'admin'].includes(role)) {
          return reply.code(400).send({ error: 'role must be viewer, editor, or admin' });
        }

        // Can't change owner role
        const targetMember = await store.getMember(workspaceId, targetUserId);
        if (!targetMember) {
          return reply.code(404).send({ error: 'Member not found' });
        }
        if (targetMember.role === 'owner') {
          return reply.code(403).send({ error: 'Cannot change owner role' });
        }

        // Only owner can set admin role
        const actorRole = await store.getUserRole(workspaceId, actorId);
        if (role === 'admin' && actorRole !== 'owner') {
          return reply.code(403).send({ error: 'Only owner can set admin role' });
        }

        const previousRole = targetMember.role;
        const updated = await store.updateMemberRole(workspaceId, targetUserId, role);

        // Log audit event
        logAuditEvent({
          workspaceId,
          actorId,
          action: 'role:change',
          targetType: 'user',
          targetId: targetUserId,
          details: { from: previousRole, to: role },
        });

        return updated;
      }
    );

    // Remove member
    app.delete<{ Params: { id: string; userId: string } }>(
      '/workspaces/:id/members/:userId',
      async (req, reply) => {
        const actorId = requireUser(req, reply);
        if (!actorId) return;

        const workspaceId = req.params.id;
        const targetUserId = req.params.userId;

        // Self-removal is allowed (leave workspace)
        if (actorId !== targetUserId) {
          if (!await checkAccess(workspaceId, actorId, 'admin', reply)) return;
        }

        // Can't remove owner
        const targetMember = await store.getMember(workspaceId, targetUserId);
        if (!targetMember) {
          return reply.code(404).send({ error: 'Member not found' });
        }
        if (targetMember.role === 'owner') {
          return reply.code(403).send({ error: 'Cannot remove workspace owner' });
        }

        const previousRole = targetMember.role;
        await store.removeMember(workspaceId, targetUserId);

        // Log audit event
        logAuditEvent({
          workspaceId,
          actorId,
          action: 'member:remove',
          targetType: 'user',
          targetId: targetUserId,
          details: { previousRole },
        });

        return reply.code(204).send();
      }
    );

    // --- Current workspace ---

    // Get or create default workspace for current user
    app.get('/workspaces/default', async (req, reply) => {
      const userId = requireUser(req, reply);
      if (!userId) return;

      const workspace = await store.getOrCreateDefault(userId);
      const role = await store.getUserRole(workspace.id, userId);
      return { ...workspace, role };
    });
  };
}
