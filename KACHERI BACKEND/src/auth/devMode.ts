/**
 * Development Mode Helpers
 *
 * Provides dev-only features:
 * - X-Dev-User header bypass for testing
 * - Auto-seeding of dev user on first boot
 * - Synthetic user creation from headers
 */

import type { DbAdapter } from '../db/types';
import type { FastifyRequest } from 'fastify';
import { getAuthConfig } from './config';
import { hashPassword } from './passwords';
import { createLogger } from '../observability';

const log = createLogger('auth/devMode');

// Dev user that gets auto-seeded
export const DEV_USER = {
  id: 'user_dev_local',
  email: 'dev@kacheri.local',
  password: 'dev123',
  displayName: 'Dev User',
};

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Extract dev user from request headers
 * Only works in development mode with DEV_BYPASS_AUTH=true
 */
export function extractDevUser(req: FastifyRequest): AuthUser | null {
  const config = getAuthConfig();

  if (!config.devBypassAuth) {
    return null;
  }

  // Check for X-Dev-User header
  const devUserHeader = req.headers['x-dev-user'] as string | undefined;
  if (!devUserHeader) {
    return null;
  }

  const trimmed = devUserHeader.trim();
  if (!trimmed) {
    return null;
  }

  // Create synthetic user from header value
  // Format: "user_id" or "user_id:Display Name"
  const parts = trimmed.split(':');
  const id = parts[0].startsWith('user_') ? parts[0] : `user_${parts[0]}`;
  const displayName = parts[1] || id;

  return {
    id,
    email: `${id}@dev.local`,
    displayName,
  };
}

/**
 * Check if dev user header is present
 */
export function hasDevUserHeader(req: FastifyRequest): boolean {
  const header = req.headers['x-dev-user'] as string | undefined;
  return !!(header && header.trim());
}

/**
 * Seed the dev user into the database if it doesn't exist
 */
export async function seedDevUser(db: DbAdapter): Promise<void> {
  const config = getAuthConfig();

  if (!config.devAutoSeed) {
    return;
  }

  // Check if dev user already exists
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM users WHERE id = ?`,
    [DEV_USER.id]
  );

  if (existing) {
    log.debug('Dev user already exists');
    return;
  }

  // Create dev user
  const now = Math.floor(Date.now() / 1000);
  const passwordHash = await hashPassword(DEV_USER.password);

  await db.run(
    `INSERT INTO users (id, email, password_hash, display_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [DEV_USER.id, DEV_USER.email, passwordHash, DEV_USER.displayName, now, now]
  );

  log.info({ email: DEV_USER.email }, 'Dev user seeded');
}

/**
 * Log auth decision (only in development)
 */
export function logAuthDecision(
  req: FastifyRequest,
  decision: 'allowed' | 'denied' | 'dev-bypass',
  reason: string
): void {
  const config = getAuthConfig();

  if (config.mode !== 'development') {
    return;
  }

  const method = req.method;
  const url = req.url;

  log.debug({ decision, method, url, reason }, 'Auth decision');
}
