// KACHERI BACKEND/src/routes/audit.ts
// Audit log API routes for workspaces

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  getAuditLog,
  countAuditEntries,
  type AuditAction,
  type AuditTargetType,
} from "../store/audit";
import { hasWorkspaceReadAccess, hasWorkspaceAdminAccess } from "../workspace/middleware";

interface AuditQueryParams {
  limit?: string;
  before?: string;
  action?: string;
  targetType?: string;
}

export default async function auditRoutes(app: FastifyInstance) {
  /**
   * GET /workspaces/:id/audit
   * List audit log entries for a workspace.
   * Requires viewer+ role.
   */
  app.get<{
    Params: { id: string };
    Querystring: AuditQueryParams;
  }>("/workspaces/:id/audit", async (req, reply) => {
    const workspaceId = req.params.id;

    // Check workspace access
    if (!req.workspaceRole) {
      // Set workspace context manually for this route
      req.workspaceId = workspaceId;
    }

    if (!hasWorkspaceReadAccess(req)) {
      return reply.code(403).send({ error: "Access denied to this workspace" });
    }

    const limit = Math.min(parseInt(req.query.limit ?? "50", 10) || 50, 200);
    const before = req.query.before ? parseInt(req.query.before, 10) : undefined;
    const action = req.query.action as AuditAction | undefined;
    const targetType = req.query.targetType as AuditTargetType | undefined;

    const entries = await getAuditLog(workspaceId, {
      limit: limit + 1, // Fetch one extra to check hasMore
      before,
      action,
      targetType,
    });

    const hasMore = entries.length > limit;
    if (hasMore) {
      entries.pop(); // Remove the extra entry
    }

    return {
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        actorId: e.actorId,
        targetType: e.targetType,
        targetId: e.targetId,
        details: e.details,
        ts: e.ts,
      })),
      hasMore,
    };
  });

  /**
   * GET /workspaces/:id/audit/export
   * Export audit log as JSON. Requires admin+ role.
   */
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>("/workspaces/:id/audit/export", async (req, reply) => {
    const workspaceId = req.params.id;

    // Set workspace context
    req.workspaceId = workspaceId;

    if (!hasWorkspaceAdminAccess(req)) {
      return reply.code(403).send({ error: "Requires admin role to export audit log" });
    }

    // Get all entries (up to 10000 for export)
    const entries = await getAuditLog(workspaceId, { limit: 10000 });
    const totalCount = await countAuditEntries(workspaceId);

    const format = req.query.format ?? "json";

    if (format === "csv") {
      // CSV export
      const header = "id,action,actorId,targetType,targetId,details,ts\n";
      const rows = entries.map((e) => {
        const details = e.details ? JSON.stringify(e.details).replace(/"/g, '""') : "";
        return `${e.id},${e.action},${e.actorId},${e.targetType ?? ""},${e.targetId ?? ""},"${details}",${e.ts}`;
      }).join("\n");

      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", `attachment; filename="audit-${workspaceId}-${Date.now()}.csv"`)
        .send(header + rows);
    }

    // JSON export (default)
    return reply
      .header("Content-Type", "application/json")
      .header("Content-Disposition", `attachment; filename="audit-${workspaceId}-${Date.now()}.json"`)
      .send({
        workspaceId,
        exportedAt: new Date().toISOString(),
        totalCount,
        entries,
      });
  });

  /**
   * GET /workspaces/:id/audit/stats
   * Get audit statistics for a workspace. Requires viewer+ role.
   */
  app.get<{
    Params: { id: string };
  }>("/workspaces/:id/audit/stats", async (req, reply) => {
    const workspaceId = req.params.id;
    req.workspaceId = workspaceId;

    if (!hasWorkspaceReadAccess(req)) {
      return reply.code(403).send({ error: "Access denied to this workspace" });
    }

    const totalCount = await countAuditEntries(workspaceId);

    // Get recent entries to compute stats
    const recentEntries = await getAuditLog(workspaceId, { limit: 200 });

    // Count by action
    const byAction: Record<string, number> = {};
    for (const entry of recentEntries) {
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
    }

    // Count last 24h
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const last24h = recentEntries.filter((e) => e.ts > oneDayAgo).length;

    return {
      totalCount,
      last24h,
      byAction,
    };
  });
}
