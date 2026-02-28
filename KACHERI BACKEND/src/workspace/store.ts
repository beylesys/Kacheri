/**
 * Workspace Store
 *
 * Data access layer for workspaces and memberships.
 */

import type { DbAdapter } from '../db/types';
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
  create(input: CreateWorkspaceInput, createdBy: string): Promise<Workspace>;
  getById(id: string): Promise<Workspace | null>;
  update(id: string, input: UpdateWorkspaceInput): Promise<Workspace | null>;
  delete(id: string): Promise<boolean>;

  // Membership
  addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember>;
  removeMember(workspaceId: string, userId: string): Promise<boolean>;
  updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember | null>;
  getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;

  // User's workspaces
  listForUser(userId: string): Promise<WorkspaceWithRole[]>;
  getUserRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null>;

  // Default workspace
  getOrCreateDefault(userId: string): Promise<Workspace>;
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

export function createWorkspaceStore(db: DbAdapter): WorkspaceStore {
  return {
    async create(input: CreateWorkspaceInput, createdBy: string): Promise<Workspace> {
      const id = generateWorkspaceId();
      const now = Date.now();
      const name = input.name.trim();
      const description = input.description?.trim() || null;

      await db.run(
        `INSERT INTO workspaces (id, name, description, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, name, description, createdBy, now, now]
      );

      // Creator becomes owner
      await db.run(
        `INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES (?, ?, 'owner', ?)`,
        [id, createdBy, now]
      );

      return {
        id,
        name,
        description,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
    },

    async getById(id: string): Promise<Workspace | null> {
      const row = await db.queryOne<WorkspaceRow>(
        `SELECT id, name, description, created_by, created_at, updated_at
         FROM workspaces
         WHERE id = ?`,
        [id]
      );

      return row ? rowToWorkspace(row) : null;
    },

    async update(id: string, input: UpdateWorkspaceInput): Promise<Workspace | null> {
      const existing = await this.getById(id);
      if (!existing) return null;

      const now = Date.now();
      const name = input.name?.trim() ?? existing.name;
      const description = input.description !== undefined
        ? (input.description?.trim() || null)
        : existing.description;

      await db.run(
        `UPDATE workspaces
         SET name = ?, description = ?, updated_at = ?
         WHERE id = ?`,
        [name, description, now, id]
      );

      return {
        ...existing,
        name,
        description,
        updatedAt: now,
      };
    },

    async delete(id: string): Promise<boolean> {
      // Delete members first (foreign key constraint)
      await db.run(`DELETE FROM workspace_members WHERE workspace_id = ?`, [id]);
      const result = await db.run(`DELETE FROM workspaces WHERE id = ?`, [id]);
      return (result.changes || 0) > 0;
    },

    async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember> {
      const now = Date.now();

      // Upsert: update if exists, insert if not
      const existing = await this.getMember(workspaceId, userId);
      if (existing) {
        return (await this.updateMemberRole(workspaceId, userId, role))!;
      }

      await db.run(
        `INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES (?, ?, ?, ?)`,
        [workspaceId, userId, role, now]
      );

      return {
        workspaceId,
        userId,
        role,
        joinedAt: now,
      };
    },

    async removeMember(workspaceId: string, userId: string): Promise<boolean> {
      const result = await db.run(
        `DELETE FROM workspace_members
         WHERE workspace_id = ? AND user_id = ?`,
        [workspaceId, userId]
      );

      return (result.changes || 0) > 0;
    },

    async updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceMember | null> {
      const existing = await this.getMember(workspaceId, userId);
      if (!existing) return null;

      await db.run(
        `UPDATE workspace_members
         SET role = ?
         WHERE workspace_id = ? AND user_id = ?`,
        [role, workspaceId, userId]
      );

      return { ...existing, role };
    },

    async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
      const row = await db.queryOne<MemberRow>(
        `SELECT workspace_id, user_id, role, joined_at
         FROM workspace_members
         WHERE workspace_id = ? AND user_id = ?`,
        [workspaceId, userId]
      );

      return row ? rowToMember(row) : null;
    },

    async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
      const rows = await db.queryAll<MemberRow>(
        `SELECT workspace_id, user_id, role, joined_at
         FROM workspace_members
         WHERE workspace_id = ?
         ORDER BY joined_at ASC`,
        [workspaceId]
      );

      return rows.map(rowToMember);
    },

    async listForUser(userId: string): Promise<WorkspaceWithRole[]> {
      const rows = await db.queryAll<WorkspaceRow & { role: string }>(
        `SELECT w.id, w.name, w.description, w.created_by, w.created_at, w.updated_at, m.role
         FROM workspaces w
         INNER JOIN workspace_members m ON w.id = m.workspace_id
         WHERE m.user_id = ?
         ORDER BY w.updated_at DESC`,
        [userId]
      );

      return rows.map((row) => ({
        ...rowToWorkspace(row),
        role: row.role as WorkspaceRole,
      }));
    },

    async getUserRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
      const member = await this.getMember(workspaceId, userId);
      return member?.role ?? null;
    },

    async getOrCreateDefault(userId: string): Promise<Workspace> {
      // Check if user has any workspace
      const existing = await this.listForUser(userId);
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
