// src/hooks/useNotifications.ts
// Hook for fetching and managing user notifications.

import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsApi, type Notification } from '../api/notifications';

interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  removeNotification: (id: number) => void;
  addNotification: (notification: Notification) => void;
  incrementUnread: () => void;
}

export function useNotifications(
  workspaceId?: string,
  refreshKey: number = 0
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadedRef = useRef(false);

  // Initial load
  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await notificationsApi.list({
        limit: 20,
        workspaceId,
      });
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
      setHasMore(response.hasMore);
      loadedRef.current = true;
    } catch (err) {
      console.error('[useNotifications] Load failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || notifications.length === 0) return;

    setLoadingMore(true);
    try {
      const lastId = notifications[notifications.length - 1].id;
      const response = await notificationsApi.list({
        limit: 20,
        before: lastId,
        workspaceId,
      });
      setNotifications(prev => [...prev, ...response.notifications]);
      setHasMore(response.hasMore);
    } catch (err) {
      console.error('[useNotifications] Load more failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, notifications, workspaceId]);

  // Refetch
  const refetch = useCallback(async () => {
    await loadInitial();
  }, [loadInitial]);

  // Mark a notification as read
  const markRead = useCallback(async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('[useNotifications] Mark read failed:', err);
      throw err;
    }
  }, []);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    try {
      const response = await notificationsApi.markAllAsRead(workspaceId);
      setNotifications(prev =>
        prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('[useNotifications] Mark all read failed:', err);
      throw err;
    }
  }, [workspaceId]);

  // Remove a notification locally (after delete or when dismissed)
  const removeNotification = useCallback((id: number) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id);
      if (notification && !notification.readAt) {
        setUnreadCount(c => Math.max(0, c - 1));
      }
      return prev.filter(n => n.id !== id);
    });
  }, []);

  // Add a notification locally (from WebSocket)
  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => {
      // Don't add duplicates
      if (prev.some(n => n.id === notification.id)) {
        return prev;
      }
      return [notification, ...prev];
    });
    if (!notification.readAt) {
      setUnreadCount(c => c + 1);
    }
  }, []);

  // Increment unread count (for WS events before full notification is fetched)
  const incrementUnread = useCallback(() => {
    setUnreadCount(c => c + 1);
  }, []);

  // Load on mount and when dependencies change
  useEffect(() => {
    loadInitial();
  }, [loadInitial, refreshKey]);

  return {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
    markRead,
    markAllRead,
    removeNotification,
    addNotification,
    incrementUnread,
  };
}
