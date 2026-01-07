/**
 * Maintenance Mode
 *
 * When enabled, all routes return 503 Service Unavailable
 * except for health checks and auth status.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getAuthConfig } from './config';

// Routes that are always accessible, even in maintenance mode
const MAINTENANCE_EXEMPT_ROUTES = [
  '/health',
  '/auth/status',
  '/api/health',
  '/api/auth/status',
];

/**
 * Check if a route is exempt from maintenance mode
 */
export function isMaintenanceExempt(url: string): boolean {
  // Normalize URL (remove query string)
  const path = url.split('?')[0];

  return MAINTENANCE_EXEMPT_ROUTES.some(
    (exempt) => path === exempt || path.startsWith(exempt + '/')
  );
}

/**
 * Maintenance mode response
 */
export interface MaintenanceResponse {
  error: 'maintenance';
  message: string;
  retryAfter?: number;
}

/**
 * Create maintenance mode response
 */
export function maintenanceResponse(): MaintenanceResponse {
  return {
    error: 'maintenance',
    message: 'Service is temporarily unavailable for maintenance. Please try again later.',
    retryAfter: 300, // 5 minutes
  };
}

/**
 * Check if maintenance mode is active
 */
export function isMaintenanceMode(): boolean {
  return getAuthConfig().maintenanceMode;
}

/**
 * Maintenance mode hook for Fastify
 * Returns true if request was blocked, false if allowed through
 */
export function checkMaintenanceMode(
  req: FastifyRequest,
  reply: FastifyReply
): boolean {
  if (!isMaintenanceMode()) {
    return false;
  }

  if (isMaintenanceExempt(req.url)) {
    return false;
  }

  reply
    .status(503)
    .header('Retry-After', '300')
    .send(maintenanceResponse());

  return true;
}

/**
 * Get current system status
 */
export function getSystemStatus(): {
  mode: 'production' | 'development' | 'maintenance';
  maintenance: boolean;
  timestamp: number;
} {
  const config = getAuthConfig();

  return {
    mode: config.mode,
    maintenance: config.maintenanceMode,
    timestamp: Date.now(),
  };
}
