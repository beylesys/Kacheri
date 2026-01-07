// src/realtime/types.ts
import type { WebSocket } from 'ws';

export type PresenceStatus = 'online' | 'idle' | 'offline';

export type NotificationType = 'mention' | 'comment_reply' | 'doc_shared' | 'suggestion_pending';

export type WorkspaceServerEvent =
  | { type: 'presence'; userId: string; displayName?: string; status: PresenceStatus }
  | { type: 'ai_job'; jobId: string; docId?: string; kind: 'compose' | 'export' | 'rewrite' | 'translate' | 'detectFields'; phase: 'started' | 'progress' | 'finished' | 'failed'; meta?: Record<string, unknown> }
  | { type: 'proof_added'; docId: string; proofId?: string; sha256: string; ts: number }
  | { type: 'system'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'comment'; action: 'created' | 'updated' | 'deleted' | 'resolved' | 'reopened'; docId: string; commentId: number; threadId: string | null; authorId: string; content?: string; ts: number }
  | { type: 'version'; action: 'created' | 'renamed' | 'deleted' | 'restored'; docId: string; versionId: number; versionNumber: number; name: string | null; createdBy: string; ts: number }
  | { type: 'suggestion'; action: 'created' | 'updated' | 'accepted' | 'rejected' | 'deleted' | 'accepted_all' | 'rejected_all'; docId: string; suggestionId?: number; authorId: string; changeType?: 'insert' | 'delete' | 'replace'; status?: 'pending' | 'accepted' | 'rejected'; count?: number; ts: number }
  | { type: 'message'; action: 'created' | 'updated' | 'deleted'; messageId: number; authorId: string; content?: string; replyToId?: number | null; ts: number }
  | { type: 'notification'; notificationId: number; userId: string; notificationType: NotificationType; title: string; ts: number }
  | { type: 'typing'; userId: string; isTyping: boolean; ts: number };

export type WorkspaceClientEvent =
  | { type: 'hello'; userId?: string; displayName?: string }
  | { type: 'presence'; status: PresenceStatus }
  | { type: 'typing'; isTyping: boolean };

export interface ClientInfo {
  ws: WebSocket;
  workspaceId: string;
  userId?: string;
  displayName?: string;
  status: PresenceStatus;
  lastSeen: number;
}

export interface WorkspaceHub {
  join(workspaceId: string, ws: WebSocket, initial?: Partial<Omit<ClientInfo, 'ws' | 'workspaceId' | 'status' | 'lastSeen'>>): void;
  leave(ws: WebSocket): void;
  broadcast(workspaceId: string, msg: WorkspaceServerEvent, except?: WebSocket): void;
  getMembers(workspaceId: string): ClientInfo[];
}
