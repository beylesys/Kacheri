// KACHERI BACKEND/src/routes/canvases.ts
// Design Studio: Canvas API Routes — CRUD, Search & Permissions
//
// Endpoints:
// - POST   /workspaces/:wid/canvases              — Create canvas
// - GET    /workspaces/:wid/canvases              — List canvases (paginated, sortable)
// - GET    /workspaces/:wid/canvases/search       — FTS search canvases
// - GET    /workspaces/:wid/canvases/:cid         — Get canvas with frames
// - PATCH  /workspaces/:wid/canvases/:cid         — Update canvas
// - DELETE /workspaces/:wid/canvases/:cid         — Soft-delete canvas
// - GET    /canvases/:cid/frames/:fid             — Get frame with code
// - PUT    /canvases/:cid/frames/:fid/code        — Update frame code (Power Mode)
// - PATCH  /canvases/:cid/frames/:fid             — Update frame metadata (speaker notes, title, etc.)
// - POST   /canvases/:cid/permissions             — Grant/update canvas permission
// - GET    /canvases/:cid/permissions             — List canvas permissions
// - DELETE /canvases/:cid/permissions/:userId     — Revoke canvas permission
// - GET    /workspaces/:wid/embed-whitelist       — Get workspace embed whitelist (E7)
// - PUT    /workspaces/:wid/embed-whitelist       — Update workspace embed whitelist (E7)
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A3, E7

import type { FastifyPluginAsync } from "fastify";
import { db } from "../db";
import {
  CanvasStore,
  type CompositionMode,
} from "../store/canvases";
import { CanvasFrameStore } from "../store/canvasFrames";
import {
  CanvasPermissionsStore,
  type CanvasRole,
  hasCanvasPermission,
  isValidCanvasRole,
  getEffectiveCanvasRole,
} from "../store/canvasPermissions";
import {
  hasWorkspaceWriteAccess,
  hasWorkspaceReadAccess,
  hasWorkspaceAdminAccess,
  requireWorkspaceMatch,
  getWorkspaceStore,
} from "../workspace/middleware";
import { logAuditEvent } from "../store/audit";
import { wsBroadcast, broadcastToUser } from "../realtime/globalHub";
import { createNotification } from "../store/notifications";
import { CanvasVersionStore } from "../store/canvasVersions";
import {
  CanvasExportStore,
  validateExportFormat,
  type ExportFormat,
} from "../store/canvasExports";
import { newProofPacket, writeProofPacket } from "../utils/proofs";
import { recordProof } from "../provenanceStore";
import { recordProvenance, listCanvasProvenance } from "../provenance";
import { getJobQueue } from "../jobs/queue";
import {
  WorkspaceEmbedWhitelistStore,
} from "../store/workspaceEmbedWhitelist";

/* ---------- Types ---------- */

interface WorkspaceParams {
  wid: string;
}

interface CanvasParams extends WorkspaceParams {
  cid: string;
}

interface CanvasOnlyParams {
  cid: string;
}

interface FrameParams {
  cid: string;
  fid: string;
}

interface PermissionUserParams {
  cid: string;
  userId: string;
}

interface ListCanvasesQuery {
  limit?: string;
  offset?: string;
  sortBy?: string;
  sortDir?: string;
}

interface SearchCanvasesQuery {
  q?: string;
  limit?: string;
  offset?: string;
}

interface CreateCanvasBody {
  title?: string;
  description?: string;
  compositionMode?: string;
}

interface UpdateCanvasBody {
  title?: string;
  description?: string | null;
  compositionMode?: string;
  themeJson?: Record<string, unknown> | null;
  kclVersion?: string;
}

interface UpdateFrameCodeBody {
  code: string;
}

interface UpdateFrameMetaBody {
  speakerNotes?: string | null;
  title?: string;
  durationMs?: number;
  transition?: string;
  metadata?: Record<string, unknown> | null;
}

interface SetPermissionBody {
  userId: string;
  role: string;
}

interface VersionParams {
  cid: string;
  vid: string;
}

interface ExportParams {
  cid: string;
  eid: string;
}

interface CreateVersionBody {
  name: string;
  description?: string;
}

interface CreateExportBody {
  format: string;
  metadata?: Record<string, unknown>;
}

interface ListQuery {
  limit?: string;
  offset?: string;
}

/* ---------- Helpers ---------- */

function getUserId(req: { headers: Record<string, unknown> }): string {
  const userId =
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local";
  return userId;
}

