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
  | "suggestion:reject_all";

export type AuditTargetType = "user" | "doc" | "folder" | "file" | "workspace" | "comment" | "version" | "suggestion";

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

const insertStmt = db.prepare(`
  INSERT INTO audit_log (workspace_id, actor_id, action, target_type, target_id, details, ts)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const selectStmt = db.prepare(`
  SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
  FROM audit_log
  WHERE workspace_id = ?
  ORDER BY ts DESC
  LIMIT ?
`);

const selectBeforeStmt = db.prepare(`
  SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
  FROM audit_log
  WHERE workspace_id = ? AND ts < ?
  ORDER BY ts DESC
  LIMIT ?
`);

const selectWithActionStmt = db.prepare(`
  SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
  FROM audit_log
  WHERE workspace_id = ? AND action = ?
  ORDER BY ts DESC
  LIMIT ?
`);

const selectWithTargetTypeStmt = db.prepare(`
  SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
  FROM audit_log
  WHERE workspace_id = ? AND target_type = ?
  ORDER BY ts DESC
  LIMIT ?
`);

const selectForTargetStmt = db.prepare(`
  SELECT id, workspace_id, actor_id, action, target_type, target_id, details, ts
  FROM audit_log
  WHERE workspace_id = ? AND target_type = ? AND target_id = ?
  ORDER BY ts DESC
  LIMIT ?
`);

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
export function logAuditEvent(params: LogAuditEventParams): number | null {
  const {
    workspaceId,
    actorId,
    action,
    targetType,
    targetId,
    details,
  } = params;

  try {
    const result = insertStmt.run(
      workspaceId,
      actorId,
      action,
      targetType ?? null,
      targetId ?? null,
      details ? JSON.stringify(details) : null,
      Date.now()
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
export function getAuditLog(
  workspaceId: string,
  options: GetAuditLogOptions = {}
): AuditEntry[] {
  const limit = Math.min(options.limit ?? 50, 200);

  try {
    let rows: any[];

    if (options.action) {
      rows = selectWithActionStmt.all(workspaceId, options.action, limit);
    } else if (options.targetType) {
      rows = selectWithTargetTypeStmt.all(workspaceId, options.targetType, limit);
    } else if (options.before) {
      rows = selectBeforeStmt.all(workspaceId, options.before, limit);
    } else {
      rows = selectStmt.all(workspaceId, limit);
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
export function getAuditLogForTarget(
  workspaceId: string,
  targetType: AuditTargetType,
  targetId: string,
  limit: number = 50
): AuditEntry[] {
  try {
    const rows = selectForTargetStmt.all(
      workspaceId,
      targetType,
      targetId,
      Math.min(limit, 200)
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
export function countAuditEntries(workspaceId: string): number {
  try {
    const result = db
      .prepare("SELECT COUNT(*) as count FROM audit_log WHERE workspace_id = ?")
      .get(workspaceId) as { count: number };
    return result.count;
  } catch (err) {
    console.error("[audit] Failed to count audit entries:", err);
    return 0;
  }
}
