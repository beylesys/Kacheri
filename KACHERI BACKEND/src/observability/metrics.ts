// KACHERI BACKEND/src/observability/metrics.ts
// P5.2: Prometheus Metrics Collection
//
// Defines application metrics using prom-client.
// Metrics are exposed via GET /metrics endpoint.

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

/* ---------- Configuration ---------- */
const METRICS_PREFIX = process.env.METRICS_PREFIX || "kacheri";
const METRICS_ENABLED = process.env.METRICS_ENABLED !== "false";

/* ---------- Registry ---------- */
export const registry = new Registry();

// Set default labels
registry.setDefaultLabels({
  service: "kacheri-backend",
});

// Collect default Node.js metrics (memory, CPU, event loop, etc.)
if (METRICS_ENABLED) {
  collectDefaultMetrics({ register: registry, prefix: `${METRICS_PREFIX}_` });
}

/* ---------- HTTP Metrics ---------- */

/**
 * Total HTTP requests counter
 */
export const httpRequestsTotal = new Counter({
  name: `${METRICS_PREFIX}_http_requests_total`,
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
  name: `${METRICS_PREFIX}_http_request_duration_seconds`,
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/* ---------- AI Metrics ---------- */

/**
 * Total AI operation requests counter
 */
export const aiRequestsTotal = new Counter({
  name: `${METRICS_PREFIX}_ai_requests_total`,
  help: "Total number of AI operation requests",
  labelNames: ["action", "provider", "status"] as const,
  registers: [registry],
});

/**
 * AI operation duration histogram
 */
export const aiRequestDuration = new Histogram({
  name: `${METRICS_PREFIX}_ai_request_duration_seconds`,
  help: "AI operation duration in seconds",
  labelNames: ["action", "provider"] as const,
  buckets: [0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [registry],
});

/* ---------- Export Metrics ---------- */

/**
 * Total export requests counter
 */
export const exportRequestsTotal = new Counter({
  name: `${METRICS_PREFIX}_export_requests_total`,
  help: "Total number of export requests",
  labelNames: ["kind", "status"] as const,
  registers: [registry],
});

/* ---------- Verification Metrics ---------- */

/**
 * Total verification runs counter
 */
export const verificationRunsTotal = new Counter({
  name: `${METRICS_PREFIX}_verification_runs_total`,
  help: "Total number of verification runs",
  labelNames: ["status"] as const,
  registers: [registry],
});

/* ---------- Connection Metrics ---------- */

/**
 * Active WebSocket connections gauge
 */
export const activeWebsocketConnections = new Gauge({
  name: `${METRICS_PREFIX}_active_websocket_connections`,
  help: "Number of active WebSocket connections",
  registers: [registry],
});

/* ---------- Data Metrics ---------- */

/**
 * Total documents gauge
 */
export const documentsTotal = new Gauge({
  name: `${METRICS_PREFIX}_documents_total`,
  help: "Total number of documents",
  registers: [registry],
});

/**
 * Total proofs gauge
 */
export const proofsTotal = new Gauge({
  name: `${METRICS_PREFIX}_proofs_total`,
  help: "Total number of proofs",
  registers: [registry],
});

/**
 * Jobs by status gauge
 */
export const jobsByStatus = new Gauge({
  name: `${METRICS_PREFIX}_jobs_total`,
  help: "Total number of jobs by status",
  labelNames: ["status"] as const,
  registers: [registry],
});

/* ---------- Helper Functions ---------- */

/**
 * Record an HTTP request
 */
export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number
): void {
  if (!METRICS_ENABLED) return;

  httpRequestsTotal.inc({
    method,
    route: normalizeRoute(route),
    status_code: statusCode.toString(),
  });

  httpRequestDuration.observe(
    { method, route: normalizeRoute(route) },
    durationMs / 1000
  );
}

/**
 * Record an AI operation
 */
export function recordAiRequest(
  action: string,
  provider: string,
  status: "success" | "error",
  durationMs: number
): void {
  if (!METRICS_ENABLED) return;

  aiRequestsTotal.inc({ action, provider, status });
  aiRequestDuration.observe({ action, provider }, durationMs / 1000);
}

/**
 * Record an export operation
 */
export function recordExport(kind: string, status: "success" | "error"): void {
  if (!METRICS_ENABLED) return;
  exportRequestsTotal.inc({ kind, status });
}

/**
 * Record a verification run
 */
export function recordVerification(status: "pass" | "fail" | "miss"): void {
  if (!METRICS_ENABLED) return;
  verificationRunsTotal.inc({ status });
}

/**
 * Update WebSocket connection count
 */
export function setWebsocketConnections(count: number): void {
  if (!METRICS_ENABLED) return;
  activeWebsocketConnections.set(count);
}

/**
 * Update document and proof counts
 * Called periodically to refresh gauge values
 */
export function updateDataMetrics(docs: number, proofs: number): void {
  if (!METRICS_ENABLED) return;
  documentsTotal.set(docs);
  proofsTotal.set(proofs);
}

/**
 * Update job status counts
 */
export function updateJobMetrics(jobs: Record<string, number>): void {
  if (!METRICS_ENABLED) return;
  for (const [status, count] of Object.entries(jobs)) {
    jobsByStatus.set({ status }, count);
  }
}

/* ---------- Route Normalization ---------- */

/**
 * Normalize route paths to reduce cardinality
 * Replaces dynamic segments with placeholders
 */
function normalizeRoute(route: string): string {
  // Remove query string
  const path = route.split("?")[0];

  // Replace UUIDs and numeric IDs with placeholders
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/doc-[a-zA-Z0-9_-]+/g, "/:id")
    .replace(/\/[a-zA-Z0-9_-]{21}/g, "/:id") // nanoid
    .replace(/\/\d+/g, "/:id");
}

/* ---------- Exports ---------- */
export { METRICS_ENABLED };
