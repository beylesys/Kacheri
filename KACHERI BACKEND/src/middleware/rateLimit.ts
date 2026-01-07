// KACHERI BACKEND/src/middleware/rateLimit.ts
// Rate limiting middleware for AI endpoints

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Rate limit configurations for different AI endpoint types.
 * Limits are per-user per hour.
 */
export const AI_RATE_LIMITS = {
  // Strictest - full document generation is expensive
  compose: { max: 10, timeWindow: '1 hour' },

  // Moderate - selection-based operations
  rewrite: { max: 30, timeWindow: '1 hour' },
  constrainedRewrite: { max: 30, timeWindow: '1 hour' },

  // More lenient - lighter operations
  detectFields: { max: 50, timeWindow: '1 hour' },

  // Default for generic AI actions
  generic: { max: 20, timeWindow: '1 hour' },
};

/**
 * Extract user identifier from request for rate limiting.
 * Priority: x-user-id > x-dev-user > IP address
 */
function getUserKey(request: FastifyRequest): string {
  const userId = request.headers['x-user-id'];
  if (userId && typeof userId === 'string') {
    return `user:${userId}`;
  }

  const devUser = request.headers['x-dev-user'];
  if (devUser && typeof devUser === 'string') {
    return `dev:${devUser}`;
  }

  // Fallback to IP address
  return `ip:${request.ip}`;
}

/**
 * Register the rate limit plugin with Fastify.
 * Call this early in server initialization, before route registration.
 */
export async function registerRateLimit(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    // Don't apply globally - we'll configure per-route
    global: false,

    // Default settings (can be overridden per route)
    max: 100,
    timeWindow: '1 hour',

    // Use user ID as rate limit key
    keyGenerator: getUserKey,

    // Custom error response
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),

    // Add standard rate limit headers to responses
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}

/**
 * Get rate limit config for a specific AI route type.
 */
export function getRateLimitConfig(routeType: keyof typeof AI_RATE_LIMITS) {
  return {
    config: {
      rateLimit: AI_RATE_LIMITS[routeType],
    },
  };
}
