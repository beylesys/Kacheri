// KACHERI BACKEND/src/observability/requestLogger.ts
// P5.1: Structured JSON Logging - Request/Response Logging
//
// Middleware for logging structured request/response data with timing.
// Captures context like userId, workspaceId, and docId from headers/params.

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createLogger, createChildLogger } from "./logger";

/* ---------- Types ---------- */
interface RequestContext {
  requestId: string;
  method: string;
  url: string;
  userId?: string;
  workspaceId?: string;
  docId?: string;
  [key: string]: unknown;
}

/* ---------- Context Extraction ---------- */

/**
 * Extract user context from request headers
 * These headers are set by auth middleware
 */
function extractUserContext(req: FastifyRequest): {
  userId?: string;
  workspaceId?: string;
} {
  const userId = req.headers["x-user-id"];
  const workspaceId = req.headers["x-workspace-id"];

  return {
    userId: typeof userId === "string" ? userId : undefined,
    workspaceId: typeof workspaceId === "string" ? workspaceId : undefined,
  };
}

/**
 * Extract document ID from route params if available
 */
function extractDocId(req: FastifyRequest): string | undefined {
  const params = req.params as Record<string, string> | undefined;

  if (params) {
    // Check common param names for document ID
    return params.docId || params.id || params.documentId;
  }

  return undefined;
}

/**
 * Build full request context for logging
 */
function buildRequestContext(req: FastifyRequest): RequestContext {
  const userContext = extractUserContext(req);

  return {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ...userContext,
    docId: extractDocId(req),
  };
}

/* ---------- Logger Factory ---------- */

const baseLogger = createLogger("http");

/**
 * Create a request-scoped logger with context
 */
export function createRequestLogger(req: FastifyRequest) {
  const context = buildRequestContext(req);
  return createChildLogger(baseLogger, context);
}

/* ---------- Fastify Hook Registration ---------- */

// Store request start times for duration calculation
const requestStartTimes = new WeakMap<FastifyRequest, number>();

/**
 * Register request logging hooks with Fastify
 *
 * Logs:
 * - Request start with method, URL, and context
 * - Request completion with status code and duration
 * - Request errors with error details
 */
export function registerRequestLogger(app: FastifyInstance): void {
  // Log request start
  app.addHook("onRequest", async (req: FastifyRequest) => {
    requestStartTimes.set(req, Date.now());

    const context = buildRequestContext(req);
    const log = createChildLogger(baseLogger, context);

    // Attach logger to request for use in handlers
    (req as any).log = log;

    // Log at debug level to avoid noise in production
    log.debug("request started");
  });

  // Log response
  app.addHook(
    "onResponse",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const startTime = requestStartTimes.get(req);
      const duration = startTime ? Date.now() - startTime : 0;

      const context = buildRequestContext(req);
      const log = createChildLogger(baseLogger, {
        ...context,
        statusCode: reply.statusCode,
        duration,
      });

      // Log level based on status code
      if (reply.statusCode >= 500) {
        log.error("request failed");
      } else if (reply.statusCode >= 400) {
        log.warn("request error");
      } else {
        log.info("request completed");
      }

      // Clean up
      requestStartTimes.delete(req);
    }
  );

  // Log errors
  app.addHook("onError", async (req: FastifyRequest, _reply, error) => {
    const context = buildRequestContext(req);
    const log = createChildLogger(baseLogger, context);

    log.error(
      {
        err: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
      },
      "request error"
    );
  });
}

/* ---------- Request Logger Access ---------- */

/**
 * Get the request-scoped logger from a Fastify request
 * Falls back to base logger if not attached
 */
export function getRequestLogger(req: FastifyRequest) {
  return (req as any).log || baseLogger;
}
