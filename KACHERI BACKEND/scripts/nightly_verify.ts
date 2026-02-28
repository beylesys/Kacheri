// KACHERI BACKEND/scripts/nightly_verify.ts
// Purpose: Orchestrate existing replay/verify scripts into a single JSON report under ./.reports/.
// The repo already includes replay_exports.ts and replay_ai_compose.ts; this script shells them.
// Also saves report to database (Phase 5 - P0.3).
// Slice 3 — Verification failure notifications (Slack + email) via --notify flag.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createReport } from '../src/store/verificationReports';

/* ---------- Notification Config ---------- */

const shouldNotify = process.argv.includes('--notify');

const SLACK_WEBHOOK = process.env.KACHERI_VERIFY_SLACK_WEBHOOK || '';
const EMAIL_TO = process.env.KACHERI_VERIFY_EMAIL_TO || '';

const SMTP_HOST = process.env.KACHERI_SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.KACHERI_SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.KACHERI_SMTP_SECURE === 'true';
const SMTP_USER = process.env.KACHERI_SMTP_USER || '';
const SMTP_PASS = process.env.KACHERI_SMTP_PASS || '';
const SMTP_FROM = process.env.KACHERI_SMTP_FROM || 'noreply@kacheri.local';

const NOTIFICATION_TIMEOUT_MS = 5000;

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

/* ---------- Notification Helpers ---------- */

function buildFailureSummary(
  status: 'pass' | 'fail' | 'partial',
  expSum: ExportsSummary,
  compSum: ComposeSummary
): string {
  const parts: string[] = [];

  if (expSum.fail > 0) parts.push(`Exports: ${expSum.fail} fail`);
  if (expSum.miss > 0) parts.push(`Exports: ${expSum.miss} miss`);
  if (compSum.drift > 0) parts.push(`AI Compose: ${compSum.drift} drift`);
  if (compSum.miss > 0) parts.push(`AI Compose: ${compSum.miss} miss`);

  if (parts.length === 0) {
    return status === 'fail' ? 'Verification script error (non-zero exit code).' : 'Unknown issue.';
  }

  return parts.join('. ') + '.';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function notifySlack(
  status: 'fail' | 'partial',
  failureSummary: string,
  reportPath: string
): Promise<void> {
  if (!SLACK_WEBHOOK) {
    console.log('[nightly] Slack webhook not configured, skipping.');
    return;
  }

  const statusEmoji = status === 'fail' ? ':x:' : ':warning:';
  const statusLabel = status === 'fail' ? 'FAIL' : 'PARTIAL';

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${statusEmoji} Nightly Verification ${statusLabel}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: failureSummary,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Report: \`${path.basename(reportPath)}\` | ${new Date().toISOString()}`,
        },
      ],
    },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);

  try {
    const response = await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Slack webhook returned ${response.status}: ${text}`);
    }

    console.log('[nightly] Slack notification sent.');
  } finally {
    clearTimeout(timeoutId);
  }
}

let smtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: NOTIFICATION_TIMEOUT_MS * 2,
      greetingTimeout: NOTIFICATION_TIMEOUT_MS * 2,
      socketTimeout: NOTIFICATION_TIMEOUT_MS * 2,
    });
  }
  return smtpTransport;
}

async function notifyEmail(
  status: 'fail' | 'partial',
  failureSummary: string,
  reportPath: string
): Promise<void> {
  if (!EMAIL_TO) {
    console.log('[nightly] Email recipients not configured, skipping.');
    return;
  }
  if (!SMTP_HOST) {
    console.log('[nightly] SMTP host not configured, skipping email.');
    return;
  }

  const statusLabel = status.toUpperCase();
  const subject = `[Kacheri] Nightly Verification ${statusLabel}`;
  const safeReport = escapeHtml(path.basename(reportPath));
  const safeSummary = escapeHtml(failureSummary);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:#1e293b;padding:16px 24px;">
            <span style="color:#ffffff;font-size:16px;font-weight:600;letter-spacing:0.5px;">Kacheri</span>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 8px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">NIGHTLY VERIFICATION</p>
            <h2 style="margin:0 0 16px;font-size:18px;color:${status === 'fail' ? '#dc2626' : '#d97706'};font-weight:600;">Verification ${statusLabel}</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">${safeSummary}</p>
            <p style="margin:0;font-size:13px;color:#6b7280;">Report file: <code>${safeReport}</code></p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              This is an automated notification from Kacheri nightly verification.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const transport = getSmtpTransport();
  const recipients = EMAIL_TO.split(',').map(e => e.trim()).filter(Boolean);

  await transport.sendMail({
    from: SMTP_FROM,
    to: recipients.join(', '),
    subject,
    html,
  });

  console.log(`[nightly] Email notification sent to ${recipients.length} recipient(s).`);
}

async function dispatchNotifications(
  status: 'pass' | 'fail' | 'partial',
  expSum: ExportsSummary,
  compSum: ComposeSummary,
  reportPath: string
): Promise<void> {
  if (!shouldNotify) return;
  if (status === 'pass') return;

  const failureSummary = buildFailureSummary(status, expSum, compSum);
  console.log(`[nightly] Dispatching failure notifications (status=${status})...`);

  // Slack
  try {
    await notifySlack(status, failureSummary, reportPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[nightly] Slack notification failed: ${msg}`);
  }

  // Email
  try {
    await notifyEmail(status, failureSummary, reportPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[nightly] Email notification failed: ${msg}`);
  }
}

async function main() {
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

  // Dispatch failure notifications (Slice 3 — Phase 5 P0.2)
  await dispatchNotifications(status, expSum, compSum, outPath);

  // Friendly console summary
  const ok = status === 'pass';
  console.log(`[nightly] Overall status: ${status.toUpperCase()} (exports: ${expSum.pass}/${expSum.total} pass, compose: ${compSum.pass}/${compSum.total} pass)`);
  process.exit(ok ? 0 : 1);
}

main();
