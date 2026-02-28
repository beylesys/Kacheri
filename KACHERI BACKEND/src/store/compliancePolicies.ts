// KACHERI BACKEND/src/store/compliancePolicies.ts
// Compliance Checker: Store for workspace compliance policies
//
// Tables: compliance_policies
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type PolicyCategory = "general" | "legal" | "financial" | "privacy" | "custom";

export type PolicyRuleType =
  | "text_match"
  | "regex_pattern"
  | "required_section"
  | "forbidden_term"
  | "numeric_constraint"
  | "ai_check";

export type PolicySeverity = "info" | "warning" | "error";

// Domain type (camelCase, for API)
export interface CompliancePolicy {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  category: PolicyCategory;
  ruleType: PolicyRuleType;
  ruleConfig: Record<string, unknown>;
  severity: PolicySeverity;
  documentTypes: string[];
  enabled: boolean;
  autoCheck: boolean;
  createdBy: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface PolicyRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  category: string;
  rule_type: string;
  rule_config_json: string;
  severity: string;
  document_types_json: string;
  enabled: number;
  auto_check: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface CreatePolicyInput {
  workspaceId: string;
  name: string;
  description?: string;
  category?: PolicyCategory;
  ruleType: PolicyRuleType;
  ruleConfig: Record<string, unknown>;
  severity?: PolicySeverity;
  documentTypes?: string[];
  enabled?: boolean;
  autoCheck?: boolean;
  createdBy: string;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string | null;
  category?: PolicyCategory;
  ruleType?: PolicyRuleType;
  ruleConfig?: Record<string, unknown>;
  severity?: PolicySeverity;
  documentTypes?: string[];
  enabled?: boolean;
  autoCheck?: boolean;
}

/* ---------- Row to Domain Converters ---------- */

function rowToPolicy(row: PolicyRow): CompliancePolicy {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    category: row.category as PolicyCategory,
    ruleType: row.rule_type as PolicyRuleType,
    ruleConfig: parseJson(row.rule_config_json, {}),
    severity: row.severity as PolicySeverity,
    documentTypes: parseJson(row.document_types_json, ["all"]),
    enabled: row.enabled === 1,
    autoCheck: row.auto_check === 1,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
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

/* ---------- Validation ---------- */

const VALID_CATEGORIES: PolicyCategory[] = [
  "general", "legal", "financial", "privacy", "custom",
];
const VALID_RULE_TYPES: PolicyRuleType[] = [
  "text_match", "regex_pattern", "required_section",
  "forbidden_term", "numeric_constraint", "ai_check",
];
const VALID_SEVERITIES: PolicySeverity[] = ["info", "warning", "error"];

export function validateCategory(value: string): value is PolicyCategory {
  return VALID_CATEGORIES.includes(value as PolicyCategory);
}

export function validateRuleType(value: string): value is PolicyRuleType {
  return VALID_RULE_TYPES.includes(value as PolicyRuleType);
}

export function validateSeverity(value: string): value is PolicySeverity {
  return VALID_SEVERITIES.includes(value as PolicySeverity);
}

/* ---------- CRUD Operations ---------- */

/** Create a new compliance policy */
export async function createPolicy(input: CreatePolicyInput): Promise<CompliancePolicy> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO compliance_policies (
        id, workspace_id, name, description, category, rule_type,
        rule_config_json, severity, document_types_json,
        enabled, auto_check, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.workspaceId,
      input.name,
      input.description ?? null,
      input.category ?? "general",
      input.ruleType,
      JSON.stringify(input.ruleConfig),
      input.severity ?? "warning",
      JSON.stringify(input.documentTypes ?? ["all"]),
      input.enabled !== false ? 1 : 0,
      input.autoCheck !== false ? 1 : 0,
      input.createdBy,
      now,
      now
    ]);

    return (await getPolicyById(id))!;
  } catch (err) {
    console.error("[compliancePolicies] Failed to create policy:", err);
    throw err;
  }
}

/** Get policy by ID */
export async function getPolicyById(id: string): Promise<CompliancePolicy | null> {
  try {
    const row = await db.queryOne<PolicyRow>(
      `SELECT * FROM compliance_policies WHERE id = ?`,
      [id]
    );

    return row ? rowToPolicy(row) : null;
  } catch (err) {
    console.error("[compliancePolicies] Failed to get policy by id:", err);
    return null;
  }
}

