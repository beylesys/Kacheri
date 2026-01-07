/**
 * Session Management
 *
 * Handles session creation, validation, and revocation.
 * Sessions are stored in SQLite for revocation support.
 */

import crypto from 'crypto';
import type { Database } from 'better-sqlite3';
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
  create(userId: string, refreshToken: string): Session;
  findById(sessionId: string): Session | null;
  findByTokenHash(tokenHash: string): Session | null;
  revoke(sessionId: string): void;
  revokeAllForUser(userId: string): void;
  cleanup(): number;  // returns count of deleted sessions
  isValid(sessionId: string): boolean;
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
 * Create a session store backed by SQLite
 */
export function createSessionStore(db: Database): SessionStore {
  const config = getAuthConfig();

  return {
    create(userId: string, refreshToken: string): Session {
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
      const existingSessions = db
        .prepare(
          `SELECT id FROM sessions
           WHERE user_id = ? AND revoked_at IS NULL
           ORDER BY created_at ASC`
        )
        .all(userId) as { id: string }[];

      if (existingSessions.length >= config.maxSessionsPerUser) {
        // Revoke oldest sessions to make room
        const toRevoke = existingSessions.slice(
          0,
          existingSessions.length - config.maxSessionsPerUser + 1
        );
        for (const s of toRevoke) {
          db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(
            now,
            s.id
          );
        }
      }

      db.prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        session.id,
        session.userId,
        session.tokenHash,
        session.expiresAt,
        session.createdAt,
        session.revokedAt
      );

      return session;
    },

    findById(sessionId: string): Session | null {
      const row = db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .get(sessionId) as any;

      if (!row) return null;

      return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
      };
    },

    findByTokenHash(tokenHash: string): Session | null {
      const row = db
        .prepare(`SELECT * FROM sessions WHERE token_hash = ?`)
        .get(tokenHash) as any;

      if (!row) return null;

      return {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        revokedAt: row.revoked_at,
      };
    },

    revoke(sessionId: string): void {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).run(
        now,
        sessionId
      );
    },

    revokeAllForUser(userId: string): void {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
      ).run(now, userId);
    },

    cleanup(): number {
      const now = Math.floor(Date.now() / 1000);
      // Delete sessions that expired more than 7 days ago
      const cutoff = now - 7 * 24 * 60 * 60;
      const result = db
        .prepare(`DELETE FROM sessions WHERE expires_at < ?`)
        .run(cutoff);
      return result.changes;
    },

    isValid(sessionId: string): boolean {
      const session = this.findById(sessionId);
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
