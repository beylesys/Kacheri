// KACHERI BACKEND/src/routes/compliancePolicies.ts
// Compliance Checker: Policy Management API routes
//
// Endpoints:
// - GET    /workspaces/:wid/compliance-policies              — List policies
// - POST   /workspaces/:wid/compliance-policies              — Create policy
// - PATCH  /workspaces/:wid/compliance-policies/:pid         — Update policy
// - DELETE /workspaces/:wid/compliance-policies/:pid         — Delete policy
// - GET    /workspaces/:wid/compliance-policies/templates    — Built-in templates
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A6

import type { FastifyPluginAsync } from "fastify";
import {
  CompliancePoliciesStore,
  type PolicyCategory,
  type PolicyRuleType,
  type PolicySeverity,
} from "../store/compliancePolicies";
import {
  BUILTIN_POLICY_TEMPLATES,
} from "../compliance/templates";
import { hasWorkspaceAdminAccess, requireWorkspaceMatch } from "../workspace/middleware";

/* ---------- Types ---------- */

interface WorkspaceParams {
  wid: string;
}

interface PolicyParams extends WorkspaceParams {
  pid: string;
}

interface ListPoliciesQuery {
  category?: string;
  enabled?: string; // "true" or "false"
}

interface TemplatesQuery {
  category?: string;
}

interface CreatePolicyBody {
  name: string;
  description?: string;
  category?: PolicyCategory;
  ruleType: PolicyRuleType;
  ruleConfig: Record<string, unknown>;
  severity?: PolicySeverity;
  documentTypes?: string[];
  enabled?: boolean;
  autoCheck?: boolean;
}

