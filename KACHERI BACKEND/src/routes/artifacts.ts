// KACHERI BACKEND/src/routes/artifacts.ts
// P4.1: REST API routes for artifacts management
//
// Endpoints:
// - GET /artifacts - List artifacts with filters
// - GET /artifacts/:id - Get single artifact
// - GET /artifacts/stats - Get artifact statistics
// - DELETE /artifacts/:id - Delete artifact
// - POST /artifacts/:id/verify - Trigger verification

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  ArtifactsStore,
  type ArtifactFilter,
  type VerificationStatus,
  type StorageProvider,
} from "../store/artifacts";
import { requirePlatformAdmin, checkDocAccess } from "../workspace/middleware";
import { db } from "../db";

/* ---------- Request Types ---------- */
interface ArtifactIdParams {
  id: string;
}

interface ListArtifactsQuery {
  docId?: string;
  kind?: string;
  storageProvider?: StorageProvider;
  verificationStatus?: VerificationStatus;
  limit?: string;
  offset?: string;
}

/* ---------- Response Builders ---------- */
function buildArtifactResponse(artifact: import('../store/artifacts').Artifact | null | undefined) {
  if (!artifact) return null;
  return {
    id: artifact.id,
    docId: artifact.docId,
    kind: artifact.kind,
    hash: artifact.hash,
    path: artifact.path,
    storageProvider: artifact.storageProvider,
    storageKey: artifact.storageKey,
    verifiedAt: artifact.verifiedAt,
    verificationStatus: artifact.verificationStatus,
    meta: artifact.meta,
    ts: artifact.ts,
  };
}

/* ---------- Route Registration ---------- */
export default async function artifactsRoutes(app: FastifyInstance) {
  /**
   * GET /artifacts
   * List artifacts with optional filters
   */
  app.get(
    "/artifacts",
    async (
      req: FastifyRequest<{ Querystring: ListArtifactsQuery }>,
      reply: FastifyReply
    ) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const { docId, kind, storageProvider, verificationStatus, limit, offset } = req.query;

      const filter: ArtifactFilter = {};

      if (docId) filter.docId = docId;
      if (kind) filter.kind = kind;
      if (storageProvider) filter.storageProvider = storageProvider;
      if (verificationStatus) filter.verificationStatus = verificationStatus;
      if (limit) filter.limit = parseInt(limit, 10);
      if (offset) filter.offset = parseInt(offset, 10);

      const artifacts = await ArtifactsStore.getAll(filter);

      return reply.send({
        artifacts: artifacts.map(buildArtifactResponse),
        count: artifacts.length,
        filter,
      });
    }
  );

  /**
   * GET /artifacts/stats
   * Get artifact statistics
   */
  app.get("/artifacts/stats", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    const byStatus = await ArtifactsStore.countByVerificationStatus();
    const byProvider = await ArtifactsStore.countByStorageProvider();

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return reply.send({
      total,
      byVerificationStatus: byStatus,
      byStorageProvider: byProvider,
      pendingVerification: byStatus.pending,
      failedVerification: byStatus.fail,
    });
  });

  /**
   * GET /artifacts/pending
   * Get artifacts pending verification
   */
  app.get(
    "/artifacts/pending",
    async (
      req: FastifyRequest<{ Querystring: { limit?: string } }>,
      reply: FastifyReply
    ) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const artifacts = await ArtifactsStore.getPendingVerification(limit);

      return reply.send({
        artifacts: artifacts.map(buildArtifactResponse),
        count: artifacts.length,
      });
    }
  );

  /**
   * GET /artifacts/failed
   * Get artifacts that failed verification
   */
  app.get(
    "/artifacts/failed",
    async (
      req: FastifyRequest<{ Querystring: { limit?: string } }>,
      reply: FastifyReply
    ) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
      const artifacts = await ArtifactsStore.getFailedVerification(limit);

      return reply.send({
        artifacts: artifacts.map(buildArtifactResponse),
        count: artifacts.length,
      });
    }
  );

  /**
   * GET /artifacts/:id
   * Get single artifact by ID
   */
  app.get(
    "/artifacts/:id",
    async (
      req: FastifyRequest<{ Params: ArtifactIdParams }>,
      reply: FastifyReply
    ) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const id = parseInt(req.params.id, 10);

      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid artifact ID" });
      }

      const artifact = await ArtifactsStore.getById(id);

      if (!artifact) {
        return reply.code(404).send({ error: "Artifact not found" });
      }

      return reply.send({ artifact: buildArtifactResponse(artifact) });
    }
  );

  /**
   * DELETE /artifacts/:id
   * Delete an artifact
   */
  app.delete(
    "/artifacts/:id",
    async (
      req: FastifyRequest<{ Params: ArtifactIdParams }>,
      reply: FastifyReply
    ) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const id = parseInt(req.params.id, 10);

      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid artifact ID" });
      }

      const artifact = await ArtifactsStore.getById(id);

      if (!artifact) {
        return reply.code(404).send({ error: "Artifact not found" });
      }

      const deleted = await ArtifactsStore.delete(id);

      return reply.send({
        deleted,
        id,
      });
    }
  );

  /**
   * POST /artifacts/:id/verify
   * Trigger verification for an artifact
   */
  app.post(
    "/artifacts/:id/verify",
    async (
      req: FastifyRequest<{ Params: ArtifactIdParams }>,
      reply: FastifyReply
    ) => {
      if (!requirePlatformAdmin(req, reply)) return;
      const id = parseInt(req.params.id, 10);

      if (isNaN(id)) {
        return reply.code(400).send({ error: "Invalid artifact ID" });
      }

      const artifact = await ArtifactsStore.getById(id);

      if (!artifact) {
        return reply.code(404).send({ error: "Artifact not found" });
      }

      // For now, just mark as pending for verification
      // The actual verification will be done by the job queue worker
      await ArtifactsStore.updateVerification(id, "pending");

      // TODO: P4.3 - Queue verification job instead of inline processing
      // await jobQueue.add('verify:export', { artifactId: id });

      return reply.send({
        id,
        status: "queued",
        message: "Artifact queued for verification",
      });
    }
  );

  /**
   * GET /docs/:docId/artifacts
   * Get artifacts for a specific document
   */
  app.get(
    "/docs/:docId/artifacts",
    async (
      req: FastifyRequest<{ Params: { docId: string } }>,
      reply: FastifyReply
    ) => {
      const { docId } = req.params;
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;
      const artifacts = await ArtifactsStore.getByDoc(docId);

      return reply.send({
        docId,
        artifacts: artifacts.map(buildArtifactResponse),
        count: artifacts.length,
      });
    }
  );
}
