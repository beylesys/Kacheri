// KACHERI BACKEND/src/routes/canvasAi.ts
// Design Studio: Canvas AI Routes — Generate, Edit, Style, Image & Conversation
//
// Endpoints:
// - POST /canvases/:cid/ai/generate  — Generate new frame(s) from prompt
// - POST /canvases/:cid/ai/edit      — Modify existing frame code
// - POST /canvases/:cid/ai/style     — Restyle frame(s) preserving content
// - POST /canvases/:cid/ai/image     — Generate AI image (Slice B5)
// - GET  /canvases/:cid/assets/:aid  — Serve canvas asset (Slice B5)
// - GET  /canvases/:cid/conversation — Get conversation history (paginated)
//
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slices B3, B5

import type { FastifyPluginAsync } from "fastify";
import { db } from "../db";

// AI engine (B1)
import {
  generateFrames,
  editFrame,
  styleFrames,
  buildProofPayload,
  extractEntitiesFromFrames,
  type DesignContext,
  type FrameSummary,
} from "../ai/designEngine";

// Doc cross-reference engine (B2) + Memory graph context (P7)
import {
  isDocBridgeAvailable,
  fetchMultipleDocContents,
  buildProvenanceLinks,
  queryMemoryGraphContext,
  formatMemoryContext,
  type ProvenanceLink,
} from "../ai/designDocBridge";

// Stores
import { CanvasStore } from "../store/canvases";
import { CanvasFrameStore } from "../store/canvasFrames";
import { CanvasConversationStore, type ActionType } from "../store/canvasConversations";
import { WorkspaceAiSettingsStore } from "../store/workspaceAiSettings";

// Canvas permissions (same pattern as routes/canvases.ts)
import {
  hasCanvasPermission,
  getEffectiveCanvasRole,
  type CanvasRole,
} from "../store/canvasPermissions";
import { getWorkspaceStore } from "../workspace/middleware";

// Proof & provenance
import { newProofPacket, writeProofPacket } from "../utils/proofs";
import { recordProof } from "../provenanceStore";
import { recordProvenance } from "../provenance";

// Auto-versioning (B4)
import { maybeAutoVersion } from "./canvases";

// Realtime
import { wsBroadcast, broadcastToUser } from "../realtime/globalHub";

// Notifications (E3)
import { createAndDeliverNotification } from "../store/notifications";

// Rate limiting
import { AI_RATE_LIMITS } from "../middleware/rateLimit";

// Memory Graph entity push (S12)
import { MemoryIngester } from "../knowledge/memoryIngester";
import { isFeatureEnabled } from "../modules/registry";

// Image generation (B5)
import { generateImage } from "../ai/imageGenerator";
import { CanvasAssetStore } from "../store/canvasAssets";
import { getStorage, StorageNotFoundError } from "../storage";
import { createHash } from "crypto";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

interface CanvasOnlyParams {
  cid: string;
}

interface GenerateBody {
  prompt: string;
  frameContext?: string;
  docRefs?: string[];
  compositionMode?: string;
  provider?: string;
  model?: string;
  includeMemoryContext?: boolean;
}

interface EditBody {
  prompt: string;
  frameId: string;
  provider?: string;
  model?: string;
}

interface StyleBody {
  prompt: string;
  frameIds: string[];
  provider?: string;
  model?: string;
}

interface ImageGenerateBody {
  prompt: string;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
}

interface AssetParams {
  cid: string;
  aid: string;
}

