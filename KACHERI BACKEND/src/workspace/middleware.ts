/**
 * Workspace Middleware
 *
 * Extracts workspace context from request and enforces access.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import type { Database } from 'better-sqlite3';
import { createWorkspaceStore, type WorkspaceStore } from './store';
import { hasPermission, type WorkspaceRole } from './types';
import { getCurrentUserId, getAuthConfig } from '../auth';
import {
  type DocRole,
  hasDocPermission,
  getEffectiveDocRole as getEffectiveDocRoleFromStore,
} from '../store/docPermissions';

// Augment FastifyRequest to include workspace and doc context
declare module 'fastify' {
  interface FastifyRequest {
    workspaceId?: string;
    workspaceRole?: WorkspaceRole;
    docRole?: DocRole;  // Set when accessing a specific doc
  }
}

/**
 * Extracts workspace ID from request.
 * Priority: X-Workspace-Id header > query param > path param
 */
function extractWorkspaceId(req: FastifyRequest): string | undefined {
  // Header takes priority
  const header = (req.headers['x-workspace-id'] as string)?.trim();
  if (header) return header;

  // Query param
  const query = (req.query as Record<string, string>)?.workspaceId?.trim();
  if (query) return query;

  // Path param (for /workspaces/:id routes, already handled by routes)
  return undefined;
}

/**
 * Gets user ID, handling dev mode bypass.
 */
function getUserIdFromRequest(req: FastifyRequest): string | undefined {
  const authConfig = getAuthConfig();

  // Dev mode: check X-Dev-User header
  if (authConfig.devBypassAuth) {
    const devUser = (req.headers['x-dev-user'] as string)?.trim();
    if (devUser) {
      return `user_${devUser}`;
    }
  }

  return getCurrentUserId(req) ?? undefined;
}

/**
 * Register workspace context extraction middleware.
 * This runs on every request and populates req.workspaceId and req.workspaceRole.
 */
export function registerWorkspaceMiddleware(app: FastifyInstance, db: Database): void {
  const store = createWorkspaceStore(db);

  app.addHook('preHandler', function workspaceContext(
    req: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) {
    const workspaceId = extractWorkspaceId(req);
    if (!workspaceId) {
      done();
      return;
    }

    req.workspaceId = workspaceId;

    // Try to get user's role in this workspace
    const userId = getUserIdFromRequest(req);
    if (userId) {
      const role = store.getUserRole(workspaceId, userId);
      if (role) {
        req.workspaceRole = role;
      }
    }

    done();
  });
}

/**
 * Route decorator factory: require workspace membership with minimum role.
 */
export function requireWorkspaceRole(db: Database, minRole: WorkspaceRole) {
  const store = createWorkspaceStore(db);

  return async function(req: FastifyRequest, reply: FastifyReply) {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      reply.code(400).send({ error: 'X-Workspace-Id header required' });
      return;
    }

    const userId = getUserIdFromRequest(req);
    if (!userId) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const role = store.getUserRole(workspaceId, userId);
    if (!role) {
      reply.code(403).send({ error: 'Not a member of this workspace' });
      return;
    }

    if (!hasPermission(role, minRole)) {
      reply.code(403).send({ error: `Requires ${minRole} role or higher` });
      return;
    }

    req.workspaceRole = role;
  };
}

/**
 * Helper to check if request has workspace write access.
 */
export function hasWorkspaceWriteAccess(req: FastifyRequest): boolean {
  const role = req.workspaceRole;
  if (!role) return false;
  return hasPermission(role, 'editor');
}

/**
 * Helper to check if request has workspace read access.
 */
export function hasWorkspaceReadAccess(req: FastifyRequest): boolean {
  const role = req.workspaceRole;
  if (!role) return false;
  return hasPermission(role, 'viewer');
}

/**
 * Helper to check if request has admin access (for permanent delete, etc.).
 */
export function hasWorkspaceAdminAccess(req: FastifyRequest): boolean {
  const role = req.workspaceRole;
  if (!role) return false;
  return hasPermission(role, 'admin');
}

/**
 * Get workspace store instance for direct access.
 */
export function getWorkspaceStore(db: Database): WorkspaceStore {
  return createWorkspaceStore(db);
}

// ============================================
// Doc-level permission helpers
// ============================================

/**
 * Get the effective doc role for a user on a document.
 * Uses the permission resolution order: doc permission > workspace role > doc creator.
 */
export function getEffectiveDocRole(
  db: Database,
  docId: string,
  req: FastifyRequest
): DocRole | null {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;

  const store = createWorkspaceStore(db);

  return getEffectiveDocRoleFromStore(
    docId,
    userId,
    (workspaceId: string, uid: string) => store.getUserRole(workspaceId, uid)
  );
}

/**
 * Helper to check if request has doc read access (viewer+).
 */
export function hasDocReadAccess(req: FastifyRequest): boolean {
  const role = req.docRole;
  return hasDocPermission(role ?? null, 'viewer');
}

/**
 * Helper to check if request has doc comment access (commenter+).
 */
export function hasDocCommentAccess(req: FastifyRequest): boolean {
  const role = req.docRole;
  return hasDocPermission(role ?? null, 'commenter');
}

/**
 * Helper to check if request has doc write access (editor+).
 */
export function hasDocWriteAccess(req: FastifyRequest): boolean {
  const role = req.docRole;
  return hasDocPermission(role ?? null, 'editor');
}

/**
 * Helper to check if request has doc owner access.
 */
export function hasDocOwnerAccess(req: FastifyRequest): boolean {
  const role = req.docRole;
  return hasDocPermission(role ?? null, 'owner');
}

/**
 * Get user ID from request (exported for use in routes).
 */
export function getUserId(req: FastifyRequest): string | undefined {
  return getUserIdFromRequest(req);
}

// Re-export DocRole type for convenience
export type { DocRole };
