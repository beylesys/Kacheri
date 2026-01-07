// KACHERI BACKEND/src/routes/notifications.ts
// REST endpoints for user notifications.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import {
  listNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from '../store/notifications';
import { auditLog } from '../store/audit';
import { broadcastToUser } from '../realtime/globalHub';

// ============================================
// Route Plugin
// ============================================

export function createNotificationRoutes(_db: Database.Database) {
  return async function notificationRoutes(app: FastifyInstance) {
    // ----------------------------------------
    // GET /notifications - List user notifications
    // ----------------------------------------
    app.get('/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.headers['x-user-id'] as string) || 'dev-user';

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

      const { notifications, hasMore } = listNotifications(userId, {
        limit,
        before,
        unreadOnly,
        workspaceId,
      });

      const unreadCount = getUnreadCount(userId, workspaceId);

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
      const userId = (request.headers['x-user-id'] as string) || 'dev-user';

      const query = request.query as { workspaceId?: string };
      const workspaceId = query.workspaceId;

      const unreadCount = getUnreadCount(userId, workspaceId);

      return reply.send({ unreadCount });
    });

    // ----------------------------------------
    // POST /notifications/:id/read - Mark as read
    // ----------------------------------------
    app.post(
      '/notifications/:id/read',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = (request.headers['x-user-id'] as string) || 'dev-user';
        const notificationId = parseInt(request.params.id, 10);

        if (isNaN(notificationId)) {
          return reply.status(400).send({ error: 'Invalid notification ID' });
        }

        // Get notification to verify ownership
        const notification = getNotification(notificationId);
        if (!notification) {
          return reply.status(404).send({ error: 'Notification not found' });
        }

        if (notification.userId !== userId) {
          return reply.status(403).send({ error: 'Cannot mark others\' notifications as read' });
        }

        const success = markAsRead(notificationId, userId);
        if (!success) {
          return reply.status(400).send({ error: 'Notification already read or not found' });
        }

        // Fire-and-forget audit log
        auditLog({
          userId,
          workspaceId: notification.workspaceId,
          action: 'notification_read',
          resourceType: 'notification',
          resourceId: String(notificationId),
          details: {},
        }).catch(() => {});

        return reply.send({ success: true });
      }
    );

    // ----------------------------------------
    // POST /notifications/read-all - Mark all as read
    // ----------------------------------------
    app.post('/notifications/read-all', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.headers['x-user-id'] as string) || 'dev-user';

      const body = request.body as { workspaceId?: string } | undefined;
      const workspaceId = body?.workspaceId;

      const count = markAllAsRead(userId, workspaceId);

      // Fire-and-forget audit log
      auditLog({
        userId,
        workspaceId: workspaceId ?? 'global',
        action: 'notifications_read_all',
        resourceType: 'notification',
        resourceId: 'all',
        details: { count },
      }).catch(() => {});

      return reply.send({ count });
    });

    // ----------------------------------------
    // DELETE /notifications/:id - Delete notification
    // ----------------------------------------
    app.delete(
      '/notifications/:id',
      async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const userId = (request.headers['x-user-id'] as string) || 'dev-user';
        const notificationId = parseInt(request.params.id, 10);

        if (isNaN(notificationId)) {
          return reply.status(400).send({ error: 'Invalid notification ID' });
        }

        // Get notification to verify ownership
        const notification = getNotification(notificationId);
        if (!notification) {
          return reply.status(404).send({ error: 'Notification not found' });
        }

        if (notification.userId !== userId) {
          return reply.status(403).send({ error: 'Cannot delete others\' notifications' });
        }

        const success = deleteNotification(notificationId, userId);
        if (!success) {
          return reply.status(400).send({ error: 'Failed to delete notification' });
        }

        // Fire-and-forget audit log
        auditLog({
          userId,
          workspaceId: notification.workspaceId,
          action: 'notification_deleted',
          resourceType: 'notification',
          resourceId: String(notificationId),
          details: {},
        }).catch(() => {});

        return reply.status(204).send();
      }
    );
  };
}