interface ConversationQuery {
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

function getWorkspaceId(req: { headers: Record<string, unknown> }): string | undefined {
  return (req.headers["x-workspace-id"] as string | undefined)?.toString().trim() || undefined;
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
 * Check canvas access and send 403 on failure.
 * Returns true if access is granted, false if denied (response already sent).
 */
async function checkCanvasAccess(
  req: { headers: Record<string, unknown> },
  reply: { code: (c: number) => { send: (b: unknown) => void } },
  canvasId: string,
  requiredRole: CanvasRole
): Promise<boolean> {
  const userId = getUserId(req);
  const role = await resolveCanvasRole(canvasId, userId);
  if (!role) {
    reply.code(403).send({ error: "forbidden", message: "Access denied" });
    return false;
  }
  if (!hasCanvasPermission(role, requiredRole)) {
    reply.code(403).send({
      error: "forbidden",
      message: `Requires ${requiredRole} role or higher`,
    });
    return false;
  }
  return true;
}

/**
 * Build DesignContext from canvas and its frames.
 * Merges request-level overrides with workspace AI settings (BYOK).
 * Priority: request body > workspace settings > server env defaults.
 */
async function buildDesignContext(
  canvas: import('../store/canvases').Canvas,
  frames: import('../store/canvasFrames').CanvasFrame[],
  overrides?: { provider?: string; model?: string }
): Promise<DesignContext> {
  const frameSummaries: FrameSummary[] = frames.map((f) => ({
    id: f.id,
    title: f.title,
    sortOrder: f.sortOrder,
    codeSummary: f.code ? f.code.slice(0, 200) : "",
  }));

  // Load workspace AI settings (BYOK + preferred provider/model)
  const wsAi = await WorkspaceAiSettingsStore.getWithKey(canvas.workspaceId);

  return {
    canvasId: canvas.id,
    compositionMode: canvas.compositionMode,
    canvasTitle: canvas.title,
    kclVersion: canvas.kclVersion,
    existingFrames: frameSummaries,
    provider: (overrides?.provider || wsAi?.provider || undefined) as any,
    model: overrides?.model || wsAi?.model || undefined,
    apiKey: wsAi?.apiKey || undefined,
  };
}

/* ---------- Routes ---------- */

export const canvasAiRoutes: FastifyPluginAsync = async (fastify) => {
  // ================================================================
  // 1. POST /canvases/:cid/ai/generate — Generate new frame(s)
  // ================================================================
  fastify.post<{ Params: CanvasOnlyParams; Body: GenerateBody }>(
    "/canvases/:cid/ai/generate",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.designAi,
      },
    },
    async (req, reply) => {
      const { cid } = req.params;
      const body = req.body || {} as GenerateBody;

      // Validate prompt
      if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return reply.code(400).send({ error: "missing_prompt", message: "Prompt is required" });
      }

      // Look up canvas
      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (editor+)
      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      // Lock check
      const userId = getUserId(req);
      if (canvas.isLocked && canvas.lockedBy && canvas.lockedBy !== userId) {
        return reply.code(409).send({
          error: "canvas_locked",
          message: "Canvas is locked by another user",
        });
      }

      // Auto-version before AI generation (non-fatal)
      try { await maybeAutoVersion(cid, userId); } catch { /* non-fatal */ }

      try {
        const workspaceId = canvas.workspaceId;
        const existingFrames = await CanvasFrameStore.getByCanvas(cid);

        // Doc cross-referencing (when docRefs provided and Docs enabled)
        let docProvenance: ProvenanceLink[] = [];
        let docContext = "";
        if (body.docRefs && body.docRefs.length > 0 && isDocBridgeAvailable()) {
          const docResult = await fetchMultipleDocContents(body.docRefs, workspaceId);
          if (docResult.available && docResult.docs.length > 0) {
            // Build doc context string for AI prompt injection
            docContext = docResult.docs
              .map((d) => `--- Document: ${d.title} (${d.docId}) ---\n${d.content}`)
              .join("\n\n");

            // Build provenance links
            for (const doc of docResult.docs) {
              if (doc.contentAvailable) {
                const links = buildProvenanceLinks(doc.docId, [
                  { heading: doc.title, text: doc.content },
                ]);
                docProvenance.push(...links);
              }
            }
          }
        }

        // Memory graph context (P7) — query workspace entities for prompt-relevant knowledge
        let memoryContextUsed = false;
        let memoryEntityCount = 0;
        let memoryContextBlock = "";
        if (body.includeMemoryContext) {
          try {
            const memoryResult = await queryMemoryGraphContext(workspaceId, body.prompt);
            if (memoryResult.entityCount > 0) {
              memoryContextBlock = formatMemoryContext(memoryResult.entities);
              memoryContextUsed = true;
              memoryEntityCount = memoryResult.entityCount;
            }
          } catch {
            // Graceful degradation: silently ignore memory graph failures
          }
        }

        // Build design context
        const designContext = await buildDesignContext(canvas, existingFrames, {
          provider: body.provider,
          model: body.model,
        });

        // Query recent conversation history for multi-turn clarification flow
        const { messages: recentMessages } = await CanvasConversationStore.getByCanvas(cid, { limit: 20 });
        if (recentMessages.length > 0) {
          designContext.conversationHistory = recentMessages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }

        // Inject doc context and memory context into prompt
        let effectivePrompt = body.prompt;
        if (docContext) {
          effectivePrompt += `\n\n## Reference Documents\n${docContext}`;
        }
        if (memoryContextBlock) {
          effectivePrompt += `\n\n${memoryContextBlock}`;
        }

        // AI generation
        const result = await generateFrames(effectivePrompt, designContext);

        // Handle clarification response — AI asked questions instead of generating code
        if (result.isClarification) {
          const userMsg = await CanvasConversationStore.append({
            canvasId: cid,
            frameId: body.frameContext,
            role: "user",
            content: body.prompt,
            actionType: "generate",
            docRefs: body.docRefs ? body.docRefs.map((id) => ({ docId: id })) : undefined,
          });

          await CanvasConversationStore.append({
            canvasId: cid,
            frameId: body.frameContext,
            role: "assistant",
            content: result.clarificationMessage!,
            actionType: "generate",
            metadata: {
              isClarification: true,
              provider: result.provider,
              model: result.model,
            },
          });

          return reply.code(200).send({
            conversationId: userMsg.id,
            frames: [],
            message: result.clarificationMessage,
            isClarification: true,
            isOutline: result.isOutline ?? false,
            provider: result.provider,
            model: result.model,
            validation: { valid: true, warnings: 0 },
            memoryContextUsed,
            memoryEntityCount,
          });
        }

        // Persist new frames
        const persistedFrames = [];
        const nextSortOrder = existingFrames.length;
        for (let i = 0; i < result.frames.length; i++) {
          const frame = await CanvasFrameStore.create({
            canvasId: cid,
            title: result.frames[i].title,
            code: result.frames[i].code,
            sortOrder: nextSortOrder + i,
          });

          // E4: If narrative was generated, store it in frame metadata
          let frameMetadata = frame.metadata;
          if (result.frames[i].narrativeHtml) {
            await CanvasFrameStore.update(frame.id, {
              metadata: {
                ...(frame.metadata || {}),
                narrativeHtml: result.frames[i].narrativeHtml,
              },
            });
            frameMetadata = {
              ...(frame.metadata || {}),
              narrativeHtml: result.frames[i].narrativeHtml,
            };
          }

          persistedFrames.push({
            id: frame.id,
            code: frame.code,
            codeHash: frame.codeHash,
            title: frame.title,
            sortOrder: frame.sortOrder,
            metadata: frameMetadata,
          });
        }

        // Proof packet
        const proofPayload = buildProofPayload(body.prompt, result, cid);
        const packet = newProofPacket(
          result.proofKind,
          { type: "ai", provider: result.provider, model: result.model },
          proofPayload.input,
          proofPayload.output,
        );
        const proofPath = await writeProofPacket(packet);
        const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

        // Record proof in DB
        const proofRow = await recordProof({
          doc_id: "",
          kind: result.proofKind,
          hash: proofHash,
          path: "",
          meta: {
            proofFile: proofPath,
            canvasId: cid,
            provider: result.provider,
            model: result.model,
            workspaceId,
          },
        });

        // Provenance log
        try {
          await recordProvenance({
            docId: "",
            action: result.proofKind,
            actor: "ai",
            actorId: userId,
            workspaceId,
            details: {
              canvasId: cid,
              provider: result.provider,
              model: result.model,
              prompt: body.prompt,
              frameCount: result.frames.length,
              proofHash,
              proofId: proofRow?.id ?? null,
            },
          });
        } catch {
          // non-fatal
        }

        // Conversation entries (user + assistant)
        const docRefsForConvo = body.docRefs
          ? body.docRefs.map((id) => ({ docId: id }))
          : undefined;

        const userMsg = await CanvasConversationStore.append({
          canvasId: cid,
          frameId: body.frameContext,
          role: "user",
          content: body.prompt,
          actionType: "generate",
          docRefs: docRefsForConvo,
        });

        const assistantMsg = await CanvasConversationStore.append({
          canvasId: cid,
          frameId: body.frameContext,
          role: "assistant",
          content: `Generated ${result.frames.length} frame(s)`,
          actionType: "generate",
          proofId: packet.id,
          metadata: {
            provider: result.provider,
            model: result.model,
            frameCount: result.frames.length,
            retriesUsed: result.retriesUsed,
            valid: result.validation.valid,
          },
        });

        // WebSocket broadcast
        wsBroadcast(workspaceId, {
          type: "canvas",
          action: "frames_updated",
          canvasId: cid,
          frameIds: persistedFrames.map((f) => f.id),
          authorId: userId,
          ts: Date.now(),
        } as any);

        // Notification: AI generation complete (E3)
        try {
          const genNotification = await createAndDeliverNotification({
            userId,
            workspaceId,
            type: "ai_generation_complete",
            title: "AI generation complete",
            body: `Generated ${persistedFrames.length} frame(s) for "${canvas.title}"`,
            linkType: "canvas",
            linkId: cid,
            actorId: userId,
          });
          if (genNotification) {
            broadcastToUser(userId, {
              type: "notification",
              notificationId: genNotification.id,
              userId,
              notificationType: "ai_generation_complete",
              title: genNotification.title,
              ts: Date.now(),
            } as any);
          }
        } catch { /* non-fatal */ }

        // S12: Entity push to Memory Graph (failure-tolerant, does not block on error)
        let memoryIndexedCount = 0;
        if (isFeatureEnabled('memoryGraph') && result.frames.length > 0) {
          try {
            const entities = extractEntitiesFromFrames(result.frames, cid);
            if (entities.length > 0) {
              MemoryIngester.ingest(workspaceId, {
                productSource: 'design-studio',
                entities,
              }, userId);
              memoryIndexedCount = entities.length;
              // Set memoryIndexed flag on frame metadata (DB + response)
              for (const pf of persistedFrames) {
                try {
                  const existingMeta = (pf.metadata as Record<string, unknown>) || {};
                  const updatedMeta = { ...existingMeta, memoryIndexed: true };
                  await CanvasFrameStore.update(pf.id, { metadata: updatedMeta });
                  pf.metadata = updatedMeta;
                } catch { /* non-fatal per-frame */ }
              }
            }
          } catch {
            // Silently skip — Memory Graph failures must not block generation
          }
        }

        return reply.code(200).send({
          conversationId: userMsg.id,
          frames: persistedFrames,
          docRefs: docProvenance.length > 0 ? docProvenance : undefined,
          proofId: packet.id,
          provider: result.provider,
          model: result.model,
          validation: {
            valid: result.validation.valid,
            warnings: result.validation.warnings.length,
          },
          memoryContextUsed,
          memoryEntityCount,
          memoryIndexedCount,
        });
      } catch (err) {
        req.log.error(err, "[canvasAi] generate failed");
        return reply.code(500).send({ error: "Generation failed" });
      }
    }
  );

  // ================================================================
  // 2. POST /canvases/:cid/ai/edit — Modify existing frame
  // ================================================================
  fastify.post<{ Params: CanvasOnlyParams; Body: EditBody }>(
    "/canvases/:cid/ai/edit",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.designAi,
      },
    },
    async (req, reply) => {
      const { cid } = req.params;
      const body = req.body || {} as EditBody;

      if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return reply.code(400).send({ error: "missing_prompt", message: "Prompt is required" });
      }
      if (!body.frameId || typeof body.frameId !== "string") {
        return reply.code(400).send({ error: "missing_frame_id", message: "frameId is required" });
      }

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      const userId = getUserId(req);
      if (canvas.isLocked && canvas.lockedBy && canvas.lockedBy !== userId) {
        return reply.code(409).send({
          error: "canvas_locked",
          message: "Canvas is locked by another user",
        });
      }

      // Auto-version before AI edit (non-fatal)
      try { await maybeAutoVersion(cid, userId); } catch { /* non-fatal */ }

      // Verify frame exists and belongs to canvas
      const frame = await CanvasFrameStore.getById(body.frameId);
      if (!frame || frame.canvasId !== cid) {
        return reply.code(404).send({ error: "Frame not found" });
      }

      try {
        const workspaceId = canvas.workspaceId;
        const existingFrames = await CanvasFrameStore.getByCanvas(cid);

        const designContext = await buildDesignContext(canvas, existingFrames, {
          provider: body.provider,
          model: body.model,
        });

        const result = await editFrame(body.prompt, frame.code, designContext);

        // Update existing frame with new code
        const editedCode = result.frames[0]?.code ?? frame.code;
        const updatedFrame = await CanvasFrameStore.updateCode(body.frameId, editedCode);

        // Proof packet
        const proofPayload = buildProofPayload(body.prompt, result, cid);
        const packet = newProofPacket(
          result.proofKind,
          { type: "ai", provider: result.provider, model: result.model },
          { ...proofPayload.input, frameId: body.frameId },
          proofPayload.output,
        );
        const proofPath = await writeProofPacket(packet);
        const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

        await recordProof({
          doc_id: "",
          kind: result.proofKind,
          hash: proofHash,
          path: "",
          meta: {
            proofFile: proofPath,
            canvasId: cid,
            frameId: body.frameId,
            provider: result.provider,
            model: result.model,
            workspaceId,
          },
        });

        try {
          await recordProvenance({
            docId: "",
            action: result.proofKind,
            actor: "ai",
            actorId: userId,
            workspaceId,
            details: {
              canvasId: cid,
              frameId: body.frameId,
              provider: result.provider,
              model: result.model,
              prompt: body.prompt,
              proofHash,
            },
          });
        } catch {
          // non-fatal
        }

        // Conversation entries
        await CanvasConversationStore.append({
          canvasId: cid,
          frameId: body.frameId,
          role: "user",
          content: body.prompt,
          actionType: "edit",
        });

        const assistantMsg = await CanvasConversationStore.append({
          canvasId: cid,
          frameId: body.frameId,
          role: "assistant",
          content: `Edited frame "${frame.title ?? body.frameId}"`,
          actionType: "edit",
          proofId: packet.id,
          metadata: {
            provider: result.provider,
            model: result.model,
            retriesUsed: result.retriesUsed,
            valid: result.validation.valid,
          },
        });

        wsBroadcast(workspaceId, {
          type: "canvas",
          action: "frames_updated",
          canvasId: cid,
          frameIds: [body.frameId],
          authorId: userId,
          ts: Date.now(),
        } as any);

        // Notification: AI edit complete (E3)
        try {
          const editNotification = await createAndDeliverNotification({
            userId,
            workspaceId,
            type: "ai_generation_complete",
            title: "AI edit complete",
            body: `Edited frame "${frame.title ?? body.frameId}" in "${canvas.title}"`,
            linkType: "canvas",
            linkId: cid,
            actorId: userId,
          });
          if (editNotification) {
            broadcastToUser(userId, {
              type: "notification",
              notificationId: editNotification.id,
              userId,
              notificationType: "ai_generation_complete",
              title: editNotification.title,
              ts: Date.now(),
            } as any);
          }
        } catch { /* non-fatal */ }

        return reply.code(200).send({
          conversationId: assistantMsg.id,
          frames: [
            {
              id: body.frameId,
              code: updatedFrame?.code ?? editedCode,
              codeHash: updatedFrame?.codeHash ?? null,
              title: updatedFrame?.title ?? frame.title,
            },
          ],
          proofId: packet.id,
          provider: result.provider,
          model: result.model,
          validation: {
            valid: result.validation.valid,
            warnings: result.validation.warnings.length,
          },
        });
      } catch (err) {
        req.log.error(err, "[canvasAi] edit failed");
        return reply.code(500).send({ error: "Edit failed" });
      }
    }
  );

  // ================================================================
  // 3. POST /canvases/:cid/ai/style — Restyle frame(s)
  // ================================================================
  fastify.post<{ Params: CanvasOnlyParams; Body: StyleBody }>(
    "/canvases/:cid/ai/style",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.designAi,
      },
    },
    async (req, reply) => {
      const { cid } = req.params;
      const body = req.body || {} as StyleBody;

      if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return reply.code(400).send({ error: "missing_prompt", message: "Prompt is required" });
      }
      if (!body.frameIds || !Array.isArray(body.frameIds) || body.frameIds.length === 0) {
        return reply.code(400).send({
          error: "missing_frame_ids",
          message: "frameIds array is required and must not be empty",
        });
      }

      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      const userId = getUserId(req);
      if (canvas.isLocked && canvas.lockedBy && canvas.lockedBy !== userId) {
        return reply.code(409).send({
          error: "canvas_locked",
          message: "Canvas is locked by another user",
        });
      }

      // Auto-version before AI style (non-fatal)
      try { await maybeAutoVersion(cid, userId); } catch { /* non-fatal */ }

      // Verify all frames exist and belong to this canvas
      const targetFrames: Array<{ frameId: string; code: string }> = [];
      for (const fid of body.frameIds) {
        const frame = await CanvasFrameStore.getById(fid);
        if (!frame || frame.canvasId !== cid) {
          return reply.code(404).send({ error: `Frame ${fid} not found` });
        }
        targetFrames.push({ frameId: fid, code: frame.code });
      }

      try {
        const workspaceId = canvas.workspaceId;
        const existingFrames = await CanvasFrameStore.getByCanvas(cid);

        const designContext = await buildDesignContext(canvas, existingFrames, {
          provider: body.provider,
          model: body.model,
        });

        const result = await styleFrames(body.prompt, targetFrames, designContext);

        // Update each frame with restyled code
        const updatedFrames = [];
        for (let i = 0; i < targetFrames.length; i++) {
          const styledCode = result.frames[i]?.code ?? targetFrames[i].code;
          const updated = await CanvasFrameStore.updateCode(targetFrames[i].frameId, styledCode);
          updatedFrames.push({
            id: targetFrames[i].frameId,
            code: updated?.code ?? styledCode,
            codeHash: updated?.codeHash ?? null,
            title: updated?.title ?? null,
          });
        }

        // Proof packet
        const proofPayload = buildProofPayload(body.prompt, result, cid);
        const packet = newProofPacket(
          result.proofKind,
          { type: "ai", provider: result.provider, model: result.model },
          { ...proofPayload.input, frameIds: body.frameIds },
          proofPayload.output,
        );
        const proofPath = await writeProofPacket(packet);
        const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

        await recordProof({
          doc_id: "",
          kind: result.proofKind,
          hash: proofHash,
          path: "",
          meta: {
            proofFile: proofPath,
            canvasId: cid,
            frameIds: body.frameIds,
            provider: result.provider,
            model: result.model,
            workspaceId,
          },
        });

        try {
          await recordProvenance({
            docId: "",
            action: result.proofKind,
            actor: "ai",
            actorId: userId,
            workspaceId,
            details: {
              canvasId: cid,
              frameIds: body.frameIds,
              provider: result.provider,
              model: result.model,
              prompt: body.prompt,
              proofHash,
            },
          });
        } catch {
          // non-fatal
        }

        // Conversation entries
        await CanvasConversationStore.append({
          canvasId: cid,
          role: "user",
          content: body.prompt,
          actionType: "style",
        });

        const assistantMsg = await CanvasConversationStore.append({
          canvasId: cid,
          role: "assistant",
          content: `Restyled ${targetFrames.length} frame(s)`,
          actionType: "style",
          proofId: packet.id,
          metadata: {
            provider: result.provider,
            model: result.model,
            frameCount: targetFrames.length,
            retriesUsed: result.retriesUsed,
            valid: result.validation.valid,
          },
        });

        wsBroadcast(workspaceId, {
          type: "canvas",
          action: "frames_updated",
          canvasId: cid,
          frameIds: body.frameIds,
          authorId: userId,
          ts: Date.now(),
        } as any);

        // Notification: AI style complete (E3)
        try {
          const styleNotification = await createAndDeliverNotification({
            userId,
            workspaceId,
            type: "ai_generation_complete",
            title: "AI restyle complete",
            body: `Restyled ${targetFrames.length} frame(s) in "${canvas.title}"`,
            linkType: "canvas",
            linkId: cid,
            actorId: userId,
          });
          if (styleNotification) {
            broadcastToUser(userId, {
              type: "notification",
              notificationId: styleNotification.id,
              userId,
              notificationType: "ai_generation_complete",
              title: styleNotification.title,
              ts: Date.now(),
            } as any);
          }
        } catch { /* non-fatal */ }

        return reply.code(200).send({
          conversationId: assistantMsg.id,
          frames: updatedFrames,
          proofId: packet.id,
          provider: result.provider,
          model: result.model,
          validation: {
            valid: result.validation.valid,
            warnings: result.validation.warnings.length,
          },
        });
      } catch (err) {
        req.log.error(err, "[canvasAi] style failed");
        return reply.code(500).send({ error: "Style failed" });
      }
    }
  );

  // ================================================================
  // 4. POST /canvases/:cid/ai/image — Generate AI image (B5)
  // ================================================================
  fastify.post<{ Params: CanvasOnlyParams; Body: ImageGenerateBody }>(
    "/canvases/:cid/ai/image",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.designImage,
      },
    },
    async (req, reply) => {
      const { cid } = req.params;
      const body = req.body || {} as ImageGenerateBody;

      // Validate prompt
      if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
        return reply.code(400).send({ error: "missing_prompt", message: "Prompt is required" });
      }

      // Look up canvas
      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (editor+)
      if (!await checkCanvasAccess(req, reply, cid, "editor")) return;

      // Lock check
      const userId = getUserId(req);
      if (canvas.isLocked && canvas.lockedBy && canvas.lockedBy !== userId) {
        return reply.code(409).send({
          error: "canvas_locked",
          message: "Canvas is locked by another user",
        });
      }

      const workspaceId = canvas.workspaceId;

      // Credit check
      const creditsRemaining = await CanvasAssetStore.getCreditsRemaining(workspaceId);
      if (creditsRemaining <= 0) {
        return reply.code(402).send({
          error: "credits_exhausted",
          message: "Image generation credits exhausted for this workspace",
          creditsRemaining: 0,
        });
      }

      try {
        // Generate image via AI provider
        const result = await generateImage(body.prompt, {
          size: body.size,
          quality: body.quality,
          style: body.style,
        });

        // Compute hash of image data
        const imageHash = createHash("sha256")
          .update(result.imageData)
          .digest("hex");

        // Build storage key
        const filename = `${Date.now()}_${nanoid(12)}.png`;
        const wsPrefix = workspaceId || "_global";
        const storageKey = `${wsPrefix}/images/canvas-${cid}/${filename}`;

        // Write image to storage
        await getStorage().write(storageKey, result.imageData, result.mimeType);

        // Create canvas_assets record
        const asset = await CanvasAssetStore.create({
          canvasId: cid,
          workspaceId,
          assetType: "image",
          name: filename,
          filePath: storageKey,
          fileSize: result.imageData.byteLength,
          mimeType: result.mimeType,
          source: "ai_generated",
          metadata: {
            revisedPrompt: result.revisedPrompt,
            width: result.width,
            height: result.height,
            size: body.size ?? "1024x1024",
            quality: body.quality ?? "standard",
            style: body.style ?? "vivid",
            provider: result.provider,
            model: result.model,
          },
          createdBy: userId,
        });

        // Proof packet
        const packet = newProofPacket(
          "design:image",
          { type: "ai", provider: result.provider, model: result.model },
          {
            canvasId: cid,
            prompt: body.prompt,
            size: body.size ?? "1024x1024",
            quality: body.quality ?? "standard",
            style: body.style ?? "vivid",
          },
          {
            assetId: asset.id,
            storageKey,
            hash: `sha256:${imageHash}`,
            bytes: result.imageData.byteLength,
            width: result.width,
            height: result.height,
            revisedPrompt: result.revisedPrompt,
          },
        );
        const proofPath = await writeProofPacket(packet);
        const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

        // Record proof in DB
        const proofRow = await recordProof({
          doc_id: "",
          kind: "design:image",
          hash: `sha256:${imageHash}`,
          path: "",
          meta: {
            proofFile: proofPath,
            canvasId: cid,
            assetId: asset.id,
            provider: result.provider,
            model: result.model,
            workspaceId,
          },
        });

        // Update asset with proof ID
        // (re-create would be wasteful; store the proof_id in metadata)

        // Provenance log (non-fatal)
        try {
          await recordProvenance({
            docId: "",
            action: "design:image",
            actor: "ai",
            actorId: userId,
            workspaceId,
            details: {
              canvasId: cid,
              assetId: asset.id,
              provider: result.provider,
              model: result.model,
              prompt: body.prompt,
              imageHash: `sha256:${imageHash}`,
              proofHash,
              proofId: proofRow?.id ?? null,
            },
          });
        } catch {
          // non-fatal
        }

        // Conversation entries (actionType: 'generate' with subType in metadata
        // to avoid CHECK constraint on canvas_conversations.action_type)
        const userMsg = await CanvasConversationStore.append({
          canvasId: cid,
          role: "user",
          content: body.prompt,
          actionType: "generate",
        });

        await CanvasConversationStore.append({
          canvasId: cid,
          role: "assistant",
          content: `Generated image for canvas`,
          actionType: "generate",
          proofId: packet.id,
          metadata: {
            subType: "image",
            provider: result.provider,
            model: result.model,
            assetId: asset.id,
          },
        });

        // Deduct credit (atomic, after successful generation)
        const creditResult = await CanvasAssetStore.deductCredit(workspaceId);
        const finalCreditsRemaining = creditResult?.creditsRemaining ?? 0;

        // WebSocket broadcast
        wsBroadcast(workspaceId, {
          type: "canvas",
          action: "assets_updated",
          canvasId: cid,
          assetId: asset.id,
          authorId: userId,
          ts: Date.now(),
        } as any);

        return reply.code(200).send({
          assetId: asset.id,
          url: `/canvases/${cid}/assets/${asset.id}`,
          filename,
          hash: `sha256:${imageHash}`,
          bytes: result.imageData.byteLength,
          mimeType: result.mimeType,
          width: result.width,
          height: result.height,
          revisedPrompt: result.revisedPrompt,
          proofId: packet.id,
          provider: result.provider,
          model: result.model,
          creditsRemaining: finalCreditsRemaining,
          conversationId: userMsg.id,
        });
      } catch (err) {
        req.log.error(err, "[canvasAi] image generation failed");
        return reply.code(500).send({ error: "Image generation failed" });
      }
    }
  );

  // ================================================================
  // 5. GET /canvases/:cid/assets/:aid — Serve canvas asset (B5)
  // ================================================================
  fastify.get<{ Params: AssetParams }>(
    "/canvases/:cid/assets/:aid",
    async (req, reply) => {
      const { cid, aid } = req.params;

      // Look up canvas
      const canvas = await CanvasStore.getById(cid);
      if (!canvas) {
        return reply.code(404).send({ error: "Canvas not found" });
      }

      // Check canvas-level access (viewer+)
      if (!await checkCanvasAccess(req, reply, cid, "viewer")) return;

      // Look up asset
      const asset = await CanvasAssetStore.getById(aid);
      if (!asset || asset.canvasId !== cid) {
        return reply.code(404).send({ error: "Asset not found" });
      }

      try {
        const buf = await getStorage().read(asset.filePath);

        return reply
          .header("Content-Type", asset.mimeType)
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(buf);
      } catch (err) {
        if (err instanceof StorageNotFoundError) {
          return reply.code(404).send({ error: "Asset file not found" });
        }
        req.log.error(err, "[canvasAi] asset serve failed");
        return reply.code(500).send({ error: "Failed to serve asset" });
      }
    }
  );

  // ================================================================
  // 6. GET /canvases/:cid/conversation — Conversation history
  // ================================================================
  fastify.get<{ Params: CanvasOnlyParams; Querystring: ConversationQuery }>(
    "/canvases/:cid/conversation",
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

      const { messages, total } = await CanvasConversationStore.getByCanvas(cid, {
        limit,
        offset,
      });

      return reply.code(200).send({
        canvasId: cid,
        messages,
        total,
        limit,
        offset,
      });
    }
  );
};

export default canvasAiRoutes;
