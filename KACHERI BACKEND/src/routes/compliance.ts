// KACHERI BACKEND/src/routes/compliance.ts
// Compliance Checker: API routes for running compliance checks against documents
//
// Endpoints:
// - POST /docs/:id/compliance/check    — Trigger compliance check (all enabled policies)
// - GET  /docs/:id/compliance          — Get latest check result
// - GET  /docs/:id/compliance/history   — Paginated history of past checks
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice A5

import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'crypto';
import { CompliancePoliciesStore } from '../store/compliancePolicies';
import { ComplianceChecksStore } from '../store/complianceChecks';
import type { CheckTrigger } from '../store/complianceChecks';
import { runComplianceCheck } from '../compliance/engine';
import { shouldAutoCheck, hasAutoCheckPolicies, getAutoCheckPolicies } from '../compliance/autoCheck';
import { getDoc } from '../store/docs';
import { recordProof } from '../provenanceStore';
import { recordProvenance } from '../provenance';
import { newProofPacket, writeProofPacket } from '../utils/proofs';
import { AI_RATE_LIMITS } from '../middleware/rateLimit';
import { wsBroadcast } from '../realtime/globalHub';
import { checkDocAccess } from '../workspace/middleware';
import { db } from '../db';

/* ---------- Types ---------- */

interface CheckBody {
  html: string;
  metadata?: Record<string, unknown>;
  triggeredBy?: 'manual' | 'auto_save' | 'pre_export';
}

interface HistoryQuery {
  limit?: string | number;
  offset?: string | number;
}

/* ---------- Helpers ---------- */

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/* ---------- Routes ---------- */

