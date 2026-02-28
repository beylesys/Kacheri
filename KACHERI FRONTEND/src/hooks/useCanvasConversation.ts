// KACHERI FRONTEND/src/hooks/useCanvasConversation.ts
// Hook managing conversation state and AI operations for Design Studio Simple Mode.
// Handles generate/edit/style actions, conversation history, diff preview, and approval flow.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 4, Slice C4

import { useState, useCallback, useEffect, useRef } from 'react';
import { canvasAiApi } from '../api/canvasAi';
import type {
  ConversationMessage,
  CanvasFrame,
  GenerateFrameResponse,
  ActionType,
  DocRef,
} from '../types/canvas';

export type ActionMode = 'generate' | 'edit' | 'style';

export interface PendingChange {
  /** The assistant message ID associated with this change */
  messageId: string;
  /** The action that produced this change */
  actionType: ActionType;
  /** The frame(s) returned from the AI */
  newFrames: CanvasFrame[];
  /** The original frame code before the change (for edit/style) */
  beforeCode: string | null;
  /** The response metadata */
  response: GenerateFrameResponse;
}

export interface UseCanvasConversationOptions {
  canvasId: string;
  /** Called when new frames are generated and approved */
  onFramesGenerated: (frames: CanvasFrame[], response: GenerateFrameResponse) => void;
  /** Called when an existing frame is updated and approved (edit/style) */
  onFrameUpdated: (frame: CanvasFrame, response: GenerateFrameResponse) => void;
}

export interface UseCanvasConversationReturn {
  messages: ConversationMessage[];
  loading: boolean;
  historyLoading: boolean;
  error: string | null;
  pendingChange: PendingChange | null;
  generate: (prompt: string, options?: GenerateOptions) => Promise<void>;
  edit: (prompt: string, frameId: string) => Promise<void>;
  style: (prompt: string, frameIds: string[]) => Promise<void>;
  approveChange: () => void;
  rejectChange: () => void;
  clearError: () => void;
}

interface GenerateOptions {
  docRefs?: string[];
  compositionMode?: string;
  includeMemoryContext?: boolean;
  frameContext?: string;
}

