// src/components/chat/ChatWidget.tsx
// Floating chat widget that appears on all pages.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChatPanel } from './ChatPanel';
import { useMessages } from '../../hooks/useMessages';
import { useWorkspaceSocket } from '../../hooks/useWorkspaceSocket';
import { messagesApi, type Message } from '../../api/messages';
import { workspaceApi } from '../../workspace/api';
import type { WorkspaceMember } from '../../workspace/types';
import type { ChatMember } from './ChatInput';
import './chatWidget.css';

type Props = {
  workspaceId: string;
  currentUserId: string;
  refreshKey?: number;
};

const STORAGE_KEY = 'chatWidgetOpen';

export function ChatWidget({ workspaceId, currentUserId, refreshKey = 0 }: Props) {
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Workspace members for @mention autocomplete
  const [members, setMembers] = useState<ChatMember[]>([]);

  const {
    messages,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
    addMessage,
    updateMessage,
    removeMessage,
  } = useMessages(workspaceId, refreshKey);

  // Fetch workspace members when widget is opened
  useEffect(() => {
    if (!isOpen || !workspaceId) return;

    workspaceApi.listMembers(workspaceId)
      .then((memberList: WorkspaceMember[]) => {
        setMembers(memberList.map(m => ({
          userId: m.userId,
          displayName: m.userId, // Could be enhanced with real display names
        })));
      })
      .catch(() => {
        // Silent fail, @mentions will just be unavailable
      });
  }, [isOpen, workspaceId]);

  // Subscribe to WebSocket events for real-time updates
  const { events, typingUsers, sendTyping } = useWorkspaceSocket(workspaceId, { userId: currentUserId });
  const lastEventRef = useRef<number>(0);

  // Handle incoming WebSocket message events
  useEffect(() => {
    if (events.length === 0) return;

    const latestEvent = events[0];
    if (latestEvent.type !== 'message') return;

    // Skip if we've already processed this event (based on timestamp)
    if (latestEvent.ts <= lastEventRef.current) return;
    lastEventRef.current = latestEvent.ts;

    // Handle message events
    if (latestEvent.action === 'created') {
      // Fetch the full message details since WS only has partial data
      messagesApi.list(workspaceId, { limit: 1 }).then(({ messages: newMessages }) => {
        if (newMessages.length > 0) {
          const newMsg = newMessages[newMessages.length - 1];
          // Only add if it's not from the current user (we already added it optimistically)
          if (newMsg.authorId !== currentUserId) {
            addMessage(newMsg);
          }
        }
      }).catch(() => {
        // Silent fail, user can refresh manually
      });
    } else if (latestEvent.action === 'updated' && latestEvent.content) {
      updateMessage(latestEvent.messageId, latestEvent.content);
    } else if (latestEvent.action === 'deleted') {
      removeMessage(latestEvent.messageId);
    }
  }, [events, workspaceId, currentUserId, addMessage, updateMessage, removeMessage]);

  // Persist open state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isOpen));
    } catch {}
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSend = useCallback(async (content: string, mentions: string[], replyToId?: number) => {
    try {
      const message = await messagesApi.create(workspaceId, {
        content,
        replyToId,
        mentions: mentions.length > 0 ? mentions : undefined,
      });
      addMessage(message);
    } catch (err) {
      console.error('[ChatWidget] Failed to send message:', err);
      throw err;
    }
  }, [workspaceId, addMessage]);

  const handleTypingChange = useCallback((isTyping: boolean) => {
    sendTyping(isTyping);
  }, [sendTyping]);

  // Don't render if no workspace
  if (!workspaceId) {
    return null;
  }

  return (
    <div className="chat-widget">
      {isOpen ? (
        <ChatPanel
          messages={messages}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onSend={handleSend}
          onClose={handleClose}
          onRefresh={refetch}
          currentUserId={currentUserId}
          workspaceMembers={members}
          typingUsers={typingUsers}
          onTypingChange={handleTypingChange}
        />
      ) : (
        <button
          className="chat-widget-toggle"
          onClick={handleToggle}
          title="Open workspace chat"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  );
}
