// KACHERI BACKEND/scripts/nightly_verify.ts
// Purpose: Orchestrate existing replay/verify scripts into a single JSON report under ./.reports/.
// The repo already includes replay_exports.ts and replay_ai_compose.ts; this script shells them.
// Also saves report to database (Phase 5 - P0.3).

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createReport } from '../src/store/verificationReports';

interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ExportsSummary {
  total: number;
  pass: number;
  fail: number;
  miss: number;
}

interface ComposeSummary {
  total: number;
  pass: number;
  drift: number;
  miss: number;
  rerun: boolean;
}

function runTsNode(scriptRelPath: string, args: string[]): ScriptResult {
  const scriptPath = path.resolve(process.cwd(), 'scripts', scriptRelPath);
  const res = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['ts-node', scriptPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    encoding: 'utf-8'
  });
  return {
    code: res.status ?? -1,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function ensureReportsDir(): string {
  const dir = path.resolve(process.cwd(), '.reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Parse exports summary from script stdout.
 * Expected format: { "total": N, "pass": N, "fail": N, "miss": N }
 */
function parseExportsSummary(stdout: string): ExportsSummary {
  try {
    // Find JSON in stdout (last line usually)
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.includes('"total"')) {
        return JSON.parse(line) as ExportsSummary;
      }
    }
  } catch {
    // Fallback
  }
  return { total: 0, pass: 0, fail: 0, miss: 0 };
}

/**
 * Parse compose summary from script stdout.
 * Expected format: { "total": N, "pass": N, "drift": N, "miss": N, "rerun": boolean }
 */
function parseComposeSummary(stdout: string): ComposeSummary {
  try {
    // Find JSON in stdout (last line usually)
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.includes('"total"')) {
        return JSON.parse(line) as ComposeSummary;
      }
    }
  } catch {
    // Fallback
  }
  return { total: 0, pass: 0, drift: 0, miss: 0, rerun: false };
}

/**
 * Determine overall status based on verification results.
 * - 'pass': All checks passed (no failures or drifts)
 * - 'fail': Any failures or drifts detected
 * - 'partial': Only misses (files not found, but no actual failures)
 */
function determineStatus(
  expSum: ExportsSummary,
  compSum: ComposeSummary,
  expCode: number,
  compCode: number
): 'pass' | 'fail' | 'partial' {
  // Script crashed = fail
  if (expCode !== 0 || compCode !== 0) return 'fail';

  // Any failures or drifts = fail
  if (expSum.fail > 0 || compSum.drift > 0) return 'fail';

  // Any misses but no failures = partial
  if (expSum.miss > 0 || compSum.miss > 0) return 'partial';

  // Everything passed
  return 'pass';
}

function main() {
  const reportsDir = ensureReportsDir();

  console.log('[nightly] Starting verification run...');

  // 1) Exports verification
  console.log('[nightly] Running exports verification...');
  const exp = runTsNode('replay_exports.ts', []);

  // 2) AI compose replay / determinism
  console.log('[nightly] Running AI compose verification...');
  const ai = runTsNode('replay_ai_compose.ts', []); // add --rerun if desired

  // Parse summaries from stdout
  const expSum = parseExportsSummary(exp.stdout);
  const compSum = parseComposeSummary(ai.stdout);

  // Determine overall status
  const status = determineStatus(expSum, compSum, exp.code, ai.code);

  const report = {
    startedAt: new Date().toISOString(),
    status,
    exports: {
      exitCode: exp.code,
      summary: expSum,
      stdout: exp.stdout,
      stderr: exp.stderr
    },
    aiCompose: {
      exitCode: ai.code,
      summary: compSum,
      stdout: ai.stdout,
      stderr: ai.stderr
    }
  };

  // Write to filesystem (existing behavior)
  const outPath = path.join(reportsDir, `nightly-${timestamp()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[nightly] Wrote file report: ${outPath}`);

  // Save to database (Phase 5 - P0.3)
  const triggeredBy = process.env.GITHUB_ACTIONS === 'true' ? 'github_actions' : 'manual';
  try {
    const dbReport = createReport({
      status,
      exportsPass: expSum.pass,
      exportsFail: expSum.fail,
      exportsMiss: expSum.miss,
      composePass: compSum.pass,
      composeDrift: compSum.drift,
      composeMiss: compSum.miss,
      reportJson: report,
      triggeredBy,
    });

    if (dbReport) {
      console.log(`[nightly] Saved to database: ${dbReport.id}`);
    } else {
      console.warn('[nightly] Warning: Failed to save report to database');
    }
  } catch (err) {
    console.error('[nightly] Error saving to database:', err);
    // Don't fail the script if DB save fails - the file report is still valid
  }

  // Friendly console summary
  const ok = status === 'pass';
  console.log(`[nightly] Overall status: ${status.toUpperCase()} (exports: ${expSum.pass}/${expSum.total} pass, compose: ${compSum.pass}/${compSum.total} pass)`);
  process.exit(ok ? 0 : 1);
}

main();
