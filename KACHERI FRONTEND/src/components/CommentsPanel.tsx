// KACHERI FRONTEND/src/components/CommentsPanel.tsx
// Main comments panel drawer for document inline comments.

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { useComments, type FilterTab, type ServerFilters } from '../hooks/useComments';
import { commentsApi } from '../api/comments';
import { workspacesApi, type WorkspaceMember } from '../api/workspaces';
import { CommentThread } from './CommentThread';
import MentionInput, { type MentionMember } from './MentionInput';
import './commentsPanel.css';

type EditorApi = {
  selectPlainTextRange?: (range: { start: number; end: number }) => void;
};

type SelectionInfo = {
  start: number;
  end: number;
  text: string;
} | null;

type Props = {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey?: number;
  editorApi: EditorApi | null;
  currentSelection?: SelectionInfo;
  onCommentCreated?: () => void;
  currentUserId?: string;
  workspaceId?: string | null;
};

function CommentsPanelInner({
  docId,
  open,
  onClose,
  refreshKey = 0,
  editorApi,
  currentSelection,
  onCommentCreated,
  currentUserId = '',
  workspaceId,
}: Props) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentMentions, setNewCommentMentions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<MentionMember[]>([]);
  const [authorFilter, setAuthorFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [searchDebounced, setSearchDebounced] = useState<string>('');
  const [bulkResolving, setBulkResolving] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchFilter]);

  // Build server filters memo
  const serverFilters = useMemo<ServerFilters | undefined>(() => {
    if (!authorFilter && !searchDebounced) return undefined;
    return {
      authorId: authorFilter || undefined,
      search: searchDebounced || undefined,
    };
  }, [authorFilter, searchDebounced]);

  const { threads: _threads, loading, error, refetch, filterThreads, stats } = useComments(docId, refreshKey, serverFilters);

  // Get user ID from localStorage if not provided
  const userId = currentUserId || (() => {
    try {
      return localStorage.getItem('devUser') || localStorage.getItem('userId') || 'unknown';
    } catch {
      return 'unknown';
    }
  })();

  // Clear new comment text when selection changes
  useEffect(() => {
    if (!currentSelection) {
      setNewCommentText('');
      setNewCommentMentions([]);
    }
  }, [currentSelection]);

  // Fetch workspace members for @mention autocomplete
  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceMembers([]);
      return;
    }

    workspacesApi
      .listMembers(workspaceId)
      .then((members: WorkspaceMember[]) => {
        setWorkspaceMembers(
          members.map((m) => ({
            userId: m.userId,
            displayName: m.userId, // Could be enhanced with display names if available
          }))
        );
      })
      .catch((err) => {
        console.error('Failed to load workspace members:', err);
        setWorkspaceMembers([]);
      });
  }, [workspaceId]);

  const filteredThreads = filterThreads(filter);

  const handleCreateComment = useCallback(async () => {
    if (!currentSelection || !newCommentText.trim() || submitting) return;

    setSubmitting(true);
    try {
      await commentsApi.create(docId, {
        content: newCommentText.trim(),
        anchorFrom: currentSelection.start,
        anchorTo: currentSelection.end,
        anchorText: currentSelection.text,
        mentions: newCommentMentions.length > 0 ? newCommentMentions : undefined,
      });
      setNewCommentText('');
      setNewCommentMentions([]);
      onCommentCreated?.();
      refetch();
    } catch (err) {
      console.error('Failed to create comment:', err);
    } finally {
      setSubmitting(false);
    }
  }, [docId, currentSelection, newCommentText, newCommentMentions, submitting, onCommentCreated, refetch]);

  const handleBulkResolve = useCallback(async () => {
    if (bulkResolving) return;
    if (!confirm(`Resolve all ${stats.open} open threads?`)) return;

    setBulkResolving(true);
    try {
      await commentsApi.bulkResolve(docId);
      refetch();
    } catch (err) {
      console.error('Failed to bulk resolve:', err);
    } finally {
      setBulkResolving(false);
    }
  }, [docId, stats.open, bulkResolving, refetch]);

  const truncateText = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  };

  return (
    <>
      {/* Tab when closed */}
      {!open && (
        <button
          className="comments-tab"
          onClick={() => {/* Parent controls open state */}}
          style={{ display: 'none' }} // Hidden - toolbar button controls panel
          aria-label="Open Comments"
        >
          Comments
        </button>
      )}

      {/* Main panel */}
      <div
        className={`comments-panel ${open ? 'open' : ''}`}
        role="complementary"
        aria-label="Comments"
      >
        {/* Header */}
        <div className="comments-header">
          <div className="comments-title">Comments</div>
          <button className="comments-close" onClick={onClose} title="Close" aria-label="Close panel">
            x
          </button>
        </div>

        {/* Filter tabs */}
        <div className="comments-tabs">
          <button
            className={`comments-tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All<span className="comments-tab-count">({stats.total})</span>
          </button>
          <button
            className={`comments-tab-btn ${filter === 'open' ? 'active' : ''}`}
            onClick={() => setFilter('open')}
          >
            Open<span className="comments-tab-count">({stats.open})</span>
          </button>
          <button
            className={`comments-tab-btn ${filter === 'resolved' ? 'active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            Resolved<span className="comments-tab-count">({stats.resolved})</span>
          </button>
        </div>

        {/* Filter bar */}
        <div className="comments-filter-bar">
          <input
            type="text"
            className="comments-search-input"
            placeholder="Search comments..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
          <div className="comments-filter-row">
            <select
              className="comments-author-filter"
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
            >
              <option value="">All authors</option>
              {workspaceMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName || m.userId}
                </option>
              ))}
            </select>
            {stats.open > 0 && (
              <button
                className="comments-resolve-all-btn"
                onClick={handleBulkResolve}
                disabled={bulkResolving}
              >
                {bulkResolving ? 'Resolving...' : `Resolve All (${stats.open})`}
              </button>
            )}
          </div>
        </div>

        {/* Thread list */}
        <div className="comments-list">
          {loading && <div className="comments-loading">Loading comments...</div>}

          {error && <div className="comments-error">{error}</div>}

          {!loading && !error && filteredThreads.length === 0 && (
            <div className="comments-empty">
              {(authorFilter || searchDebounced)
                ? 'No comments match the current filters.'
                : filter === 'all'
                ? 'No comments yet. Select text and add a comment.'
                : filter === 'open'
                ? 'No open comments.'
                : 'No resolved comments.'}
            </div>
          )}

          {!loading && !error && filteredThreads.map((thread) => (
            <CommentThread
              key={thread.threadId}
              thread={thread}
              currentUserId={userId}
              editorApi={editorApi}
              onRefresh={refetch}
              workspaceMembers={workspaceMembers}
            />
          ))}
        </div>

        {/* Add comment section (when selection exists) */}
        {currentSelection && currentSelection.text && (
          <div className="comments-add-section">
            <div className="comments-selection-preview">
              <div className="comments-selection-label">Selected text:</div>
              <div className="comments-selection-text">
                "{truncateText(currentSelection.text, 100)}"
              </div>
            </div>

            <div className="comment-input-wrapper">
              <MentionInput
                value={newCommentText}
                onChange={setNewCommentText}
                mentions={newCommentMentions}
                onMentionsChange={setNewCommentMentions}
                workspaceMembers={workspaceMembers}
                placeholder="Add a comment... (type @ to mention)"
                rows={3}
                className="comment-textarea"
              />
            </div>

            <div className="comment-input-actions">
              <button
                className="comment-submit-btn ghost"
                onClick={() => onCommentCreated?.()}
              >
                Cancel
              </button>
              <button
                className="comment-submit-btn primary"
                onClick={handleCreateComment}
                disabled={!newCommentText.trim() || submitting}
              >
                {submitting ? 'Adding...' : 'Add Comment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const CommentsPanel = memo(CommentsPanelInner);
