// KACHERI BACKEND/src/migrations/runner.ts
// P4.4: Database migration runner with up/down support
// S16: Added AsyncMigrationRunner for PostgreSQL + SQL dialect hint translation.
//
// Manages versioned SQL migrations stored in the migrations/ directory.
// Each migration file contains up and down SQL separated by "-- DOWN" marker.
//
// For SQLite (local mode): use the synchronous MigrationRunner with a raw Database.
// For PostgreSQL (cloud mode): use the AsyncMigrationRunner with a DbAdapter.
// PostgreSQL SQL dialect hints are applied automatically — see applyDialectHints().

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { createLogger } from "../observability";
import type { DbAdapter } from "../db/types";

const log = createLogger("migrations");

/* ---------- Types ---------- */
export interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
}

export interface AppliedMigration {
  id: number;
  name: string;
  applied_at: number;
}

export interface MigrationStatus {
  version: string;
  name: string;
  applied: boolean;
  appliedAt: number | null;
}

/* ---------- Constants ---------- */
const MIGRATION_TABLE = "schema_migrations";

/* ---------- Migration Runner ---------- */
export class MigrationRunner {
  private db: Database.Database;
  private migrationsDir: string;

  constructor(db: Database.Database, migrationsDir: string) {
    this.db = db;
    this.migrationsDir = migrationsDir;
    this.ensureMigrationTable();
  }

  /** Ensure the schema_migrations table exists */
  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      );
    `);
  }

  /** Parse a migration file into up and down SQL */
  private parseMigrationFile(filePath: string): { up: string; down: string } {
    const content = fs.readFileSync(filePath, "utf-8");
    const marker = "-- DOWN";
    const markerIndex = content.indexOf(marker);

    if (markerIndex === -1) {
      // No down migration defined
      return {
        up: content.trim(),
        down: "",
      };
    }

    return {
      up: content.slice(0, markerIndex).trim(),
      down: content.slice(markerIndex + marker.length).trim(),
    };
  }

  /** Extract version and name from migration filename (e.g., "001_initial_schema.sql") */
  private parseFilename(filename: string): { version: string; name: string } | null {
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) return null;
    return {
      version: match[1],
      name: match[2],
    };
  }

  /** Get all migration files from the migrations directory */
  getAllMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    const migrations: Migration[] = [];

    for (const file of files) {
      const parsed = this.parseFilename(file);
      if (!parsed) continue;

      const filePath = path.join(this.migrationsDir, file);
      const { up, down } = this.parseMigrationFile(filePath);

      migrations.push({
        version: parsed.version,
        name: parsed.name,
        up,
        down,
      });
    }

    return migrations;
  }

  /** Get list of applied migrations from database */
  getApplied(): AppliedMigration[] {
    return this.db
      .prepare(`SELECT id, name, applied_at FROM ${MIGRATION_TABLE} ORDER BY id ASC`)
      .all() as AppliedMigration[];
  }

  /** Get list of applied migration names */
  getAppliedNames(): Set<string> {
    const applied = this.getApplied();
    return new Set(applied.map(m => `${m.name}`));
  }

  /** Get pending (unapplied) migrations */
  getPending(): Migration[] {
    const applied = this.getAppliedNames();
    return this.getAllMigrations().filter(m => {
      const fullName = `${m.version}_${m.name}`;
      return !applied.has(fullName);
    });
  }

  /** Get status of all migrations */
  getStatus(): MigrationStatus[] {
    const applied = this.getApplied();
    const appliedMap = new Map(applied.map(m => [m.name, m.applied_at]));
    const all = this.getAllMigrations();

    return all.map(m => {
      const fullName = `${m.version}_${m.name}`;
      const appliedAt = appliedMap.get(fullName);
      return {
        version: m.version,
        name: m.name,
        applied: appliedAt !== undefined,
        appliedAt: appliedAt ?? null,
      };
    });
  }

  /** Run a single migration (up) */
  runOne(migration: Migration): void {
    const fullName = `${migration.version}_${migration.name}`;

    // Check if already applied
    const existing = this.db
      .prepare(`SELECT id FROM ${MIGRATION_TABLE} WHERE name = ?`)
      .get(fullName);

    if (existing) {
      throw new Error(`Migration ${fullName} has already been applied`);
    }

    // Run migration in transaction
    const runMigration = this.db.transaction(() => {
      // Execute up SQL
      this.db.exec(migration.up);

      // Record in migrations table
      this.db
        .prepare(`INSERT INTO ${MIGRATION_TABLE} (name, applied_at) VALUES (?, ?)`)
        .run(fullName, Date.now());
    });

    runMigration();
  }

  /** Run all pending migrations */
  runAll(): { applied: string[]; skipped: string[] } {
    const pending = this.getPending();
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const migration of pending) {
      const fullName = `${migration.version}_${migration.name}`;
      try {
        this.runOne(migration);
        applied.push(fullName);
      } catch (err) {
        log.error({ err, migration: fullName }, "Failed to apply migration");
        skipped.push(fullName);
        // Stop on first failure
        break;
      }
    }

    return { applied, skipped };
  }

  /** Rollback a specific migration (down) */
  rollback(version: string): void {
    const all = this.getAllMigrations();
    const migration = all.find(m => m.version === version);

    if (!migration) {
      throw new Error(`Migration ${version} not found`);
    }

    const fullName = `${migration.version}_${migration.name}`;

    // Check if applied
    const existing = this.db
      .prepare(`SELECT id FROM ${MIGRATION_TABLE} WHERE name = ?`)
      .get(fullName);

    if (!existing) {
      throw new Error(`Migration ${fullName} has not been applied`);
    }

    if (!migration.down) {
      throw new Error(`Migration ${fullName} has no down migration defined`);
    }

    // Run rollback in transaction
    const runRollback = this.db.transaction(() => {
      // Execute down SQL
      this.db.exec(migration.down);

      // Remove from migrations table
      this.db
        .prepare(`DELETE FROM ${MIGRATION_TABLE} WHERE name = ?`)
        .run(fullName);
    });

    runRollback();
  }

  /** Rollback the last applied migration */
  rollbackLast(): string | null {
    const applied = this.getApplied();
    if (applied.length === 0) {
      return null;
    }

    const last = applied[applied.length - 1];
    // Extract version from "001_name" format
    const version = last.name.split("_")[0];
    this.rollback(version);
    return last.name;
  }

  /** Create a new migration file */
  create(name: string): string {
    const all = this.getAllMigrations();
    const lastVersion = all.length > 0
      ? parseInt(all[all.length - 1].version, 10)
      : 0;
    const newVersion = String(lastVersion + 1).padStart(3, "0");
    const filename = `${newVersion}_${name}.sql`;
    const filePath = path.join(this.migrationsDir, filename);

    const template = `-- Migration: ${name}
