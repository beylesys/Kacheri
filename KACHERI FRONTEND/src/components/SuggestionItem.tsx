// KACHERI FRONTEND/src/components/SuggestionItem.tsx
// Renders a single suggestion item with actions.

import { useState, useCallback } from 'react';
import type { Suggestion, ChangeType } from '../api/suggestions';
import { suggestionsApi } from '../api/suggestions';

type Props = {
  suggestion: Suggestion;
  currentUserId: string;
  role: 'viewer' | 'commenter' | 'editor' | 'owner';
  onRefresh: () => void;
  onSelect?: (suggestion: Suggestion) => void;
  isSelected?: boolean;
};

export function SuggestionItem({
  suggestion,
  currentUserId,
  role,
  onRefresh,
  onSelect,
  isSelected = false,
}: Props) {
  const [processing, setProcessing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editComment, setEditComment] = useState(suggestion.comment || '');

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatAuthor = (authorId: string) => {
    return authorId.replace(/^user_/, '');
  };

  const getChangeTypeLabel = (changeType: ChangeType) => {
    switch (changeType) {
      case 'insert': return 'Insert';
      case 'delete': return 'Delete';
      case 'replace': return 'Replace';
    }
  };

  const isOwn = suggestion.authorId === currentUserId ||
                suggestion.authorId === `user_${currentUserId}`;

  const canAcceptReject = (role === 'editor' || role === 'owner') && suggestion.status === 'pending';
  const canDelete = (isOwn && (role !== 'viewer')) || role === 'editor' || role === 'owner';
  const canEditComment = isOwn && (role !== 'viewer');

  const handleAccept = useCallback(async () => {
    if (processing) return;
    setProcessing(true);
    try {
      await suggestionsApi.accept(suggestion.id);
      onRefresh();
    } catch (err) {
      console.error('Failed to accept suggestion:', err);
    } finally {
      setProcessing(false);
    }
  }, [suggestion.id, processing, onRefresh]);

  const handleReject = useCallback(async () => {
    if (processing) return;
    setProcessing(true);
    try {
      await suggestionsApi.reject(suggestion.id);
      onRefresh();
    } catch (err) {
      console.error('Failed to reject suggestion:', err);
    } finally {
      setProcessing(false);
    }
  }, [suggestion.id, processing, onRefresh]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this suggestion?')) return;
    if (processing) return;
    setProcessing(true);
    try {
      await suggestionsApi.delete(suggestion.id);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete suggestion:', err);
    } finally {
      setProcessing(false);
    }
  }, [suggestion.id, processing, onRefresh]);

  const handleSaveComment = useCallback(async () => {
    if (processing) return;
    setProcessing(true);
    try {
      await suggestionsApi.updateComment(suggestion.id, editComment);
      setEditing(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to update comment:', err);
    } finally {
      setProcessing(false);
    }
  }, [suggestion.id, editComment, processing, onRefresh]);

  const handleCancelEdit = () => {
    setEditing(false);
    setEditComment(suggestion.comment || '');
  };

  const handleClick = () => {
    onSelect?.(suggestion);
  };

  return (
    <div
      className={`suggestion-item ${isSelected ? 'selected' : ''} ${suggestion.status}`}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="suggestion-header">
        <span className={`suggestion-change-badge ${suggestion.changeType}`}>
          {getChangeTypeLabel(suggestion.changeType)}
        </span>
        <span className={`suggestion-status-badge ${suggestion.status}`}>
          {suggestion.status}
        </span>
      </div>

      {/* Change preview */}
      <div className="suggestion-change-preview">
        {(suggestion.changeType === 'delete' || suggestion.changeType === 'replace') &&
          suggestion.originalText && (
          <div className="suggestion-original-text">
            <span className="suggestion-text-label">Remove:</span>
            <span className="suggestion-text-content strikethrough">
              {suggestion.originalText}
            </span>
          </div>
        )}
        {(suggestion.changeType === 'insert' || suggestion.changeType === 'replace') &&
          suggestion.proposedText && (
          <div className="suggestion-proposed-text">
            <span className="suggestion-text-label">
              {suggestion.changeType === 'insert' ? 'Insert:' : 'Add:'}
            </span>
            <span className="suggestion-text-content highlight">
              {suggestion.proposedText}
            </span>
          </div>
        )}
      </div>

      {/* Comment */}
      {editing ? (
        <div className="suggestion-edit-form">
          <textarea
            className="suggestion-textarea"
            value={editComment}
            onChange={(e) => setEditComment(e.target.value)}
            placeholder="Add a comment..."
            autoFocus
          />
          <div className="suggestion-edit-actions">
            <button
              className="suggestion-btn ghost"
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
            <button
              className="suggestion-btn primary"
              onClick={handleSaveComment}
              disabled={processing}
            >
              Save
            </button>
          </div>
        </div>
      ) : suggestion.comment ? (
        <div className="suggestion-comment">
          <span className="suggestion-comment-icon">💬</span>
          {suggestion.comment}
        </div>
      ) : null}

      {/* Meta info */}
      <div className="suggestion-meta">
        <span className="suggestion-author">{formatAuthor(suggestion.authorId)}</span>
        <span className="suggestion-time">{formatTime(suggestion.createdAt)}</span>
        {suggestion.resolvedBy && (
          <span className="suggestion-resolved-by">
            {suggestion.status === 'accepted' ? 'Accepted' : 'Rejected'} by {formatAuthor(suggestion.resolvedBy)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="suggestion-actions" onClick={(e) => e.stopPropagation()}>
        {canAcceptReject && (
          <>
            <button
              className="suggestion-action-btn accept"
              onClick={handleAccept}
              disabled={processing}
              title="Accept suggestion"
            >
              Accept
            </button>
            <button
              className="suggestion-action-btn reject"
              onClick={handleReject}
              disabled={processing}
              title="Reject suggestion"
            >
              Reject
            </button>
          </>
        )}
        {canEditComment && !editing && (
          <button
            className="suggestion-action-btn"
            onClick={() => setEditing(true)}
            title="Edit comment"
          >
            Edit
          </button>
        )}
        {canDelete && (
          <button
            className="suggestion-action-btn danger"
            onClick={handleDelete}
            disabled={processing}
            title="Delete suggestion"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
