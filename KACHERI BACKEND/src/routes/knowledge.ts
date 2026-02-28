// KACHERI BACKEND/src/routes/knowledge.ts
// Cross-Document Intelligence: Knowledge Graph API Routes
//
// Endpoints (Slice 8):
// - GET    /workspaces/:wid/knowledge/entities          — List entities (paginated, filterable, searchable)
// - GET    /workspaces/:wid/knowledge/entities/:eid      — Entity detail with mentions and relationships
// - PATCH  /workspaces/:wid/knowledge/entities/:eid      — Update entity (admin only)
// - DELETE /workspaces/:wid/knowledge/entities/:eid      — Delete entity (admin only)
// - POST   /workspaces/:wid/knowledge/entities/merge     — Merge entities (admin only)
// - GET    /workspaces/:wid/knowledge/relationships      — List relationships (filterable)
// - GET    /docs/:id/entities                            — Entities in a document
// - GET    /docs/:id/related                             — Related documents via shared entities
//
// Endpoints (Slice 9):
// - POST   /workspaces/:wid/knowledge/search            — Semantic search (AI-powered, rate limited)
// - GET    /workspaces/:wid/knowledge/search?q=term     — Quick keyword search (FTS5, no AI)
// - POST   /workspaces/:wid/knowledge/index             — Trigger workspace re-index (admin only)
// - POST   /workspaces/:wid/knowledge/cleanup           — Stale entity cleanup (admin only)
// - GET    /workspaces/:wid/knowledge/status             — Knowledge graph index status
// - GET    /workspaces/:wid/knowledge/summary            — Dashboard summary stats
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slices 8-9

import type { FastifyPluginAsync } from "fastify";
import { createHash } from "crypto";
import { WorkspaceEntitiesStore } from "../store/workspaceEntities";
import type { EntityType } from "../store/workspaceEntities";
import { EntityMentionsStore, validateProductSource } from "../store/entityMentions";
import type { ProductSource } from "../store/entityMentions";
import { EntityRelationshipsStore } from "../store/entityRelationships";
import type { RelationshipType } from "../store/entityRelationships";
import { KnowledgeQueriesStore } from "../store/knowledgeQueries";
import { RelatedDocs } from "../knowledge/relatedDocs";
import { FtsSync } from "../knowledge/ftsSync";
import { SemanticSearch } from "../knowledge/semanticSearch";
import { getDoc, listDocs } from "../store/docs";
import { recordProof } from "../provenanceStore";
import { AI_RATE_LIMITS } from "../middleware/rateLimit";
import { hasWorkspaceAdminAccess, checkDocAccess, requireWorkspaceMatch } from "../workspace/middleware";
import { db } from "../db";
import { getJobQueue } from "../jobs/queue";
import type { KnowledgeIndexPayload } from "../jobs/types";

/* ---------- Helpers ---------- */

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function clampLimit(raw: unknown): number {
  const n = Number(raw) || 50;
  return Math.min(Math.max(n, 1), 200);
}

function clampOffset(raw: unknown): number {
  return Math.max(Number(raw) || 0, 0);
}

function getWorkspaceId(req: { headers: Record<string, unknown> }): string | undefined {
  return (req.headers["x-workspace-id"] as string | undefined)?.toString().trim() || undefined;
}

function getUserId(req: { headers: Record<string, unknown> }): string {
  return (
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local"
  );
}

/* ---------- Routes ---------- */

