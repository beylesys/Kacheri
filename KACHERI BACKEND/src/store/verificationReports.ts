// KACHERI BACKEND/src/store/verificationReports.ts
// Store for verification report CRUD operations (Phase 5 - P0.3)

import { db } from '../db';
import { nanoid } from 'nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Internal row type (snake_case from SQLite) */
interface ReportRow {
  id: string;
  created_at: number;
  status: 'pass' | 'fail' | 'partial';
  exports_pass: number;
  exports_fail: number;
  exports_miss: number;
  compose_pass: number;
  compose_drift: number;
  compose_miss: number;
  report_json: string;
  triggered_by: string;
}

/** API response type (camelCase with ISO timestamps) */
export interface VerificationReportMeta {
  id: string;
  createdAt: string;
  status: 'pass' | 'fail' | 'partial';
  exportsPASS: number;
  exportsFail: number;
  exportsMiss: number;
  composePass: number;
  composeDrift: number;
  composeMiss: number;
  triggeredBy: string;
}

/** Full report with raw JSON */
export interface VerificationReportFull extends VerificationReportMeta {
  reportJson: unknown;
}

/** Parameters for creating a new report */
export interface CreateReportParams {
  status: 'pass' | 'fail' | 'partial';
  exportsPass?: number;
  exportsFail?: number;
  exportsMiss?: number;
  composePass?: number;
  composeDrift?: number;
  composeMiss?: number;
  reportJson: unknown;
  triggeredBy?: string;
}

/** Options for listing reports */
export interface ListReportsOptions {
  limit?: number;
  before?: string;
  status?: 'pass' | 'fail' | 'partial';
}

// ─────────────────────────────────────────────────────────────────────────────
// Row Conversion Functions
// ─────────────────────────────────────────────────────────────────────────────

function rowToMeta(row: ReportRow): VerificationReportMeta {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    status: row.status,
    exportsPASS: row.exports_pass,
    exportsFail: row.exports_fail,
    exportsMiss: row.exports_miss,
    composePass: row.compose_pass,
    composeDrift: row.compose_drift,
    composeMiss: row.compose_miss,
    triggeredBy: row.triggered_by,
  };
}

function rowToFull(row: ReportRow): VerificationReportFull {
  let reportJson: unknown = null;
  try {
    reportJson = JSON.parse(row.report_json);
  } catch {
    reportJson = row.report_json;
  }
  return {
    ...rowToMeta(row),
    reportJson,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new verification report
 */
export function createReport(params: CreateReportParams): VerificationReportMeta | null {
  const id = `vr_${nanoid(16)}`;
  const now = Date.now();
  const reportJsonStr = typeof params.reportJson === 'string'
    ? params.reportJson
    : JSON.stringify(params.reportJson);

  try {
    db.prepare(`
      INSERT INTO verification_reports (
        id, created_at, status,
        exports_pass, exports_fail, exports_miss,
        compose_pass, compose_drift, compose_miss,
        report_json, triggered_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      now,
      params.status,
      params.exportsPass ?? 0,
      params.exportsFail ?? 0,
      params.exportsMiss ?? 0,
      params.composePass ?? 0,
      params.composeDrift ?? 0,
      params.composeMiss ?? 0,
      reportJsonStr,
      params.triggeredBy ?? 'cron'
    );

    return getReport(id);
  } catch (err) {
    console.error('[verificationReports] Failed to create report:', err);
    return null;
  }
}

/**
 * Get a single report by ID (metadata only)
 */
export function getReport(id: string): VerificationReportMeta | null {
  try {
    const row = db.prepare(`
      SELECT id, created_at, status,
             exports_pass, exports_fail, exports_miss,
             compose_pass, compose_drift, compose_miss,
             triggered_by
      FROM verification_reports
      WHERE id = ?
    `).get(id) as ReportRow | undefined;

    return row ? rowToMeta(row) : null;
  } catch (err) {
    console.error('[verificationReports] Failed to get report:', err);
    return null;
  }
}

/**
 * Get a single report by ID with full JSON
 */
export function getReportFull(id: string): VerificationReportFull | null {
  try {
    const row = db.prepare(`
      SELECT * FROM verification_reports WHERE id = ?
    `).get(id) as ReportRow | undefined;

    return row ? rowToFull(row) : null;
  } catch (err) {
    console.error('[verificationReports] Failed to get full report:', err);
    return null;
  }
}

/**
 * Get the most recent report
 */
export function getLatestReport(): VerificationReportMeta | null {
  try {
    const row = db.prepare(`
      SELECT id, created_at, status,
             exports_pass, exports_fail, exports_miss,
             compose_pass, compose_drift, compose_miss,
             triggered_by
      FROM verification_reports
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as ReportRow | undefined;

    return row ? rowToMeta(row) : null;
  } catch (err) {
    console.error('[verificationReports] Failed to get latest report:', err);
    return null;
  }
}

/**
 * List reports with pagination and optional filtering
 */
export function listReports(
  options: ListReportsOptions = {}
): { reports: VerificationReportMeta[]; hasMore: boolean } {
  const { limit = 20, before, status } = options;
  const effectiveLimit = Math.min(Math.max(1, limit), 100);

  try {
    let query = `
      SELECT id, created_at, status,
             exports_pass, exports_fail, exports_miss,
             compose_pass, compose_drift, compose_miss,
             triggered_by
      FROM verification_reports
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (before) {
      // Cursor-based pagination using ID
      const beforeRow = db.prepare(`SELECT created_at FROM verification_reports WHERE id = ?`).get(before) as { created_at: number } | undefined;
      if (beforeRow) {
        query += ` AND created_at < ?`;
        params.push(beforeRow.created_at);
      }
    }

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(effectiveLimit + 1);

    const rows = db.prepare(query).all(...params) as ReportRow[];
    const hasMore = rows.length > effectiveLimit;
    const resultRows = hasMore ? rows.slice(0, effectiveLimit) : rows;

    return {
      reports: resultRows.map(rowToMeta),
      hasMore,
    };
  } catch (err) {
    console.error('[verificationReports] Failed to list reports:', err);
    return { reports: [], hasMore: false };
  }
}

/**
 * Delete a report by ID
 */
export function deleteReport(id: string): boolean {
  try {
    const info = db.prepare(`DELETE FROM verification_reports WHERE id = ?`).run(id);
    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[verificationReports] Failed to delete report:', err);
    return false;
  }
}

/**
 * Delete reports older than specified days (retention policy)
 * @param days Number of days to retain
 * @returns Number of reports deleted
 */
export function deleteReportsOlderThan(days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const info = db.prepare(`
      DELETE FROM verification_reports WHERE created_at < ?
    `).run(cutoff);

    const deleted = info.changes ?? 0;
    if (deleted > 0) {
      console.log(`[verificationReports] Deleted ${deleted} reports older than ${days} days`);
    }
    return deleted;
  } catch (err) {
    console.error('[verificationReports] Failed to delete old reports:', err);
    return 0;
  }
}

/**
 * Get report count (total and by status)
 */
export function getReportCounts(): {
  total: number;
  pass: number;
  fail: number;
  partial: number;
} {
  try {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM verification_reports
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const counts = { total: 0, pass: 0, fail: 0, partial: 0 };
    for (const row of rows) {
      counts.total += row.count;
      if (row.status === 'pass') counts.pass = row.count;
      else if (row.status === 'fail') counts.fail = row.count;
      else if (row.status === 'partial') counts.partial = row.count;
    }
    return counts;
  } catch (err) {
    console.error('[verificationReports] Failed to get report counts:', err);
    return { total: 0, pass: 0, fail: 0, partial: 0 };
  }
}
