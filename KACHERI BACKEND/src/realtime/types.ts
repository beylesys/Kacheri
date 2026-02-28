// src/realtime/types.ts
import type { WebSocket } from 'ws';

export type PresenceStatus = 'online' | 'idle' | 'offline';

export type NotificationType = 'mention' | 'comment_reply' | 'doc_shared' | 'suggestion_pending' | 'reminder' | 'review_assigned' | 'canvas_shared' | 'ai_generation_complete' | 'export_complete' | 'frame_lock_requested'
  // S14 — Cross-Product Notification Bridge
  | 'cross_product:entity_update' | 'cross_product:entity_conflict' | 'cross_product:new_connection';

export type WorkspaceServerEvent =
  | { type: 'presence'; userId: string; displayName?: string; status: PresenceStatus }
  | { type: 'ai_job'; jobId: string; docId?: string; kind: 'compose' | 'export' | 'rewrite' | 'translate' | 'detectFields' | 'extraction' | 'compliance_check' | 'knowledge_index' | 'negotiation_import' | 'negotiation_analyze' | 'negotiation_counterproposal'; phase: 'started' | 'progress' | 'finished' | 'failed'; meta?: Record<string, unknown> }
  | { type: 'proof_added'; docId: string; proofId?: string; sha256: string; ts: number }
  | { type: 'system'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'comment'; action: 'created' | 'updated' | 'deleted' | 'resolved' | 'reopened' | 'bulk_resolved'; docId: string; commentId: number; threadId: string | null; authorId: string; content?: string; ts: number }
  | { type: 'version'; action: 'created' | 'renamed' | 'deleted' | 'restored'; docId: string; versionId: number; versionNumber: number; name: string | null; createdBy: string; ts: number }
  | { type: 'suggestion'; action: 'created' | 'updated' | 'accepted' | 'rejected' | 'deleted' | 'accepted_all' | 'rejected_all'; docId: string; suggestionId?: number; authorId: string; changeType?: 'insert' | 'delete' | 'replace'; status?: 'pending' | 'accepted' | 'rejected'; count?: number; ts: number }
  | { type: 'message'; action: 'created' | 'updated' | 'deleted'; messageId: number; authorId: string; content?: string; replyToId?: number | null; ts: number }
  | { type: 'notification'; notificationId: number; userId: string; notificationType: NotificationType; title: string; ts: number }
  | { type: 'typing'; userId: string; isTyping: boolean; ts: number }
  | { type: 'negotiation'; action: 'session_created' | 'session_updated' | 'session_deleted' | 'round_created' | 'round_imported' | 'change_updated' | 'changes_analyzed' | 'changes_bulk_accepted' | 'changes_bulk_rejected' | 'settled' | 'abandoned'; sessionId: string; docId: string; userId: string; meta?: Record<string, unknown>; ts: number }
  | { type: 'doc_link'; action: 'created' | 'deleted'; fromDocId: string; toDocId: string; linkId: number; authorId: string; ts: number }
  | { type: 'doc_links'; action: 'synced'; docId: string; added: number; removed: number; total: number; authorId: string; ts: number }
  | { type: 'attachment'; action: 'uploaded' | 'deleted'; docId: string; attachmentId: string; filename: string; uploadedBy: string; ts: number }
  | { type: 'reviewer'; action: 'assigned' | 'status_changed' | 'removed'; docId: string; userId: string; assignedBy?: string; status?: string; ts: number }
  // E8 — Real-Time Canvas Collaboration
  | { type: 'canvas_presence'; canvasId: string; frameId: string | null; userId: string; displayName?: string; action: 'viewing' | 'editing' | 'left'; ts: number }
  | { type: 'canvas_lock'; canvasId: string; frameId: string; userId: string; displayName?: string; action: 'acquired' | 'released' | 'denied'; ts: number }
  | { type: 'canvas_conversation'; canvasId: string; messageId: string; role: 'user' | 'assistant'; content: string; actionType?: string; authorId: string; ts: number };

export type WorkspaceClientEvent =
  | { type: 'hello'; userId?: string; displayName?: string }
  | { type: 'presence'; status: PresenceStatus }
  | { type: 'typing'; isTyping: boolean }
  // E8 — Real-Time Canvas Collaboration
  | { type: 'canvas_join'; canvasId: string }
  | { type: 'canvas_leave' }
  | { type: 'canvas_frame_focus'; canvasId: string; frameId: string | null }
  | { type: 'canvas_lock_request'; canvasId: string; frameId: string; action: 'acquire' | 'release' };

export interface ClientInfo {
  ws: WebSocket;
  workspaceId: string;
  userId?: string;
  displayName?: string;
  status: PresenceStatus;
  lastSeen: number;
  // E8 — Canvas collaboration context
  canvasId?: string;
  focusedFrameId?: string | null;
}

export interface FrameLock {
  userId: string;
  displayName: string;
  acquiredAt: number;
}

export interface WorkspaceHub {
  join(workspaceId: string, ws: WebSocket, initial?: Partial<Omit<ClientInfo, 'ws' | 'workspaceId' | 'status' | 'lastSeen'>>): void;
  leave(ws: WebSocket): void;
  broadcast(workspaceId: string, msg: WorkspaceServerEvent, except?: WebSocket): void;
  broadcastToCanvas(workspaceId: string, canvasId: string, msg: WorkspaceServerEvent, except?: WebSocket): void;
  getMembers(workspaceId: string): ClientInfo[];
  getCanvasViewers(workspaceId: string, canvasId: string): ClientInfo[];
  getFrameLocks(): Map<string, FrameLock>;
}
