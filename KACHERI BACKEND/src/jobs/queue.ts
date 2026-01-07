// KACHERI BACKEND/src/jobs/queue.ts
// P4.3: Job queue implementation
//
// A SQLite-backed job queue with optional Redis support via BullMQ.
// Falls back to synchronous SQLite-based processing if Redis is unavailable.

import { nanoid } from "nanoid";
import { db } from "../db";
import { createLogger } from "../observability";
import {
  Job,
  JobRow,
  JobType,
  JobStatus,
  JobOptions,
  JobHandler,
} from "./types";

/* ---------- Redis/BullMQ Support ---------- */
let BullQueue: any;
let redisAvailable = false;

try {
  const bullmq = require("bullmq");
  BullQueue = bullmq.Queue;
  redisAvailable = process.env.REDIS_ENABLED !== "false" && !!process.env.REDIS_URL;
} catch {
  // BullMQ not installed
}

/* ---------- Row to Job Mapper ---------- */
function rowToJob<T = unknown>(row: JobRow): Job<T> {
  return {
    id: row.id,
    type: row.type as JobType,
    docId: row.doc_id,
    userId: row.user_id,
    payload: row.payload ? JSON.parse(row.payload) : null,
    status: row.status as JobStatus,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    scheduledAt: row.scheduled_at,
    error: row.error,
    result: row.result ? JSON.parse(row.result) : null,
    workerId: row.worker_id,
  };
}

/* ---------- Logger ---------- */
const log = createLogger("jobs/queue");

