// KACHERI BACKEND/src/db/index.ts
// S16: Database adapter factory — creates the correct DbAdapter based on
// the DATABASE_URL env var (postgresql://... → PostgresAdapter, otherwise SqliteAdapter).

import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { SqliteAdapter } from './sqlite.js';
import { PostgresAdapter } from './postgres.js';

export type { DbAdapter } from './types.js';
export type { RunResult } from './types.js';
export { buildDocFtsQuery, buildEntityFtsQuery, buildDocFtsSyncSql, buildEntityFtsSyncSql } from './fts.js';

let _adapter: SqliteAdapter | PostgresAdapter | null = null;

/**
 * Create (or return the cached) database adapter.
 * Called once during server startup from db.ts.
 *
 * - If DATABASE_URL starts with 'postgres', a PostgresAdapter is created.
 * - Otherwise a SqliteAdapter is created pointing at KACHERI_DB_PATH or the
 *   default data/db/kacheri.db path relative to the repo root.
 */
export function createAdapter(): SqliteAdapter | PostgresAdapter {
  if (_adapter) return _adapter;

  if (config.database.driver === 'postgresql') {
    _adapter = new PostgresAdapter(config.database.url);
  } else {
    const dbPath =
      process.env.KACHERI_DB_PATH ||
      path.resolve(process.cwd(), '..', 'data/db/kacheri.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const rawDb = new Database(dbPath);
    rawDb.pragma('journal_mode = WAL');
    _adapter = new SqliteAdapter(rawDb);
  }

  return _adapter;
}

/** Reset the adapter (for testing). */
export function resetAdapter(): void {
  _adapter = null;
}
