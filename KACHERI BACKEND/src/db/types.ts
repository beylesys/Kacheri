// KACHERI BACKEND/src/db/types.ts
// S16: Database adapter interface — unified async API for SQLite and PostgreSQL

/* ---------- Result Types ---------- */

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/* ---------- DbAdapter Interface ---------- */

/**
 * Unified async database interface.
 * Both SQLite (better-sqlite3) and PostgreSQL (pg) implement this.
 * Store modules import `db` from '../db' which exports a DbAdapter instance.
 *
 * Query methods use SQLite '?' placeholders in SQL strings.
 * The PostgresAdapter automatically converts '?' to '$1, $2, ...' before execution.
 */
export interface DbAdapter {
  /** Identifies the underlying database driver. Used for dialect-specific SQL branches. */
  readonly dbType: 'sqlite' | 'postgresql';

  /**
   * Execute a SELECT query and return the first matching row, or undefined if no match.
   * @param sql    SQL string with '?' parameter placeholders
   * @param params Ordered parameter values matching the placeholders
   */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T | undefined>;

  /**
   * Execute a SELECT query and return all matching rows.
   * @param sql    SQL string with '?' parameter placeholders
   * @param params Ordered parameter values matching the placeholders
   */
  queryAll<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]>;

  /**
   * Execute an INSERT, UPDATE, or DELETE statement.
   * For PostgreSQL, include `RETURNING id` in the SQL to populate lastInsertRowid.
   * @returns RunResult with changes count and lastInsertRowid
   */
  run(sql: string, params?: unknown[]): Promise<RunResult>;

  /**
   * Execute raw SQL without parameters. Used for DDL (CREATE TABLE, CREATE INDEX).
   * For multi-statement DDL, separate statements with semicolons.
   */
  exec(sql: string): Promise<void>;

  /**
   * Execute a series of operations atomically.
   * The callback receives the same adapter (SQLite: wrapped in BEGIN/COMMIT,
   * PostgreSQL: uses a dedicated PoolClient with BEGIN/COMMIT).
   * On error, ROLLBACK is issued automatically.
   */
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;

  /** Close the database connection (pool). */
  close(): Promise<void>;
}
