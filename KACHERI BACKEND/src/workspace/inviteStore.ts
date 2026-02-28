// src/workspace/inviteStore.ts
// Store for workspace invite operations.

import { db } from '../db';
import { randomBytes } from 'crypto';
import { createWorkspaceStore } from './store';

// Create a workspace store instance
const workspaceStore = createWorkspaceStore(db);

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Invite {
  id: number;
  workspaceId: string;
  inviteToken: string;
  invitedEmail: string;
  invitedBy: string;
  role: WorkspaceRole;
  status: InviteStatus;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  acceptedBy: string | null;
}

export interface CreateInviteParams {
  workspaceId: string;
  invitedEmail: string;
  invitedBy: string;
  role?: WorkspaceRole;
  expiresInDays?: number;
}

export interface InviteWithWorkspace extends Invite {
  workspaceName: string;
  inviterName?: string;
}

const INVITE_TOKEN_LENGTH = 32;
const DEFAULT_EXPIRY_DAYS = 7;

const INVITE_SELECT_COLS = `
  id, workspace_id AS workspaceId, invite_token AS inviteToken, invited_email AS invitedEmail,
  invited_by AS invitedBy, role, status, created_at AS createdAt, expires_at AS expiresAt,
  accepted_at AS acceptedAt, accepted_by AS acceptedBy
`;

/**
 * Generate a cryptographically secure invite token (URL-safe).
 */
export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_LENGTH).toString('base64url');
}

/**
 * Create a new workspace invite.
 */
export async function createInvite(params: CreateInviteParams): Promise<Invite> {
  const now = Date.now();
  const expiresInMs = (params.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000;
  const expiresAt = now + expiresInMs;
  const token = generateInviteToken();
  const role = params.role ?? 'editor';

  const result = await db.run(
    `INSERT INTO workspace_invites (workspace_id, invite_token, invited_email, invited_by, role, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      params.workspaceId,
      token,
      params.invitedEmail.toLowerCase().trim(),
      params.invitedBy,
      role,
      now,
      expiresAt,
    ]
  );

  return {
    id: Number(result.lastInsertRowid),
    workspaceId: params.workspaceId,
    inviteToken: token,
    invitedEmail: params.invitedEmail.toLowerCase().trim(),
    invitedBy: params.invitedBy,
    role: role as WorkspaceRole,
    status: 'pending',
    createdAt: now,
    expiresAt,
    acceptedAt: null,
    acceptedBy: null,
  };
}

/**
 * Get an invite by its token.
 */
export async function getInviteByToken(token: string): Promise<Invite | null> {
  const row = await db.queryOne<Invite>(
    `SELECT ${INVITE_SELECT_COLS} FROM workspace_invites WHERE invite_token = ?`,
    [token]
  );
  return row ?? null;
}

/**
 * Get an invite by ID.
 */
export async function getInviteById(inviteId: number): Promise<Invite | null> {
  const row = await db.queryOne<Invite>(
    `SELECT ${INVITE_SELECT_COLS} FROM workspace_invites WHERE id = ?`,
    [inviteId]
  );
  return row ?? null;
}

/**
 * Get invite by token with workspace info (for accept page).
 */
export async function getInviteWithWorkspace(token: string): Promise<InviteWithWorkspace | null> {
  const invite = await getInviteByToken(token);
  if (!invite) return null;

  const workspace = await workspaceStore.getById(invite.workspaceId);
  if (!workspace) return null;

  return {
    ...invite,
    workspaceName: workspace.name,
    inviterName: invite.invitedBy, // Could be enhanced with user lookup
  };
}

/**
 * List all invites for a workspace.
 */
export async function listInvites(workspaceId: string): Promise<Invite[]> {
  return db.queryAll<Invite>(
    `SELECT ${INVITE_SELECT_COLS} FROM workspace_invites
     WHERE workspace_id = ?
     ORDER BY created_at DESC`,
    [workspaceId]
  );
}

/**
 * List pending (non-expired) invites for a workspace.
 */
export async function listPendingInvites(workspaceId: string): Promise<Invite[]> {
  const now = Date.now();
  return db.queryAll<Invite>(
    `SELECT ${INVITE_SELECT_COLS} FROM workspace_invites
     WHERE workspace_id = ? AND status = 'pending' AND expires_at > ?
     ORDER BY created_at DESC`,
    [workspaceId, now]
  );
}

/**
 * Accept an invite.
 * Validates: token exists, pending, not expired, email matches (optional check).
 * Returns the workspace if successful.
 */
export async function acceptInvite(
  token: string,
  userId: string,
  userEmail?: string
): Promise<{ success: true; workspaceId: string } | { success: false; error: string }> {
  const invite = await getInviteByToken(token);

  if (!invite) {
    return { success: false, error: 'Invite not found' };
  }

  if (invite.status !== 'pending') {
    return { success: false, error: `Invite has already been ${invite.status}` };
  }

  if (invite.expiresAt < Date.now()) {
    await db.run(
      `UPDATE workspace_invites SET status = ? WHERE id = ?`,
      ['expired', invite.id]
    );
    return { success: false, error: 'Invite has expired' };
  }

  // Optional email validation (if email provided)
  if (userEmail && invite.invitedEmail.toLowerCase() !== userEmail.toLowerCase()) {
    return { success: false, error: 'This invite was sent to a different email address' };
  }

  // Check if user is already a member
  const existingRole = await workspaceStore.getUserRole(invite.workspaceId, userId);
  if (existingRole) {
    // User already a member, just mark invite as accepted
    await db.run(
      `UPDATE workspace_invites SET status = 'accepted', accepted_at = ?, accepted_by = ? WHERE id = ?`,
      [Date.now(), userId, invite.id]
    );
    return { success: true, workspaceId: invite.workspaceId };
  }

  // Add user as member with invited role
  try {
    await workspaceStore.addMember(invite.workspaceId, userId, invite.role);
    await db.run(
      `UPDATE workspace_invites SET status = 'accepted', accepted_at = ?, accepted_by = ? WHERE id = ?`,
      [Date.now(), userId, invite.id]
    );
    return { success: true, workspaceId: invite.workspaceId };
  } catch (err) {
    return { success: false, error: 'Failed to add member to workspace' };
  }
}

/**
 * Revoke an invite (by workspace admin).
 */
export async function revokeInvite(inviteId: number, workspaceId: string): Promise<boolean> {
  const invite = await getInviteById(inviteId);
  if (!invite || invite.workspaceId !== workspaceId) {
    return false;
  }
  if (invite.status !== 'pending') {
    return false;
  }
  await db.run(
    `UPDATE workspace_invites SET status = ? WHERE id = ?`,
    ['revoked', inviteId]
  );
  return true;
}

/**
 * Cleanup expired invites (can be called periodically).
 */
export async function cleanupExpired(): Promise<number> {
  const now = Date.now();
  const result = await db.run(
    `DELETE FROM workspace_invites WHERE status = 'pending' AND expires_at < ?`,
    [now]
  );
  return result.changes;
}

/**
 * Check if an invite is valid (pending and not expired).
 */
export async function isInviteValid(token: string): Promise<boolean> {
  const invite = await getInviteByToken(token);
  if (!invite) return false;
  if (invite.status !== 'pending') return false;
  if (invite.expiresAt < Date.now()) return false;
  return true;
}
