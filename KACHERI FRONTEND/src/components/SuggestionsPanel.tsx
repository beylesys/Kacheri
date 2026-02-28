// KACHERI FRONTEND/src/components/SuggestionsPanel.tsx
// Main suggestions panel drawer for document track changes.

import { memo, useState, useCallback, useMemo } from 'react';
import { useSuggestions, type SuggestionFilterTab, type SuggestionServerFilters } from '../hooks/useSuggestions';
import { suggestionsApi, type Suggestion, type ChangeType } from '../api/suggestions';
import { SuggestionItem } from './SuggestionItem';
import './suggestionsPanel.css';

type ChangeTypeChip = ChangeType | 'all';

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  currentUserId?: string;
  role: 'viewer' | 'commenter' | 'editor' | 'owner';
  selectedSuggestionId?: number | null;
  onSelectSuggestion?: (suggestion: Suggestion | null) => void;
};

function SuggestionsPanelInner({
  docId,
  open,
  onClose,
  refreshKey = 0,
  currentUserId = '',
  role,
  selectedSuggestionId,
  onSelectSuggestion,
}: Props) {
  const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeTypeChip>('all');

  const serverFilters = useMemo<SuggestionServerFilters | undefined>(() => {
    if (changeTypeFilter === 'all') return undefined;
    return { changeType: changeTypeFilter };
  }, [changeTypeFilter]);

  const { suggestions: _suggestions, loading, error, refetch, filterSuggestions, stats } = useSuggestions(docId, refreshKey, serverFilters);

  const [filter, setFilter] = useState<SuggestionFilterTab>('all');
  const [processing, setProcessing] = useState(false);

  // Get user ID from localStorage if not provided
  const userId = currentUserId || (() => {
    try {
      return localStorage.getItem('devUser') || localStorage.getItem('userId') || 'unknown';
    } catch {
      return 'unknown';
    }
  })();

  const filteredSuggestions = filterSuggestions(filter);

  const canBulkAction = (role === 'editor' || role === 'owner') && stats.pending > 0;

  const handleAcceptAll = useCallback(async () => {
    if (processing || !canBulkAction) return;
    if (!confirm(`Accept all ${stats.pending} pending suggestions?`)) return;

    setProcessing(true);
    try {
      const result = await suggestionsApi.acceptAll(docId);
      console.log(`Accepted ${result.count} suggestions`);
      refetch();
    } catch (err) {
      console.error('Failed to accept all suggestions:', err);
    } finally {
      setProcessing(false);
    }
  }, [docId, processing, canBulkAction, stats.pending, refetch]);

  const handleRejectAll = useCallback(async () => {
    if (processing || !canBulkAction) return;
    if (!confirm(`Reject all ${stats.pending} pending suggestions?`)) return;

    setProcessing(true);
    try {
      const result = await suggestionsApi.rejectAll(docId);
      console.log(`Rejected ${result.count} suggestions`);
      refetch();
    } catch (err) {
      console.error('Failed to reject all suggestions:', err);
    } finally {
      setProcessing(false);
    }
  }, [docId, processing, canBulkAction, stats.pending, refetch]);

  const handleSelectSuggestion = useCallback((suggestion: Suggestion) => {
    if (selectedSuggestionId === suggestion.id) {
      onSelectSuggestion?.(null);
    } else {
      onSelectSuggestion?.(suggestion);
    }
  }, [selectedSuggestionId, onSelectSuggestion]);

  const getEmptyMessage = () => {
    const typeLabel = changeTypeFilter !== 'all' ? ` ${changeTypeFilter}` : '';
    switch (filter) {
      case 'pending':
        return `No pending${typeLabel} suggestions.`;
      case 'accepted':
        return `No accepted${typeLabel} suggestions.`;
      case 'rejected':
        return `No rejected${typeLabel} suggestions.`;
      case 'all':
      default:
        return changeTypeFilter !== 'all' ? `No ${changeTypeFilter} suggestions.` : 'No suggestions yet.';
    }
  };

  return (
    <div
      className={`suggestions-panel ${open ? 'open' : ''}`}
      role="complementary"
      aria-label="Suggestions"
    >
      {/* Header */}
      <div className="suggestions-header">
        <div className="suggestions-title">Suggestions</div>
        <button className="suggestions-close" onClick={onClose} title="Close" aria-label="Close panel">
          x
        </button>
      </div>

      {/* Change type filter chips */}
      <div className="suggestions-change-filter">
        {(['all', 'insert', 'delete', 'replace'] as ChangeTypeChip[]).map((ct) => (
          <button
            key={ct}
            className={`suggestions-change-chip ${ct !== 'all' ? ct : ''} ${changeTypeFilter === ct ? 'active' : ''}`}
            onClick={() => setChangeTypeFilter(ct)}
          >
            {ct === 'all' ? 'All Types' : ct.charAt(0).toUpperCase() + ct.slice(1)}
          </button>
        ))}
      </div>

      {/* Bulk actions (editor+ only, when pending > 0) */}
      {canBulkAction && (
        <div className="suggestions-bulk-actions">
          <button
            className="suggestions-bulk-btn accept-all"
            onClick={handleAcceptAll}
            disabled={processing}
            title="Accept all pending suggestions"
          >
            Accept All ({stats.pending})
          </button>
          <button
            className="suggestions-bulk-btn reject-all"
            onClick={handleRejectAll}
            disabled={processing}
            title="Reject all pending suggestions"
          >
            Reject All ({stats.pending})
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="suggestions-tabs">
        <button
          className={`suggestions-tab-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All<span className="suggestions-tab-count">({stats.total})</span>
        </button>
        <button
          className={`suggestions-tab-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending<span className="suggestions-tab-count">({stats.pending})</span>
        </button>
        <button
          className={`suggestions-tab-btn ${filter === 'accepted' ? 'active' : ''}`}
          onClick={() => setFilter('accepted')}
        >
          Accepted<span className="suggestions-tab-count">({stats.accepted})</span>
        </button>
        <button
          className={`suggestions-tab-btn ${filter === 'rejected' ? 'active' : ''}`}
          onClick={() => setFilter('rejected')}
        >
          Rejected<span className="suggestions-tab-count">({stats.rejected})</span>
        </button>
      </div>

      {/* Suggestions list */}
      <div className="suggestions-list">
        {loading && <div className="suggestions-loading">Loading suggestions...</div>}

        {error && <div className="suggestions-error">{error}</div>}

        {!loading && !error && filteredSuggestions.length === 0 && (
          <div className="suggestions-empty">{getEmptyMessage()}</div>
        )}

        {!loading && !error && filteredSuggestions.map((suggestion) => (
          <SuggestionItem
            key={suggestion.id}
            suggestion={suggestion}
            currentUserId={userId}
            role={role}
            onRefresh={refetch}
            onSelect={handleSelectSuggestion}
            isSelected={selectedSuggestionId === suggestion.id}
          />
        ))}
      </div>
    </div>
  );
}

export const SuggestionsPanel = memo(SuggestionsPanelInner);
