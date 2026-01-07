// src/routes/invites.ts
// REST API routes for workspace invites.

import type { FastifyPluginCallback } from 'fastify';
import * as inviteStore from '../workspace/inviteStore';
import { createWorkspaceStore, type WorkspaceStore } from '../workspace/store';
import { getUserId } from '../workspace/middleware';
import { db } from '../db';

// Create a workspace store instance
const workspaceStore: WorkspaceStore = createWorkspaceStore(db);

const createInviteRoutes: FastifyPluginCallback = (fastify, _opts, done) => {
  /**
   * POST /workspaces/:workspaceId/invites
   * Create a new invite. Requires admin+ role.
   */
  fastify.post<{
    Params: { workspaceId: string };
    Body: { email: string; role?: inviteStore.WorkspaceRole };
  }>('/workspaces/:workspaceId/invites', async (request, reply) => {
    const { workspaceId } = request.params;
    const { email, role } = request.body;

    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Check user has admin+ role
    const userRole = workspaceStore.getUserRole(workspaceId, userId);
    if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
      return reply.status(403).send({ error: 'Requires admin permissions' });
    }

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return reply.status(400).send({ error: 'Valid email required' });
    }

    // Validate role if provided
    const validRoles: inviteStore.WorkspaceRole[] = ['admin', 'editor', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return reply.status(400).send({ error: 'Invalid role. Must be admin, editor, or viewer.' });
    }

    try {
      const invite = inviteStore.createInvite({
        workspaceId,
        invitedEmail: email,
        invitedBy: userId,
        role: role ?? 'editor',
      });

      return reply.status(201).send(invite);
    } catch (err) {
      fastify.log.error(err, '[invites] Failed to create invite');
      return reply.status(500).send({ error: 'Failed to create invite' });
    }
  });

  /**
   * GET /workspaces/:workspaceId/invites
   * List invites for a workspace. Requires admin+ role.
   */
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { status?: 'all' | 'pending' };
  }>('/workspaces/:workspaceId/invites', async (request, reply) => {
    const { workspaceId } = request.params;
    const { status } = request.query;

    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Check user has admin+ role
    const userRole = workspaceStore.getUserRole(workspaceId, userId);
    if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
      return reply.status(403).send({ error: 'Requires admin permissions' });
    }

    try {
      const invites = status === 'pending'
        ? inviteStore.listPendingInvites(workspaceId)
        : inviteStore.listInvites(workspaceId);

      return reply.send({ invites });
    } catch (err) {
      fastify.log.error(err, '[invites] Failed to list invites');
      return reply.status(500).send({ error: 'Failed to list invites' });
    }
  });

  /**
   * DELETE /workspaces/:workspaceId/invites/:inviteId
   * Revoke an invite. Requires admin+ role.
   */
  fastify.delete<{
    Params: { workspaceId: string; inviteId: string };
  }>('/workspaces/:workspaceId/invites/:inviteId', async (request, reply) => {
    const { workspaceId, inviteId } = request.params;

    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Check user has admin+ role
    const userRole = workspaceStore.getUserRole(workspaceId, userId);
    if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
      return reply.status(403).send({ error: 'Requires admin permissions' });
    }

    const inviteIdNum = parseInt(inviteId, 10);
    if (isNaN(inviteIdNum)) {
      return reply.status(400).send({ error: 'Invalid invite ID' });
    }

    const success = inviteStore.revokeInvite(inviteIdNum, workspaceId);
    if (!success) {
      return reply.status(404).send({ error: 'Invite not found or already processed' });
    }

    return reply.status(204).send();
  });

  /**
   * GET /invites/:token
   * Get invite info by token. Public endpoint (for invite accept page).
   */
  fastify.get<{
    Params: { token: string };
  }>('/invites/:token', async (request, reply) => {
    const { token } = request.params;

    const invite = inviteStore.getInviteWithWorkspace(token);
    if (!invite) {
      return reply.status(404).send({ error: 'Invite not found' });
    }

    // Check if expired
    const isExpired = invite.expiresAt < Date.now();
    const isValid = invite.status === 'pending' && !isExpired;

    // Return limited info (don't expose full token again)
    return reply.send({
      workspaceId: invite.workspaceId,
      workspaceName: invite.workspaceName,
      invitedEmail: invite.invitedEmail,
      invitedBy: invite.invitedBy,
      inviterName: invite.inviterName,
      role: invite.role,
      status: isExpired && invite.status === 'pending' ? 'expired' : invite.status,
      expiresAt: invite.expiresAt,
      isValid,
    });
  });

  /**
   * POST /invites/:token/accept
   * Accept an invite. Requires authenticated user.
   */
  fastify.post<{
    Params: { token: string };
  }>('/invites/:token/accept', async (request, reply) => {
    const { token } = request.params;

    const userId = getUserId(request);
    if (!userId) {
      return reply.status(401).send({ error: 'Please log in to accept this invite' });
    }

    // Get user email if available (for validation)
    // Note: In dev mode we might not have real emails
    let userEmail: string | undefined;
    try {
      // Attempt to get user info if we have auth
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        // Could look up user from session/token here
        // For now, skip email validation in dev mode
      }
    } catch {
      // No email validation
    }

    const result = inviteStore.acceptInvite(token, userId, userEmail);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    // Get workspace info to return
    const workspace = workspaceStore.getById(result.workspaceId);

    return reply.send({
      success: true,
      workspaceId: result.workspaceId,
      workspaceName: workspace?.name,
    });
  });

  done();
};

export { createInviteRoutes };
