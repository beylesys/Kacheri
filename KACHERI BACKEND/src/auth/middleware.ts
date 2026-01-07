/**
 * Auth Middleware
 *
 * Fastify preHandler hook that:
 * 1. Checks maintenance mode
 * 2. Allows public routes through
 * 3. Handles dev mode bypass (X-Dev-User header)
 * 4. Validates JWT and attaches user to request
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import { getAuthConfig } from './config';
import { checkMaintenanceMode } from './maintenance';
import { extractDevUser, logAuthDecision, hasDevUserHeader } from './devMode';
import {
  extractBearerToken,
  verifyToken,
  isAccessToken,
  type AccessTokenPayload,
} from './jwt';
import { createSessionStore } from './sessions';
import { createUserStore } from './users';

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/health',
  '/auth/status',
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
];

/**
 * Check if a route is public (no auth required)
 */
function isPublicRoute(url: string, method: string): boolean {
  const path = url.split('?')[0];

  // Health check
  if (path === '/health' || path === '/api/health') {
    return true;
  }

  // Auth routes that don't need auth
  for (const route of PUBLIC_ROUTES) {
    if (path === route || path === `/api${route}`) {
      return true;
    }
  }

  // OPTIONS requests for CORS
  if (method === 'OPTIONS') {
    return true;
  }

  return false;
}

/**
 * Create the auth middleware hook
 */
export function createAuthMiddleware(db: Database) {
  const config = getAuthConfig();
  const sessionStore = createSessionStore(db);
  const userStore = createUserStore(db);

  return async function authMiddleware(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // 1. Check maintenance mode
    if (checkMaintenanceMode(req, reply)) {
      return;
    }

    // 2. Allow public routes through (but still try to extract user)
    const isPublic = isPublicRoute(req.url, req.method);

    // 3. Try dev mode bypass first (fastest path for development)
    if (config.devBypassAuth && hasDevUserHeader(req)) {
      const devUser = extractDevUser(req);
      if (devUser) {
        req.user = devUser;
        logAuthDecision(req, 'dev-bypass', `X-Dev-User: ${devUser.id}`);
        return;
      }
    }

    // 4. Extract and validate JWT
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);

    if (token) {
      const payload = verifyToken<AccessTokenPayload>(token);

      if (payload && isAccessToken(payload)) {
        // Valid token - attach user to request
        req.user = {
          id: payload.sub,
          email: payload.email,
          displayName: payload.name,
        };

        logAuthDecision(req, 'allowed', `JWT valid for ${payload.sub}`);
        return;
      } else {
        // Invalid token provided
        // In dev mode with bypass enabled, fall through to anonymous dev user
        // instead of rejecting immediately (handles stale tokens gracefully)
        if (!isPublic && !(config.mode === 'development' && config.devBypassAuth)) {
          logAuthDecision(req, 'denied', 'Invalid or expired JWT');
          reply.status(401).send({
            error: 'unauthorized',
            message: 'Invalid or expired token',
          });
          return;
        }
        // In dev mode, log and continue to dev bypass
        if (config.mode === 'development') {
          logAuthDecision(req, 'dev-bypass', 'Invalid/expired token ignored in dev mode');
        }
      }
    }

    // 5. No valid auth found
    if (isPublic) {
      // Public route, no auth needed
      logAuthDecision(req, 'allowed', 'Public route');
      return;
    }

    // 6. In development mode, allow through without auth (permissive)
    if (config.mode === 'development' && config.devBypassAuth) {
      // Create anonymous dev user
      req.user = {
        id: 'user_anonymous',
        email: 'anonymous@dev.local',
        displayName: 'Anonymous',
      };
      logAuthDecision(req, 'dev-bypass', 'No auth, dev mode permissive');
      return;
    }

    // 7. Production mode - deny access
    logAuthDecision(req, 'denied', 'No valid authentication');
    reply.status(401).send({
      error: 'unauthorized',
      message: 'Authentication required',
    });
  };
}

/**
 * Register auth middleware as a Fastify plugin
 */
export function registerAuthMiddleware(app: FastifyInstance, db: Database): void {
  const middleware = createAuthMiddleware(db);

  app.addHook('preHandler', middleware);
}

/**
 * Helper to require authentication in a route handler
 * Use this for routes that need guaranteed auth
 */
export function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply
): boolean {
  if (!req.user) {
    reply.status(401).send({
      error: 'unauthorized',
      message: 'Authentication required',
    });
    return false;
  }
  return true;
}

/**
 * Get the current user ID from request
 * Returns 'user:anonymous' if not authenticated
 */
export function getCurrentUserId(req: FastifyRequest): string {
  return req.user?.id || 'user:anonymous';
}

/**
 * Get the current user from request (or null)
 */
export function getCurrentUser(
  req: FastifyRequest
): { id: string; email: string; displayName: string } | null {
  return req.user || null;
}
