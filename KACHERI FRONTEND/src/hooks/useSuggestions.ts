// src/hooks/useSuggestions.ts
// Hook for fetching and managing document suggestions.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { suggestionsApi, type Suggestion } from '../api/suggestions';

export type SuggestionFilterTab = 'all' | 'pending' | 'accepted' | 'rejected';

/**
 * Hook for managing document suggestions.
 *
 * @param docId - The document ID
 * @param refreshKey - Increment to trigger a refetch (e.g., on WebSocket event)
 */
export function useSuggestions(docId: string, refreshKey: number = 0) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch suggestions on mount and when refreshKey changes
  useEffect(() => {
    if (!docId) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSuggestions() {
      setLoading(true);
      setError(null);

      try {
        const result = await suggestionsApi.list(docId);
        if (!cancelled) {
          setSuggestions(result.suggestions);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load suggestions');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [docId, refreshKey]);

  // Filter suggestions by status tab
  const filterSuggestions = useCallback((filter: SuggestionFilterTab): Suggestion[] => {
    switch (filter) {
      case 'pending':
        return suggestions.filter(s => s.status === 'pending');
      case 'accepted':
        return suggestions.filter(s => s.status === 'accepted');
      case 'rejected':
        return suggestions.filter(s => s.status === 'rejected');
      case 'all':
      default:
        return suggestions;
    }
  }, [suggestions]);

  // Manual refetch
  const refetch = useCallback(async () => {
    if (!docId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await suggestionsApi.list(docId);
      setSuggestions(result.suggestions);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  // Stats
  const stats = useMemo(() => {
    const total = suggestions.length;
    const pending = suggestions.filter(s => s.status === 'pending').length;
    const accepted = suggestions.filter(s => s.status === 'accepted').length;
    const rejected = suggestions.filter(s => s.status === 'rejected').length;
    return { total, pending, accepted, rejected };
  }, [suggestions]);

  // Sort suggestions by creation date (newest first)
  const sortedSuggestions = useMemo(() => {
    return [...suggestions].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [suggestions]);

  return {
    suggestions: sortedSuggestions,
    loading,
    error,
    refetch,
    filterSuggestions,
    stats,
  };
}
