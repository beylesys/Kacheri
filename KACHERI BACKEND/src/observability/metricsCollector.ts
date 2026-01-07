// KACHERI BACKEND/src/observability/metricsCollector.ts
// P5.2: Metrics Collection Hooks
//
// Fastify hooks that collect metrics at request lifecycle points.
// Also includes periodic gauge updates for document/proof counts.

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import {
  recordHttpRequest,
  updateDataMetrics,
  updateJobMetrics,
  METRICS_ENABLED,
} from "./metrics";
import { createLogger } from "./logger";

const log = createLogger("metrics");

/* ---------- Request Timing ---------- */

// WeakMap to store request start times
const requestStartTimes = new WeakMap<FastifyRequest, number>();

/* ---------- Fastify Hook Registration ---------- */

/**
 * Register metrics collection hooks with Fastify
 */
export function registerMetricsCollector(app: FastifyInstance): void {
  if (!METRICS_ENABLED) {
    log.info("Metrics collection disabled");
    return;
  }

  // Record request start time
  app.addHook("onRequest", async (req: FastifyRequest) => {
    requestStartTimes.set(req, Date.now());
  });

  // Record metrics on response
  app.addHook(
    "onResponse",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const startTime = requestStartTimes.get(req);
      const duration = startTime ? Date.now() - startTime : 0;

      // Get route pattern (with placeholders) if available
      const routePattern = (req.routeOptions as any)?.url || req.url;

      recordHttpRequest(req.method, routePattern, reply.statusCode, duration);

      // Clean up
      requestStartTimes.delete(req);
    }
  );

  log.info("Metrics collection enabled");
}

/* ---------- Periodic Gauge Updates ---------- */

let gaugeUpdateInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic updates for gauge metrics
 * Updates document/proof/job counts every interval
 */
export function startGaugeUpdates(intervalMs: number = 60000): void {
  if (!METRICS_ENABLED) return;

  // Stop existing interval if any
  stopGaugeUpdates();

  const updateGauges = () => {
    try {
      // Get document count
      const docCount = (
        db
          .prepare("SELECT COUNT(*) as count FROM docs WHERE deleted_at IS NULL")
          .get() as { count: number }
      ).count;

      // Get proof count
      let proofCount = 0;
      try {
        proofCount = (
          db.prepare("SELECT COUNT(*) as count FROM proofs").get() as {
            count: number;
          }
        ).count;
      } catch {
        // Table might not exist
      }

      updateDataMetrics(docCount, proofCount);

      // Get job counts by status
      try {
        const jobRows = db
          .prepare("SELECT status, COUNT(*) as count FROM jobs GROUP BY status")
          .all() as Array<{ status: string; count: number }>;

        const jobCounts: Record<string, number> = {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        };

        for (const row of jobRows) {
          jobCounts[row.status] = row.count;
        }

        updateJobMetrics(jobCounts);
      } catch {
        // Table might not exist
      }
    } catch (err) {
      log.error({ err }, "Failed to update gauge metrics");
    }
  };

  // Run immediately, then periodically
  updateGauges();
  gaugeUpdateInterval = setInterval(updateGauges, intervalMs);

  log.info({ intervalMs }, "Started periodic gauge updates");
}

/**
 * Stop periodic gauge updates
 */
export function stopGaugeUpdates(): void {
  if (gaugeUpdateInterval) {
    clearInterval(gaugeUpdateInterval);
    gaugeUpdateInterval = null;
  }
}
