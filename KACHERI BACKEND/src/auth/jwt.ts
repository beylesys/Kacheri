/**
 * JWT Utilities
 *
 * Sign, verify, and decode JSON Web Tokens.
 * Supports access tokens (short-lived) and refresh tokens (long-lived).
 */

import jwt from 'jsonwebtoken';
import { getAuthConfig } from './config';

// Token payload types
export interface AccessTokenPayload {
  sub: string;          // user ID
  email: string;
  name: string;
  type: 'access';
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;          // user ID
  sid: string;          // session ID
  type: 'refresh';
  iat: number;
  exp: number;
}

export type TokenPayload = AccessTokenPayload | RefreshTokenPayload;

// User info for token creation
export interface TokenUser {
  id: string;
  email: string;
  displayName: string;
}

// Token pair returned after login
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;      // seconds until access token expires
  expiresAt: number;      // unix timestamp when access token expires
}

/**
 * Sign an access token (short-lived)
 */
export function signAccessToken(user: TokenUser): string {
  const config = getAuthConfig();
  const now = Math.floor(Date.now() / 1000);

  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    name: user.displayName,
    type: 'access',
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.accessTokenExpiry,
  });
}

/**
 * Sign a refresh token (long-lived, tied to session)
 */
export function signRefreshToken(userId: string, sessionId: string): string {
  const config = getAuthConfig();

  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    sub: userId,
    sid: sessionId,
    type: 'refresh',
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.refreshTokenExpiry,
  });
}

/**
 * Create both access and refresh tokens
 */
export function createTokenPair(user: TokenUser, sessionId: string): TokenPair {
  const config = getAuthConfig();
  const now = Math.floor(Date.now() / 1000);

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user.id, sessionId),
    expiresIn: config.accessTokenExpiry,
    expiresAt: now + config.accessTokenExpiry,
  };
}

/**
 * Verify and decode a token
 * Returns null if invalid/expired
 */
export function verifyToken<T extends TokenPayload>(token: string): T | null {
  const config = getAuthConfig();

  try {
    const payload = jwt.verify(token, config.jwtSecret) as T;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Decode a token without verification (for debugging)
 * WARNING: Do not trust the output for auth decisions
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header
 * Expects: "Bearer <token>"
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Check if a token is an access token
 */
export function isAccessToken(payload: TokenPayload): payload is AccessTokenPayload {
  return payload.type === 'access';
}

/**
 * Check if a token is a refresh token
 */
export function isRefreshToken(payload: TokenPayload): payload is RefreshTokenPayload {
  return payload.type === 'refresh';
}
