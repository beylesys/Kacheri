// src/components/notifications/NotificationBell.tsx
// Bell icon button with unread badge.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NotificationPanel } from './NotificationPanel';
import { useNotifications } from '../../hooks/useNotifications';
import { useWorkspaceSocket, type WsEvent } from '../../hooks/useWorkspaceSocket';
import { notificationsApi, type Notification } from '../../api/notifications';
import { useNavigate } from 'react-router-dom';
import './notifications.css';

type Props = {
  workspaceId: string;
  currentUserId: string;
};

export function NotificationBell({ workspaceId, currentUserId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const {
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
    incrementUnread,
  } = useNotifications(workspaceId, refreshKey);

  // Subscribe to WebSocket events for real-time updates
  const { events } = useWorkspaceSocket(workspaceId, { userId: currentUserId });
  const lastEventRef = useRef<number>(0);

  // Handle incoming WebSocket notification events
  useEffect(() => {
    if (events.length === 0) return;

    const latestEvent = events[0];
    if (latestEvent.type !== 'notification') return;

    // Skip if we've already processed this event
    if (latestEvent.ts <= lastEventRef.current) return;
    lastEventRef.current = latestEvent.ts;

    // Only handle notifications for the current user
    if (latestEvent.userId !== currentUserId) return;

    // Increment unread count and optionally refetch
    incrementUnread();

    // If panel is open, refetch to show the new notification
    if (isOpen) {
      refetch();
    }
  }, [events, currentUserId, incrementUnread, isOpen, refetch]);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleMarkRead = useCallback(async (id: number) => {
    try {
      await markRead(id);
    } catch (err) {
      console.error('[NotificationBell] Mark read failed:', err);
    }
  }, [markRead]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllRead();
    } catch (err) {
      console.error('[NotificationBell] Mark all read failed:', err);
    }
  }, [markAllRead]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await notificationsApi.delete(id);
      removeNotification(id);
    } catch (err) {
      console.error('[NotificationBell] Delete failed:', err);
    }
  }, [removeNotification]);

  const handleClick = useCallback((notification: Notification) => {
    // Navigate based on link type
    if (notification.linkType === 'doc' && notification.linkId) {
      navigate(`/doc/${notification.linkId}`);
      setIsOpen(false);
    } else if (notification.linkType === 'comment' && notification.linkId) {
      // For comments, we'd need to know the docId - for now just close
      setIsOpen(false);
    }
  }, [navigate]);

  return (
    <div className="notification-bell-container" ref={panelRef}>
      <button
        className="notification-bell-btn"
        onClick={handleToggle}
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-bell-badge" aria-live="polite">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationPanel
          notifications={notifications}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onDelete={handleDelete}
          onClick={handleClick}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
