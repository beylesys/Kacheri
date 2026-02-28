// KACHERI BACKEND/src/routes/extractionStandards.ts
// Document Intelligence: Workspace Extraction Standards API routes
//
// Endpoints:
// - GET /workspaces/:workspaceId/extraction-standards - List standards
// - POST /workspaces/:workspaceId/extraction-standards - Create standard
// - PATCH /workspaces/:workspaceId/extraction-standards/:standardId - Update standard
// - DELETE /workspaces/:workspaceId/extraction-standards/:standardId - Delete standard
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 7

import type { FastifyPluginAsync } from "fastify";
import {
  ExtractionStandardsStore,
  type RuleType,
} from "../store/extractionStandards";
import type { DocumentType, AnomalySeverity } from "../store/extractions";
import { hasWorkspaceAdminAccess, requireWorkspaceMatch } from "../workspace/middleware";

/* ---------- Types ---------- */

interface WorkspaceParams {
  workspaceId: string;
}

interface StandardParams extends WorkspaceParams {
  standardId: string;
}

interface ListStandardsQuery {
  documentType?: DocumentType;
  enabled?: string; // "true" or "false"
}

interface CreateStandardBody {
  documentType: DocumentType;
  ruleType: RuleType;
  config: Record<string, unknown>;
  severity?: AnomalySeverity;
  enabled?: boolean;
}

interface UpdateStandardBody {
  documentType?: DocumentType;
  ruleType?: RuleType;
  config?: Record<string, unknown>;
  severity?: AnomalySeverity;
  enabled?: boolean;
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

export const extractionStandardsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /workspaces/:workspaceId/extraction-standards
   * List all extraction standards for a workspace.
   */
  fastify.get<{ Params: WorkspaceParams; Querystring: ListStandardsQuery }>(
    "/workspaces/:workspaceId/extraction-standards",
    async (req, reply) => {
      const { workspaceId } = req.params;
      if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
      const { documentType, enabled } = req.query;

      // Validate documentType if provided
      if (documentType && !ExtractionStandardsStore.validateDocumentType(documentType)) {
        return reply.code(400).send({
          error: "invalid_document_type",
          message: `Invalid document type. Must be one of: contract, invoice, proposal, meeting_notes, report, other`,
        });
      }

      // Parse enabled filter
      const enabledOnly = enabled === "true" ? true : enabled === "false" ? false : undefined;

      const standards = await ExtractionStandardsStore.getByWorkspace(
        workspaceId,
        documentType,
        enabledOnly === true
      );

      // Apply enabled=false filter (show only disabled)
      const filteredStandards = enabledOnly === false
        ? standards.filter((s) => !s.enabled)
        : standards;

      return reply.code(200).send({
        workspaceId,
        standards: filteredStandards,
        total: filteredStandards.length,
      });
    }
  );

