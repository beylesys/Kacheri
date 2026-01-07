// KACHERI FRONTEND/src/components/CommentsPanel.tsx
// Main comments panel drawer for document inline comments.

import { useState, useCallback, useEffect } from 'react';
import { useComments, type FilterTab } from '../hooks/useComments';
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

export function CommentsPanel({
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
  const { threads: _threads, loading, error, refetch, filterThreads, stats } = useComments(docId, refreshKey);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentMentions, setNewCommentMentions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<MentionMember[]>([]);

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
        aria-expanded={open}
      >
        {/* Header */}
        <div className="comments-header">
          <div className="comments-title">Comments</div>
          <button className="comments-close" onClick={onClose} title="Close">
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

        {/* Thread list */}
        <div className="comments-list">
          {loading && <div className="comments-loading">Loading comments...</div>}

          {error && <div className="comments-error">{error}</div>}

          {!loading && !error && filteredThreads.length === 0 && (
            <div className="comments-empty">
              {filter === 'all'
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
