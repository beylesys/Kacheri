// KACHERI FRONTEND/src/components/studio/ConversationMessage.tsx
// Renders a single conversation message in the Design Studio AI chat.
// User messages are right-aligned; assistant messages show badges, proof links, and actions.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C4

import type { ConversationMessage as MessageType, ActionType, DocRef } from '../../types/canvas';

const ACTION_LABELS: Record<ActionType, string> = {
  generate: 'Generate',
  edit: 'Edit',
  style: 'Style',
  content: 'Content',
  compose: 'Compose',
};

const ACTION_COLORS: Record<ActionType, string> = {
  generate: 'var(--brand-500, #7c5cff)',
  edit: 'var(--blue-500, #3b82f6)',
  style: 'var(--purple-500, #a855f7)',
  content: 'var(--green-500, #22c55e)',
  compose: 'var(--orange-500, #f97316)',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface ConversationMessageProps {
  message: MessageType;
  /** Whether this message has a pending diff that can be approved/rejected */
  hasPendingDiff: boolean;
  onShowDiff?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  /** Called when user clicks a proof link — opens proof details in ProofsPanel */
  onViewProof?: (proofId: string) => void;
}

export function ConversationMessage({
  message,
  hasPendingDiff,
  onShowDiff,
  onApprove,
  onReject,
  onViewProof,
}: ConversationMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const metadata = message.metadata as Record<string, unknown> | null;
  const memoryContextUsed = metadata?.memoryContextUsed === true;
  const memoryEntityCount = (metadata?.memoryEntityCount as number) || 0;
  const frameCount = (metadata?.frameCount as number) || 0;

  return (
    <div
      className={
        'conversation-message' +
        (isUser ? ' conversation-message--user' : '') +
        (isAssistant ? ' conversation-message--assistant' : '')
      }
    >
      {/* Badges row (assistant only) */}
      {isAssistant && message.actionType && (
        <div className="conversation-message-badges">
          <span
            className="conversation-message-badge"
            style={{
              backgroundColor: ACTION_COLORS[message.actionType] || 'var(--muted)',
            }}
          >
            {ACTION_LABELS[message.actionType] || message.actionType}
          </span>

          {frameCount > 0 && (
            <span className="conversation-message-badge conversation-message-badge--subtle">
              {frameCount} frame{frameCount !== 1 ? 's' : ''}
            </span>
          )}

          {memoryContextUsed && (
            <span
              className="conversation-message-badge"
              style={{ backgroundColor: 'var(--green-600, #16a34a)' }}
              title={`Memory graph context: ${memoryEntityCount} entities`}
            >
              Memory
            </span>
          )}
        </div>
      )}

      {/* Message content */}
      <div className="conversation-message-content">
        {message.content}
      </div>

      {/* Doc references (if present) */}
      {message.docRefs && message.docRefs.length > 0 && (
        <div className="conversation-message-docrefs">
          {message.docRefs.map((ref: DocRef, i: number) => (
            <span key={i} className="conversation-message-docref" title={ref.section || ref.docId}>
              {ref.section || ref.docId}
            </span>
          ))}
        </div>
      )}

      {/* Actions for assistant messages with pending changes */}
      {isAssistant && hasPendingDiff && (
        <div className="conversation-message-actions">
          <button
            className="conversation-message-action-btn conversation-message-action-btn--diff"
            onClick={onShowDiff}
          >
            Show Diff
          </button>
          <button
            className="conversation-message-action-btn conversation-message-action-btn--approve"
            onClick={onApprove}
          >
            Approve
          </button>
          <button
            className="conversation-message-action-btn conversation-message-action-btn--reject"
            onClick={onReject}
          >
            Request Changes
          </button>
        </div>
      )}

      {/* Meta row: proof ID + timestamp */}
      <div className="conversation-message-meta">
        {isAssistant && message.proofId && (
          onViewProof ? (
            <button
              className="conversation-message-proof conversation-message-proof--link"
              title={`View proof: ${message.proofId}`}
              onClick={() => onViewProof(message.proofId!)}
            >
              View Proof
            </button>
          ) : (
            <span className="conversation-message-proof" title={message.proofId}>
              proof:{message.proofId.slice(0, 8)}
            </span>
          )
        )}
        <span className="conversation-message-time">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