export const knowledgeRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================
  // Workspace-scoped Knowledge Entity Routes
  // ============================================

  /**
   * GET /workspaces/:wid/knowledge/entities
   * List entities for a workspace with optional filters, search, and pagination.
   */
  fastify.get<{
    Params: { wid: string };
    Querystring: {
      type?: string;
      search?: string;
      sort?: string;
      order?: string;
      limit?: string;
      offset?: string;
      productSource?: string;
    };
  }>("/workspaces/:wid/knowledge/entities", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
    const { type, search, sort, order, limit: rawLimit, offset: rawOffset, productSource } = req.query;

    // Workspace membership check (any role can read)
    if (!req.workspaceRole) {
      return reply.code(403).send({
        error: "workspace_access_required",
        message: "You must be a member of this workspace",
      });
    }

    // Validate entity type filter if provided
    if (type && !WorkspaceEntitiesStore.validateEntityType(type)) {
      return reply.code(400).send({
        error: "invalid_entity_type",
        message: `Invalid entity type: ${type}. Valid types: person, organization, date, amount, location, product, term, concept, web_page, research_source, design_asset, event, citation`,
      });
    }

    // Validate productSource filter if provided
    if (productSource && !validateProductSource(productSource)) {
      return reply.code(400).send({
        error: "invalid_product_source",
        message: `Invalid productSource: ${productSource}. Valid values: docs, design-studio, research, notes, sheets`,
      });
    }

    // Validate sort field
    const validSorts = ["doc_count", "name", "created_at", "mention_count"];
    if (sort && !validSorts.includes(sort)) {
      return reply.code(400).send({
        error: "invalid_sort",
        message: `Invalid sort field: ${sort}. Valid fields: ${validSorts.join(", ")}`,
      });
    }

    // Validate order
    if (order && order !== "asc" && order !== "desc") {
      return reply.code(400).send({
        error: "invalid_order",
        message: 'Invalid order: must be "asc" or "desc"',
      });
    }

    const limit = clampLimit(rawLimit);
    const offset = clampOffset(rawOffset);

    // When productSource filter is set, get entity IDs that have mentions from that product
    let productSourceEntityIds: Set<string> | null = null;
    if (productSource) {
      const mentions = await EntityMentionsStore.getByProductSource(
        workspaceId,
        productSource as ProductSource
      );
      productSourceEntityIds = new Set(mentions.map((m) => m.entityId));
    }

    const entities = await WorkspaceEntitiesStore.getByWorkspace(workspaceId, {
      entityType: type as EntityType | undefined,
      search: search || undefined,
      sort: (sort as "doc_count" | "name" | "created_at" | "mention_count") || undefined,
      order: (order as "asc" | "desc") || undefined,
      limit: productSourceEntityIds ? undefined : limit,
      offset: productSourceEntityIds ? undefined : offset,
    });

    // Apply productSource filter post-fetch
    const filtered = productSourceEntityIds
      ? entities.filter((e) => productSourceEntityIds!.has(e.id))
      : entities;

    const totalCount = productSourceEntityIds
      ? filtered.length
      : await WorkspaceEntitiesStore.count(workspaceId, {
          entityType: type as EntityType | undefined,
        });

    // Apply pagination after productSource filtering
    const paged = productSourceEntityIds
      ? filtered.slice(offset, offset + limit)
      : filtered;

    return reply.code(200).send({
      entities: paged.map((e) => ({
        id: e.id,
        entityType: e.entityType,
        name: e.name,
        aliases: e.aliases,
        mentionCount: e.mentionCount,
        docCount: e.docCount,
        firstSeenAt: e.firstSeenAt,
        lastSeenAt: e.lastSeenAt,
      })),
      total: totalCount,
      limit,
      offset,
    });
  });

  /**
   * GET /workspaces/:wid/knowledge/entities/:eid
   * Entity detail with mentions and relationships.
   */
  fastify.get<{
    Params: { wid: string; eid: string };
  }>("/workspaces/:wid/knowledge/entities/:eid", async (req, reply) => {
    const { wid: workspaceId, eid: entityId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;

    // Workspace membership check
    if (!req.workspaceRole) {
      return reply.code(403).send({
        error: "workspace_access_required",
        message: "You must be a member of this workspace",
      });
    }

    const entity = await WorkspaceEntitiesStore.getById(entityId);
    if (!entity || entity.workspaceId !== workspaceId) {
      return reply.code(404).send({
        error: "entity_not_found",
        message: `Entity ${entityId} not found in workspace`,
      });
    }

    // Fetch mentions with doc titles
    const mentions = await EntityMentionsStore.getByEntity(entityId);

    // Fetch relationships and hydrate related entity info
    const rawRelationships = await EntityRelationshipsStore.getByEntity(entityId);
    const relationships = await Promise.all(rawRelationships.map(async (rel) => {
      const isFrom = rel.fromEntityId === entityId;
      const relatedEntityId = isFrom ? rel.toEntityId : rel.fromEntityId;
      const relatedEntity = await WorkspaceEntitiesStore.getById(relatedEntityId);

      return {
        id: rel.id,
        relatedEntity: relatedEntity
          ? {
              id: relatedEntity.id,
              name: relatedEntity.name,
              entityType: relatedEntity.entityType,
            }
          : { id: relatedEntityId, name: "(deleted)", entityType: "unknown" },
        relationshipType: rel.relationshipType,
        label: rel.label,
        strength: rel.strength,
        evidenceCount: rel.evidence.length,
      };
    }));

    return reply.code(200).send({
      entity: {
        id: entity.id,
        entityType: entity.entityType,
        name: entity.name,
        normalizedName: entity.normalizedName,
        aliases: entity.aliases,
        metadata: entity.metadata,
        mentionCount: entity.mentionCount,
        docCount: entity.docCount,
        firstSeenAt: entity.firstSeenAt,
        lastSeenAt: entity.lastSeenAt,
      },
      mentions: mentions.map((m) => ({
        docId: m.docId,
        docTitle: m.docTitle,
        context: m.context,
        fieldPath: m.fieldPath,
        confidence: m.confidence,
        productSource: m.productSource,
        sourceRef: m.sourceRef,
      })),
      relationships,
    });
  });

  /**
   * PATCH /workspaces/:wid/knowledge/entities/:eid
   * Update entity name, aliases, or metadata. Admin only.
   */
  fastify.patch<{
    Params: { wid: string; eid: string };
    Body: {
      name?: string;
      aliases?: string[];
      metadata?: Record<string, unknown>;
    };
  }>("/workspaces/:wid/knowledge/entities/:eid", async (req, reply) => {
    const { wid: workspaceId, eid: entityId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
    const body = req.body ?? {};

    // Admin-only
    if (!hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({
        error: "admin_required",
        message: "Requires workspace admin role to update entities",
      });
    }

    const entity = await WorkspaceEntitiesStore.getById(entityId);
    if (!entity || entity.workspaceId !== workspaceId) {
      return reply.code(404).send({
        error: "entity_not_found",
        message: `Entity ${entityId} not found in workspace`,
      });
    }

    // Validate name if provided
    if (body.name !== undefined && (!body.name || typeof body.name !== "string" || body.name.trim().length === 0)) {
      return reply.code(400).send({
        error: "invalid_name",
        message: "Entity name must be a non-empty string",
      });
    }

    // Validate aliases if provided
    if (body.aliases !== undefined && !Array.isArray(body.aliases)) {
      return reply.code(400).send({
        error: "invalid_aliases",
        message: "Aliases must be an array of strings",
      });
    }

    const updated = await WorkspaceEntitiesStore.update(entityId, {
      name: body.name?.trim(),
      normalizedName: body.name ? body.name.trim().toLowerCase() : undefined,
      aliases: body.aliases,
      metadata: body.metadata,
    });

    if (!updated) {
      return reply.code(500).send({
        error: "update_failed",
        message: "Failed to update entity",
      });
    }

    // Sync FTS5 index
    try {
      await FtsSync.syncEntity(updated.id, workspaceId, updated.name, updated.aliases);
    } catch {
      // Non-fatal: FTS5 sync failure doesn't affect entity data
    }

    return reply.code(200).send(updated);
  });

  /**
   * DELETE /workspaces/:wid/knowledge/entities/:eid
   * Delete entity. Admin only. CASCADE handles mentions and relationships.
   */
  fastify.delete<{
    Params: { wid: string; eid: string };
  }>("/workspaces/:wid/knowledge/entities/:eid", async (req, reply) => {
    const { wid: workspaceId, eid: entityId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;

    // Admin-only
    if (!hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({
        error: "admin_required",
        message: "Requires workspace admin role to delete entities",
      });
    }

    const entity = await WorkspaceEntitiesStore.getById(entityId);
    if (!entity || entity.workspaceId !== workspaceId) {
      return reply.code(404).send({
        error: "entity_not_found",
        message: `Entity ${entityId} not found in workspace`,
      });
    }

    // Remove from FTS5 index first
    try {
      await FtsSync.removeEntity(entityId);
    } catch {
      // Non-fatal
    }

    const deleted = await WorkspaceEntitiesStore.delete(entityId);
    if (!deleted) {
      return reply.code(500).send({
        error: "delete_failed",
        message: "Failed to delete entity",
      });
    }

    return reply.code(204).send();
  });

  /**
   * POST /workspaces/:wid/knowledge/entities/merge
   * Merge duplicate entities into one canonical entity. Admin only.
   */
  fastify.post<{
    Params: { wid: string };
    Body: {
      sourceEntityIds: string[];
      targetEntityId: string;
      mergedName: string;
    };
  }>("/workspaces/:wid/knowledge/entities/merge", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
    const body = req.body ?? {} as { sourceEntityIds?: string[]; targetEntityId?: string; mergedName?: string };

    // Admin-only
    if (!hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({
        error: "admin_required",
        message: "Requires workspace admin role to merge entities",
      });
    }

    // Validate request body
    if (
      !body.sourceEntityIds ||
      !Array.isArray(body.sourceEntityIds) ||
      body.sourceEntityIds.length === 0
    ) {
      return reply.code(400).send({
        error: "invalid_source_ids",
        message: "sourceEntityIds must be a non-empty array",
      });
    }

    if (!body.targetEntityId || typeof body.targetEntityId !== "string") {
      return reply.code(400).send({
        error: "invalid_target_id",
        message: "targetEntityId is required",
      });
    }

    if (!body.mergedName || typeof body.mergedName !== "string" || body.mergedName.trim().length === 0) {
      return reply.code(400).send({
        error: "invalid_merged_name",
        message: "mergedName must be a non-empty string",
      });
    }

    // Validate target entity exists and belongs to workspace
    const targetEntity = await WorkspaceEntitiesStore.getById(body.targetEntityId);
    if (!targetEntity || targetEntity.workspaceId !== workspaceId) {
      return reply.code(404).send({
        error: "target_entity_not_found",
        message: `Target entity ${body.targetEntityId} not found in workspace`,
      });
    }

    // Validate source entities exist and belong to workspace
    for (const sourceId of body.sourceEntityIds) {
      const sourceEntity = await WorkspaceEntitiesStore.getById(sourceId);
      if (!sourceEntity || sourceEntity.workspaceId !== workspaceId) {
        return reply.code(404).send({
          error: "source_entity_not_found",
          message: `Source entity ${sourceId} not found in workspace`,
        });
      }
    }

    // Prevent merging entity into itself
    if (body.sourceEntityIds.includes(body.targetEntityId)) {
      return reply.code(400).send({
        error: "invalid_merge",
        message: "Cannot merge an entity into itself",
      });
    }

    // Collect all aliases for the merged entity (union of all names except the canonical name)
    const allNames = new Set<string>();
    allNames.add(targetEntity.name);
    for (const alias of targetEntity.aliases) {
      allNames.add(alias);
    }
    for (const sourceId of body.sourceEntityIds) {
      const sourceEntity = await WorkspaceEntitiesStore.getById(sourceId);
      if (sourceEntity) {
        allNames.add(sourceEntity.name);
        for (const alias of sourceEntity.aliases) {
          allNames.add(alias);
        }
      }
    }
    // Remove the canonical name from aliases
    allNames.delete(body.mergedName.trim());
    const mergedAliases = Array.from(allNames);

    // Count mentions before merge for response
    let preMergeSourceMentionCount = 0;
    for (const id of body.sourceEntityIds) {
      preMergeSourceMentionCount += await EntityMentionsStore.countByEntity(id);
    }

    // Execute merge
    const success = await WorkspaceEntitiesStore.merge(
      body.sourceEntityIds,
      body.targetEntityId,
      body.mergedName.trim(),
      mergedAliases
    );

    if (!success) {
      return reply.code(500).send({
        error: "merge_failed",
        message: "Failed to merge entities",
      });
    }

    // Sync FTS5 for merged entity
    const mergedEntity = await WorkspaceEntitiesStore.getById(body.targetEntityId);
    if (mergedEntity) {
      try {
        await FtsSync.syncEntity(mergedEntity.id, workspaceId, mergedEntity.name, mergedEntity.aliases);
      } catch {
        // Non-fatal
      }
    }

    // Remove source entities from FTS5
    for (const sourceId of body.sourceEntityIds) {
      try {
        await FtsSync.removeEntity(sourceId);
      } catch {
        // Non-fatal
      }
    }

    return reply.code(200).send({
      mergedEntity: mergedEntity ?? null,
      mergedMentionCount: preMergeSourceMentionCount,
      deletedEntityIds: body.sourceEntityIds,
    });
  });

  // ============================================
  // Workspace-scoped Knowledge Relationship Routes
  // ============================================

  /**
   * GET /workspaces/:wid/knowledge/relationships
   * List relationships with optional filters.
   */
  fastify.get<{
    Params: { wid: string };
    Querystring: {
      entityId?: string;
      type?: string;
      minStrength?: string;
      limit?: string;
      offset?: string;
    };
  }>("/workspaces/:wid/knowledge/relationships", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
    const { entityId, type, minStrength: rawMinStrength, limit: rawLimit, offset: rawOffset } = req.query;

    // Workspace membership check
    if (!req.workspaceRole) {
      return reply.code(403).send({
        error: "workspace_access_required",
        message: "You must be a member of this workspace",
      });
    }

    // Validate relationship type if provided
    if (type && !EntityRelationshipsStore.validateRelationshipType(type)) {
      return reply.code(400).send({
        error: "invalid_relationship_type",
        message: `Invalid relationship type: ${type}. Valid types: co_occurrence, contractual, financial, organizational, temporal, custom`,
      });
    }

    const limit = clampLimit(rawLimit);
    const offset = clampOffset(rawOffset);
    const minStrength = rawMinStrength !== undefined ? parseFloat(rawMinStrength) : undefined;

    if (minStrength !== undefined && (isNaN(minStrength) || minStrength < 0 || minStrength > 1)) {
      return reply.code(400).send({
        error: "invalid_min_strength",
        message: "minStrength must be a number between 0 and 1",
      });
    }

    const relationships = await EntityRelationshipsStore.getByWorkspace(workspaceId, {
      entityId: entityId || undefined,
      relationshipType: type as RelationshipType | undefined,
      minStrength,
      limit,
      offset,
    });

    // Hydrate entity details for each relationship
    const hydratedRelationships = await Promise.all(relationships.map(async (rel) => {
      const fromEntity = await WorkspaceEntitiesStore.getById(rel.fromEntityId);
      const toEntity = await WorkspaceEntitiesStore.getById(rel.toEntityId);

      return {
        id: rel.id,
        fromEntity: fromEntity
          ? { id: fromEntity.id, name: fromEntity.name, entityType: fromEntity.entityType }
          : { id: rel.fromEntityId, name: "(deleted)", entityType: "unknown" },
        toEntity: toEntity
          ? { id: toEntity.id, name: toEntity.name, entityType: toEntity.entityType }
          : { id: rel.toEntityId, name: "(deleted)", entityType: "unknown" },
        relationshipType: rel.relationshipType,
        label: rel.label,
        strength: rel.strength,
        evidenceCount: rel.evidence.length,
      };
    }));

    const total = await EntityRelationshipsStore.count(workspaceId);

    return reply.code(200).send({
      relationships: hydratedRelationships,
      total,
    });
  });

  // ============================================
  // Search, Indexing & Summary Routes (Slice 9)
  // ============================================

  /**
   * POST /workspaces/:wid/knowledge/search
   * AI-powered semantic search across workspace documents.
   * Rate limited (uses AI calls). Creates proof records.
   */
  fastify.post<{
    Params: { wid: string };
    Body: {
      query: string;
      queryType?: string;
      limit?: number;
    };
  }>(
    "/workspaces/:wid/knowledge/search",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.compose, // Semantic search uses 2 AI calls
      },
    },
    async (req, reply) => {
      const { wid: workspaceId } = req.params;
      if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
      const body = req.body ?? {} as { query?: string; queryType?: string; limit?: number };

      // Workspace membership check
      if (!req.workspaceRole) {
        return reply.code(403).send({
          error: "workspace_access_required",
          message: "You must be a member of this workspace",
        });
      }

      // Validate query
      if (!body.query || typeof body.query !== "string" || body.query.trim().length === 0) {
        return reply.code(400).send({
          error: "query_required",
          message: "Query text is required and must be a non-empty string",
        });
      }

      // Validate limit
      const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 20);

      const userId = getUserId(req as unknown as { headers: Record<string, unknown> });

      // Execute semantic search pipeline
      const result = await SemanticSearch.search(workspaceId, body.query.trim(), {
        limit,
        queriedBy: userId,
      });

      // Record proof for provenance
      let proofId: string | undefined;
      try {
        const proofData = JSON.stringify({
          query: body.query.trim(),
          resultCount: result.resultCount,
          durationMs: result.durationMs,
        });
        const proofHash = `sha256:${sha256Hex(proofData)}`;

        const proofRow = await recordProof({
          doc_id: "",
          kind: "knowledge:search",
          hash: proofHash,
          path: "",
          meta: {
            workspaceId,
            queryId: result.queryId,
            query: body.query.trim(),
            resultCount: result.resultCount,
            durationMs: result.durationMs,
            userId,
          },
        });
        proofId = proofRow.id?.toString();
      } catch {
        // Non-fatal: proof recording failure doesn't affect search results
      }

      return reply.code(200).send({
        queryId: result.queryId,
        query: result.query,
        answer: result.answer,
        results: result.results,
        resultCount: result.resultCount,
        proofId: proofId ?? result.proofId,
        durationMs: result.durationMs,
      });
    }
  );

  /**
   * GET /workspaces/:wid/knowledge/search?q=term
   * Quick keyword search via FTS5 (no AI). Returns matching entities and documents.
   */
  fastify.get<{
    Params: { wid: string };
    Querystring: {
      q?: string;
      limit?: string;
    };
  }>("/workspaces/:wid/knowledge/search", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
    const { q: query, limit: rawLimit } = req.query;

    // Workspace membership check
    if (!req.workspaceRole) {
      return reply.code(403).send({
        error: "workspace_access_required",
        message: "You must be a member of this workspace",
      });
    }

    // Validate query
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return reply.code(400).send({
        error: "query_required",
        message: "Query parameter 'q' is required",
      });
    }

    const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 50);
    const trimmedQuery = query.trim();
    const startTime = Date.now();

    // Search entities via FTS5
    const entityResults = await FtsSync.searchEntities(workspaceId, trimmedQuery, { limit });

    // Search documents via FTS5
    const docResults = await FtsSync.searchDocs(workspaceId, trimmedQuery, { limit });

    const durationMs = Date.now() - startTime;

    // Log query for provenance
    const userId = getUserId(req as unknown as { headers: Record<string, unknown> });
    try {
      await KnowledgeQueriesStore.create({
        workspaceId,
        queryText: trimmedQuery,
        queryType: "entity_search",
        results: [...entityResults, ...docResults],
        resultCount: entityResults.length + docResults.length,
        queriedBy: userId,
        durationMs,
      });
    } catch {
      // Non-fatal
    }

    return reply.code(200).send({
      entities: entityResults.map((e) => ({
        id: e.entityId,
        name: e.name,
        entityType: undefined, // FTS5 doesn't return type; client can look up via entity detail
        docCount: undefined,
      })),
      documents: docResults.map((d) => ({
        docId: d.docId,
        title: d.title,
        snippet: d.snippet,
      })),
    });
  });

  /**
   * POST /workspaces/:wid/knowledge/index
   * Trigger a full workspace re-index. Admin only.
   * Returns 202 Accepted immediately; indexing runs via background job queue.
   */
  fastify.post<{
    Params: { wid: string };
    Body: {
      mode?: string;
      forceReindex?: boolean;
    };
  }>("/workspaces/:wid/knowledge/index", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
    const body = req.body ?? {} as { mode?: string; forceReindex?: boolean };

    // Admin-only
    if (!hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({
        error: "admin_required",
        message: "Requires workspace admin role to trigger re-index",
      });
    }

    const mode = body.mode === "incremental" ? "incremental" : "full";
    const forceReindex = body.forceReindex === true;
    const estimatedDocs = (await listDocs(workspaceId)).length;
    const userId = getUserId(req as unknown as { headers: Record<string, unknown> });

    // Enqueue via background job queue
    const payload: KnowledgeIndexPayload = {
      workspaceId,
      mode,
      forceReindex,
      userId,
    };

    const job = await getJobQueue().add(
      "knowledge:index",
      payload,
      userId,
      undefined,
      { maxAttempts: 1 }
    );

    // Return 202 immediately
    return reply.code(202).send({
      jobId: job.id,
      status: "queued",
      estimatedDocs,
    });
  });

  /**
   * POST /workspaces/:wid/knowledge/cleanup
   * Manually trigger stale entity cleanup. Admin only.
   * Recalculates entity counts and removes entities with 0 mentions.
   */
  fastify.post<{
    Params: { wid: string };
  }>("/workspaces/:wid/knowledge/cleanup", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;

    // Admin-only
    if (!hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({
        error: "admin_required",
        message: "Requires workspace admin role to trigger cleanup",
      });
    }

    // Recalculate counts first
    const entitiesRecalculated = await WorkspaceEntitiesStore.recalculateAllCounts(workspaceId);

    // Delete stale entities (0 mentions)
    const staleEntitiesDeleted = await EntityMentionsStore.cleanupStaleEntities(workspaceId);

    // Rebuild FTS5 entity index if stale entities were removed
    if (staleEntitiesDeleted > 0) {
      try {
        await FtsSync.syncWorkspaceEntities(workspaceId);
      } catch {
        // Non-fatal: FTS5 rebuild failure doesn't affect data integrity
      }
    }

    return reply.code(200).send({
      entitiesRecalculated,
      staleEntitiesDeleted,
    });
  });

  /**
   * GET /workspaces/:wid/knowledge/status
   * Knowledge graph index status for a workspace.
   */
  fastify.get<{
    Params: { wid: string };
  }>("/workspaces/:wid/knowledge/status", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;

    // Workspace membership check
    if (!req.workspaceRole) {
      return reply.code(403).send({
        error: "workspace_access_required",
        message: "You must be a member of this workspace",
      });
    }

    // Entity count
    const entityCount = await WorkspaceEntitiesStore.count(workspaceId);

    // Mention count (raw SQL — no dedicated store function)
    let mentionCount = 0;
    try {
      const row = await db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM entity_mentions WHERE workspace_id = ?`,
        [workspaceId]
      );
      mentionCount = row?.count ?? 0;
    } catch {
      // Non-fatal
    }

    // Relationship count
    const relationshipCount = await EntityRelationshipsStore.count(workspaceId);

    // Total and indexed doc counts
    const totalDocCount = (await listDocs(workspaceId)).length;

    // Indexed doc count = docs that have extractions (raw SQL)
    let indexedDocCount = 0;
    try {
      const row = await db.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT e.doc_id) as count
        FROM extractions e
        JOIN docs d ON d.id = e.doc_id
        WHERE d.workspace_id = ? AND d.deleted_at IS NULL
      `, [workspaceId]);
      indexedDocCount = row?.count ?? 0;
    } catch {
      // Non-fatal
    }

    // Last indexed timestamp (most recent entity lastSeenAt)
    let lastIndexedAt: string | null = null;
    try {
      const row = await db.queryOne<{ latest: number | null }>(`
        SELECT MAX(last_seen_at) as latest
        FROM workspace_entities
        WHERE workspace_id = ?
      `, [workspaceId]);
      if (row?.latest) {
        lastIndexedAt = new Date(row.latest).toISOString();
      }
    } catch {
      // Non-fatal
    }

    // Indexing in progress check
    let indexingInProgress = false;
    try {
      const row = await db.queryOne<{ count: number }>(`
        SELECT COUNT(*) as count FROM jobs
        WHERE type = 'knowledge:index'
          AND status IN ('pending', 'processing')
          AND payload LIKE ?
      `, [`%"workspaceId":"${workspaceId}"%`]);
      indexingInProgress = (row?.count ?? 0) > 0;
    } catch {
      indexingInProgress = false;
    }

    return reply.code(200).send({
      entityCount,
      mentionCount,
      relationshipCount,
      indexedDocCount,
      totalDocCount,
      lastIndexedAt,
      indexingInProgress,
    });
  });

  /**
   * GET /workspaces/:wid/knowledge/summary
   * Dashboard summary: stats, top entities, entity type breakdown, recent queries.
   */
  fastify.get<{
    Params: { wid: string };
  }>("/workspaces/:wid/knowledge/summary", async (req, reply) => {
    const { wid: workspaceId } = req.params;
    if (!requireWorkspaceMatch(req, reply, workspaceId)) return;

    // Workspace membership check
    if (!req.workspaceRole) {
      return reply.code(403).send({
        error: "workspace_access_required",
        message: "You must be a member of this workspace",
      });
    }

    // Stats
    const entityCount = await WorkspaceEntitiesStore.count(workspaceId);
    const relationshipCount = await EntityRelationshipsStore.count(workspaceId);
    const totalDocs = (await listDocs(workspaceId)).length;
    const queryCount = await KnowledgeQueriesStore.count(workspaceId);

    // Indexed docs (docs with extractions)
    let indexedDocs = 0;
    try {
      const row = await db.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT e.doc_id) as count
        FROM extractions e
        JOIN docs d ON d.id = e.doc_id
        WHERE d.workspace_id = ? AND d.deleted_at IS NULL
      `, [workspaceId]);
      indexedDocs = row?.count ?? 0;
    } catch {
      // Non-fatal
    }

    // Top entities (by doc count)
    const topEntities = (await WorkspaceEntitiesStore.getByWorkspace(workspaceId, {
      sort: "doc_count",
      order: "desc",
      limit: 10,
    })).map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.entityType,
      docCount: e.docCount,
    }));

    // Entity type breakdown
    const entityTypeBreakdown: Record<string, number> = {};
    try {
      const rows = await db.queryAll<{ entity_type: string; count: number }>(`
        SELECT entity_type, COUNT(*) as count
        FROM workspace_entities
        WHERE workspace_id = ?
        GROUP BY entity_type
      `, [workspaceId]);
      for (const row of rows) {
        entityTypeBreakdown[row.entity_type] = row.count;
      }
    } catch {
      // Non-fatal
    }

    // Recent queries
    const recentQueries = (await KnowledgeQueriesStore.getRecent(workspaceId, 5)).map((q) => ({
      id: q.id,
      query: q.queryText,
      resultCount: q.resultCount,
      createdAt: q.createdAt,
    }));

    return reply.code(200).send({
      stats: {
        entityCount,
        relationshipCount,
        indexedDocs,
        totalDocs,
        queryCount,
      },
      topEntities,
      entityTypeBreakdown,
      recentQueries,
    });
  });

  // ============================================
  // Per-Document Knowledge Routes
  // ============================================

  /**
   * GET /docs/:id/entities
   * List entities mentioned in a specific document.
   */
  fastify.get<{
    Params: { id: string };
  }>("/docs/:id/entities", async (req, reply) => {
    const { id: docId } = req.params;

    // Doc-level permission check (viewer+)
    if (!await checkDocAccess(db, req, reply, docId, "viewer")) return;

    // Verify document exists
    const doc = await getDoc(docId);
    if (!doc) {
      return reply.code(404).send({
        error: "doc_not_found",
        message: `Document ${docId} not found`,
      });
    }

    // Get all mentions for this document
    const mentions = await EntityMentionsStore.getByDoc(docId);

    // Hydrate entity details and deduplicate (group by entity)
    const entityMap = new Map<
      string,
      {
        entityId: string;
        entityType: string;
        name: string;
        context: string | null;
        confidence: number;
        fieldPath: string | null;
      }
    >();

    for (const mention of mentions) {
      // Keep the first (highest-context) mention per entity
      if (!entityMap.has(mention.entityId)) {
        const entity = await WorkspaceEntitiesStore.getById(mention.entityId);
        if (entity) {
          entityMap.set(mention.entityId, {
            entityId: entity.id,
            entityType: entity.entityType,
            name: entity.name,
            context: mention.context,
            confidence: mention.confidence,
            fieldPath: mention.fieldPath,
          });
        }
      }
    }

    const entities = Array.from(entityMap.values());

    return reply.code(200).send({
      entities,
      total: entities.length,
    });
  });

  /**
   * GET /docs/:id/related
   * Find related documents via shared entities.
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>("/docs/:id/related", async (req, reply) => {
    const { id: docId } = req.params;
    const { limit: rawLimit } = req.query;

    // Doc-level permission check (viewer+)
    if (!await checkDocAccess(db, req, reply, docId, "viewer")) return;

    // Verify document exists
    const doc = await getDoc(docId);
    if (!doc) {
      return reply.code(404).send({
        error: "doc_not_found",
        message: `Document ${docId} not found`,
      });
    }

    // Get workspace ID from middleware-resolved context or doc itself
    const workspaceId =
      req.workspaceId ||
      (doc as unknown as { workspace_id?: string }).workspace_id ||
      "";

    const limit = Math.min(Math.max(Number(rawLimit) || 10, 1), 50);

    const result = await RelatedDocs.findRelated(docId, workspaceId, { limit });

    return reply.code(200).send({
      relatedDocs: result.relatedDocs.map((rd) => ({
        docId: rd.docId,
        title: rd.title,
        relevance: rd.relevance,
        sharedEntities: rd.sharedEntities,
        sharedEntityCount: rd.sharedEntityCount,
      })),
      entityCount: result.entityCount,
      totalRelated: result.totalRelated,
    });
  });
};

export default knowledgeRoutes;
