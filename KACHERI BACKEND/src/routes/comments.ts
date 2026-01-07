// KACHERI BACKEND/src/routes/comments.ts
// REST endpoints for document comments with threading and mentions.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from 'better-sqlite3';
import {
  createComment,
  getComment,
  listComments,
  updateComment,
  deleteComment,
  resolveThread,
  reopenThread,
  type CreateCommentParams,
  type ListCommentsOptions,
} from '../store/comments';
import { getDoc } from '../store/docs';
import { logAuditEvent } from '../store/audit';
import { hasDocPermission } from '../store/docPermissions';
import {
  getEffectiveDocRole,
  getUserId,
} from '../workspace/middleware';
import { wsBroadcast, broadcastToUser } from '../realtime/globalHub';
import { createNotification } from '../store/notifications';

export function createCommentRoutes(db: Database) {
  return async function commentRoutes(app: FastifyInstance) {
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

    // -------------------------------------------
    // GET /docs/:id/comments
    // List all comments for a document
    // Requires: viewer access
    // -------------------------------------------
    app.get<{
      Params: { id: string };
      Querystring: { includeDeleted?: string; includeResolved?: string; threadId?: string };
    }>(
      '/docs/:id/comments',
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

        const options: ListCommentsOptions = {
          includeDeleted: req.query.includeDeleted === 'true',
          includeResolved: req.query.includeResolved !== 'false', // default true
          threadId: req.query.threadId,
        };

        const comments = listComments(docId, options);
        return { comments };
      }
    );

    // -------------------------------------------
    // POST /docs/:id/comments
    // Create a new comment
    // Requires: commenter access
    // -------------------------------------------
    app.post<{
      Params: { id: string };
      Body: {
        content: string;
        parentId?: number;
        anchorFrom?: number;
        anchorTo?: number;
        anchorText?: string;
        mentions?: string[];
      };
    }>(
      '/docs/:id/comments',
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

        const body = req.body ?? {};
        const content = (body.content ?? '').toString().trim();

        if (!content) {
          return reply.code(400).send({ error: 'content is required' });
        }

        const params: CreateCommentParams = {
          docId,
          authorId: userId,
          content,
          parentId: body.parentId ?? null,
          anchorFrom: body.anchorFrom ?? null,
          anchorTo: body.anchorTo ?? null,
          anchorText: body.anchorText ?? null,
          mentions: body.mentions ?? [],
        };

        try {
          const comment = createComment(params);

          if (!comment) {
            return reply.code(400).send({ error: 'Failed to create comment. Parent may not exist.' });
          }

          // Log audit event if doc is workspace-scoped
          if (doc.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'comment:create',
              targetType: 'comment',
              targetId: comment.id.toString(),
              details: { docId, threadId: comment.threadId, parentId: comment.parentId },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'comment',
              action: 'created',
              docId,
              commentId: comment.id,
              threadId: comment.threadId,
              authorId: userId,
              content: comment.content,
              ts: Date.now(),
            });

            // Create notifications for mentions
            const mentions = body.mentions ?? [];
            for (const mentionedUserId of mentions) {
              if (mentionedUserId === userId) continue; // Don't notify self
              const notification = createNotification({
                userId: mentionedUserId,
                workspaceId: doc.workspaceId,
                type: 'mention',
                title: 'You were mentioned in a comment',
                body: content.slice(0, 100),
                linkType: 'comment',
                linkId: comment.id.toString(),
                actorId: userId,
              });
              if (notification) {
                broadcastToUser(mentionedUserId, {
                  type: 'notification',
                  notificationId: notification.id,
                  userId: mentionedUserId,
                  notificationType: 'mention',
                  title: notification.title,
                  ts: Date.now(),
                });
              }
            }

            // Create notification for thread author if this is a reply
            if (comment.parentId) {
              const parentComment = getComment(comment.parentId);
              if (parentComment && parentComment.authorId !== userId && !mentions.includes(parentComment.authorId)) {
                const notification = createNotification({
                  userId: parentComment.authorId,
                  workspaceId: doc.workspaceId,
                  type: 'comment_reply',
                  title: 'Someone replied to your comment',
                  body: content.slice(0, 100),
                  linkType: 'comment',
                  linkId: comment.id.toString(),
                  actorId: userId,
                });
                if (notification) {
                  broadcastToUser(parentComment.authorId, {
                    type: 'notification',
                    notificationId: notification.id,
                    userId: parentComment.authorId,
                    notificationType: 'comment_reply',
                    title: notification.title,
                    ts: Date.now(),
                  });
                }
              }
            }
          }

          return reply.code(201).send(comment);
        } catch (err: any) {
          req.log.error({ err }, 'Failed to create comment');
          return reply.code(500).send({ error: 'Failed to create comment' });
        }
      }
    );

    // -------------------------------------------
    // GET /comments/:id
    // Get a single comment
    // Requires: viewer access on the doc
    // -------------------------------------------
    app.get<{ Params: { id: string } }>(
      '/comments/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const commentId = parseInt(req.params.id, 10);
        if (isNaN(commentId)) {
          return reply.code(400).send({ error: 'Invalid comment ID' });
        }

        const comment = getComment(commentId);
        if (!comment) {
          return reply.code(404).send({ error: 'Comment not found' });
        }

        // Check viewer+ access on the doc
        if (!checkDocAccess(req, reply, comment.docId, 'viewer')) return;

        return comment;
      }
    );

    // -------------------------------------------
    // PATCH /comments/:id
    // Update a comment's content
    // Requires: commenter access (own comment only)
    // -------------------------------------------
    app.patch<{
      Params: { id: string };
      Body: { content: string };
    }>(
      '/comments/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const commentId = parseInt(req.params.id, 10);
        if (isNaN(commentId)) {
          return reply.code(400).send({ error: 'Invalid comment ID' });
        }

        const existing = getComment(commentId);
        if (!existing) {
          return reply.code(404).send({ error: 'Comment not found' });
        }

        // Check commenter+ access on the doc
        if (!checkDocAccess(req, reply, existing.docId, 'commenter')) return;

        // Only author can edit their own comment
        if (existing.authorId !== userId) {
          return reply.code(403).send({ error: 'Can only edit your own comments' });
        }

        const body = req.body ?? {};
        const content = (body.content ?? '').toString().trim();

        if (!content) {
          return reply.code(400).send({ error: 'content is required' });
        }

        try {
          const updated = updateComment(commentId, content);

          if (!updated) {
            return reply.code(404).send({ error: 'Comment not found' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(existing.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'comment:update',
              targetType: 'comment',
              targetId: commentId.toString(),
              details: { docId: existing.docId },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'comment',
              action: 'updated',
              docId: existing.docId,
              commentId,
              threadId: existing.threadId,
              authorId: userId,
              content,
              ts: Date.now(),
            });
          }

          return updated;
        } catch (err: any) {
          req.log.error({ err }, 'Failed to update comment');
          return reply.code(500).send({ error: 'Failed to update comment' });
        }
      }
    );

    // -------------------------------------------
    // DELETE /comments/:id
    // Soft delete a comment
    // Requires: commenter+ (own) or editor+ (any)
    // -------------------------------------------
    app.delete<{ Params: { id: string } }>(
      '/comments/:id',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const commentId = parseInt(req.params.id, 10);
        if (isNaN(commentId)) {
          return reply.code(400).send({ error: 'Invalid comment ID' });
        }

        const existing = getComment(commentId);
        if (!existing) {
          return reply.code(404).send({ error: 'Comment not found' });
        }

        // Get user's role on the doc
        const role = getEffectiveDocRole(db, existing.docId, req);
        if (!role) {
          return reply.code(403).send({ error: 'Access denied' });
        }

        // Check if user can delete: own comment with commenter+ OR any comment with editor+
        const isOwn = existing.authorId === userId;
        const hasCommenterAccess = hasDocPermission(role, 'commenter');
        const hasEditorAccess = hasDocPermission(role, 'editor');

        if (!((isOwn && hasCommenterAccess) || hasEditorAccess)) {
          return reply.code(403).send({ error: 'Can only delete your own comments, or requires editor role' });
        }

        try {
          const deleted = deleteComment(commentId);

          if (!deleted) {
            return reply.code(404).send({ error: 'Comment not found' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(existing.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'comment:delete',
              targetType: 'comment',
              targetId: commentId.toString(),
              details: { docId: existing.docId, deletedOwnComment: isOwn },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'comment',
              action: 'deleted',
              docId: existing.docId,
              commentId,
              threadId: existing.threadId,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return reply.code(204).send();
        } catch (err: any) {
          req.log.error({ err }, 'Failed to delete comment');
          return reply.code(500).send({ error: 'Failed to delete comment' });
        }
      }
    );

    // -------------------------------------------
    // POST /comments/:id/resolve
    // Resolve a thread
    // Requires: commenter access
    // -------------------------------------------
    app.post<{ Params: { id: string } }>(
      '/comments/:id/resolve',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const commentId = parseInt(req.params.id, 10);
        if (isNaN(commentId)) {
          return reply.code(400).send({ error: 'Invalid comment ID' });
        }

        const comment = getComment(commentId);
        if (!comment) {
          return reply.code(404).send({ error: 'Comment not found' });
        }

        // Check commenter+ access
        if (!checkDocAccess(req, reply, comment.docId, 'commenter')) return;

        // Need the threadId
        if (!comment.threadId) {
          return reply.code(400).send({ error: 'Comment has no thread' });
        }

        try {
          const resolved = resolveThread(comment.threadId, userId);

          if (!resolved) {
            return reply.code(400).send({ error: 'Failed to resolve thread' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(comment.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'comment:resolve',
              targetType: 'comment',
              targetId: commentId.toString(),
              details: { docId: comment.docId, threadId: comment.threadId },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'comment',
              action: 'resolved',
              docId: comment.docId,
              commentId,
              threadId: comment.threadId,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return { ok: true, threadId: comment.threadId };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to resolve thread');
          return reply.code(500).send({ error: 'Failed to resolve thread' });
        }
      }
    );

    // -------------------------------------------
    // POST /comments/:id/reopen
    // Reopen a resolved thread
    // Requires: commenter access
    // -------------------------------------------
    app.post<{ Params: { id: string } }>(
      '/comments/:id/reopen',
      async (req, reply) => {
        const userId = requireUser(req, reply);
        if (!userId) return;

        const commentId = parseInt(req.params.id, 10);
        if (isNaN(commentId)) {
          return reply.code(400).send({ error: 'Invalid comment ID' });
        }

        const comment = getComment(commentId);
        if (!comment) {
          return reply.code(404).send({ error: 'Comment not found' });
        }

        // Check commenter+ access
        if (!checkDocAccess(req, reply, comment.docId, 'commenter')) return;

        // Need the threadId
        if (!comment.threadId) {
          return reply.code(400).send({ error: 'Comment has no thread' });
        }

        try {
          const reopened = reopenThread(comment.threadId);

          if (!reopened) {
            return reply.code(400).send({ error: 'Failed to reopen thread' });
          }

          // Log audit event if doc is workspace-scoped
          const doc = getDoc(comment.docId);
          if (doc?.workspaceId) {
            logAuditEvent({
              workspaceId: doc.workspaceId,
              actorId: userId,
              action: 'comment:reopen',
              targetType: 'comment',
              targetId: commentId.toString(),
              details: { docId: comment.docId, threadId: comment.threadId },
            });

            // Broadcast to workspace
            wsBroadcast(doc.workspaceId, {
              type: 'comment',
              action: 'reopened',
              docId: comment.docId,
              commentId,
              threadId: comment.threadId,
              authorId: userId,
              ts: Date.now(),
            });
          }

          return { ok: true, threadId: comment.threadId };
        } catch (err: any) {
          req.log.error({ err }, 'Failed to reopen thread');
          return reply.code(500).send({ error: 'Failed to reopen thread' });
        }
      }
    );
  };
}