export const complianceRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /docs/:id/compliance/check
   * Trigger a compliance check against all enabled workspace policies.
   */
  fastify.post<{ Params: { id: string }; Body: CheckBody }>(
    '/docs/:id/compliance/check',
    {
      config: {
        rateLimit: AI_RATE_LIMITS.compose, // AI checks are expensive like compose
      },
    },
    async (req, reply) => {
      const { id: docId } = req.params;
      const { html, metadata, triggeredBy: rawTriggeredBy } = req.body ?? {};

      // Resolve triggeredBy with validation
      const validTriggers: CheckTrigger[] = ['manual', 'auto_save', 'pre_export'];
      const triggeredBy: CheckTrigger =
        rawTriggeredBy && validTriggers.includes(rawTriggeredBy as CheckTrigger)
          ? (rawTriggeredBy as CheckTrigger)
          : 'manual';

      // Validate required field
      if (!html || typeof html !== 'string' || html.trim().length === 0) {
        return reply.code(400).send({
          error: 'html_required',
          message: 'Document HTML content is required for compliance checking',
        });
      }

      // Doc-level permission check (editor+ required for triggering checks)
      if (!checkDocAccess(db, req, reply, docId, 'editor')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      // User/workspace context (use middleware-validated values)
      const workspaceId = req.workspaceId;
      const userId = req.user?.id || 'user:local';

      if (!workspaceId) {
        return reply.code(400).send({
          error: 'workspace_required',
          message: 'X-Workspace-Id header is required for compliance checks',
        });
      }

      // --- Auto-save debounce logic (Slice A7) ---
      if (triggeredBy === 'auto_save') {
        // Skip if no auto-check policies exist
        if (!await hasAutoCheckPolicies(workspaceId)) {
          return reply.code(200).send({
            skipped: true,
            reason: 'no_auto_check_policies',
            docId,
            message: 'No auto-check policies enabled for this workspace',
          });
        }

        // Debounce: skip if last check was <30s ago
        if (!await shouldAutoCheck(docId)) {
          return reply.code(200).send({
            skipped: true,
            reason: 'debounced',
            docId,
            message: 'Compliance check debounced (last check was less than 30s ago)',
          });
        }
      }

      // Get policies based on trigger type
      // auto_save: only auto-check enabled policies
      // manual / pre_export: all enabled policies
      const policies =
        triggeredBy === 'auto_save'
          ? await getAutoCheckPolicies(workspaceId)
          : await CompliancePoliciesStore.getEnabled(workspaceId);

      if (policies.length === 0) {
        return reply.code(200).send({
          checkId: null,
          docId,
          status: 'passed',
          totalPolicies: 0,
          passed: 0,
          warnings: 0,
          violations: 0,
          results: [],
          message: 'No enabled compliance policies for this workspace',
        });
      }

      const jobId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Create check record (starts as pending)
      const check = await ComplianceChecksStore.create({
        docId,
        workspaceId,
        triggeredBy,
        checkedBy: userId,
        totalPolicies: policies.length,
      });

      // Notify: compliance check started
      wsBroadcast(workspaceId, {
        type: 'ai_job',
        jobId,
        docId,
        kind: 'compliance_check',
        phase: 'started',
        meta: { userId, checkId: check.id, totalPolicies: policies.length },
      });

      // Update status to running
      await ComplianceChecksStore.updateStatus(check.id, {
        status: 'running',
      });

      // Run the compliance engine
      let engineResult;
      try {
        engineResult = await runComplianceCheck({
          html,
          policies,
          metadata,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Compliance check failed';

        // Update check to error
        await ComplianceChecksStore.updateStatus(check.id, {
          status: 'error',
        });

        wsBroadcast(workspaceId, {
          type: 'ai_job',
          jobId,
          docId,
          kind: 'compliance_check',
          phase: 'failed',
          meta: { userId, checkId: check.id, error: message },
        });

        return reply.code(500).send({
          error: 'compliance_check_failed',
          message: `Compliance check failed: ${message}`,
          checkId: check.id,
        });
      }

      // Determine final status
      const finalStatus = engineResult.violations > 0 ? 'failed' : 'passed';

      // Create proof packet
      const truncatedHtml = html.length > 500 ? html.slice(0, 500) + '...' : html;
      const packet = newProofPacket(
        'compliance:check',
        { type: 'system' },
        {
          docId,
          htmlLength: html.length,
          htmlPreview: truncatedHtml,
          totalPolicies: engineResult.totalPolicies,
          triggeredBy,
        },
        {
          status: finalStatus,
          passed: engineResult.passed,
          warnings: engineResult.warnings,
          violations: engineResult.violations,
          errors: engineResult.errors,
          resultSummary: engineResult.results.map((r) => ({
            policyId: r.policyId,
            policyName: r.policyName,
            status: r.status,
            severity: r.severity,
          })),
        },
        docId
      );

      const proofPath = await writeProofPacket(packet);
      const outputHashHex = packet.hashes?.output ?? '';
      const proofHash = `sha256:${outputHashHex}`;

      // Record proof in DB
      const proofRow = await recordProof({
        doc_id: docId,
        kind: 'compliance:check',
        hash: proofHash,
        path: '',
        meta: {
          proofFile: proofPath,
          checkId: check.id,
          totalPolicies: engineResult.totalPolicies,
          passed: engineResult.passed,
          warnings: engineResult.warnings,
          violations: engineResult.violations,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });

      // Record provenance
      try {
        await recordProvenance({
          docId,
          action: 'compliance:check',
          actor: 'system',
          actorId: userId,
          workspaceId: workspaceId ?? null,
          details: {
            checkId: check.id,
            status: finalStatus,
            totalPolicies: engineResult.totalPolicies,
            passed: engineResult.passed,
            warnings: engineResult.warnings,
            violations: engineResult.violations,
            proofHash,
            proofId: proofRow?.id ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      // Update check with final results
      const updatedCheck = await ComplianceChecksStore.updateStatus(check.id, {
        status: finalStatus as 'passed' | 'failed',
        totalPolicies: engineResult.totalPolicies,
        passed: engineResult.passed,
        warnings: engineResult.warnings,
        violations: engineResult.violations,
        results: engineResult.results,
        proofId: proofRow?.id?.toString(),
      });

      // Notify: compliance check finished
      wsBroadcast(workspaceId, {
        type: 'ai_job',
        jobId,
        docId,
        kind: 'compliance_check',
        phase: 'finished',
        meta: {
          userId,
          checkId: check.id,
          status: finalStatus,
          passed: engineResult.passed,
          warnings: engineResult.warnings,
          violations: engineResult.violations,
        },
      });
      wsBroadcast(workspaceId, {
        type: 'proof_added',
        docId,
        proofId: proofRow?.id,
        sha256: proofHash,
        ts: Date.now(),
      });

      return reply.code(200).send({
        checkId: updatedCheck?.id ?? check.id,
        docId,
        status: finalStatus,
        totalPolicies: engineResult.totalPolicies,
        passed: engineResult.passed,
        warnings: engineResult.warnings,
        violations: engineResult.violations,
        results: engineResult.results,
        proofId: proofRow?.id,
        proofHash,
        checkedAt: updatedCheck?.completedAt ?? new Date().toISOString(),
      });
    }
  );

  /**
   * GET /docs/:id/compliance
   * Get the latest compliance check result for a document.
   */
  fastify.get<{ Params: { id: string } }>(
    '/docs/:id/compliance',
    async (req, reply) => {
      const { id: docId } = req.params;

      // Doc-level permission check (viewer+ required)
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      const check = await ComplianceChecksStore.getLatest(docId);
      if (!check) {
        return reply.code(404).send({
          error: 'compliance_check_not_found',
          message: `No compliance check found for document ${docId}`,
        });
      }

      return reply.code(200).send({
        checkId: check.id,
        docId: check.docId,
        status: check.status,
        totalPolicies: check.totalPolicies,
        passed: check.passed,
        warnings: check.warnings,
        violations: check.violations,
        results: check.results,
        proofId: check.proofId,
        triggeredBy: check.triggeredBy,
        checkedBy: check.checkedBy,
        createdAt: check.createdAt,
        completedAt: check.completedAt,
      });
    }
  );

  /**
   * GET /docs/:id/compliance/history
   * Get paginated history of compliance checks for a document.
   */
  fastify.get<{ Params: { id: string }; Querystring: HistoryQuery }>(
    '/docs/:id/compliance/history',
    async (req, reply) => {
      const { id: docId } = req.params;
      const rawLimit = req.query.limit;
      const rawOffset = req.query.offset;

      // Doc-level permission check (viewer+ required)
      if (!checkDocAccess(db, req, reply, docId, 'viewer')) return;

      // Verify document exists
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({
          error: 'doc_not_found',
          message: `Document ${docId} not found`,
        });
      }

      // Parse and clamp pagination params
      const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);
      const offset = Math.max(Number(rawOffset) || 0, 0);

      const checks = await ComplianceChecksStore.getHistory(docId, limit, offset);
      const total = await ComplianceChecksStore.count(docId);

      return reply.code(200).send({
        docId,
        checks: checks.map((c) => ({
          checkId: c.id,
          status: c.status,
          totalPolicies: c.totalPolicies,
          passed: c.passed,
          warnings: c.warnings,
          violations: c.violations,
          triggeredBy: c.triggeredBy,
          checkedBy: c.checkedBy,
          createdAt: c.createdAt,
          completedAt: c.completedAt,
        })),
        total,
        limit,
        offset,
      });
    }
  );
};

export default complianceRoutes;
