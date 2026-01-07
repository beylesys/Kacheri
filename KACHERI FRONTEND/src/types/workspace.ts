// src/types/workspace.ts
// Types shared by the workspace WebSocket client and UI.

export type PresenceUser = {
  userId: string;
  name?: string;
};

export type PresencePayload = {
  users: PresenceUser[];
};

export type ComposePhase = 'started' | 'finished';

export type WorkspaceInboundEvent =
  // Server can send high-level status lines
  | { type: 'status'; text: string }
  // Presence snapshot or delta
  | { type: 'presence'; users: PresenceUser[] }
  // Some repos emit granular compose_*; others emit a single ai_job event.
  | { type: 'compose_started'; jobId: string; docId?: string; meta?: unknown }
  | { type: 'compose_finished'; jobId: string; docId?: string; meta?: unknown }
  | { type: 'ai_job'; phase: ComposePhase; jobId: string; docId?: string; meta?: unknown }
  // Proof events (export, rewrite, compose approvals, etc.)
  | { type: 'proof_added'; proofId: string; docId?: string; summary?: string }
  // Lightweight chat/system note
  | { type: 'chat'; userId: string; text: string; ts: number };

export type WorkspaceOutboundEvent =
  | { type: 'join'; userId: string }
  | { type: 'leave'; userId: string }
  | { type: 'presence'; state: 'active' | 'idle' | 'away' }
  | { type: 'chat'; text: string };

export type WorkspaceSocketHandlers = {
  open?: () => void;
  close?: (ev?: CloseEvent) => void;
  error?: (ev?: Event) => void;

  status?: (text: string) => void;
  presence?: (payload: PresencePayload) => void;

  // Normalized compose progress
  compose?: (phase: ComposePhase, jobId: string, docId?: string, meta?: unknown) => void;

  proofAdded?: (proofId: string, docId?: string, summary?: string) => void;
  chat?: (userId: string, text: string, ts: number) => void;

  // Raw passthrough for debugging
  raw?: (e: unknown) => void;
};
