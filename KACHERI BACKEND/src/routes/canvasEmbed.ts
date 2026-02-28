// KACHERI BACKEND/src/routes/canvasEmbed.ts
// Cross-product: Canvas Frame Embedding for Docs
//
// Provides a read-only endpoint for fetching frame render data
// so that Docs can embed canvas frames inline via Tiptap extension.
//
// Registered only when BOTH docs and design-studio products are enabled.
//
// Endpoints:
// - GET /embed/frames/:fid/render — Get frame code + KCL version for embedding
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice P9

import type { FastifyPluginAsync } from "fastify";
import { db } from "../db";
import { CanvasStore } from "../store/canvases";
import { CanvasFrameStore } from "../store/canvasFrames";
import {
  type CanvasRole,
  hasCanvasPermission,
  getEffectiveCanvasRole,
} from "../store/canvasPermissions";
import { getWorkspaceStore } from "../workspace/middleware";
import { createDocLink } from "../store/docLinks";

/* ---------- Types ---------- */

interface FrameRenderParams {
  fid: string;
}

interface FrameRenderQuery {
  docId?: string;
}

/* ---------- Helpers ---------- */

function getUserId(req: { headers: Record<string, unknown> }): string {
  const userId =
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local";
  return userId;
}

async function resolveCanvasRole(canvasId: string, userId: string): Promise<CanvasRole | null> {
  const wsStore = getWorkspaceStore(db);
  return getEffectiveCanvasRole(
    canvasId,
    userId,
    (workspaceId: string, uid: string) => wsStore.getUserRole(workspaceId, uid)
  );
}

/* ---------- Plugin ---------- */

const canvasEmbedRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /embed/frames/:fid/render
   *
   * Returns frame code and KCL version for embedding in Docs.
   * Read-only — requires canvas viewer+ access.
   *
   * Query params:
   * - docId (optional): when provided, creates a doc_link record
   *   with link_text='canvas_embed' for provenance tracking.
   */
  fastify.get<{ Params: FrameRenderParams; Querystring: FrameRenderQuery }>(
    "/embed/frames/:fid/render",
    async (req, reply) => {
      const { fid } = req.params;
      const { docId } = req.query;

      // 1. Look up the frame
      const frame = await CanvasFrameStore.getById(fid);
      if (!frame) {
        return reply.code(404).send({ error: "not_found", message: "Frame not found" });
      }

      // 2. Look up the canvas for kclVersion and title
      const canvas = await CanvasStore.getById(frame.canvasId);
      if (!canvas) {
        return reply.code(404).send({ error: "not_found", message: "Canvas not found" });
      }

      // 3. Check viewer+ access on the canvas
      const userId = getUserId(req);
      const role = await resolveCanvasRole(canvas.id, userId);
      if (!role || !hasCanvasPermission(role, "viewer")) {
        return reply.code(403).send({ error: "forbidden", message: "Access denied" });
      }

      // 4. Create doc_link provenance record if docId is provided
      if (docId) {
        try {
          await createDocLink({
            fromDocId: docId,
            toDocId: canvas.id,
            createdBy: userId,
            workspaceId: canvas.workspaceId,
            linkText: "canvas_embed",
          });
        } catch (err) {
          // Non-fatal — provenance tracking should not block embedding
          fastify.log.warn({ err, docId, canvasId: canvas.id }, "Failed to create canvas_embed doc_link");
        }
      }

      // 5. Return frame render data
      return reply.code(200).send({
        code: frame.code,
        kclVersion: canvas.kclVersion || "1.0.0",
        canvasId: canvas.id,
        canvasTitle: canvas.title || "Untitled Canvas",
        frameId: frame.id,
        frameTitle: frame.title || null,
      });
    }
  );
};

export default canvasEmbedRoutes;
