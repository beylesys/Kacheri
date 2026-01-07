// KACHERI BACKEND/src/store/messages.ts
// Workspace message store with CRUD operations for persistent chat.

import { db } from '../db';

// ============================================
// Types
// ============================================

export interface Message {
  id: number;
  workspaceId: string;
  authorId: string;
  content: string;
  replyToId: number | null;
  editedAt: number | null;
  createdAt: number;
  deletedAt: number | null;
}

// API-friendly version with ISO dates
export interface MessageMeta {
  id: number;
  workspaceId: string;
  authorId: string;
  content: string;
  replyToId: number | null;
  editedAt: string | null;
  createdAt: string;
}

// Internal row type from SQLite
interface MessageRow {
  id: number;
  workspace_id: string;
  author_id: string;
  content: string;
  reply_to_id: number | null;
  edited_at: number | null;
  created_at: number;
  deleted_at: number | null;
}

// Create message params
export interface CreateMessageParams {
  workspaceId: string;
  authorId: string;
  content: string;
  replyToId?: number | null;
}

// List messages options
export interface ListMessagesOptions {
  limit?: number;      // Default 50, max 100
  before?: number;     // Cursor (message ID) for pagination
  after?: number;      // Cursor for loading newer messages
}

// ============================================
// Row Conversion
// ============================================

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    authorId: row.author_id,
    content: row.content,
    replyToId: row.reply_to_id,
    editedAt: row.edited_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function rowToMessageMeta(row: MessageRow): MessageMeta {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    authorId: row.author_id,
    content: row.content,
    replyToId: row.reply_to_id,
    editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new message in a workspace.
 */
export function createMessage(params: CreateMessageParams): MessageMeta | null {
  const {
    workspaceId,
    authorId,
    content,
    replyToId = null,
  } = params;

  const now = Date.now();

  // Validate replyToId if provided
  if (replyToId !== null) {
    const parent = getMessageById(replyToId);
    if (!parent || parent.workspaceId !== workspaceId) {
      console.error('[messages] Parent message not found or workspace mismatch:', replyToId);
      return null;
    }
  }

  try {
    const result = db.prepare(`
      INSERT INTO messages (
        workspace_id, author_id, content, reply_to_id,
        edited_at, created_at, deleted_at
      )
      VALUES (?, ?, ?, ?, NULL, ?, NULL)
    `).run(workspaceId, authorId, content, replyToId, now);

    const messageId = result.lastInsertRowid as number;
    return getMessage(messageId);
  } catch (err) {
    console.error('[messages] Failed to create message:', err);
    return null;
  }
}

/**
 * Get a single message by ID (internal, returns raw Message).
 */
function getMessageById(id: number): Message | null {
  try {
    const row = db.prepare(`
      SELECT id, workspace_id, author_id, content, reply_to_id,
             edited_at, created_at, deleted_at
      FROM messages
      WHERE id = ?
    `).get(id) as MessageRow | undefined;

    return row ? rowToMessage(row) : null;
  } catch (err) {
    console.error('[messages] Failed to get message by ID:', err);
    return null;
  }
}

/**
 * Get a single message by ID (API version).
 */
export function getMessage(id: number): MessageMeta | null {
  try {
    const row = db.prepare(`
      SELECT id, workspace_id, author_id, content, reply_to_id,
             edited_at, created_at, deleted_at
      FROM messages
      WHERE id = ? AND deleted_at IS NULL
    `).get(id) as MessageRow | undefined;

    return row ? rowToMessageMeta(row) : null;
  } catch (err) {
    console.error('[messages] Failed to get message:', err);
    return null;
  }
}

/**
 * List messages for a workspace with pagination.
 * Returns messages in chronological order (oldest first).
 * Use `before` cursor to load older messages.
 */
export function listMessages(
  workspaceId: string,
  options: ListMessagesOptions = {}
): { messages: MessageMeta[]; hasMore: boolean } {
  const {
    limit = 50,
    before,
    after,
  } = options;

  // Clamp limit to max 100
  const effectiveLimit = Math.min(Math.max(1, limit), 100);

  let query = `
    SELECT id, workspace_id, author_id, content, reply_to_id,
           edited_at, created_at, deleted_at
    FROM messages
    WHERE workspace_id = ? AND deleted_at IS NULL
  `;

  const params: (string | number)[] = [workspaceId];

  if (before !== undefined) {
    query += ` AND id < ?`;
    params.push(before);
  }

  if (after !== undefined) {
    query += ` AND id > ?`;
    params.push(after);
  }

  // Order by created_at DESC for pagination, then reverse for display
  query += ` ORDER BY id DESC LIMIT ?`;
  params.push(effectiveLimit + 1); // Fetch one extra to check hasMore

  try {
    const rows = db.prepare(query).all(...params) as MessageRow[];

    const hasMore = rows.length > effectiveLimit;
    const resultRows = hasMore ? rows.slice(0, effectiveLimit) : rows;

    // Reverse to get chronological order (oldest first)
    const messages = resultRows.reverse().map(rowToMessageMeta);

    return { messages, hasMore };
  } catch (err) {
    console.error('[messages] Failed to list messages:', err);
    return { messages: [], hasMore: false };
  }
}

/**
 * Update a message's content.
 * Only the author can update their own message.
 */
export function updateMessage(
  id: number,
  content: string,
  authorId: string
): MessageMeta | null {
  const now = Date.now();

  try {
    const info = db.prepare(`
      UPDATE messages
      SET content = ?, edited_at = ?
      WHERE id = ? AND author_id = ? AND deleted_at IS NULL
    `).run(content, now, id, authorId);

    if (info.changes === 0) {
      return null;
    }

    return getMessage(id);
  } catch (err) {
    console.error('[messages] Failed to update message:', err);
    return null;
  }
}

/**
 * Soft delete a message.
 * Only the author can delete their own message.
 */
export function deleteMessage(id: number, authorId: string): boolean {
  const now = Date.now();

  try {
    const info = db.prepare(`
      UPDATE messages
      SET deleted_at = ?
      WHERE id = ? AND author_id = ? AND deleted_at IS NULL
    `).run(now, id, authorId);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[messages] Failed to delete message:', err);
    return false;
  }
}

/**
 * Get message count for a workspace.
 */
export function getMessageCount(workspaceId: string): number {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE workspace_id = ? AND deleted_at IS NULL
    `).get(workspaceId) as { count: number };

    return row.count;
  } catch (err) {
    console.error('[messages] Failed to get message count:', err);
    return 0;
  }
}

/**
 * Delete all messages for a workspace (permanent).
 * Used when a workspace is deleted.
 */
export function deleteAllWorkspaceMessages(workspaceId: string): number {
  try {
    const info = db.prepare(`
      DELETE FROM messages
      WHERE workspace_id = ?
    `).run(workspaceId);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[messages] Failed to delete all workspace messages:', err);
    return 0;
  }
}

/**
 * Get unread message count for a user in a workspace.
 * (Placeholder for future read tracking feature)
 */
export function getUnreadCount(_workspaceId: string, _userId: string): number {
  // TODO: Implement read tracking with a separate table
  // For now, return 0 as we don't track read status
  return 0;
}
