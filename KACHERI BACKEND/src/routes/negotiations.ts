// KACHERI BACKEND/src/routes/negotiations.ts
// Negotiation API: Sessions & Rounds management
//
// Endpoints:
// - POST   /docs/:id/negotiations              — Create negotiation session
// - GET    /docs/:id/negotiations               — List negotiations for a document
// - GET    /negotiations/:nid                   — Get session detail with rounds summary
// - PATCH  /negotiations/:nid                   — Update session (status, title, counterparty)
// - DELETE /negotiations/:nid                   — Delete session (admin only)
// - POST   /negotiations/:nid/rounds            — Create new round (manual)
// - POST   /negotiations/:nid/rounds/import     — Import external doc as round (file upload)
// - GET    /negotiations/:nid/rounds            — List all rounds
// - GET    /negotiations/:nid/rounds/:rid       — Get round detail with snapshot
//
// See: Docs/Roadmap/redline-negotiation-ai-work-scope.md - Slice 6

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "crypto";
import path from "path";
import {
  NegotiationSessionsStore,
  type NegotiationStatus,
  type NegotiationSession,
} from "../store/negotiationSessions";
import {
  NegotiationRoundsStore,
  type NegotiationRound,
  type ProposedBy,
} from "../store/negotiationRounds";
import {
  NegotiationChangesStore,
  type NegotiationChange,
  type ChangeStatus,
  type ChangeCategory,
  type RiskLevel,
} from "../store/negotiationChanges";
import { NegotiationCounterproposalsStore, type CounterproposalMode } from "../store/negotiationCounterproposals";
import { ChangeAnalyzer } from "../negotiation/changeAnalyzer";
import { CounterproposalGenerator } from "../negotiation/counterproposalGenerator";
import { RoundImport } from "../negotiation/roundImport";
import { htmlToPlainText } from "../compliance/engine";
import { getDoc } from "../store/docs";
import { createVersion } from "../store/versions";
import { createSuggestion } from "../store/suggestions";
import { recordProvenance } from "../provenance";
import { logAuditEvent, type AuditAction } from "../store/audit";
import { wsBroadcast } from "../realtime/globalHub";
import {
  checkDocAccess,
  hasWorkspaceAdminAccess,
  getUserId as getAuthUserId,
  requireWorkspaceMatch,
} from "../workspace/middleware";
import { newProofPacket, writeProofPacket } from "../utils/proofs";
import { recordProof } from "../provenanceStore";
import { AI_RATE_LIMITS } from "../middleware/rateLimit";
import { db } from "../db";
// Slice 19: Cross-Feature Integration imports
import { getAutoCheckPolicies } from "../compliance/autoCheck";
import { runComplianceCheck } from "../compliance/engine";
import { ComplianceChecksStore } from "../store/complianceChecks";
import { extractDocument } from "../ai/extractors";
import type { Extraction } from "../store/extractions";
import { EntityHarvester } from "../knowledge/entityHarvester";
import { FtsSync } from "../knowledge/ftsSync";
import { ClausesStore } from "../store/clauses";
import { ClauseUsageLogStore } from "../store/clauseUsageLog";

/* ---------- Types ---------- */

interface CreateSessionBody {
  title: string;
  counterpartyName: string;
  counterpartyLabel?: string;
}

interface UpdateSessionBody {
  title?: string;
  counterpartyName?: string;
  counterpartyLabel?: string | null;
  status?: NegotiationStatus;
}

interface CreateRoundBody {
  html: string;
  text?: string;
  proposedBy: ProposedBy;
  proposerLabel?: string;
  importSource?: string;
  notes?: string;
}

interface UpdateChangeStatusBody {
  status: ChangeStatus;
  /** Optional: link an accepted counterproposal when status is 'countered' (Slice 19) */
  counterproposalId?: string;
}

interface GenerateCounterproposalBody {
  mode: CounterproposalMode;
}

interface ChangesQuerystring {
  roundId?: string;
  status?: string;
  category?: string;
  riskLevel?: string;
  limit?: string;
  offset?: string;
}

/* ---------- Helpers ---------- */

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function getWorkspaceId(req: FastifyRequest): string | undefined {
  return (
    (req.headers["x-workspace-id"] as string | undefined)
      ?.toString()
      .trim() || undefined
  );
}

