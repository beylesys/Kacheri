// KACHERI BACKEND/src/routes/docReviewers.ts
// REST endpoints for document reviewer assignments.
// Slice 12 — Phase 2 Sprint 4
//
// Endpoints:
// - POST   /docs/:id/reviewers           — Assign reviewer (editor+)
// - GET    /docs/:id/reviewers           — List reviewers (viewer+)
// - PATCH  /docs/:id/reviewers/:userId   — Update status (reviewer or editor+)
// - DELETE /docs/:id/reviewers/:userId   — Remove reviewer (editor+ or self)

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { db } from '../db';
import { checkDocAccess, getUserId } from '../workspace/middleware';
import { wsBroadcast, broadcastToUser } from '../realtime/globalHub';
import { logAuditEvent } from '../store/audit';
import { createAndDeliverNotification } from '../store/notifications';
import { getDoc } from '../store/docs';
import {
  assignReviewer,
  listReviewers,
  getReviewer,
  updateReviewerStatus,
  removeReviewer,
  isValidReviewerStatus,
} from '../store/docReviewers';

// ============================================
// Types
// ============================================

interface DocParams {
  id: string;
}

interface ReviewerParams {
  id: string;
  userId: string;
}

interface AssignBody {
  userId: string;
}

interface UpdateStatusBody {
  status: string;
  notes?: string | null;
}

// ============================================
// Helpers
// ============================================

function getActorId(req: FastifyRequest): string {
  return getUserId(req) || 'user:anonymous';
}

function getResolvedWorkspaceId(req: FastifyRequest): string {
  // Use middleware-validated workspace ID instead of raw header
  return req.workspaceId || '';
}

// ============================================
// Routes
// ============================================

