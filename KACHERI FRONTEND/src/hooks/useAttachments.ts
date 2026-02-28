// src/hooks/useAttachments.ts
// Hook for fetching and managing document attachments.

import { useState, useEffect, useCallback } from 'react';
import {
  attachmentsApi,
  type DocAttachment,
  type AttachmentLimits,
} from '../api/attachments';

const DEFAULT_LIMITS: AttachmentLimits = { maxCount: 20, maxTotalBytes: 104857600 };

/**
 * Hook for managing document attachments.
 *
 * @param docId - The document ID
 * @param refreshKey - Increment to trigger a refetch (e.g., on WebSocket event)
 */
export function useAttachments(docId: string, refreshKey: number = 0) {
  const [attachments, setAttachments] = useState<DocAttachment[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [count, setCount] = useState(0);
  const [limits, setLimits] = useState<AttachmentLimits>(DEFAULT_LIMITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch attachments on mount and when refreshKey changes
  useEffect(() => {
    if (!docId) {
      setAttachments([]);
      setTotalSize(0);
      setCount(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAttachments() {
      setLoading(true);
      setError(null);

      try {
        const result = await attachmentsApi.list(docId);
        if (!cancelled) {
          setAttachments(result.attachments);
          setTotalSize(result.totalSize);
          setCount(result.count);
          setLimits(result.limits);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load attachments');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAttachments();

    return () => {
      cancelled = true;
    };
  }, [docId, refreshKey]);

  // Manual refetch
  const refetch = useCallback(async () => {
    if (!docId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await attachmentsApi.list(docId);
      setAttachments(result.attachments);
      setTotalSize(result.totalSize);
      setCount(result.count);
      setLimits(result.limits);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  return {
    attachments,
    totalSize,
    count,
    limits,
    loading,
    error,
    refetch,
  };
}
