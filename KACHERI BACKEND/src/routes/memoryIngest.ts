// KACHERI BACKEND/src/routes/memoryIngest.ts
// Memory Graph Ingest Endpoint — POST /platform/memory/ingest
//
// Slice P2: Memory Graph Ingest Endpoint
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 1, Slice P2

import type { FastifyPluginAsync } from "fastify";
import { createHash } from "crypto";
import { recordProof } from "../provenanceStore";
import { logAuditEvent } from "../store/audit";
import { hasWorkspaceWriteAccess } from "../workspace/middleware";
import {
  type IngestPayload,
  MemoryIngester,
} from "../knowledge/memoryIngester";

/* ---------- Helpers ---------- */

function getUserId(req: { headers: Record<string, unknown> }): string {
  return (
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local"
  );
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/* ---------- Route Types ---------- */

interface IngestBody {
  productSource: string;
  entities: Array<{
    name: string;
    entityType: string;
    context?: string;
    confidence?: number;
    sourceRef?: string;
    metadata?: Record<string, unknown>;
  }>;
  relationships?: Array<{
    fromName: string;
    fromType: string;
    toName: string;
    toType: string;
    relationshipType: string;
    label?: string;
    evidence?: string;
  }>;
}

/* ---------- Route Plugin ---------- */

const memoryIngestRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /platform/memory/ingest
   *
   * Accepts entities and relationships from any product and ingests them
   * into the shared Memory Graph (workspace_entities, entity_mentions,
   * entity_relationships).
   *
   * Auth: Required (JWT or PAT)
   * Workspace: Resolved from x-workspace-id header
   * Rate Limit: 60 req/min per workspace
   * Feature Gate: MEMORY_GRAPH_ENABLED=true
   */
  fastify.post<{ Body: IngestBody }>(
    "/platform/memory/ingest",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
          keyGenerator: (req: any) =>
            `workspace:${req.workspaceId || req.headers?.["x-workspace-id"] || "unknown"}`,
        },
      },
    },
    async (req, reply) => {
      const startTime = Date.now();

      // --- Auth check ---
      if (!req.user) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "Authentication required",
        });
      }

      // --- Workspace context ---
      const workspaceId = req.workspaceId;
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "Workspace context required. Provide x-workspace-id header.",
        });
      }

      // --- Workspace write access ---
      if (!hasWorkspaceWriteAccess(req)) {
        return reply.code(403).send({
          error: "editor_required",
          message: "Requires editor role or higher to ingest into the Memory Graph",
        });
      }

      // --- Parse and validate body ---
      const body = req.body;
      if (!body || typeof body !== "object") {
        return reply.code(400).send({
          error: "invalid_body",
          message: "Request body must be a JSON object",
        });
      }

      const payload: IngestPayload = {
        productSource: body.productSource,
        entities: body.entities,
        relationships: body.relationships,
      };

      const validationErrors = MemoryIngester.validateIngestPayload(payload);
      if (validationErrors.length > 0) {
        return reply.code(400).send({
          error: "validation_failed",
          message: "Ingest payload validation failed",
          details: validationErrors,
        });
      }

      // --- Execute ingest ---
      const userId = getUserId(req as unknown as { headers: Record<string, unknown> });

      try {
        const result = await MemoryIngester.ingest(workspaceId, payload, userId);
        const durationMs = Date.now() - startTime;

        // --- Record proof ---
        let proofId: string | undefined;
        try {
          const proofData = JSON.stringify({
            action: "memory:ingest",
            workspaceId,
            productSource: payload.productSource,
            entityCount: payload.entities.length,
            relationshipCount: payload.relationships?.length ?? 0,
            entitiesCreated: result.entitiesCreated,
            entitiesReused: result.entitiesReused,
            mentionsCreated: result.mentionsCreated,
            relationshipsCreated: result.relationshipsCreated,
            durationMs,
          });
          const proofHash = `sha256:${sha256Hex(proofData)}`;

          const proofRow = await recordProof({
            doc_id: "",
            kind: "memory:ingest",
            hash: proofHash,
            path: "",
            meta: {
              workspaceId,
              userId,
              productSource: payload.productSource,
              entityCount: payload.entities.length,
              relationshipCount: payload.relationships?.length ?? 0,
              entitiesCreated: result.entitiesCreated,
              entitiesReused: result.entitiesReused,
              mentionsCreated: result.mentionsCreated,
              relationshipsCreated: result.relationshipsCreated,
              durationMs,
            },
          });
          proofId = proofRow.id?.toString();
        } catch (proofErr) {
          fastify.log.warn({ err: proofErr }, "memory:ingest proof recording failed (non-fatal)");
        }

        // --- Audit log ---
        try {
          logAuditEvent({
            workspaceId,
            actorId: userId,
            action: "memory:ingest",
            targetType: "memory_ingest",
            targetId: proofId ?? workspaceId,
            details: {
              productSource: payload.productSource,
              entityCount: payload.entities.length,
              relationshipCount: payload.relationships?.length ?? 0,
              entitiesCreated: result.entitiesCreated,
              entitiesReused: result.entitiesReused,
              mentionsCreated: result.mentionsCreated,
              relationshipsCreated: result.relationshipsCreated,
            },
          });
        } catch (auditErr) {
          fastify.log.warn({ err: auditErr }, "memory:ingest audit log failed (non-fatal)");
        }

        // --- Response ---
        return reply.code(201).send({
          ok: true,
          entitiesCreated: result.entitiesCreated,
          entitiesReused: result.entitiesReused,
          mentionsCreated: result.mentionsCreated,
          relationshipsCreated: result.relationshipsCreated,
          proofId: proofId ?? null,
          ...(result.errors.length > 0 ? { warnings: result.errors } : {}),
        });
      } catch (err) {
        fastify.log.error({ err }, "memory:ingest failed");
        return reply.code(500).send({
          error: "ingest_failed",
          message: "Memory graph ingest failed",
        });
      }
    }
  );
};

export default memoryIngestRoutes;
