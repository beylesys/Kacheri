// src/api/notifications.ts
// Notifications API client

function authHeader(): Record<string, string> {
  try {
    const token =
      typeof localStorage !== 'undefined' && localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function devUserHeader(): Record<string, string> {
  try {
    const u =
      (typeof localStorage !== 'undefined' && localStorage.getItem('devUser')) ||
      '';
    return u ? { 'X-Dev-User': u } : {};
  } catch {
    return {};
  }
}

export type NotificationType = 'mention' | 'comment_reply' | 'doc_shared' | 'suggestion_pending';
export type LinkType = 'doc' | 'comment' | 'message' | null;

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
  readAt: string | null;
  createdAt: string;
}

export interface ListNotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
}

export interface ListNotificationsOptions {
  limit?: number;
  before?: number;
  unreadOnly?: boolean;
  workspaceId?: string;
}

async function headers(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    ...authHeader(),
    ...devUserHeader(),
  };
}

/**
 * List notifications for the current user
 */
async function list(options: ListNotificationsOptions = {}): Promise<ListNotificationsResponse> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.before) params.set('before', String(options.before));
  if (options.unreadOnly) params.set('unreadOnly', 'true');
  if (options.workspaceId) params.set('workspaceId', options.workspaceId);

  const qs = params.toString();
  const url = qs ? `/notifications?${qs}` : '/notifications';

  const res = await fetch(url, { headers: await headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to list notifications');
  }
  return res.json();
}

/**
 * Get unread notification count
 */
async function getUnreadCount(workspaceId?: string): Promise<{ unreadCount: number }> {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspaceId', workspaceId);

  const qs = params.toString();
  const url = qs ? `/notifications/count?${qs}` : '/notifications/count';

  const res = await fetch(url, { headers: await headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get unread count');
  }
  return res.json();
}

/**
 * Mark a notification as read
 */
async function markAsRead(notificationId: number): Promise<void> {
  const res = await fetch(`/notifications/${notificationId}/read`, {
    method: 'POST',
    headers: await headers(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to mark notification as read');
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(workspaceId?: string): Promise<{ count: number }> {
  const res = await fetch('/notifications/read-all', {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to mark all notifications as read');
  }
  return res.json();
}

/**
 * Delete a notification
 */
async function deleteNotification(notificationId: number): Promise<void> {
  const res = await fetch(`/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: await headers(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete notification');
  }
}

export const notificationsApi = {
  list,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  delete: deleteNotification,
};
