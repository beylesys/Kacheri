/**
 * Workspace Middleware
 *
 * Extracts workspace context from request and enforces access.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DbAdapter } from '../db/types';
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
 * Extracts workspace ID from request path params.
 * Checks both :wid and :workspaceId naming conventions.
 */
function extractPathWorkspaceId(req: FastifyRequest): string | undefined {
  const params = req.params as Record<string, string> | undefined;
  if (!params) return undefined;
  const wid = params.wid?.trim();
  if (wid) return wid;
  const workspaceId = params.workspaceId?.trim();
  if (workspaceId) return workspaceId;
  return undefined;
}

/**
 * Extracts workspace ID from request headers/query.
 */
function extractHeaderWorkspaceId(req: FastifyRequest): string | undefined {
  const header = (req.headers['x-workspace-id'] as string)?.trim();
  if (header) return header;
  const query = (req.query as Record<string, string>)?.workspaceId?.trim();
  if (query) return query;
  return undefined;
}

/**
 * Resolves workspace ID from request.
 * Priority: path param > header > query param.
 * Returns { workspaceId, mismatch } — mismatch is true when both path
 * and header are present but differ (authorization bypass attempt).
 */
function resolveWorkspaceId(req: FastifyRequest): { workspaceId: string | undefined; mismatch: boolean } {
  const pathWid = extractPathWorkspaceId(req);
  const headerWid = extractHeaderWorkspaceId(req);

  // If both exist and differ → mismatch (potential attack)
  if (pathWid && headerWid && pathWid !== headerWid) {
    return { workspaceId: undefined, mismatch: true };
  }

  // Path param is source of truth when present, then header/query fallback
  return { workspaceId: pathWid || headerWid, mismatch: false };
}

/**
 * Gets user ID, handling dev mode bypass.
 * Priority: authenticated JWT identity (req.user) > dev header fallback
 */
function getUserIdFromRequest(req: FastifyRequest): string | undefined {
  // Prefer authenticated identity from JWT (set by auth middleware)
  if (req.user?.id) return req.user.id;

  // Dev mode fallback: X-Dev-User header
  const authConfig = getAuthConfig();
  if (authConfig.devBypassAuth) {
    const devUser = (req.headers['x-dev-user'] as string)?.trim();
    if (devUser) {
      return `user_${devUser}`;
    }
  }

  return undefined;
}

/**
 * Register workspace context extraction middleware.
 * This runs on every request and populates req.workspaceId and req.workspaceRole.
 */
export function registerWorkspaceMiddleware(app: FastifyInstance, db: DbAdapter): void {
  const store = createWorkspaceStore(db);

  app.addHook('preHandler', async function workspaceContext(
    req: FastifyRequest,
    reply: FastifyReply
  ) {
    const { workspaceId, mismatch } = resolveWorkspaceId(req);

    // Security: path param and header workspace IDs must match if both present
    if (mismatch) {
      reply.code(400).send({
        error: 'workspace_mismatch',
        message: 'X-Workspace-Id header does not match workspace in URL path',
      });
      return;
    }

    if (!workspaceId) {
      return;
    }

    req.workspaceId = workspaceId;

    // Try to get user's role in this workspace
    const userId = getUserIdFromRequest(req);
    if (userId) {
      const role = await store.getUserRole(workspaceId, userId);
      if (role) {
        req.workspaceRole = role;
      }
    }
  });
}

/**
 * Route decorator factory: require workspace membership with minimum role.
 */
export function requireWorkspaceRole(db: DbAdapter, minRole: WorkspaceRole) {
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

    const role = await store.getUserRole(workspaceId, userId);
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
 * Defense-in-depth: validate that the workspace a route intends to operate on
 * matches the middleware-resolved req.workspaceId.
 * Call this at the top of workspace-scoped route handlers.
 * Returns true if OK. Sends 400 and returns false on mismatch.
 */
export function requireWorkspaceMatch(
  req: FastifyRequest,
  reply: FastifyReply,
  operatingWorkspaceId: string
): boolean {
  if (req.workspaceId && req.workspaceId !== operatingWorkspaceId) {
    reply.code(400).send({
      error: 'workspace_mismatch',
      message: 'Route workspace does not match resolved workspace context',
    });
    return false;
  }
  // If middleware didn't resolve a workspace (e.g., no header), adopt the path param
  if (!req.workspaceId) {
    req.workspaceId = operatingWorkspaceId;
  }
  return true;
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
export function getWorkspaceStore(db: DbAdapter): WorkspaceStore {
  return createWorkspaceStore(db);
}

// ============================================
// Doc-level permission helpers
// ============================================

/**
 * Get the effective doc role for a user on a document.
 * Uses the permission resolution order: doc permission > workspace role > doc creator.
 */
export async function getEffectiveDocRole(
  db: DbAdapter,
  docId: string,
  req: FastifyRequest
): Promise<DocRole | null> {
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

// ============================================
// Shared doc-access guard (centralized)
// ============================================

/**
 * Require an authenticated user. Sends 401 and returns null if missing.
 */
export function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    reply.code(401).send({ error: 'Authentication required' });
    return null;
  }
  return userId;
}

/**
 * Check doc-level access. Sends 403 and returns false if denied.
 * Sets req.docRole on success.
 */
export async function checkDocAccess(
  db: DbAdapter,
  req: FastifyRequest,
  reply: FastifyReply,
  docId: string,
  requiredRole: DocRole
): Promise<boolean> {
  const role = await getEffectiveDocRole(db, docId, req);
  if (!role) {
    reply.code(403).send({ error: 'forbidden', message: 'Access denied' });
    return false;
  }
  if (!hasDocPermission(role, requiredRole)) {
    reply.code(403).send({ error: 'forbidden', message: `Requires ${requiredRole} role or higher` });
    return false;
  }
  req.docRole = role;
  return true;
}

// ============================================
// Platform-level admin helpers
// ============================================

/**
 * Platform admin list from KACHERI_ADMIN_USERS env var.
 * Comma-separated user IDs. Parsed once at module load.
 * When empty, all authenticated users are allowed (dev-friendly default).
 * Must be configured before production deployment.
 */
const PLATFORM_ADMINS: Set<string> = new Set(
  (process.env.KACHERI_ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean)
);

/**
 * Check if the authenticated user is a platform admin.
 * If KACHERI_ADMIN_USERS is not configured, any authenticated user passes
 * (preserves current open behavior for development).
 */
export function isPlatformAdmin(req: FastifyRequest): boolean {
  if (PLATFORM_ADMINS.size === 0) return !!req.user?.id;
  const userId = req.user?.id;
  if (!userId) return false;
  return PLATFORM_ADMINS.has(userId);
}

/**
 * Guard: require platform admin access. Sends 403 and returns false if denied.
 */
export function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!isPlatformAdmin(req)) {
    reply.code(403).send({ error: 'forbidden', message: 'Platform admin access required' });
    return false;
  }
  return true;
}

// Re-export DocRole type for convenience
export type { DocRole };
