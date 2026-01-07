// src/hooks/useWorkspaceSocket.ts
import { useEffect, useMemo, useRef, useState } from 'react';

export type PresenceStatus = 'online' | 'idle' | 'offline';
export type ComposeKind = 'compose' | 'export' | 'rewrite';
export type ComposePhase = 'started' | 'progress' | 'finished' | 'failed';

export type CommentAction = 'created' | 'updated' | 'deleted' | 'resolved' | 'reopened';
export type VersionAction = 'created' | 'renamed' | 'deleted' | 'restored';
export type SuggestionAction = 'created' | 'updated' | 'accepted' | 'rejected' | 'deleted' | 'accepted_all' | 'rejected_all';
export type MessageAction = 'created' | 'updated' | 'deleted';
export type NotificationType = 'mention' | 'comment_reply' | 'doc_shared' | 'suggestion_pending';

export type WsEvent =
  | { type: 'presence'; userId: string; displayName?: string; status: PresenceStatus }
  | { type: 'ai_job'; jobId: string; docId?: string; kind: ComposeKind; phase: ComposePhase; meta?: Record<string, unknown> }
  | { type: 'proof_added'; docId: string; proofId?: string; sha256: string; ts: number }
  | { type: 'comment'; action: CommentAction; docId: string; commentId: number; threadId: string | null; authorId: string; content?: string; ts: number }
  | { type: 'version'; action: VersionAction; docId: string; versionId: number; versionNumber: number; name: string | null; createdBy: string; ts: number }
  | { type: 'suggestion'; action: SuggestionAction; docId: string; suggestionId?: number; authorId: string; changeType?: 'insert' | 'delete' | 'replace'; status?: 'pending' | 'accepted' | 'rejected'; count?: number; ts: number }
  | { type: 'message'; action: MessageAction; messageId: number; authorId: string; content?: string; replyToId?: number | null; ts: number }
  | { type: 'notification'; notificationId: number; userId: string; notificationType: NotificationType; title: string; ts: number }
  | { type: 'typing'; userId: string; isTyping: boolean; ts: number }
  | { type: 'system'; level: 'info' | 'warn' | 'error'; message: string };

export type Member = { userId: string; displayName?: string; status: PresenceStatus };
export type TypingUser = { userId: string; displayName?: string };

type Params = { userId?: string; displayName?: string };

const HEARTBEAT_MS = 20_000;
const TYPING_TIMEOUT_MS = 3000; // Auto-expire typing indicator after 3 seconds

