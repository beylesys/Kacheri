// src/components/chat/ChatPanel.tsx
// Main chat panel with message list and input.

import React, { useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput, type ChatMember } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import type { Message } from '../../api/messages';
import type { TypingUser } from '../../hooks/useWorkspaceSocket';
import './chatWidget.css';

type Props = {
  messages: Message[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onSend: (content: string, mentions: string[], replyToId?: number) => Promise<void>;
  onClose: () => void;
  onRefresh: () => void;
  currentUserId: string;
  workspaceMembers?: ChatMember[];
  typingUsers?: TypingUser[];
  onTypingChange?: (isTyping: boolean) => void;
};

export function ChatPanel({
  messages,
  loading,
  loadingMore,
  error,
  hasMore,
  onLoadMore,
  onSend,
  onClose,
  onRefresh,
  currentUserId,
  workspaceMembers = [],
  typingUsers = [],
  onTypingChange,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Handle scroll for infinite load
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Load more when scrolled to top
    if (el.scrollTop === 0 && hasMore && !loadingMore) {
      onLoadMore();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span className="chat-panel-title">Workspace Chat</span>
        <div className="chat-panel-actions">
          <button
            className="chat-panel-refresh"
            onClick={onRefresh}
            title="Refresh messages"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            className="chat-panel-close"
            onClick={onClose}
            title="Close chat"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="chat-panel-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {loadingMore && (
          <div className="chat-loading-more">Loading older messages...</div>
        )}

        {hasMore && !loadingMore && (
          <button className="chat-load-more" onClick={onLoadMore}>
            Load older messages
          </button>
        )}

        {loading && messages.length === 0 && (
          <div className="chat-loading">Loading messages...</div>
        )}

        {error && <div className="chat-error">{error}</div>}

        {!loading && !error && messages.length === 0 && (
          <div className="chat-empty">
            No messages yet. Start the conversation!
          </div>
        )}

        {messages.map(message => (
          <ChatMessage
            key={message.id}
            message={message}
            isOwn={message.authorId === currentUserId}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <TypingIndicator typingUsers={typingUsers} />
      <ChatInput onSend={onSend} workspaceMembers={workspaceMembers} onTypingChange={onTypingChange} />
    </div>
  );
}
