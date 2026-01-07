// KACHERI BACKEND/src/routes/health.ts
// P5.3: Health Check Endpoints
//
// Provides comprehensive health checks with Kubernetes probe support.
// - GET /health - Full health status with dependency checks
// - GET /health/ready - Kubernetes readiness probe
// - GET /health/live - Kubernetes liveness probe

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getHealthStatus, isReady, isAlive } from "../observability/healthCheck";

/* ---------- Route Registration ---------- */
export default async function healthRoutes(app: FastifyInstance) {
  /**
   * GET /health
   * Returns comprehensive health status including all dependency checks
   */
  app.get(
    "/health",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const health = await getHealthStatus();

      // Set status code based on health
      const statusCode = health.status === "healthy" ? 200 :
                         health.status === "degraded" ? 200 : 503;

      return reply.code(statusCode).send(health);
    }
  );

  /**
   * GET /health/ready
   * Kubernetes readiness probe
   * Returns 200 if service is ready to accept traffic, 503 otherwise
   */
  app.get(
    "/health/ready",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const ready = await isReady();

      if (ready) {
        return reply.code(200).send({ ready: true });
      }

      return reply.code(503).send({ ready: false });
    }
  );

  /**
   * GET /health/live
   * Kubernetes liveness probe
   * Returns 200 if service is alive (running), 503 otherwise
   */
  app.get(
    "/health/live",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const alive = await isAlive();

      if (alive) {
        return reply.code(200).send({ alive: true });
      }

      return reply.code(503).send({ alive: false });
    }
  );
}
