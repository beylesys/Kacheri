// KACHERI BACKEND/src/routes/clauseInsert.ts
// Clause Library: Clause insertion into documents with usage tracking and provenance
//
// Endpoints:
// - POST /docs/:id/clauses/insert   — Insert a clause into a document (logs usage, creates proof)
// - POST /docs/:id/clauses/suggest  — AI-powered clause suggestion for selected text
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slices B4, B6

import type { FastifyPluginAsync } from "fastify";
import { createHash } from "crypto";
import { ClausesStore } from "../store/clauses";
import { ClauseUsageLogStore, type InsertionMethod } from "../store/clauseUsageLog";
import { getDoc } from "../store/docs";
import { recordProof } from "../provenanceStore";
import { recordProvenance } from "../provenance";
import { newProofPacket, writeProofPacket } from "../utils/proofs";
import { checkDocAccess } from "../workspace/middleware";
import { db } from "../db";
import { findSimilarClauses } from "../ai/clauseMatcher";
import { AI_RATE_LIMITS } from "../middleware/rateLimit";

/* ---------- Types ---------- */

interface InsertBody {
  clauseId: string;
  insertionMethod?: InsertionMethod;
}

interface SuggestBody {
  text: string;
}

/* ---------- Helpers ---------- */

function getUserId(req: { headers: Record<string, unknown> }): string {
  const userId =
    (req.headers["x-user-id"] as string | undefined)?.toString().trim() ||
    (req.headers["x-dev-user"] as string | undefined)?.toString().trim() ||
    "user:local";
  return userId;
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/* ---------- Routes ---------- */

export const clauseInsertRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /docs/:id/clauses/insert
   * Insert a clause into a document.
   * Logs usage, increments usage_count, creates proof packet, records provenance.
   * Editor+ required.
   */
  fastify.post<{ Params: { id: string }; Body: InsertBody }>(
    "/docs/:id/clauses/insert",
    async (req, reply) => {
      const { id: docId } = req.params;
      const body = req.body ?? ({} as InsertBody);
      const { clauseId, insertionMethod: rawMethod } = body;

      // Validate clauseId
      if (!clauseId || typeof clauseId !== "string" || !clauseId.trim()) {
        return reply.code(400).send({
          error: "clause_id_required",
          message: "clauseId is required and must be a non-empty string",
        });
      }

      // Validate insertionMethod if provided
      const validMethods: InsertionMethod[] = ["manual", "ai_suggest", "template"];
      const insertionMethod: InsertionMethod =
        rawMethod && validMethods.includes(rawMethod) ? rawMethod : "manual";

      // Doc-level permission check (editor+ required)
      if (!checkDocAccess(db, req, reply, docId, "editor")) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: "doc_not_found",
          message: `Document ${docId} not found`,
        });
      }

      // User/workspace context
      const userId = getUserId(req);
      const workspaceId = (
        req.headers["x-workspace-id"] as string | undefined
      )
        ?.toString()
        .trim();

      // Get clause
      const clause = await ClausesStore.getById(clauseId.trim());
      if (!clause) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${clauseId} not found`,
        });
      }

      // Verify clause belongs to the workspace (if workspace context is available)
      if (workspaceId && clause.workspaceId !== workspaceId) {
        return reply.code(404).send({
          error: "clause_not_found",
          message: `Clause ${clauseId} not found in this workspace`,
        });
      }

      // Verify clause is not archived
      if (clause.isArchived) {
        return reply.code(400).send({
          error: "clause_archived",
          message: `Clause ${clauseId} is archived and cannot be inserted`,
        });
      }

      try {
        // 1. Log usage in clause_usage_log
        const usageLog = await ClauseUsageLogStore.logUsage({
          clauseId: clause.id,
          clauseVersion: clause.version,
          docId,
          insertedBy: userId,
          insertionMethod,
        });

        // 2. Increment clause usage count
        await ClausesStore.incrementUsage(clause.id);

        // 3. Create proof packet
        const packet = newProofPacket(
          "clause:insert",
          { type: "system" },
          {
            docId,
            clauseId: clause.id,
            clauseTitle: clause.title,
            clauseVersion: clause.version,
            insertionMethod,
            insertedBy: userId,
          },
          {
            contentHtmlHash: sha256Hex(clause.contentHtml),
            contentTextPreview:
              clause.contentText.length > 200
                ? clause.contentText.slice(0, 200) + "..."
                : clause.contentText,
            category: clause.category,
            tags: clause.tags,
          },
          docId
        );

        const proofPath = await writeProofPacket(packet);
        const outputHashHex = packet.hashes?.output ?? "";
        const proofHash = `sha256:${outputHashHex}`;

        // 4. Record proof in DB
        const proofRow = await recordProof({
          doc_id: docId,
          kind: "clause:insert",
          hash: proofHash,
          path: "",
          meta: {
            proofFile: proofPath,
            clauseId: clause.id,
            clauseTitle: clause.title,
            clauseVersion: clause.version,
            insertionMethod,
            usageLogId: usageLog.id,
            ...(workspaceId ? { workspaceId } : {}),
          },
        });

        // 5. Record provenance
        try {
          await recordProvenance({
            docId,
            action: "clause:insert",
            actor: "system",
            actorId: userId,
            workspaceId: workspaceId ?? null,
            details: {
              clauseId: clause.id,
              clauseTitle: clause.title,
              clauseVersion: clause.version,
              insertionMethod,
              usageLogId: usageLog.id,
              proofHash,
              proofId: proofRow?.id ?? null,
            },
          });
        } catch {
          // non-fatal
        }

        // Re-fetch clause to get updated usage count
        const updatedClause = await ClausesStore.getById(clause.id);

        return reply.code(200).send({
          clauseId: clause.id,
          clauseTitle: clause.title,
          version: clause.version,
          contentHtml: clause.contentHtml,
          contentText: clause.contentText,
          docId,
          proofId: proofRow?.id ?? null,
          proofHash,
          usageCount: updatedClause?.usageCount ?? clause.usageCount + 1,
          insertionMethod,
          message: "Clause inserted successfully",
        });
      } catch (err) {
        console.error("[clauseInsert] Insert failed:", err);
        return reply.code(500).send({
          error: "insert_failed",
          message: "Failed to insert clause",
        });
      }
    }
  );

  /**
   * POST /docs/:id/clauses/suggest
   * Find similar clauses for a text selection.
   * Uses AI-powered similarity detection engine (keyword pre-filter + AI scoring).
   * Rate limited (compose). Editor+ required.
   */
  fastify.post<{ Params: { id: string }; Body: SuggestBody }>(
    "/docs/:id/clauses/suggest",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.compose, // AI similarity scoring is expensive like compose
      },
    },
    async (req, reply) => {
      const { id: docId } = req.params;
      const body = req.body ?? ({} as SuggestBody);
      const { text } = body;

      // Validate text
      if (!text || typeof text !== "string" || text.trim().length < 20) {
        return reply.code(400).send({
          error: "text_required",
          message:
            "Selected text is required and must be at least 20 characters",
        });
      }

      // Doc-level permission check (editor+ required)
      if (!checkDocAccess(db, req, reply, docId, "editor")) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: "doc_not_found",
          message: `Document ${docId} not found`,
        });
      }

      // Workspace context (required for clause search)
      const workspaceId = (
        req.headers["x-workspace-id"] as string | undefined
      )
        ?.toString()
        .trim();

      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message:
            "X-Workspace-Id header is required for clause suggestion",
        });
      }

      try {
        const result = await findSimilarClauses(text.trim(), workspaceId);

        return reply.code(200).send({
          suggestions: result.suggestions,
          totalCandidates: result.totalCandidates,
          aiCompared: result.aiCompared,
          provider: result.provider ?? null,
          model: result.model ?? null,
        });
      } catch (err) {
        console.error("[clauseSuggest] Suggestion failed:", err);
        return reply.code(500).send({
          error: "suggest_failed",
          message: "Failed to find similar clauses",
        });
      }
    }
  );
};

export default clauseInsertRoutes;
