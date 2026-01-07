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
export function addMention(commentId: number, userId: string): void {
  try {
    db.prepare(`
      INSERT INTO comment_mentions (comment_id, user_id, created_at)
      VALUES (?, ?, ?)
    `).run(commentId, userId, Date.now());
  } catch (err) {
    console.error('[comments] Failed to add mention:', err);
  }
}

/**
 * Get all mentions for a comment.
 */
export function getMentions(commentId: number): string[] {
  try {
    const rows = db.prepare(`
      SELECT user_id
      FROM comment_mentions
      WHERE comment_id = ?
    `).all(commentId) as MentionRow[];

    return rows.map(r => r.user_id);
  } catch (err) {
    console.error('[comments] Failed to get mentions:', err);
    return [];
  }
}

/**
 * Delete all mentions for a comment.
 */
function deleteMentions(commentId: number): void {
  try {
    db.prepare(`
      DELETE FROM comment_mentions
      WHERE comment_id = ?
    `).run(commentId);
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
export function createComment(params: CreateCommentParams): CommentMeta | null {
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
    const parent = getCommentById(parentId);
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
    const result = db.prepare(`
      INSERT INTO comments (
        doc_id, thread_id, parent_id, author_id, content,
        anchor_from, anchor_to, anchor_text,
        resolved_at, resolved_by, created_at, updated_at, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)
    `).run(
      docId, threadId, parentId, authorId, content,
      anchorFrom, anchorTo, anchorText,
      now, now
    );

    const commentId = result.lastInsertRowid as number;

    // Add mentions
    for (const userId of mentions) {
      addMention(commentId, userId);
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
function getCommentById(id: number): Comment | null {
  const row = db.prepare(`
    SELECT id, doc_id, thread_id, parent_id, author_id, content,
           anchor_from, anchor_to, anchor_text,
           resolved_at, resolved_by, created_at, updated_at, deleted_at
    FROM comments
    WHERE id = ?
  `).get(id) as CommentRow | undefined;

  return row ? rowToComment(row) : null;
}

/**
 * Get a single comment by ID (API version with mentions).
 */
export function getComment(id: number): CommentMeta | null {
  const row = db.prepare(`
    SELECT id, doc_id, thread_id, parent_id, author_id, content,
           anchor_from, anchor_to, anchor_text,
           resolved_at, resolved_by, created_at, updated_at, deleted_at
    FROM comments
    WHERE id = ? AND deleted_at IS NULL
  `).get(id) as CommentRow | undefined;

  if (!row) return null;

  const mentions = getMentions(row.id);
  return rowToCommentMeta(row, mentions);
}

/**
 * List all comments for a document.
 */
export function listComments(docId: string, options: ListCommentsOptions = {}): CommentMeta[] {
  const {
    includeDeleted = false,
    includeResolved = true,
    threadId,
  } = options;

  let query = `
    SELECT id, doc_id, thread_id, parent_id, author_id, content,
           anchor_from, anchor_to, anchor_text,
           resolved_at, resolved_by, created_at, updated_at, deleted_at
    FROM comments
    WHERE doc_id = ?
  `;

  const params: (string | number)[] = [docId];

  if (!includeDeleted) {
    query += ` AND deleted_at IS NULL`;
  }

  if (!includeResolved) {
    query += ` AND resolved_at IS NULL`;
  }

  if (threadId) {
    query += ` AND thread_id = ?`;
    params.push(threadId);
  }

  query += ` ORDER BY created_at ASC`;

  try {
    const rows = db.prepare(query).all(...params) as CommentRow[];

    return rows.map(row => {
      const mentions = getMentions(row.id);
      return rowToCommentMeta(row, mentions);
    });
  } catch (err) {
    console.error('[comments] Failed to list comments:', err);
    return [];
  }
}

/**
 * Update a comment's content.
 */
export function updateComment(id: number, content: string): CommentMeta | null {
  const now = Date.now();

  try {
    const info = db.prepare(`
      UPDATE comments
      SET content = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(content, now, id);

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
export function deleteComment(id: number): boolean {
  const now = Date.now();

  try {
    const info = db.prepare(`
      UPDATE comments
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now, now, id);

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
export function permanentlyDeleteComment(id: number): boolean {
  try {
    deleteMentions(id);

    const info = db.prepare(`
      DELETE FROM comments
      WHERE id = ?
    `).run(id);

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
export function deleteAllDocComments(docId: string): number {
  try {
    // First delete all mentions for comments in this doc
    db.prepare(`
      DELETE FROM comment_mentions
      WHERE comment_id IN (
        SELECT id FROM comments WHERE doc_id = ?
      )
    `).run(docId);

    // Then delete all comments
    const info = db.prepare(`
      DELETE FROM comments
      WHERE doc_id = ?
    `).run(docId);

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
function getThreadRoot(threadId: string): Comment | null {
  const row = db.prepare(`
    SELECT id, doc_id, thread_id, parent_id, author_id, content,
           anchor_from, anchor_to, anchor_text,
           resolved_at, resolved_by, created_at, updated_at, deleted_at
    FROM comments
    WHERE thread_id = ? AND parent_id IS NULL
  `).get(threadId) as CommentRow | undefined;

  return row ? rowToComment(row) : null;
}

/**
 * Resolve a thread (marks the root comment as resolved).
 */
export function resolveThread(threadId: string, userId: string): boolean {
  const now = Date.now();

  try {
    const info = db.prepare(`
      UPDATE comments
      SET resolved_at = ?, resolved_by = ?, updated_at = ?
      WHERE thread_id = ? AND parent_id IS NULL AND deleted_at IS NULL
    `).run(now, userId, now, threadId);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[comments] Failed to resolve thread:', err);
    return false;
  }
}

/**
 * Reopen a resolved thread.
 */
export function reopenThread(threadId: string): boolean {
  const now = Date.now();

  try {
    const info = db.prepare(`
      UPDATE comments
      SET resolved_at = NULL, resolved_by = NULL, updated_at = ?
      WHERE thread_id = ? AND parent_id IS NULL AND deleted_at IS NULL
    `).run(now, threadId);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[comments] Failed to reopen thread:', err);
    return false;
  }
}

/**
 * Check if a thread is resolved.
 */
export function isThreadResolved(threadId: string): boolean {
  const root = getThreadRoot(threadId);
  return root?.resolvedAt !== null;
}

/**
 * Get comment count for a document.
 */
export function getCommentCount(docId: string): number {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM comments
      WHERE doc_id = ? AND deleted_at IS NULL
    `).get(docId) as { count: number };

    return row.count;
  } catch (err) {
    console.error('[comments] Failed to get comment count:', err);
    return 0;
  }
}

/**
 * Get unresolved thread count for a document.
 */
export function getUnresolvedThreadCount(docId: string): number {
  try {
    const row = db.prepare(`
      SELECT COUNT(DISTINCT thread_id) as count
      FROM comments
      WHERE doc_id = ? AND deleted_at IS NULL AND resolved_at IS NULL AND parent_id IS NULL
    `).get(docId) as { count: number };

    return row.count;
  } catch (err) {
    console.error('[comments] Failed to get unresolved thread count:', err);
    return 0;
  }
}
