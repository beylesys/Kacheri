// KACHERI BACKEND/src/observability/requestId.ts
// P5.1: Structured JSON Logging - Request ID Generation
//
// Generates unique request IDs for correlation across logs.
// Supports distributed tracing via X-Request-ID header passthrough.

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { IncomingMessage } from "http";
import { nanoid } from "nanoid";

/* ---------- Constants ---------- */
export const REQUEST_ID_HEADER = "x-request-id";
export const REQUEST_ID_LENGTH = 21; // nanoid default

/* ---------- Request ID Generation ---------- */

/**
 * Generate a new unique request ID
 */
export function generateRequestId(): string {
  return nanoid(REQUEST_ID_LENGTH);
}

/**
 * Extract request ID from incoming message headers or generate a new one
 * Supports distributed tracing by accepting upstream X-Request-ID
 */
export function getOrCreateRequestIdFromMessage(req: IncomingMessage): string {
  const incomingId = req.headers[REQUEST_ID_HEADER];

  if (typeof incomingId === "string" && incomingId.length > 0) {
    return incomingId;
  }

  return generateRequestId();
}

/**
 * Extract request ID from FastifyRequest or generate a new one
 */
export function getOrCreateRequestId(req: FastifyRequest): string {
  const incomingId = req.headers[REQUEST_ID_HEADER];

  if (typeof incomingId === "string" && incomingId.length > 0) {
    return incomingId;
  }

  return generateRequestId();
}

/* ---------- Fastify Hook Registration ---------- */

/**
 * Register request ID hooks with Fastify
 *
 * This hook:
 * 1. Extracts X-Request-ID from incoming requests (for distributed tracing)
 * 2. Generates a new ID if none provided
 * 3. Attaches the ID to req.id for use in logging
 * 4. Adds X-Request-ID to response headers
 */
export function registerRequestIdHook(app: FastifyInstance): void {
  // Add response header with request ID
  app.addHook("onSend", async (req: FastifyRequest, reply: FastifyReply) => {
    // Set response header for client correlation
    reply.header(REQUEST_ID_HEADER, req.id);
  });
}

/**
 * Custom request ID generator for Fastify configuration
 * Use this in Fastify({ genReqId: requestIdGenerator })
 *
 * Note: genReqId receives IncomingMessage, not FastifyRequest
 */
export function requestIdGenerator(req: IncomingMessage): string {
  return getOrCreateRequestIdFromMessage(req);
}
