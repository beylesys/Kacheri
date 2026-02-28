// src/hooks/useSuggestions.ts
// Hook for fetching and managing document suggestions.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { suggestionsApi, type Suggestion, type ChangeType } from '../api/suggestions';

export type SuggestionFilterTab = 'all' | 'pending' | 'accepted' | 'rejected';

/** Server-side filters sent as query params to the API. */
export type SuggestionServerFilters = {
  changeType?: ChangeType;
};

/**
 * Hook for managing document suggestions.
 *
 * @param docId - The document ID
 * @param refreshKey - Increment to trigger a refetch (e.g., on WebSocket event)
 * @param serverFilters - Optional server-side filters (changeType, etc.)
 */
export function useSuggestions(
  docId: string,
  refreshKey: number = 0,
  serverFilters?: SuggestionServerFilters,
) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable serialization of serverFilters for dependency tracking
  const filterKey = serverFilters?.changeType ?? '';

  // Fetch suggestions on mount and when refreshKey or filters change
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
        const result = await suggestionsApi.list(docId, serverFilters);
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
  }, [docId, refreshKey, filterKey]);

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
      const result = await suggestionsApi.list(docId, serverFilters);
      setSuggestions(result.suggestions);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [docId, filterKey]);

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
