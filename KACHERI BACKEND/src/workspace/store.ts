/**
 * Workspace Store
 *
 * Data access layer for workspaces and memberships.
 */

import type { Database } from 'better-sqlite3';
import { randomInt } from 'crypto';
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceWithRole,
  WorkspaceRole,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from './types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
function generateWorkspaceId(): string {
  let out = 'ws_';
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export interface WorkspaceStore {
  // Workspace CRUD
  create(input: CreateWorkspaceInput, createdBy: string): Workspace;
  getById(id: string): Workspace | null;
  update(id: string, input: UpdateWorkspaceInput): Workspace | null;
  delete(id: string): boolean;

  // Membership
  addMember(workspaceId: string, userId: string, role: WorkspaceRole): WorkspaceMember;
  removeMember(workspaceId: string, userId: string): boolean;
  updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): WorkspaceMember | null;
  getMember(workspaceId: string, userId: string): WorkspaceMember | null;
  listMembers(workspaceId: string): WorkspaceMember[];

  // User's workspaces
  listForUser(userId: string): WorkspaceWithRole[];
  getUserRole(workspaceId: string, userId: string): WorkspaceRole | null;

  // Default workspace
  getOrCreateDefault(userId: string): Workspace;
}

interface WorkspaceRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

interface MemberRow {
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: number;
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMember(row: MemberRow): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role as WorkspaceRole,
    joinedAt: row.joined_at,
  };
}

export function createWorkspaceStore(db: Database): WorkspaceStore {
  return {
    create(input: CreateWorkspaceInput, createdBy: string): Workspace {
      const id = generateWorkspaceId();
      const now = Date.now();
      const name = input.name.trim();
      const description = input.description?.trim() || null;

      db.prepare(`
        INSERT INTO workspaces (id, name, description, created_by, created_at, updated_at)
        VALUES (@id, @name, @description, @created_by, @created_at, @updated_at)
      `).run({
        id,
        name,
        description,
        created_by: createdBy,
        created_at: now,
        updated_at: now,
      });

      // Creator becomes owner
      db.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
        VALUES (@workspace_id, @user_id, 'owner', @joined_at)
      `).run({
        workspace_id: id,
        user_id: createdBy,
        joined_at: now,
      });

      return {
        id,
        name,
        description,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
    },

    getById(id: string): Workspace | null {
      const row = db.prepare(`
        SELECT id, name, description, created_by, created_at, updated_at
        FROM workspaces
        WHERE id = ?
      `).get(id) as WorkspaceRow | undefined;

      return row ? rowToWorkspace(row) : null;
    },

    update(id: string, input: UpdateWorkspaceInput): Workspace | null {
      const existing = this.getById(id);
      if (!existing) return null;

      const now = Date.now();
      const name = input.name?.trim() ?? existing.name;
      const description = input.description !== undefined
        ? (input.description?.trim() || null)
        : existing.description;

      db.prepare(`
        UPDATE workspaces
        SET name = @name, description = @description, updated_at = @updated_at
        WHERE id = @id
      `).run({ id, name, description, updated_at: now });

      return {
        ...existing,
        name,
        description,
        updatedAt: now,
      };
    },

    delete(id: string): boolean {
      // Delete members first (foreign key constraint)
      db.prepare(`DELETE FROM workspace_members WHERE workspace_id = ?`).run(id);
      const result = db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
      return (result.changes || 0) > 0;
    },

    addMember(workspaceId: string, userId: string, role: WorkspaceRole): WorkspaceMember {
      const now = Date.now();

      // Upsert: update if exists, insert if not
      const existing = this.getMember(workspaceId, userId);
      if (existing) {
        return this.updateMemberRole(workspaceId, userId, role)!;
      }

      db.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
        VALUES (@workspace_id, @user_id, @role, @joined_at)
      `).run({
        workspace_id: workspaceId,
        user_id: userId,
        role,
        joined_at: now,
      });

      return {
        workspaceId,
        userId,
        role,
        joinedAt: now,
      };
    },

    removeMember(workspaceId: string, userId: string): boolean {
      const result = db.prepare(`
        DELETE FROM workspace_members
        WHERE workspace_id = @workspace_id AND user_id = @user_id
      `).run({ workspace_id: workspaceId, user_id: userId });

      return (result.changes || 0) > 0;
    },

    updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): WorkspaceMember | null {
      const existing = this.getMember(workspaceId, userId);
      if (!existing) return null;

      db.prepare(`
        UPDATE workspace_members
        SET role = @role
        WHERE workspace_id = @workspace_id AND user_id = @user_id
      `).run({ workspace_id: workspaceId, user_id: userId, role });

      return { ...existing, role };
    },

    getMember(workspaceId: string, userId: string): WorkspaceMember | null {
      const row = db.prepare(`
        SELECT workspace_id, user_id, role, joined_at
        FROM workspace_members
        WHERE workspace_id = @workspace_id AND user_id = @user_id
      `).get({ workspace_id: workspaceId, user_id: userId }) as MemberRow | undefined;

      return row ? rowToMember(row) : null;
    },

    listMembers(workspaceId: string): WorkspaceMember[] {
      const rows = db.prepare(`
        SELECT workspace_id, user_id, role, joined_at
        FROM workspace_members
        WHERE workspace_id = ?
        ORDER BY joined_at ASC
      `).all(workspaceId) as MemberRow[];

      return rows.map(rowToMember);
    },

    listForUser(userId: string): WorkspaceWithRole[] {
      const rows = db.prepare(`
        SELECT w.id, w.name, w.description, w.created_by, w.created_at, w.updated_at, m.role
        FROM workspaces w
        INNER JOIN workspace_members m ON w.id = m.workspace_id
        WHERE m.user_id = ?
        ORDER BY w.updated_at DESC
      `).all(userId) as (WorkspaceRow & { role: string })[];

      return rows.map((row) => ({
        ...rowToWorkspace(row),
        role: row.role as WorkspaceRole,
      }));
    },

    getUserRole(workspaceId: string, userId: string): WorkspaceRole | null {
      const member = this.getMember(workspaceId, userId);
      return member?.role ?? null;
    },

    getOrCreateDefault(userId: string): Workspace {
      // Check if user has any workspace
      const existing = this.listForUser(userId);
      if (existing.length > 0) {
        return existing[0]; // Return most recently updated
      }

      // Create personal workspace
      return this.create(
        { name: 'My Workspace', description: 'Personal workspace' },
        userId
      );
    },
  };
}
