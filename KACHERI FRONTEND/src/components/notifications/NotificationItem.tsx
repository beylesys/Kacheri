// src/components/notifications/NotificationItem.tsx
// Individual notification row component.

import React from 'react';
import type { Notification, NotificationType } from '../../api/notifications';

type Props = {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onDelete: (id: number) => void;
  onClick: (notification: Notification) => void;
};

const TYPE_ICONS: Record<NotificationType, string> = {
  mention: '@',
  comment_reply: '↩',
  doc_shared: '📄',
  suggestion_pending: '✎',
};

const TYPE_COLORS: Record<NotificationType, string> = {
  mention: '#3b82f6',
  comment_reply: '#8b5cf6',
  doc_shared: '#10b981',
  suggestion_pending: '#f59e0b',
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function NotificationItem({ notification, onMarkRead, onDelete, onClick }: Props) {
  const isUnread = !notification.readAt;

  const handleClick = () => {
    if (isUnread) {
      onMarkRead(notification.id);
    }
    onClick(notification);
  };

  return (
    <div
      className={`notification-item ${isUnread ? 'notification-item-unread' : ''}`}
      onClick={handleClick}
    >
      <div
        className="notification-item-icon"
        style={{ backgroundColor: `${TYPE_COLORS[notification.type]}20`, color: TYPE_COLORS[notification.type] }}
      >
        {TYPE_ICONS[notification.type]}
      </div>
      <div className="notification-item-content">
        <div className="notification-item-title">
          {notification.title}
        </div>
        {notification.body && (
          <div className="notification-item-body">
            {notification.body}
          </div>
        )}
        <div className="notification-item-time">
          {formatTime(notification.createdAt)}
        </div>
      </div>
      <div className="notification-item-actions">
        {isUnread && (
          <button
            className="notification-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification.id);
            }}
            title="Mark as read"
          >
            ✓
          </button>
        )}
        <button
          className="notification-action-btn notification-action-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}
