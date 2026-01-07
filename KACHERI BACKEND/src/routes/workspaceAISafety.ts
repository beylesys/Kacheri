// KACHERI BACKEND/src/routes/workspaceAISafety.ts
// Phase 5 - P2.1: Workspace AI Safety Dashboard endpoint
//
// Returns workspace-scoped AI safety metrics including:
// - Summary stats (total docs, AI usage, verification/determinism rates)
// - Health distribution (healthy, stale, unverified, failed)
// - Recent AI activity
// - Top providers used in the workspace

import type { FastifyInstance } from "fastify";
import { db } from "../db";

// Helpers
function safeJson(str: string | null): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export default async function workspaceAISafetyRoutes(app: FastifyInstance) {
  app.get<{
    Params: { id: string };
  }>("/workspaces/:id/ai-safety", async (req, reply) => {
    const workspaceId = req.params.id;

    // Verify workspace exists
    const workspace = db
      .prepare("SELECT id, name FROM workspaces WHERE id = ?")
      .get(workspaceId) as { id: string; name: string } | undefined;

    if (!workspace) {
      return reply.code(404).send({ error: "Workspace not found" });
    }

    // Get summary stats
    const summaryRow = db
      .prepare(
        `
        SELECT
          COUNT(DISTINCT d.id) as totalDocs,
          COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN d.id END) as docsWithAI,
          COUNT(p.id) as totalAIActions
        FROM docs d
        LEFT JOIN proofs p ON d.id = p.doc_id AND p.kind LIKE 'ai:%'
        WHERE d.workspace_id = ?
          AND d.deleted_at IS NULL
        `
      )
      .get(workspaceId) as {
        totalDocs: number;
        docsWithAI: number;
        totalAIActions: number;
      };

    // Calculate verification rate from exports
    const exportRow = db
      .prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE
            WHEN json_extract(p.meta, '$.verificationStatus') = 'pass' THEN 1
            ELSE 0
          END) as verified
        FROM proofs p
        INNER JOIN docs d ON p.doc_id = d.id
        WHERE d.workspace_id = ?
          AND p.kind IN ('pdf', 'docx')
        `
      )
      .get(workspaceId) as { total: number; verified: number };

    const verificationRate =
      exportRow.total > 0
        ? Math.round((exportRow.verified / exportRow.total) * 100)
        : 100;

    // Calculate determinism rate from compose actions
    const composeRow = db
      .prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE
            WHEN json_extract(p.meta, '$.determinismStatus') = 'pass' THEN 1
            WHEN json_extract(p.payload, '$.determinism_status') = 'pass' THEN 1
            ELSE 0
          END) as pass,
          SUM(CASE
            WHEN json_extract(p.meta, '$.determinismStatus') = 'drift' THEN 1
            WHEN json_extract(p.payload, '$.determinism_status') = 'drift' THEN 1
            ELSE 0
          END) as drift
        FROM proofs p
        INNER JOIN docs d ON p.doc_id = d.id
        WHERE d.workspace_id = ?
          AND p.kind LIKE 'ai:compose%'
        `
      )
      .get(workspaceId) as { total: number; pass: number; drift: number };

    const determinismRate =
      composeRow.pass + composeRow.drift > 0
        ? Math.round((composeRow.pass / (composeRow.pass + composeRow.drift)) * 100)
        : 100;

    // Calculate health distribution for docs in this workspace
    const now = Date.now();
    const staleThreshold = now - SEVEN_DAYS_MS;

    const healthRows = db
      .prepare(
        `
        SELECT
          d.id as docId,
          MAX(p.ts) as lastProofTs,
          SUM(CASE WHEN p.kind IN ('pdf', 'docx') THEN 1 ELSE 0 END) as exportCount,
          SUM(CASE
            WHEN p.kind IN ('pdf', 'docx')
              AND json_extract(p.meta, '$.verificationStatus') = 'fail'
            THEN 1 ELSE 0
          END) as exportFails,
          SUM(CASE
            WHEN p.kind LIKE 'ai:compose%'
              AND (json_extract(p.meta, '$.determinismStatus') = 'drift'
                OR json_extract(p.payload, '$.determinism_status') = 'drift')
            THEN 1 ELSE 0
          END) as driftCount
        FROM docs d
        LEFT JOIN proofs p ON d.id = p.doc_id
        WHERE d.workspace_id = ?
          AND d.deleted_at IS NULL
        GROUP BY d.id
        `
      )
      .all(workspaceId) as Array<{
        docId: string;
        lastProofTs: number | null;
        exportCount: number;
        exportFails: number;
        driftCount: number;
      }>;

    let healthy = 0;
    let stale = 0;
    let unverified = 0;
    let failed = 0;

    for (const row of healthRows) {
      // Failed: any export failure or drift
      if (row.exportFails > 0 || row.driftCount > 0) {
        failed++;
        continue;
      }

      // Unverified: no proofs at all
      if (!row.lastProofTs) {
        unverified++;
        continue;
      }

      // Stale: last proof older than 7 days
      if (row.lastProofTs < staleThreshold) {
        stale++;
        continue;
      }

      // Healthy: recent proofs, no failures
      healthy++;
    }

    // Get recent AI activity (last 10 actions)
    const recentRows = db
      .prepare(
        `
        SELECT
          p.id,
          p.doc_id as docId,
          d.title as docTitle,
          p.kind as action,
          p.ts,
          p.meta,
          p.payload
        FROM proofs p
        INNER JOIN docs d ON p.doc_id = d.id
        WHERE d.workspace_id = ?
          AND p.kind LIKE 'ai:%'
        ORDER BY p.ts DESC
        LIMIT 10
        `
      )
      .all(workspaceId) as Array<{
        id: number;
        docId: string;
        docTitle: string | null;
        action: string | null;
        ts: number;
        meta: string | null;
        payload: string | null;
      }>;

    const recentActivity = recentRows.map((r) => {
      const meta = safeJson(r.meta);
      const payload = safeJson(r.payload);

      // Determine status from meta
      let status: "pass" | "fail" | "pending" = "pending";
      const verStatus = meta?.verificationStatus ?? payload?.verificationStatus;
      const deterStatus = meta?.determinismStatus ?? payload?.determinism_status;

      if (verStatus === "pass" || deterStatus === "pass") {
        status = "pass";
      } else if (verStatus === "fail" || deterStatus === "drift") {
        status = "fail";
      }

      return {
        docId: r.docId,
        docTitle: r.docTitle || "Untitled",
        action: (r.action || "unknown").replace(/^ai:/, ""),
        ts: new Date(r.ts).toISOString(),
        status,
      };
    });

    // Get top providers used in this workspace
    const providerRows = db
      .prepare(
        `
        SELECT
          json_extract(p.meta, '$.provider') as provider,
          json_extract(p.meta, '$.model') as model,
          COUNT(*) as callCount
        FROM proofs p
        INNER JOIN docs d ON p.doc_id = d.id
        WHERE d.workspace_id = ?
          AND p.kind LIKE 'ai:%'
          AND json_extract(p.meta, '$.provider') IS NOT NULL
        GROUP BY provider, model
        ORDER BY callCount DESC
        LIMIT 5
        `
      )
      .all(workspaceId) as Array<{
        provider: string | null;
        model: string | null;
        callCount: number;
      }>;

    const topProviders = providerRows.map((r) => ({
      provider: r.provider || "unknown",
      model: r.model || "unknown",
      callCount: r.callCount,
    }));

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      summary: {
        totalDocs: summaryRow.totalDocs,
        docsWithAI: summaryRow.docsWithAI,
        totalAIActions: summaryRow.totalAIActions,
        verificationRate,
        determinismRate,
      },
      health: {
        healthy,
        stale,
        unverified,
        failed,
      },
      recentActivity,
      topProviders,
    };
  });
}
