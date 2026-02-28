// KACHERI FRONTEND/src/components/extraction/ActionsPanel.tsx
// Collapsible section within ExtractionPanel showing extraction actions.
//
// Fetches actions via extractionApi.listActions().
// Displays status badges, scheduled dates, messages.
// Supports cancel (pending/scheduled) and delete (completed/cancelled).
//
// See: Docs/Roadmap/document-intelligence-work-scope.md — Slice 11

import { useState, useEffect, useCallback } from 'react';
import type { ListActionsResponse } from '../../types/extraction.ts';
import { extractionApi } from '../../api/extraction.ts';

type ActionItem = ListActionsResponse['actions'][number];

type Props = {
  docId: string;
  open: boolean;
  refreshKey?: number;
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'action-status-pending' },
  scheduled: { label: 'Scheduled', className: 'action-status-scheduled' },
  completed: { label: 'Completed', className: 'action-status-completed' },
  cancelled: { label: 'Cancelled', className: 'action-status-cancelled' },
};

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatActionType(type: string): string {
  if (type === 'reminder') return 'Reminder';
  if (type === 'flag_review') return 'Review Flag';
  return type;
}

export default function ActionsPanel({ docId, open, refreshKey = 0 }: Props) {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await extractionApi.listActions(docId);
      setActions(res.actions);
      setTotal(res.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load actions';
      // 404 means no extraction / no actions — not an error
      if (msg.includes('404')) {
        setActions([]);
        setTotal(0);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    if (open) fetchActions();
  }, [open, fetchActions, refreshKey]);

  const handleDelete = useCallback(
    async (actionId: string) => {
      setDeletingId(actionId);
      try {
        await extractionApi.deleteAction(docId, actionId);
        await fetchActions();
      } catch {
        // Silent fail — UI will show stale state until next refresh
      } finally {
        setDeletingId(null);
      }
    },
    [docId, fetchActions]
  );

  return (
    <div className="actions-panel">
      <div
        className="actions-panel-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="actions-panel-title">
          Actions{total > 0 ? ` (${total})` : ''}
        </span>
        <span className="actions-panel-toggle">
          {collapsed ? '\u25B8' : '\u25BE'}
        </span>
      </div>

      {!collapsed && (
        <div className="actions-panel-body">
          {loading && (
            <div className="actions-panel-empty">Loading actions\u2026</div>
          )}

          {error && <div className="actions-panel-error">{error}</div>}

          {!loading && !error && actions.length === 0 && (
            <div className="actions-panel-empty">No actions yet</div>
          )}

          {!loading &&
            actions.map((action) => {
              const style = STATUS_STYLES[action.status];
              const isActive =
                action.status === 'pending' || action.status === 'scheduled';
              const isDeleting = deletingId === action.actionId;

              return (
                <div key={action.actionId} className="action-item">
                  <div className="action-item-header">
                    <span className="action-item-type">
                      {action.type === 'reminder' ? '\u23F0' : '\u2691'}{' '}
                      {formatActionType(action.type)}
                    </span>
                    <span
                      className={`action-status ${style?.className ?? ''}`}
                    >
                      {style?.label ?? action.status}
                    </span>
                  </div>

                  {action.field && (
                    <div className="action-item-field">
                      Field: {formatLabel(action.field)}
                    </div>
                  )}

                  {action.scheduledFor && (
                    <div className="action-item-scheduled">
                      Scheduled: {formatTimestamp(action.scheduledFor)}
                    </div>
                  )}

                  {action.config?.message && (
                    <div className="action-item-message">
                      {String(action.config.message)}
                    </div>
                  )}

                  <div className="action-item-footer">
                    <span className="action-item-meta">
                      {formatTimestamp(action.createdAt)}
                    </span>
                    <button
                      className="action-item-delete"
                      onClick={() => handleDelete(action.actionId)}
                      disabled={isDeleting}
                    >
                      {isDeleting
                        ? (isActive ? 'Cancelling\u2026' : 'Deleting\u2026')
                        : (isActive ? 'Cancel' : 'Delete')}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
