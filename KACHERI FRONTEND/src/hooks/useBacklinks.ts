// KACHERI FRONTEND/src/hooks/useBacklinks.ts
// Hook for fetching documents that link TO the current document.

import { useState, useEffect, useCallback } from 'react';
import { docLinksApi, type DocLink } from '../api/docLinks';

/**
 * Hook for fetching backlinks (documents that link to this document).
 *
 * @param docId - The document ID to get backlinks for
 * @param refreshKey - Increment to trigger a refetch (e.g., on WebSocket event)
 */
export function useBacklinks(docId: string, refreshKey: number = 0) {
  const [backlinks, setBacklinks] = useState<DocLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch backlinks on mount and when refreshKey changes
  useEffect(() => {
    if (!docId) {
      setBacklinks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchBacklinks() {
      setLoading(true);
      setError(null);

      try {
        const result = await docLinksApi.listBacklinks(docId);
        if (!cancelled) {
          setBacklinks(result.backlinks || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load backlinks');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchBacklinks();

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
      const result = await docLinksApi.listBacklinks(docId);
      setBacklinks(result.backlinks || []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load backlinks');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  return {
    backlinks,
    count: backlinks.length,
    loading,
    error,
    refetch,
  };
}