/** Get all policies for a workspace, optionally filtered */
export async function getPoliciesByWorkspace(
  workspaceId: string,
  opts?: { category?: PolicyCategory; enabledOnly?: boolean }
): Promise<CompliancePolicy[]> {
  try {
    let query = `SELECT * FROM compliance_policies WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.category) {
      query += ` AND category = ?`;
      params.push(opts.category);
    }

    if (opts?.enabledOnly) {
      query += ` AND enabled = 1`;
    }

    query += ` ORDER BY created_at DESC`;

    const rows = await db.queryAll<PolicyRow>(query, params);
    return rows.map(rowToPolicy);
  } catch (err) {
    console.error("[compliancePolicies] Failed to get policies:", err);
    return [];
  }
}

/** Get all enabled policies for a workspace (used by compliance engine) */
export async function getEnabledPolicies(workspaceId: string): Promise<CompliancePolicy[]> {
  try {
    const rows = await db.queryAll<PolicyRow>(`
      SELECT * FROM compliance_policies
      WHERE workspace_id = ? AND enabled = 1
      ORDER BY created_at ASC
    `, [workspaceId]);

    return rows.map(rowToPolicy);
  } catch (err) {
    console.error("[compliancePolicies] Failed to get enabled policies:", err);
    return [];
  }
}

/** Get policies by category within a workspace */
export async function getPoliciesByCategory(
  workspaceId: string,
  category: PolicyCategory
): Promise<CompliancePolicy[]> {
  try {
    const rows = await db.queryAll<PolicyRow>(`
      SELECT * FROM compliance_policies
      WHERE workspace_id = ? AND category = ?
      ORDER BY created_at DESC
    `, [workspaceId, category]);

    return rows.map(rowToPolicy);
  } catch (err) {
    console.error("[compliancePolicies] Failed to get policies by category:", err);
    return [];
  }
}

/** Update an existing policy */
export async function updatePolicy(
  id: string,
  updates: UpdatePolicyInput
): Promise<CompliancePolicy | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.name !== undefined) {
    sets.push("name = ?");
    params.push(updates.name);
  }

  if (updates.description !== undefined) {
    sets.push("description = ?");
    params.push(updates.description);
  }

  if (updates.category !== undefined) {
    sets.push("category = ?");
    params.push(updates.category);
  }

  if (updates.ruleType !== undefined) {
    sets.push("rule_type = ?");
    params.push(updates.ruleType);
  }

  if (updates.ruleConfig !== undefined) {
    sets.push("rule_config_json = ?");
    params.push(JSON.stringify(updates.ruleConfig));
  }

  if (updates.severity !== undefined) {
    sets.push("severity = ?");
    params.push(updates.severity);
  }

  if (updates.documentTypes !== undefined) {
    sets.push("document_types_json = ?");
    params.push(JSON.stringify(updates.documentTypes));
  }

  if (updates.enabled !== undefined) {
    sets.push("enabled = ?");
    params.push(updates.enabled ? 1 : 0);
  }

  if (updates.autoCheck !== undefined) {
    sets.push("auto_check = ?");
    params.push(updates.autoCheck ? 1 : 0);
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE compliance_policies
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return await getPolicyById(id);
  } catch (err) {
    console.error("[compliancePolicies] Failed to update policy:", err);
    return null;
  }
}

/** Delete a policy by ID */
export async function deletePolicy(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM compliance_policies WHERE id = ?`,
      [id]
    );

    return result.changes > 0;
  } catch (err) {
    console.error("[compliancePolicies] Failed to delete policy:", err);
    return false;
  }
}

/** Delete all policies for a workspace */
export async function deletePoliciesByWorkspace(workspaceId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM compliance_policies WHERE workspace_id = ?`,
      [workspaceId]
    );

    return result.changes;
  } catch (err) {
    console.error("[compliancePolicies] Failed to delete policies by workspace:", err);
    return 0;
  }
}

/** Count policies for a workspace */
export async function countPolicies(workspaceId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM compliance_policies WHERE workspace_id = ?`,
      [workspaceId]
    );

    return row?.count ?? 0;
  } catch (err) {
    console.error("[compliancePolicies] Failed to count policies:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const CompliancePoliciesStore = {
  create: createPolicy,
  getById: getPolicyById,
  getByWorkspace: getPoliciesByWorkspace,
  getEnabled: getEnabledPolicies,
  getByCategory: getPoliciesByCategory,
  update: updatePolicy,
  delete: deletePolicy,
  deleteByWorkspace: deletePoliciesByWorkspace,
  count: countPolicies,
  // Validators
  validateCategory,
  validateRuleType,
  validateSeverity,
};