export function useCanvasConversation({
  canvasId,
  onFramesGenerated,
  onFrameUpdated,
}: UseCanvasConversationOptions): UseCanvasConversationReturn {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  // Stable references for callbacks used in effects
  const onFramesGeneratedRef = useRef(onFramesGenerated);
  onFramesGeneratedRef.current = onFramesGenerated;
  const onFrameUpdatedRef = useRef(onFrameUpdated);
  onFrameUpdatedRef.current = onFrameUpdated;

  // Load conversation history on mount / canvasId change
  useEffect(() => {
    if (!canvasId) return;

    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const data = await canvasAiApi.getConversation(canvasId, { limit: 100 });
        if (cancelled) return;
        // API returns newest first; reverse for chronological display
        setMessages(data.messages.slice().reverse());
      } catch (err: any) {
        if (cancelled) return;
        console.error('[useCanvasConversation] Failed to load history:', err);
        // Don't set error — history load failure is non-blocking
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [canvasId]);

  const appendUserMessage = useCallback(
    (prompt: string, actionType: ActionType, docRefs?: DocRef[]): string => {
      const id = `local_user_${Date.now()}`;
      const msg: ConversationMessage = {
        id,
        canvasId,
        frameId: null,
        role: 'user',
        content: prompt,
        actionType,
        docRefs: docRefs ?? null,
        proofId: null,
        metadata: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, msg]);
      return id;
    },
    [canvasId],
  );

  const appendAssistantMessage = useCallback(
    (response: GenerateFrameResponse, actionType: ActionType): string => {
      const id = `local_assistant_${Date.now()}`;
      const frameCount = response.frames.length;

      // Use clarification message from AI when present; otherwise generate summary
      const content = response.message
        ? response.message
        : actionType === 'generate'
          ? `Generated ${frameCount} frame${frameCount !== 1 ? 's' : ''}.`
          : actionType === 'edit'
            ? 'Frame updated.'
            : actionType === 'style'
              ? `Restyled ${frameCount} frame${frameCount !== 1 ? 's' : ''}.`
              : 'Done.';

      const msg: ConversationMessage = {
        id,
        canvasId,
        frameId: response.frames[0]?.id ?? null,
        role: 'assistant',
        content,
        actionType,
        docRefs: response.docRefs ?? null,
        proofId: response.proofId,
        metadata: {
          provider: response.provider,
          model: response.model,
          validation: response.validation,
          memoryContextUsed: response.memoryContextUsed,
          memoryEntityCount: response.memoryEntityCount,
          frameCount,
        },
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, msg]);
      return id;
    },
    [canvasId],
  );

  // ── Generate new frames ──
  const generate = useCallback(
    async (prompt: string, options?: GenerateOptions) => {
      if (!prompt.trim() || loading) return;

      setLoading(true);
      setError(null);

      appendUserMessage(prompt, 'generate');

      try {
        const response = await canvasAiApi.generate(canvasId, {
          prompt,
          frameContext: options?.frameContext,
          docRefs: options?.docRefs,
          compositionMode: options?.compositionMode as any,
          includeMemoryContext: options?.includeMemoryContext,
        });

        appendAssistantMessage(response, 'generate');

        // Only call onFramesGenerated when frames were actually generated
        // (skip for clarification responses where AI asked questions)
        if (response.frames.length > 0 && !response.isClarification) {
          onFramesGeneratedRef.current(response.frames, response);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to generate frames');
      } finally {
        setLoading(false);
      }
    },
    [canvasId, loading, appendUserMessage, appendAssistantMessage],
  );

  // ── Edit existing frame ──
  const edit = useCallback(
    async (prompt: string, frameId: string) => {
      if (!prompt.trim() || loading) return;

      setLoading(true);
      setError(null);

      appendUserMessage(prompt, 'edit');

      try {
        const response = await canvasAiApi.edit(canvasId, {
          prompt,
          frameId,
        });

        const msgId = appendAssistantMessage(response, 'edit');

        // Edit shows diff — store as pending change
        setPendingChange({
          messageId: msgId,
          actionType: 'edit',
          newFrames: response.frames,
          beforeCode: null, // Caller should provide via frame state; we don't have it here
          response,
        });
      } catch (err: any) {
        setError(err?.message || 'Failed to edit frame');
      } finally {
        setLoading(false);
      }
    },
    [canvasId, loading, appendUserMessage, appendAssistantMessage],
  );

  // ── Style frames ──
  const style = useCallback(
    async (prompt: string, frameIds: string[]) => {
      if (!prompt.trim() || loading || frameIds.length === 0) return;

      setLoading(true);
      setError(null);

      appendUserMessage(prompt, 'style');

      try {
        const response = await canvasAiApi.style(canvasId, {
          prompt,
          frameIds,
        });

        const msgId = appendAssistantMessage(response, 'style');

        setPendingChange({
          messageId: msgId,
          actionType: 'style',
          newFrames: response.frames,
          beforeCode: null,
          response,
        });
      } catch (err: any) {
        setError(err?.message || 'Failed to style frames');
      } finally {
        setLoading(false);
      }
    },
    [canvasId, loading, appendUserMessage, appendAssistantMessage],
  );

  // ── Approve pending change ──
  const approveChange = useCallback(() => {
    if (!pendingChange) return;

    const { actionType, newFrames, response } = pendingChange;

    if (actionType === 'generate') {
      onFramesGeneratedRef.current(newFrames, response);
    } else {
      // edit or style — update existing frames
      for (const frame of newFrames) {
        onFrameUpdatedRef.current(frame, response);
      }
    }

    setPendingChange(null);
  }, [pendingChange]);

  // ── Reject pending change ──
  const rejectChange = useCallback(() => {
    setPendingChange(null);
  }, []);

  // ── Clear error ──
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
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
  };
}
