// KACHERI FRONTEND/src/components/ReviewersPanel.tsx
// Sidebar panel for document reviewer assignments.
// Slice 12 — Phase 2 Sprint 4

import React, { memo, useCallback, useEffect, useState } from 'react';
import { useReviewers } from '../hooks/useReviewers';
import { reviewersApi, type ReviewerStatus } from '../api/reviewers';
import { workspacesApi, type WorkspaceMember } from '../api/workspaces';

interface ReviewersPanelProps {
  docId: string;
  open: boolean;
  onClose: () => void;
  refreshKey: number;
  currentUserId: string;
  workspaceId: string;
}

const STATUS_LABELS: Record<ReviewerStatus, string> = {
  pending: 'Pending',
  in_review: 'In Review',
  completed: 'Completed',
};

const STATUS_COLORS: Record<ReviewerStatus, string> = {
  pending: '#f59e0b',    // amber
  in_review: '#3b82f6',  // blue
  completed: '#22c55e',  // green
};

function ReviewersPanelInner({
  docId,
  open,
  onClose,
  refreshKey,
  currentUserId,
  workspaceId,
}: ReviewersPanelProps) {
  const { reviewers, loading, error, refetch, stats } = useReviewers(docId, refreshKey);

  // Workspace members for user picker
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Notes for completing review
  const [completionNotes, setCompletionNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null); // userId being updated

  // Fetch workspace members for user picker
  useEffect(() => {
    if (!workspaceId) return;
    workspacesApi
      .listMembers(workspaceId)
      .then((m: WorkspaceMember[]) => setMembers(m))
      .catch(() => setMembers([]));
  }, [workspaceId]);

  // Filter out already-assigned reviewers from picker
  const assignedUserIds = new Set(reviewers.map(r => r.userId));
  const availableMembers = members.filter(m => !assignedUserIds.has(m.userId));

  const handleAssign = useCallback(async () => {
    if (!selectedUserId || assigning) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await reviewersApi.assign(docId, selectedUserId);
      setSelectedUserId('');
      refetch();
    } catch (err: any) {
      setAssignError(err?.message || 'Failed to assign reviewer');
    } finally {
      setAssigning(false);
    }
  }, [docId, selectedUserId, assigning, refetch]);

  const handleUpdateStatus = useCallback(async (
    userId: string,
    status: ReviewerStatus,
    notes?: string | null
  ) => {
    setUpdatingStatus(userId);
    try {
      await reviewersApi.updateStatus(docId, userId, status, notes);
      setCompletionNotes('');
      refetch();
    } catch (err: any) {
      console.error('Failed to update reviewer status:', err);
    } finally {
      setUpdatingStatus(null);
    }
  }, [docId, refetch]);

  const handleRemove = useCallback(async (userId: string) => {
    if (!confirm('Remove this reviewer assignment?')) return;
    try {
      await reviewersApi.remove(docId, userId);
      refetch();
    } catch (err: any) {
      console.error('Failed to remove reviewer:', err);
    }
  }, [docId, refetch]);

  if (!open) return null;

  const panelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontSize: '13px',
    color: 'var(--text-primary, #1f2937)',
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontWeight: 600,
    fontSize: '14px',
  };

  const statsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
    fontSize: '12px',
    color: 'var(--text-secondary, #6b7280)',
  };

  const assignSectionStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
  };

  const listStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  };

  const itemStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-light, #f3f4f6)',
  };

  const badgeStyle = (status: ReviewerStatus): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 500,
    color: '#fff',
    backgroundColor: STATUS_COLORS[status],
  });

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid var(--border-color, #e5e7eb)',
    background: 'var(--bg-surface, #fff)',
    fontSize: '12px',
    cursor: 'pointer',
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--brand-600, #7c3aed)',
    color: '#fff',
    border: 'none',
  };

  const btnDangerStyle: React.CSSProperties = {
    ...btnStyle,
    color: '#ef4444',
    borderColor: '#fca5a5',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span>Reviewers</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-secondary, #6b7280)' }}
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Stats bar */}
      <div style={statsStyle}>
        <span>Total: {stats.total}</span>
        <span style={{ color: STATUS_COLORS.pending }}>Pending: {stats.pending}</span>
        <span style={{ color: STATUS_COLORS.in_review }}>In Review: {stats.inReview}</span>
        <span style={{ color: STATUS_COLORS.completed }}>Completed: {stats.completed}</span>
      </div>

      {/* Assign reviewer section */}
      <div style={assignSectionStyle}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
            Assign Reviewer
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #e5e7eb)',
              fontSize: '12px',
              background: 'var(--bg-surface, #fff)',
            }}
          >
            <option value="">Select user...</option>
            {availableMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId}
              </option>
            ))}
          </select>
        </div>
        <button
          style={btnPrimaryStyle}
          onClick={handleAssign}
          disabled={!selectedUserId || assigning}
        >
          {assigning ? '...' : 'Assign'}
        </button>
      </div>

      {assignError && (
        <div style={{ padding: '6px 16px', fontSize: '12px', color: '#ef4444', background: '#fef2f2' }}>
          {assignError}
        </div>
      )}

      {/* Reviewer list */}
      <div style={listStyle}>
        {loading && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
            Loading reviewers...
          </div>
        )}

        {error && (
          <div style={{ padding: '16px', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {!loading && !error && reviewers.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
            No reviewers assigned yet.
            <br />
            <span style={{ fontSize: '12px' }}>Use the picker above to assign a reviewer.</span>
          </div>
        )}

        {reviewers.map((r) => {
          const isSelf = r.userId === currentUserId;
          const isUpdating = updatingStatus === r.userId;

          return (
            <div key={r.id} style={itemStyle}>
              {/* Reviewer header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 500 }}>{r.userId}</span>
                  <span style={badgeStyle(r.status)}>{STATUS_LABELS[r.status]}</span>
                </div>
                <button
                  style={btnDangerStyle}
                  onClick={() => handleRemove(r.userId)}
                  title="Remove reviewer"
                >
                  Remove
                </button>
              </div>

              {/* Meta */}
              <div style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)', marginBottom: '6px' }}>
                Assigned by {r.assignedBy} &middot; {new Date(r.assignedAt).toLocaleDateString()}
                {r.completedAt && (
                  <> &middot; Completed {new Date(r.completedAt).toLocaleDateString()}</>
                )}
              </div>

              {/* Notes */}
              {r.notes && (
                <div style={{ fontSize: '12px', color: 'var(--text-primary, #374151)', padding: '6px 8px', background: 'var(--bg-muted, #f9fafb)', borderRadius: '4px', marginBottom: '6px' }}>
                  {r.notes}
                </div>
              )}

              {/* Self-service actions for the reviewer */}
              {isSelf && r.status === 'pending' && (
                <button
                  style={btnPrimaryStyle}
                  onClick={() => handleUpdateStatus(r.userId, 'in_review')}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Starting...' : 'Start Review'}
                </button>
              )}

              {isSelf && r.status === 'in_review' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <textarea
                    placeholder="Optional completion notes..."
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color, #e5e7eb)',
                      fontSize: '12px',
                      resize: 'vertical',
                    }}
                  />
                  <button
                    style={{ ...btnPrimaryStyle, background: STATUS_COLORS.completed }}
                    onClick={() => handleUpdateStatus(r.userId, 'completed', completionNotes || null)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? 'Completing...' : 'Mark Complete'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ReviewersPanel = memo(ReviewersPanelInner);
