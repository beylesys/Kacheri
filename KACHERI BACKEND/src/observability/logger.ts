// KACHERI BACKEND/src/observability/logger.ts
// P5.1: Structured JSON Logging - Logger Configuration
//
// Configures Pino for production-grade structured logging with:
// - Environment-based log levels
// - JSON output for production
// - Pretty printing for development
// - Module-scoped child loggers

import pino, { Logger } from "pino";

/* ---------- Types ---------- */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/* ---------- Configuration ---------- */

/**
 * Get the configured log level from environment
 * Defaults to 'info' for production safety
 */
export function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels: LogLevel[] = [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
  ];

  if (level && validLevels.includes(level as LogLevel)) {
    return level as LogLevel;
  }

  return "info";
}

/**
 * Check if pretty printing is enabled (for development)
 */
export function isPrettyEnabled(): boolean {
  return process.env.LOG_PRETTY === "true";
}

/* ---------- Logger Factory ---------- */

// Root logger instance (singleton)
let rootLogger: Logger | null = null;

/**
 * Get or create the root logger instance
 */
function getRootLogger(): Logger {
  if (!rootLogger) {
    const options: pino.LoggerOptions = {
      level: getLogLevel(),
      // Add base fields to all logs
      base: {
        service: "kacheri-backend",
        version: process.env.npm_package_version || "unknown",
      },
      // Timestamp in ISO format
      timestamp: pino.stdTimeFunctions.isoTime,
    };

    // Use pino-pretty for development if enabled
    if (isPrettyEnabled()) {
      rootLogger = pino({
        ...options,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      });
    } else {
      // JSON output for production
      rootLogger = pino(options);
    }
  }

  return rootLogger;
}

/**
 * Create a logger instance, optionally scoped to a module
 *
 * @param moduleName - Optional module name for context
 * @returns Pino logger instance
 *
 * @example
 * const log = createLogger('jobs/queue');
 * log.info({ jobId }, 'Job started');
 */
export function createLogger(moduleName?: string): Logger {
  const root = getRootLogger();

  if (moduleName) {
    return root.child({ module: moduleName });
  }

  return root;
}

/**
 * Create a child logger with additional context
 *
 * @param parent - Parent logger instance
 * @param bindings - Additional context to attach to all logs
 * @returns Child logger with inherited and new context
 *
 * @example
 * const reqLog = createChildLogger(log, { requestId: 'abc123', userId: 'user1' });
 */
export function createChildLogger(
  parent: Logger,
  bindings: Record<string, unknown>
): Logger {
  return parent.child(bindings);
}

/* ---------- Convenience Exports ---------- */

/**
 * Default logger instance for quick usage
 * Prefer createLogger() for module-scoped loggers
 */
export const logger = createLogger();
