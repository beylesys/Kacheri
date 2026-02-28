// KACHERI FRONTEND/src/components/studio/ConversationPanel.tsx
// Main AI conversation panel for Design Studio Simple Mode.
// Displays chat history, handles generate/edit/style actions, and shows diff previews.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C4

import { useEffect, useRef, useCallback, useState } from 'react';
import type { CanvasFrame, GenerateFrameResponse } from '../../types/canvas';
import {
  useCanvasConversation,
  type ActionMode,
} from '../../hooks/useCanvasConversation';
import { ConversationMessage } from './ConversationMessage';
import { PromptInput, type PromptOptions } from './PromptInput';
import { FrameDiffPreview } from './FrameDiffPreview';

interface ConversationPanelProps {
  canvasId: string;
  activeFrameId: string | null;
  activeFrameCode: string | null;
  sortedFrames: CanvasFrame[];
  compositionMode: string;
  onFramesGenerated: (frames: CanvasFrame[], response: GenerateFrameResponse) => void;
  onFrameUpdated: (frame: CanvasFrame, response: GenerateFrameResponse) => void;
  /** Trigger to focus prompt input (incremented externally, e.g., "Add Frame" button) */
  focusPromptTrigger?: number;
  /** Called when user clicks a proof link in a conversation message */
  onViewProof?: (proofId: string) => void;
  /** E8: Called after sending an AI message so it can be broadcast via WebSocket */
  onNewMessage?: (msg: { messageId: string; canvasId: string; role: 'user' | 'assistant'; content: string; actionType?: string; authorId: string }) => void;
}

export function ConversationPanel({
  canvasId,
  activeFrameId,
  activeFrameCode,
  sortedFrames,
  compositionMode,
  onFramesGenerated,
  onFrameUpdated,
  focusPromptTrigger,
  onViewProof,
  onNewMessage,
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [promptPrefill, setPromptPrefill] = useState<string | undefined>();

  const {
    messages,
    loading,
    historyLoading,
    error,
    pendingChange,
    generate,
    edit,
    style,
    approveChange,
    rejectChange,
    clearError,
  } = useCanvasConversation({
    canvasId,
    onFramesGenerated,
    onFrameUpdated,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  // Handle prompt submission from PromptInput
  const handleSubmit = useCallback(
    (prompt: string, mode: ActionMode, options: PromptOptions) => {
      setPromptPrefill(undefined);

      // E8 — Broadcast the user message via WebSocket for real-time sync
      if (onNewMessage) {
        onNewMessage({
          messageId: `local-${Date.now()}`,
          canvasId,
          role: 'user',
          content: prompt,
          actionType: mode,
          authorId: '', // filled by parent from auth context
        });
      }

      if (mode === 'generate') {
        generate(prompt, {
          docRefs: options.docRefs,
          includeMemoryContext: options.includeMemoryContext,
          compositionMode,
          frameContext: activeFrameId || undefined,
        });
      } else if (mode === 'edit' && activeFrameId) {
        edit(prompt, activeFrameId);
      } else if (mode === 'style' && activeFrameId) {
        style(prompt, [activeFrameId]);
      }
    },
    [generate, edit, style, compositionMode, activeFrameId, onNewMessage, canvasId],
  );

  // Approve pending change
  const handleApprove = useCallback(() => {
    approveChange();
    setShowDiff(false);
  }, [approveChange]);

  // Reject and prefill prompt
  const handleRequestChanges = useCallback(() => {
    rejectChange();
    setShowDiff(false);
    setPromptPrefill('Please change: ');
  }, [rejectChange]);

  return (
    <div className="conversation-panel">
      {/* Messages list */}
      <div className="conversation-messages">
        {historyLoading && (
          <div className="conversation-loading">
            <div className="conversation-loading-spinner" />
            <span>Loading conversation...</span>
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="conversation-empty">
            <div className="conversation-empty-icon" aria-hidden="true">
              &#x1F4AC;
            </div>
            <div className="conversation-empty-title">Start a conversation</div>
            <div className="conversation-empty-desc">
              Type a prompt below to generate your first frame, or describe
              changes to the selected frame.
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ConversationMessage
            key={msg.id}
            message={msg}
            hasPendingDiff={
              pendingChange !== null && pendingChange.messageId === msg.id
            }
            onShowDiff={() => setShowDiff(true)}
            onApprove={handleApprove}
            onReject={handleRequestChanges}
            onViewProof={onViewProof}
          />
        ))}

        {/* Loading indicator during AI generation */}
        {loading && (
          <div className="conversation-generating">
            <div className="conversation-generating-spinner" />
            <span className="conversation-generating-text">Generating...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="conversation-error" role="alert">
          <span className="conversation-error-text">{error}</span>
          <button
            className="conversation-error-dismiss"
            onClick={clearError}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {/* Diff preview (when pending change and user clicked "Show Diff") */}
      {pendingChange && showDiff && (
        <FrameDiffPreview
          beforeCode={activeFrameCode}
          afterCode={pendingChange.newFrames[0]?.code || ''}
          actionLabel={pendingChange.actionType}
          onApprove={handleApprove}
          onRequestChanges={handleRequestChanges}
        />
      )}

      {/* Prompt input */}
      <PromptInput
        onSubmit={handleSubmit}
        loading={loading}
        hasActiveFrame={activeFrameId !== null}
        focusTrigger={focusPromptTrigger}
        prefill={promptPrefill}
      />
    </div>
  );
}
