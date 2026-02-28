// KACHERI BACKEND/src/store/notifications.ts
// User notification store with CRUD operations.

import { db } from '../db';
import { getJobQueue } from '../jobs/queue';
import type { NotificationDeliverPayload } from '../jobs/types';

// ============================================
// Types
// ============================================

export type NotificationType = 'mention' | 'comment_reply' | 'doc_shared' | 'suggestion_pending' | 'reminder' | 'review_assigned' | 'canvas_shared' | 'ai_generation_complete' | 'export_complete' | 'frame_lock_requested'
  // S14 — Cross-Product Notification Bridge
  | 'cross_product:entity_update' | 'cross_product:entity_conflict' | 'cross_product:new_connection';
export type LinkType = 'doc' | 'comment' | 'message' | 'canvas' | 'entity' | null;

export interface Notification {
  id: number;
  userId: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkType: LinkType;
  linkId: string | null;
  actorId: string | null;
  readAt: number | null;
  createdAt: number;
  deletedAt: number | null;
}

// API-friendly version with ISO dates
export interface NotificationMeta {
  id: number;
  userId: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkType: LinkType;
  linkId: string | null;
  actorId: string | null;
  readAt: string | null;
  createdAt: string;
}

// Internal row type from SQLite
interface NotificationRow {
  id: number;
  user_id: string;
  workspace_id: string;
  type: string;
  title: string;
  body: string | null;
  link_type: string | null;
  link_id: string | null;
  actor_id: string | null;
  read_at: number | null;
  created_at: number;
  deleted_at: number | null;
}

// Create notification params
export interface CreateNotificationParams {
  userId: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  linkType?: LinkType;
  linkId?: string | null;
  actorId?: string | null;
}

// List notifications options
export interface ListNotificationsOptions {
  limit?: number;      // Default 50, max 100
  before?: number;     // Cursor (notification ID) for pagination
  unreadOnly?: boolean;
  workspaceId?: string;
}

