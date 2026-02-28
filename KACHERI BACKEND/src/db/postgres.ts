// KACHERI BACKEND/src/db/postgres.ts
// S16: PostgreSQL adapter — implements DbAdapter using the `pg` connection pool.
// SQL strings are written with SQLite-style '?' placeholders; this adapter
// converts them to PostgreSQL's positional '$1, $2, ...' syntax automatically.

import { Pool, type PoolClient } from 'pg';
import type { DbAdapter, RunResult } from './types.js';

/* ---------- Placeholder Conversion ---------- */

/**
 * Convert SQLite '?' placeholders to PostgreSQL positional '$1, $2, ...' placeholders.
 * Example: "WHERE id = ? AND workspace_id = ?" → "WHERE id = $1 AND workspace_id = $2"
 */
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/* ---------- PostgresAdapter ---------- */

export class PostgresAdapter implements DbAdapter {
  readonly dbType = 'postgresql' as const;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | undefined> {
    const result = await this.pool.query(toPositional(sql), params as unknown[]);
    return result.rows[0] as T | undefined;
  }

  async queryAll<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result = await this.pool.query(toPositional(sql), params as unknown[]);
    return result.rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = await this.pool.query(toPositional(sql), params);
    // If the SQL includes RETURNING id, use that for lastInsertRowid.
    // Otherwise default to 0 (callers that need the ID must include RETURNING id).
    const lastRow = result.rows[0] as { id?: number | bigint } | undefined;
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: lastRow?.id ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txAdapter = new PostgresTxAdapter(client);
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore rollback error */ }
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/* ---------- PostgresTxAdapter — transaction-scoped ---------- */

/**
 * Uses a pinned PoolClient so all operations in the transaction
 * share the same server-side connection and session state.
 */
class PostgresTxAdapter implements DbAdapter {
  readonly dbType = 'postgresql' as const;
  private client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | undefined> {
    const result = await this.client.query(toPositional(sql), params as unknown[]);
    return result.rows[0] as T | undefined;
  }

  async queryAll<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const result = await this.client.query(toPositional(sql), params as unknown[]);
    return result.rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = await this.client.query(toPositional(sql), params);
    const lastRow = result.rows[0] as { id?: number | bigint } | undefined;
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: lastRow?.id ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    // Already inside a transaction — execute directly.
    // Savepoints could be added here in a future slice if nested transactions are needed.
    return fn(this);
  }

  close(): Promise<void> {
    // Don't close the pool client here — the outer PostgresAdapter.transaction() releases it.
    return Promise.resolve();
  }
}
