// KACHERI BACKEND/src/store/complianceChecks.ts
// Compliance Checker: Store for document compliance check results
//
// Tables: compliance_checks
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type CheckStatus = "pending" | "running" | "passed" | "failed" | "error";

export type CheckTrigger = "manual" | "auto_save" | "pre_export" | "negotiation_import";

/** Individual policy result within a compliance check */
export interface PolicyResult {
  policyId: string;
  policyName: string;
  ruleType: string;
  severity: string;
  status: "passed" | "failed" | "error";
  message: string;
  suggestion?: string;
  location?: string;
  details?: Record<string, unknown>;
}

// Domain type (camelCase, for API)
export interface ComplianceCheck {
  id: string;
  docId: string;
  workspaceId: string;
  status: CheckStatus;
  totalPolicies: number;
  passed: number;
  warnings: number;
  violations: number;
  results: PolicyResult[] | null;
  proofId: string | null;
  triggeredBy: CheckTrigger;
  checkedBy: string;
  createdAt: string;    // ISO string
  completedAt: string | null; // ISO string
}

// Row type (snake_case, matches DB)
interface CheckRow {
  id: string;
  doc_id: string;
  workspace_id: string;
  status: string;
  total_policies: number;
  passed: number;
  warnings: number;
  violations: number;
  results_json: string | null;
  proof_id: string | null;
  triggered_by: string;
  checked_by: string;
  created_at: number;
  completed_at: number | null;
}

export interface CreateCheckInput {
  docId: string;
  workspaceId: string;
  triggeredBy: CheckTrigger;
  checkedBy: string;
  totalPolicies?: number;
}

export interface UpdateCheckInput {
  status?: CheckStatus;
  totalPolicies?: number;
  passed?: number;
  warnings?: number;
  violations?: number;
  results?: PolicyResult[];
  proofId?: string;
}

/* ---------- Row to Domain Converters ---------- */

function rowToCheck(row: CheckRow): ComplianceCheck {
  return {
    id: row.id,
    docId: row.doc_id,
    workspaceId: row.workspace_id,
    status: row.status as CheckStatus,
    totalPolicies: row.total_policies,
    passed: row.passed,
    warnings: row.warnings,
    violations: row.violations,
    results: parseJson(row.results_json, null),
    proofId: row.proof_id,
    triggeredBy: row.triggered_by as CheckTrigger,
    checkedBy: row.checked_by,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

/** Safely parse JSON with fallback */
function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ---------- Terminal status helper ---------- */

const TERMINAL_STATUSES: CheckStatus[] = ["passed", "failed", "error"];

function isTerminal(status: CheckStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/* ---------- CRUD Operations ---------- */

/** Create a new compliance check (starts as pending) */
export async function createCheck(input: CreateCheckInput): Promise<ComplianceCheck> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO compliance_checks (
        id, doc_id, workspace_id, status, total_policies,
        passed, warnings, violations, results_json,
        proof_id, triggered_by, checked_by, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.docId,
      input.workspaceId,
      "pending",
      input.totalPolicies ?? 0,
      0, // passed
      0, // warnings
      0, // violations
      null, // results_json
      null, // proof_id
      input.triggeredBy,
      input.checkedBy,
      now,
      null  // completed_at
    ]);

    return (await getCheckById(id))!;
  } catch (err) {
    console.error("[complianceChecks] Failed to create check:", err);
    throw err;
  }
}

/** Get check by ID */
export async function getCheckById(id: string): Promise<ComplianceCheck | null> {
  try {
    const row = await db.queryOne<CheckRow>(
      `SELECT * FROM compliance_checks WHERE id = ?`,
      [id]
    );

    return row ? rowToCheck(row) : null;
  } catch (err) {
    console.error("[complianceChecks] Failed to get check by id:", err);
    return null;
  }
}

/** Get the most recent compliance check for a document */
export async function getLatestCheck(docId: string): Promise<ComplianceCheck | null> {
  try {
    const row = await db.queryOne<CheckRow>(`
      SELECT * FROM compliance_checks
      WHERE doc_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [docId]);

    return row ? rowToCheck(row) : null;
  } catch (err) {
    console.error("[complianceChecks] Failed to get latest check:", err);
    return null;
  }
}

/** Get paginated compliance check history for a document */
export async function getCheckHistory(
  docId: string,
  limit: number = 20,
  offset: number = 0
): Promise<ComplianceCheck[]> {
  try {
    const rows = await db.queryAll<CheckRow>(`
      SELECT * FROM compliance_checks
      WHERE doc_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [docId, limit, offset]);

    return rows.map(rowToCheck);
  } catch (err) {
    console.error("[complianceChecks] Failed to get check history:", err);
    return [];
  }
}

/** Update a compliance check's status and optionally its results */
export async function updateCheckStatus(
  id: string,
  updates: UpdateCheckInput
): Promise<ComplianceCheck | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    params.push(updates.status);

    // Set completed_at when transitioning to a terminal status
    if (isTerminal(updates.status)) {
      sets.push("completed_at = ?");
      params.push(Date.now());
    }
  }

  if (updates.totalPolicies !== undefined) {
    sets.push("total_policies = ?");
    params.push(updates.totalPolicies);
  }

  if (updates.passed !== undefined) {
    sets.push("passed = ?");
    params.push(updates.passed);
  }

  if (updates.warnings !== undefined) {
    sets.push("warnings = ?");
    params.push(updates.warnings);
  }

  if (updates.violations !== undefined) {
    sets.push("violations = ?");
    params.push(updates.violations);
  }

  if (updates.results !== undefined) {
    sets.push("results_json = ?");
    params.push(JSON.stringify(updates.results));
  }

  if (updates.proofId !== undefined) {
    sets.push("proof_id = ?");
    params.push(updates.proofId);
  }

  if (sets.length === 0) {
    return await getCheckById(id);
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE compliance_checks
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return await getCheckById(id);
  } catch (err) {
    console.error("[complianceChecks] Failed to update check status:", err);
    return null;
  }
}

/** Get checks for a workspace (overview/dashboard) */
export async function getChecksByWorkspace(
  workspaceId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ComplianceCheck[]> {
  try {
    const rows = await db.queryAll<CheckRow>(`
      SELECT * FROM compliance_checks
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [workspaceId, limit, offset]);

    return rows.map(rowToCheck);
  } catch (err) {
    console.error("[complianceChecks] Failed to get checks by workspace:", err);
    return [];
  }
}

/** Delete all checks for a document */
export async function deleteChecksByDoc(docId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM compliance_checks WHERE doc_id = ?`,
      [docId]
    );

    return result.changes;
  } catch (err) {
    console.error("[complianceChecks] Failed to delete checks by doc:", err);
    return 0;
  }
}

/** Count checks for a document */
export async function countChecks(docId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM compliance_checks WHERE doc_id = ?`,
      [docId]
    );

    return row?.count ?? 0;
  } catch (err) {
    console.error("[complianceChecks] Failed to count checks:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const ComplianceChecksStore = {
  create: createCheck,
  getById: getCheckById,
  getLatest: getLatestCheck,
  getHistory: getCheckHistory,
  updateStatus: updateCheckStatus,
  getByWorkspace: getChecksByWorkspace,
  deleteByDoc: deleteChecksByDoc,
  count: countChecks,
};
