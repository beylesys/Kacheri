#!/usr/bin/env ts-node
// KACHERI BACKEND/scripts/migrate.ts
// P4.4: CLI for database migrations
//
// Usage:
//   npm run migrate              # Apply all pending migrations
//   npm run migrate:status       # Show migration status
//   npm run migrate:up 001       # Apply specific version
//   npm run migrate:down 001     # Rollback specific version
//   npm run migrate:create name  # Create new migration file

import path from "path";
import { db } from "../src/db";
import { createMigrationRunner } from "../src/migrations/runner";

/* ---------- Setup ---------- */
const migrationsDir = path.resolve(__dirname, "../migrations");
const runner = createMigrationRunner(db, migrationsDir);

/* ---------- CLI Commands ---------- */
function showStatus(): void {
  const statuses = runner.getStatus();

  if (statuses.length === 0) {
    console.log("No migrations found.");
    return;
  }

  console.log("\nMigration Status:");
  console.log("─".repeat(60));

  for (const s of statuses) {
    const status = s.applied ? "✓ Applied" : "○ Pending";
    const date = s.appliedAt
      ? new Date(s.appliedAt).toISOString()
      : "-";
    console.log(`  ${s.version}_${s.name}`);
    console.log(`    Status: ${status}`);
    if (s.applied) {
      console.log(`    Applied: ${date}`);
    }
    console.log();
  }

  const pending = runner.getPending();
  console.log(`Total: ${statuses.length} migrations, ${pending.length} pending`);
}

function runAll(): void {
  const pending = runner.getPending();

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  console.log(`\nApplying ${pending.length} pending migration(s)...\n`);

  const result = runner.runAll();

  for (const name of result.applied) {
    console.log(`  ✓ Applied: ${name}`);
  }

  for (const name of result.skipped) {
    console.log(`  ✗ Skipped: ${name}`);
  }

  console.log(`\nApplied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
}

function runUp(version: string): void {
  const all = runner.getAllMigrations();
  const migration = all.find(m => m.version === version);

  if (!migration) {
    console.error(`Migration ${version} not found.`);
    process.exit(1);
  }

  const fullName = `${migration.version}_${migration.name}`;

  try {
    runner.runOne(migration);
    console.log(`✓ Applied: ${fullName}`);
  } catch (err) {
    console.error(`Failed to apply ${fullName}:`, err);
    process.exit(1);
  }
}

function runDown(version: string): void {
  try {
    runner.rollback(version);
    console.log(`✓ Rolled back: ${version}`);
  } catch (err) {
    console.error(`Failed to rollback ${version}:`, err);
    process.exit(1);
  }
}

function createMigration(name: string): void {
  if (!name || name.trim() === "") {
    console.error("Migration name is required.");
    process.exit(1);
  }

  // Sanitize name (replace spaces with underscores, remove special chars)
  const safeName = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  const filePath = runner.create(safeName);
  console.log(`✓ Created: ${filePath}`);
}

function rollbackLast(): void {
  const rolled = runner.rollbackLast();
  if (rolled) {
    console.log(`✓ Rolled back: ${rolled}`);
  } else {
    console.log("No migrations to rollback.");
  }
}

/* ---------- Main ---------- */
function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || "run";
  const param = args[1];

  switch (command) {
    case "run":
    case "up":
      if (param) {
        runUp(param);
      } else {
        runAll();
      }
      break;

    case "status":
      showStatus();
      break;

    case "down":
    case "rollback":
      if (param) {
        runDown(param);
      } else {
        rollbackLast();
      }
      break;

    case "create":
      createMigration(param);
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(`
Database Migration CLI

Usage:
  npm run migrate              Apply all pending migrations
  npm run migrate:status       Show migration status
  npm run migrate:up <V>       Apply specific version
  npm run migrate:down [V]     Rollback specific version (or last if no version)
  npm run migrate:create <N>   Create new migration file

Examples:
  npm run migrate:status
  npm run migrate:up 002
  npm run migrate:down 002
  npm run migrate:create add_user_preferences
`);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log("Run 'npm run migrate help' for usage.");
      process.exit(1);
  }
}

main();
