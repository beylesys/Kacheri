// KACHERI BACKEND/src/routes/jobs.ts
// P4.3: REST API routes for job queue management
//
// Endpoints:
// - GET /jobs - List jobs with filters
// - GET /jobs/stats - Get queue statistics
// - GET /jobs/:id - Get single job
// - POST /jobs - Create a new job
// - DELETE /jobs/:id - Cancel a job
// - POST /jobs/:id/retry - Retry a failed job
// - GET /docs/:docId/jobs - Get jobs for a document

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getJobQueue } from "../jobs/queue";
import { JobType, JobStatus, JobOptions } from "../jobs/types";

/* ---------- Request Types ---------- */
interface JobIdParams {
  id: string;
}

interface DocIdParams {
  docId: string;
}

interface ListJobsQuery {
  type?: JobType;
  status?: JobStatus;
  docId?: string;
  limit?: string;
  offset?: string;
}

interface CreateJobBody {
  type: JobType;
  docId?: string;
  payload: unknown;
  options?: JobOptions;
}

/* ---------- Route Registration ---------- */
export default async function jobsRoutes(app: FastifyInstance) {
  const queue = getJobQueue();

  /**
   * GET /jobs
   * List jobs with optional filters
   */
  app.get(
    "/jobs",
    async (
      req: FastifyRequest<{ Querystring: ListJobsQuery }>,
      reply: FastifyReply
    ) => {
      const { type, status, docId, limit, offset } = req.query;
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const offsetNum = offset ? parseInt(offset, 10) : 0;

      // Build query based on filters
      let sql = `SELECT * FROM jobs WHERE 1=1`;
      const params: unknown[] = [];

      if (type) {
        sql += ` AND type = ?`;
        params.push(type);
      }

      if (status) {
        sql += ` AND status = ?`;
        params.push(status);
      }

      if (docId) {
        sql += ` AND doc_id = ?`;
        params.push(docId);
      }

      sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limitNum, offsetNum);

      // Note: This is a simplified implementation
      // In production, you'd want pagination with cursors
      const jobs = await queue.getPendingJobs(type, limitNum);

      return reply.send({
        jobs,
        count: jobs.length,
        limit: limitNum,
        offset: offsetNum,
      });
    }
  );

  /**
   * GET /jobs/stats
   * Get queue statistics
   */
  app.get("/jobs/stats", async (_req: FastifyRequest, reply: FastifyReply) => {
    const stats = await queue.getStats();

    return reply.send({
      stats,
      total:
        stats.pending +
        stats.processing +
        stats.completed +
        stats.failed +
        stats.cancelled,
    });
  });

  /**
   * GET /jobs/:id
   * Get single job by ID
   */
  app.get(
    "/jobs/:id",
    async (
      req: FastifyRequest<{ Params: JobIdParams }>,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const job = await queue.getJob(id);

      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }

      return reply.send({ job });
    }
  );

  /**
   * POST /jobs
   * Create a new job
   */
  app.post(
    "/jobs",
    async (
      req: FastifyRequest<{ Body: CreateJobBody }>,
      reply: FastifyReply
    ) => {
      const { type, docId, payload, options } = req.body;

      // Get user ID from request (simplified - use auth in production)
      const userId = (req as any).userId ?? "system";

      if (!type) {
        return reply.code(400).send({ error: "Job type is required" });
      }

      if (!payload) {
        return reply.code(400).send({ error: "Job payload is required" });
      }

      const job = await queue.add(type, payload, userId, docId, options);

      return reply.code(201).send({ job });
    }
  );

  /**
   * DELETE /jobs/:id
   * Cancel a pending job
   */
  app.delete(
    "/jobs/:id",
    async (
      req: FastifyRequest<{ Params: JobIdParams }>,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const cancelled = await queue.cancel(id);

      if (!cancelled) {
        const job = await queue.getJob(id);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }
        return reply.code(400).send({
          error: "Job cannot be cancelled",
          status: job.status,
        });
      }

      return reply.send({ cancelled: true, id });
    }
  );

  /**
   * POST /jobs/:id/retry
   * Retry a failed job
   */
  app.post(
    "/jobs/:id/retry",
    async (
      req: FastifyRequest<{ Params: JobIdParams }>,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      const retried = await queue.retry(id);

      if (!retried) {
        const job = await queue.getJob(id);
        if (!job) {
          return reply.code(404).send({ error: "Job not found" });
        }
        return reply.code(400).send({
          error: "Job cannot be retried",
          status: job.status,
        });
      }

      return reply.send({ retried: true, id });
    }
  );

  /**
   * GET /docs/:docId/jobs
   * Get jobs for a specific document
   */
  app.get(
    "/docs/:docId/jobs",
    async (
      req: FastifyRequest<{ Params: DocIdParams }>,
      reply: FastifyReply
    ) => {
      const { docId } = req.params;
      const jobs = await queue.getJobsByDoc(docId);

      return reply.send({
        docId,
        jobs,
        count: jobs.length,
      });
    }
  );

  /**
   * POST /jobs/cleanup
   * Clean up old completed/failed jobs
   */
  app.post(
    "/jobs/cleanup",
    async (
      req: FastifyRequest<{ Body: { olderThanDays?: number } }>,
      reply: FastifyReply
    ) => {
      const days = req.body?.olderThanDays ?? 7;
      const olderThanMs = days * 24 * 60 * 60 * 1000;
      const deleted = await queue.cleanup(olderThanMs);

      return reply.send({
        deleted,
        olderThanDays: days,
      });
    }
  );
}
