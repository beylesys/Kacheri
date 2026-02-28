// KACHERI BACKEND/src/db/sqlite.ts
// S16: SQLite adapter — wraps better-sqlite3 behind the async DbAdapter interface.
// All methods return Promises that resolve synchronously (better-sqlite3 is sync),
// preserving existing behaviour while conforming to the unified interface.

import Database from 'better-sqlite3';
import type { DbAdapter, RunResult } from './types.js';

export class SqliteAdapter implements DbAdapter {
  readonly dbType = 'sqlite' as const;
  private _db: Database.Database;

  constructor(db: Database.Database) {
    this._db = db;
  }

  /**
   * Expose the underlying better-sqlite3 Database instance.
   * Used ONLY by db.ts (WAL pragma) and the migration runner (DDL exec).
   * Store modules must NOT use this — use the adapter methods instead.
   */
  get raw(): Database.Database {
    return this._db;
  }

  queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | undefined> {
    const row = this._db.prepare(sql).get(...params) as T | undefined;
    return Promise.resolve(row);
  }

  queryAll<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    const rows = this._db.prepare(sql).all(...params) as T[];
    return Promise.resolve(rows);
  }

  run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = this._db.prepare(sql).run(...params);
    return Promise.resolve({
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    });
  }

  exec(sql: string): Promise<void> {
    this._db.exec(sql);
    return Promise.resolve();
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    // better-sqlite3's db.transaction() doesn't support async callbacks.
    // We issue BEGIN/COMMIT/ROLLBACK manually via exec() so that async
    // store functions can safely run inside a transaction.
    //
    // ⚠️  ATOMICITY LIMITATION (SQLite only):
    // Because Node.js is single-threaded and better-sqlite3 is synchronous,
    // all individual db.run()/queryOne()/queryAll() calls within fn() execute
    // atomically from SQLite's perspective. However, the `await` yields
    // between those calls allow other concurrent requests to run synchronous
    // SQLite operations in that window. This means:
    //
    //   - Read-own-writes consistency within the transaction: GUARANTEED
    //   - Isolation from concurrent writers: NOT GUARANTEED under load
    //   - Risk: "lost update" race in multi-concurrent-writer scenarios
    //
    // This is acceptable for local single-user development (the intended
    // SQLite use case). For any multi-user production deployment, use
    // PostgreSQL, which provides proper server-side transaction isolation.
    this._db.exec('BEGIN');
    try {
      const result = await fn(this);
      this._db.exec('COMMIT');
      return result;
    } catch (e) {
      try { this._db.exec('ROLLBACK'); } catch { /* ignore rollback error */ }
      throw e;
    }
  }

  close(): Promise<void> {
    this._db.close();
    return Promise.resolve();
  }
}