  /**
   * POST /workspaces/:workspaceId/extraction-standards
   * Create a new extraction standard. Admin only.
   */
  fastify.post<{ Params: WorkspaceParams; Body: CreateStandardBody }>(
    "/workspaces/:workspaceId/extraction-standards",
    async (req, reply) => {
      const { workspaceId } = req.params;
      if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
      const { documentType, ruleType, config, severity, enabled } = req.body ?? {};

      // Admin-only access control
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "admin_required",
          message: "Only workspace admins can create extraction standards",
        });
      }

      // Validate required fields
      if (!documentType || !ruleType || !config) {
        return reply.code(400).send({
          error: "missing_required_fields",
          message: "documentType, ruleType, and config are required",
        });
      }

      // Validate documentType
      if (!ExtractionStandardsStore.validateDocumentType(documentType)) {
        return reply.code(400).send({
          error: "invalid_document_type",
          message: `Invalid document type. Must be one of: contract, invoice, proposal, meeting_notes, report, other`,
        });
      }

      // Validate ruleType
      if (!ExtractionStandardsStore.validateRuleType(ruleType)) {
        return reply.code(400).send({
          error: "invalid_rule_type",
          message: `Invalid rule type. Must be one of: required_field, value_range, comparison, custom`,
        });
      }

      // Validate severity if provided
      if (severity && !ExtractionStandardsStore.validateSeverity(severity)) {
        return reply.code(400).send({
          error: "invalid_severity",
          message: `Invalid severity. Must be one of: info, warning, error`,
        });
      }

      // Validate config is an object
      if (typeof config !== "object" || config === null || Array.isArray(config)) {
        return reply.code(400).send({
          error: "invalid_config",
          message: "config must be a non-null object",
        });
      }

      // Validate config based on rule type
      const configError = validateRuleConfig(ruleType, config);
      if (configError) {
        return reply.code(400).send({
          error: "invalid_config",
          message: configError,
        });
      }

      const userId = getUserId(req);

      try {
        const standard = await ExtractionStandardsStore.create({
          workspaceId,
          documentType,
          ruleType,
          config,
          severity,
          enabled,
          createdBy: userId,
        });

        return reply.code(201).send({
          standard,
          message: "Extraction standard created successfully",
        });
      } catch (err) {
        console.error("[extractionStandards] Create failed:", err);
        return reply.code(500).send({
          error: "create_failed",
          message: "Failed to create extraction standard",
        });
      }
    }
  );

  /**
   * PATCH /workspaces/:workspaceId/extraction-standards/:standardId
   * Update an existing extraction standard. Admin only.
   */
  fastify.patch<{ Params: StandardParams; Body: UpdateStandardBody }>(
    "/workspaces/:workspaceId/extraction-standards/:standardId",
    async (req, reply) => {
      const { workspaceId, standardId } = req.params;
      if (!requireWorkspaceMatch(req, reply, workspaceId)) return;
      const { documentType, ruleType, config, severity, enabled } = req.body ?? {};

      // Admin-only access control
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "admin_required",
          message: "Only workspace admins can update extraction standards",
        });
      }

      // Get existing standard
      const existing = await ExtractionStandardsStore.getById(standardId);
      if (!existing) {
        return reply.code(404).send({
          error: "standard_not_found",
          message: `Extraction standard ${standardId} not found`,
        });
      }

      // Verify standard belongs to this workspace
      if (existing.workspaceId !== workspaceId) {
        return reply.code(404).send({
          error: "standard_not_found",
          message: `Extraction standard ${standardId} not found in this workspace`,
        });
      }

      // Validate fields if provided
      if (documentType && !ExtractionStandardsStore.validateDocumentType(documentType)) {
        return reply.code(400).send({
          error: "invalid_document_type",
          message: `Invalid document type. Must be one of: contract, invoice, proposal, meeting_notes, report, other`,
        });
      }

      if (ruleType && !ExtractionStandardsStore.validateRuleType(ruleType)) {
        return reply.code(400).send({
          error: "invalid_rule_type",
          message: `Invalid rule type. Must be one of: required_field, value_range, comparison, custom`,
        });
      }

      if (severity && !ExtractionStandardsStore.validateSeverity(severity)) {
        return reply.code(400).send({
          error: "invalid_severity",
          message: `Invalid severity. Must be one of: info, warning, error`,
        });
      }

      if (config !== undefined) {
        if (typeof config !== "object" || config === null || Array.isArray(config)) {
          return reply.code(400).send({
            error: "invalid_config",
            message: "config must be a non-null object",
          });
        }

        // Validate config against rule type (use updated ruleType if provided, else existing)
        const effectiveRuleType = ruleType ?? existing.ruleType;
        const configError = validateRuleConfig(effectiveRuleType, config);
        if (configError) {
          return reply.code(400).send({
            error: "invalid_config",
            message: configError,
          });
        }
      }

      try {
        const updated = await ExtractionStandardsStore.update(standardId, {
          documentType,
          ruleType,
          config,
          severity,
          enabled,
        });

        if (!updated) {
          return reply.code(500).send({
            error: "update_failed",
            message: "Failed to update extraction standard",
          });
        }

        return reply.code(200).send({
          standard: updated,
          message: "Extraction standard updated successfully",
        });
      } catch (err) {
        console.error("[extractionStandards] Update failed:", err);
        return reply.code(500).send({
          error: "update_failed",
          message: "Failed to update extraction standard",
        });
      }
    }
  );

  /**
   * DELETE /workspaces/:workspaceId/extraction-standards/:standardId
   * Delete an extraction standard. Admin only.
   */
  fastify.delete<{ Params: StandardParams }>(
    "/workspaces/:workspaceId/extraction-standards/:standardId",
    async (req, reply) => {
      const { workspaceId, standardId } = req.params;
      if (!requireWorkspaceMatch(req, reply, workspaceId)) return;

      // Admin-only access control
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "admin_required",
          message: "Only workspace admins can delete extraction standards",
        });
      }

      // Get existing standard
      const existing = await ExtractionStandardsStore.getById(standardId);
      if (!existing) {
        return reply.code(404).send({
          error: "standard_not_found",
          message: `Extraction standard ${standardId} not found`,
        });
      }

      // Verify standard belongs to this workspace
      if (existing.workspaceId !== workspaceId) {
        return reply.code(404).send({
          error: "standard_not_found",
          message: `Extraction standard ${standardId} not found in this workspace`,
        });
      }

      try {
        const deleted = await ExtractionStandardsStore.delete(standardId);

        if (!deleted) {
          return reply.code(500).send({
            error: "delete_failed",
            message: "Failed to delete extraction standard",
          });
        }

        return reply.code(200).send({
          standardId,
          message: "Extraction standard deleted successfully",
        });
      } catch (err) {
        console.error("[extractionStandards] Delete failed:", err);
        return reply.code(500).send({
          error: "delete_failed",
          message: "Failed to delete extraction standard",
        });
      }
    }
  );
};

