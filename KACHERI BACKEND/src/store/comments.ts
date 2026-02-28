// KACHERI BACKEND/src/store/comments.ts
// Document comment store with CRUD operations, threading, and mentions.

import { db } from '../db';
import { nanoid } from 'nanoid';

// ============================================
// Types
// ============================================

export interface Comment {
  id: number;
  docId: string;
  threadId: string | null;
  parentId: number | null;
  authorId: string;
  content: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorText: string | null;
  resolvedAt: number | null;
  resolvedBy: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

// API-friendly version with ISO dates and mentions
export interface CommentMeta {
  id: number;
  docId: string;
  threadId: string | null;
  parentId: number | null;
  authorId: string;
  content: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorText: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  mentions: string[];
}

// Internal row type from SQLite
interface CommentRow {
  id: number;
  doc_id: string;
  thread_id: string | null;
  parent_id: number | null;
  author_id: string;
  content: string;
  anchor_from: number | null;
  anchor_to: number | null;
  anchor_text: string | null;
  resolved_at: number | null;
  resolved_by: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface MentionRow {
  user_id: string;
}

// Create comment params
export interface CreateCommentParams {
  docId: string;
  authorId: string;
  content: string;
  parentId?: number | null;
  anchorFrom?: number | null;
  anchorTo?: number | null;
  anchorText?: string | null;
  mentions?: string[];
}

// List comments options
export interface ListCommentsOptions {
  includeDeleted?: boolean;
  includeResolved?: boolean;
  threadId?: string;
  // Filter options (Phase 2 — Comment Filters)
  authorId?: string;
  mentionsUser?: string;
  unresolvedOnly?: boolean;
  from?: number;       // epoch ms — comments created on or after
  to?: number;         // epoch ms — comments created on or before
  search?: string;     // case-insensitive substring match on content
  limit?: number;      // default 100, max 200
  offset?: number;     // default 0
  sortBy?: 'created_at_asc' | 'created_at_desc';
}

// List comments result with total count for pagination
export interface ListCommentsResult {
  comments: CommentMeta[];
  total: number;
}

// ============================================
// Row Conversion
// ============================================

function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    docId: row.doc_id,
    threadId: row.thread_id,
    parentId: row.parent_id,
    authorId: row.author_id,
    content: row.content,
    anchorFrom: row.anchor_from,
    anchorTo: row.anchor_to,
    anchorText: row.anchor_text,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function rowToCommentMeta(row: CommentRow, mentions: string[]): CommentMeta {
  return {
    id: row.id,
    docId: row.doc_id,
    threadId: row.thread_id,
    parentId: row.parent_id,
    authorId: row.author_id,
    content: row.content,
    anchorFrom: row.anchor_from,
    anchorTo: row.anchor_to,
    anchorText: row.anchor_text,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    resolvedBy: row.resolved_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    mentions,
  };
}

// ============================================
// Mention Operations
// ============================================

/**
 * Add a mention to a comment.
 */
export async function addMention(commentId: number, userId: string): Promise<void> {
  try {
    await db.run(`
      INSERT INTO comment_mentions (comment_id, user_id, created_at)
      VALUES (?, ?, ?)
    `, [commentId, userId, Date.now()]);
  } catch (err) {
    console.error('[comments] Failed to add mention:', err);
  }
}

/**
 * Get all mentions for a comment.
 */
export async function getMentions(commentId: number): Promise<string[]> {
  try {
    const rows = await db.queryAll<MentionRow>(`
      SELECT user_id
      FROM comment_mentions
      WHERE comment_id = ?
    `, [commentId]);

    return rows.map(r => r.user_id);
  } catch (err) {
    console.error('[comments] Failed to get mentions:', err);
    return [];
  }
}

/**
 * Delete all mentions for a comment.
 */
async function deleteMentions(commentId: number): Promise<void> {
  try {
    await db.run(`
      DELETE FROM comment_mentions
      WHERE comment_id = ?
    `, [commentId]);
  } catch (err) {
    console.error('[comments] Failed to delete mentions:', err);
  }
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new comment.
 * For root comments: generates a new threadId.
 * For replies: inherits threadId from parent.
 */
export async function createComment(params: CreateCommentParams): Promise<CommentMeta | null> {
  const {
    docId,
    authorId,
    content,
    parentId = null,
    anchorFrom = null,
    anchorTo = null,
    anchorText = null,
    mentions = [],
  } = params;

  const now = Date.now();
  let threadId: string | null = null;

  // If this is a reply, get the parent's threadId
  if (parentId) {
    const parent = await getCommentById(parentId);
    if (!parent) {
      console.error('[comments] Parent comment not found:', parentId);
      return null;
    }
    threadId = parent.threadId;
  } else {
    // Root comment: generate new thread ID
    threadId = nanoid(12);
  }

  try {
    const result = await db.run(`
      INSERT INTO comments (
        doc_id, thread_id, parent_id, author_id, content,
        anchor_from, anchor_to, anchor_text,
        resolved_at, resolved_by, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)
      RETURNING id
    `, [
      docId, threadId, parentId, authorId, content,
      anchorFrom, anchorTo, anchorText,
      now, now,
    ]);

    const commentId = result.lastInsertRowid as number;

    // Add mentions
    for (const userId of mentions) {
      await addMention(commentId, userId);
    }

    return getComment(commentId);
  } catch (err) {
    console.error('[comments] Failed to create comment:', err);
    return null;
  }
}

/**
 * Get a single comment by ID (internal, returns raw Comment).
 */
async function getCommentById(id: number): Promise<Comment | null> {
  const row = await db.queryOne<CommentRow>(`
    SELECT id, doc_id, thread_id, parent_id, author_id, content,
           anchor_from, anchor_to, anchor_text,
           resolved_at, resolved_by, created_at, updated_at, deleted_at
    FROM comments
    WHERE id = ?
  `, [id]);

  return row ? rowToComment(row) : null;
}

/**
 * Get a single comment by ID (API version with mentions).
 */
export async function getComment(id: number): Promise<CommentMeta | null> {
  const row = await db.queryOne<CommentRow>(`
    SELECT id, doc_id, thread_id, parent_id, author_id, content,
           anchor_from, anchor_to, anchor_text,
           resolved_at, resolved_by, created_at, updated_at, deleted_at
    FROM comments
    WHERE id = ? AND deleted_at IS NULL
  `, [id]);

  if (!row) return null;

  const mentions = await getMentions(row.id);
  return rowToCommentMeta(row, mentions);
}

/**
 * List all comments for a document with optional filters and pagination.
 */
export async function listComments(docId: string, options: ListCommentsOptions = {}): Promise<ListCommentsResult> {
  const {
    includeDeleted = false,
    includeResolved: includeResolvedOpt = true,
    threadId,
    authorId,
    mentionsUser,
    unresolvedOnly = false,
    from,
    to,
    search,
    limit: rawLimit = 100,
    offset = 0,
    sortBy = 'created_at_asc',
  } = options;

  // unresolvedOnly takes precedence over includeResolved
  const includeResolved = unresolvedOnly ? false : includeResolvedOpt;
  const limit = Math.min(Math.max(rawLimit, 1), 200);

  // Build WHERE clauses
  const whereClauses: string[] = ['doc_id = ?'];
  const params: (string | number)[] = [docId];

  if (!includeDeleted) {
    whereClauses.push('deleted_at IS NULL');
  }

  if (!includeResolved) {
    whereClauses.push('resolved_at IS NULL');
  }

  if (threadId) {
    whereClauses.push('thread_id = ?');
    params.push(threadId);
  }

  if (authorId) {
    whereClauses.push('author_id = ?');
    params.push(authorId);
  }

  if (mentionsUser) {
    whereClauses.push('id IN (SELECT comment_id FROM comment_mentions WHERE user_id = ?)');
    params.push(mentionsUser);
  }

  if (from !== undefined) {
    whereClauses.push('created_at >= ?');
    params.push(from);
  }

  if (to !== undefined) {
    whereClauses.push('created_at <= ?');
    params.push(to);
  }

  if (search) {
    whereClauses.push('content LIKE ?');
    params.push(`%${search}%`);
  }

  const whereStr = whereClauses.join(' AND ');
  const orderDirection = sortBy === 'created_at_desc' ? 'DESC' : 'ASC';

  try {
    // Count query (same WHERE, no LIMIT/OFFSET)
    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM comments WHERE ${whereStr}`,
      [...params]
    );
    const total = countRow?.count ?? 0;

    // Data query with pagination
    const rows = await db.queryAll<CommentRow>(`
      SELECT id, doc_id, thread_id, parent_id, author_id, content,
             anchor_from, anchor_to, anchor_text,
             resolved_at, resolved_by, created_at, updated_at, deleted_at
      FROM comments
      WHERE ${whereStr}
      ORDER BY created_at ${orderDirection}
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const comments: CommentMeta[] = [];
    for (const row of rows) {
      const mentions = await getMentions(row.id);
      comments.push(rowToCommentMeta(row, mentions));
    }

    return { comments, total };
  } catch (err) {
    console.error('[comments] Failed to list comments:', err);
    return { comments: [], total: 0 };
  }
}

/**
 * Update a comment's content.
 */
export async function updateComment(id: number, content: string): Promise<CommentMeta | null> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE comments
      SET content = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `, [content, now, id]);

    if (info.changes === 0) {
      return null;
    }

    return getComment(id);
  } catch (err) {
    console.error('[comments] Failed to update comment:', err);
    return null;
  }
}

/**
 * Soft delete a comment.
 */
export async function deleteComment(id: number): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE comments
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `, [now, now, id]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[comments] Failed to delete comment:', err);
    return false;
  }
}

/**
 * Permanently delete a comment and its mentions.
 * Used when a document is permanently deleted.
 */
export async function permanentlyDeleteComment(id: number): Promise<boolean> {
  try {
    await deleteMentions(id);

    const info = await db.run(`
      DELETE FROM comments
      WHERE id = ?
    `, [id]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[comments] Failed to permanently delete comment:', err);
    return false;
  }
}

/**
 * Delete all comments for a document (permanent).
 * Used when a document is permanently deleted.
 */
export async function deleteAllDocComments(docId: string): Promise<number> {
  try {
    // First delete all mentions for comments in this doc
    await db.run(`
      DELETE FROM comment_mentions
      WHERE comment_id IN (
        SELECT id FROM comments WHERE doc_id = ?
      )
    `, [docId]);

    // Then delete all comments
    const info = await db.run(`
      DELETE FROM comments
      WHERE doc_id = ?
    `, [docId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[comments] Failed to delete all doc comments:', err);
    return 0;
  }
}

// ============================================
// Thread Resolution
// ============================================

/**
 * Get the root comment of a thread.
 */
async function getThreadRoot(threadId: string): Promise<Comment | null> {
  const row = await db.queryOne<CommentRow>(`
    SELECT id, doc_id, thread_id, parent_id, author_id, content,
           anchor_from, anchor_to, anchor_text,
           resolved_at, resolved_by, created_at, updated_at, deleted_at
    FROM comments
    WHERE thread_id = ? AND parent_id IS NULL
  `, [threadId]);

  return row ? rowToComment(row) : null;
}

/**
 * Resolve a thread (marks the root comment as resolved).
 */
export async function resolveThread(threadId: string, userId: string): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE comments
      SET resolved_at = ?, resolved_by = ?, updated_at = ?
      WHERE thread_id = ? AND parent_id IS NULL AND deleted_at IS NULL
    `, [now, userId, now, threadId]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[comments] Failed to resolve thread:', err);
    return false;
  }
}

/**
 * Bulk resolve threads for a document.
 * If threadIds is provided, resolves only those threads.
 * If threadIds is empty/undefined, resolves all unresolved threads.
 * Returns the list of threadIds that were actually resolved (skips already-resolved).
 */
export async function bulkResolveThreads(
  docId: string,
  userId: string,
  threadIds?: string[]
): Promise<{ resolved: number; threadIds: string[] }> {
  const now = Date.now();

  try {
    if (threadIds && threadIds.length > 0) {
      // Resolve specific threads
      const placeholders = threadIds.map(() => '?').join(', ');

      // Get unresolved threadIds from the requested set
      const unresolvedRows = await db.queryAll<{ thread_id: string }>(`
        SELECT DISTINCT thread_id
        FROM comments
        WHERE doc_id = ? AND thread_id IN (${placeholders})
          AND parent_id IS NULL AND deleted_at IS NULL AND resolved_at IS NULL
      `, [docId, ...threadIds]);

      const unresolvedThreadIds = unresolvedRows.map(r => r.thread_id);

      if (unresolvedThreadIds.length === 0) {
        return { resolved: 0, threadIds: [] };
      }

      const unresolvedPlaceholders = unresolvedThreadIds.map(() => '?').join(', ');
      const info = await db.run(`
        UPDATE comments
        SET resolved_at = ?, resolved_by = ?, updated_at = ?
        WHERE doc_id = ? AND thread_id IN (${unresolvedPlaceholders})
          AND parent_id IS NULL AND deleted_at IS NULL AND resolved_at IS NULL
      `, [now, userId, now, docId, ...unresolvedThreadIds]);

      return { resolved: info.changes ?? 0, threadIds: unresolvedThreadIds };
    } else {
      // Resolve all unresolved threads in the document
      const unresolvedRows = await db.queryAll<{ thread_id: string }>(`
        SELECT DISTINCT thread_id
        FROM comments
        WHERE doc_id = ? AND parent_id IS NULL AND deleted_at IS NULL AND resolved_at IS NULL
      `, [docId]);

      const unresolvedThreadIds = unresolvedRows.map(r => r.thread_id);

      if (unresolvedThreadIds.length === 0) {
        return { resolved: 0, threadIds: [] };
      }

      const info = await db.run(`
        UPDATE comments
        SET resolved_at = ?, resolved_by = ?, updated_at = ?
        WHERE doc_id = ? AND parent_id IS NULL AND deleted_at IS NULL AND resolved_at IS NULL
      `, [now, userId, now, docId]);

      return { resolved: info.changes ?? 0, threadIds: unresolvedThreadIds };
    }
  } catch (err) {
    console.error('[comments] Failed to bulk resolve threads:', err);
    return { resolved: 0, threadIds: [] };
  }
}

/**
 * Reopen a resolved thread.
 */
export async function reopenThread(threadId: string): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE comments
      SET resolved_at = NULL, resolved_by = NULL, updated_at = ?
      WHERE thread_id = ? AND parent_id IS NULL AND deleted_at IS NULL
    `, [now, threadId]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[comments] Failed to reopen thread:', err);
    return false;
  }
}

/**
 * Check if a thread is resolved.
 */
export async function isThreadResolved(threadId: string): Promise<boolean> {
  const root = await getThreadRoot(threadId);
  return root?.resolvedAt !== null;
}

/**
 * Get comment count for a document.
 */
export async function getCommentCount(docId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM comments
      WHERE doc_id = ? AND deleted_at IS NULL
    `, [docId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error('[comments] Failed to get comment count:', err);
    return 0;
  }
}

/**
 * Get unresolved thread count for a document.
 */
export async function getUnresolvedThreadCount(docId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT thread_id) as count
      FROM comments
      WHERE doc_id = ? AND deleted_at IS NULL AND resolved_at IS NULL AND parent_id IS NULL
    `, [docId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error('[comments] Failed to get unresolved thread count:', err);
    return 0;
  }
}
