// src/components/notifications/NotificationPanel.tsx
// Dropdown panel displaying notification list.

import React from 'react';
import { NotificationItem } from './NotificationItem';
import type { Notification } from '../../api/notifications';
import './notifications.css';

type Props = {
  notifications: Notification[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onDelete: (id: number) => void;
  onClick: (notification: Notification) => void;
  onClose: () => void;
};

export function NotificationPanel({
  notifications,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onClick,
  onClose,
}: Props) {
  return (
    <div className="notification-panel">
      <div className="notification-panel-header">
        <span className="notification-panel-title">Notifications</span>
        <div className="notification-panel-actions">
          {notifications.some(n => !n.readAt) && (
            <button
              className="notification-mark-all-btn"
              onClick={onMarkAllRead}
              title="Mark all as read"
            >
              ✓ All
            </button>
          )}
          <button
            className="notification-close-btn"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="notification-panel-list">
        {loading && (
          <div className="notification-loading">Loading notifications...</div>
        )}

        {error && (
          <div className="notification-error">{error}</div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="notification-empty">No notifications yet</div>
        )}

        {!loading && notifications.map(notification => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkRead={onMarkRead}
            onDelete={onDelete}
            onClick={onClick}
          />
        ))}

        {loadingMore && (
          <div className="notification-loading-more">Loading more...</div>
        )}

        {!loading && !loadingMore && hasMore && (
          <button
            className="notification-load-more-btn"
            onClick={onLoadMore}
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
