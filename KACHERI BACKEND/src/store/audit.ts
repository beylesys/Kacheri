// KACHERI BACKEND/src/store/audit.ts
// Audit log store for tracking workspace activity

import { db } from "../db";

export type AuditAction =
  | "member:add"
  | "member:remove"
  | "role:change"
  | "doc:create"
  | "doc:delete"
  | "doc:restore"
  | "doc:permanent_delete"
  | "doc:permission:grant"
  | "doc:permission:update"
  | "doc:permission:revoke"
  | "doc:workspace_access:update"
  | "folder:create"
  | "folder:delete"
  | "file:restore"
  | "file:permanent_delete"
  | "comment:create"
  | "comment:update"
  | "comment:delete"
  | "comment:resolve"
  | "comment:reopen"
  | "comment:bulk_resolve"
  | "version:create"
  | "version:rename"
  | "version:delete"
  | "version:restore"
  | "suggestion:create"
  | "suggestion:update"
  | "suggestion:delete"
  | "suggestion:accept"
  | "suggestion:reject"
  | "suggestion:accept_all"
  | "suggestion:reject_all"
  | "negotiation:create"
  | "negotiation:update"
  | "negotiation:delete"
  | "negotiation:round_add"
  | "negotiation:round_import"
  | "negotiation:change_accept"
  | "negotiation:change_reject"
  | "negotiation:change_counter"
  | "negotiation:change_update"
  | "negotiation:change_reset"
  | "negotiation:change_accept_all"
  | "negotiation:change_reject_all"
  | "negotiation:analyze"
  | "negotiation:counterproposal"
  | "negotiation:settle"
  | "negotiation:abandon"
  | "doc:link:create"
  | "doc:link:delete"
  | "doc:links:sync"
  | "message:create"
  | "message:update"
  | "message:delete"
  | "notification:read"
  | "notification:read_all"
  | "notification:delete"
  | "attachment:upload"
  | "attachment:delete"
  | "notification:preference:update"
  | "reviewer:assign"
  | "reviewer:unassign"
  | "reviewer:status_change"
  | "canvas:create"
  | "canvas:update"
  | "canvas:delete"
  | "canvas:publish"
  | "canvas:unpublish"
  | "canvas:permission:grant"
  | "canvas:permission:update"
  | "canvas:permission:revoke"
  | "memory:ingest"
  | "pat:create"
  | "pat:revoke"
  | "canvas:version:create"
  | "canvas:version:restore"
  | "canvas:export:create"
  | "template:create"
  | "template:update"
  | "template:delete"
  | "canvas:embed_whitelist:update"
  | "workspace:ai_settings:update"
  | "workspace:ai_settings:delete"
  | "jaal:session_start"
  | "jaal:session_end"
  | "jaal:proof_create"
  | "jaal:guide_action"
  | "jaal:browse";

export type AuditTargetType = "user" | "doc" | "folder" | "file" | "workspace" | "comment" | "version" | "suggestion" | "negotiation" | "negotiation_change" | "negotiation_round" | "doc_link" | "doc_links" | "message" | "notification" | "attachment" | "notification_preference" | "reviewer" | "canvas" | "canvas_permission" | "canvas_version" | "canvas_export" | "canvas_template" | "memory_ingest" | "pat" | "jaal_session" | "jaal_proof";

export interface AuditEntry {
  id: number;
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  targetType: AuditTargetType | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ts: number;
}

export interface LogAuditEventParams {
  workspaceId: string;
  actorId: string;
  action: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  details?: Record<string, unknown>;
}

export interface GetAuditLogOptions {
  limit?: number;
  before?: number;
  action?: AuditAction;
  targetType?: AuditTargetType;
}

function rowToEntry(row: any): AuditEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    action: row.action as AuditAction,
    targetType: row.target_type as AuditTargetType | null,
    targetId: row.target_id,
    details: row.details ? JSON.parse(row.details) : null,
    ts: row.ts,
  };
}

/**
 * Log an audit event. This is fire-and-forget - errors are logged but don't throw.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<number | null> {
  const {
    workspaceId,
    actorId,
    action,
    targetType,
    targetId,
    details,
  } = params;

  try {
    const result = await db.run(
      `INSERT INTO audit_log (workspace_id, actor_id, action, target_type, target_id, details, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        workspaceId,
        actorId,
        action,
        targetType ?? null,
        targetId ?? null,
        details ? JSON.stringify(details) : null,
        Date.now(),
      ]
    );
    return result.lastInsertRowid as number;
  } catch (err) {
    console.error("[audit] Failed to log audit event:", err);
    return null;
  }
}

/**
 * Get audit log entries for a workspace.
 */
export async function getAuditLog(
  workspaceId: string,
  options: GetAuditLogOptions = {}
): Promise<AuditEntry[]> {
  const limit = Math.min(options.limit ?? 50, 200);

  try {
    let rows: any[];

    if (options.action) {
      rows = await db.queryAll(
        `SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
         FROM audit_log
         WHERE workspace_id = ? AND action = ?
         ORDER BY ts DESC
         LIMIT ?`,
        [workspaceId, options.action, limit]
      );
    } else if (options.targetType) {
      rows = await db.queryAll(
        `SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
         FROM audit_log
         WHERE workspace_id = ? AND target_type = ?
         ORDER BY ts DESC
         LIMIT ?`,
        [workspaceId, options.targetType, limit]
      );
    } else if (options.before) {
      rows = await db.queryAll(
        `SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
         FROM audit_log
         WHERE workspace_id = ? AND ts < ?
         ORDER BY ts DESC
         LIMIT ?`,
        [workspaceId, options.before, limit]
      );
    } else {
      rows = await db.queryAll(
        `SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
         FROM audit_log
         WHERE workspace_id = ?
         ORDER BY ts DESC
         LIMIT ?`,
        [workspaceId, limit]
      );
    }

    return rows.map(rowToEntry);
  } catch (err) {
    console.error("[audit] Failed to get audit log:", err);
    return [];
  }
}

/**
 * Get audit log entries for a specific target.
 */
export async function getAuditLogForTarget(
  workspaceId: string,
  targetType: AuditTargetType,
  targetId: string,
  limit: number = 50
): Promise<AuditEntry[]> {
  try {
    const rows = await db.queryAll(
      `SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
       FROM audit_log
       WHERE workspace_id = ? AND target_type = ? AND target_id = ?
       ORDER BY ts DESC
       LIMIT ?`,
      [workspaceId, targetType, targetId, Math.min(limit, 200)]
    );
    return rows.map(rowToEntry);
  } catch (err) {
    console.error("[audit] Failed to get audit log for target:", err);
    return [];
  }
}

/**
 * Count total audit entries for a workspace (for hasMore pagination).
 */
export async function countAuditEntries(workspaceId: string): Promise<number> {
  try {
    const result = await db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM audit_log WHERE workspace_id = ?",
      [workspaceId]
    );
    return result?.count ?? 0;
  } catch (err) {
    console.error("[audit] Failed to count audit entries:", err);
    return 0;
  }
}