/* ---------- Config Validation ---------- */

/**
 * Validate rule config based on rule type.
 * Returns error message if invalid, null if valid.
 */
function validateRuleConfig(
  ruleType: RuleType,
  config: Record<string, unknown>
): string | null {
  switch (ruleType) {
    case "required_field": {
      if (typeof config.fieldPath !== "string" || !config.fieldPath.trim()) {
        return "required_field rule requires config.fieldPath (string)";
      }
      return null;
    }

    case "value_range": {
      if (typeof config.fieldPath !== "string" || !config.fieldPath.trim()) {
        return "value_range rule requires config.fieldPath (string)";
      }
      const hasMin = "min" in config;
      const hasMax = "max" in config;
      if (!hasMin && !hasMax) {
        return "value_range rule requires at least one of config.min or config.max";
      }
      if (hasMin && typeof config.min !== "number") {
        return "config.min must be a number";
      }
      if (hasMax && typeof config.max !== "number") {
        return "config.max must be a number";
      }
      if (hasMin && hasMax && (config.min as number) > (config.max as number)) {
        return "config.min cannot be greater than config.max";
      }
      return null;
    }

    case "comparison": {
      if (typeof config.field1 !== "string" || !config.field1.trim()) {
        return "comparison rule requires config.field1 (string)";
      }
      if (typeof config.field2 !== "string" || !config.field2.trim()) {
        return "comparison rule requires config.field2 (string)";
      }
      const validOperators = ["lt", "lte", "gt", "gte", "eq"];
      if (!validOperators.includes(config.operator as string)) {
        return `comparison rule requires config.operator to be one of: ${validOperators.join(", ")}`;
      }
      return null;
    }

    case "custom": {
      // Custom rules can have any config for now
      // Future: could validate expression syntax
      return null;
    }

    default:
      return `Unknown rule type: ${ruleType}`;
  }
}

export default extractionStandardsRoutes;
