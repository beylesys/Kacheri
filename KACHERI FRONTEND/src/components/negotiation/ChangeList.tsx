// KACHERI FRONTEND/src/components/negotiation/ChangeList.tsx
// Filterable list of all negotiation changes with stats header, filters,
// bulk actions (accept all / reject all), and paginated ChangeCard list.
//
// Level 3 in NegotiationPanel navigation:
//   Level 1 (session list) → Level 2 (session detail + rounds) → Level 3 (change list)
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md — Slice 13

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  NegotiationChange,
  NegotiationSession,
  RoundSummary,
  SessionSummaryStats,
  ChangeStatus,
  ChangeCategory,
  RiskLevel,
} from '../../types/negotiation';
import { negotiationChangesApi, negotiationSessionsApi } from '../../api/negotiations';
import ChangeCard from './ChangeCard';
import CounterproposalModal from './CounterproposalModal';

type Props = {
  sessionId: string;
  initialRoundId?: string;
  rounds: RoundSummary[];
  onBack: () => void;
  onSessionUpdated: (session: NegotiationSession) => void;
  isTerminal: boolean;
};

const PAGE_SIZE = 50;

/** Sort order for risk levels (most severe first). */
const RISK_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const RISK_ORDER_NULL = 4;

/** Sort order for categories (substantive first). */
const CATEGORY_ORDER: Record<string, number> = {
  substantive: 0,
  structural: 1,
  editorial: 2,
};

