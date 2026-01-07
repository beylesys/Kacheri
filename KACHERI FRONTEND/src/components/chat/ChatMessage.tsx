// src/components/chat/ChatMessage.tsx
// Individual message bubble component.

import React, { useMemo } from 'react';
import type { Message } from '../../api/messages';
import './chatWidget.css';

type Props = {
  message: Message;
  isOwn: boolean;
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  if (diff < oneDay && date.getDate() === now.getDate()) {
    // Same day: show time only
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diff < 7 * oneDay) {
    // Within a week: show day and time
    return date.toLocaleDateString([], { weekday: 'short' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    // Older: show date and time
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function getInitials(userId: string): string {
  // Extract initials from userId (e.g., "user_alice" -> "A")
  const name = userId.replace(/^user_/, '');
  return name.charAt(0).toUpperCase();
}

function getDisplayName(userId: string): string {
  // Convert userId to display name
  return userId.replace(/^user_/, '');
}

// Render message content with @mention highlighting
function renderContent(content: string): React.ReactNode {
  // Match @userId patterns (alphanumeric + underscore)
  const mentionPattern = /@(\w+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }

    // Add the highlighted mention
    const userId = match[1];
    parts.push(
      <span key={match.index} className="chat-mention-tag">
        @{userId}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last mention
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts.length > 0 ? parts : content;
}

export function ChatMessage({ message, isOwn }: Props) {
  const renderedContent = useMemo(
    () => renderContent(message.content),
    [message.content]
  );

  return (
    <div className={`chat-message ${isOwn ? 'chat-message-own' : 'chat-message-other'}`}>
      {!isOwn && (
        <div className="chat-message-avatar" title={getDisplayName(message.authorId)}>
          {getInitials(message.authorId)}
        </div>
      )}
      <div className="chat-message-content">
        {!isOwn && (
          <div className="chat-message-author">
            {getDisplayName(message.authorId)}
          </div>
        )}
        <div className="chat-message-bubble">
          <div className="chat-message-text">{renderedContent}</div>
          <div className="chat-message-meta">
            <span className="chat-message-time">{formatTime(message.createdAt)}</span>
            {message.editedAt && (
              <span className="chat-message-edited">(edited)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
