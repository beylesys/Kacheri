// KACHERI BACKEND/src/routes/activityFeed.ts
// Activity feed API route — aggregates recent workspace activity across all products.
// Slice S3 (Phase A)

import type { FastifyInstance } from "fastify";
import { db } from "../db";
import { hasWorkspaceReadAccess } from "../workspace/middleware";

// ── Types ──

interface ActivityItem {
  id: string;
  productSource: string;
  itemType: string;
  itemId: string;
  title: string;
  action: string;
  timestamp: string;
  actorName: string;
}

interface AuditRow {
  id: number;
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  ts: number;
}

interface EntityRow {
  id: string;
  name: string;
  entity_type: string;
  last_seen_at: number;
}

interface MentionRow {
  id: string;
  entity_id: string;
  source_ref: string | null;
  created_at: number;
  entity_name: string | null;
}

interface UserRow {
  id: string;
  display_name: string;
}

interface TitleRow {
  id: string;
  title: string;
}

// ── Helpers ──

/** Map an audit action string to a human-readable verb. */
function actionVerb(action: string): string {
  switch (action) {
    case "doc:create":
      return "created";
    case "doc:delete":
      return "deleted";
    case "doc:restore":
      return "restored";
    case "doc:permanent_delete":
      return "permanently deleted";
    case "canvas:create":
      return "created";
    case "canvas:update":
      return "updated";
    case "canvas:publish":
      return "published";
    case "canvas:unpublish":
      return "unpublished";
    case "canvas:delete":
      return "deleted";
    default:
      // doc:permission:grant → "updated", canvas:version:create → "updated", etc.
      if (action.startsWith("doc:")) return "updated";
      if (action.startsWith("canvas:")) return "updated";
      return "modified";
  }
}

/**
 * Build a SQL `IN (?, ?, ...)` clause for a given list.
 * Returns the placeholder string and the values array.
 * Returns null if the list is empty.
 */
function inClause(values: string[]): { placeholders: string; params: string[] } | null {
  if (values.length === 0) return null;
  const unique = [...new Set(values)];
  return {
    placeholders: unique.map(() => "?").join(", "),
    params: unique,
  };
}

/**
 * Try to extract a title from audit details JSON.
 */
function titleFromDetails(details: string | null): string | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed.title === "string" && parsed.title) return parsed.title;
  } catch {
    // ignore malformed JSON
  }
  return null;
}

// ── Route ──

