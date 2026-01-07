// KACHERI BACKEND/src/routes/verificationReports.ts
// REST API routes for verification reports (Phase 5 - P0.3)

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createReport,
  getReport,
  getReportFull,
  getLatestReport,
  listReports,
  deleteReport,
  deleteReportsOlderThan,
  getReportCounts,
  type CreateReportParams,
  type ListReportsOptions,
} from '../store/verificationReports';
import { getUserId } from '../workspace/middleware';

export default async function verificationReportRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────────────────
  // Helper: Require authenticated user
  // ─────────────────────────────────────────────────────────────────────────
  function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
    const userId = getUserId(req);
    if (!userId) {
      reply.code(401).send({ error: 'Authentication required' });
      return null;
    }
    return userId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /ai/watch/reports - List verification reports (paginated)
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      limit?: string;
      before?: string;
      status?: 'pass' | 'fail' | 'partial';
    };
  }>('/ai/watch/reports', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const options: ListReportsOptions = {
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      before: req.query.before,
      status: req.query.status,
    };

    const { reports, hasMore } = listReports(options);
    return { reports, hasMore };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /ai/watch/reports/latest - Get most recent report
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/ai/watch/reports/latest', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const report = getLatestReport();
    if (!report) {
      return reply.code(404).send({ error: 'No verification reports found' });
    }
    return report;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /ai/watch/reports/counts - Get report counts by status
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/ai/watch/reports/counts', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    return getReportCounts();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /ai/watch/reports/:id - Get single report by ID
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{
    Params: { id: string };
    Querystring: { full?: string };
  }>('/ai/watch/reports/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    const { id } = req.params;
    const includeFull = req.query.full === 'true' || req.query.full === '1';

    const report = includeFull ? getReportFull(id) : getReport(id);
    if (!report) {
      return reply.code(404).send({ error: 'Report not found' });
    }
    return report;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /ai/watch/reports - Create a new report (internal use)
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: CreateReportParams;
  }>('/ai/watch/reports', async (req, reply) => {
    // This endpoint is primarily for internal use (nightly_verify.ts)
    // but we still validate the request

    const body = req.body ?? {};

    if (!body.status || !['pass', 'fail', 'partial'].includes(body.status)) {
      return reply.code(400).send({ error: 'Invalid status. Must be pass, fail, or partial.' });
    }

    if (body.reportJson === undefined) {
      return reply.code(400).send({ error: 'reportJson is required' });
    }

    try {
      const report = createReport({
        status: body.status,
        exportsPass: body.exportsPass,
        exportsFail: body.exportsFail,
        exportsMiss: body.exportsMiss,
        composePass: body.composePass,
        composeDrift: body.composeDrift,
        composeMiss: body.composeMiss,
        reportJson: body.reportJson,
        triggeredBy: body.triggeredBy ?? 'manual',
      });

      if (!report) {
        return reply.code(500).send({ error: 'Failed to create report' });
      }

      return reply.code(201).send(report);
    } catch (err: unknown) {
      req.log.error({ err }, 'Failed to create verification report');
      return reply.code(500).send({ error: 'Failed to create report' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /ai/watch/reports/:id - Delete a report
  // ─────────────────────────────────────────────────────────────────────────
  app.delete<{
    Params: { id: string };
  }>('/ai/watch/reports/:id', async (req, reply) => {
    const userId = requireUser(req, reply);
    if (!userId) return;

    // TODO: Add admin check when RBAC is available
    // For now, any authenticated user can delete

    const { id } = req.params;
    const deleted = deleteReport(id);

    if (!deleted) {
      return reply.code(404).send({ error: 'Report not found' });
    }

    return reply.code(204).send();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /ai/watch/reports/cleanup - Apply retention policy (internal use)
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{
    Body: { days?: number };
  }>('/ai/watch/reports/cleanup', async (req, reply) => {
    // This endpoint is for maintenance/cron jobs
    const days = req.body?.days ?? 90;

    if (typeof days !== 'number' || days < 1) {
      return reply.code(400).send({ error: 'days must be a positive number' });
    }

    const deleted = deleteReportsOlderThan(days);
    return { deleted, retentionDays: days };
  });
}