interface UpdatePolicyBody {
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

/* ---------- Helpers ---------- */

function getUserId(req: { headers: Record<string, unknown> }): string {
  const userId =
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local";
  return userId;
}

/* ---------- Routes ---------- */

export const compliancePoliciesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /workspaces/:wid/compliance-policies/templates
   * Return built-in policy templates, optionally filtered by category.
   * NOTE: Registered BEFORE the parameterized /:pid routes to avoid path conflicts.
   */
  fastify.get<{ Params: WorkspaceParams; Querystring: TemplatesQuery }>(
    "/workspaces/:wid/compliance-policies/templates",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const { category } = req.query;

      // Filter by category if provided
      if (category) {
        if (!CompliancePoliciesStore.validateCategory(category)) {
          return reply.code(400).send({
            error: "invalid_category",
            message:
              "Invalid category. Must be one of: general, legal, financial, privacy, custom",
          });
        }

        const filtered = BUILTIN_POLICY_TEMPLATES.filter(
          (t) => t.category === category
        );

        return reply.code(200).send({
          templates: filtered,
          total: filtered.length,
        });
      }

      return reply.code(200).send({
        templates: BUILTIN_POLICY_TEMPLATES,
        total: BUILTIN_POLICY_TEMPLATES.length,
      });
    }
  );

  /**
   * GET /workspaces/:wid/compliance-policies
   * List all compliance policies for a workspace.
   */
  fastify.get<{ Params: WorkspaceParams; Querystring: ListPoliciesQuery }>(
    "/workspaces/:wid/compliance-policies",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const { category, enabled } = req.query;

      // Validate category if provided
      if (category && !CompliancePoliciesStore.validateCategory(category)) {
        return reply.code(400).send({
          error: "invalid_category",
          message:
            "Invalid category. Must be one of: general, legal, financial, privacy, custom",
        });
      }

      // Parse enabled filter
      const enabledOnly =
        enabled === "true" ? true : enabled === "false" ? false : undefined;

      const policies = await CompliancePoliciesStore.getByWorkspace(wid, {
        category: category as PolicyCategory | undefined,
        enabledOnly: enabledOnly === true,
      });

      // Apply enabled=false filter (show only disabled)
      const filteredPolicies =
        enabledOnly === false
          ? policies.filter((p) => !p.enabled)
          : policies;

      return reply.code(200).send({
        workspaceId: wid,
        policies: filteredPolicies,
        total: filteredPolicies.length,
      });
    }
  );

  /**
   * POST /workspaces/:wid/compliance-policies
   * Create a new compliance policy. Admin only.
   */
  fastify.post<{ Params: WorkspaceParams; Body: CreatePolicyBody }>(
    "/workspaces/:wid/compliance-policies",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const body = req.body ?? ({} as CreatePolicyBody);
      const { name, description, category, ruleType, ruleConfig, severity, documentTypes, enabled, autoCheck } = body;

      // Admin-only access control
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "admin_required",
          message: "Only workspace admins can create compliance policies",
        });
      }

      // Validate required fields
      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "name is required and must be a non-empty string",
        });
      }

      if (!ruleType) {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "ruleType is required",
        });
      }

      if (!ruleConfig) {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "ruleConfig is required",
        });
      }

      // Validate ruleType
      if (!CompliancePoliciesStore.validateRuleType(ruleType)) {
        return reply.code(400).send({
          error: "invalid_rule_type",
          message:
            "Invalid rule type. Must be one of: text_match, regex_pattern, required_section, forbidden_term, numeric_constraint, ai_check",
        });
      }

      // Validate category if provided
      if (category && !CompliancePoliciesStore.validateCategory(category)) {
        return reply.code(400).send({
          error: "invalid_category",
          message:
            "Invalid category. Must be one of: general, legal, financial, privacy, custom",
        });
      }

      // Validate severity if provided
      if (severity && !CompliancePoliciesStore.validateSeverity(severity)) {
        return reply.code(400).send({
          error: "invalid_severity",
          message: "Invalid severity. Must be one of: info, warning, error",
        });
      }

      // Validate ruleConfig is an object
      if (
        typeof ruleConfig !== "object" ||
        ruleConfig === null ||
        Array.isArray(ruleConfig)
      ) {
        return reply.code(400).send({
          error: "invalid_config",
          message: "ruleConfig must be a non-null object",
        });
      }

      // Validate ruleConfig per rule type
      const configError = validateRuleConfig(ruleType, ruleConfig);
      if (configError) {
        return reply.code(400).send({
          error: "invalid_config",
          message: configError,
        });
      }

      const userId = getUserId(req);

      try {
        const policy = await CompliancePoliciesStore.create({
          workspaceId: wid,
          name: name.trim(),
          description,
          category,
          ruleType,
          ruleConfig,
          severity,
          documentTypes,
          enabled,
          autoCheck,
          createdBy: userId,
        });

        return reply.code(201).send({
          policy,
          message: "Compliance policy created successfully",
        });
      } catch (err) {
        console.error("[compliancePolicies] Create failed:", err);
        return reply.code(500).send({
          error: "create_failed",
          message: "Failed to create compliance policy",
        });
      }
    }
  );

  /**
   * PATCH /workspaces/:wid/compliance-policies/:pid
   * Update an existing compliance policy. Admin only.
   */
  fastify.patch<{ Params: PolicyParams; Body: UpdatePolicyBody }>(
    "/workspaces/:wid/compliance-policies/:pid",
    async (req, reply) => {
      const { wid, pid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;
      const body = req.body ?? ({} as UpdatePolicyBody);
      const { name, description, category, ruleType, ruleConfig, severity, documentTypes, enabled, autoCheck } = body;

      // Admin-only access control
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "admin_required",
          message: "Only workspace admins can update compliance policies",
        });
      }

      // Get existing policy
      const existing = await CompliancePoliciesStore.getById(pid);
      if (!existing) {
        return reply.code(404).send({
          error: "policy_not_found",
          message: `Compliance policy ${pid} not found`,
        });
      }

      // Verify policy belongs to this workspace
      if (existing.workspaceId !== wid) {
        return reply.code(404).send({
          error: "policy_not_found",
          message: `Compliance policy ${pid} not found in this workspace`,
        });
      }

      // Validate fields if provided
      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return reply.code(400).send({
          error: "invalid_name",
          message: "name must be a non-empty string",
        });
      }

      if (category && !CompliancePoliciesStore.validateCategory(category)) {
        return reply.code(400).send({
          error: "invalid_category",
          message:
            "Invalid category. Must be one of: general, legal, financial, privacy, custom",
        });
      }

      if (ruleType && !CompliancePoliciesStore.validateRuleType(ruleType)) {
        return reply.code(400).send({
          error: "invalid_rule_type",
          message:
            "Invalid rule type. Must be one of: text_match, regex_pattern, required_section, forbidden_term, numeric_constraint, ai_check",
        });
      }

      if (severity && !CompliancePoliciesStore.validateSeverity(severity)) {
        return reply.code(400).send({
          error: "invalid_severity",
          message: "Invalid severity. Must be one of: info, warning, error",
        });
      }

      if (ruleConfig !== undefined) {
        if (
          typeof ruleConfig !== "object" ||
          ruleConfig === null ||
          Array.isArray(ruleConfig)
        ) {
          return reply.code(400).send({
            error: "invalid_config",
            message: "ruleConfig must be a non-null object",
          });
        }

        // Validate config against rule type (use updated ruleType if provided, else existing)
        const effectiveRuleType = ruleType ?? existing.ruleType;
        const configError = validateRuleConfig(effectiveRuleType, ruleConfig);
        if (configError) {
          return reply.code(400).send({
            error: "invalid_config",
            message: configError,
          });
        }
      }

      try {
        const updated = await CompliancePoliciesStore.update(pid, {
          name: name?.trim(),
          description,
          category,
          ruleType,
          ruleConfig,
          severity,
          documentTypes,
          enabled,
          autoCheck,
        });

        if (!updated) {
          return reply.code(500).send({
            error: "update_failed",
            message: "Failed to update compliance policy",
          });
        }

        return reply.code(200).send({
          policy: updated,
          message: "Compliance policy updated successfully",
        });
      } catch (err) {
        console.error("[compliancePolicies] Update failed:", err);
        return reply.code(500).send({
          error: "update_failed",
          message: "Failed to update compliance policy",
        });
      }
    }
  );

  /**
   * DELETE /workspaces/:wid/compliance-policies/:pid
   * Delete a compliance policy. Admin only.
   */
  fastify.delete<{ Params: PolicyParams }>(
    "/workspaces/:wid/compliance-policies/:pid",
    async (req, reply) => {
      const { wid, pid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      // Admin-only access control
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "admin_required",
          message: "Only workspace admins can delete compliance policies",
        });
      }

      // Get existing policy
      const existing = await CompliancePoliciesStore.getById(pid);
      if (!existing) {
        return reply.code(404).send({
          error: "policy_not_found",
          message: `Compliance policy ${pid} not found`,
        });
      }

      // Verify policy belongs to this workspace
      if (existing.workspaceId !== wid) {
        return reply.code(404).send({
          error: "policy_not_found",
          message: `Compliance policy ${pid} not found in this workspace`,
        });
      }

      try {
        const deleted = await CompliancePoliciesStore.delete(pid);

        if (!deleted) {
          return reply.code(500).send({
            error: "delete_failed",
            message: "Failed to delete compliance policy",
          });
        }

        return reply.code(200).send({
          policyId: pid,
          message: "Compliance policy deleted successfully",
        });
      } catch (err) {
        console.error("[compliancePolicies] Delete failed:", err);
        return reply.code(500).send({
          error: "delete_failed",
          message: "Failed to delete compliance policy",
        });
      }
    }
  );
};