export function useWorkspaceSocket(workspaceId: string, params?: Params) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(1000);
  const heartbeatRef = useRef<number | null>(null);
  const typingTimeoutsRef = useRef<Map<string, number>>(new Map());

  const url = useMemo(() => {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.displayName) qs.set('displayName', params.displayName);
    return `${proto}//${loc.host}/workspace/${encodeURIComponent(workspaceId)}?${qs.toString()}`;
  }, [workspaceId, params?.userId, params?.displayName]);

  useEffect(() => {
    let cancelled = false;

    function pushEvent(e: WsEvent) {
      setEvents((prev) => [e, ...prev].slice(0, 200));
    }

    function applyPresence(u: { userId: string; displayName?: string; status: PresenceStatus }) {
      setMembers((prev) => {
        const map = new Map(prev.map(m => [m.userId, m]));
        map.set(u.userId, { userId: u.userId, displayName: u.displayName ?? u.userId, status: u.status });
        return Array.from(map.values());
      });
    }

    function applyTyping(userId: string, displayName: string | undefined, isTyping: boolean) {
      // Clear any existing timeout for this user
      const existingTimeout = typingTimeoutsRef.current.get(userId);
      if (existingTimeout != null) {
        window.clearTimeout(existingTimeout);
        typingTimeoutsRef.current.delete(userId);
      }

      if (isTyping) {
        // Add user to typing list
        setTypingUsers((prev) => {
          if (prev.some(t => t.userId === userId)) return prev;
          return [...prev, { userId, displayName }];
        });

        // Set auto-expire timeout
        const timeoutId = window.setTimeout(() => {
          setTypingUsers((prev) => prev.filter(t => t.userId !== userId));
          typingTimeoutsRef.current.delete(userId);
        }, TYPING_TIMEOUT_MS);
        typingTimeoutsRef.current.set(userId, timeoutId);
      } else {
        // Remove user from typing list
        setTypingUsers((prev) => prev.filter(t => t.userId !== userId));
      }
    }

    function startHeartbeat() {
      stopHeartbeat();
      heartbeatRef.current = window.setInterval(() => {
        sendPresence('online');
      }, HEARTBEAT_MS) as unknown as number;
    }

    function stopHeartbeat() {
      if (heartbeatRef.current != null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    }

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        retryRef.current = 1000;
        // Initial presence so others see you.
        sendPresence('online');
        startHeartbeat();
        pushEvent({ type: 'system', level: 'info', message: 'connected to workspace' });
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));

          switch (msg?.type) {
            case 'status': {
              pushEvent({ type: 'system', level: 'info', message: String(msg.text ?? '') });
              break;
            }
            case 'presence': {
              const u = {
                userId: String(msg.userId ?? ''),
                displayName: msg.displayName ? String(msg.displayName) : undefined,
                status: (msg.status as PresenceStatus) || 'online',
              };
              applyPresence(u);
              pushEvent({ type: 'presence', ...u });
              break;
            }
            case 'compose_started':
            case 'compose_finished': {
              const phase: ComposePhase = msg.type === 'compose_started' ? 'started' : 'finished';
              pushEvent({
                type: 'ai_job',
                jobId: String(msg.jobId ?? ''),
                docId: msg.docId ? String(msg.docId) : undefined,
                kind: 'compose',
                phase,
                meta: msg.meta ?? undefined,
              });
              break;
            }
            case 'ai_job': {
              const kind: ComposeKind = (msg.kind as ComposeKind) ?? 'compose';
              const phase: ComposePhase = (msg.phase as ComposePhase) ?? 'finished';
              pushEvent({
                type: 'ai_job',
                jobId: String(msg.jobId ?? ''),
                docId: msg.docId ? String(msg.docId) : undefined,
                kind,
                phase,
                meta: msg.meta ?? undefined,
              });
              break;
            }
            case 'proof_added': {
              pushEvent({
                type: 'proof_added',
                docId: msg.docId ? String(msg.docId) : '',
                proofId: msg.proofId ? String(msg.proofId) : undefined,
                sha256: String(msg.sha256 ?? ''),
                ts: Number(msg.ts ?? Date.now()),
              });
              break;
            }
            case 'comment': {
              pushEvent({
                type: 'comment',
                action: (msg.action as CommentAction) ?? 'created',
                docId: String(msg.docId ?? ''),
                commentId: Number(msg.commentId),
                threadId: msg.threadId ? String(msg.threadId) : null,
                authorId: String(msg.authorId ?? ''),
                content: msg.content ? String(msg.content) : undefined,
                ts: Number(msg.ts ?? Date.now()),
              });
              break;
            }
            case 'version': {
              pushEvent({
                type: 'version',
                action: (msg.action as VersionAction) ?? 'created',
                docId: String(msg.docId ?? ''),
                versionId: Number(msg.versionId),
                versionNumber: Number(msg.versionNumber),
                name: msg.name ? String(msg.name) : null,
                createdBy: String(msg.createdBy ?? ''),
                ts: Number(msg.ts ?? Date.now()),
              });
              break;
            }
            case 'suggestion': {
              pushEvent({
                type: 'suggestion',
                action: (msg.action as SuggestionAction) ?? 'created',
                docId: String(msg.docId ?? ''),
                suggestionId: msg.suggestionId != null ? Number(msg.suggestionId) : undefined,
                authorId: String(msg.authorId ?? ''),
                changeType: msg.changeType ? (msg.changeType as 'insert' | 'delete' | 'replace') : undefined,
                status: msg.status ? (msg.status as 'pending' | 'accepted' | 'rejected') : undefined,
                count: msg.count != null ? Number(msg.count) : undefined,
                ts: Number(msg.ts ?? Date.now()),
              });
              break;
            }
            case 'chat': {
              const who = msg.userId ? String(msg.userId) : 'user';
              const text = String(msg.text ?? '');
              pushEvent({ type: 'system', level: 'info', message: `${who}: ${text}` });
              break;
            }
            case 'message': {
              pushEvent({
                type: 'message',
                action: (msg.action as MessageAction) ?? 'created',
                messageId: Number(msg.messageId),
                authorId: String(msg.authorId ?? ''),
                content: msg.content ? String(msg.content) : undefined,
                replyToId: msg.replyToId != null ? Number(msg.replyToId) : null,
                ts: Number(msg.ts ?? Date.now()),
              });
              break;
            }
            case 'notification': {
              pushEvent({
                type: 'notification',
                notificationId: Number(msg.notificationId),
                userId: String(msg.userId ?? ''),
                notificationType: (msg.notificationType as NotificationType) ?? 'mention',
                title: String(msg.title ?? ''),
                ts: Number(msg.ts ?? Date.now()),
              });
              break;
            }
            case 'typing': {
              const userId = String(msg.userId ?? '');
              const isTyping = Boolean(msg.isTyping);
              // Find display name from members list
              const member = members.find(m => m.userId === userId);
              applyTyping(userId, member?.displayName, isTyping);
              pushEvent({
                type: 'typing',
                userId,
                isTyping,
                ts: Number(msg.ts ?? Date.now()),
              });
              break;
            }
            default: {
              if (msg && typeof msg === 'object' && msg.type) {
                pushEvent({ type: 'system', level: 'info', message: `event: ${String(msg.type)}` });
              }
            }
          }
        } catch {
          // ignore non-JSON or malformed frames
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        stopHeartbeat();
        setTimeout(connect, retryRef.current);
        retryRef.current = Math.min(10_000, Math.round(retryRef.current * 1.5));
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (heartbeatRef.current != null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      // Clear all typing timeouts
      for (const timeoutId of typingTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      typingTimeoutsRef.current.clear();
      setTypingUsers([]);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  function sendPresence(status: PresenceStatus) {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'presence', status }));
    } catch {
      /* no-op */
    }
  }

  function setPresence(status: PresenceStatus) {
    sendPresence(status);
  }

  function sendChat(text: string) {
    const msg = String(text ?? '').trim();
    if (!msg) return;
    try {
      wsRef.current?.send(JSON.stringify({ type: 'chat', text: msg }));
    } catch {
      /* no-op */
    }
  }

  function sendTyping(isTyping: boolean) {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'typing', isTyping }));
    } catch {
      /* no-op */
    }
  }

  function emit(_msg: WsEvent) {
    // Client side emit is intentionally no-op except presence/chat.
  }

  return { connected, events, members, typingUsers, sendPresence, setPresence, sendChat, sendTyping, emit };
}
