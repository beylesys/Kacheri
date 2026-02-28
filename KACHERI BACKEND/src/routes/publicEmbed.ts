// KACHERI BACKEND/src/routes/publicEmbed.ts
// Design Studio: Public Embed / Widget Mode (Slice E5)
//
// Provides:
// - PATCH /canvases/:cid/publish        — Toggle canvas published state (auth required, owner only)
// - GET   /embed/public/canvases/:cid   — Render published canvas as HTML (no auth)
// - GET   /embed/public/frames/:fid     — Render published frame as HTML (no auth)
//
// Public embed routes bypass authentication. They serve self-contained HTML
// documents for embedding in external sites via <iframe>.
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice E5

import type { FastifyPluginAsync } from "fastify";
import { db } from "../db";
import { CanvasStore } from "../store/canvases";
import { CanvasFrameStore } from "../store/canvasFrames";
import {
  type CanvasRole,
  getEffectiveCanvasRole,
} from "../store/canvasPermissions";
import { getWorkspaceStore } from "../workspace/middleware";
import { logAuditEvent } from "../store/audit";

/* ---------- Types ---------- */

interface CanvasIdParams {
  cid: string;
}

interface FrameIdParams {
  fid: string;
}

interface PublishBody {
  published: boolean;
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

/**
 * Build a self-contained HTML page for a single frame.
 *
 * Adapted from the frontend's buildSrcdoc() in useFrameRenderer.ts (lines 97–206)
 * but for server-side rendering without postMessage handlers (no parent to message).
 *
 * The KCL bundle is loaded from the backend's /kcl/:version/ endpoint.
 */
function buildFrameHtml(
  frameCode: string,
  kclVersion: string,
  baseUrl: string,
  title: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: auto; }
    kcl-slide { display: block; width: 100%; min-height: 100%; }
    .kcl-slide-container { min-height: 100%; }
  </style>
  <link rel="stylesheet" href="${baseUrl}/kcl/${kclVersion}/kcl.css">
  <script src="${baseUrl}/kcl/${kclVersion}/kcl.js"><\/script>
  <script>
    // Auto-resize: notify parent iframe of content height for responsive embeds
    (function() {
      function postHeight() {
        try {
          var h = document.documentElement.scrollHeight;
          window.parent.postMessage({ type: 'beyle:embed-resize', height: h }, '*');
        } catch(e) {}
      }
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(postHeight).observe(document.body);
      }
      window.addEventListener('load', postHeight);
    })();
  <\/script>
</head>
<body>
${frameCode}
</body>
</html>`;
}

/**
 * Build a self-contained HTML page for a full canvas (all frames).
 * Uses a scrollable vertical layout for page/notebook modes and a slide
 * navigation layout for deck/widget modes.
 */
function buildCanvasHtml(
  frames: Array<{ code: string; title: string | null; sortOrder: number }>,
  kclVersion: string,
  baseUrl: string,
  canvasTitle: string,
  compositionMode: string,
): string {
  const isDeck = compositionMode === "deck" || compositionMode === "widget";

  const frameHtml = frames
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f, i) => {
      if (isDeck) {
        return `<div class="embed-frame" data-index="${i}" style="display:${i === 0 ? 'block' : 'none'}">${f.code}</div>`;
      }
      return `<div class="embed-frame">${f.code}</div>`;
    })
    .join("\n");

  const navScript = isDeck
    ? `
    var frames = document.querySelectorAll('.embed-frame');
    var current = 0;
    var counter = document.getElementById('embed-counter');
    function showFrame(idx) {
      frames.forEach(function(f, i) { f.style.display = i === idx ? 'block' : 'none'; });
      current = idx;
      if (counter) counter.textContent = (idx + 1) + ' / ' + frames.length;
    }
    document.getElementById('embed-prev').onclick = function() { if (current > 0) showFrame(current - 1); };
    document.getElementById('embed-next').onclick = function() { if (current < frames.length - 1) showFrame(current + 1); };
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { if (current < frames.length - 1) showFrame(current + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { if (current > 0) showFrame(current - 1); }
    });`
    : "";

  const navBar = isDeck
    ? `<div class="embed-nav">
  <button id="embed-prev" aria-label="Previous frame">&larr;</button>
  <span id="embed-counter">1 / ${frames.length}</span>
  <button id="embed-next" aria-label="Next frame">&rarr;</button>
