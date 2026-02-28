// KACHERI FRONTEND/src/hooks/useReviewers.ts
// Data-fetching hook for document reviewer assignments.
// Slice 12 — Phase 2 Sprint 4

import { useCallback, useEffect, useState } from 'react';
import { reviewersApi, type DocReviewer } from '../api/reviewers';

export function useReviewers(docId: string, refreshKey: number = 0) {
  const [reviewers, setReviewers] = useState<DocReviewer[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviewers = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await reviewersApi.list(docId);
      setReviewers(res.reviewers);
      setCount(res.count);
    } catch (err: any) {
      setError(err?.message || 'Failed to load reviewers');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!docId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await reviewersApi.list(docId);
        if (!cancelled) {
          setReviewers(res.reviewers);
          setCount(res.count);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load reviewers');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [docId, refreshKey]);

  const refetch = fetchReviewers;

  const stats = {
    total: reviewers.length,
    pending: reviewers.filter(r => r.status === 'pending').length,
    inReview: reviewers.filter(r => r.status === 'in_review').length,
    completed: reviewers.filter(r => r.status === 'completed').length,
  };

  return { reviewers, count, loading, error, refetch, stats };
}
