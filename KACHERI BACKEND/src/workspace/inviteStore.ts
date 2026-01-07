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

/**
 * Generate a cryptographically secure invite token (URL-safe).
 */
export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_LENGTH).toString('base64url');
}

// Prepared statements
const insertInvite = db.prepare(`
  INSERT INTO workspace_invites (workspace_id, invite_token, invited_email, invited_by, role, status, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
`);

const selectByToken = db.prepare(`
  SELECT id, workspace_id AS workspaceId, invite_token AS inviteToken, invited_email AS invitedEmail,
         invited_by AS invitedBy, role, status, created_at AS createdAt, expires_at AS expiresAt,
         accepted_at AS acceptedAt, accepted_by AS acceptedBy
  FROM workspace_invites
  WHERE invite_token = ?
`);

const selectByWorkspace = db.prepare(`
  SELECT id, workspace_id AS workspaceId, invite_token AS inviteToken, invited_email AS invitedEmail,
         invited_by AS invitedBy, role, status, created_at AS createdAt, expires_at AS expiresAt,
         accepted_at AS acceptedAt, accepted_by AS acceptedBy
  FROM workspace_invites
  WHERE workspace_id = ?
  ORDER BY created_at DESC
`);

const selectPendingByWorkspace = db.prepare(`
  SELECT id, workspace_id AS workspaceId, invite_token AS inviteToken, invited_email AS invitedEmail,
         invited_by AS invitedBy, role, status, created_at AS createdAt, expires_at AS expiresAt,
         accepted_at AS acceptedAt, accepted_by AS acceptedBy
  FROM workspace_invites
  WHERE workspace_id = ? AND status = 'pending' AND expires_at > ?
  ORDER BY created_at DESC
`);

const updateStatus = db.prepare(`
  UPDATE workspace_invites SET status = ? WHERE id = ?
`);

const updateAccepted = db.prepare(`
  UPDATE workspace_invites SET status = 'accepted', accepted_at = ?, accepted_by = ? WHERE id = ?
`);

const deleteExpired = db.prepare(`
  DELETE FROM workspace_invites WHERE status = 'pending' AND expires_at < ?
`);

const selectById = db.prepare(`
  SELECT id, workspace_id AS workspaceId, invite_token AS inviteToken, invited_email AS invitedEmail,
         invited_by AS invitedBy, role, status, created_at AS createdAt, expires_at AS expiresAt,
         accepted_at AS acceptedAt, accepted_by AS acceptedBy
  FROM workspace_invites
  WHERE id = ?
`);

/**
 * Create a new workspace invite.
 */
export function createInvite(params: CreateInviteParams): Invite {
  const now = Date.now();
  const expiresInMs = (params.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000;
  const expiresAt = now + expiresInMs;
  const token = generateInviteToken();
  const role = params.role ?? 'editor';

  const result = insertInvite.run(
    params.workspaceId,
    token,
    params.invitedEmail.toLowerCase().trim(),
    params.invitedBy,
    role,
    now,
    expiresAt
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
export function getInviteByToken(token: string): Invite | null {
  const row = selectByToken.get(token) as Invite | undefined;
  return row ?? null;
}

/**
 * Get an invite by ID.
 */
export function getInviteById(inviteId: number): Invite | null {
  const row = selectById.get(inviteId) as Invite | undefined;
  return row ?? null;
}

/**
 * Get invite by token with workspace info (for accept page).
 */
export function getInviteWithWorkspace(token: string): InviteWithWorkspace | null {
  const invite = getInviteByToken(token);
  if (!invite) return null;

  const workspace = workspaceStore.getById(invite.workspaceId);
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
export function listInvites(workspaceId: string): Invite[] {
  return selectByWorkspace.all(workspaceId) as Invite[];
}

/**
 * List pending (non-expired) invites for a workspace.
 */
export function listPendingInvites(workspaceId: string): Invite[] {
  const now = Date.now();
  return selectPendingByWorkspace.all(workspaceId, now) as Invite[];
}

/**
 * Accept an invite.
 * Validates: token exists, pending, not expired, email matches (optional check).
 * Returns the workspace if successful.
 */
export function acceptInvite(token: string, userId: string, userEmail?: string): { success: true; workspaceId: string } | { success: false; error: string } {
  const invite = getInviteByToken(token);

  if (!invite) {
    return { success: false, error: 'Invite not found' };
  }

  if (invite.status !== 'pending') {
    return { success: false, error: `Invite has already been ${invite.status}` };
  }

  if (invite.expiresAt < Date.now()) {
    updateStatus.run('expired', invite.id);
    return { success: false, error: 'Invite has expired' };
  }

  // Optional email validation (if email provided)
  if (userEmail && invite.invitedEmail.toLowerCase() !== userEmail.toLowerCase()) {
    return { success: false, error: 'This invite was sent to a different email address' };
  }

  // Check if user is already a member
  const existingRole = workspaceStore.getUserRole(invite.workspaceId, userId);
  if (existingRole) {
    // User already a member, just mark invite as accepted
    updateAccepted.run(Date.now(), userId, invite.id);
    return { success: true, workspaceId: invite.workspaceId };
  }

  // Add user as member with invited role
  try {
    workspaceStore.addMember(invite.workspaceId, userId, invite.role);
    updateAccepted.run(Date.now(), userId, invite.id);
    return { success: true, workspaceId: invite.workspaceId };
  } catch (err) {
    return { success: false, error: 'Failed to add member to workspace' };
  }
}

/**
 * Revoke an invite (by workspace admin).
 */
export function revokeInvite(inviteId: number, workspaceId: string): boolean {
  const invite = getInviteById(inviteId);
  if (!invite || invite.workspaceId !== workspaceId) {
    return false;
  }
  if (invite.status !== 'pending') {
    return false;
  }
  updateStatus.run('revoked', inviteId);
  return true;
}

/**
 * Cleanup expired invites (can be called periodically).
 */
export function cleanupExpired(): number {
  const now = Date.now();
  const result = deleteExpired.run(now);
  return result.changes;
}

/**
 * Check if an invite is valid (pending and not expired).
 */
export function isInviteValid(token: string): boolean {
  const invite = getInviteByToken(token);
  if (!invite) return false;
  if (invite.status !== 'pending') return false;
  if (invite.expiresAt < Date.now()) return false;
  return true;
}
