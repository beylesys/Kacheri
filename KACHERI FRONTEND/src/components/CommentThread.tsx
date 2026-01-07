// KACHERI FRONTEND/src/components/CommentThread.tsx
// Renders a comment thread with root comment, replies, and actions.

import { useState, useCallback } from 'react';
import type { Comment } from '../api/comments';
import { commentsApi } from '../api/comments';
import type { CommentThread as CommentThreadType } from '../hooks/useComments';
import MentionInput, { type MentionMember } from './MentionInput';

type EditorApi = {
  selectPlainTextRange?: (range: { start: number; end: number }) => void;
};

type Props = {
  thread: CommentThreadType;
  currentUserId: string;
  editorApi: EditorApi | null;
  onRefresh: () => void;
  workspaceMembers?: MentionMember[];
};

export function CommentThread({ thread, currentUserId, editorApi, onRefresh, workspaceMembers = [] }: Props) {
  const { rootComment, replies, isResolved } = thread;

  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyMentions, setReplyMentions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

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
    // Strip "user_" prefix if present
    return authorId.replace(/^user_/, '');
  };

  const truncateText = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  };

  // Render content with @mention highlighting
  const renderContent = (content: string) => {
    // Split by @mentions pattern
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="mention-tag">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const handleJumpToAnchor = useCallback(() => {
    if (rootComment.anchorFrom !== null && rootComment.anchorTo !== null) {
      editorApi?.selectPlainTextRange?.({
        start: rootComment.anchorFrom,
        end: rootComment.anchorTo,
      });
    }
  }, [rootComment.anchorFrom, rootComment.anchorTo, editorApi]);

  const handleReply = async () => {
    const content = replyText.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    try {
      await commentsApi.create(rootComment.docId, {
        content,
        parentId: rootComment.id,
        mentions: replyMentions.length > 0 ? replyMentions : undefined,
      });
      setReplyText('');
      setReplyMentions([]);
      setShowReplies(true);
      onRefresh();
    } catch (err) {
      console.error('Failed to create reply:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async () => {
    try {
      await commentsApi.resolve(rootComment.id);
      onRefresh();
    } catch (err) {
      console.error('Failed to resolve thread:', err);
    }
  };

  const handleReopen = async () => {
    try {
      await commentsApi.reopen(rootComment.id);
      onRefresh();
    } catch (err) {
      console.error('Failed to reopen thread:', err);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await commentsApi.delete(commentId);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleStartEdit = (comment: Comment) => {
    setEditing(comment.id);
    setEditText(comment.content);
  };

  const handleSaveEdit = async (commentId: number) => {
    const content = editText.trim();
    if (!content) return;

    try {
      await commentsApi.update(commentId, content);
      setEditing(null);
      setEditText('');
      onRefresh();
    } catch (err) {
      console.error('Failed to update comment:', err);
    }
  };

  const handleCancelEdit = () => {
    setEditing(null);
    setEditText('');
  };

  const renderComment = (comment: Comment, isReply: boolean = false) => {
    const isOwn = comment.authorId === currentUserId ||
                  comment.authorId === `user_${currentUserId}`;
    const isEditing = editing === comment.id;

    return (
      <div
        key={comment.id}
        className={`comment-bubble ${isReply ? 'reply' : ''}`}
      >
        {/* Header */}
        <div className="comment-header">
          <span className="comment-author">{formatAuthor(comment.authorId)}</span>
          <span className="comment-time">{formatTime(comment.createdAt)}</span>
          {!isReply && isResolved && (
            <span className="comment-resolved-badge">Resolved</span>
          )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="comment-edit-form">
            <textarea
              className="comment-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
            />
            <div className="comment-input-actions">
              <button
                className="comment-submit-btn ghost"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
              <button
                className="comment-submit-btn primary"
                onClick={() => handleSaveEdit(comment.id)}
                disabled={!editText.trim()}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="comment-content">{renderContent(comment.content)}</div>
        )}

        {/* Anchor badge (root comment only) */}
        {!isReply && comment.anchorText && (
          <button
            className="comment-anchor-badge"
            onClick={handleJumpToAnchor}
            title="Jump to text in document"
          >
            <span className="comment-anchor-text">
              "{truncateText(comment.anchorText, 40)}"
            </span>
          </button>
        )}

        {/* Actions (only for own comments when not editing) */}
        {isOwn && !isEditing && (
          <div className="comment-actions">
            <button
              className="comment-action-btn"
              onClick={() => handleStartEdit(comment)}
            >
              Edit
            </button>
            <button
              className="comment-action-btn danger"
              onClick={() => handleDelete(comment.id)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`comment-thread ${isResolved ? 'resolved' : ''}`}>
      {/* Root comment */}
      {renderComment(rootComment, false)}

      {/* Replies toggle */}
      {replies.length > 0 && (
        <div className="comment-replies">
          <button
            className="comment-replies-toggle"
            onClick={() => setShowReplies(!showReplies)}
          >
            {showReplies ? 'Hide' : 'Show'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </button>

          {showReplies && (
            <div className="comment-replies-list">
              {replies.map((reply) => renderComment(reply, true))}
            </div>
          )}
        </div>
      )}

      {/* Reply input */}
      {!isResolved && (
        <div className="comment-reply-form">
          <div className="comment-input-wrapper">
            <MentionInput
              value={replyText}
              onChange={setReplyText}
              mentions={replyMentions}
              onMentionsChange={setReplyMentions}
              workspaceMembers={workspaceMembers}
              placeholder="Write a reply... (type @ to mention)"
              rows={2}
              className="comment-textarea"
            />
          </div>
          <div className="comment-input-actions">
            <button
              className="comment-submit-btn primary"
              onClick={handleReply}
              disabled={!replyText.trim() || submitting}
            >
              {submitting ? 'Sending...' : 'Reply'}
            </button>
          </div>
        </div>
      )}

      {/* Resolve/Reopen action */}
      <div className="comment-actions" style={{ marginTop: 8 }}>
        {isResolved ? (
          <button className="comment-action-btn" onClick={handleReopen}>
            Reopen Thread
          </button>
        ) : (
          <button className="comment-action-btn resolve" onClick={handleResolve}>
            Resolve Thread
          </button>
        )}
      </div>
    </div>
  );
}