/* ---------- SQLite Job Queue ---------- */
class SQLiteJobQueue {
  private handlers: Map<JobType, JobHandler> = new Map();
  private workerId: string;
  private isProcessing = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.workerId = `worker-${nanoid(8)}`;
  }

  /** Add a job to the queue */
  async add<T>(
    type: JobType,
    payload: T,
    userId: string,
    docId?: string,
    options: JobOptions = {}
  ): Promise<Job<T>> {
    const id = nanoid();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO jobs (
        id, type, doc_id, user_id, payload, status, priority,
        attempts, max_attempts, created_at, scheduled_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?)
    `);

    stmt.run(
      id,
      type,
      docId ?? null,
      userId,
      JSON.stringify(payload),
      options.priority ?? 0,
      options.maxAttempts ?? 3,
      now,
      options.delay ? now + options.delay : (options.scheduledAt ?? null)
    );

    return this.getJob(id) as Promise<Job<T>>;
  }

  /** Get a job by ID */
  async getJob<T = unknown>(id: string): Promise<Job<T> | null> {
    const row = db
      .prepare(`SELECT * FROM jobs WHERE id = ?`)
      .get(id) as JobRow | undefined;

    return row ? rowToJob<T>(row) : null;
  }

  /** Get jobs for a document */
  async getJobsByDoc(docId: string): Promise<Job[]> {
    const rows = db
      .prepare(`SELECT * FROM jobs WHERE doc_id = ? ORDER BY created_at DESC`)
      .all(docId) as JobRow[];

    return rows.map(row => rowToJob(row));
  }

  /** Get pending jobs by type */
  async getPendingJobs(type?: JobType, limit: number = 10): Promise<Job[]> {
    const now = Date.now();
    let sql = `
      SELECT * FROM jobs
      WHERE status = 'pending'
        AND (scheduled_at IS NULL OR scheduled_at <= ?)
    `;
    const params: unknown[] = [now];

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY priority DESC, created_at ASC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as JobRow[];
    return rows.map(row => rowToJob(row));
  }

  /** Cancel a job */
  async cancel(id: string): Promise<boolean> {
    const result = db
      .prepare(`UPDATE jobs SET status = 'cancelled' WHERE id = ? AND status = 'pending'`)
      .run(id);

    return result.changes > 0;
  }

  /** Retry a failed job */
  async retry(id: string): Promise<boolean> {
    const result = db
      .prepare(`UPDATE jobs SET status = 'pending', error = NULL WHERE id = ? AND status = 'failed'`)
      .run(id);

    return result.changes > 0;
  }

  /** Register a handler for a job type */
  registerHandler<T, R>(type: JobType, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler as JobHandler);
  }

  /** Process the next pending job */
  async processNext(): Promise<boolean> {
    const now = Date.now();

    // Claim a job
    const claimResult = db.prepare(`
      UPDATE jobs
      SET status = 'processing', started_at = ?, worker_id = ?, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending'
          AND (scheduled_at IS NULL OR scheduled_at <= ?)
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      )
    `).run(now, this.workerId, now);

    if (claimResult.changes === 0) {
      return false; // No jobs to process
    }

    // Get the claimed job
    const row = db.prepare(`
      SELECT * FROM jobs WHERE worker_id = ? AND status = 'processing'
      ORDER BY started_at DESC LIMIT 1
    `).get(this.workerId) as JobRow | undefined;

    if (!row) return false;

    const job = rowToJob(row);
    const handler = this.handlers.get(job.type as JobType);

    if (!handler) {
      // No handler registered
      db.prepare(`
        UPDATE jobs SET status = 'failed', error = ?, completed_at = ?
        WHERE id = ?
      `).run(`No handler registered for job type: ${job.type}`, Date.now(), job.id);
      return true;
    }

    try {
      const result = await handler(job);

      // Mark as completed
      db.prepare(`
        UPDATE jobs SET status = 'completed', result = ?, completed_at = ?
        WHERE id = ?
      `).run(JSON.stringify(result), Date.now(), job.id);
    } catch (err) {
      const error = err as Error;

      // Check if we should retry
      if (job.attempts < job.maxAttempts) {
        db.prepare(`
          UPDATE jobs SET status = 'pending', error = ?, started_at = NULL, worker_id = NULL
          WHERE id = ?
        `).run(error.message, job.id);
      } else {
        // Max attempts reached
        db.prepare(`
          UPDATE jobs SET status = 'failed', error = ?, completed_at = ?
          WHERE id = ?
        `).run(error.message, Date.now(), job.id);
      }
    }

    return true;
  }

  /** Start the job processor */
  start(intervalMs: number = 1000): void {
    if (this.pollInterval) return;

    this.isProcessing = true;
    log.info({ workerId: this.workerId }, "Job queue started");

    const process = async () => {
      if (!this.isProcessing) return;

      try {
        // Process jobs until queue is empty
        while (this.isProcessing) {
          const processed = await this.processNext();
          if (!processed) break;
        }
      } catch (err) {
        log.error({ err, workerId: this.workerId }, "Job processing error");
      }
    };

    this.pollInterval = setInterval(process, intervalMs);
    process(); // Start immediately
  }

  /** Stop the job processor */
  stop(): void {
    this.isProcessing = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    log.info({ workerId: this.workerId }, "Job queue stopped");
  }

  /** Get queue statistics */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count FROM jobs GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      const status = row.status as keyof typeof stats;
      if (status in stats) {
        stats[status] = row.count;
      }
    }

    return stats;
  }

  /** Clean up old completed/failed jobs */
  async cleanup(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - olderThanMs;

    const result = db.prepare(`
      DELETE FROM jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND completed_at < ?
    `).run(cutoff);

    return result.changes;
  }
}

/* ---------- Singleton ---------- */
let _queue: SQLiteJobQueue | null = null;

export function getJobQueue(): SQLiteJobQueue {
  if (!_queue) {
    _queue = new SQLiteJobQueue();
  }
  return _queue;
}

export function resetJobQueue(): void {
  if (_queue) {
    _queue.stop();
    _queue = null;
  }
}

/* ---------- Convenience Exports ---------- */
export const jobQueue = new Proxy({} as SQLiteJobQueue, {
  get(_target, prop) {
    return (getJobQueue() as any)[prop];
  },
});

export { SQLiteJobQueue };