/* ---------- Config Validation ---------- */

/**
 * Validate rule config based on compliance policy rule type.
 * Returns error message if invalid, null if valid.
 */
function validateRuleConfig(
  ruleType: PolicyRuleType,
  config: Record<string, unknown>
): string | null {
  switch (ruleType) {
    case "text_match": {
      if (typeof config.pattern !== "string" || !config.pattern.trim()) {
        return "text_match rule requires config.pattern (non-empty string)";
      }
      const validMatchTypes = ["contains", "exact", "startsWith"];
      if (
        config.matchType !== undefined &&
        !validMatchTypes.includes(config.matchType as string)
      ) {
        return `text_match rule config.matchType must be one of: ${validMatchTypes.join(", ")}`;
      }
      if (
        config.caseSensitive !== undefined &&
        typeof config.caseSensitive !== "boolean"
      ) {
        return "text_match rule config.caseSensitive must be a boolean";
      }
      return null;
    }

    case "regex_pattern": {
      if (typeof config.pattern !== "string" || !config.pattern.trim()) {
        return "regex_pattern rule requires config.pattern (non-empty string)";
      }
      // Validate regex is parseable
      try {
        new RegExp(config.pattern as string, (config.flags as string) || "");
      } catch {
        return "regex_pattern rule config.pattern is not a valid regular expression";
      }
      if (
        config.mustMatch !== undefined &&
        typeof config.mustMatch !== "boolean"
      ) {
        return "regex_pattern rule config.mustMatch must be a boolean";
      }
      return null;
    }

    case "required_section": {
      if (typeof config.heading !== "string" || !config.heading.trim()) {
        return "required_section rule requires config.heading (non-empty string)";
      }
      if (config.minWords !== undefined) {
        if (typeof config.minWords !== "number" || config.minWords < 0) {
          return "required_section rule config.minWords must be a non-negative number";
        }
      }
      return null;
    }

    case "forbidden_term": {
      if (!Array.isArray(config.terms) || config.terms.length === 0) {
        return "forbidden_term rule requires config.terms (non-empty string array)";
      }
      if (!config.terms.every((t: unknown) => typeof t === "string" && (t as string).trim())) {
        return "forbidden_term rule config.terms must contain only non-empty strings";
      }
      if (
        config.caseSensitive !== undefined &&
        typeof config.caseSensitive !== "boolean"
      ) {
        return "forbidden_term rule config.caseSensitive must be a boolean";
      }
      return null;
    }

    case "numeric_constraint": {
      if (typeof config.fieldPath !== "string" || !config.fieldPath.trim()) {
        return "numeric_constraint rule requires config.fieldPath (non-empty string)";
      }
      const validOperators = ["lt", "lte", "gt", "gte", "eq"];
      if (!validOperators.includes(config.operator as string)) {
        return `numeric_constraint rule requires config.operator to be one of: ${validOperators.join(", ")}`;
      }
      if (typeof config.value !== "number") {
        return "numeric_constraint rule requires config.value (number)";
      }
      return null;
    }

    case "ai_check": {
      if (
        typeof config.instruction !== "string" ||
        !config.instruction.trim()
      ) {
        return "ai_check rule requires config.instruction (non-empty string)";
      }
      if (config.failIf !== "yes" && config.failIf !== "no") {
        return 'ai_check rule requires config.failIf to be "yes" or "no"';
      }
      return null;
    }

    default:
      return `Unknown rule type: ${ruleType}`;
  }
}

export default compliancePoliciesRoutes;