// ============================================
// Row Conversion
// ============================================

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    linkType: row.link_type as LinkType,
    linkId: row.link_id,
    actorId: row.actor_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function rowToNotificationMeta(row: NotificationRow): NotificationMeta {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    linkType: row.link_type as LinkType,
    linkId: row.link_id,
    actorId: row.actor_id,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new notification.
 */
export async function createNotification(params: CreateNotificationParams): Promise<NotificationMeta | null> {
  const {
    userId,
    workspaceId,
    type,
    title,
    body = null,
    linkType = null,
    linkId = null,
    actorId = null,
  } = params;

  const now = Date.now();

  try {
    const result = await db.run(`
      INSERT INTO notifications (
        user_id, workspace_id, type, title, body,
        link_type, link_id, actor_id,
        read_at, created_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)
      RETURNING id
    `, [userId, workspaceId, type, title, body, linkType, linkId, actorId, now]);

    const notificationId = result.lastInsertRowid as number;
    return await getNotification(notificationId);
  } catch (err) {
    console.error('[notifications] Failed to create notification:', err);
    return null;
  }
}

/**
 * Get a single notification by ID.
 */
export async function getNotification(id: number): Promise<NotificationMeta | null> {
  try {
    const row = await db.queryOne<NotificationRow>(`
      SELECT id, user_id, workspace_id, type, title, body,
             link_type, link_id, actor_id,
             read_at, created_at, deleted_at
      FROM notifications
      WHERE id = ? AND deleted_at IS NULL
    `, [id]);

    return row ? rowToNotificationMeta(row) : null;
  } catch (err) {
    console.error('[notifications] Failed to get notification:', err);
    return null;
  }
}

/**
 * List notifications for a user with pagination.
 * Returns notifications in reverse chronological order (newest first).
 */
export async function listNotifications(
  userId: string,
  options: ListNotificationsOptions = {}
): Promise<{ notifications: NotificationMeta[]; hasMore: boolean }> {
  const {
    limit = 50,
    before,
    unreadOnly = false,
    workspaceId,
  } = options;

  // Clamp limit to max 100
  const effectiveLimit = Math.min(Math.max(1, limit), 100);

  let query = `
    SELECT id, user_id, workspace_id, type, title, body,
           link_type, link_id, actor_id,
           read_at, created_at, deleted_at
    FROM notifications
    WHERE user_id = ? AND deleted_at IS NULL
  `;

  const params: (string | number)[] = [userId];

  if (before !== undefined) {
    query += ` AND id < ?`;
    params.push(before);
  }

  if (unreadOnly) {
    query += ` AND read_at IS NULL`;
  }

  if (workspaceId) {
    query += ` AND workspace_id = ?`;
    params.push(workspaceId);
  }

  query += ` ORDER BY id DESC LIMIT ?`;
  params.push(effectiveLimit + 1); // Fetch one extra to check hasMore

  try {
    const rows = await db.queryAll<NotificationRow>(query, params);

    const hasMore = rows.length > effectiveLimit;
    const resultRows = hasMore ? rows.slice(0, effectiveLimit) : rows;

    const notifications = resultRows.map(rowToNotificationMeta);

    return { notifications, hasMore };
  } catch (err) {
    console.error('[notifications] Failed to list notifications:', err);
    return { notifications: [], hasMore: false };
  }
}

/**
 * Mark a notification as read.
 * Only the owner can mark their own notification.
 */
export async function markAsRead(id: number, userId: string): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE notifications
      SET read_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND read_at IS NULL
    `, [now, id, userId]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[notifications] Failed to mark as read:', err);
    return false;
  }
}

/**
 * Mark all notifications as read for a user.
 * Optionally filter by workspace.
 */
export async function markAllAsRead(userId: string, workspaceId?: string): Promise<number> {
  const now = Date.now();

  try {
    let query = `
      UPDATE notifications
      SET read_at = ?
      WHERE user_id = ? AND deleted_at IS NULL AND read_at IS NULL
    `;
    const params: (string | number)[] = [now, userId];

    if (workspaceId) {
      query += ` AND workspace_id = ?`;
      params.push(workspaceId);
    }

    const info = await db.run(query, params);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[notifications] Failed to mark all as read:', err);
    return 0;
  }
}

/**
 * Get unread notification count for a user.
 * Optionally filter by workspace.
 */
export async function getUnreadCount(userId: string, workspaceId?: string): Promise<number> {
  try {
    let query = `
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = ? AND deleted_at IS NULL AND read_at IS NULL
    `;
    const params: string[] = [userId];

    if (workspaceId) {
      query += ` AND workspace_id = ?`;
      params.push(workspaceId);
    }

    const row = await db.queryOne<{ count: number }>(query, params);

    return row?.count ?? 0;
  } catch (err) {
    console.error('[notifications] Failed to get unread count:', err);
    return 0;
  }
}

/**
 * Soft delete a notification.
 * Only the owner can delete their own notification.
 */
export async function deleteNotification(id: number, userId: string): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE notifications
      SET deleted_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `, [now, id, userId]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[notifications] Failed to delete notification:', err);
    return false;
  }
}

/**
 * Delete all notifications for a workspace (permanent).
 * Used when a workspace is deleted.
 */
export async function deleteAllWorkspaceNotifications(workspaceId: string): Promise<number> {
  try {
    const info = await db.run(`
      DELETE FROM notifications
      WHERE workspace_id = ?
    `, [workspaceId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[notifications] Failed to delete all workspace notifications:', err);
    return 0;
  }
}

/**
 * Create a notification AND enqueue a delivery job for external channels.
 * Wraps createNotification() with automatic job queue dispatch.
 * Callers should use this when external delivery (webhook, Slack) is desired.
 */
export async function createAndDeliverNotification(
  params: CreateNotificationParams
): Promise<NotificationMeta | null> {
  const notification = await createNotification(params);
  if (!notification) return null;

  // Enqueue delivery job for external channels
  try {
    const queue = getJobQueue();
    const payload: NotificationDeliverPayload = {
      notificationId: notification.id,
      userId: params.userId,
      workspaceId: params.workspaceId,
      notificationType: params.type,
      title: params.title,
      body: params.body ?? null,
      linkType: params.linkType ?? null,
      linkId: params.linkId ?? null,
      actorId: params.actorId ?? null,
    };

    queue.add('notification:deliver' as any, payload, params.userId, undefined, {
      maxAttempts: 3,
    });
  } catch (err) {
    // Non-fatal: in-app notification already created, external delivery failed to enqueue
    console.warn('[notifications] Failed to enqueue delivery job:', err);
  }

  return notification;
}
