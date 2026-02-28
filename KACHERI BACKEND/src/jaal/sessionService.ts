// KACHERI BACKEND/src/jaal/sessionService.ts
// JAAL Session Service: Research session lifecycle management — Slice S5

import { JaalSessionStore } from "../store/jaalSessions";
import type { JaalSession } from "../store/jaalSessions";
import { logAuditEvent } from "../store/audit";

/* ---------- Session Lifecycle ---------- */

/** Start a new research session */
export async function startSession(
  workspaceId: string,
  userId: string,
): Promise<JaalSession> {
  const session = await JaalSessionStore.create({ workspaceId, userId });

  logAuditEvent({
    workspaceId,
    actorId: userId,
    action: "jaal:session_start",
    targetType: "jaal_session",
    targetId: session.id,
  });

  return session;
}

/** End a research session. Verifies user ownership. */
export async function endSession(
  sessionId: string,
  userId: string,
): Promise<JaalSession | null> {
  const session = await JaalSessionStore.getById(sessionId);
  if (!session) return null;

  // Verify ownership
  if (session.userId !== userId) return null;

  // Already ended — return as-is
  if (session.status !== "active") return session;

  const updated = await JaalSessionStore.update(sessionId, { status: "ended" });

  if (updated) {
    logAuditEvent({
      workspaceId: session.workspaceId,
      actorId: userId,
      action: "jaal:session_end",
      targetType: "jaal_session",
      targetId: sessionId,
      details: { actionCount: updated.actionCount },
    });
  }

  return updated;
}

/** Update session metadata. Verifies user ownership. */
export async function updateSession(
  sessionId: string,
  userId: string,
  updates: { metadata?: Record<string, unknown> },
): Promise<JaalSession | null> {
  const session = await JaalSessionStore.getById(sessionId);
  if (!session) return null;

  // Verify ownership
  if (session.userId !== userId) return null;

  return JaalSessionStore.update(sessionId, {
    metadata: updates.metadata,
  });
}

/** Get session by ID */
export async function getSession(id: string): Promise<JaalSession | null> {
  return JaalSessionStore.getById(id);
}

/** List sessions for a user in a workspace */
export async function listSessions(
  userId: string,
  workspaceId?: string,
): Promise<JaalSession[]> {
  if (!workspaceId) return [];

  return JaalSessionStore.listByWorkspace(workspaceId, { userId });
}
