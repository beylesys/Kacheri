// KACHERI BACKEND/src/jobs/workers/knowledgeIndexWorker.ts
// Cross-Document Intelligence: Background indexing worker
//
// Handles knowledge:index jobs — full or incremental workspace re-index.
// Pipeline: harvest entities → normalize → detect relationships → rebuild FTS5.
// Reports progress via WebSocket broadcasts.
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 11

import { createHash } from "crypto";
import { db } from "../../db";
import { Job, KnowledgeIndexPayload, KnowledgeIndexResult } from "../types";
import { EntityHarvester } from "../../knowledge/entityHarvester";
import { EntityNormalizer } from "../../knowledge/entityNormalizer";
import { RelationshipDetector } from "../../knowledge/relationshipDetector";
import { FtsSync } from "../../knowledge/ftsSync";
import { listDocs } from "../../store/docs";
import { ExtractionsStore } from "../../store/extractions";
import { WorkspaceEntitiesStore } from "../../store/workspaceEntities";
import { EntityMentionsStore } from "../../store/entityMentions";
import { recordProof } from "../../provenanceStore";
import { wsBroadcast } from "../../realtime/globalHub";
import type { HarvestResult } from "../../knowledge/types";

/* ---------- Helpers ---------- */

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Broadcast indexing progress via WebSocket.
 * Uses the existing ai_job event type with kind: knowledge_index.
 */
function broadcastProgress(
  workspaceId: string,
  jobId: string,
  phase: "started" | "progress" | "finished" | "failed",
  meta?: Record<string, unknown>
): void {
  try {
    wsBroadcast(workspaceId, {
      type: "ai_job",
      jobId,
      kind: "knowledge_index",
      phase,
      meta,
    });
  } catch {
    // Non-fatal: WS broadcast failure should not affect indexing
  }
}

/**
 * Get the last indexed timestamp for a workspace.
 * Returns the max(last_seen_at) from workspace_entities, or 0 if no entities exist.
 */
async function getLastIndexedTimestamp(workspaceId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ last_ts: number | null }>(
      `SELECT MAX(last_seen_at) AS last_ts FROM workspace_entities WHERE workspace_id = ?`,
      [workspaceId]
    );

    return row?.last_ts ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Get docs that have been extracted or updated since a given timestamp.
 * Used for incremental indexing mode.
 */
async function getModifiedDocs(
  workspaceId: string,
  sinceTimestamp: number
): Promise<Array<{ docId: string }>> {
  try {
    const rows = await db.queryAll<{ doc_id: string }>(
      `
        SELECT DISTINCT e.doc_id AS doc_id
        FROM extractions e
        INNER JOIN docs d ON e.doc_id = d.id
        WHERE d.workspace_id = ? AND e.updated_at > ?
          AND d.deleted_at IS NULL
        `,
      [workspaceId, sinceTimestamp]
    );

    return rows.map((r) => ({ docId: r.doc_id }));
  } catch {
    return [];
  }
}

/* ---------- Main Worker Handler ---------- */

/**
 * Process a knowledge:index job.
 *
 * Pipeline:
 *   1. Harvest entities from all workspace documents (or modified docs in incremental mode)
 *   2. Normalize entities (AI-assisted deduplication)
 *   3. Detect relationships between entities
 *   4. Rebuild FTS5 entity index
 *   5. Record proof
 *
 * Each stage broadcasts progress via WebSocket.
 * Stage failures are non-fatal — processing continues to the next stage.
 */
