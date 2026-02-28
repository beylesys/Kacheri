// KACHERI BACKEND/src/routes/proofHealth.ts
// Phase 5 - P1.1: Per-Document Proof Health endpoint
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { db } from "../db";
import { readArtifactBuffer } from "../storage";
import { checkDocAccess } from "../workspace/middleware";
import { createWorkspaceStore } from "../workspace/store";

function sha256HexBuf(b: Buffer) {
  return crypto.createHash("sha256").update(b).digest("hex");
}

function sha256HexUTF8(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

type ExportRow = {
  id: number;
  kind: string | null;
  hash: string | null;
  path: string | null;
  storage_key: string | null;
  ts: number;
};

type ComposeRow = {
  id: number;
  sha256: string | null;
  payload: string | null;
  ts: number;
};

export type ProofHealthStatus = 'healthy' | 'stale' | 'unverified' | 'failed';

export interface ProofHealthResult {
  docId: string;
  status: ProofHealthStatus;
  score: number;
  exports: { total: number; pass: number; fail: number; miss: number };
  compose: { total: number; pass: number; drift: number; miss: number };
  lastVerified: string | null;
  lastActivity: string | null;
}

/**
 * Calculate proof health for a single document.
 * Checks export verification and compose integrity.
 */
export async function calculateProofHealth(docId: string): Promise<ProofHealthResult> {
  // Query exports for this doc (now includes storage_key)
  const exportRows = await db.queryAll<ExportRow>(`
    SELECT id, kind, hash, path, storage_key, ts
    FROM proofs
    WHERE doc_id = ? AND kind IN ('docx', 'pdf')
    ORDER BY ts DESC
    LIMIT 100
  `, [docId]);

  // Query compose proofs for this doc
  const composeRows = await db.queryAll<ComposeRow>(`
    SELECT id, sha256, payload, ts
    FROM proofs
    WHERE doc_id = ? AND (kind = 'ai:compose' OR type = 'ai:compose' OR type = 'ai:action')
    ORDER BY ts DESC
    LIMIT 100
  `, [docId]);

  // Verify exports — storage-first with filesystem fallback
  let exportPass = 0, exportFail = 0, exportMiss = 0;
  let latestExportVerifiedTs: number | null = null;

  for (const r of exportRows) {
    const expected = String(r.hash || "");
    const filePath = String(r.path || "");

    if (!expected) {
      exportMiss++;
      continue;
    }

    try {
      const data = await readArtifactBuffer(r.storage_key, filePath || null);
      if (!data) {
        exportMiss++;
        continue;
      }
      const actual = "sha256:" + sha256HexBuf(data);
      if (actual === expected) {
        exportPass++;
        if (!latestExportVerifiedTs || r.ts > latestExportVerifiedTs) {
          latestExportVerifiedTs = r.ts;
        }
      } else {
        exportFail++;
      }
    } catch {
      exportMiss++;
    }
  }

  // Verify compose integrity (no rerun, just payload hash check)
  let composePass = 0, composeDrift = 0, composeMiss = 0;
  let latestComposeTs: number | null = null;

  for (const r of composeRows) {
    const payloadStr = String(r.payload || "");
    const recordedHash = String(r.sha256 || "");

    if (!payloadStr || !recordedHash) {
      composeMiss++;
      continue;
    }

    const calc = sha256HexUTF8(payloadStr);
    if (recordedHash === calc) {
      composePass++;
      if (!latestComposeTs || r.ts > latestComposeTs) {
        latestComposeTs = r.ts;
      }
    } else {
      composeDrift++;
    }
  }

  // Calculate overall status and score
  const exportTotal = exportRows.length;
  const composeTotal = composeRows.length;
  const totalProofs = exportTotal + composeTotal;

  // Determine latest activity timestamp
  const latestTs = Math.max(latestExportVerifiedTs || 0, latestComposeTs || 0);
  const lastActivity = latestTs ? new Date(latestTs).toISOString() : null;

  // Determine last verified timestamp (successful verification)
  const lastVerifiedTs = latestExportVerifiedTs || latestComposeTs;
  const lastVerified = lastVerifiedTs ? new Date(lastVerifiedTs).toISOString() : null;

  // Calculate status
  let status: ProofHealthStatus;
  let score: number;

  if (exportFail > 0 || composeDrift > 0) {
    // Any failures = failed status
    status = 'failed';
    score = 0;
  } else if (totalProofs === 0) {
    // No proofs at all = unverified
    status = 'unverified';
    score = 25;
  } else if (exportMiss === exportTotal && composeMiss === composeTotal) {
    // All proofs are missing files/hashes = unverified
    status = 'unverified';
    score = 10;
  } else {
    // Calculate pass rate
    const totalPass = exportPass + composePass;
    const totalChecked = (exportPass + exportFail) + (composePass + composeDrift);
    const passRate = totalChecked > 0 ? totalPass / totalChecked : 0;

    // Check staleness (>7 days since last verification)
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const isStale = lastVerifiedTs ? (now - lastVerifiedTs > sevenDaysMs) : true;

    if (passRate === 1 && !isStale) {
      status = 'healthy';
      score = 100;
    } else if (passRate === 1 && isStale) {
      status = 'stale';
      // Score decays based on how stale
      const daysStale = lastVerifiedTs ? Math.floor((now - lastVerifiedTs) / (24 * 60 * 60 * 1000)) : 30;
      score = Math.max(50, 80 - daysStale);
    } else if (passRate >= 0.5) {
      status = 'stale';
      score = Math.round(passRate * 70);
    } else {
      status = 'unverified';
      score = Math.round(passRate * 49);
    }
  }

  return {
    docId,
    status,
    score,
    exports: { total: exportTotal, pass: exportPass, fail: exportFail, miss: exportMiss },
    compose: { total: composeTotal, pass: composePass, drift: composeDrift, miss: composeMiss },
    lastVerified,
    lastActivity,
  };
}

export default async function proofHealthRoutes(app: FastifyInstance) {
  // GET /docs/:id/proof-health - Get proof health for a single document
  app.get<{
    Params: { id: string };
  }>("/docs/:id/proof-health", async (req, reply) => {
    const { id } = req.params;

    // Check if doc exists
    const doc = await db.queryOne<{ id: string }>("SELECT id FROM docs WHERE id = ?", [id]);
    if (!doc) {
      return reply.status(404).send({ error: "doc_not_found" });
    }

    // Verify caller has access to this document
    if (!checkDocAccess(db, req, reply, id, 'viewer')) return;

    const health = await calculateProofHealth(id);
    return reply.send(health);
  });

  // GET /docs/proof-health/batch - Get proof health for multiple documents
  app.post<{
    Body: { docIds: string[] };
  }>("/docs/proof-health/batch", async (req, reply) => {
    const { docIds } = req.body || { docIds: [] };

    if (!Array.isArray(docIds) || docIds.length === 0) {
      return reply.status(400).send({ error: "docIds_required" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    // Limit batch size
    const limitedIds = docIds.slice(0, 50);
    const results: Record<string, ProofHealthResult> = {};
    const accessDenied: string[] = [];
    const workspaceStore = createWorkspaceStore(db);

    for (const id of limitedIds) {
      // Check doc exists and get its workspace
      const docRow = await db.queryOne<{ id: string; workspace_id: string | null }>("SELECT id, workspace_id FROM docs WHERE id = ?", [id]);
      if (!docRow) continue;

      // If doc is workspace-scoped, verify user has access to that workspace
      if (docRow.workspace_id) {
        const role = workspaceStore.getUserRole(docRow.workspace_id, userId);
        if (!role) {
          accessDenied.push(id);
          continue;
        }
      }

      results[id] = await calculateProofHealth(id);
    }

    return reply.send({ results, accessDenied });
  });
}
