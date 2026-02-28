// src/hooks/useComments.ts
// Hook for fetching and managing document comments with threading support.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { commentsApi, type Comment, type ListCommentsOptions } from '../api/comments';

export type CommentThread = {
  threadId: string;
  rootComment: Comment;
  replies: Comment[];
  isResolved: boolean;
};

export type FilterTab = 'all' | 'open' | 'resolved';

// Server-side filters passed to the API (reduce data set before client-side tab filtering)
export type ServerFilters = {
  authorId?: string;
  search?: string;
};

/**
 * Hook for managing document comments.
 *
 * @param docId - The document ID
 * @param refreshKey - Increment to trigger a refetch (e.g., on WebSocket event)
 * @param serverFilters - Optional server-side filters (authorId, search)
 */
export function useComments(docId: string, refreshKey: number = 0, serverFilters?: ServerFilters) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch comments on mount and when refreshKey changes
  useEffect(() => {
    if (!docId) {
      setComments([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchComments() {
      setLoading(true);
      setError(null);

      try {
        const options: ListCommentsOptions = {
          includeResolved: true, // Always fetch all resolution states, filter in UI
          authorId: serverFilters?.authorId || undefined,
          search: serverFilters?.search || undefined,
        };
        const result = await commentsApi.list(docId, options);
        if (!cancelled) {
          setComments(result.comments);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load comments');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchComments();

    return () => {
      cancelled = true;
    };
  }, [docId, refreshKey, serverFilters?.authorId, serverFilters?.search]);

  // Group comments by threadId
  const threads = useMemo((): CommentThread[] => {
    const threadMap = new Map<string, { root: Comment | null; replies: Comment[] }>();

    for (const comment of comments) {
      const tid = comment.threadId;
      if (!tid) continue; // Skip orphaned comments

      if (!threadMap.has(tid)) {
        threadMap.set(tid, { root: null, replies: [] });
      }

      const entry = threadMap.get(tid)!;
      if (comment.parentId === null) {
        entry.root = comment;
      } else {
        entry.replies.push(comment);
      }
    }

    // Build thread objects
    const result: CommentThread[] = [];
    for (const [threadId, { root, replies }] of threadMap) {
      if (!root) continue; // Skip threads without root comment

      // Sort replies by creation date (oldest first)
      replies.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      result.push({
        threadId,
        rootComment: root,
        replies,
        isResolved: root.resolvedAt !== null,
      });
    }

    // Sort threads by root comment creation date (newest first)
    result.sort((a, b) =>
      new Date(b.rootComment.createdAt).getTime() - new Date(a.rootComment.createdAt).getTime()
    );

    return result;
  }, [comments]);

  // Filter threads by tab
  const filterThreads = useCallback((filter: FilterTab): CommentThread[] => {
    switch (filter) {
      case 'open':
        return threads.filter(t => !t.isResolved);
      case 'resolved':
        return threads.filter(t => t.isResolved);
      case 'all':
      default:
        return threads;
    }
  }, [threads]);

  // Manual refetch
  const refetch = useCallback(async () => {
    if (!docId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await commentsApi.list(docId, {
        includeResolved: true,
        authorId: serverFilters?.authorId || undefined,
        search: serverFilters?.search || undefined,
      });
      setComments(result.comments);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [docId, serverFilters?.authorId, serverFilters?.search]);

  // Stats
  const stats = useMemo(() => {
    const total = threads.length;
    const open = threads.filter(t => !t.isResolved).length;
    const resolved = threads.filter(t => t.isResolved).length;
    return { total, open, resolved };
  }, [threads]);

  return {
    comments,
    threads,
    loading,
    error,
    refetch,
    filterThreads,
    stats,
  };
}
