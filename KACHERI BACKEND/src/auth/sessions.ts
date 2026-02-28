/**
 * Session Management
 *
 * Handles session creation, validation, and revocation.
 * Sessions are stored in SQLite for revocation support.
 */

import crypto from 'crypto';
import type { DbAdapter } from '../db/types';
import { getAuthConfig } from './config';

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
  revokedAt: number | null;
}

export interface SessionStore {
  create(userId: string, refreshToken: string): Promise<Session>;
  findById(sessionId: string): Promise<Session | undefined>;
  findByTokenHash(tokenHash: string): Promise<Session | undefined>;
  updateTokenHash(sessionId: string, refreshToken: string): Promise<void>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  cleanup(): Promise<number>;  // returns count of deleted sessions
  isValid(sessionId: string): Promise<boolean>;
}

/**
 * Hash a token for storage (we don't store raw tokens)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `ses_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Create a session store backed by a DbAdapter
 */
export function createSessionStore(db: DbAdapter): SessionStore {
  const config = getAuthConfig();

  return {
    async create(userId: string, refreshToken: string): Promise<Session> {
      const now = Math.floor(Date.now() / 1000);
      const session: Session = {
        id: generateSessionId(),
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: now + config.refreshTokenExpiry,
        createdAt: now,
        revokedAt: null,
      };

      // Enforce max sessions per user
      const existingSessions = await db.queryAll<{ id: string }>(
        `SELECT id FROM sessions
         WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY created_at ASC`,
        [userId]
      );

      if (existingSessions.length >= config.maxSessionsPerUser) {
        // Revoke oldest sessions to make room
        const toRevoke = existingSessions.slice(
          0,
          existingSessions.length - config.maxSessionsPerUser + 1
        );
        for (const s of toRevoke) {
          await db.run(`UPDATE sessions SET revoked_at = ? WHERE id = ?`, [now, s.id]);
        }
      }

      await db.run(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.userId,
          session.tokenHash,
          session.expiresAt,
          session.createdAt,
          session.revokedAt,
        ]
      );

      return session;
    },

    async findById(sessionId: string): Promise<Session | undefined> {
      const row = await db.queryOne<any>(
        `SELECT * FROM sessions WHERE id = ?`,
        [sessionId]
      );

      if (!row) return undefined;

      return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
      };
    },

    async findByTokenHash(tokenHash: string): Promise<Session | undefined> {
      const row = await db.queryOne<any>(
        `SELECT * FROM sessions WHERE token_hash = ?`,
        [tokenHash]
      );

      if (!row) return undefined;

      return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
      };
    },

    async updateTokenHash(sessionId: string, refreshToken: string): Promise<void> {
      await db.run(
        `UPDATE sessions SET token_hash = ? WHERE id = ?`,
        [hashToken(refreshToken), sessionId]
      );
    },

    async revoke(sessionId: string): Promise<void> {
      const now = Math.floor(Date.now() / 1000);
      await db.run(
        `UPDATE sessions SET revoked_at = ? WHERE id = ?`,
        [now, sessionId]
      );
    },

    async revokeAllForUser(userId: string): Promise<void> {
      const now = Math.floor(Date.now() / 1000);
      await db.run(
        `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
        [now, userId]
      );
    },

    async cleanup(): Promise<number> {
      const now = Math.floor(Date.now() / 1000);
      // Delete sessions that expired more than 7 days ago
      const cutoff = now - 7 * 24 * 60 * 60;
      const result = await db.run(
        `DELETE FROM sessions WHERE expires_at < ?`,
        [cutoff]
      );
      return result.changes;
    },

    async isValid(sessionId: string): Promise<boolean> {
      const session = await this.findById(sessionId);
      if (!session) return false;

      const now = Math.floor(Date.now() / 1000);

      // Check not revoked
      if (session.revokedAt !== null) return false;

      // Check not expired
      if (session.expiresAt < now) return false;

      return true;
    },
  };
}
