/**
 * Personal Access Token (PAT) Store
 *
 * Handles creation, lookup, revocation, and validation of PATs.
 * PATs are workspace-scoped bearer tokens for external API clients (e.g. JAAL).
 *
 * Token format: bpat_<nanoid(32)>
 * Storage: SHA256 hash of raw token (raw token shown once at creation)
 *
 * Phase 1, Slice P4 — Personal Access Tokens for External Clients
 */

import { nanoid } from 'nanoid';
import type { DbAdapter } from '../db/types';
import { hashToken } from './sessions';

/* ---------- Constants ---------- */

export const PAT_PREFIX = 'bpat_';
export const PAT_TOKEN_LENGTH = 32;
export const MAX_PATS_PER_USER = 10;
export const MAX_PAT_NAME_LENGTH = 100;
export const DEFAULT_MAX_EXPIRY_SECONDS = 365 * 24 * 60 * 60; // 1 year

/* ---------- Types ---------- */

export type PatScope =
  | 'docs:read'
  | 'docs:write'
  | 'memory:write'
  | 'ai:invoke'
  | 'workspace:read';

export const VALID_SCOPES: PatScope[] = [
  'docs:read',
  'docs:write',
  'memory:write',
  'ai:invoke',
  'workspace:read',
];

/** Domain type (camelCase, for API responses) */
export interface PersonalAccessToken {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  scopes: PatScope[] | null;
  expiresAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
  revokedAt: number | null;
}

/** Row type (snake_case, matches DB) */
interface PatRow {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  token_hash: string;
  scopes: string | null;
  expires_at: number | null;
  last_used_at: number | null;
  created_at: number;
  revoked_at: number | null;
}

export interface CreatePatInput {
  userId: string;
  workspaceId: string;
  name: string;
  scopes?: PatScope[];
  expiresInSeconds?: number;
}

export interface CreatePatResult {
  token: string;
  pat: PersonalAccessToken;
}

export interface PatStore {
  create(input: CreatePatInput): Promise<CreatePatResult>;
  listByUser(userId: string): Promise<PersonalAccessToken[]>;
  findByTokenHash(tokenHash: string): Promise<(PersonalAccessToken & { tokenHash: string }) | null>;
  revoke(id: string, userId: string): Promise<boolean>;
  countActiveForUser(userId: string): Promise<number>;
  updateLastUsed(id: string): Promise<void>;
  cleanup(): Promise<number>;
}

/* ---------- Row to Domain Converter ---------- */

function rowToPat(row: PatRow): PersonalAccessToken {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    name: row.name,
    scopes: row.scopes ? row.scopes.split(',') as PatScope[] : null,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

/* ---------- Validation Helpers ---------- */

export function isValidScope(scope: string): scope is PatScope {
  return VALID_SCOPES.includes(scope as PatScope);
}

export function validateScopes(scopes: string[]): { valid: boolean; invalid: string[] } {
  const invalid = scopes.filter(s => !isValidScope(s));
  return { valid: invalid.length === 0, invalid };
}

/** Check if a bearer token string is a PAT (starts with bpat_) */
export function isPATToken(token: string): boolean {
  return token.startsWith(PAT_PREFIX);
}

/** Generate a new raw PAT token */
export function generatePATToken(): string {
  return `${PAT_PREFIX}${nanoid(PAT_TOKEN_LENGTH)}`;
}

/* ---------- Store Factory ---------- */

export function createPatStore(db: DbAdapter): PatStore {
  return {
    async create(input: CreatePatInput): Promise<CreatePatResult> {
      const now = Math.floor(Date.now() / 1000);

      // Enforce max PATs per user
      const activeCount = await this.countActiveForUser(input.userId);
      if (activeCount >= MAX_PATS_PER_USER) {
        throw new Error(`Maximum of ${MAX_PATS_PER_USER} active PATs per user`);
      }

      // Validate name
      if (!input.name || input.name.trim().length === 0) {
        throw new Error('PAT name is required');
      }
      if (input.name.length > MAX_PAT_NAME_LENGTH) {
        throw new Error(`PAT name must be ${MAX_PAT_NAME_LENGTH} characters or fewer`);
      }

      // Validate scopes if provided
      if (input.scopes && input.scopes.length > 0) {
        const { valid, invalid } = validateScopes(input.scopes);
        if (!valid) {
          throw new Error(`Invalid scopes: ${invalid.join(', ')}`);
        }
      }

      // Validate expiry
      let expiresAt: number | null = null;
      if (input.expiresInSeconds !== undefined) {
        if (input.expiresInSeconds <= 0) {
          throw new Error('Expiry must be a positive number of seconds');
        }
        if (input.expiresInSeconds > DEFAULT_MAX_EXPIRY_SECONDS) {
          throw new Error(`Expiry cannot exceed ${DEFAULT_MAX_EXPIRY_SECONDS} seconds (1 year)`);
        }
        expiresAt = now + input.expiresInSeconds;
      }

      // Generate token and hash
      const id = `pat_${nanoid(12)}`;
      const rawToken = generatePATToken();
      const tokenHash = hashToken(rawToken);

      const scopesStr = input.scopes && input.scopes.length > 0
        ? input.scopes.join(',')
        : null;

      await db.run(
        `INSERT INTO personal_access_tokens
           (id, user_id, workspace_id, name, token_hash, scopes, expires_at, last_used_at, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
        [
          id,
          input.userId,
          input.workspaceId,
          input.name.trim(),
          tokenHash,
          scopesStr,
          expiresAt,
          now,
        ]
      );

      const pat: PersonalAccessToken = {
        id,
        userId: input.userId,
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        scopes: input.scopes && input.scopes.length > 0 ? input.scopes : null,
        expiresAt,
        lastUsedAt: null,
        createdAt: now,
        revokedAt: null,
      };

      return { token: rawToken, pat };
    },

    async listByUser(userId: string): Promise<PersonalAccessToken[]> {
      const rows = await db.queryAll<PatRow>(
        `SELECT * FROM personal_access_tokens
         WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC`,
        [userId]
      );

      return rows.map(rowToPat);
    },

    async findByTokenHash(tokenHash: string): Promise<(PersonalAccessToken & { tokenHash: string }) | null> {
      const row = await db.queryOne<PatRow>(
        `SELECT * FROM personal_access_tokens WHERE token_hash = ?`,
        [tokenHash]
      );

      if (!row) return null;

      return {
        ...rowToPat(row),
        tokenHash: row.token_hash,
      };
    },

    async revoke(id: string, userId: string): Promise<boolean> {
      const now = Math.floor(Date.now() / 1000);
      const result = await db.run(
        `UPDATE personal_access_tokens
         SET revoked_at = ?
         WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
        [now, id, userId]
      );

      return result.changes > 0;
    },

    async countActiveForUser(userId: string): Promise<number> {
      const row = await db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM personal_access_tokens
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId]
      );

      return row?.count ?? 0;
    },

    async updateLastUsed(id: string): Promise<void> {
      const now = Math.floor(Date.now() / 1000);
      await db.run(
        `UPDATE personal_access_tokens SET last_used_at = ? WHERE id = ?`,
        [now, id]
      );
    },

    async cleanup(): Promise<number> {
      const now = Math.floor(Date.now() / 1000);
      const cutoff = now - 30 * 24 * 60 * 60; // 30 days ago
      const result = await db.run(
        `DELETE FROM personal_access_tokens
         WHERE (revoked_at IS NOT NULL AND revoked_at < ?)
            OR (expires_at IS NOT NULL AND expires_at < ?)`,
        [cutoff, cutoff]
      );

      return result.changes;
    },
  };
}
