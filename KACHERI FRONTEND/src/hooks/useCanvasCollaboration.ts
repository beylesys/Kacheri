// src/hooks/useCanvasCollaboration.ts
// E8 — Real-Time Canvas Collaboration hook
// Manages canvas-level presence, frame-level locks, and conversation sync
// via the existing workspace WebSocket connection.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsEvent } from './useWorkspaceSocket';

// ── Types ──────────────────────────────────────────────

export interface CanvasViewer {
  userId: string;
  displayName?: string;
  frameId: string | null;
  action: 'viewing' | 'editing' | 'left';
}

export interface FrameLockInfo {
  userId: string;
  displayName?: string;
  acquiredAt: number;
}

export interface CanvasConversationMessage {
  messageId: string;
  canvasId: string;
  role: 'user' | 'assistant';
  content: string;
  actionType?: string;
  authorId: string;
  ts: number;
}

export interface UseCanvasCollaborationOptions {
  canvasId: string;
  userId: string;
  displayName: string;
  /** Send arbitrary JSON via WebSocket (from useWorkspaceSocket.sendRaw) */
  sendRaw: (msg: Record<string, unknown>) => void;
  /** Latest WS events (from useWorkspaceSocket.events) */
  events: WsEvent[];
}

export interface UseCanvasCollaborationReturn {
  /** Other users viewing this canvas (excludes current user) */
  canvasViewers: CanvasViewer[];
  /** Frame locks keyed by frameId */
  frameLocks: Map<string, FrameLockInfo>;
  /** Frame the current user has locked (null if none) */
  myLockedFrameId: string | null;
  /** Incoming conversation messages from other users */
  incomingMessages: CanvasConversationMessage[];
  /** Acquire a frame lock */
  acquireLock: (frameId: string) => void;
  /** Release a frame lock */
  releaseLock: (frameId: string) => void;
  /** Update which frame the current user is focused on */
  updateFrameFocus: (frameId: string | null) => void;
  /** Broadcast a conversation message to other canvas viewers */
  broadcastConversationMessage: (msg: Omit<CanvasConversationMessage, 'ts'>) => void;
  /** Clear incoming messages (after processing) */
  clearIncomingMessages: () => void;
}

// ── Constants ──────────────────────────────────────────

const LOCK_REFRESH_MS = 45_000; // Re-acquire own lock before server's 60s timeout

// ── Hook ───────────────────────────────────────────────