export default function ChangeList({
  sessionId,
  initialRoundId,
  rounds,
  onBack,
  onSessionUpdated,
  isTerminal,
}: Props) {
  // --- Data ---
  const [changes, setChanges] = useState<NegotiationChange[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Summary stats ---
  const [stats, setStats] = useState<SessionSummaryStats | null>(null);

  // --- Filters ---
  const [filterRoundId, setFilterRoundId] = useState<string | null>(initialRoundId ?? null);
  const [filterStatus, setFilterStatus] = useState<ChangeStatus | null>(null);
  const [filterCategory, setFilterCategory] = useState<ChangeCategory | null>(null);
  const [filterRiskLevel, setFilterRiskLevel] = useState<RiskLevel | null>(null);

  // --- Sort ---
  const [sortBy, setSortBy] = useState<'position' | 'riskLevel' | 'category'>('position');

  // --- Keyboard navigation (Slice 20) ---
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // --- Bulk actions ---
  const [bulkAccepting, setBulkAccepting] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [confirmBulkAction, setConfirmBulkAction] = useState<'accept' | 'reject' | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // --- Fetch changes ---
  const fetchChanges = useCallback(
    async (append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const opts: Record<string, unknown> = { limit: PAGE_SIZE };
        if (filterRoundId) opts.roundId = filterRoundId;
        if (filterStatus) opts.status = filterStatus;
        if (filterCategory) opts.category = filterCategory;
        if (filterRiskLevel) opts.riskLevel = filterRiskLevel;
        if (append) opts.offset = changes.length;

        const res = await negotiationChangesApi.list(sessionId, opts as any);
        if (append) {
          setChanges(prev => [...prev, ...res.changes]);
        } else {
          setChanges(res.changes);
        }
        setTotal(res.total);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load changes';
        setError(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [sessionId, filterRoundId, filterStatus, filterCategory, filterRiskLevel, changes.length]
  );

  // --- Fetch stats ---
  const fetchStats = useCallback(async () => {
    try {
      const res = await negotiationSessionsApi.summary(sessionId);
      setStats(res.stats);
    } catch {
      // Stats are non-critical; silently fail
    }
  }, [sessionId]);

  // --- Initial fetch + refetch on filter changes ---
  useEffect(() => {
    fetchChanges();
    fetchStats();
    setFocusedIndex(-1); // Reset keyboard focus on filter change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, filterRoundId, filterStatus, filterCategory, filterRiskLevel]);

  // --- Client-side sort ---
  const sortedChanges = useMemo(() => {
    const arr = [...changes];
    switch (sortBy) {
      case 'position':
        arr.sort((a, b) => a.fromPos - b.fromPos);
        break;
      case 'riskLevel':
        arr.sort(
          (a, b) =>
            (a.riskLevel ? RISK_ORDER[a.riskLevel] ?? RISK_ORDER_NULL : RISK_ORDER_NULL) -
            (b.riskLevel ? RISK_ORDER[b.riskLevel] ?? RISK_ORDER_NULL : RISK_ORDER_NULL)
        );
        break;
      case 'category':
        arr.sort(
          (a, b) =>
            (CATEGORY_ORDER[a.category] ?? 3) - (CATEGORY_ORDER[b.category] ?? 3)
        );
        break;
    }
    return arr;
  }, [changes, sortBy]);

  // --- Callbacks for ChangeCard ---
  const handleStatusUpdated = useCallback(
    (updatedChange: NegotiationChange, updatedSession: NegotiationSession) => {
      setChanges(prev =>
        prev.map(c => (c.id === updatedChange.id ? updatedChange : c))
      );
      onSessionUpdated(updatedSession);
      fetchStats();
    },
    [onSessionUpdated, fetchStats]
  );

  const handleAnalyzed = useCallback(
    (updatedChange: NegotiationChange) => {
      setChanges(prev =>
        prev.map(c => (c.id === updatedChange.id ? updatedChange : c))
      );
      fetchStats();
    },
    [fetchStats]
  );

  // --- Counterproposal modal (Slice 14) ---
  const [counterModalChangeId, setCounterModalChangeId] = useState<string | null>(null);

  const counterModalChange = useMemo(
    () => (counterModalChangeId ? changes.find(c => c.id === counterModalChangeId) ?? null : null),
    [counterModalChangeId, changes]
  );

  const handleCounter = useCallback((changeId: string) => {
    setCounterModalChangeId(changeId);
  }, []);

  const handleCounterAccepted = useCallback(
    (updatedChange: NegotiationChange, updatedSession: NegotiationSession) => {
      setChanges(prev =>
        prev.map(c => (c.id === updatedChange.id ? updatedChange : c))
      );
      onSessionUpdated(updatedSession);
      fetchStats();
      setCounterModalChangeId(null);
    },
    [onSessionUpdated, fetchStats]
  );

  // --- Bulk actions ---
  const handleBulkAccept = useCallback(async () => {
    setBulkAccepting(true);
    setBulkError(null);
    try {
      const res = await negotiationChangesApi.acceptAll(sessionId);
      onSessionUpdated(res.session);
      setConfirmBulkAction(null);
      // Refetch to reflect new statuses
      fetchChanges();
      fetchStats();
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : 'Failed to accept all changes');
    } finally {
      setBulkAccepting(false);
    }
  }, [sessionId, onSessionUpdated, fetchChanges, fetchStats]);

  const handleBulkReject = useCallback(async () => {
    setBulkRejecting(true);
    setBulkError(null);
    try {
      const res = await negotiationChangesApi.rejectAll(sessionId);
      onSessionUpdated(res.session);
      setConfirmBulkAction(null);
      // Refetch to reflect new statuses
      fetchChanges();
      fetchStats();
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : 'Failed to reject all changes');
    } finally {
      setBulkRejecting(false);
    }
  }, [sessionId, onSessionUpdated, fetchChanges, fetchStats]);

  // --- Clear filters ---
  const hasActiveFilters =
    filterRoundId !== null ||
    filterStatus !== null ||
    filterCategory !== null ||
    filterRiskLevel !== null;

  const clearFilters = useCallback(() => {
    setFilterRoundId(null);
    setFilterStatus(null);
    setFilterCategory(null);
    setFilterRiskLevel(null);
  }, []);

  const pendingCount = stats?.byStatus.pending ?? 0;

  // --- Keyboard navigation handler (Slice 20) ---
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedChanges.length === 0) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, sortedChanges.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusedIndex(sortedChanges.length - 1);
      }
    },
    [sortedChanges.length]
  );

  return (
    <div>
      {/* Stats header */}
      {stats && (
        <div className="change-list-stats">
          <div className="change-list-stat">
            Total: <span className="change-list-stat-value">{stats.totalChanges}</span>
          </div>
          <div className="change-list-stat">
            Accepted:{' '}
            <span className="change-list-stat-value accepted">{stats.byStatus.accepted}</span>
          </div>
          <div className="change-list-stat">
            Rejected:{' '}
            <span className="change-list-stat-value rejected">{stats.byStatus.rejected}</span>
          </div>
          <div className="change-list-stat">
            Pending:{' '}
            <span className="change-list-stat-value pending">{stats.byStatus.pending}</span>
          </div>
          <div className="change-list-stat-divider" />
          <div className="change-list-stat">
            Substantive:{' '}
            <span className="change-list-stat-value">{stats.byCategory.substantive}</span>
          </div>
          <div className="change-list-stat">
            Editorial:{' '}
            <span className="change-list-stat-value">{stats.byCategory.editorial}</span>
          </div>
          <div className="change-list-stat">
            Structural:{' '}
            <span className="change-list-stat-value">{stats.byCategory.structural}</span>
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="change-list-filters">
        {/* Round filter */}
        <select
          className="change-list-filter-select"
          value={filterRoundId ?? ''}
          onChange={e => setFilterRoundId(e.target.value || null)}
          aria-label="Filter by round"
        >
          <option value="">All Rounds</option>
          {rounds.map(r => (
            <option key={r.id} value={r.id}>
              Round {r.roundNumber}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="change-list-filter-select"
          value={filterStatus ?? ''}
          onChange={e => setFilterStatus((e.target.value || null) as ChangeStatus | null)}
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="countered">Countered</option>
        </select>

        {/* Category filter */}
        <select
          className="change-list-filter-select"
          value={filterCategory ?? ''}
          onChange={e => setFilterCategory((e.target.value || null) as ChangeCategory | null)}
          aria-label="Filter by category"
        >
          <option value="">All Categories</option>
          <option value="substantive">Substantive</option>
          <option value="editorial">Editorial</option>
          <option value="structural">Structural</option>
        </select>

        {/* Risk filter */}
        <select
          className="change-list-filter-select"
          value={filterRiskLevel ?? ''}
          onChange={e => setFilterRiskLevel((e.target.value || null) as RiskLevel | null)}
          aria-label="Filter by risk level"
        >
          <option value="">All Risk</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Sort */}
        <select
          className="change-list-filter-select"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'position' | 'riskLevel' | 'category')}
          aria-label="Sort by"
        >
          <option value="position">Sort: Position</option>
          <option value="riskLevel">Sort: Risk</option>
          <option value="category">Sort: Category</option>
        </select>
      </div>

      {/* Bulk actions */}
      {!isTerminal && pendingCount > 0 && confirmBulkAction === null && (
        <div className="change-list-bulk-actions">
          <button
            className="change-list-bulk-btn accept"
            onClick={() => setConfirmBulkAction('accept')}
            disabled={bulkAccepting || bulkRejecting}
          >
            Accept All ({pendingCount})
          </button>
          <button
            className="change-list-bulk-btn reject"
            onClick={() => setConfirmBulkAction('reject')}
            disabled={bulkAccepting || bulkRejecting}
          >
            Reject All ({pendingCount})
          </button>
        </div>
      )}

      {/* Bulk confirmation */}
      {confirmBulkAction !== null && (
        <div className="change-list-bulk-confirm">
          <div className="change-list-bulk-confirm-text">
            {confirmBulkAction === 'accept'
              ? `Accept all ${pendingCount} pending changes?`
              : `Reject all ${pendingCount} pending changes?`}
          </div>
          <div className="change-list-bulk-confirm-actions">
            <button
              className="change-list-bulk-confirm-btn confirm"
              onClick={confirmBulkAction === 'accept' ? handleBulkAccept : handleBulkReject}
              disabled={bulkAccepting || bulkRejecting}
            >
              {bulkAccepting || bulkRejecting ? 'Processing...' : 'Confirm'}
            </button>
            <button
              className="change-list-bulk-confirm-btn cancel"
              onClick={() => {
                setConfirmBulkAction(null);
                setBulkError(null);
              }}
              disabled={bulkAccepting || bulkRejecting}
            >
              Cancel
            </button>
          </div>
          {bulkError && <div className="change-card-error">{bulkError}</div>}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="negotiation-skeleton">
          <div className="negotiation-skeleton-line long" />
          <div className="negotiation-skeleton-line medium" />
          <div className="negotiation-skeleton-line short" />
          <div className="negotiation-skeleton-line long" />
          <div className="negotiation-skeleton-line medium" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="negotiation-error">
          {error}
          <br />
          <button className="negotiation-error-retry" onClick={() => fetchChanges()}>
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && changes.length === 0 && (
        <div className="change-list-empty">
          <div className="change-list-empty-icon">{'\uD83D\uDD0D'}</div>
          <div className="change-list-empty-text">
            {hasActiveFilters
              ? 'No changes match the selected filters.'
              : 'No changes detected in this negotiation.'}
          </div>
          {hasActiveFilters && (
            <button className="change-list-clear-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Change cards */}
      {!loading && sortedChanges.length > 0 && (
        <div
          role="list"
          aria-label="Negotiation changes"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          className="change-list-cards"
        >
          {sortedChanges.map((change, index) => (
            <ChangeCard
              key={change.id}
              change={change}
              sessionId={sessionId}
              onStatusUpdated={handleStatusUpdated}
              onAnalyzed={handleAnalyzed}
              onCounter={handleCounter}
              isTerminal={isTerminal}
              isFocused={index === focusedIndex}
            />
          ))}
        </div>
      )}

      {/* Screen reader announcement for keyboard navigation */}
      <div aria-live="polite" className="sr-only">
        {focusedIndex >= 0 && sortedChanges[focusedIndex] &&
          `Change ${focusedIndex + 1} of ${sortedChanges.length}: ${sortedChanges[focusedIndex].category} ${sortedChanges[focusedIndex].changeType}, status ${sortedChanges[focusedIndex].status}`
        }
      </div>

      {/* Load more */}
      {!loading && total > changes.length && (
        <div className="change-list-load-more">
          <button
            className="change-list-load-more-btn"
            onClick={() => fetchChanges(true)}
            disabled={loadingMore}
          >
            {loadingMore
              ? 'Loading...'
              : `Load More (${changes.length} of ${total})`}
          </button>
        </div>
      )}

      {/* Counterproposal modal (Slice 14) */}
      {counterModalChange && (
        <CounterproposalModal
          open={counterModalChangeId !== null}
          sessionId={sessionId}
          change={counterModalChange}
          onClose={() => setCounterModalChangeId(null)}
          onAccepted={handleCounterAccepted}
        />
      )}
    </div>
  );
}
