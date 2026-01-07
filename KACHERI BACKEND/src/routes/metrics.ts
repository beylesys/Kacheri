// KACHERI BACKEND/src/routes/metrics.ts
// P5.2: Prometheus Metrics Endpoint
//
// Exposes application metrics in Prometheus format.
// GET /metrics returns all registered metrics.

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { registry } from "../observability/metrics";

/* ---------- Route Registration ---------- */
export default async function metricsRoutes(app: FastifyInstance) {
  /**
   * GET /metrics
   * Returns all registered metrics in Prometheus format
   */
  app.get(
    "/metrics",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await registry.metrics();
        reply
          .header("Content-Type", registry.contentType)
          .send(metrics);
      } catch (err) {
        app.log.error({ err }, "Failed to collect metrics");
        reply.code(500).send({ error: "Failed to collect metrics" });
      }
    }
  );
}