export function useCanvasCollaboration({
  canvasId,
  userId,
  displayName,
  sendRaw,
  events,
}: UseCanvasCollaborationOptions): UseCanvasCollaborationReturn {
  const [canvasViewers, setCanvasViewers] = useState<CanvasViewer[]>([]);
  const [frameLocks, setFrameLocks] = useState<Map<string, FrameLockInfo>>(new Map());
  const [myLockedFrameId, setMyLockedFrameId] = useState<string | null>(null);
  const [incomingMessages, setIncomingMessages] = useState<CanvasConversationMessage[]>([]);

  const lockRefreshRef = useRef<number | null>(null);
  const myLockedFrameRef = useRef<string | null>(null);
  const processedEventCountRef = useRef(0);

  // Keep ref in sync
  myLockedFrameRef.current = myLockedFrameId;

  // ── Join / Leave canvas ──

  useEffect(() => {
    sendRaw({ type: 'canvas_join', canvasId });

    return () => {
      // Release lock on unmount
      if (myLockedFrameRef.current) {
        sendRaw({ type: 'canvas_lock_request', canvasId, frameId: myLockedFrameRef.current, action: 'release' });
      }
      sendRaw({ type: 'canvas_leave' });
      // Clear state
      setCanvasViewers([]);
      setFrameLocks(new Map());
      setMyLockedFrameId(null);
      setIncomingMessages([]);
      processedEventCountRef.current = 0;
    };
  }, [canvasId, sendRaw]);

  // ── Lock refresh interval ──

  useEffect(() => {
    if (myLockedFrameId) {
      lockRefreshRef.current = window.setInterval(() => {
        if (myLockedFrameRef.current) {
          sendRaw({ type: 'canvas_lock_request', canvasId, frameId: myLockedFrameRef.current, action: 'acquire' });
        }
      }, LOCK_REFRESH_MS);
    } else {
      if (lockRefreshRef.current != null) {
        window.clearInterval(lockRefreshRef.current);
        lockRefreshRef.current = null;
      }
    }

    return () => {
      if (lockRefreshRef.current != null) {
        window.clearInterval(lockRefreshRef.current);
        lockRefreshRef.current = null;
      }
    };
  }, [myLockedFrameId, canvasId, sendRaw]);

  // ── Process incoming WS events ──

  useEffect(() => {
    // Process only new events (events array is prepended, newest first)
    const newCount = events.length;
    const prevCount = processedEventCountRef.current;

    if (newCount <= prevCount) {
      // Events were truncated or reset — reprocess all
      processedEventCountRef.current = 0;
    }

    const toProcess = newCount - processedEventCountRef.current;
    if (toProcess <= 0) return;

    // New events are at indices 0..toProcess-1 (newest first)
    for (let i = toProcess - 1; i >= 0; i--) {
      const ev = events[i];

      if (ev.type === 'canvas_presence' && ev.canvasId === canvasId && ev.userId !== userId) {
        setCanvasViewers((prev) => {
          if (ev.action === 'left') {
            return prev.filter((v) => v.userId !== ev.userId);
          }
          const map = new Map(prev.map((v) => [v.userId, v]));
          map.set(ev.userId, {
            userId: ev.userId,
            displayName: ev.displayName,
            frameId: ev.frameId,
            action: ev.action,
          });
          return Array.from(map.values());
        });
      }

      if (ev.type === 'canvas_lock' && ev.canvasId === canvasId) {
        setFrameLocks((prev) => {
          const next = new Map(prev);
          if (ev.action === 'acquired') {
            next.set(ev.frameId, {
              userId: ev.userId,
              displayName: ev.displayName,
              acquiredAt: ev.ts,
            });
          } else if (ev.action === 'released') {
            next.delete(ev.frameId);
          }
          // 'denied' — no state change needed (handled at request time)
          return next;
        });

        // Track own lock state
        if (ev.userId === userId) {
          if (ev.action === 'acquired') {
            setMyLockedFrameId(ev.frameId);
          } else if (ev.action === 'released') {
            setMyLockedFrameId((prev) => (prev === ev.frameId ? null : prev));
          }
        }

        // If denied, clear optimistic lock
        if (ev.action === 'denied' && ev.userId !== userId) {
          // The denied event means someone else holds the lock, no-op needed for current user
        }
      }

      if (ev.type === 'canvas_conversation' && ev.canvasId === canvasId && ev.authorId !== userId) {
        setIncomingMessages((prev) => [
          ...prev,
          {
            messageId: ev.messageId,
            canvasId: ev.canvasId,
            role: ev.role,
            content: ev.content,
            actionType: ev.actionType,
            authorId: ev.authorId,
            ts: ev.ts,
          },
        ]);
      }
    }

    processedEventCountRef.current = newCount;
  }, [events, canvasId, userId]);

  // ── Actions ──

  const acquireLock = useCallback(
    (frameId: string) => {
      sendRaw({ type: 'canvas_lock_request', canvasId, frameId, action: 'acquire' });
    },
    [canvasId, sendRaw],
  );

  const releaseLock = useCallback(
    (frameId: string) => {
      sendRaw({ type: 'canvas_lock_request', canvasId, frameId, action: 'release' });
      setMyLockedFrameId((prev) => (prev === frameId ? null : prev));
    },
    [canvasId, sendRaw],
  );

  const updateFrameFocus = useCallback(
    (frameId: string | null) => {
      sendRaw({ type: 'canvas_frame_focus', canvasId, frameId });
    },
    [canvasId, sendRaw],
  );

  const broadcastConversationMessage = useCallback(
    (msg: Omit<CanvasConversationMessage, 'ts'>) => {
      sendRaw({
        type: 'canvas_conversation',
        ...msg,
        ts: Date.now(),
      } as Record<string, unknown>);
    },
    [sendRaw],
  );

  const clearIncomingMessages = useCallback(() => {
    setIncomingMessages([]);
  }, []);

  return {
    canvasViewers,
    frameLocks,
    myLockedFrameId,
    incomingMessages,
    acquireLock,
    releaseLock,
    updateFrameFocus,
    broadcastConversationMessage,
    clearIncomingMessages,
  };
}
