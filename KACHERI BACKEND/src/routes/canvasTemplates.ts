// KACHERI BACKEND/src/routes/canvasTemplates.ts
// Design Studio: Frame Template Routes — CRUD with tag filtering
//
// Endpoints:
// - POST   /workspaces/:wid/templates           — Create template from frame
// - GET    /workspaces/:wid/templates           — List templates (paginated, tag/mode filter)
// - GET    /workspaces/:wid/templates/tags      — List distinct tags
// - GET    /workspaces/:wid/templates/:tid      — Get template
// - PATCH  /workspaces/:wid/templates/:tid      — Update template
// - DELETE /workspaces/:wid/templates/:tid      — Delete template
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D9

import type { FastifyPluginAsync } from "fastify";
import {
  CanvasTemplateStore,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "../store/canvasTemplates";
import {
  hasWorkspaceWriteAccess,
  hasWorkspaceReadAccess,
  requireWorkspaceMatch,
} from "../workspace/middleware";
import { logAuditEvent } from "../store/audit";
import { wsBroadcast } from "../realtime/globalHub";

/* ---------- Types ---------- */

interface WorkspaceParams {
  wid: string;
}

interface TemplateParams extends WorkspaceParams {
  tid: string;
}

interface ListTemplatesQuery {
  limit?: string;
  offset?: string;
  tag?: string;
  compositionMode?: string;
}

interface CreateTemplateBody {
  title: string;
  code: string;
  description?: string;
  thumbnailUrl?: string;
  tags?: string[];
  compositionMode?: string;
}

interface UpdateTemplateBody {
  title?: string;
  description?: string | null;
  tags?: string[];
  compositionMode?: string | null;
  thumbnailUrl?: string | null;
}

/* ---------- Helpers ---------- */

function getUserId(req: { headers: Record<string, unknown> }): string {
  const userId =
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local";
  return userId;
}

function capLimit(v?: string): number {
  const n = v ? Number(v) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

function parseOffset(v?: string): number {
  const n = v ? Number(v) : 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/* ---------- Routes ---------- */

export const canvasTemplateRoutes: FastifyPluginAsync = async (fastify) => {
  // ================================================================
  // 1. POST /workspaces/:wid/templates — Create template
  // ================================================================
  fastify.post<{ Params: WorkspaceParams; Body: CreateTemplateBody }>(
    "/workspaces/:wid/templates",
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
      const body = req.body || ({} as CreateTemplateBody);

      // Validate required fields
      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        return reply.code(400).send({
          error: "missing_title",
          message: "Template title is required",
        });
      }

      if (!body.code || typeof body.code !== "string") {
        return reply.code(400).send({
          error: "missing_code",
          message: "Template code is required",
        });
      }

      // Validate composition mode if provided
      if (
        body.compositionMode &&
        !CanvasTemplateStore.isValidCompositionMode(body.compositionMode)
      ) {
        return reply.code(400).send({
          error: "invalid_composition_mode",
          message: "Must be one of: deck, page, notebook, widget",
        });
      }

      // Validate tags if provided
      if (body.tags && !Array.isArray(body.tags)) {
        return reply.code(400).send({
          error: "invalid_tags",
          message: "Tags must be an array of strings",
        });
      }

      try {
        const template = await CanvasTemplateStore.create({
          workspaceId: wid,
          title: body.title.trim(),
          code: body.code,
          createdBy: userId,
          description: body.description,
          thumbnailUrl: body.thumbnailUrl,
          tags: body.tags,
          compositionMode: body.compositionMode,
        });

        await logAuditEvent({
          workspaceId: wid,
          actorId: userId,
          action: "template:create",
          targetType: "canvas_template",
          targetId: template.id,
          details: { title: template.title, tags: template.tags },
        });

        wsBroadcast(wid, {
          type: "template",
          action: "created",
          templateId: template.id,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(201).send(template);
      } catch (err) {
        req.log.error(err, "[canvasTemplates] Failed to create template");
        return reply.code(500).send({ error: "Failed to create template" });
      }
    },
  );

  // ================================================================
  // 2. GET /workspaces/:wid/templates — List templates
  // ================================================================
  fastify.get<{ Params: WorkspaceParams; Querystring: ListTemplatesQuery }>(
    "/workspaces/:wid/templates",
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
      const tag = req.query.tag?.trim() || undefined;
      const compositionMode = req.query.compositionMode?.trim() || undefined;

      const { templates, total } = await CanvasTemplateStore.list(wid, {
        limit,
        offset,
        tag,
        compositionMode,
      });

      return reply.code(200).send({
        workspaceId: wid,
        templates,
        total,
        limit,
        offset,
      });
    },
  );

  // ================================================================
  // 3. GET /workspaces/:wid/templates/tags — List distinct tags
  //    NOTE: Must be registered BEFORE /:tid to avoid "tags" matching tid param
  // ================================================================
  fastify.get<{ Params: WorkspaceParams }>(
    "/workspaces/:wid/templates/tags",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      if (!hasWorkspaceReadAccess(req)) {
        return reply.code(403).send({
          error: "viewer_required",
          message: "Requires viewer role or higher",
        });
      }

      const tags = await CanvasTemplateStore.listTags(wid);
      return reply.code(200).send({ workspaceId: wid, tags });
    },
  );

  // ================================================================
  // 4. GET /workspaces/:wid/templates/:tid — Get template
  // ================================================================
  fastify.get<{ Params: TemplateParams }>(
    "/workspaces/:wid/templates/:tid",
    async (req, reply) => {
      const { wid, tid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      if (!hasWorkspaceReadAccess(req)) {
        return reply.code(403).send({
          error: "viewer_required",
          message: "Requires viewer role or higher",
        });
      }

      const template = await CanvasTemplateStore.getById(tid);
      if (!template || template.workspaceId !== wid) {
        return reply.code(404).send({ error: "Template not found" });
      }

      return reply.code(200).send(template);
    },
  );

  // ================================================================
  // 5. PATCH /workspaces/:wid/templates/:tid — Update template
  // ================================================================
  fastify.patch<{ Params: TemplateParams; Body: UpdateTemplateBody }>(
    "/workspaces/:wid/templates/:tid",
    async (req, reply) => {
      const { wid, tid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher",
        });
      }

      const template = await CanvasTemplateStore.getById(tid);
      if (!template || template.workspaceId !== wid) {
        return reply.code(404).send({ error: "Template not found" });
      }

      const body = req.body || ({} as UpdateTemplateBody);
      const updates: UpdateTemplateInput = {};

      if (body.title !== undefined) updates.title = body.title;
      if (body.description !== undefined) updates.description = body.description;
      if (body.tags !== undefined) updates.tags = body.tags;
      if (body.compositionMode !== undefined) updates.compositionMode = body.compositionMode;
      if (body.thumbnailUrl !== undefined) updates.thumbnailUrl = body.thumbnailUrl;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({
          error: "no_updates",
          message: "No valid update fields provided",
        });
      }

      // Validate composition mode if provided
      if (
        updates.compositionMode !== undefined &&
        updates.compositionMode !== null &&
        !CanvasTemplateStore.isValidCompositionMode(updates.compositionMode)
      ) {
        return reply.code(400).send({
          error: "invalid_composition_mode",
          message: "Must be one of: deck, page, notebook, widget",
        });
      }

      try {
        const updated = await CanvasTemplateStore.update(tid, updates);
        if (!updated) {
          return reply.code(404).send({ error: "Template not found" });
        }

        const userId = getUserId(req);
        await logAuditEvent({
          workspaceId: wid,
          actorId: userId,
          action: "template:update",
          targetType: "canvas_template",
          targetId: tid,
          details: { fields: Object.keys(updates) },
        });

        wsBroadcast(wid, {
          type: "template",
          action: "updated",
          templateId: tid,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(200).send(updated);
      } catch (err) {
        req.log.error(err, "[canvasTemplates] Failed to update template");
        return reply.code(500).send({ error: "Failed to update template" });
      }
    },
  );

  // ================================================================
  // 6. DELETE /workspaces/:wid/templates/:tid — Delete template
  // ================================================================
  fastify.delete<{ Params: TemplateParams }>(
    "/workspaces/:wid/templates/:tid",
    async (req, reply) => {
      const { wid, tid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher",
        });
      }

      const template = await CanvasTemplateStore.getById(tid);
      if (!template || template.workspaceId !== wid) {
        return reply.code(404).send({ error: "Template not found" });
      }

      try {
        const deleted = await CanvasTemplateStore.delete(tid);
        if (!deleted) {
          return reply.code(404).send({ error: "Template not found" });
        }

        const userId = getUserId(req);
        await logAuditEvent({
          workspaceId: wid,
          actorId: userId,
          action: "template:delete",
          targetType: "canvas_template",
          targetId: tid,
          details: { title: template.title },
        });

        wsBroadcast(wid, {
          type: "template",
          action: "deleted",
          templateId: tid,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(204).send();
      } catch (err) {
        req.log.error(err, "[canvasTemplates] Failed to delete template");
        return reply.code(500).send({ error: "Failed to delete template" });
      }
    },
  );
};

export default canvasTemplateRoutes;