</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(canvasTitle)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    kcl-slide { display: block; width: 100%; min-height: ${isDeck ? '100%' : 'auto'}; }
    .kcl-slide-container { min-height: ${isDeck ? '100%' : 'auto'}; }
    .embed-frame { ${isDeck ? 'width: 100%; height: calc(100% - 40px);' : 'margin-bottom: 1rem;'} }
    .embed-nav { display: flex; align-items: center; justify-content: center; gap: 12px;
      height: 40px; background: #1a1a2e; color: #e0e0e0; font-size: 14px; }
    .embed-nav button { background: none; border: 1px solid #555; color: #e0e0e0; border-radius: 4px;
      padding: 4px 12px; cursor: pointer; font-size: 14px; }
    .embed-nav button:hover { background: #333; }
  </style>
  <link rel="stylesheet" href="${baseUrl}/kcl/${kclVersion}/kcl.css">
  <script src="${baseUrl}/kcl/${kclVersion}/kcl.js"><\/script>
  <script>
    (function() {
      function postHeight() {
        try {
          var h = document.documentElement.scrollHeight;
          window.parent.postMessage({ type: 'beyle:embed-resize', height: h }, '*');
        } catch(e) {}
      }
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(postHeight).observe(document.body);
      }
      window.addEventListener('load', postHeight);
    })();
  <\/script>
</head>
<body>
${navBar}
${frameHtml}
<script>${navScript}<\/script>
</body>
</html>`;
}

/** Escape HTML special characters to prevent injection */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolve the base URL for KCL asset loading.
 * In production the server knows its public URL via env; fallback to request host.
 */
function resolveBaseUrl(req: { headers: Record<string, unknown>; protocol: string }): string {
  const envBase = process.env.PUBLIC_URL || process.env.BASE_URL;
  if (envBase) return envBase.replace(/\/$/, "");

  const host = req.headers.host as string | undefined;
  const proto = req.headers["x-forwarded-proto"] as string | undefined || req.protocol || "http";
  return host ? `${proto}://${host}` : "";
}

/* ---------- Plugin ---------- */

const publicEmbedRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * PATCH /canvases/:cid/publish
   *
   * Toggle canvas published state. Only the canvas owner can publish/unpublish.
   * Authenticated endpoint.
   */
  fastify.patch<{ Params: CanvasIdParams; Body: PublishBody }>(
    "/canvases/:cid/publish",
    async (req, reply) => {
      const { cid } = req.params;
      const body = req.body as PublishBody | undefined;

      // Validate body
      if (!body || typeof body.published !== "boolean") {
        return reply.code(400).send({
          error: "bad_request",
          message: "Request body must include 'published' (boolean)",
        });
      }

      // Get canvas
      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "not_found", message: "Canvas not found" });
      }

      // Check owner access
      const userId = getUserId(req);
      const role = await resolveCanvasRole(cid, userId);
      if (role !== "owner") {
        return reply.code(403).send({
          error: "forbidden",
          message: "Only the canvas owner can publish or unpublish",
        });
      }

      // Toggle published state
      const updated = body.published
        ? await CanvasStore.publish(cid)
        : await CanvasStore.unpublish(cid);

      if (!updated) {
        return reply.code(500).send({
          error: "internal_error",
          message: "Failed to update publish state",
        });
      }

      // Audit log
      logAuditEvent({
        workspaceId: canvas.workspaceId,
        actorId: userId,
        action: body.published ? "canvas:publish" : "canvas:unpublish",
        targetType: "canvas",
        targetId: cid,
        details: { published: body.published },
      });

      return reply.code(200).send(updated);
    }
  );

  /**
   * GET /embed/public/canvases/:cid
   *
   * Render a published canvas as a self-contained HTML page.
   * No authentication required — serves public embed content.
   */
  fastify.get<{ Params: CanvasIdParams }>(
    "/embed/public/canvases/:cid",
    async (req, reply) => {
      const { cid } = req.params;

      // Only return published, non-deleted canvases
      const canvas = await CanvasStore.getPublishedById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "not_found", message: "Canvas not found or not published" });
      }

      // Get all frames
      const frames = await CanvasFrameStore.getByCanvas(cid);
      if (frames.length === 0) {
        return reply.code(404).send({ error: "not_found", message: "Canvas has no frames" });
      }

      const baseUrl = resolveBaseUrl(req);
      const html = buildCanvasHtml(
        frames.map((f) => ({ code: f.code, title: f.title, sortOrder: f.sortOrder })),
        canvas.kclVersion,
        baseUrl,
        canvas.title,
        canvas.compositionMode,
      );

      reply
        .code(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("X-Frame-Options", "ALLOWALL")
        .header("Cache-Control", "public, max-age=60")
        .send(html);
    }
  );

  /**
   * GET /embed/public/frames/:fid
   *
   * Render a single frame from a published canvas as self-contained HTML.
   * No authentication required — serves public embed content.
   */
  fastify.get<{ Params: FrameIdParams }>(
    "/embed/public/frames/:fid",
    async (req, reply) => {
      const { fid } = req.params;

      // Look up the frame
      const frame = await CanvasFrameStore.getById(fid);
      if (!frame) {
        return reply.code(404).send({ error: "not_found", message: "Frame not found" });
      }

      // Look up the parent canvas — must be published
      const canvas = await CanvasStore.getPublishedById(frame.canvasId);
      if (!canvas) {
        return reply.code(404).send({ error: "not_found", message: "Canvas not found or not published" });
      }

      const baseUrl = resolveBaseUrl(req);
      const title = frame.title || canvas.title;
      const html = buildFrameHtml(frame.code, canvas.kclVersion, baseUrl, title);

      reply
        .code(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("X-Frame-Options", "ALLOWALL")
        .header("Cache-Control", "public, max-age=60")
        .send(html);
    }
  );
};

export default publicEmbedRoutes;
