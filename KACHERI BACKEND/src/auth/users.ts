/**
 * User Store
 *
 * CRUD operations for users in SQLite.
 */

import crypto from 'crypto';
import type { Database } from 'better-sqlite3';
import { hashPassword, comparePassword } from './passwords';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: number;
  updatedAt: number;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
}

export interface UserStore {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): User | null;
  findByEmail(email: string): User | null;
  validateCredentials(email: string, password: string): Promise<User | null>;
  updateDisplayName(id: string, displayName: string): void;
  updatePassword(id: string, newPassword: string): Promise<void>;
  updateStatus(id: string, status: User['status']): void;
  toPublic(user: User): PublicUser;
}

/**
 * Generate a unique user ID
 */
export function generateUserId(): string {
  return `user_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Map database row to User object
 */
function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a user store backed by SQLite
 */
export function createUserStore(db: Database): UserStore {
  return {
    async create(input: CreateUserInput): Promise<User> {
      const now = Math.floor(Date.now() / 1000);
      const id = generateUserId();
      const passwordHash = await hashPassword(input.password);

      // Check if email already exists
      const existing = db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .get(input.email);

      if (existing) {
        throw new Error('Email already registered');
      }

      db.prepare(
        `INSERT INTO users (id, email, password_hash, display_name, avatar_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)`
      ).run(id, input.email, passwordHash, input.displayName, now, now);

      return this.findById(id)!;
    },

    findById(id: string): User | null {
      const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
      return row ? rowToUser(row) : null;
    },

    findByEmail(email: string): User | null {
      const row = db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .get(email.toLowerCase());
      return row ? rowToUser(row) : null;
    },

    async validateCredentials(
      email: string,
      password: string
    ): Promise<User | null> {
      const user = this.findByEmail(email);
      if (!user) return null;

      if (user.status !== 'active') return null;

      const valid = await comparePassword(password, user.passwordHash);
      return valid ? user : null;
    },

    updateDisplayName(id: string, displayName: string): void {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`
      ).run(displayName, now, id);
    },

    async updatePassword(id: string, newPassword: string): Promise<void> {
      const now = Math.floor(Date.now() / 1000);
      const passwordHash = await hashPassword(newPassword);
      db.prepare(
        `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`
      ).run(passwordHash, now, id);
    },

    updateStatus(id: string, status: User['status']): void {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(
        status,
        now,
        id
      );
    },

    toPublic(user: User): PublicUser {
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
      };
    },
  };
}
