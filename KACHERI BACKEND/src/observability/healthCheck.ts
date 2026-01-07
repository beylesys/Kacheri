// KACHERI BACKEND/src/observability/healthCheck.ts
// P5.3: Health Check Implementation
//
// Comprehensive health checks for all service dependencies.
// Supports Kubernetes-style readiness and liveness probes.

import { db } from "../db";
import { getStorage } from "../storage";
import { createLogger } from "./logger";

const log = createLogger("health");

/* ---------- Types ---------- */

export interface HealthCheckResult {
  status: "up" | "down";
  latency?: number;
  error?: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: HealthCheckResult;
    storage: HealthCheckResult;
  };
}

/* ---------- Configuration ---------- */

const HEALTH_CHECK_TIMEOUT = Number(process.env.HEALTH_CHECK_TIMEOUT) || 5000;
const SERVICE_VERSION = process.env.npm_package_version || "unknown";
const startTime = Date.now();

/* ---------- Individual Health Checks ---------- */

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    // Simple query to verify database is accessible
    const result = db.prepare("SELECT 1 as ok").get() as { ok: number } | undefined;

    if (result?.ok === 1) {
      return {
        status: "up",
        latency: Date.now() - start,
      };
    }

    return {
      status: "down",
      latency: Date.now() - start,
      error: "Unexpected query result",
    };
  } catch (err) {
    const error = err as Error;
    log.error({ err }, "Database health check failed");
    return {
      status: "down",
      latency: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Check storage accessibility
 */
async function checkStorage(): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const storage = getStorage();

    // Try to check if a known path exists (non-destructive)
    // This tests basic storage connectivity
    await storage.exists("health-check-probe");

    return {
      status: "up",
      latency: Date.now() - start,
    };
  } catch (err) {
    const error = err as Error;
    log.error({ err }, "Storage health check failed");
    return {
      status: "down",
      latency: Date.now() - start,
      error: error.message,
    };
  }
}

/* ---------- Timeout Wrapper ---------- */

/**
 * Run a health check with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/* ---------- Combined Health Check ---------- */

/**
 * Run all health checks and return combined status
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const [database, storage] = await Promise.all([
    withTimeout(
      checkDatabase(),
      HEALTH_CHECK_TIMEOUT,
      { status: "down" as const, error: "Timeout" }
    ),
    withTimeout(
      checkStorage(),
      HEALTH_CHECK_TIMEOUT,
      { status: "down" as const, error: "Timeout" }
    ),
  ]);

  const checks = { database, storage };

  // Determine overall status
  const allUp = Object.values(checks).every((c) => c.status === "up");
  const allDown = Object.values(checks).every((c) => c.status === "down");

  let status: "healthy" | "degraded" | "unhealthy";
  if (allUp) {
    status = "healthy";
  } else if (allDown) {
    status = "unhealthy";
  } else {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    version: SERVICE_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };
}

/* ---------- Kubernetes Probes ---------- */

/**
 * Readiness probe - is the service ready to accept traffic?
 * Returns true if all critical dependencies are available
 */
export async function isReady(): Promise<boolean> {
  const health = await getHealthStatus();
  return health.status === "healthy";
}

/**
 * Liveness probe - is the service alive?
 * Returns true if the service is running (even if degraded)
 */
export async function isAlive(): Promise<boolean> {
  const health = await getHealthStatus();
  return health.status !== "unhealthy";
}
