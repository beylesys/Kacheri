// src/hooks/useMessages.ts
// Hook for fetching and managing workspace messages (persistent chat).

import { useState, useEffect, useCallback } from 'react';
import { messagesApi, type Message, type ListMessagesOptions } from '../api/messages';

/**
 * Hook for managing workspace messages.
 *
 * @param workspaceId - The workspace ID
 * @param refreshKey - Increment to trigger a refetch (e.g., on WebSocket event)
 */
export function useMessages(workspaceId: string, refreshKey: number = 0) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Fetch messages on mount and when refreshKey changes
  useEffect(() => {
    if (!workspaceId) {
      setMessages([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    let cancelled = false;

    async function fetchMessages() {
      setLoading(true);
      setError(null);

      try {
        const options: ListMessagesOptions = {
          limit: 50,
        };
        const result = await messagesApi.list(workspaceId, options);
        if (!cancelled) {
          setMessages(result.messages);
          setHasMore(result.hasMore);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load messages');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshKey]);

  // Load older messages (pagination)
  const loadMore = useCallback(async () => {
    if (!workspaceId || loadingMore || !hasMore || messages.length === 0) {
      return;
    }

    setLoadingMore(true);

    try {
      // Get the oldest message ID as cursor
      const oldestId = messages[0]?.id;
      if (!oldestId) return;

      const options: ListMessagesOptions = {
        limit: 50,
        before: oldestId,
      };
      const result = await messagesApi.list(workspaceId, options);

      // Prepend older messages
      setMessages(prev => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
    } catch (err: any) {
      console.error('[useMessages] Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [workspaceId, loadingMore, hasMore, messages]);

  // Manual refetch (reloads latest messages)
  const refetch = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await messagesApi.list(workspaceId, { limit: 50 });
      setMessages(result.messages);
      setHasMore(result.hasMore);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Add a new message to the list (for optimistic update)
  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // Update a message in the list
  const updateMessage = useCallback((messageId: number, updates: Partial<Message>) => {
    setMessages(prev =>
      prev.map(m => (m.id === messageId ? { ...m, ...updates } : m))
    );
  }, []);

  // Remove a message from the list
  const removeMessage = useCallback((messageId: number) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  return {
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
  };
}
