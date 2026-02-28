// KACHERI BACKEND/src/routes/notifications.ts
// REST endpoints for user notifications.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbAdapter } from '../db/types';
import {
  listNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from '../store/notifications';
import { logAuditEvent } from '../store/audit';
import { broadcastToUser } from '../realtime/globalHub';

// ============================================
// Route Plugin
// ============================================

export function createNotificationRoutes(_db: DbAdapter) {
  return async function notificationRoutes(app: FastifyInstance) {
    // ----------------------------------------
    // GET /notifications - List user notifications
    // ----------------------------------------
    app.get('/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.id || 'dev-user';

      const query = request.query as {
        limit?: string;
        before?: string;
        unreadOnly?: string;
        workspaceId?: string;
      };

      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const before = query.before ? parseInt(query.before, 10) : undefined;
      const unreadOnly = query.unreadOnly === 'true';
      const workspaceId = query.workspaceId;

      const { notifications, hasMore } = await listNotifications(userId, {
        limit,
        before,
        unreadOnly,
        workspaceId,
      });

      const unreadCount = await getUnreadCount(userId, workspaceId);

      return reply.send({
        notifications,
        unreadCount,
        hasMore,
      });
    });

    // ----------------------------------------
    // GET /notifications/count - Get unread count
    // ----------------------------------------
    app.get('/notifications/count', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.id || 'dev-user';

      const query = request.query as { workspaceId?: string };
      const workspaceId = query.workspaceId;

      const unreadCount = await getUnreadCount(userId, workspaceId);

      return reply.send({ unreadCount });
    });

    // ----------------------------------------
    // POST /notifications/:id/read - Mark as read
    // ----------------------------------------
    app.post(
      '/notifications/:id/read',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = request.user?.id || 'dev-user';
        const notificationId = parseInt(request.params.id, 10);

        if (isNaN(notificationId)) {
          return reply.status(400).send({ error: 'Invalid notification ID' });
        }

        // Get notification to verify ownership
        const notification = await getNotification(notificationId);
        if (!notification) {
          return reply.status(404).send({ error: 'Notification not found' });
        }

        if (notification.userId !== userId) {
          return reply.status(403).send({ error: 'Cannot mark others\' notifications as read' });
        }

        const success = await markAsRead(notificationId, userId);
        if (!success) {
          return reply.status(400).send({ error: 'Notification already read or not found' });
        }

        logAuditEvent({
          workspaceId: notification.workspaceId,
          actorId: userId,
          action: 'notification:read',
          targetType: 'notification',
          targetId: String(notificationId),
        });

        return reply.send({ success: true });
      }
    );

    // ----------------------------------------
    // POST /notifications/read-all - Mark all as read
    // ----------------------------------------
    app.post('/notifications/read-all', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.id || 'dev-user';

      const body = request.body as { workspaceId?: string } | undefined;
      const workspaceId = body?.workspaceId;

      const count = await markAllAsRead(userId, workspaceId);

      logAuditEvent({
        workspaceId: workspaceId ?? 'global',
        actorId: userId,
        action: 'notification:read_all',
        targetType: 'notification',
        targetId: 'all',
        details: { count },
      });

      return reply.send({ count });
    });

    // ----------------------------------------
    // DELETE /notifications/:id - Delete notification
    // ----------------------------------------
    app.delete(
      '/notifications/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = request.user?.id || 'dev-user';
        const notificationId = parseInt(request.params.id, 10);

        if (isNaN(notificationId)) {
          return reply.status(400).send({ error: 'Invalid notification ID' });
        }

        // Get notification to verify ownership
        const notification = await getNotification(notificationId);
        if (!notification) {
          return reply.status(404).send({ error: 'Notification not found' });
        }

        if (notification.userId !== userId) {
          return reply.status(403).send({ error: 'Cannot delete others\' notifications' });
        }

        const success = await deleteNotification(notificationId, userId);
        if (!success) {
          return reply.status(400).send({ error: 'Failed to delete notification' });
        }

        logAuditEvent({
          workspaceId: notification.workspaceId,
          actorId: userId,
          action: 'notification:delete',
          targetType: 'notification',
          targetId: String(notificationId),
        });

        return reply.status(204).send();
      }
    );
  };
}
