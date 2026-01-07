// KACHERI BACKEND/src/routes/suggestions.ts
// REST endpoints for document suggestions (track changes mode).

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  createSuggestion,
  getSuggestion,
  listSuggestions,
  updateSuggestionComment,
  deleteSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  acceptAllPending,
  rejectAllPending,
  getPendingCount,
  type CreateSuggestionParams,
  type ListSuggestionsOptions,
  type ChangeType,
  type SuggestionStatus,
} from '../store/suggestions';
import { getDoc } from '../store/docs';
import { logAuditEvent } from '../store/audit';
import { hasDocPermission } from '../store/docPermissions';
import {
  getEffectiveDocRole,
  getUserId,
} from '../workspace/middleware';
import { wsBroadcast } from '../realtime/globalHub';

export function createSuggestionRoutes(db: Database) {
  return async function suggestionRoutes(app: FastifyInstance) {
    // Helper to get user ID from request
    function requireUser(req: FastifyRequest, reply: FastifyReply): string | null {
      const userId = getUserId(req);
      if (!userId) {
        reply.code(401).send({ error: 'Authentication required' });
        return null;
      }
      return userId;
    }

    // Helper to check doc access and set req.docRole
    function checkDocAccess(
      req: FastifyRequest,
      reply: FastifyReply,
      docId: string,
      requiredRole: 'viewer' | 'commenter' | 'editor' | 'owner'
    ): boolean {
      const role = getEffectiveDocRole(db, docId, req);
      if (!role) {
        reply.code(403).send({ error: 'Access denied' });
        return false;
      }
      if (!hasDocPermission(role, requiredRole)) {
        reply.code(403).send({ error: `Requires ${requiredRole} role or higher` });
        return false;
      }
      req.docRole = role;
      return true;
    }

    // Validate changeType
    function isValidChangeType(value: unknown): value is ChangeType {
      return value === 'insert' || value === 'delete' || value === 'replace';
    }

    // Validate status filter
    function isValidStatus(value: unknown): value is SuggestionStatus {
      return value === 'pending' || value === 'accepted' || value === 'rejected';
    }

    // -------------------------------------------
    // GET /docs/:id/suggestions
    // List all suggestions for a document
    // Requires: viewer access
    // -------------------------------------------
    app.get<{
      Params: { id: string };
      Querystring: { status?: string; authorId?: string; limit?: string; offset?: string };
    }>(
      '/docs/:id/suggestions',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check viewer+ access
        if (!checkDocAccess(req, reply, docId, 'viewer')) return;

        const options: ListSuggestionsOptions = {};

        if (req.query.status && isValidStatus(req.query.status)) {
          options.status = req.query.status;
        }

        if (req.query.authorId) {
          options.authorId = req.query.authorId;
        }

        if (req.query.limit) {
          const limit = parseInt(req.query.limit, 10);
          if (!isNaN(limit) && limit > 0) {
            options.limit = Math.min(limit, 100);
          }
        }

        if (req.query.offset) {
          const offset = parseInt(req.query.offset, 10);
          if (!isNaN(offset) && offset >= 0) {
            options.offset = offset;
          }
        }

        const suggestions = listSuggestions(docId, options);
        const pendingCount = getPendingCount(docId);

        return { suggestions, pendingCount };
      }
    );

    // -------------------------------------------
    // POST /docs/:id/suggestions
    // Create a new suggestion
    // Requires: commenter access
    // -------------------------------------------
    app.post<{
      Params: { id: string };
      Body: {
        changeType: string;
        fromPos: number;
        toPos: number;
        originalText?: string;
        proposedText?: string;
        comment?: string;
      };
    }>(
      '/docs/:id/suggestions',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check commenter+ access
        if (!checkDocAccess(req, reply, docId, 'commenter')) return;

        const { changeType, fromPos, toPos, originalText, proposedText, comment } = req.body;

        // Validate required fields
        if (!isValidChangeType(changeType)) {
          return reply.code(400).send({ error: 'changeType must be insert, delete, or replace' });
        }

        if (typeof fromPos !== 'number' || fromPos < 0) {
          return reply.code(400).send({ error: 'fromPos must be a non-negative number' });
        }

        if (typeof toPos !== 'number' || toPos < fromPos) {
          return reply.code(400).send({ error: 'toPos must be >= fromPos' });
        }

        // Validate content based on changeType
        if (changeType === 'insert' && !proposedText) {
          return reply.code(400).send({ error: 'proposedText is required for insert' });
        }

        if (changeType === 'delete' && !originalText) {
          return reply.code(400).send({ error: 'originalText is required for delete' });
        }

        if (changeType === 'replace' && (!originalText || !proposedText)) {
          return reply.code(400).send({ error: 'originalText and proposedText are required for replace' });
        }

        const params: CreateSuggestionParams = {
          docId,
          authorId: userId,
          changeType: changeType as ChangeType,
          fromPos,
          toPos,
          originalText: originalText ?? null,
          proposedText: proposedText ?? null,
          comment: comment?.trim() ?? null,
        };

        try {
          const suggestion = createSuggestion(params);

          if (!suggestion) {
            return reply.code(400).send({ error: 'Failed to create suggestion' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'suggestion:create',
              targetType: 'suggestion',
              targetId: suggestion.id.toString(),
              details: { docId, changeType, fromPos, toPos },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'suggestion',
              action: 'created',
              docId,
              suggestionId: suggestion.id,
              authorId: userId,
              changeType: changeType as ChangeType,
              status: 'pending',
              ts: Date.now(),
            });
          }

          return reply.code(201).send(suggestion);
        } catch (err: any) {
          req.log.error({ err }, 'Failed to create suggestion');
          return reply.code(500).send({ error: 'Failed to create suggestion' });
        }
      }
    );

    // -------------------------------------------
    // GET /suggestions/:id
    // Get a single suggestion
    // Requires: viewer access on the doc
    // -------------------------------------------
    app.get<{ Params: { id: string } }>(
      '/suggestions/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const suggestionId = parseInt(req.params.id, 10);
        if (isNaN(suggestionId)) {
          return reply.code(400).send({ error: 'Invalid suggestion ID' });
        }

        const suggestion = getSuggestion(suggestionId);
        if (!suggestion) {
          return reply.code(404).send({ error: 'Suggestion not found' });
        }

        // Check viewer+ access on the doc
        if (!checkDocAccess(req, reply, suggestion.docId, 'viewer')) return;

        return suggestion;
      }
    );

    // -------------------------------------------
    // PATCH /suggestions/:id
    // Update a suggestion's comment
    // Requires: commenter access (own suggestion only, pending only)
    // -------------------------------------------
    app.patch<{
      Params: { id: string };
      Body: { comment?: string };
    }>(
      '/suggestions/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const suggestionId = parseInt(req.params.id, 10);
        if (isNaN(suggestionId)) {
          return reply.code(400).send({ error: 'Invalid suggestion ID' });
        }

        const existing = getSuggestion(suggestionId);
        if (!existing) {
          return reply.code(404).send({ error: 'Suggestion not found' });
        }

        // Check commenter+ access on the doc
        if (!checkDocAccess(req, reply, existing.docId, 'commenter')) return;

        // Only author can edit their own suggestion
        if (existing.authorId !== userId) {
          return reply.code(403).send({ error: 'Can only edit your own suggestions' });
        }

        // Can only edit pending suggestions
        if (existing.status !== 'pending') {
          return reply.code(400).send({ error: 'Can only edit pending suggestions' });
        }

        const comment = req.body?.comment?.trim() ?? null;

        try {
          const updated = updateSuggestionComment(suggestionId, comment);

          if (!updated) {
            return reply.code(404).send({ error: 'Suggestion not found or not pending' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(existing.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'suggestion:update',
              targetType: 'suggestion',
              targetId: suggestionId.toString(),
              details: { docId: existing.docId },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'suggestion',
              action: 'updated',
              docId: existing.docId,
              suggestionId,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return updated;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to update suggestion');
          return reply.code(500).send({ error: 'Failed to update suggestion' });
        }
      }
    );

    // -------------------------------------------
    // DELETE /suggestions/:id
    // Delete a suggestion
    // Requires: commenter+ (own) or editor+ (any)
    // -------------------------------------------
    app.delete<{ Params: { id: string } }>(
      '/suggestions/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const suggestionId = parseInt(req.params.id, 10);
        if (isNaN(suggestionId)) {
          return reply.code(400).send({ error: 'Invalid suggestion ID' });
        }

        const existing = getSuggestion(suggestionId);
        if (!existing) {
          return reply.code(404).send({ error: 'Suggestion not found' });
        }

        // Get user's role on the doc
        const role = getEffectiveDocRole(db, existing.docId, req);
        if (!role) {
          return reply.code(403).send({ error: 'Access denied' });
        }

        // Check if user can delete: own suggestion with commenter+ OR any suggestion with editor+
        const isOwn = existing.authorId === userId;
        const hasCommenterAccess = hasDocPermission(role, 'commenter');
        const hasEditorAccess = hasDocPermission(role, 'editor');

        if (!((isOwn && hasCommenterAccess) || hasEditorAccess)) {
          return reply.code(403).send({ error: 'Can only delete your own suggestions, or requires editor role' });
        }

        try {
          const deleted = deleteSuggestion(suggestionId);

          if (!deleted) {
            return reply.code(404).send({ error: 'Suggestion not found' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(existing.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'suggestion:delete',
              targetType: 'suggestion',
              targetId: suggestionId.toString(),
              details: { docId: existing.docId, deletedOwnSuggestion: isOwn },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'suggestion',
              action: 'deleted',
              docId: existing.docId,
              suggestionId,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return reply.code(204).send();
        } catch (err: any) {
          req.log.error({ err }, 'Failed to delete suggestion');
          return reply.code(500).send({ error: 'Failed to delete suggestion' });
        }
      }
    );

    // -------------------------------------------
    // POST /suggestions/:id/accept
    // Accept a suggestion
    // Requires: editor access
    // -------------------------------------------
    app.post<{ Params: { id: string } }>(
      '/suggestions/:id/accept',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const suggestionId = parseInt(req.params.id, 10);
        if (isNaN(suggestionId)) {
          return reply.code(400).send({ error: 'Invalid suggestion ID' });
        }

        const suggestion = getSuggestion(suggestionId);
        if (!suggestion) {
          return reply.code(404).send({ error: 'Suggestion not found' });
        }

        // Check editor+ access
        if (!checkDocAccess(req, reply, suggestion.docId, 'editor')) return;

        // Can only accept pending suggestions
        if (suggestion.status !== 'pending') {
          return reply.code(400).send({ error: 'Can only accept pending suggestions' });
        }

        try {
          const accepted = acceptSuggestion(suggestionId, userId);

          if (!accepted) {
            return reply.code(400).send({ error: 'Failed to accept suggestion' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(suggestion.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'suggestion:accept',
              targetType: 'suggestion',
              targetId: suggestionId.toString(),
              details: { docId: suggestion.docId, changeType: suggestion.changeType },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'suggestion',
              action: 'accepted',
              docId: suggestion.docId,
              suggestionId,
              authorId: userId,
              changeType: suggestion.changeType,
              status: 'accepted',
              ts: Date.now(),
            });
          }

          // Return updated suggestion
          const updated = getSuggestion(suggestionId);
          return { ok: true, suggestion: updated };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to accept suggestion');
          return reply.code(500).send({ error: 'Failed to accept suggestion' });
        }
      }
    );

    // -------------------------------------------
    // POST /suggestions/:id/reject
    // Reject a suggestion
    // Requires: editor access
    // -------------------------------------------
    app.post<{ Params: { id: string } }>(
      '/suggestions/:id/reject',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const suggestionId = parseInt(req.params.id, 10);
        if (isNaN(suggestionId)) {
          return reply.code(400).send({ error: 'Invalid suggestion ID' });
        }

        const suggestion = getSuggestion(suggestionId);
        if (!suggestion) {
          return reply.code(404).send({ error: 'Suggestion not found' });
        }

        // Check editor+ access
        if (!checkDocAccess(req, reply, suggestion.docId, 'editor')) return;

        // Can only reject pending suggestions
        if (suggestion.status !== 'pending') {
          return reply.code(400).send({ error: 'Can only reject pending suggestions' });
        }

        try {
          const rejected = rejectSuggestion(suggestionId, userId);

          if (!rejected) {
            return reply.code(400).send({ error: 'Failed to reject suggestion' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(suggestion.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'suggestion:reject',
              targetType: 'suggestion',
              targetId: suggestionId.toString(),
              details: { docId: suggestion.docId, changeType: suggestion.changeType },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'suggestion',
              action: 'rejected',
              docId: suggestion.docId,
              suggestionId,
              authorId: userId,
              changeType: suggestion.changeType,
              status: 'rejected',
              ts: Date.now(),
            });
          }

          // Return updated suggestion
          const updated = getSuggestion(suggestionId);
          return { ok: true, suggestion: updated };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to reject suggestion');
          return reply.code(500).send({ error: 'Failed to reject suggestion' });
        }
      }
    );

    // -------------------------------------------
    // POST /docs/:id/suggestions/accept-all
    // Accept all pending suggestions for a document
    // Requires: editor access
    // -------------------------------------------
    app.post<{ Params: { id: string } }>(
      '/docs/:id/suggestions/accept-all',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!checkDocAccess(req, reply, docId, 'editor')) return;

        try {
          const count = acceptAllPending(docId, userId);

          // Log audit event if doc is workspace-scoped and there were changes
          if (doc.workspaceId && count > 0) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'suggestion:accept_all',
              targetType: 'doc',
              targetId: docId,
              details: { count },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'suggestion',
              action: 'accepted_all',
              docId,
              authorId: userId,
              count,
              ts: Date.now(),
            });
          }

          return { ok: true, count };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to accept all suggestions');
          return reply.code(500).send({ error: 'Failed to accept all suggestions' });
        }
      }
    );

    // -------------------------------------------
    // POST /docs/:id/suggestions/reject-all
    // Reject all pending suggestions for a document
    // Requires: editor access
    // -------------------------------------------
    app.post<{ Params: { id: string } }>(
      '/docs/:id/suggestions/reject-all',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const docId = req.params.id;

        // Check doc exists
        const doc = getDoc(docId);
        if (!doc) {
          return reply.code(404).send({ error: 'Document not found' });
        }

        // Check editor+ access
        if (!checkDocAccess(req, reply, docId, 'editor')) return;

        try {
          const count = rejectAllPending(docId, userId);

          // Log audit event if doc is workspace-scoped and there were changes
          if (doc.workspaceId && count > 0) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'suggestion:reject_all',
              targetType: 'doc',
              targetId: docId,
              details: { count },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'suggestion',
              action: 'rejected_all',
              docId,
              authorId: userId,
              count,
              ts: Date.now(),
            });
          }

          return { ok: true, count };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to reject all suggestions');
          return reply.code(500).send({ error: 'Failed to reject all suggestions' });
        }
      }
    );
  };
}