export const docReviewerRoutes: FastifyPluginAsync = async (fastify) => {

  // ----------------------------------------
  // POST /docs/:id/reviewers — Assign reviewer
  // ----------------------------------------
  fastify.post<{ Params: DocParams; Body: AssignBody }>(
    '/docs/:id/reviewers',
    async (request, reply) => {
      const { id: docId } = request.params;
      const actorId = getActorId(request);

      // RBAC: editor+ on doc
      if (!checkDocAccess(db, request, reply, docId, 'editor')) return;

      const body = request.body;
      if (!body || typeof body.userId !== 'string' || !body.userId.trim()) {
        return reply.code(400).send({ error: 'userId is required' });
      }

      const reviewerUserId = body.userId.trim();

      // Get doc for title (workspace ID from header for workspace-scoped operations)
      const doc = await getDoc(docId);
      if (!doc) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      const workspaceId = doc.workspaceId || getResolvedWorkspaceId(request);
      const docTitle = doc.title || 'Untitled';

      const reviewer = await assignReviewer(docId, workspaceId, reviewerUserId, actorId);
      if (!reviewer) {
        return reply.code(409).send({ error: 'User is already assigned as reviewer on this document' });
      }

      // Fire review_assigned notification to the reviewer
      createAndDeliverNotification({
        userId: reviewerUserId,
        workspaceId,
        type: 'review_assigned',
        title: `You have been assigned to review "${docTitle}"`,
        body: `Assigned by ${actorId}`,
        linkType: 'doc',
        linkId: docId,
        actorId,
      });

      // Broadcast notification to reviewer via WS
      broadcastToUser(reviewerUserId, {
        type: 'notification',
        notificationId: 0, // notification ID not critical for WS push
        userId: reviewerUserId,
        notificationType: 'review_assigned',
        title: `You have been assigned to review "${docTitle}"`,
        ts: Date.now(),
      });

      // Audit log
      logAuditEvent({
        workspaceId,
        actorId,
        action: 'reviewer:assign',
        targetType: 'reviewer',
        targetId: `${docId}:${reviewerUserId}`,
        details: { docId, reviewerUserId },
      });

      // WS broadcast reviewer event to workspace
      wsBroadcast(workspaceId, {
        type: 'reviewer',
        action: 'assigned',
        docId,
        userId: reviewerUserId,
        assignedBy: actorId,
        status: 'pending',
        ts: Date.now(),
      });

      return reply.code(201).send({ reviewer });
    }
  );

  // ----------------------------------------
  // GET /docs/:id/reviewers — List reviewers
  // ----------------------------------------
  fastify.get<{ Params: DocParams }>(
    '/docs/:id/reviewers',
    async (request, reply) => {
      const { id: docId } = request.params;

      // RBAC: viewer+ on doc
      if (!checkDocAccess(db, request, reply, docId, 'viewer')) return;

      const reviewers = await listReviewers(docId);
      return reply.send({ reviewers, count: reviewers.length });
    }
  );

  // ----------------------------------------
  // PATCH /docs/:id/reviewers/:userId — Update status
  // ----------------------------------------
  fastify.patch<{ Params: ReviewerParams; Body: UpdateStatusBody }>(
    '/docs/:id/reviewers/:userId',
    async (request, reply) => {
      const { id: docId, userId: reviewerUserId } = request.params;
      const actorId = getActorId(request);

      // Check reviewer exists first
      const existing = await getReviewer(docId, reviewerUserId);
      if (!existing) {
        return reply.code(404).send({ error: 'Reviewer assignment not found' });
      }

      // RBAC: the reviewer themselves can update their own status,
      // OR someone with editor+ on the doc
      const isSelf = actorId === reviewerUserId;
      if (!isSelf) {
        if (!checkDocAccess(db, request, reply, docId, 'editor')) return;
      }

      const body = request.body;
      if (!body || typeof body.status !== 'string' || !body.status.trim()) {
        return reply.code(400).send({ error: 'status is required' });
      }

      const newStatus = body.status.trim();
      if (!isValidReviewerStatus(newStatus)) {
        return reply.code(400).send({ error: `Invalid status: ${newStatus}. Must be one of: pending, in_review, completed` });
      }

      const notes = body.notes != null ? String(body.notes) : null;
      const updated = await updateReviewerStatus(docId, reviewerUserId, newStatus, notes);
      if (!updated) {
        return reply.code(500).send({ error: 'Failed to update reviewer status' });
      }

      const wsId = existing.workspaceId;

      // Audit log
      logAuditEvent({
        workspaceId: wsId,
        actorId,
        action: 'reviewer:status_change',
        targetType: 'reviewer',
        targetId: `${docId}:${reviewerUserId}`,
        details: { docId, reviewerUserId, from: existing.status, to: newStatus, notes },
      });

      // WS broadcast
      wsBroadcast(wsId, {
        type: 'reviewer',
        action: 'status_changed',
        docId,
        userId: reviewerUserId,
        status: newStatus,
        ts: Date.now(),
      });

      return reply.send({ reviewer: updated });
    }
  );

  // ----------------------------------------
  // DELETE /docs/:id/reviewers/:userId — Remove reviewer
  // ----------------------------------------
  fastify.delete<{ Params: ReviewerParams }>(
    '/docs/:id/reviewers/:userId',
    async (request, reply) => {
      const { id: docId, userId: reviewerUserId } = request.params;
      const actorId = getActorId(request);

      // Check reviewer exists first
      const existing = await getReviewer(docId, reviewerUserId);
      if (!existing) {
        return reply.code(404).send({ error: 'Reviewer assignment not found' });
      }

      // RBAC: editor+ can remove anyone; reviewer can remove themselves
      const isSelf = actorId === reviewerUserId;
      if (!isSelf) {
        if (!checkDocAccess(db, request, reply, docId, 'editor')) return;
      }

      const deleted = await removeReviewer(docId, reviewerUserId);
      if (!deleted) {
        return reply.code(500).send({ error: 'Failed to remove reviewer' });
      }

      const wsId = existing.workspaceId;

      // Audit log
      logAuditEvent({
        workspaceId: wsId,
        actorId,
        action: 'reviewer:unassign',
        targetType: 'reviewer',
        targetId: `${docId}:${reviewerUserId}`,
        details: { docId, reviewerUserId },
      });

      // WS broadcast
      wsBroadcast(wsId, {
        type: 'reviewer',
        action: 'removed',
        docId,
        userId: reviewerUserId,
        ts: Date.now(),
      });

      return reply.send({ deleted: true });
    }
  );
};

export default docReviewerRoutes;
