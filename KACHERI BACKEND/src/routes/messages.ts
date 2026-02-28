// KACHERI BACKEND/src/routes/messages.ts
// REST endpoints for workspace messages (persistent chat).

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createMessage,
  getMessage,
  listMessages,
  updateMessage,
  deleteMessage,
  type CreateMessageParams,
  type ListMessagesOptions,
} from '../store/messages';
import { createWorkspaceStore } from '../workspace/store';
import { hasPermission } from '../workspace/types';
import { logAuditEvent } from '../store/audit';
import { getUserId } from '../workspace/middleware';
import { wsBroadcast, broadcastToUser } from '../realtime/globalHub';
import { createNotification } from '../store/notifications';
import { db as appDb } from '../db';

export function createMessageRoutes(db: import('../db/types').DbAdapter) {
  const workspaceStore = createWorkspaceStore(db);

  return async function messageRoutes(app: FastifyInstance) {
    // Helper to get user ID from request
    function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
      const userId = getUserId(req);
      if (!userId) {
        reply.code(401).send({ error: 'Authentication required' });
        return null;
      }
      return userId;
    }

    // Helper to check workspace membership
    async function requireWorkspaceMember(
      req: FastifyRequest,
      reply: FastifyReply,
      workspaceId: string,
      userId: string
    ): Promise<boolean> {
      const role = await workspaceStore.getUserRole(workspaceId, userId);
      if (!role) {
        reply.code(403).send({ error: 'Not a member of this workspace' });
        return false;
      }
      // Any member can send messages (viewer+)
      if (!hasPermission(role, 'viewer')) {
        reply.code(403).send({ error: 'Requires viewer role or higher' });
        return false;
      }
      return true;
    }

    // -------------------------------------------
    // GET /workspaces/:workspaceId/messages
    // List messages for a workspace
    // Requires: workspace member
    // -------------------------------------------
    app.get<{
      Params: { workspaceId: string };
      Querystring: { limit?: string; before?: string; after?: string };
    }>(
      '/workspaces/:workspaceId/messages',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const workspaceId = req.params.workspaceId;

        // Check workspace exists
        const workspace = await workspaceStore.getById(workspaceId);
        if (!workspace) {
          return reply.code(404).send({ error: 'Workspace not found' });
        }

        // Check membership
        if (!await requireWorkspaceMember(req, reply, workspaceId, userId)) return;

        const options: ListMessagesOptions = {
          limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
          before: req.query.before ? parseInt(req.query.before, 10) : undefined,
          after: req.query.after ? parseInt(req.query.after, 10) : undefined,
        };

        const { messages, hasMore } = await listMessages(workspaceId, options);
        return { messages, hasMore };
      }
    );

    // -------------------------------------------
    // POST /workspaces/:workspaceId/messages
    // Create a new message
    // Requires: workspace member
    // -------------------------------------------
    app.post<{
      Params: { workspaceId: string };
      Body: {
        content: string;
        replyToId?: number;
        mentions?: string[];
      };
    }>(
      '/workspaces/:workspaceId/messages',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const workspaceId = req.params.workspaceId;

        // Check workspace exists
        const workspace = await workspaceStore.getById(workspaceId);
        if (!workspace) {
          return reply.code(404).send({ error: 'Workspace not found' });
        }

        // Check membership
        if (!await requireWorkspaceMember(req, reply, workspaceId, userId)) return;

        const body = req.body ?? {};
        const content = (body.content ?? '').toString().trim();

        if (!content) {
          return reply.code(400).send({ error: 'content is required' });
        }

        if (content.length > 5000) {
          return reply.code(400).send({ error: 'content exceeds maximum length of 5000 characters' });
        }

        // Parse mentions array (validate user IDs are strings)
        const rawMentions = body.mentions ?? [];
        const mentions: string[] = Array.isArray(rawMentions)
          ? rawMentions.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
          : [];

        const params: CreateMessageParams = {
          workspaceId,
          authorId: userId,
          content,
          replyToId: body.replyToId ?? null,
        };

        try {
          const message = await createMessage(params);

          if (!message) {
            return reply.code(400).send({ error: 'Failed to create message. Reply target may not exist.' });
          }

          // Insert mention records and create notifications
          const now = Date.now();
          for (const mentionedUserId of mentions) {
            // Skip self-mentions
            if (mentionedUserId === userId) continue;

            // Verify mentioned user is a workspace member
            const mentionedRole = await workspaceStore.getUserRole(workspaceId, mentionedUserId);
            if (!mentionedRole) continue;

            // Insert mention record
            try {
              await appDb.run(
                `INSERT INTO message_mentions (message_id, user_id, created_at) VALUES (?, ?, ?)`,
                [message.id, mentionedUserId, now]
              );
            } catch (err) {
              req.log.warn({ err, messageId: message.id, mentionedUserId }, 'Failed to insert mention record');
            }

            // Create notification
            const notification = await createNotification({
              userId: mentionedUserId,
              workspaceId,
              type: 'mention',
              title: 'You were mentioned in a message',
              body: content.slice(0, 100),
              linkType: 'message',
              linkId: message.id.toString(),
              actorId: userId,
            });

            // Broadcast notification to mentioned user
            if (notification) {
              broadcastToUser(mentionedUserId, {
                type: 'notification',
                notificationId: notification.id,
                userId: mentionedUserId,
                notificationType: 'mention',
                title: notification.title,
                ts: now,
              });
            }
          }

          // Log audit event
          logAuditEvent({
            workspaceId,
            actorId: userId,
            action: 'message:create',
            targetType: 'message',
            targetId: message.id.toString(),
            details: { replyToId: message.replyToId, mentionCount: mentions.length },
          });

          // Broadcast to workspace
          wsBroadcast(workspaceId, {
            type: 'message',
            action: 'created',
            messageId: message.id,
            authorId: userId,
            content: message.content,
            replyToId: message.replyToId,
            ts: Date.now(),
          });

          return reply.code(201).send(message);
        } catch (err: any) {
          req.log.error({ err }, 'Failed to create message');
          return reply.code(500).send({ error: 'Failed to create message' });
        }
      }
    );

    // -------------------------------------------
    // PATCH /messages/:id
    // Edit own message
    // Requires: author only
    // -------------------------------------------
    app.patch<{
      Params: { id: string };
      Body: { content: string };
    }>(
      '/messages/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const messageId = parseInt(req.params.id, 10);
        if (isNaN(messageId)) {
          return reply.code(400).send({ error: 'Invalid message ID' });
        }

        const existing = await getMessage(messageId);
        if (!existing) {
          return reply.code(404).send({ error: 'Message not found' });
        }

        // Only author can edit
        if (existing.authorId !== userId) {
          return reply.code(403).send({ error: 'Can only edit your own messages' });
        }

        // Verify user is still a workspace member
        if (!await requireWorkspaceMember(req, reply, existing.workspaceId, userId)) return;

        const body = req.body ?? {};
        const content = (body.content ?? '').toString().trim();

        if (!content) {
          return reply.code(400).send({ error: 'content is required' });
        }

        if (content.length > 5000) {
          return reply.code(400).send({ error: 'content exceeds maximum length of 5000 characters' });
        }

        try {
          const updated = await updateMessage(messageId, content, userId);

          if (!updated) {
            return reply.code(404).send({ error: 'Message not found' });
          }

          // Log audit event
          logAuditEvent({
            workspaceId: existing.workspaceId,
            actorId: userId,
            action: 'message:update',
            targetType: 'message',
            targetId: messageId.toString(),
            details: {},
          });

          // Broadcast to workspace
          wsBroadcast(existing.workspaceId, {
            type: 'message',
            action: 'updated',
            messageId,
            authorId: userId,
            content,
            replyToId: existing.replyToId,
            ts: Date.now(),
          });

          return updated;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to update message');
          return reply.code(500).send({ error: 'Failed to update message' });
        }
      }
    );

    // -------------------------------------------
    // DELETE /messages/:id
    // Soft delete own message
    // Requires: author only
    // -------------------------------------------
    app.delete<{ Params: { id: string } }>(
      '/messages/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const messageId = parseInt(req.params.id, 10);
        if (isNaN(messageId)) {
          return reply.code(400).send({ error: 'Invalid message ID' });
        }

        const existing = await getMessage(messageId);
        if (!existing) {
          return reply.code(404).send({ error: 'Message not found' });
        }

        // Only author can delete
        if (existing.authorId !== userId) {
          return reply.code(403).send({ error: 'Can only delete your own messages' });
        }

        try {
          const deleted = await deleteMessage(messageId, userId);

          if (!deleted) {
            return reply.code(404).send({ error: 'Message not found' });
          }

          // Log audit event
          logAuditEvent({
            workspaceId: existing.workspaceId,
            actorId: userId,
            action: 'message:delete',
            targetType: 'message',
            targetId: messageId.toString(),
            details: {},
          });

          // Broadcast to workspace
          wsBroadcast(existing.workspaceId, {
            type: 'message',
            action: 'deleted',
            messageId,
            authorId: userId,
            ts: Date.now(),
          });

          return reply.code(204).send();
        } catch (err: any) {
          req.log.error({ err }, 'Failed to delete message');
          return reply.code(500).send({ error: 'Failed to delete message' });
        }
      }
    );
  };
}
