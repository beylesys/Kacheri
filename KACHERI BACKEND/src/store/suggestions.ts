// KACHERI BACKEND/src/store/suggestions.ts
// Document suggestions store for track changes mode with CRUD operations.

import { db } from '../db';

// ============================================
// Types
// ============================================

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';
export type ChangeType = 'insert' | 'delete' | 'replace';

// Internal entity (timestamps as numbers)
export interface Suggestion {
  id: number;
  docId: string;
  authorId: string;
  status: SuggestionStatus;
  changeType: ChangeType;
  fromPos: number;
  toPos: number;
  originalText: string | null;
  proposedText: string | null;
  comment: string | null;
  resolvedBy: string | null;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// API-friendly version with ISO dates
export interface SuggestionMeta {
  id: number;
  docId: string;
  authorId: string;
  status: SuggestionStatus;
  changeType: ChangeType;
  fromPos: number;
  toPos: number;
  originalText: string | null;
  proposedText: string | null;
  comment: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Internal row type from SQLite
interface SuggestionRow {
  id: number;
  doc_id: string;
  author_id: string;
  status: string;
  change_type: string;
  from_pos: number;
  to_pos: number;
  original_text: string | null;
  proposed_text: string | null;
  comment: string | null;
  resolved_by: string | null;
  resolved_at: number | null;
  created_at: number;
  updated_at: number;
}

// Create suggestion params
export interface CreateSuggestionParams {
  docId: string;
  authorId: string;
  changeType: ChangeType;
  fromPos: number;
  toPos: number;
  originalText?: string | null;
  proposedText?: string | null;
  comment?: string | null;
}

// List suggestions options
export interface ListSuggestionsOptions {
  status?: SuggestionStatus;
  authorId?: string;
  changeType?: ChangeType;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

// List suggestions result (with total for pagination)
export interface ListSuggestionsResult {
  suggestions: SuggestionMeta[];
  total: number;
}

// ============================================
// Row Conversion
// ============================================

function rowToSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    docId: row.doc_id,
    authorId: row.author_id,
    status: row.status as SuggestionStatus,
    changeType: row.change_type as ChangeType,
    fromPos: row.from_pos,
    toPos: row.to_pos,
    originalText: row.original_text,
    proposedText: row.proposed_text,
    comment: row.comment,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSuggestionMeta(row: SuggestionRow): SuggestionMeta {
  return {
    id: row.id,
    docId: row.doc_id,
    authorId: row.author_id,
    status: row.status as SuggestionStatus,
    changeType: row.change_type as ChangeType,
    fromPos: row.from_pos,
    toPos: row.to_pos,
    originalText: row.original_text,
    proposedText: row.proposed_text,
    comment: row.comment,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new suggestion.
 */
export async function createSuggestion(params: CreateSuggestionParams): Promise<SuggestionMeta | null> {
  const {
    docId,
    authorId,
    changeType,
    fromPos,
    toPos,
    originalText = null,
    proposedText = null,
    comment = null,
  } = params;

  const now = Date.now();

  try {
    const result = await db.run(`
      INSERT INTO suggestions (
        doc_id, author_id, status, change_type,
        from_pos, to_pos, original_text, proposed_text, comment,
        resolved_by, resolved_at, created_at, updated_at
      )
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      RETURNING id
    `, [
      docId, authorId, changeType,
      fromPos, toPos, originalText, proposedText, comment,
      now, now
    ]);

    const suggestionId = result.lastInsertRowid as number;
    return await getSuggestion(suggestionId);
  } catch (err) {
    console.error('[suggestions] Failed to create suggestion:', err);
    return null;
  }
}

/**
 * Get a single suggestion by ID.
 */
export async function getSuggestion(id: number): Promise<SuggestionMeta | null> {
  try {
    const row = await db.queryOne<SuggestionRow>(`
      SELECT id, doc_id, author_id, status, change_type,
             from_pos, to_pos, original_text, proposed_text, comment,
             resolved_by, resolved_at, created_at, updated_at
      FROM suggestions
      WHERE id = ?
    `, [id]);

    return row ? rowToSuggestionMeta(row) : null;
  } catch (err) {
    console.error('[suggestions] Failed to get suggestion:', err);
    return null;
  }
}

/**
 * List all suggestions for a document.
 */
export async function listSuggestions(docId: string, options: ListSuggestionsOptions = {}): Promise<ListSuggestionsResult> {
  const {
    status,
    authorId,
    changeType,
    from,
    to,
    limit = 100,
    offset = 0,
  } = options;

  let whereClause = ` WHERE doc_id = ?`;
  const whereParams: (string | number)[] = [docId];

  if (status) {
    whereClause += ` AND status = ?`;
    whereParams.push(status);
  }

  if (authorId) {
    whereClause += ` AND author_id = ?`;
    whereParams.push(authorId);
  }

  if (changeType) {
    whereClause += ` AND change_type = ?`;
    whereParams.push(changeType);
  }

  if (from !== undefined) {
    whereClause += ` AND created_at >= ?`;
    whereParams.push(from);
  }

  if (to !== undefined) {
    whereClause += ` AND created_at <= ?`;
    whereParams.push(to);
  }

  try {
    // Count query (same WHERE, no LIMIT/OFFSET)
    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM suggestions${whereClause}`,
      whereParams
    );
    const total = countRow?.count ?? 0;

    // Data query with pagination
    const dataQuery = `
      SELECT id, doc_id, author_id, status, change_type,
             from_pos, to_pos, original_text, proposed_text, comment,
             resolved_by, resolved_at, created_at, updated_at
      FROM suggestions${whereClause}
      ORDER BY from_pos ASC, created_at ASC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.queryAll<SuggestionRow>(dataQuery, [...whereParams, limit, offset]);
    return { suggestions: rows.map(rowToSuggestionMeta), total };
  } catch (err) {
    console.error('[suggestions] Failed to list suggestions:', err);
    return { suggestions: [], total: 0 };
  }
}

/**
 * Update a suggestion's comment.
 */
export async function updateSuggestionComment(id: number, comment: string | null): Promise<SuggestionMeta | null> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE suggestions
      SET comment = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `, [comment, now, id]);

    if (info.changes === 0) {
      return null;
    }

    return await getSuggestion(id);
  } catch (err) {
    console.error('[suggestions] Failed to update suggestion comment:', err);
    return null;
  }
}

/**
 * Delete a suggestion.
 */
export async function deleteSuggestion(id: number): Promise<boolean> {
  try {
    const info = await db.run(`
      DELETE FROM suggestions
      WHERE id = ?
    `, [id]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[suggestions] Failed to delete suggestion:', err);
    return false;
  }
}

// ============================================
// Accept/Reject Operations
// ============================================

/**
 * Accept a suggestion.
 */
export async function acceptSuggestion(id: number, userId: string): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE suggestions
      SET status = 'accepted', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `, [userId, now, now, id]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[suggestions] Failed to accept suggestion:', err);
    return false;
  }
}

/**
 * Reject a suggestion.
 */
export async function rejectSuggestion(id: number, userId: string): Promise<boolean> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE suggestions
      SET status = 'rejected', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `, [userId, now, now, id]);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[suggestions] Failed to reject suggestion:', err);
    return false;
  }
}

/**
 * Accept all pending suggestions for a document.
 * Returns the count of accepted suggestions.
 */
export async function acceptAllPending(docId: string, userId: string): Promise<number> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE suggestions
      SET status = 'accepted', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE doc_id = ? AND status = 'pending'
    `, [userId, now, now, docId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[suggestions] Failed to accept all pending:', err);
    return 0;
  }
}

/**
 * Reject all pending suggestions for a document.
 * Returns the count of rejected suggestions.
 */
export async function rejectAllPending(docId: string, userId: string): Promise<number> {
  const now = Date.now();

  try {
    const info = await db.run(`
      UPDATE suggestions
      SET status = 'rejected', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE doc_id = ? AND status = 'pending'
    `, [userId, now, now, docId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[suggestions] Failed to reject all pending:', err);
    return 0;
  }
}

// ============================================
// Counts and Stats
// ============================================

/**
 * Get total suggestion count for a document.
 */
export async function getSuggestionCount(docId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM suggestions
      WHERE doc_id = ?
    `, [docId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error('[suggestions] Failed to get suggestion count:', err);
    return 0;
  }
}

/**
 * Get pending suggestion count for a document.
 */
export async function getPendingCount(docId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM suggestions
      WHERE doc_id = ? AND status = 'pending'
    `, [docId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error('[suggestions] Failed to get pending count:', err);
    return 0;
  }
}

// ============================================
// Cascade Delete
// ============================================

/**
 * Delete all suggestions for a document.
 * Used when permanently deleting a document.
 */
export async function deleteAllDocSuggestions(docId: string): Promise<number> {
  try {
    const info = await db.run(`
      DELETE FROM suggestions
      WHERE doc_id = ?
    `, [docId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[suggestions] Failed to delete all doc suggestions:', err);
    return 0;
  }
}
