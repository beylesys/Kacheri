// src/realtime/globalHub.ts
import type { WorkspaceHub, WorkspaceServerEvent } from './types';

let _hub: WorkspaceHub | null = null;

// Track which workspaces a user is connected to
const userWorkspaces: Map<string, Set<string>> = new Map();

export function setWorkspaceHub(hub: WorkspaceHub) {
  _hub = hub;
}

export function getWorkspaceHub(): WorkspaceHub | null {
  return _hub;
}

/** Track user joining a workspace (called by workspaceWs on join) */
export function trackUserWorkspace(userId: string, workspaceId: string): void {
  if (!userWorkspaces.has(userId)) {
    userWorkspaces.set(userId, new Set());
  }
  userWorkspaces.get(userId)!.add(workspaceId);
}

/** Untrack user leaving a workspace (called by workspaceWs on leave) */
export function untrackUserWorkspace(userId: string, workspaceId: string): void {
  const workspaces = userWorkspaces.get(userId);
  if (workspaces) {
    workspaces.delete(workspaceId);
    if (workspaces.size === 0) {
      userWorkspaces.delete(userId);
    }
  }
}

/** Safe broadcast (no-op if hub not yet installed) */
export function wsBroadcast(workspaceId: string, msg: WorkspaceServerEvent): void {
  try {
    _hub?.broadcast(workspaceId, msg);
  } catch {
    // swallow; keep server resilient
  }
}

/** Safe canvas-scoped broadcast (no-op if hub not yet installed) — E8 */
export function wsBroadcastToCanvas(workspaceId: string, canvasId: string, msg: WorkspaceServerEvent): void {
  try {
    _hub?.broadcastToCanvas(workspaceId, canvasId, msg);
  } catch {
    // swallow; keep server resilient
  }
}

/** Broadcast to a specific user across all their workspace connections */
export function broadcastToUser(userId: string, msg: WorkspaceServerEvent): void {
  if (!_hub) return;

  try {
    const workspaces = userWorkspaces.get(userId);
    if (!workspaces) return;

    for (const workspaceId of workspaces) {
      const members = _hub.getMembers(workspaceId);
      for (const member of members) {
        if (member.userId === userId) {
          try {
            member.ws.send(JSON.stringify(msg));
          } catch {
            // swallow send errors
          }
        }
      }
    }
  } catch {
    // swallow; keep server resilient
  }
}