/** Clamp limit to [1, 200] with default 50 */
function capLimit(v?: string): number {
  const n = v ? Number(v) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

/** Parse offset to non-negative integer */
function parseOffset(v?: string): number {
  const n = v ? Number(v) : 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

const VALID_SORT_BY = ["updated_at", "created_at", "title"] as const;
type SortBy = (typeof VALID_SORT_BY)[number];

function parseSortBy(v?: string): SortBy {
  if (v && (VALID_SORT_BY as readonly string[]).includes(v)) return v as SortBy;
  return "updated_at";
}

function parseSortDir(v?: string): "asc" | "desc" {
  if (v === "asc") return "asc";
  return "desc";
}

/**
 * Resolve canvas-level access for a user.
 * Returns the effective role or null if no access.
 */
async function resolveCanvasRole(canvasId: string, userId: string): Promise<CanvasRole | null> {
  const wsStore = getWorkspaceStore(db);
  return getEffectiveCanvasRole(
    canvasId,
    userId,
    (workspaceId: string, uid: string) => wsStore.getUserRole(workspaceId, uid)
  );
}

/**
 * Check canvas access and send 403/404 on failure.
 * Returns the effective role on success, or null on failure (response already sent).
 */
async function checkCanvasAccess(
  req: { headers: Record<string, unknown> },
  reply: { code: (c: number) => { send: (b: unknown) => void } },
  canvasId: string,
  requiredRole: CanvasRole
): Promise<CanvasRole | null> {
  const userId = getUserId(req);
  const role = await resolveCanvasRole(canvasId, userId);
  if (!role) {
    reply.code(403).send({ error: "forbidden", message: "Access denied" });
    return null;
  }
  if (!hasCanvasPermission(role, requiredRole)) {
    reply.code(403).send({
      error: "forbidden",
      message: `Requires ${requiredRole} role or higher`,
    });
    return null;
  }
  return role;
}

/* ---------- Auto-Versioning Helper ---------- */

const AUTO_VERSION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Auto-versioning helper: creates a version snapshot if none exists
 * or the last version was created more than 5 minutes ago.
 * Called by canvasAi.ts before AI generation operations.
 */
export async function maybeAutoVersion(
  canvasId: string,
  userId: string
): Promise<{ created: boolean; versionId?: string }> {
  try {
    // Check latest version
    const { versions } = await CanvasVersionStore.listByCanvas(canvasId, { limit: 1 });

    if (versions.length > 0) {
      const lastVersionTime = new Date(versions[0].createdAt).getTime();
      if (Date.now() - lastVersionTime < AUTO_VERSION_INTERVAL_MS) {
        return { created: false };
      }
    }

    // Create auto-version snapshot
    const canvas = await CanvasStore.getById(canvasId);
    if (!canvas) return { created: false };

    const frames = await CanvasFrameStore.getByCanvas(canvasId);
    const snapshot = {
      canvas: {
        title: canvas.title,
        description: canvas.description,
        compositionMode: canvas.compositionMode,
        themeJson: canvas.themeJson,
        kclVersion: canvas.kclVersion,
      },
      frames: frames.map((f) => ({
        id: f.id,
        title: f.title,
        code: f.code,
        codeHash: f.codeHash,
        sortOrder: f.sortOrder,
        speakerNotes: f.speakerNotes,
        durationMs: f.durationMs,
        transition: f.transition,
        metadata: f.metadata,
      })),
      frameCount: frames.length,
      capturedAt: new Date().toISOString(),
    };

    const version = await CanvasVersionStore.create({
      canvasId,
      name: `Auto-save before AI (${new Date().toLocaleString()})`,
      description: "Automatic version created before AI generation",
      snapshotJson: JSON.stringify(snapshot),
      createdBy: userId,
    });

    return { created: true, versionId: version.id };
  } catch (err) {
    console.error("[canvases] Auto-versioning failed (non-fatal):", err);
    return { created: false };
  }
}

/* ---------- Routes ---------- */

export const canvasRoutes: FastifyPluginAsync = async (fastify) => {
  // ================================================================
  // 1. POST /workspaces/:wid/canvases — Create canvas
  // ================================================================
  fastify.post<{ Params: WorkspaceParams; Body: CreateCanvasBody }>(
    "/workspaces/:wid/canvases",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher",
        });
      }

      const userId = getUserId(req);
      const body = req.body || {};

      // Validate compositionMode if provided
      if (body.compositionMode && !CanvasStore.validateCompositionMode(body.compositionMode)) {
        return reply.code(400).send({
          error: "invalid_composition_mode",
          message: "Must be one of: deck, page, notebook, widget",
        });
      }

      try {
        const canvas = await CanvasStore.create({
          workspaceId: wid,
          createdBy: userId,
          title: body.title,
          description: body.description,
          compositionMode: body.compositionMode as CompositionMode | undefined,
        });

        logAuditEvent({
          workspaceId: wid,
          actorId: userId,
          action: "canvas:create",
          targetType: "canvas",
          targetId: canvas.id,
          details: { title: canvas.title, compositionMode: canvas.compositionMode },
        });

        wsBroadcast(wid, {
          type: "canvas",
          action: "created",
          canvasId: canvas.id,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(201).send(canvas);
      } catch (err) {
        req.log.error(err, "[canvases] Failed to create canvas");
        return reply.code(500).send({ error: "Failed to create canvas" });
      }
    }
  );

  // ================================================================
  // 2. GET /workspaces/:wid/canvases — List canvases (paginated)
  // ================================================================
  fastify.get<{ Params: WorkspaceParams; Querystring: ListCanvasesQuery }>(
    "/workspaces/:wid/canvases",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      if (!hasWorkspaceReadAccess(req)) {
        return reply.code(403).send({
          error: "viewer_required",
          message: "Requires viewer role or higher",
        });
      }

      const limit = capLimit(req.query.limit);
      const offset = parseOffset(req.query.offset);
      const sortBy = parseSortBy(req.query.sortBy);
      const sortDir = parseSortDir(req.query.sortDir);

      const { canvases, total } = await CanvasStore.listByWorkspace(wid, {
        limit,
        offset,
        sortBy,
        sortDir,
      });

      return reply.code(200).send({
        workspaceId: wid,
        canvases,
        total,
        limit,
        offset,
      });
    }
  );

  // ================================================================
  // 3. GET /workspaces/:wid/canvases/search — FTS search
  // ================================================================
  fastify.get<{ Params: WorkspaceParams; Querystring: SearchCanvasesQuery }>(
    "/workspaces/:wid/canvases/search",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      if (!hasWorkspaceReadAccess(req)) {
        return reply.code(403).send({
          error: "viewer_required",
          message: "Requires viewer role or higher",
        });
      }

      const q = req.query.q?.trim();
      if (!q) {
        return reply.code(400).send({
          error: "missing_query",
          message: "Query parameter 'q' is required",
        });
      }

      const limit = capLimit(req.query.limit);
      const offset = parseOffset(req.query.offset);

      const canvases = await CanvasStore.search(wid, q, { limit, offset });

      return reply.code(200).send({
        workspaceId: wid,
        canvases,
        total: canvases.length,
        query: q,
      });
    }
  );

  // ================================================================
  // 4. GET /workspaces/:wid/canvases/:cid — Get canvas with frames
  // ================================================================
  fastify.get<{ Params: CanvasParams }>(
    "/workspaces/:wid/canvases/:cid",
    async (req, reply) => {
      const { wid, cid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas || canvas.workspaceId !== wid) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (viewer+)
      if (!await checkCanvasAccess(req, reply, cid, "viewer")) return;

      const frames = await CanvasFrameStore.getByCanvas(cid);

      return reply.code(200).send({
        ...canvas,
        frames,
      });
    }
  );

  // ================================================================
  // 5. PATCH /workspaces/:wid/canvases/:cid — Update canvas
  // ================================================================
  fastify.patch<{ Params: CanvasParams; Body: UpdateCanvasBody }>(
    "/workspaces/:wid/canvases/:cid",
    async (req, reply) => {
      const { wid, cid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas || canvas.workspaceId !== wid) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (editor+)
      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      const body = req.body || {};

      // Validate compositionMode if provided
      if (body.compositionMode && !CanvasStore.validateCompositionMode(body.compositionMode)) {
        return reply.code(400).send({
          error: "invalid_composition_mode",
          message: "Must be one of: deck, page, notebook, widget",
        });
      }

      try {
        const updates: Record<string, unknown> = {};
        if (body.title !== undefined) updates.title = body.title;
        if (body.description !== undefined) updates.description = body.description;
        if (body.compositionMode !== undefined) updates.compositionMode = body.compositionMode as CompositionMode;
        if (body.themeJson !== undefined) updates.themeJson = body.themeJson;
        if (body.kclVersion !== undefined) updates.kclVersion = body.kclVersion;

        if (Object.keys(updates).length === 0) {
          return reply.code(400).send({
            error: "no_updates",
            message: "No valid fields to update",
          });
        }

        const updated = await CanvasStore.update(cid, updates as any);
        if (!updated) {
          return reply.code(404).send({ error: "Canvas not found" });
        }

        const userId = getUserId(req);

        logAuditEvent({
          workspaceId: wid,
          actorId: userId,
          action: "canvas:update",
          targetType: "canvas",
          targetId: cid,
          details: { fields: Object.keys(updates) },
        });

        wsBroadcast(wid, {
          type: "canvas",
          action: "updated",
          canvasId: cid,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(200).send(updated);
      } catch (err) {
        req.log.error(err, "[canvases] Failed to update canvas");
        return reply.code(500).send({ error: "Failed to update canvas" });
      }
    }
  );

  // ================================================================
  // 6. DELETE /workspaces/:wid/canvases/:cid — Soft-delete canvas
  // ================================================================
  fastify.delete<{ Params: CanvasParams }>(
    "/workspaces/:wid/canvases/:cid",
    async (req, reply) => {
      const { wid, cid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas || canvas.workspaceId !== wid) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (owner only)
      if (!await checkCanvasAccess(req, reply, cid, "owner")) return;

      try {
        const deleted = await CanvasStore.softDelete(cid);
        if (!deleted) {
          return reply.code(404).send({ error: "Canvas not found" });
        }

        const userId = getUserId(req);

        logAuditEvent({
          workspaceId: wid,
          actorId: userId,
          action: "canvas:delete",
          targetType: "canvas",
          targetId: cid,
          details: { title: canvas.title },
        });

        wsBroadcast(wid, {
          type: "canvas",
          action: "deleted",
          canvasId: cid,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(204).send();
      } catch (err) {
        req.log.error(err, "[canvases] Failed to delete canvas");
        return reply.code(500).send({ error: "Failed to delete canvas" });
      }
    }
  );

  // ================================================================
  // 7. GET /canvases/:cid/frames/:fid — Get frame with code
  // ================================================================
  fastify.get<{ Params: FrameParams }>(
    "/canvases/:cid/frames/:fid",
    async (req, reply) => {
      const { cid, fid } = req.params;

      // Look up canvas to verify existence and get workspace context
      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (viewer+)
      if (!await checkCanvasAccess(req, reply, cid, "viewer")) return;

      const frame = await CanvasFrameStore.getById(fid);
      if (!frame || frame.canvasId !== cid) {
        return reply.code(404).send({ error: "Frame not found" });
      }

      return reply.code(200).send(frame);
    }
  );

  // ================================================================
  // 8. PUT /canvases/:cid/frames/:fid/code — Update frame code
  // ================================================================
  fastify.put<{ Params: FrameParams; Body: UpdateFrameCodeBody }>(
    "/canvases/:cid/frames/:fid/code",
    async (req, reply) => {
      const { cid, fid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (editor+)
      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      // Check if canvas is locked by another user
      if (canvas.isLocked) {
        const userId = getUserId(req);
        if (canvas.lockedBy && canvas.lockedBy !== userId) {
          return reply.code(409).send({
            error: "canvas_locked",
            message: `Canvas is locked by another user`,
          });
        }
      }

      const frame = await CanvasFrameStore.getById(fid);
      if (!frame || frame.canvasId !== cid) {
        return reply.code(404).send({ error: "Frame not found" });
      }

      const body = req.body || {};
      if (typeof body.code !== "string") {
        return reply.code(400).send({
          error: "missing_code",
          message: "Request body must include 'code' field",
        });
      }

      try {
        const updated = await CanvasFrameStore.updateCode(fid, body.code);
        if (!updated) {
          return reply.code(404).send({ error: "Frame not found" });
        }

        const userId = getUserId(req);

        wsBroadcast(canvas.workspaceId, {
          type: "canvas",
          action: "frame_updated",
          canvasId: cid,
          frameId: fid,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(200).send(updated);
      } catch (err) {
        req.log.error(err, "[canvases] Failed to update frame code");
        return reply.code(500).send({ error: "Failed to update frame code" });
      }
    }
  );

  // ================================================================
  // 8b. PATCH /canvases/:cid/frames/:fid — Update frame metadata (D6)
  // ================================================================
  fastify.patch<{ Params: FrameParams; Body: UpdateFrameMetaBody }>(
    "/canvases/:cid/frames/:fid",
    async (req, reply) => {
      const { cid, fid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (editor+)
      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      const frame = await CanvasFrameStore.getById(fid);
      if (!frame || frame.canvasId !== cid) {
        return reply.code(404).send({ error: "Frame not found" });
      }

      const body = req.body || {};
      const updates: {
        speakerNotes?: string | null;
        title?: string;
        durationMs?: number;
        transition?: string;
        metadata?: Record<string, unknown> | null;
      } = {};

      if ("speakerNotes" in body) updates.speakerNotes = body.speakerNotes ?? null;
      if ("title" in body && typeof body.title === "string") updates.title = body.title;
      if ("durationMs" in body && typeof body.durationMs === "number") updates.durationMs = body.durationMs;
      if ("transition" in body && typeof body.transition === "string") updates.transition = body.transition;
      if ("metadata" in body) updates.metadata = body.metadata ?? null;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({
          error: "no_updates",
          message: "Request body must include at least one update field (speakerNotes, title, durationMs, transition, metadata)",
        });
      }

      try {
        const updated = await CanvasFrameStore.update(fid, updates);
        if (!updated) {
          return reply.code(404).send({ error: "Frame not found" });
        }

        const userId = getUserId(req);

        wsBroadcast(canvas.workspaceId, {
          type: "canvas",
          action: "frame_updated",
          canvasId: cid,
          frameId: fid,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(200).send(updated);
      } catch (err) {
        req.log.error(err, "[canvases] Failed to update frame metadata");
        return reply.code(500).send({ error: "Failed to update frame metadata" });
      }
    }
  );

  // ================================================================
  // 9. POST /canvases/:cid/permissions — Grant/update permission
  // ================================================================
  fastify.post<{ Params: CanvasOnlyParams; Body: SetPermissionBody }>(
    "/canvases/:cid/permissions",
    async (req, reply) => {
      const { cid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Only canvas owner can manage permissions
      if (!await checkCanvasAccess(req, reply, cid, "owner")) return;

      const body = req.body || {};
      if (!body.userId || typeof body.userId !== "string") {
        return reply.code(400).send({
          error: "missing_user_id",
          message: "Request body must include 'userId'",
        });
      }
      if (!body.role || !isValidCanvasRole(body.role)) {
        return reply.code(400).send({
          error: "invalid_role",
          message: "Role must be one of: owner, editor, viewer",
        });
      }

      const targetUserId = body.userId.trim();
      const role = body.role as CanvasRole;
      const actorId = getUserId(req);

      try {
        // Check if permission already exists
        const existing = await CanvasPermissionsStore.getCanvasPermission(cid, targetUserId);
        let permission;

        if (existing) {
          // Update existing permission
          permission = await CanvasPermissionsStore.updateCanvasPermission(cid, targetUserId, role);

          logAuditEvent({
            workspaceId: canvas.workspaceId,
            actorId,
            action: "canvas:permission:update",
            targetType: "canvas_permission",
            targetId: cid,
            details: { userId: targetUserId, role, previousRole: existing.role },
          });
        } else {
          // Grant new permission
          permission = await CanvasPermissionsStore.grantCanvasPermission(cid, targetUserId, role, actorId);

          logAuditEvent({
            workspaceId: canvas.workspaceId,
            actorId,
            action: "canvas:permission:grant",
            targetType: "canvas_permission",
            targetId: cid,
            details: { userId: targetUserId, role },
          });
        }

        // Notify the target user (if different from actor)
        if (targetUserId !== actorId) {
          const notification = await createNotification({
            userId: targetUserId,
            workspaceId: canvas.workspaceId,
            type: "canvas_shared",
            title: "A canvas was shared with you",
            body: `"${canvas.title}" — ${role} access`,
            linkType: "canvas",
            linkId: cid,
            actorId,
          });

          if (notification) {
            broadcastToUser(targetUserId, {
              type: "notification",
              notificationId: notification.id,
              userId: targetUserId,
              notificationType: "canvas_shared",
              title: notification.title,
              ts: Date.now(),
            } as any);
          }
        }

        wsBroadcast(canvas.workspaceId, {
          type: "canvas",
          action: "permission_changed",
          canvasId: cid,
          authorId: actorId,
          ts: Date.now(),
        } as any);

        return reply.code(200).send(permission);
      } catch (err) {
        req.log.error(err, "[canvases] Failed to set canvas permission");
        return reply.code(500).send({ error: "Failed to set canvas permission" });
      }
    }
  );

  // ================================================================
  // 10. GET /canvases/:cid/permissions — List canvas permissions
  // ================================================================
  fastify.get<{ Params: CanvasOnlyParams }>(
    "/canvases/:cid/permissions",
    async (req, reply) => {
      const { cid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Only canvas owner can view permissions
      if (!await checkCanvasAccess(req, reply, cid, "owner")) return;

      const permissions = await CanvasPermissionsStore.listCanvasPermissions(cid);

      return reply.code(200).send({
        canvasId: cid,
        permissions,
      });
    }
  );

  // ================================================================
  // 11. DELETE /canvases/:cid/permissions/:userId — Revoke permission
  // ================================================================
  fastify.delete<{ Params: PermissionUserParams }>(
    "/canvases/:cid/permissions/:userId",
    async (req, reply) => {
      const { cid, userId: targetUserId } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Only canvas owner can revoke permissions
      if (!await checkCanvasAccess(req, reply, cid, "owner")) return;

      const revoked = await CanvasPermissionsStore.revokeCanvasPermission(cid, targetUserId);
      if (!revoked) {
        return reply.code(404).send({ error: "Permission not found" });
      }

      const actorId = getUserId(req);

      logAuditEvent({
        workspaceId: canvas.workspaceId,
        actorId,
        action: "canvas:permission:revoke",
        targetType: "canvas_permission",
        targetId: cid,
        details: { userId: targetUserId },
      });

      wsBroadcast(canvas.workspaceId, {
        type: "canvas",
        action: "permission_changed",
        canvasId: cid,
        authorId: actorId,
        ts: Date.now(),
      } as any);

      return reply.code(204).send();
    }
  );

  // ================================================================
  // 12. POST /canvases/:cid/versions — Create named version snapshot
  // ================================================================
  fastify.post<{ Params: CanvasOnlyParams; Body: CreateVersionBody }>(
    "/canvases/:cid/versions",
    async (req, reply) => {
      const { cid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (editor+)
      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      const body = req.body || {} as CreateVersionBody;
      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return reply.code(400).send({
          error: "missing_name",
          message: "Version name is required",
        });
      }

      try {
        const userId = getUserId(req);
        const frames = await CanvasFrameStore.getByCanvas(cid);

        // Build snapshot JSON capturing full canvas state
        const snapshot = {
          canvas: {
            title: canvas.title,
            description: canvas.description,
            compositionMode: canvas.compositionMode,
            themeJson: canvas.themeJson,
            kclVersion: canvas.kclVersion,
          },
          frames: frames.map((f) => ({
            id: f.id,
            title: f.title,
            code: f.code,
            codeHash: f.codeHash,
            sortOrder: f.sortOrder,
            speakerNotes: f.speakerNotes,
            durationMs: f.durationMs,
            transition: f.transition,
            metadata: f.metadata,
          })),
          frameCount: frames.length,
          capturedAt: new Date().toISOString(),
        };

        const version = await CanvasVersionStore.create({
          canvasId: cid,
          name: body.name.trim(),
          description: body.description?.trim(),
          snapshotJson: JSON.stringify(snapshot),
          createdBy: userId,
        });

        logAuditEvent({
          workspaceId: canvas.workspaceId,
          actorId: userId,
          action: "canvas:version:create",
          targetType: "canvas_version",
          targetId: version.id,
          details: {
            canvasId: cid,
            versionName: version.name,
            frameCount: frames.length,
          },
        });

        wsBroadcast(canvas.workspaceId, {
          type: "canvas",
          action: "version_created",
          canvasId: cid,
          versionId: version.id,
          authorId: userId,
          ts: Date.now(),
        } as any);

        // Return summary (without full snapshotJson)
        return reply.code(201).send({
          id: version.id,
          canvasId: version.canvasId,
          name: version.name,
          description: version.description,
          createdBy: version.createdBy,
          createdAt: version.createdAt,
          frameCount: frames.length,
        });
      } catch (err) {
        req.log.error(err, "[canvases] Failed to create version");
        return reply.code(500).send({ error: "Failed to create version" });
      }
    }
  );

  // ================================================================
  // 13. GET /canvases/:cid/versions — List versions (paginated)
  // ================================================================
  fastify.get<{ Params: CanvasOnlyParams; Querystring: ListQuery }>(
    "/canvases/:cid/versions",
    async (req, reply) => {
      const { cid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (viewer+)
      if (!await checkCanvasAccess(req, reply, cid, "viewer")) return;

      const limit = capLimit(req.query.limit);
      const offset = parseOffset(req.query.offset);

      const { versions, total } = await CanvasVersionStore.listByCanvas(cid, {
        limit,
        offset,
      });

      return reply.code(200).send({
        canvasId: cid,
        versions,
        total,
        limit,
        offset,
      });
    }
  );

  // ================================================================
  // 14. POST /canvases/:cid/versions/:vid/restore — Restore to version
  // ================================================================
  fastify.post<{ Params: VersionParams }>(
    "/canvases/:cid/versions/:vid/restore",
    async (req, reply) => {
      const { cid, vid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (editor+)
      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      const userId = getUserId(req);

      // Lock check
      if (canvas.isLocked && canvas.lockedBy && canvas.lockedBy !== userId) {
        return reply.code(409).send({
          error: "canvas_locked",
          message: "Canvas is locked by another user",
        });
      }

      // Get version with full snapshot
      const version = await CanvasVersionStore.getById(vid);
      if (!version || version.canvasId !== cid) {
        return reply.code(404).send({ error: "Version not found" });
      }

      try {
        const snapshot = JSON.parse(version.snapshotJson);

        // Transaction: delete all current frames, restore canvas metadata, recreate frames
        await db.transaction(async (_tx) => {
          // 1. Delete all current frames
          await CanvasFrameStore.deleteAllByCanvas(cid);

          // 2. Restore canvas metadata from snapshot
          if (snapshot.canvas) {
            const updates: Record<string, unknown> = {};
            if (snapshot.canvas.title !== undefined) updates.title = snapshot.canvas.title;
            if (snapshot.canvas.description !== undefined) updates.description = snapshot.canvas.description;
            if (snapshot.canvas.compositionMode !== undefined) updates.compositionMode = snapshot.canvas.compositionMode;
            if (snapshot.canvas.themeJson !== undefined) updates.themeJson = snapshot.canvas.themeJson;
            if (snapshot.canvas.kclVersion !== undefined) updates.kclVersion = snapshot.canvas.kclVersion;

            if (Object.keys(updates).length > 0) {
              await CanvasStore.update(cid, updates as any);
            }
          }

          // 3. Recreate frames from snapshot
          if (Array.isArray(snapshot.frames)) {
            for (const frame of snapshot.frames) {
              await CanvasFrameStore.create({
                canvasId: cid,
                title: frame.title ?? null,
                code: frame.code ?? "",
                sortOrder: frame.sortOrder ?? 0,
                speakerNotes: frame.speakerNotes ?? null,
                durationMs: frame.durationMs ?? 5000,
                transition: frame.transition ?? "fade",
              });
            }
          }
        });

        // Re-read restored canvas with frames
        const restoredCanvas = await CanvasStore.getById(cid);
        const restoredFrames = await CanvasFrameStore.getByCanvas(cid);

        logAuditEvent({
          workspaceId: canvas.workspaceId,
          actorId: userId,
          action: "canvas:version:restore",
          targetType: "canvas_version",
          targetId: vid,
          details: {
            canvasId: cid,
            versionName: version.name,
            framesRestored: restoredFrames.length,
          },
        });

        wsBroadcast(canvas.workspaceId, {
          type: "canvas",
          action: "version_restored",
          canvasId: cid,
          versionId: vid,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(200).send({
          ...restoredCanvas,
          frames: restoredFrames,
          restoredFrom: {
            versionId: vid,
            versionName: version.name,
          },
        });
      } catch (err) {
        req.log.error(err, "[canvases] Failed to restore version");
        return reply.code(500).send({ error: "Failed to restore version" });
      }
    }
  );

  // ================================================================
  // 15. POST /canvases/:cid/export — Trigger export
  // ================================================================
  fastify.post<{ Params: CanvasOnlyParams; Body: CreateExportBody }>(
    "/canvases/:cid/export",
    async (req, reply) => {
      const { cid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (viewer+)
      if (!await checkCanvasAccess(req, reply, cid, "viewer")) return;

      const body = req.body || {} as CreateExportBody;
      if (!body.format || typeof body.format !== "string") {
        return reply.code(400).send({
          error: "missing_format",
          message: "Export format is required",
        });
      }

      if (!validateExportFormat(body.format)) {
        return reply.code(400).send({
          error: "invalid_format",
          message: "Format must be one of: pdf, pptx, html_bundle, html_standalone, png, svg, embed, mp4",
        });
      }

      try {
        const userId = getUserId(req);
        const workspaceId = canvas.workspaceId;

        // Create export record (status: pending)
        const exportRecord = await CanvasExportStore.create({
          canvasId: cid,
          format: body.format as ExportFormat,
          createdBy: userId,
          metadata: body.metadata,
        });

        // Create proof packet for the export request
        const packet = newProofPacket(
          "design:export",
          { type: "system" },
          { canvasId: cid, format: body.format, userId },
          { exportId: exportRecord.id, status: "pending" }
        );
        const proofPath = await writeProofPacket(packet);
        const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

        // Record proof in DB
        await recordProof({
          doc_id: "",
          kind: "design:export",
          hash: proofHash,
          path: "",
          meta: {
            proofFile: proofPath,
            canvasId: cid,
            format: body.format,
            exportId: exportRecord.id,
            workspaceId,
          },
        });

        // Provenance log (non-fatal)
        try {
          recordProvenance({
            docId: "",
            action: "design:export",
            actor: "system",
            actorId: userId,
            workspaceId,
            details: {
              canvasId: cid,
              format: body.format,
              exportId: exportRecord.id,
              proofHash,
            },
          });
        } catch {
          // non-fatal
        }

        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "canvas:export:create",
          targetType: "canvas_export",
          targetId: exportRecord.id,
          details: {
            canvasId: cid,
            format: body.format,
          },
        });

        // Enqueue canvas:export job for the export worker (D2)
        try {
          const jobQueue = getJobQueue();
          await jobQueue.add(
            "canvas:export" as any,
            { exportId: exportRecord.id, canvasId: cid, format: body.format, workspaceId },
            userId
          );
        } catch (jobErr) {
          req.log.warn(jobErr, "[canvases] Failed to enqueue export job (non-fatal)");
        }

        return reply.code(202).send({
          ...exportRecord,
          proofId: packet.id,
        });
      } catch (err) {
        req.log.error(err, "[canvases] Failed to create export");
        return reply.code(500).send({ error: "Failed to create export" });
      }
    }
  );

  // ================================================================
  // 16. GET /canvases/:cid/exports/:eid — Get export status
  // ================================================================
  fastify.get<{ Params: ExportParams }>(
    "/canvases/:cid/exports/:eid",
    async (req, reply) => {
      const { cid, eid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (viewer+)
      if (!await checkCanvasAccess(req, reply, cid, "viewer")) return;

      const exportRecord = await CanvasExportStore.getById(eid);
      if (!exportRecord || exportRecord.canvasId !== cid) {
        return reply.code(404).send({ error: "Export not found" });
      }

      return reply.code(200).send(exportRecord);
    }
  );

  // ================================================================
  // 17. GET /canvases/:cid/provenance — List canvas provenance timeline
  // ================================================================
  fastify.get<{ Params: CanvasOnlyParams }>(
    "/canvases/:cid/provenance",
    async (req, reply) => {
      const { cid } = req.params;

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (viewer+)
      if (!await checkCanvasAccess(req, reply, cid, "viewer")) return;

      const query = req.query as {
        action?: string;
        limit?: string;
        before?: string;
        from?: string;
        to?: string;
      };

      const rows = await listCanvasProvenance(cid, {
        action: query.action,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        before: query.before ? parseInt(query.before, 10) : undefined,
        from: query.from ? parseInt(query.from, 10) : undefined,
        to: query.to ? parseInt(query.to, 10) : undefined,
      });

      return reply.code(200).send(rows);
    }
  );

  // ================================================================
  // 20. GET /workspaces/:wid/embed-whitelist — Get workspace embed whitelist (E7)
  // ================================================================
  fastify.get<{ Params: WorkspaceParams }>(
    "/workspaces/:wid/embed-whitelist",
    async (req, reply) => {
      const { wid } = req.params;

      if (!requireWorkspaceMatch(req, reply, wid)) return;
      if (!hasWorkspaceReadAccess(req)) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Requires viewer role or higher",
        });
      }

      try {
        const result = await WorkspaceEmbedWhitelistStore.getEffectiveWhitelist(wid);
        return reply.code(200).send(result);
      } catch (err) {
        req.log.error(err, "[canvases] Failed to get embed whitelist");
        return reply.code(500).send({ error: "Failed to get embed whitelist" });
      }
    }
  );

  // ================================================================
  // 21. PUT /workspaces/:wid/embed-whitelist — Update workspace embed whitelist (E7)
  // ================================================================
  fastify.put<{ Params: WorkspaceParams }>(
    "/workspaces/:wid/embed-whitelist",
    async (req, reply) => {
      const { wid } = req.params;

      if (!requireWorkspaceMatch(req, reply, wid)) return;
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Requires admin role or higher",
        });
      }

      const body = req.body as { domains?: unknown } | undefined;
      if (!body || !Array.isArray(body.domains)) {
        return reply.code(400).send({
          error: "invalid_body",
          message: "Request body must include 'domains' as an array of strings",
        });
      }

      // Validate each domain
      const domains = body.domains as unknown[];
      const validDomains: string[] = [];
      const invalidDomains: string[] = [];

      for (const d of domains) {
        if (typeof d !== "string") {
          invalidDomains.push(String(d));
          continue;
        }
        const trimmed = d.trim().toLowerCase();
        if (WorkspaceEmbedWhitelistStore.isValidDomain(trimmed)) {
          validDomains.push(trimmed);
        } else {
          invalidDomains.push(trimmed);
        }
      }

      if (invalidDomains.length > 0) {
        return reply.code(400).send({
          error: "invalid_domains",
          message: `Invalid domain(s): ${invalidDomains.join(", ")}. Domains must be valid hostnames (no protocol, path, or port).`,
        });
      }

      try {
        await WorkspaceEmbedWhitelistStore.setCustomDomains(wid, validDomains);

        const actorId = getUserId(req);

        logAuditEvent({
          workspaceId: wid,
          actorId,
          action: "canvas:embed_whitelist:update",
          targetType: "workspace",
          targetId: wid,
          details: { domains: validDomains },
        });

        wsBroadcast(wid, {
          type: "workspace",
          action: "embed_whitelist_updated",
          authorId: actorId,
          ts: Date.now(),
        } as any);

        const result = await WorkspaceEmbedWhitelistStore.getEffectiveWhitelist(wid);
        return reply.code(200).send(result);
      } catch (err) {
        req.log.error(err, "[canvases] Failed to update embed whitelist");
        return reply.code(500).send({ error: "Failed to update embed whitelist" });
      }
    }
  );
};

export default canvasRoutes;
