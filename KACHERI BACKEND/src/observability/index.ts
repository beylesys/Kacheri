// KACHERI BACKEND/src/observability/index.ts
// P5.1-P5.2: Observability Module Exports
//
// Central export point for all observability functionality.

/* ---------- Logger ---------- */
export {
  createLogger,
  createChildLogger,
  logger,
  getLogLevel,
  isPrettyEnabled,
  type LogLevel,
} from "./logger";

/* ---------- Request ID ---------- */
export {
  generateRequestId,
  getOrCreateRequestId,
  registerRequestIdHook,
  requestIdGenerator,
  REQUEST_ID_HEADER,
  REQUEST_ID_LENGTH,
} from "./requestId";

/* ---------- Request Logger ---------- */
export {
  createRequestLogger,
  registerRequestLogger,
  getRequestLogger,
} from "./requestLogger";

/* ---------- Metrics ---------- */
export {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  aiRequestsTotal,
  aiRequestDuration,
  exportRequestsTotal,
  verificationRunsTotal,
  activeWebsocketConnections,
  documentsTotal,
  proofsTotal,
  jobsByStatus,
  recordHttpRequest,
  recordAiRequest,
  recordExport,
  recordVerification,
  setWebsocketConnections,
  updateDataMetrics,
  updateJobMetrics,
  METRICS_ENABLED,
} from "./metrics";

export {
  registerMetricsCollector,
  startGaugeUpdates,
  stopGaugeUpdates,
} from "./metricsCollector";

/* ---------- Health Checks ---------- */
export {
  getHealthStatus,
  isReady,
  isAlive,
  type HealthStatus,
  type HealthCheckResult,
} from "./healthCheck";

/* ---------- Combined Registration ---------- */
import { FastifyInstance } from "fastify";
import { registerRequestIdHook } from "./requestId";
import { registerRequestLogger } from "./requestLogger";
import { registerMetricsCollector, startGaugeUpdates } from "./metricsCollector";

/**
 * Register all observability hooks with Fastify
 * Call this after creating the Fastify instance
 */
export function registerObservability(app: FastifyInstance): void {
  registerRequestIdHook(app);
  registerRequestLogger(app);
  registerMetricsCollector(app);
  startGaugeUpdates();
}