export async function knowledgeIndexJob(
  job: Job<KnowledgeIndexPayload>
): Promise<KnowledgeIndexResult> {
  const { workspaceId, mode, forceReindex, userId } = job.payload;
  const startTime = Date.now();
  const jobId = job.id;

  const result: KnowledgeIndexResult = {
    workspaceId,
    mode,
    docsProcessed: 0,
    entitiesCreated: 0,
    entitiesReused: 0,
    mentionsCreated: 0,
    normalizationSuggestions: 0,
    autoMerged: 0,
    relationshipsCreated: 0,
    relationshipsUpdated: 0,
    ftsEntitiesSynced: 0,
    errors: [],
    durationMs: 0,
  };

  // Determine docs to process
  const allDocs = await listDocs(workspaceId);
  let docsToProcess: Array<{ docId: string }>;

  if (mode === "incremental" && !forceReindex) {
    const lastTs = await getLastIndexedTimestamp(workspaceId);
    docsToProcess = lastTs > 0 ? await getModifiedDocs(workspaceId, lastTs) : allDocs.map((d) => ({ docId: d.id }));
  } else {
    docsToProcess = allDocs.map((d) => ({ docId: d.id }));
  }

  const totalDocs = docsToProcess.length;

  // Stage 1: Started
  broadcastProgress(workspaceId, jobId, "started", {
    stage: "started",
    mode,
    totalDocs,
  });

  // Stage 2: Harvest entities
  try {
    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "harvesting",
      progress: 0,
      totalDocs,
      docsProcessed: 0,
    });

    if (mode === "full" || forceReindex) {
      // Full mode: use harvestWorkspace (iterates all docs internally)
      const harvestResult = await EntityHarvester.harvestWorkspace(workspaceId);
      result.docsProcessed = totalDocs;
      result.entitiesCreated = harvestResult.entitiesCreated;
      result.entitiesReused = harvestResult.entitiesReused;
      result.mentionsCreated = harvestResult.mentionsCreated;
      if (harvestResult.errors.length > 0) {
        result.errors.push(...harvestResult.errors);
      }
    } else {
      // Incremental mode: harvest only modified docs
      const aggregated: HarvestResult = {
        docId: "",
        workspaceId,
        entitiesCreated: 0,
        entitiesReused: 0,
        mentionsCreated: 0,
        mentionsSkipped: 0,
        errors: [],
      };

      for (let i = 0; i < docsToProcess.length; i++) {
        const doc = docsToProcess[i];
        const docResult = await EntityHarvester.harvestFromDoc(doc.docId, workspaceId);
        aggregated.entitiesCreated += docResult.entitiesCreated;
        aggregated.entitiesReused += docResult.entitiesReused;
        aggregated.mentionsCreated += docResult.mentionsCreated;
        aggregated.mentionsSkipped += docResult.mentionsSkipped;
        if (docResult.errors.length > 0) {
          aggregated.errors.push(...docResult.errors);
        }

        // Broadcast progress every 5 docs or on last doc
        if ((i + 1) % 5 === 0 || i === docsToProcess.length - 1) {
          broadcastProgress(workspaceId, jobId, "progress", {
            stage: "harvesting",
            progress: Math.round(((i + 1) / totalDocs) * 25),
            totalDocs,
            docsProcessed: i + 1,
          });
        }
      }

      result.docsProcessed = docsToProcess.length;
      result.entitiesCreated = aggregated.entitiesCreated;
      result.entitiesReused = aggregated.entitiesReused;
      result.mentionsCreated = aggregated.mentionsCreated;
      if (aggregated.errors.length > 0) {
        result.errors.push(...aggregated.errors);
      }
    }

    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "harvesting_complete",
      progress: 25,
      entitiesCreated: result.entitiesCreated,
      mentionsCreated: result.mentionsCreated,
    });
  } catch (err) {
    const msg = `Harvesting failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[knowledgeIndexWorker] ${msg}`);
    result.errors.push(msg);
  }

  // Stage 2.5: Stale entity cleanup
  try {
    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "cleanup",
      progress: 27,
    });

    // Recalculate all entity counts (fixes any prior inconsistency)
    await WorkspaceEntitiesStore.recalculateAllCounts(workspaceId);

    // Delete entities with 0 mentions (orphaned after doc deletion)
    const staleDeleted = await EntityMentionsStore.cleanupStaleEntities(workspaceId);
    if (staleDeleted > 0) {
      console.log(
        `[knowledgeIndexWorker] Cleaned up ${staleDeleted} stale entities for workspace ${workspaceId}`
      );
    }

    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "cleanup_complete",
      progress: 28,
      staleEntitiesRemoved: staleDeleted,
    });
  } catch (err) {
    const msg = `Stale cleanup failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[knowledgeIndexWorker] ${msg}`);
    result.errors.push(msg);
  }

  // Stage 3: Normalize entities (AI-assisted deduplication)
  try {
    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "normalizing",
      progress: 30,
    });

    const normResult = await EntityNormalizer.normalizeWorkspaceEntities(workspaceId);
    result.normalizationSuggestions = normResult.suggestionsGenerated;
    result.autoMerged = normResult.autoMerged;
    if (normResult.errors.length > 0) {
      result.errors.push(...normResult.errors);
    }

    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "normalizing_complete",
      progress: 50,
      autoMerged: result.autoMerged,
      suggestions: result.normalizationSuggestions,
    });
  } catch (err) {
    const msg = `Normalization failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[knowledgeIndexWorker] ${msg}`);
    result.errors.push(msg);
  }

  // Stage 4: Detect relationships
  try {
    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "relationships",
      progress: 55,
    });

    const relResult = await RelationshipDetector.detectWorkspaceRelationships(workspaceId);
    result.relationshipsCreated = relResult.relationshipsCreated;
    result.relationshipsUpdated = relResult.relationshipsUpdated;
    if (relResult.errors.length > 0) {
      result.errors.push(...relResult.errors);
    }

    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "relationships_complete",
      progress: 80,
      relationshipsCreated: result.relationshipsCreated,
      relationshipsUpdated: result.relationshipsUpdated,
    });
  } catch (err) {
    const msg = `Relationship detection failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[knowledgeIndexWorker] ${msg}`);
    result.errors.push(msg);
  }

  // Stage 5: Rebuild FTS5 entity index
  try {
    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "fts_rebuild",
      progress: 85,
    });

    const synced = await FtsSync.syncWorkspaceEntities(workspaceId);
    result.ftsEntitiesSynced = synced;

    broadcastProgress(workspaceId, jobId, "progress", {
      stage: "fts_complete",
      progress: 95,
      ftsEntitiesSynced: synced,
    });
  } catch (err) {
    const msg = `FTS5 rebuild failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[knowledgeIndexWorker] ${msg}`);
    result.errors.push(msg);
  }

  // Finalize
  result.durationMs = Date.now() - startTime;

  // Record proof
  try {
    const proofData = JSON.stringify({
      workspaceId,
      jobId,
      mode,
      docsProcessed: result.docsProcessed,
      entitiesCreated: result.entitiesCreated,
      entitiesReused: result.entitiesReused,
      mentionsCreated: result.mentionsCreated,
      autoMerged: result.autoMerged,
      relationshipsCreated: result.relationshipsCreated,
      durationMs: result.durationMs,
    });

    recordProof({
      doc_id: "",
      kind: "knowledge:index",
      hash: `sha256:${sha256Hex(proofData)}`,
      path: "",
      meta: {
        workspaceId,
        jobId,
        mode,
        docsProcessed: result.docsProcessed,
        entitiesCreated: result.entitiesCreated,
        entitiesReused: result.entitiesReused,
        mentionsCreated: result.mentionsCreated,
        autoMerged: result.autoMerged,
        relationshipsCreated: result.relationshipsCreated,
        relationshipsUpdated: result.relationshipsUpdated,
        ftsEntitiesSynced: result.ftsEntitiesSynced,
        errors: result.errors.length,
        durationMs: result.durationMs,
        userId,
      },
    });
  } catch (err) {
    console.error("[knowledgeIndexWorker] Failed to record proof:", err);
  }

  // Broadcast completion
  const hasErrors = result.errors.length > 0;
  broadcastProgress(
    workspaceId,
    jobId,
    hasErrors ? "failed" : "finished",
    {
      stage: hasErrors ? "completed_with_errors" : "completed",
      progress: 100,
      docsProcessed: result.docsProcessed,
      entitiesCreated: result.entitiesCreated,
      autoMerged: result.autoMerged,
      relationshipsCreated: result.relationshipsCreated,
      ftsEntitiesSynced: result.ftsEntitiesSynced,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
    }
  );

  return result;
}

/* ---------- Worker Registration ---------- */

/**
 * Register knowledge index workers with the job queue.
 */
export function registerKnowledgeWorkers(
  registerHandler: (type: string, handler: (job: Job) => Promise<unknown>) => void
): void {
  registerHandler("knowledge:index", knowledgeIndexJob as (job: Job) => Promise<unknown>);
}
