// KACHERI BACKEND/src/routes/jaal.ts
// JAAL Research Browser API routes — Slice S5 (Phase B)
//
// Endpoints:
//   Sessions: POST/GET/PATCH /jaal/sessions, GET /jaal/sessions/:sid
//   Guide:    POST /jaal/guide/summarize, /extract-links, /compare
//   Proofs:   POST/GET /jaal/proofs, GET /jaal/proofs/:pid
//   Policy:   GET /jaal/policy/evaluate, /privacy-receipt
//   Browse:   GET /jaal/browse?url=...
//
// All endpoints require auth. Workspace context from X-Workspace-Id header
// or body.workspaceId (POST /sessions).

import type { FastifyInstance } from "fastify";
import { requireUser, hasWorkspaceReadAccess } from "../workspace/middleware";
import { AI_RATE_LIMITS } from "../middleware/rateLimit";
import { logAuditEvent } from "../store/audit";

// Services
import * as sessionService from "../jaal/sessionService";
import * as proofService from "../jaal/proofService";
import * as policyService from "../jaal/policyService";
import * as llmService from "../jaal/llmService";
import { fetchAndSanitize } from "../jaal/browseProxy";

export default async function jaalRoutes(app: FastifyInstance) {

  // ========== SESSIONS ==========

  /**
   * POST /jaal/sessions — Start a new research session
   */
  app.post<{
    Body: { workspaceId: string };
  }>("/jaal/sessions", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const workspaceId = req.body?.workspaceId;
    if (!workspaceId) {
      return reply.code(400).send({
        error: "missing_workspace",
        message: "workspaceId is required",
      });
    }

    // Ensure workspace context is set for access check
    if (!req.workspaceId) {
      req.workspaceId = workspaceId;
    }
    if (!hasWorkspaceReadAccess(req)) {
      return reply.code(403).send({
        error: "workspace_access_required",
        message: "You must be a member of this workspace",
      });
    }

    const session = await sessionService.startSession(workspaceId, userId);
    return reply.code(201).send({ session });
  });

  /**
   * GET /jaal/sessions — List the authenticated user's sessions
   */
  app.get("/jaal/sessions", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const sessions = await sessionService.listSessions(userId, req.workspaceId);
    return { sessions };
  });

  /**
   * GET /jaal/sessions/:sid — Session detail
   */
  app.get<{
    Params: { sid: string };
  }>("/jaal/sessions/:sid", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const session = await sessionService.getSession(req.params.sid);
    if (!session) {
      return reply.code(404).send({ error: "not_found", message: "Session not found" });
    }

    return { session };
  });

  /**
   * PATCH /jaal/sessions/:sid — Update or end a session
   */
  app.patch<{
    Params: { sid: string };
    Body: { ended?: boolean; metadata?: Record<string, unknown> };
  }>("/jaal/sessions/:sid", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { sid } = req.params;
    const body = req.body ?? {};

    let session;
    if (body.ended) {
      session = await sessionService.endSession(sid, userId);
    } else {
      session = await sessionService.updateSession(sid, userId, {
        metadata: body.metadata,
      });
    }

    if (!session) {
      return reply.code(404).send({ error: "not_found", message: "Session not found or access denied" });
    }

    return { session };
  });

  // ========== GUIDE (AI Actions) ==========

  /**
   * POST /jaal/guide/summarize — AI-summarize page content
   */
  app.post<{
    Body: { url: string; content: string };
  }>("/jaal/guide/summarize", {
    config: { rateLimit: AI_RATE_LIMITS.jaalGuide },
  }, async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { url, content } = req.body ?? {};
    if (!content) {
      return reply.code(400).send({ error: "missing_content", message: "content is required" });
    }

    // Policy check
    const policyResult = policyService.evaluate({ action: "summarize", url, mode: "Guide" });
    if (!policyResult.allowed) {
      return reply.code(403).send({
        error: "policy_denied",
        message: "Action denied by policy",
        ...policyResult,
      });
    }

    // LLM call
    const llmResult = await llmService.summarize(content, url ?? "");

    // Create proof
    const proof = await proofService.createJaalProof({
      workspaceId: req.workspaceId ?? "",
      userId,
      kind: "summarize",
      payload: {
        url,
        contentLength: content.length,
        result: llmResult.result,
        provider: llmResult.provider,
        model: llmResult.model,
      },
    });

    // Audit
    logAuditEvent({
      workspaceId: req.workspaceId ?? "",
      actorId: userId,
      action: "jaal:guide_action",
      targetType: "jaal_proof",
      targetId: proof.id,
      details: { guideAction: "summarize", url },
    });

    return { result: llmResult.result, proofId: proof.id };
  });

  /**
   * POST /jaal/guide/extract-links — Extract links from page content
   */
  app.post<{
    Body: { url: string; content: string };
  }>("/jaal/guide/extract-links", {
    config: { rateLimit: AI_RATE_LIMITS.jaalGuide },
  }, async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { url, content } = req.body ?? {};
    if (!content) {
      return reply.code(400).send({ error: "missing_content", message: "content is required" });
    }

    // Policy check
    const policyResult = policyService.evaluate({ action: "extract_links", url, mode: "Guide" });
    if (!policyResult.allowed) {
      return reply.code(403).send({
        error: "policy_denied",
        message: "Action denied by policy",
        ...policyResult,
      });
    }

    // Local extraction (no LLM)
    const linkResult = llmService.extractLinks(content, url ?? "");

    // Create proof
    const proof = await proofService.createJaalProof({
      workspaceId: req.workspaceId ?? "",
      userId,
      kind: "extract_links",
      payload: {
        url,
        contentLength: content.length,
        result: linkResult.result,
      },
    });

    // Audit
    logAuditEvent({
      workspaceId: req.workspaceId ?? "",
      actorId: userId,
      action: "jaal:guide_action",
      targetType: "jaal_proof",
      targetId: proof.id,
      details: { guideAction: "extract_links", url },
    });

    return { result: linkResult.result, proofId: proof.id };
  });

  /**
   * POST /jaal/guide/compare — AI-compare two pages
   */
  app.post<{
    Body: { urlA: string; contentA: string; urlB: string; contentB: string };
  }>("/jaal/guide/compare", {
    config: { rateLimit: AI_RATE_LIMITS.jaalGuide },
  }, async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { urlA, contentA, urlB, contentB } = req.body ?? {};
    if (!contentA || !contentB) {
      return reply.code(400).send({
        error: "missing_content",
        message: "contentA and contentB are required",
      });
    }

    // Policy check (check both URLs)
    const policyA = policyService.evaluate({ action: "compare", url: urlA, mode: "Guide" });
    if (!policyA.allowed) {
      return reply.code(403).send({
        error: "policy_denied",
        message: `Action denied for URL A by policy`,
        ...policyA,
      });
    }
    const policyB = policyService.evaluate({ action: "compare", url: urlB, mode: "Guide" });
    if (!policyB.allowed) {
      return reply.code(403).send({
        error: "policy_denied",
        message: `Action denied for URL B by policy`,
        ...policyB,
      });
    }

    // LLM call
    const llmResult = await llmService.compare(
      contentA, urlA ?? "",
      contentB, urlB ?? "",
    );

    // Create proof
    const proof = await proofService.createJaalProof({
      workspaceId: req.workspaceId ?? "",
      userId,
      kind: "compare",
      payload: {
        urlA,
        urlB,
        contentALength: contentA.length,
        contentBLength: contentB.length,
        result: llmResult.result,
        provider: llmResult.provider,
        model: llmResult.model,
      },
    });

    // Audit
    logAuditEvent({
      workspaceId: req.workspaceId ?? "",
      actorId: userId,
      action: "jaal:guide_action",
      targetType: "jaal_proof",
      targetId: proof.id,
      details: { guideAction: "compare", urlA, urlB },
    });

    return { result: llmResult.result, proofId: proof.id };
  });

  // ========== PROOFS ==========

  /**
   * POST /jaal/proofs — Create a proof record
   */
  app.post<{
    Body: { sessionId?: string; kind: string; payload: Record<string, unknown> };
  }>("/jaal/proofs", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { sessionId, kind, payload } = req.body ?? {};
    if (!kind || !payload) {
      return reply.code(400).send({
        error: "invalid_input",
        message: "kind and payload are required",
      });
    }

    const proof = await proofService.createJaalProof({
      sessionId,
      workspaceId: req.workspaceId ?? "",
      userId,
      kind,
      payload,
    });

    return reply.code(201).send({ proof });
  });

  /**
   * GET /jaal/proofs — List proofs with optional filters
   */
  app.get<{
    Querystring: { sessionId?: string; kind?: string; limit?: string };
  }>("/jaal/proofs", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { sessionId, kind, limit: limitStr } = req.query;
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 100, 200) : 100;

    const proofs = await proofService.listProofs(req.workspaceId ?? "", {
      sessionId,
      kind,
      limit,
    });

    return { proofs };
  });

  /**
   * GET /jaal/proofs/:pid — Proof detail
   */
  app.get<{
    Params: { pid: string };
  }>("/jaal/proofs/:pid", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const proof = await proofService.getProof(req.params.pid);
    if (!proof) {
      return reply.code(404).send({ error: "not_found", message: "Proof not found" });
    }

    return { proof };
  });

  // ========== POLICY ==========

  /**
   * GET /jaal/policy/evaluate — Evaluate policy for an action
   */
  app.get<{
    Querystring: { action: string; url?: string; mode?: string };
  }>("/jaal/policy/evaluate", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { action, url, mode } = req.query;
    if (!action) {
      return reply.code(400).send({ error: "missing_action", message: "action query parameter is required" });
    }

    const result = policyService.evaluate({ action, url, mode });
    return result;
  });

  /**
   * GET /jaal/policy/privacy-receipt — Get privacy receipt
   */
  app.get("/jaal/policy/privacy-receipt", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const result = policyService.getPrivacyReceipt(
      req.workspaceId ?? "",
      userId,
    );

    return result;
  });

  // ========== BROWSE PROXY ==========

  /**
   * GET /jaal/browse?url=<encoded_url> — Proxy-fetch page for web topology
   */
  app.get<{
    Querystring: { url: string };
  }>("/jaal/browse", async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { url } = req.query;
    if (!url) {
      return reply.code(400).send({ error: "missing_url", message: "url query parameter is required" });
    }

    // Audit the browse action
    logAuditEvent({
      workspaceId: req.workspaceId ?? "",
      actorId: userId,
      action: "jaal:browse",
      details: { url },
    });

    const result = await fetchAndSanitize(url);

    return reply
      .code(result.statusCode)
      .header("content-type", result.contentType)
      .header("x-frame-options", "SAMEORIGIN")
      .send(result.html);
  });
}