export default async function activityFeedRoutes(app: FastifyInstance) {
  /**
   * GET /workspaces/:wid/activity
   * Aggregates recent activity across all products for a workspace.
   * Requires viewer+ role.
   */
  app.get<{
    Params: { wid: string };
    Querystring: { limit?: string };
  }>("/workspaces/:wid/activity", async (req, reply) => {
    const workspaceId = req.params.wid;

    // Set workspace context if middleware didn't resolve it
    if (!req.workspaceRole) {
      req.workspaceId = workspaceId;
    }

    if (!hasWorkspaceReadAccess(req)) {
      return reply.code(403).send({ error: "Access denied to this workspace" });
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? "20", 10) || 20, 1),
      100,
    );

    // ── 1. Query all four data sources ──
    // Each source fetches `limit` items. We merge and re-sort below.

    let docRows: AuditRow[] = [];
    let canvasRows: AuditRow[] = [];
    let entityRows: EntityRow[] = [];
    let mentionRows: MentionRow[] = [];

    try {
      docRows = await db.queryAll<AuditRow>(`
        SELECT id, actor_id, action, target_type, target_id, details, ts
        FROM audit_log
        WHERE workspace_id = ? AND action LIKE 'doc:%'
        ORDER BY ts DESC
        LIMIT ?
      `, [workspaceId, limit]);
    } catch (err) {
      console.error("[activityFeed] doc audit query failed:", err);
    }

    try {
      canvasRows = await db.queryAll<AuditRow>(`
        SELECT id, actor_id, action, target_type, target_id, details, ts
        FROM audit_log
        WHERE workspace_id = ? AND action LIKE 'canvas:%'
        ORDER BY ts DESC
        LIMIT ?
      `, [workspaceId, limit]);
    } catch (err) {
      console.error("[activityFeed] canvas audit query failed:", err);
    }

    try {
      entityRows = await db.queryAll<EntityRow>(`
        SELECT id, name, entity_type, last_seen_at
        FROM workspace_entities
        WHERE workspace_id = ?
        ORDER BY last_seen_at DESC
        LIMIT ?
      `, [workspaceId, limit]);
    } catch (err) {
      console.error("[activityFeed] entity query failed:", err);
    }

    try {
      mentionRows = await db.queryAll<MentionRow>(`
        SELECT em.id, em.entity_id, em.source_ref, em.created_at,
               we.name AS entity_name
        FROM entity_mentions em
        LEFT JOIN workspace_entities we ON em.entity_id = we.id
        WHERE em.workspace_id = ? AND em.product_source = 'research'
        ORDER BY em.created_at DESC
        LIMIT ?
      `, [workspaceId, limit]);
    } catch (err) {
      console.error("[activityFeed] mention query failed:", err);
    }

    // ── 2. Batch resolve user display names ──

    const actorIds = [
      ...docRows.map((r) => r.actor_id),
      ...canvasRows.map((r) => r.actor_id),
    ];
    const userMap = new Map<string, string>();

    const actorClause = inClause(actorIds);
    if (actorClause) {
      try {
        const users = await db.queryAll<UserRow>(
          `SELECT id, display_name FROM users WHERE id IN (${actorClause.placeholders})`,
          actorClause.params,
        );
        for (const u of users) {
          userMap.set(u.id, u.display_name);
        }
      } catch (err) {
        console.error("[activityFeed] user lookup failed:", err);
      }
    }

    // ── 3. Batch resolve doc titles ──

    const docTargetIds = docRows
      .map((r) => r.target_id)
      .filter((id): id is string => id != null);
    const docTitleMap = new Map<string, string>();

    const docClause = inClause(docTargetIds);
    if (docClause) {
      try {
        const docs = await db.queryAll<TitleRow>(
          `SELECT id, title FROM docs WHERE id IN (${docClause.placeholders})`,
          docClause.params,
        );
        for (const d of docs) {
          docTitleMap.set(d.id, d.title);
        }
      } catch (err) {
        console.error("[activityFeed] doc title lookup failed:", err);
      }
    }

    // ── 4. Batch resolve canvas titles ──

    const canvasTargetIds = canvasRows
      .map((r) => r.target_id)
      .filter((id): id is string => id != null);
    const canvasTitleMap = new Map<string, string>();

    const canvasClause = inClause(canvasTargetIds);
    if (canvasClause) {
      try {
        const canvases = await db.queryAll<TitleRow>(
          `SELECT id, title FROM canvases WHERE id IN (${canvasClause.placeholders})`,
          canvasClause.params,
        );
        for (const c of canvases) {
          canvasTitleMap.set(c.id, c.title);
        }
      } catch (err) {
        console.error("[activityFeed] canvas title lookup failed:", err);
      }
    }

    // ── 5. Normalize all sources into ActivityItem[] ──

    const items: (ActivityItem & { _ts: number })[] = [];

    for (const row of docRows) {
      const targetId = row.target_id ?? "";
      items.push({
        id: `audit_${row.id}`,
        productSource: "docs",
        itemType: "document",
        itemId: targetId,
        title:
          docTitleMap.get(targetId) ??
          titleFromDetails(row.details) ??
          targetId,
        action: actionVerb(row.action),
        timestamp: new Date(row.ts).toISOString(),
        actorName: userMap.get(row.actor_id) ?? row.actor_id,
        _ts: row.ts,
      });
    }

    for (const row of canvasRows) {
      const targetId = row.target_id ?? "";
      items.push({
        id: `audit_${row.id}`,
        productSource: "design-studio",
        itemType: "canvas",
        itemId: targetId,
        title:
          canvasTitleMap.get(targetId) ??
          titleFromDetails(row.details) ??
          targetId,
        action: actionVerb(row.action),
        timestamp: new Date(row.ts).toISOString(),
        actorName: userMap.get(row.actor_id) ?? row.actor_id,
        _ts: row.ts,
      });
    }

    for (const row of entityRows) {
      items.push({
        id: `entity_${row.id}`,
        productSource: "docs",
        itemType: "entity",
        itemId: row.id,
        title: row.name,
        action: "discovered",
        timestamp: new Date(row.last_seen_at).toISOString(),
        actorName: "System",
        _ts: row.last_seen_at,
      });
    }

    for (const row of mentionRows) {
      items.push({
        id: `mention_${row.id}`,
        productSource: "research",
        itemType: "research",
        itemId: row.entity_id,
        title: row.entity_name ?? row.source_ref ?? row.entity_id,
        action: "captured",
        timestamp: new Date(row.created_at).toISOString(),
        actorName: "JAAL Research",
        _ts: row.created_at,
      });
    }

    // ── 6. Sort by timestamp descending and take top N ──

    items.sort((a, b) => b._ts - a._ts);
    const result = items.slice(0, limit);

    // Strip internal _ts field from response
    const response: { items: ActivityItem[] } = {
      items: result.map(({ _ts, ...item }) => item),
    };

    return response;
  });
}