function getUserId(req: FastifyRequest): string {
  return getAuthUserId(req) || "user:local";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Clamp limit to 1–200, default 50 (matches clauses.ts pattern). */
function capLimit(v?: string): number {
  const n = v ? Number(v) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

/** Parse non-negative integer offset, default 0. */
function parseOffset(v?: string): number {
  const n = v ? Number(v) : 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/**
 * Slice 19: Cross-Feature Integration — Post-import triggers.
 *
 * After a round import succeeds, fire-and-forget:
 * 1. Compliance auto-check on imported HTML (if auto-check policies exist)
 * 2. Extraction + entity harvesting from imported text (enriches knowledge graph)
 *
 * All operations are non-blocking — failures are logged but don't affect import.
 */
async function triggerPostImportIntegrations(opts: {
  html: string;
  text: string;
  docId: string;
  workspaceId: string;
  sessionId: string;
  roundId: string;
  userId: string;
}): Promise<void> {
  // 1. Compliance auto-check
  try {
    const policies = await getAutoCheckPolicies(opts.workspaceId);
    if (policies.length > 0) {
      const check = await ComplianceChecksStore.create({
        docId: opts.docId,
        workspaceId: opts.workspaceId,
        triggeredBy: "negotiation_import",
        checkedBy: opts.userId,
        totalPolicies: policies.length,
      });
      const result = await runComplianceCheck({ html: opts.html, policies });
      await ComplianceChecksStore.updateStatus(check.id, {
        status: result.violations > 0 ? "failed" : "passed",
        passed: result.passed,
        warnings: result.warnings,
        violations: result.violations,
        results: result.results,
      });
    }
  } catch (err) {
    console.warn("[negotiations] Post-import compliance check failed:", err);
  }

  // 2. Extraction + entity harvesting
  // We do NOT store this as the document's formal extraction (that represents
  // the user's own version). We only harvest entities from the counterparty's
  // text to enrich the knowledge graph for richer change analysis context.
  try {
    const extractResult = await extractDocument({ text: opts.text });
    if (extractResult) {
      const tempExtraction: Extraction = {
        id: `neg_${opts.roundId}`,
        docId: opts.docId,
        documentType: extractResult.documentType,
        typeConfidence: extractResult.typeConfidence,
        extraction: extractResult.extraction,
        fieldConfidences: null,
        anomalies: extractResult.anomalies ?? null,
        proofId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: opts.userId,
      };
      EntityHarvester.harvestFromExtraction(tempExtraction, opts.workspaceId);
      await FtsSync.syncDoc(opts.docId, opts.workspaceId, "", opts.text);
    }
  } catch (err) {
    console.warn("[negotiations] Post-import extraction failed:", err);
  }
}

/** Terminal session statuses -- cannot modify */
const TERMINAL_STATUSES: NegotiationStatus[] = ["settled", "abandoned"];

/** Round summary: strip large snapshot fields from round object */
function roundToSummary(
  round: NegotiationRound
): Omit<NegotiationRound, "snapshotHtml" | "snapshotText"> {
  const { snapshotHtml: _h, snapshotText: _t, ...summary } = round;
  return summary;
}

/**
 * Validate session exists, belongs to workspace, and is not terminal.
 * Sends error replies directly. Returns session or null.
 */
async function validateSession(
  nid: string,
  workspaceId: string,
  reply: FastifyReply,
  requireNonTerminal = true
): Promise<NegotiationSession | null> {
  const session = await NegotiationSessionsStore.getById(nid);
  if (!session) {
    reply.code(404).send({
      error: "session_not_found",
      message: `Negotiation session ${nid} not found`,
    });
    return null;
  }
  if (session.workspaceId !== workspaceId) {
    reply.code(403).send({
      error: "forbidden",
      message: "Session belongs to a different workspace",
    });
    return null;
  }
  if (requireNonTerminal && TERMINAL_STATUSES.includes(session.status)) {
    reply.code(409).send({
      error: "session_terminal",
      message: `Cannot modify session in '${session.status}' status`,
    });
    return null;
  }
  return session;
}

/** Detect file type from filename extension. Returns lowercase ext without dot. */
function detectFileType(filename: string): string {
  return (path.extname(filename).slice(1) || "").toLowerCase();
}

/** Simple text-to-HTML: split by double newlines into paragraphs */
function textToHtml(text: string): string {
  const trimmed = (text ?? "").replace(/\r/g, "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.replace(/\n/g, " ").trim())}</p>`)
    .join("\n");
}

/**
 * Validate a change exists and belongs to the given session.
 * Sends error reply directly. Returns change or null.
 */
async function validateChange(
  cid: string,
  nid: string,
  reply: FastifyReply
): Promise<NegotiationChange | null> {
  const change = await NegotiationChangesStore.getById(cid);
  if (!change) {
    reply.code(404).send({
      error: "change_not_found",
      message: `Change ${cid} not found`,
    });
    return null;
  }
  if (change.sessionId !== nid) {
    reply.code(404).send({
      error: "change_not_found",
      message: `Change ${cid} does not belong to session ${nid}`,
    });
    return null;
  }
  return change;
}

/**
 * Recalculate and update session change counts from the changes table.
 * Call this after any change status mutation.
 */
async function refreshSessionCounts(sessionId: string): Promise<NegotiationSession | null> {
  const counts = await NegotiationChangesStore.countByStatus(sessionId);
  const total = counts.pending + counts.accepted + counts.rejected + counts.countered;
  return await NegotiationSessionsStore.updateCounts(sessionId, {
    totalChanges: total,
    pendingChanges: counts.pending,
    acceptedChanges: counts.accepted,
    rejectedChanges: counts.rejected,
  });
}

/* ---------- Lazy-loaded converters (same deps as importDoc.ts) ---------- */

function safeRequire(name: string): any | null {
  try {
    return require(name);
  } catch {
    return null;
  }
}

/* ---------- Routes ---------- */

export const negotiationRoutes: FastifyPluginAsync = async (fastify) => {
  // Register multipart for the import endpoint (if not already registered)
  if (!fastify.hasContentTypeParser("multipart/form-data")) {
    await fastify.register(require("@fastify/multipart"), {
      limits: { fileSize: 80 * 1024 * 1024 },
    });
  }

  // ============================================
  // Document-scoped Session Routes
  // ============================================

  /**
   * POST /docs/:id/negotiations
   * Create a new negotiation session for a document.
   */
  fastify.post<{ Params: { id: string }; Body: CreateSessionBody }>(
    "/docs/:id/negotiations",
    async (req, reply) => {
      const { id: docId } = req.params;
      const body = (req.body ?? {}) as CreateSessionBody;

      // Validate required fields
      if (
        !body.title ||
        typeof body.title !== "string" ||
        body.title.trim().length === 0
      ) {
        return reply.code(400).send({
          error: "title_required",
          message: "Title is required and must be a non-empty string",
        });
      }
      if (
        !body.counterpartyName ||
        typeof body.counterpartyName !== "string" ||
        body.counterpartyName.trim().length === 0
      ) {
        return reply.code(400).send({
          error: "counterparty_name_required",
          message:
            "Counterparty name is required and must be a non-empty string",
        });
      }

      // Doc-level permission check (editor+ required)
      if (!await checkDocAccess(db, req, reply, docId, "editor")) return;

      // Require workspace context
      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: "doc_not_found",
          message: `Document ${docId} not found`,
        });
      }

      const userId = getUserId(req);

      // Create session
      const session = await NegotiationSessionsStore.create({
        docId,
        workspaceId,
        title: body.title.trim(),
        counterpartyName: body.counterpartyName.trim(),
        counterpartyLabel: body.counterpartyLabel?.trim(),
        startedBy: userId,
      });

      // Record provenance
      try {
        recordProvenance({
          docId,
          action: "negotiation:create",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: session.id,
            title: session.title,
            counterpartyName: session.counterpartyName,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:create",
          targetType: "negotiation",
          targetId: session.id,
          details: {
            docId,
            title: session.title,
            counterpartyName: session.counterpartyName,
          },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "session_created",
        sessionId: session.id,
        docId,
        userId,
        meta: {
          title: session.title,
          counterpartyName: session.counterpartyName,
        },
        ts: Date.now(),
      });

      return reply.code(201).send(session);
    }
  );

  /**
   * GET /docs/:id/negotiations
   * List all negotiation sessions for a document.
   */
  fastify.get<{ Params: { id: string } }>(
    "/docs/:id/negotiations",
    async (req, reply) => {
      const { id: docId } = req.params;

      // Doc-level permission check (viewer+ required)
      if (!await checkDocAccess(db, req, reply, docId, "viewer")) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: "doc_not_found",
          message: `Document ${docId} not found`,
        });
      }

      const sessions = await NegotiationSessionsStore.getByDoc(docId);

      return reply.code(200).send({
        docId,
        sessions,
        total: sessions.length,
      });
    }
  );

  // ============================================
  // Session-scoped Routes
  // ============================================

  /**
   * GET /negotiations/:nid
   * Get session detail with rounds summary and change counts.
   */
  fastify.get<{ Params: { nid: string } }>(
    "/negotiations/:nid",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (viewer+)
      if (!await checkDocAccess(db, req, reply, session.docId, "viewer")) return;

      // Fetch rounds summary (omit large snapshot fields)
      const rounds = await NegotiationRoundsStore.getBySession(nid);
      const roundSummaries = rounds.map(roundToSummary);

      // Fetch change status counts
      const changeSummary = await NegotiationChangesStore.countByStatus(nid);

      // Detect position drift: document modified after latest round
      let positionDriftWarning = false;
      if (rounds.length > 0) {
        const doc = await getDoc(session.docId);
        if (doc) {
          const latestRound = rounds.reduce((a, b) =>
            new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime() ? a : b
          );
          const docTime = new Date(doc.updatedAt).getTime();
          const roundTime = new Date(latestRound.createdAt).getTime();
          if (docTime > roundTime) {
            positionDriftWarning = true;
          }
        }
      }

      return reply.code(200).send({
        session,
        rounds: roundSummaries,
        changeSummary,
        positionDriftWarning,
      });
    }
  );

  /**
   * PATCH /negotiations/:nid
   * Update session (title, counterparty, status).
   */
  fastify.patch<{ Params: { nid: string }; Body: UpdateSessionBody }>(
    "/negotiations/:nid",
    async (req, reply) => {
      const { nid } = req.params;
      const body = (req.body ?? {}) as UpdateSessionBody;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      // Allow reading terminal sessions, but block modification later
      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const userId = getUserId(req);

      // Validate status transition if status is being changed
      if (body.status !== undefined) {
        if (!NegotiationSessionsStore.validateStatus(body.status)) {
          return reply.code(400).send({
            error: "invalid_status",
            message: `Invalid status: ${body.status}. Valid: draft, active, awaiting_response, reviewing, settled, abandoned`,
          });
        }

        // Block transitions FROM terminal statuses
        if (TERMINAL_STATUSES.includes(session.status)) {
          return reply.code(409).send({
            error: "session_terminal",
            message: `Cannot change status of ${session.status} session`,
          });
        }

        // Block draft → settled (must have rounds first)
        if (session.status === "draft" && body.status === "settled") {
          return reply.code(409).send({
            error: "cannot_settle_draft",
            message:
              "Cannot settle a draft session with no rounds. Add rounds and resolve changes first.",
          });
        }
      }

      // Validate title if provided
      if (
        body.title !== undefined &&
        (typeof body.title !== "string" || body.title.trim().length === 0)
      ) {
        return reply.code(400).send({
          error: "invalid_title",
          message: "Title must be a non-empty string",
        });
      }

      // Validate counterpartyName if provided
      if (
        body.counterpartyName !== undefined &&
        (typeof body.counterpartyName !== "string" ||
          body.counterpartyName.trim().length === 0)
      ) {
        return reply.code(400).send({
          error: "invalid_counterparty_name",
          message: "Counterparty name must be a non-empty string",
        });
      }

      const updated = await NegotiationSessionsStore.update(nid, {
        title: body.title?.trim(),
        counterpartyName: body.counterpartyName?.trim(),
        counterpartyLabel: body.counterpartyLabel,
        status: body.status,
      });

      if (!updated) {
        return reply.code(500).send({
          error: "update_failed",
          message: "Failed to update negotiation session",
        });
      }

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:update",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            changes: body,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:update",
          targetType: "negotiation",
          targetId: nid,
          details: { changes: body },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "session_updated",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: { status: updated.status },
        ts: Date.now(),
      });

      return reply.code(200).send(updated);
    }
  );

  /**
   * DELETE /negotiations/:nid
   * Delete session (admin only). CASCADE deletes rounds, changes, counterproposals.
   */
  fastify.delete<{ Params: { nid: string } }>(
    "/negotiations/:nid",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await NegotiationSessionsStore.getById(nid);
      if (!session) {
        return reply.code(404).send({
          error: "session_not_found",
          message: `Negotiation session ${nid} not found`,
        });
      }

      if (session.workspaceId !== workspaceId) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Session belongs to a different workspace",
        });
      }

      // Admin-only
      if (!hasWorkspaceAdminAccess(req)) {
        return reply.code(403).send({
          error: "admin_required",
          message: "Requires workspace admin role to delete negotiation sessions",
        });
      }

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const userId = getUserId(req);

      const deleted = await NegotiationSessionsStore.delete(nid);
      if (!deleted) {
        return reply.code(500).send({
          error: "delete_failed",
          message: "Failed to delete negotiation session",
        });
      }

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:delete",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            title: session.title,
            counterpartyName: session.counterpartyName,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:delete",
          targetType: "negotiation",
          targetId: nid,
          details: {
            docId: session.docId,
            title: session.title,
          },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "session_deleted",
        sessionId: nid,
        docId: session.docId,
        userId,
        ts: Date.now(),
      });

      return reply.code(204).send();
    }
  );

  // ============================================
  // Round Routes
  // ============================================

  /**
   * POST /negotiations/:nid/rounds
   * Create a new round with manual HTML content (from editor or pasted text).
   */
  fastify.post<{ Params: { nid: string }; Body: CreateRoundBody }>(
    "/negotiations/:nid/rounds",
    async (req, reply) => {
      const { nid } = req.params;
      const body = (req.body ?? {}) as CreateRoundBody;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      // Validate required fields
      if (
        !body.html ||
        typeof body.html !== "string" ||
        body.html.trim().length === 0
      ) {
        return reply.code(400).send({
          error: "html_required",
          message: "HTML content is required",
        });
      }

      if (
        !body.proposedBy ||
        !NegotiationRoundsStore.validateProposedBy(body.proposedBy)
      ) {
        return reply.code(400).send({
          error: "invalid_proposed_by",
          message:
            'proposedBy is required and must be "internal" or "external"',
        });
      }

      const userId = getUserId(req);

      // Import the round via the pipeline (handles round creation, comparison, changes, counts)
      let result;
      try {
        result = await RoundImport.importRound({
          sessionId: nid,
          docId: session.docId,
          html: body.html,
          text: body.text,
          proposedBy: body.proposedBy,
          proposerLabel: body.proposerLabel?.trim(),
          importSource: body.importSource || "manual",
          notes: body.notes?.trim(),
          createdBy: userId,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Round creation failed";
        return reply.code(500).send({
          error: "round_creation_failed",
          message,
        });
      }

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:round_add",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            roundId: result.round.id,
            roundNumber: result.round.roundNumber,
            proposedBy: body.proposedBy,
            changeCount: result.changes.length,
          },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "round_created",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: {
          roundId: result.round.id,
          roundNumber: result.round.roundNumber,
          changeCount: result.changes.length,
        },
        ts: Date.now(),
      });

      // Slice 19: Fire-and-forget cross-feature integrations
      const roundText = body.text ?? htmlToPlainText(body.html);
      triggerPostImportIntegrations({
        html: body.html,
        text: roundText,
        docId: session.docId,
        workspaceId: workspaceId!,
        sessionId: nid,
        roundId: result.round.id,
        userId,
      }).catch(() => {});

      return reply.code(201).send({
        round: roundToSummary(result.round),
        changeCount: result.changes.length,
        session: result.sessionUpdated,
      });
    }
  );

  /**
   * POST /negotiations/:nid/rounds/import
   * Import an external document (DOCX/PDF) as a new negotiation round.
   * Accepts multipart file upload. Additional metadata via query parameters.
   */
  fastify.post<{
    Params: { nid: string };
    Querystring: { proposerLabel?: string; notes?: string };
  }>("/negotiations/:nid/rounds/import", async (req, reply) => {
    const { nid } = req.params;
    const query = (req.query ?? {}) as {
      proposerLabel?: string;
      notes?: string;
    };

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return reply.code(400).send({
        error: "workspace_required",
        message: "x-workspace-id header is required",
      });
    }

    const session = await validateSession(nid, workspaceId, reply);
    if (!session) return;

    // Doc-level permission check (editor+)
    if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

    // Get uploaded file
    const file = await (req as any).file();
    if (!file) {
      return reply.code(400).send({
        error: "file_required",
        message: 'No file uploaded (field "file")',
      });
    }

    const filename: string = file.filename || "upload.bin";
    const ext = detectFileType(filename);
    const buf: Buffer = await file.toBuffer();
    const bytes = buf.byteLength;

    // File size limit: 50 MB
    const MAX_IMPORT_SIZE = 50 * 1024 * 1024;
    if (bytes > MAX_IMPORT_SIZE) {
      return reply.code(413).send({
        error: "file_too_large",
        message: `File size (${(bytes / 1024 / 1024).toFixed(1)} MB) exceeds the 50 MB limit for round import.`,
      });
    }

    // Convert to HTML based on file type
    let html = "";
    let plainText = "";
    let conversionMeta: Record<string, unknown> = {};

    if (ext === "docx") {
      const Mammoth = safeRequire("mammoth");
      if (!Mammoth) {
        return reply.code(500).send({
          error: "converter_unavailable",
          message:
            "DOCX conversion is not available (mammoth not installed)",
        });
      }
      try {
        const { value, messages } = (await withTimeout(
          Mammoth.convertToHtml({ buffer: buf }),
          30_000,
          "DOCX conversion"
        )) as { value: string; messages: unknown[] };
        html = value || "";
        plainText = htmlToPlainText(html);
        conversionMeta = {
          tool: "mammoth",
          warnings: (messages || []).length,
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "DOCX conversion failed";
        return reply.code(400).send({
          error: "conversion_failed",
          message: `Failed to convert DOCX: ${msg}`,
        });
      }
    } else if (ext === "pdf") {
      const pdfParseMod = safeRequire("pdf-parse");
      const pdfParseFn = pdfParseMod
        ? pdfParseMod.default ?? pdfParseMod
        : null;
      if (!pdfParseFn || typeof pdfParseFn !== "function") {
        return reply.code(500).send({
          error: "converter_unavailable",
          message:
            "PDF conversion is not available (pdf-parse not installed)",
        });
      }
      try {
        const parsed = (await withTimeout(pdfParseFn(buf), 30_000, "PDF conversion")) as { text?: string; numpages?: number };
        plainText = String(parsed?.text || "").trim();
        html = textToHtml(plainText);
        conversionMeta = {
          tool: "pdf-parse",
          pages: parsed?.numpages,
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "PDF conversion failed";
        return reply.code(400).send({
          error: "conversion_failed",
          message: `Failed to convert PDF: ${msg}`,
        });
      }
    } else {
      return reply.code(400).send({
        error: "unsupported_format",
        message: `Unsupported file format: .${ext}. Only DOCX and PDF files are supported for round import.`,
      });
    }

    // Ensure we got meaningful content
    const visibleText = html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!visibleText) {
      return reply.code(400).send({
        error: "no_content",
        message:
          "Could not extract text from the uploaded file. The file may be empty or image-only.",
      });
    }

    const userId = getUserId(req);
    const jobId = `neg_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Broadcast: import started
    wsBroadcast(workspaceId, {
      type: "ai_job",
      jobId,
      docId: session.docId,
      kind: "negotiation_import",
      phase: "started",
      meta: { userId, sessionId: nid, filename },
    });

    // Run the import pipeline
    let result;
    try {
      result = await RoundImport.importRound({
        sessionId: nid,
        docId: session.docId,
        html,
        text: plainText,
        proposedBy: "external",
        proposerLabel: query.proposerLabel?.trim(),
        importSource: `upload:${ext}`,
        notes: query.notes?.trim(),
        createdBy: userId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Round import failed";

      // Broadcast: import failed
      wsBroadcast(workspaceId, {
        type: "ai_job",
        jobId,
        docId: session.docId,
        kind: "negotiation_import",
        phase: "failed",
        meta: { userId, sessionId: nid, error: message },
      });

      return reply.code(500).send({
        error: "round_import_failed",
        message,
      });
    }

    // Broadcast: import finished
    wsBroadcast(workspaceId, {
      type: "ai_job",
      jobId,
      docId: session.docId,
      kind: "negotiation_import",
      phase: "finished",
      meta: {
        userId,
        sessionId: nid,
        roundId: result.round.id,
        changeCount: result.changes.length,
      },
    });

    // Broadcast: round imported
    wsBroadcast(workspaceId, {
      type: "negotiation",
      action: "round_imported",
      sessionId: nid,
      docId: session.docId,
      userId,
      meta: {
        roundId: result.round.id,
        roundNumber: result.round.roundNumber,
        changeCount: result.changes.length,
        filename,
        format: ext,
      },
      ts: Date.now(),
    });

    // Record provenance
    try {
      recordProvenance({
        docId: session.docId,
        action: "negotiation:round_import",
        actor: "human",
        actorId: userId,
        workspaceId,
        details: {
          sessionId: nid,
          roundId: result.round.id,
          roundNumber: result.round.roundNumber,
          filename,
          format: ext,
          bytes,
          changeCount: result.changes.length,
          sourceHash: sha256Hex(buf),
          conversion: conversionMeta,
        },
      });
    } catch {
      // non-fatal
    }

    // Audit log
    try {
      logAuditEvent({
        workspaceId,
        actorId: userId,
        action: "negotiation:round_import",
        targetType: "negotiation",
        targetId: nid,
        details: {
          roundId: result.round.id,
          filename,
          format: ext,
          changeCount: result.changes.length,
        },
      });
    } catch {
      // non-fatal
    }

    // Slice 19: Fire-and-forget cross-feature integrations
    triggerPostImportIntegrations({
      html,
      text: plainText,
      docId: session.docId,
      workspaceId: workspaceId!,
      sessionId: nid,
      roundId: result.round.id,
      userId,
    }).catch(() => {});

    return reply.code(201).send({
      round: roundToSummary(result.round),
      changeCount: result.changes.length,
      session: result.sessionUpdated,
      import: {
        filename,
        format: ext,
        bytes,
      },
    });
  });

  /**
   * GET /negotiations/:nid/rounds
   * List all rounds for a negotiation session (without snapshot HTML/text).
   */
  fastify.get<{ Params: { nid: string } }>(
    "/negotiations/:nid/rounds",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (viewer+)
      if (!await checkDocAccess(db, req, reply, session.docId, "viewer")) return;

      const rounds = await NegotiationRoundsStore.getBySession(nid);

      return reply.code(200).send({
        sessionId: nid,
        rounds: rounds.map(roundToSummary),
        total: rounds.length,
      });
    }
  );

  /**
   * GET /negotiations/:nid/rounds/:rid
   * Get full round detail including snapshot HTML and text.
   */
  fastify.get<{ Params: { nid: string; rid: string } }>(
    "/negotiations/:nid/rounds/:rid",
    async (req, reply) => {
      const { nid, rid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (viewer+)
      if (!await checkDocAccess(db, req, reply, session.docId, "viewer")) return;

      const round = await NegotiationRoundsStore.getById(rid);
      if (!round) {
        return reply.code(404).send({
          error: "round_not_found",
          message: `Round ${rid} not found`,
        });
      }

      // Verify round belongs to this session
      if (round.sessionId !== nid) {
        return reply.code(404).send({
          error: "round_not_found",
          message: `Round ${rid} does not belong to session ${nid}`,
        });
      }

      // Get change summary for this round
      const changes = await NegotiationChangesStore.getByRound(rid);
      const changeSummary = { pending: 0, accepted: 0, rejected: 0, countered: 0 };
      for (const c of changes) {
        if (c.status in changeSummary) {
          changeSummary[c.status as keyof typeof changeSummary]++;
        }
      }

      return reply.code(200).send({
        round,
        changeCount: changes.length,
        changeSummary,
      });
    }
  );

  // ============================================
  // Change Routes (Slice 7)
  // ============================================

  /**
   * GET /negotiations/:nid/changes
   * List all changes for a negotiation session with optional filters.
   */
  fastify.get<{
    Params: { nid: string };
    Querystring: ChangesQuerystring;
  }>("/negotiations/:nid/changes", async (req, reply) => {
    const { nid } = req.params;
    const query = (req.query ?? {}) as ChangesQuerystring;

    const workspaceId = getWorkspaceId(req);
    if (!workspaceId) {
      return reply.code(400).send({
        error: "workspace_required",
        message: "x-workspace-id header is required",
      });
    }

    const session = await validateSession(nid, workspaceId, reply, false);
    if (!session) return;

    // Doc-level permission check (viewer+)
    if (!await checkDocAccess(db, req, reply, session.docId, "viewer")) return;

    // Parse pagination
    const limit = capLimit(query.limit);
    const offset = parseOffset(query.offset);

    // Parse validated filters
    const filterStatus = query.status && NegotiationChangesStore.validateStatus(query.status)
      ? (query.status as ChangeStatus) : undefined;
    const filterCategory = query.category && NegotiationChangesStore.validateCategory(query.category)
      ? (query.category as ChangeCategory) : undefined;
    const filterRiskLevel = query.riskLevel && NegotiationChangesStore.validateRiskLevel(query.riskLevel)
      ? (query.riskLevel as RiskLevel) : undefined;

    let changes: NegotiationChange[];
    let total: number;

    if (query.roundId) {
      // Verify round belongs to session
      const round = await NegotiationRoundsStore.getById(query.roundId);
      if (!round || round.sessionId !== nid) {
        return reply.code(404).send({
          error: "round_not_found",
          message: `Round ${query.roundId} not found in session ${nid}`,
        });
      }

      const filterOpts = { status: filterStatus, category: filterCategory, riskLevel: filterRiskLevel };
      total = await NegotiationChangesStore.countByRound(query.roundId, filterOpts);
      changes = await NegotiationChangesStore.getByRound(query.roundId, {
        ...filterOpts,
        limit,
        offset,
      });
    } else {
      const filterOpts = { status: filterStatus, category: filterCategory, riskLevel: filterRiskLevel };
      total = await NegotiationChangesStore.countBySessionFiltered(nid, filterOpts);
      changes = await NegotiationChangesStore.getBySession(nid, {
        ...filterOpts,
        limit,
        offset,
      });
    }

    return reply.code(200).send({
      sessionId: nid,
      changes,
      total,
      limit,
      offset,
      filters: {
        roundId: query.roundId ?? null,
        status: query.status ?? null,
        category: query.category ?? null,
        riskLevel: query.riskLevel ?? null,
      },
    });
  });

  /**
   * GET /negotiations/:nid/changes/:cid
   * Get a single change with full AI analysis.
   */
  fastify.get<{ Params: { nid: string; cid: string } }>(
    "/negotiations/:nid/changes/:cid",
    async (req, reply) => {
      const { nid, cid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (viewer+)
      if (!await checkDocAccess(db, req, reply, session.docId, "viewer")) return;

      const change = await validateChange(cid, nid, reply);
      if (!change) return;

      return reply.code(200).send({ change });
    }
  );

  /**
   * PATCH /negotiations/:nid/changes/:cid
   * Update change status (accept/reject/counter).
   */
  fastify.patch<{ Params: { nid: string; cid: string }; Body: UpdateChangeStatusBody }>(
    "/negotiations/:nid/changes/:cid",
    async (req, reply) => {
      const { nid, cid } = req.params;
      const body = (req.body ?? {}) as UpdateChangeStatusBody;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const change = await validateChange(cid, nid, reply);
      if (!change) return;

      // Validate status value
      if (!body.status || !NegotiationChangesStore.validateStatus(body.status)) {
        return reply.code(400).send({
          error: "invalid_status",
          message: 'Status is required and must be one of: pending, accepted, rejected, countered',
        });
      }

      const userId = getUserId(req);

      // Update the change status
      const updated = await NegotiationChangesStore.updateStatus(cid, body.status, userId);
      if (!updated) {
        return reply.code(500).send({
          error: "update_failed",
          message: "Failed to update change status",
        });
      }

      // Recalculate session counts
      const updatedSession = await refreshSessionCounts(nid);

      // Slice 19: Accept counterproposal + track clause usage
      if (body.status === "countered" && body.counterproposalId) {
        try {
          const cp = await NegotiationCounterproposalsStore.accept(body.counterproposalId);
          if (cp?.clauseId) {
            await ClausesStore.incrementUsage(cp.clauseId);
            const clause = await ClausesStore.getById(cp.clauseId);
            if (clause) {
              await ClauseUsageLogStore.logUsage({
                clauseId: cp.clauseId,
                clauseVersion: clause.version,
                docId: session.docId,
                insertedBy: userId,
                insertionMethod: "ai_suggest",
              });
            }
          }
        } catch (err) {
          console.warn("[negotiations] Clause usage tracking failed:", err);
        }
      }

      // Map status to provenance/audit action
      const actionMap: Record<string, AuditAction> = {
        accepted: "negotiation:change_accept",
        rejected: "negotiation:change_reject",
        countered: "negotiation:change_counter",
        pending: "negotiation:change_reset",
      };

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: actionMap[body.status] ?? "negotiation:change_update",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            changeId: cid,
            newStatus: body.status,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: actionMap[body.status] ?? "negotiation:change_update",
          targetType: "negotiation_change",
          targetId: cid,
          details: {
            sessionId: nid,
            changeId: cid,
            newStatus: body.status,
          },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "change_updated",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: {
          changeId: cid,
          newStatus: body.status,
        },
        ts: Date.now(),
      });

      return reply.code(200).send({
        change: updated,
        session: updatedSession,
      });
    }
  );

  /**
   * POST /negotiations/:nid/changes/:cid/analyze
   * Trigger AI analysis for a specific change (deep-dive mode).
   */
  fastify.post<{ Params: { nid: string; cid: string } }>(
    "/negotiations/:nid/changes/:cid/analyze",
    { config: { rateLimit: AI_RATE_LIMITS.compose } },
    async (req, reply) => {
      const { nid, cid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const change = await validateChange(cid, nid, reply);
      if (!change) return;

      const userId = getUserId(req);
      const jobId = `neg_analyze_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Broadcast: analysis started
      wsBroadcast(workspaceId, {
        type: "ai_job",
        jobId,
        docId: session.docId,
        kind: "negotiation_analyze",
        phase: "started",
        meta: { userId, sessionId: nid, changeId: cid },
      });

      let result;
      try {
        result = await ChangeAnalyzer.analyzeSingle(change, {
          workspaceId,
          sessionId: nid,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Analysis failed";

        // Broadcast: analysis failed
        wsBroadcast(workspaceId, {
          type: "ai_job",
          jobId,
          docId: session.docId,
          kind: "negotiation_analyze",
          phase: "failed",
          meta: { userId, sessionId: nid, changeId: cid, error: message },
        });

        return reply.code(500).send({
          error: "analysis_failed",
          message,
        });
      }

      // Broadcast: analysis finished
      wsBroadcast(workspaceId, {
        type: "ai_job",
        jobId,
        docId: session.docId,
        kind: "negotiation_analyze",
        phase: "finished",
        meta: {
          userId,
          sessionId: nid,
          changeId: cid,
          riskLevel: result.analysis.riskLevel,
          fromCache: result.fromCache,
        },
      });

      // Create proof record (skip if from cache — no new AI call was made)
      let proofInfo: { id: string; hash: string } | null = null;
      if (!result.fromCache) {
        try {
          const packet = newProofPacket(
            "negotiation:analyze",
            { type: "ai", provider: result.provider, model: result.model },
            { changeId: cid, sessionId: nid, workspaceId },
            { analysis: result.analysis },
            session.docId
          );

          const proofPath = await writeProofPacket(packet);
          const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

          const proofRow = await recordProof({
            doc_id: session.docId,
            kind: "negotiation:analyze",
            hash: proofHash,
            path: "",
            meta: {
              proofFile: proofPath,
              workspaceId,
              sessionId: nid,
              changeId: cid,
              provider: result.provider,
              model: result.model,
              userId,
            },
          });

          proofInfo = { id: proofRow.id, hash: proofHash };
        } catch {
          // non-fatal — proof recording failure doesn't block the analysis
        }
      }

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:analyze",
          actor: "ai",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            changeId: cid,
            riskLevel: result.analysis.riskLevel,
            recommendation: result.analysis.recommendation,
            fromCache: result.fromCache,
            proofId: proofInfo?.id ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:analyze",
          targetType: "negotiation_change",
          targetId: cid,
          details: {
            sessionId: nid,
            riskLevel: result.analysis.riskLevel,
            recommendation: result.analysis.recommendation,
          },
        });
      } catch {
        // non-fatal
      }

      // Return refreshed change (with analysis stored)
      const refreshedChange = await NegotiationChangesStore.getById(cid);

      return reply.code(200).send({
        change: refreshedChange,
        analysis: result.analysis,
        fromCache: result.fromCache,
        proof: proofInfo,
      });
    }
  );

  /**
   * POST /negotiations/:nid/rounds/:rid/analyze
   * Batch analyze all changes in a round.
   */
  fastify.post<{ Params: { nid: string; rid: string } }>(
    "/negotiations/:nid/rounds/:rid/analyze",
    { config: { rateLimit: AI_RATE_LIMITS.compose } },
    async (req, reply) => {
      const { nid, rid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      // Validate round exists and belongs to session
      const round = await NegotiationRoundsStore.getById(rid);
      if (!round) {
        return reply.code(404).send({
          error: "round_not_found",
          message: `Round ${rid} not found`,
        });
      }
      if (round.sessionId !== nid) {
        return reply.code(404).send({
          error: "round_not_found",
          message: `Round ${rid} does not belong to session ${nid}`,
        });
      }

      const userId = getUserId(req);
      const jobId = `neg_batch_analyze_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Fetch all changes for the round
      const changes = await NegotiationChangesStore.getByRound(rid);
      if (changes.length === 0) {
        return reply.code(200).send({
          analyzed: 0,
          failed: 0,
          skipped: 0,
          durationMs: 0,
          results: [],
          proof: null,
        });
      }

      // Broadcast: batch analysis started
      wsBroadcast(workspaceId, {
        type: "ai_job",
        jobId,
        docId: session.docId,
        kind: "negotiation_analyze",
        phase: "started",
        meta: {
          userId,
          sessionId: nid,
          roundId: rid,
          changeCount: changes.length,
          batch: true,
        },
      });

      let batchResult;
      try {
        batchResult = await ChangeAnalyzer.batchAnalyze(changes, {
          workspaceId,
          sessionId: nid,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Batch analysis failed";

        // Broadcast: batch analysis failed
        wsBroadcast(workspaceId, {
          type: "ai_job",
          jobId,
          docId: session.docId,
          kind: "negotiation_analyze",
          phase: "failed",
          meta: { userId, sessionId: nid, roundId: rid, error: message },
        });

        return reply.code(500).send({
          error: "batch_analysis_failed",
          message,
        });
      }

      // Broadcast: batch analysis finished
      wsBroadcast(workspaceId, {
        type: "ai_job",
        jobId,
        docId: session.docId,
        kind: "negotiation_analyze",
        phase: "finished",
        meta: {
          userId,
          sessionId: nid,
          roundId: rid,
          analyzed: batchResult.analyzed,
          failed: batchResult.failed,
          skipped: batchResult.skipped,
          durationMs: batchResult.durationMs,
        },
      });

      // Broadcast negotiation-specific event
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "changes_analyzed",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: {
          roundId: rid,
          analyzed: batchResult.analyzed,
          failed: batchResult.failed,
        },
        ts: Date.now(),
      });

      // Create proof record for the batch operation
      let proofInfo: { id: string; hash: string } | null = null;
      if (batchResult.analyzed > 0) {
        try {
          const packet = newProofPacket(
            "negotiation:analyze",
            { type: "ai" },
            { sessionId: nid, roundId: rid, workspaceId, changeCount: changes.length },
            {
              analyzed: batchResult.analyzed,
              failed: batchResult.failed,
              skipped: batchResult.skipped,
              durationMs: batchResult.durationMs,
            },
            session.docId
          );

          const proofPath = await writeProofPacket(packet);
          const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

          const proofRow = await recordProof({
            doc_id: session.docId,
            kind: "negotiation:analyze",
            hash: proofHash,
            path: "",
            meta: {
              proofFile: proofPath,
              workspaceId,
              sessionId: nid,
              roundId: rid,
              analyzed: batchResult.analyzed,
              batch: true,
              userId,
            },
          });

          proofInfo = { id: proofRow.id, hash: proofHash };
        } catch {
          // non-fatal
        }
      }

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:analyze",
          actor: "ai",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            roundId: rid,
            analyzed: batchResult.analyzed,
            failed: batchResult.failed,
            skipped: batchResult.skipped,
            durationMs: batchResult.durationMs,
            batch: true,
            proofId: proofInfo?.id ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:analyze",
          targetType: "negotiation_round",
          targetId: rid,
          details: {
            sessionId: nid,
            analyzed: batchResult.analyzed,
            failed: batchResult.failed,
            batch: true,
          },
        });
      } catch {
        // non-fatal
      }

      // Return summary (strip full results for brevity — use per-change endpoints for detail)
      const resultSummary = batchResult.results.map((r) => ({
        changeId: r.changeId,
        riskLevel: r.analysis.riskLevel,
        category: r.analysis.category,
        recommendation: r.analysis.recommendation,
        fromCache: r.fromCache,
      }));

      // Compute IDs of changes that were NOT successfully analyzed (for retry UI)
      const analyzedIds = new Set(batchResult.results.map((r) => r.changeId));
      const failedChangeIds = changes
        .filter((c) => !analyzedIds.has(c.id))
        .map((c) => c.id);

      return reply.code(200).send({
        analyzed: batchResult.analyzed,
        failed: batchResult.failed,
        skipped: batchResult.skipped,
        durationMs: batchResult.durationMs,
        results: resultSummary,
        failedChangeIds,
        proof: proofInfo,
      });
    }
  );

  /**
   * POST /negotiations/:nid/changes/:cid/counterproposal
   * Generate an AI counterproposal for a specific change.
   */
  fastify.post<{ Params: { nid: string; cid: string }; Body: GenerateCounterproposalBody }>(
    "/negotiations/:nid/changes/:cid/counterproposal",
    { config: { rateLimit: AI_RATE_LIMITS.compose } },
    async (req, reply) => {
      const { nid, cid } = req.params;
      const body = (req.body ?? {}) as GenerateCounterproposalBody;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const change = await validateChange(cid, nid, reply);
      if (!change) return;

      // Validate mode
      if (!body.mode || !NegotiationCounterproposalsStore.validateMode(body.mode)) {
        return reply.code(400).send({
          error: "invalid_mode",
          message: 'Mode is required and must be one of: balanced, favorable, minimal_change',
        });
      }

      const userId = getUserId(req);
      const jobId = `neg_counterproposal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Broadcast: counterproposal started
      wsBroadcast(workspaceId, {
        type: "ai_job",
        jobId,
        docId: session.docId,
        kind: "negotiation_counterproposal",
        phase: "started",
        meta: { userId, sessionId: nid, changeId: cid, mode: body.mode },
      });

      let result;
      try {
        result = await CounterproposalGenerator.generate(change, body.mode, {
          workspaceId,
          sessionId: nid,
          createdBy: userId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Counterproposal generation failed";

        // Broadcast: counterproposal failed
        wsBroadcast(workspaceId, {
          type: "ai_job",
          jobId,
          docId: session.docId,
          kind: "negotiation_counterproposal",
          phase: "failed",
          meta: { userId, sessionId: nid, changeId: cid, error: message },
        });

        return reply.code(500).send({
          error: "counterproposal_failed",
          message,
        });
      }

      // Broadcast: counterproposal finished
      wsBroadcast(workspaceId, {
        type: "ai_job",
        jobId,
        docId: session.docId,
        kind: "negotiation_counterproposal",
        phase: "finished",
        meta: {
          userId,
          sessionId: nid,
          changeId: cid,
          counterproposalId: result.counterproposal.id,
          mode: body.mode,
        },
      });

      // Create proof record
      let proofInfo: { id: string; hash: string } | null = null;
      try {
        const packet = newProofPacket(
          "negotiation:counterproposal",
          { type: "ai", provider: result.provider, model: result.model },
          { changeId: cid, sessionId: nid, workspaceId, mode: body.mode },
          {
            counterproposalId: result.counterproposal.id,
            proposedText: result.counterproposal.proposedText,
            rationale: result.counterproposal.rationale,
          },
          session.docId
        );

        const proofPath = await writeProofPacket(packet);
        const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

        const proofRow = await recordProof({
          doc_id: session.docId,
          kind: "negotiation:counterproposal",
          hash: proofHash,
          path: "",
          meta: {
            proofFile: proofPath,
            workspaceId,
            sessionId: nid,
            changeId: cid,
            counterproposalId: result.counterproposal.id,
            mode: body.mode,
            provider: result.provider,
            model: result.model,
            userId,
          },
        });

        proofInfo = { id: proofRow.id, hash: proofHash };
      } catch {
        // non-fatal
      }

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:counterproposal",
          actor: "ai",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            changeId: cid,
            counterproposalId: result.counterproposal.id,
            mode: body.mode,
            proofId: proofInfo?.id ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:counterproposal",
          targetType: "negotiation_change",
          targetId: cid,
          details: {
            sessionId: nid,
            counterproposalId: result.counterproposal.id,
            mode: body.mode,
          },
        });
      } catch {
        // non-fatal
      }

      return reply.code(201).send({
        counterproposal: result.counterproposal,
        clauseMatch: result.clauseMatch
          ? {
              clauseId: result.clauseMatch.clause.id,
              title: result.clauseMatch.clause.title,
              similarity: result.clauseMatch.similarity,
            }
          : null,
        proof: proofInfo,
      });
    }
  );

  /**
   * GET /negotiations/:nid/changes/:cid/counterproposals
   * List all counterproposals for a specific change.
   */
  fastify.get<{ Params: { nid: string; cid: string } }>(
    "/negotiations/:nid/changes/:cid/counterproposals",
    async (req, reply) => {
      const { nid, cid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (viewer+)
      if (!await checkDocAccess(db, req, reply, session.docId, "viewer")) return;

      const change = await validateChange(cid, nid, reply);
      if (!change) return;

      const counterproposals = await NegotiationCounterproposalsStore.getByChange(cid);

      return reply.code(200).send({
        changeId: cid,
        counterproposals,
        total: counterproposals.length,
      });
    }
  );

  /**
   * POST /negotiations/:nid/changes/accept-all
   * Accept all pending changes in a negotiation session.
   */
  fastify.post<{ Params: { nid: string } }>(
    "/negotiations/:nid/changes/accept-all",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const userId = getUserId(req);

      // Batch update all pending → accepted
      const count = await NegotiationChangesStore.batchUpdateStatus(nid, "accepted", userId);

      // Recalculate session counts
      const updatedSession = await refreshSessionCounts(nid);

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:change_accept",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            bulk: true,
            acceptedCount: count,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:change_accept_all",
          targetType: "negotiation",
          targetId: nid,
          details: { acceptedCount: count },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "changes_bulk_accepted",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: { acceptedCount: count },
        ts: Date.now(),
      });

      return reply.code(200).send({
        accepted: count,
        session: updatedSession,
      });
    }
  );

  /**
   * POST /negotiations/:nid/changes/reject-all
   * Reject all pending changes in a negotiation session.
   */
  fastify.post<{ Params: { nid: string } }>(
    "/negotiations/:nid/changes/reject-all",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const userId = getUserId(req);

      // Batch update all pending → rejected
      const count = await NegotiationChangesStore.batchUpdateStatus(nid, "rejected", userId);

      // Recalculate session counts
      const updatedSession = await refreshSessionCounts(nid);

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:change_reject",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            bulk: true,
            rejectedCount: count,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:change_reject_all",
          targetType: "negotiation",
          targetId: nid,
          details: { rejectedCount: count },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "changes_bulk_rejected",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: { rejectedCount: count },
        ts: Date.now(),
      });

      return reply.code(200).send({
        rejected: count,
        session: updatedSession,
      });
    }
  );

  /**
   * GET /negotiations/:nid/summary
   * Get negotiation summary with stats and change distribution.
   */
  fastify.get<{ Params: { nid: string } }>(
    "/negotiations/:nid/summary",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply, false);
      if (!session) return;

      // Doc-level permission check (viewer+)
      if (!await checkDocAccess(db, req, reply, session.docId, "viewer")) return;

      // Fetch rounds
      const rounds = await NegotiationRoundsStore.getBySession(nid);
      const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

      // Change status counts
      const byStatus = await NegotiationChangesStore.countByStatus(nid);

      // Calculate total
      const totalChanges = byStatus.pending + byStatus.accepted + byStatus.rejected + byStatus.countered;

      // Change category and risk distribution (from all changes)
      const allChanges = await NegotiationChangesStore.getBySession(nid);
      const byCategory = { substantive: 0, editorial: 0, structural: 0 };
      const byRisk: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0, unassessed: 0 };

      for (const c of allChanges) {
        if (c.category in byCategory) {
          byCategory[c.category as keyof typeof byCategory]++;
        }
        if (c.riskLevel && c.riskLevel in byRisk) {
          byRisk[c.riskLevel]++;
        } else {
          byRisk.unassessed++;
        }
      }

      // Acceptance rate (of resolved changes)
      const resolved = byStatus.accepted + byStatus.rejected + byStatus.countered;
      const acceptanceRate = resolved > 0
        ? Math.round((byStatus.accepted / resolved) * 100)
        : null;

      return reply.code(200).send({
        session,
        stats: {
          totalRounds: rounds.length,
          totalChanges,
          byStatus,
          byCategory,
          byRisk,
          acceptanceRate,
          latestRound: latestRound
            ? {
                id: latestRound.id,
                roundNumber: latestRound.roundNumber,
                roundType: latestRound.roundType,
                proposedBy: latestRound.proposedBy,
                changeCount: latestRound.changeCount,
                createdAt: latestRound.createdAt,
              }
            : null,
        },
      });
    }
  );

  // ============================================
  // Settlement & History Routes (Slice 8)
  // ============================================

  /**
   * POST /negotiations/:nid/settle
   * Settle negotiation: validate all changes resolved, create final version snapshot,
   * create suggestions from accepted changes, mark session settled.
   */
  fastify.post<{ Params: { nid: string } }>(
    "/negotiations/:nid/settle",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      // Verify session has rounds
      const latestRound = await NegotiationRoundsStore.getLatest(nid);
      if (!latestRound) {
        return reply.code(409).send({
          error: "no_rounds",
          message: "Cannot settle a negotiation with no rounds",
        });
      }

      // Validate all changes are resolved (no pending)
      const counts = await NegotiationChangesStore.countByStatus(nid);
      if (counts.pending > 0) {
        return reply.code(409).send({
          error: "unresolved_changes",
          message: `Cannot settle: ${counts.pending} change(s) still pending. All changes must be accepted, rejected, or countered before settlement.`,
          pendingCount: counts.pending,
        });
      }

      const userId = getUserId(req);

      // 1. Create final version snapshot from the latest round
      let versionId: number | null = null;
      try {
        const version = await createVersion({
          docId: session.docId,
          name: `Settlement — ${session.title}`,
          snapshotHtml: latestRound.snapshotHtml,
          snapshotText: latestRound.snapshotText,
          createdBy: userId,
          metadata: {
            notes: `Negotiation settlement: session=${nid}, round=${latestRound.roundNumber}`,
          },
        });
        versionId = version?.id ?? null;
      } catch {
        // Non-fatal — settlement proceeds without version snapshot
      }

      // 2. Create suggestions from accepted changes
      const acceptedChanges = await NegotiationChangesStore.getBySession(nid, { status: "accepted" });
      let suggestionsCreated = 0;

      for (const change of acceptedChanges) {
        try {
          const suggestion = await createSuggestion({
            docId: session.docId,
            authorId: `negotiation:${nid}`,
            changeType: change.changeType,
            fromPos: change.fromPos,
            toPos: change.toPos,
            originalText: change.originalText,
            proposedText: change.proposedText,
            comment: `Accepted via negotiation settlement: ${session.title}`,
          });

          if (suggestion) {
            suggestionsCreated++;
            // Link suggestion back to the negotiation change
            await NegotiationChangesStore.linkSuggestion(change.id, suggestion.id);
          }
        } catch {
          // Non-fatal — continue with remaining changes
        }
      }

      // 3. Update session status to settled
      const settledSession = await NegotiationSessionsStore.update(nid, { status: "settled" });

      // 4. Create proof record
      let proofInfo: { id: string; hash: string } | null = null;
      try {
        const packet = newProofPacket(
          "negotiation:analyze", // reuse existing proof kind
          { type: "system" },
          {
            sessionId: nid,
            workspaceId,
            action: "settlement",
          },
          {
            acceptedChanges: counts.accepted,
            rejectedChanges: counts.rejected,
            counteredChanges: counts.countered,
            suggestionsCreated,
            versionId,
          },
          session.docId
        );

        const proofPath = await writeProofPacket(packet);
        const proofHash = `sha256:${packet.hashes?.output ?? ""}`;

        const proofRow = await recordProof({
          doc_id: session.docId,
          kind: "negotiation:analyze",
          hash: proofHash,
          path: "",
          meta: {
            proofFile: proofPath,
            workspaceId,
            sessionId: nid,
            action: "settlement",
            acceptedChanges: counts.accepted,
            suggestionsCreated,
            versionId,
            userId,
          },
        });

        proofInfo = { id: proofRow.id, hash: proofHash };
      } catch {
        // non-fatal
      }

      // 5. Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:settle",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            acceptedChanges: counts.accepted,
            rejectedChanges: counts.rejected,
            counteredChanges: counts.countered,
            suggestionsCreated,
            versionId,
            proofId: proofInfo?.id ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      // 6. Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:settle",
          targetType: "negotiation",
          targetId: nid,
          details: {
            acceptedChanges: counts.accepted,
            rejectedChanges: counts.rejected,
            counteredChanges: counts.countered,
            suggestionsCreated,
          },
        });
      } catch {
        // non-fatal
      }

      // 7. WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "settled",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: {
          acceptedChanges: counts.accepted,
          suggestionsCreated,
          versionId,
        },
        ts: Date.now(),
      });

      return reply.code(200).send({
        session: settledSession,
        settlement: {
          versionId,
          suggestionsCreated,
          acceptedChanges: counts.accepted,
          rejectedChanges: counts.rejected,
          counteredChanges: counts.countered,
        },
        proof: proofInfo,
      });
    }
  );

  /**
   * POST /negotiations/:nid/abandon
   * Abandon negotiation. Preserves all rounds and changes for audit.
   * No document modifications.
   */
  fastify.post<{ Params: { nid: string } }>(
    "/negotiations/:nid/abandon",
    async (req, reply) => {
      const { nid } = req.params;

      const workspaceId = getWorkspaceId(req);
      if (!workspaceId) {
        return reply.code(400).send({
          error: "workspace_required",
          message: "x-workspace-id header is required",
        });
      }

      const session = await validateSession(nid, workspaceId, reply);
      if (!session) return;

      // Doc-level permission check (editor+)
      if (!await checkDocAccess(db, req, reply, session.docId, "editor")) return;

      const userId = getUserId(req);

      // Update session status to abandoned
      const abandonedSession = await NegotiationSessionsStore.update(nid, { status: "abandoned" });

      if (!abandonedSession) {
        return reply.code(500).send({
          error: "abandon_failed",
          message: "Failed to abandon negotiation session",
        });
      }

      // Record provenance
      try {
        recordProvenance({
          docId: session.docId,
          action: "negotiation:abandon",
          actor: "human",
          actorId: userId,
          workspaceId,
          details: {
            sessionId: nid,
            title: session.title,
            counterpartyName: session.counterpartyName,
            roundCount: session.currentRound,
            totalChanges: session.totalChanges,
          },
        });
      } catch {
        // non-fatal
      }

      // Audit log
      try {
        logAuditEvent({
          workspaceId,
          actorId: userId,
          action: "negotiation:abandon",
          targetType: "negotiation",
          targetId: nid,
          details: {
            title: session.title,
            counterpartyName: session.counterpartyName,
            roundCount: session.currentRound,
          },
        });
      } catch {
        // non-fatal
      }

      // WebSocket broadcast
      wsBroadcast(workspaceId, {
        type: "negotiation",
        action: "abandoned",
        sessionId: nid,
        docId: session.docId,
        userId,
        meta: {
          title: session.title,
        },
        ts: Date.now(),
      });

      return reply.code(200).send({
        session: abandonedSession,
      });
    }
  );

  // ============================================
  // Workspace-Level Routes (Slice 8)
  // ============================================

  /**
   * GET /workspaces/:wid/negotiations
   * List all negotiations in a workspace with optional filters.
   */
  fastify.get<{
    Params: { wid: string };
    Querystring: {
      status?: string;
      counterparty?: string;
      limit?: string;
      offset?: string;
    };
  }>("/workspaces/:wid/negotiations", async (req, reply) => {
    const { wid } = req.params;
    if (!requireWorkspaceMatch(req, reply, wid)) return;
    const query = (req.query ?? {}) as {
      status?: string;
      counterparty?: string;
      limit?: string;
      offset?: string;
    };

    // Stale cleanup: auto-archive draft sessions older than 90 days
    await NegotiationSessionsStore.archiveStale(wid);

    // Fetch sessions with filters
    const sessions = await NegotiationSessionsStore.getByWorkspace(wid, {
      status: query.status && NegotiationSessionsStore.validateStatus(query.status)
        ? (query.status as NegotiationStatus)
        : undefined,
      search: query.counterparty?.trim() || undefined,
      limit: query.limit ? parseInt(query.limit, 10) || undefined : undefined,
      offset: query.offset ? parseInt(query.offset, 10) || undefined : undefined,
    });

    // Enrich each session with document title
    const enriched = await Promise.all(sessions.map(async (s) => {
      const doc = await getDoc(s.docId);
      return {
        ...s,
        docTitle: doc?.title ?? "(deleted document)",
      };
    }));

    return reply.code(200).send({
      workspaceId: wid,
      negotiations: enriched,
      total: enriched.length,
      filters: {
        status: query.status ?? null,
        counterparty: query.counterparty ?? null,
      },
    });
  });

  /**
   * GET /workspaces/:wid/negotiations/stats
   * Workspace negotiation statistics.
   */
  fastify.get<{ Params: { wid: string } }>(
    "/workspaces/:wid/negotiations/stats",
    async (req, reply) => {
      const { wid } = req.params;
      if (!requireWorkspaceMatch(req, reply, wid)) return;

      // Count by each status
      const byStatus: Record<string, number> = {
        draft: 0,
        active: 0,
        awaiting_response: 0,
        reviewing: 0,
        settled: 0,
        abandoned: 0,
      };

      let total = 0;
      for (const status of Object.keys(byStatus) as NegotiationStatus[]) {
        const count = await NegotiationSessionsStore.count(wid, { status });
        byStatus[status] = count;
        total += count;
      }

      // Active = not settled and not abandoned
      const active = total - byStatus.settled - byStatus.abandoned;

      // Settled this month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      let settledThisMonth = 0;
      try {
        const row = await db.queryOne<{ count: number }>(`
          SELECT COUNT(*) as count
          FROM negotiation_sessions
          WHERE workspace_id = ? AND status = 'settled' AND settled_at >= ?
        `, [wid, monthStart]);
        settledThisMonth = row?.count ?? 0;
      } catch {
        // fallback to 0
      }

      // Average rounds for settled sessions
      let averageRounds: number | null = null;
      try {
        const row = await db.queryOne<{ avg_rounds: number | null }>(`
          SELECT AVG(current_round) as avg_rounds
          FROM negotiation_sessions
          WHERE workspace_id = ? AND status = 'settled' AND current_round > 0
        `, [wid]);
        averageRounds = row?.avg_rounds !== null && row?.avg_rounds !== undefined
          ? Math.round(row.avg_rounds * 10) / 10
          : null;
      } catch {
        // fallback to null
      }

      // Overall acceptance rate across all sessions
      let overallAcceptanceRate: number | null = null;
      try {
        const row = await db.queryOne<{ total_accepted: number | null; total_all: number | null }>(`
          SELECT
            SUM(accepted_changes) as total_accepted,
            SUM(total_changes) as total_all
          FROM negotiation_sessions
          WHERE workspace_id = ? AND total_changes > 0
        `, [wid]);
        if (row?.total_all && row.total_all > 0) {
          overallAcceptanceRate = Math.round(
            ((row.total_accepted ?? 0) / row.total_all) * 100
          );
        }
      } catch {
        // fallback to null
      }

      return reply.code(200).send({
        workspaceId: wid,
        stats: {
          total,
          active,
          settledThisMonth,
          averageRounds,
          overallAcceptanceRate,
          byStatus,
        },
      });
    }
  );
};

export default negotiationRoutes;
