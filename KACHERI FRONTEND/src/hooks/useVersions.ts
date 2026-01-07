// src/hooks/useVersions.ts
// Hook for fetching and managing document versions.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { versionsApi, type DocVersionMeta } from '../api/versions';

export type VersionFilter = 'all' | 'named' | 'unnamed';

/**
 * Hook for managing document versions.
 *
 * @param docId - The document ID
 * @param refreshKey - Increment to trigger a refetch (e.g., on WebSocket event)
 */
export function useVersions(docId: string, refreshKey: number = 0) {
  const [versions, setVersions] = useState<DocVersionMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch versions on mount and when refreshKey changes
  useEffect(() => {
    if (!docId) {
      setVersions([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchVersions() {
      setLoading(true);
      setError(null);

      try {
        const result = await versionsApi.list(docId);
        if (!cancelled) {
          setVersions(result.versions);
          setTotal(result.total);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load versions');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchVersions();

    return () => {
      cancelled = true;
    };
  }, [docId, refreshKey]);

  // Filter versions by tab
  const filterVersions = useCallback(
    (filter: VersionFilter): DocVersionMeta[] => {
      switch (filter) {
        case 'named':
          return versions.filter((v) => v.name !== null && v.name.trim() !== '');
        case 'unnamed':
          return versions.filter((v) => v.name === null || v.name.trim() === '');
        case 'all':
        default:
          return versions;
      }
    },
    [versions]
  );

  // Manual refetch
  const refetch = useCallback(async () => {
    if (!docId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await versionsApi.list(docId);
      setVersions(result.versions);
      setTotal(result.total);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  // Stats
  const stats = useMemo(() => {
    const named = versions.filter((v) => v.name !== null && v.name.trim() !== '').length;
    const unnamed = versions.filter((v) => v.name === null || v.name.trim() === '').length;
    return { total: versions.length, named, unnamed };
  }, [versions]);

  // Get latest version (highest version number)
  const latestVersion = useMemo(() => {
    if (versions.length === 0) return null;
    return versions.reduce((a, b) => (a.versionNumber > b.versionNumber ? a : b));
  }, [versions]);

  return {
    versions,
    total,
    loading,
    error,
    refetch,
    filterVersions,
    stats,
    latestVersion,
  };
}
