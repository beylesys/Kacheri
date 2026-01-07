/**
 * Auth Routes
 *
 * Endpoints for authentication:
 * - POST /auth/register - Create new account
 * - POST /auth/login - Get tokens
 * - POST /auth/logout - Revoke session
 * - POST /auth/refresh - Refresh access token
 * - GET  /auth/status - Current auth status
 * - GET  /auth/me - Current user profile
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import { createUserStore, type CreateUserInput, type UserStore } from './users';
import { createSessionStore, hashToken, type SessionStore } from './sessions';
import {
  createTokenPair,
  verifyToken,
  isRefreshToken,
  type RefreshTokenPayload,
} from './jwt';
import { validatePasswordStrength } from './passwords';
import { getSystemStatus } from './maintenance';
import { getAuthConfig } from './config';

// Request body types
interface RegisterBody {
  email: string;
  password: string;
  displayName: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface RefreshBody {
  refreshToken: string;
}

// Extend FastifyRequest to include auth context
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      displayName: string;
    };
    sessionId?: string;
  }
}

export interface AuthRoutesContext {
  db: Database;
  userStore: UserStore;
  sessionStore: SessionStore;
}

/**
 * Create auth routes plugin
 */
export function createAuthRoutes(db: Database): FastifyPluginAsync {
  const userStore = createUserStore(db);
  const sessionStore = createSessionStore(db);

  return async (app) => {
    // GET /status - System and auth status (always accessible)
    app.get('/status', async (req) => {
      const status = getSystemStatus();
      const config = getAuthConfig();

      return {
        ...status,
        authenticated: !!req.user,
        user: req.user || null,
        devMode: config.mode === 'development',
        devBypassEnabled: config.devBypassAuth,
      };
    });

    // POST /register - Create new account
    app.post('/register', async (req, reply) => {
      const body = req.body as RegisterBody;

      // Validate input
      if (!body.email || !body.password || !body.displayName) {
        return reply.status(400).send({
          error: 'validation',
          message: 'Email, password, and display name are required',
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return reply.status(400).send({
          error: 'validation',
          message: 'Invalid email format',
        });
      }

      // Validate password strength
      const passwordError = validatePasswordStrength(body.password);
      if (passwordError) {
        return reply.status(400).send({
          error: 'validation',
          message: passwordError,
        });
      }

      // Validate display name
      if (body.displayName.length < 2 || body.displayName.length > 100) {
        return reply.status(400).send({
          error: 'validation',
          message: 'Display name must be 2-100 characters',
        });
      }

      try {
        const user = await userStore.create({
          email: body.email.toLowerCase(),
          password: body.password,
          displayName: body.displayName.trim(),
        });

        // Create session and tokens
        const tokens = createTokenPair(
          {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
          sessionStore.create(user.id, '').id // Placeholder, will be updated
        );

        // Create actual session with refresh token
        const session = sessionStore.create(user.id, tokens.refreshToken);

        // Regenerate tokens with correct session ID
        const finalTokens = createTokenPair(
          {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
          session.id
        );

        return {
          user: userStore.toPublic(user),
          ...finalTokens,
        };
      } catch (err: any) {
        if (err.message === 'Email already registered') {
          return reply.status(409).send({
            error: 'conflict',
            message: 'Email already registered',
          });
        }
        throw err;
      }
    });

    // POST /login - Authenticate and get tokens
    app.post('/login', async (req, reply) => {
      const body = req.body as LoginBody;

      if (!body.email || !body.password) {
        return reply.status(400).send({
          error: 'validation',
          message: 'Email and password are required',
        });
      }

      const user = await userStore.validateCredentials(
        body.email.toLowerCase(),
        body.password
      );

      if (!user) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Invalid email or password',
        });
      }

      // Create session
      const tempTokens = createTokenPair(
        {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        'temp'
      );

      const session = sessionStore.create(user.id, tempTokens.refreshToken);

      // Create final tokens with session ID
      const tokens = createTokenPair(
        {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        session.id
      );

      return {
        user: userStore.toPublic(user),
        ...tokens,
      };
    });

    // POST /logout - Revoke current session
    app.post('/logout', async (req) => {
      const body = req.body as RefreshBody | undefined;

      // If refresh token provided, revoke that session
      if (body?.refreshToken) {
        const payload = verifyToken<RefreshTokenPayload>(body.refreshToken);
        if (payload && isRefreshToken(payload)) {
          sessionStore.revoke(payload.sid);
        }
      }

      // If authenticated via middleware, revoke that session too
      if (req.sessionId) {
        sessionStore.revoke(req.sessionId);
      }

      return { success: true };
    });

    // POST /refresh - Get new access token
    app.post('/refresh', async (req, reply) => {
      const body = req.body as RefreshBody;

      if (!body.refreshToken) {
        return reply.status(400).send({
          error: 'validation',
          message: 'Refresh token is required',
        });
      }

      const payload = verifyToken<RefreshTokenPayload>(body.refreshToken);

      if (!payload || !isRefreshToken(payload)) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Invalid refresh token',
        });
      }

      // Validate session is still active
      if (!sessionStore.isValid(payload.sid)) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Session has been revoked or expired',
        });
      }

      // Get user
      const user = userStore.findById(payload.sub);
      if (!user || user.status !== 'active') {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'User not found or inactive',
        });
      }

      // Issue new tokens (rotate refresh token)
      sessionStore.revoke(payload.sid);
      const session = sessionStore.create(user.id, '');

      const tokens = createTokenPair(
        {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        session.id
      );

      return tokens;
    });

    // GET /me - Current user profile (requires auth)
    app.get('/me', async (req, reply) => {
      if (!req.user) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Not authenticated',
        });
      }

      const user = userStore.findById(req.user.id);
      if (!user) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'User not found',
        });
      }

      return { user: userStore.toPublic(user) };
    });
  };
}