-- Version: ${newVersion}
-- Created: ${new Date().toISOString()}

-- UP migration


-- DOWN
-- Rollback SQL (optional)

`;

    fs.mkdirSync(this.migrationsDir, { recursive: true });
    fs.writeFileSync(filePath, template, "utf-8");

    return filePath;
  }
}

/* ---------- Factory ---------- */
export function createMigrationRunner(db: Database.Database, migrationsDir?: string): MigrationRunner {
  const defaultDir = path.resolve(process.cwd(), "migrations");
  return new MigrationRunner(db, migrationsDir ?? defaultDir);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * S16: PostgreSQL SQL Dialect Hints
 * Translates SQLite-specific DDL to PostgreSQL equivalents.
 * Called by AsyncMigrationRunner before executing each migration.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * Apply SQLite → PostgreSQL dialect translation hints to a migration SQL string.
 *
 * Rules applied (in order):
 * 1. Skip PRAGMA statements entirely
 * 2. Skip CREATE VIRTUAL TABLE ... USING fts5 (PostgreSQL uses tsvector — handled separately)
 * 3. Replace INTEGER PRIMARY KEY AUTOINCREMENT → BIGSERIAL PRIMARY KEY
 * 4. Replace datetime('now') → NOW()
 * 5. Replace DEFAULT (CURRENT_TIMESTAMP) → DEFAULT CURRENT_TIMESTAMP (standard SQL)
 */
export function applyDialectHints(sql: string): string {
  const lines = sql.split('\n');
  const outputLines: string[] = [];
  let inFts5Block = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip PRAGMA statements
    if (/^\s*PRAGMA\s+/i.test(trimmed)) {
      outputLines.push(`-- [pg-skip] ${line}`);
      continue;
    }

    // Skip FTS5 virtual table creation (multi-line blocks)
    if (/CREATE\s+VIRTUAL\s+TABLE\s+/i.test(trimmed) && /USING\s+fts5/i.test(trimmed)) {
      outputLines.push(`-- [pg-skip-fts5] ${line}`);
      inFts5Block = !trimmed.endsWith(';');
      continue;
    }
    if (inFts5Block) {
      outputLines.push(`-- [pg-skip-fts5] ${line}`);
      if (trimmed.endsWith(');') || trimmed.endsWith(';')) {
        inFts5Block = false;
      }
      continue;
    }

    let out = line;

    // INTEGER PRIMARY KEY AUTOINCREMENT → BIGSERIAL PRIMARY KEY
    out = out.replace(
      /\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi,
      'BIGSERIAL PRIMARY KEY'
    );

    // datetime('now') → NOW()
    out = out.replace(/\bdatetime\s*\(\s*'now'\s*\)/gi, 'NOW()');

    // DEFAULT (CURRENT_TIMESTAMP) → DEFAULT CURRENT_TIMESTAMP
    out = out.replace(/DEFAULT\s+\(CURRENT_TIMESTAMP\)/gi, 'DEFAULT CURRENT_TIMESTAMP');

    outputLines.push(out);
  }

  return outputLines.join('\n');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * S16: AsyncMigrationRunner — uses DbAdapter for PostgreSQL migrations
 * ═════════════════════════════════════════════════════════════════════════ */

const asyncLog = createLogger("migrations-async");

export class AsyncMigrationRunner {
  private adapter: DbAdapter;
  private migrationsDir: string;

  constructor(adapter: DbAdapter, migrationsDir?: string) {
    this.adapter = adapter;
    this.migrationsDir = migrationsDir ?? path.resolve(process.cwd(), "migrations");
  }

  /** Ensure the schema_migrations table exists (PostgreSQL DDL) */
  async ensureMigrationTable(): Promise<void> {
    const ddl = this.adapter.dbType === 'postgresql'
      ? `CREATE TABLE IF NOT EXISTS schema_migrations (
           id BIGSERIAL PRIMARY KEY,
           name TEXT NOT NULL UNIQUE,
           applied_at BIGINT NOT NULL
         );`
      : `CREATE TABLE IF NOT EXISTS schema_migrations (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT NOT NULL UNIQUE,
           applied_at INTEGER NOT NULL
         );`;
    await this.adapter.exec(ddl);
  }

  /** Parse a migration file into up and down SQL */
  private parseMigrationFile(filePath: string): { up: string; down: string } {
    const content = fs.readFileSync(filePath, "utf-8");
    const marker = "-- DOWN";
    const markerIndex = content.indexOf(marker);
    if (markerIndex === -1) {
      return { up: content.trim(), down: "" };
    }
    return {
      up: content.slice(0, markerIndex).trim(),
      down: content.slice(markerIndex + marker.length).trim(),
    };
  }

  /** Extract version and name from migration filename */
  private parseFilename(filename: string): { version: string; name: string } | null {
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) return null;
    return { version: match[1], name: match[2] };
  }

  /** Get all migration files */
  getAllMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsDir)) return [];
    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();
    const migrations: Migration[] = [];
    for (const file of files) {
      const parsed = this.parseFilename(file);
      if (!parsed) continue;
      const filePath = path.join(this.migrationsDir, file);
      const { up, down } = this.parseMigrationFile(filePath);
      migrations.push({ version: parsed.version, name: parsed.name, up, down });
    }
    return migrations;
  }

  /** Get names of already-applied migrations */
  async getAppliedNames(): Promise<Set<string>> {
    await this.ensureMigrationTable();
    const rows = await this.adapter.queryAll<{ name: string }>(
      `SELECT name FROM schema_migrations ORDER BY id ASC`
    );
    return new Set(rows.map(r => r.name));
  }

  /** Run all pending migrations */
  async runAll(): Promise<{ applied: string[]; skipped: string[] }> {
    await this.ensureMigrationTable();
    const appliedNames = await this.getAppliedNames();
    const all = this.getAllMigrations();
    const pending = all.filter(m => !appliedNames.has(`${m.version}_${m.name}`));

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const migration of pending) {
      const fullName = `${migration.version}_${migration.name}`;
      try {
        // Apply dialect translation for PostgreSQL
        const sql = this.adapter.dbType === 'postgresql'
          ? applyDialectHints(migration.up)
          : migration.up;

        await this.adapter.transaction(async (tx) => {
          await tx.exec(sql);
          await tx.run(
            `INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`,
            [fullName, Date.now()]
          );
        });
        applied.push(fullName);
        asyncLog.info({ migration: fullName }, 'Applied migration');
      } catch (err) {
        asyncLog.error({ err, migration: fullName }, 'Failed to apply migration');
        skipped.push(fullName);
        break; // Stop on first failure
      }
    }

    return { applied, skipped };
  }
}
