// KACHERI BACKEND/src/store/docReviewers.ts
// Review assignment store with CRUD operations.
// Slice 12 — Phase 2 Sprint 4

import { db } from "../db";

// ============================================
// Types
// ============================================

export type ReviewerStatus = 'pending' | 'in_review' | 'completed';

export interface DocReviewer {
  id: number;
  docId: string;
  workspaceId: string;
  userId: string;
  assignedBy: string;
  status: ReviewerStatus;
  assignedAt: number;
  completedAt: number | null;
  notes: string | null;
}

interface DocReviewerRow {
  id: number;
  doc_id: string;
  workspace_id: string;
  user_id: string;
  assigned_by: string;
  status: string;
  assigned_at: number;
  completed_at: number | null;
  notes: string | null;
}

// ============================================
// Validators
// ============================================

const VALID_STATUSES: ReadonlySet<string> = new Set(['pending', 'in_review', 'completed']);

export function isValidReviewerStatus(s: string): s is ReviewerStatus {
  return VALID_STATUSES.has(s);
}

// ============================================
// Row Conversion
// ============================================

function rowToReviewer(row: DocReviewerRow): DocReviewer {
  return {
    id: row.id,
    docId: row.doc_id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    assignedBy: row.assigned_by,
    status: row.status as ReviewerStatus,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
    notes: row.notes,
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Assign a user as a reviewer on a document.
 * Returns null if the user is already assigned (UNIQUE constraint).
 */
export async function assignReviewer(
  docId: string,
  workspaceId: string,
  userId: string,
  assignedBy: string
): Promise<DocReviewer | null> {
  const now = Date.now();
  try {
    await db.run(
      `INSERT INTO doc_reviewers (doc_id, workspace_id, user_id, assigned_by, status, assigned_at, completed_at, notes)
       VALUES (?, ?, ?, ?, 'pending', ?, NULL, NULL)`,
      [docId, workspaceId, userId, assignedBy, now]
    );
    return getReviewer(docId, userId);
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.message?.includes('UNIQUE constraint failed')) {
      return null; // Already assigned
    }
    console.error('[docReviewers] Failed to assign reviewer:', err);
    return null;
  }
}

/**
 * List all reviewers for a document.
 */
export async function listReviewers(docId: string): Promise<DocReviewer[]> {
  try {
    const rows = await db.queryAll<DocReviewerRow>(
      `SELECT id, doc_id, workspace_id, user_id, assigned_by, status, assigned_at, completed_at, notes
       FROM doc_reviewers
       WHERE doc_id = ?
       ORDER BY assigned_at ASC`,
      [docId]
    );
    return rows.map(rowToReviewer);
  } catch (err) {
    console.error('[docReviewers] Failed to list reviewers:', err);
    return [];
  }
}

/**
 * Get a single reviewer assignment.
 */
export async function getReviewer(docId: string, userId: string): Promise<DocReviewer | null> {
  try {
    const row = await db.queryOne<DocReviewerRow>(
      `SELECT id, doc_id, workspace_id, user_id, assigned_by, status, assigned_at, completed_at, notes
       FROM doc_reviewers
       WHERE doc_id = ? AND user_id = ?`,
      [docId, userId]
    );
    return row ? rowToReviewer(row) : null;
  } catch (err) {
    console.error('[docReviewers] Failed to get reviewer:', err);
    return null;
  }
}

/**
 * Update a reviewer's status and optionally their notes.
 * Sets completedAt when status changes to 'completed'.
 */
export async function updateReviewerStatus(
  docId: string,
  userId: string,
  status: ReviewerStatus,
  notes?: string | null
): Promise<DocReviewer | null> {
  const now = Date.now();
  const completedAt = status === 'completed' ? now : null;

  try {
    const info = await db.run(
      `UPDATE doc_reviewers
       SET status = ?, completed_at = ?, notes = COALESCE(?, notes)
       WHERE doc_id = ? AND user_id = ?`,
      [status, completedAt, notes ?? null, docId, userId]
    );

    if ((info.changes ?? 0) === 0) return null;
    return getReviewer(docId, userId);
  } catch (err) {
    console.error('[docReviewers] Failed to update reviewer status:', err);
    return null;
  }
}

/**
 * Remove a reviewer assignment from a document.
 */
export async function removeReviewer(docId: string, userId: string): Promise<boolean> {
  try {
    const info = await db.run(
      `DELETE FROM doc_reviewers WHERE doc_id = ? AND user_id = ?`,
      [docId, userId]
    );
    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[docReviewers] Failed to remove reviewer:', err);
    return false;
  }
}

/**
 * List all reviewer assignments for a user in a workspace.
 * Useful for "assigned to me" queries.
 */
export async function listReviewersByUser(userId: string, workspaceId: string): Promise<DocReviewer[]> {
  try {
    const rows = await db.queryAll<DocReviewerRow>(
      `SELECT id, doc_id, workspace_id, user_id, assigned_by, status, assigned_at, completed_at, notes
       FROM doc_reviewers
       WHERE user_id = ? AND workspace_id = ?
       ORDER BY assigned_at DESC`,
      [userId, workspaceId]
    );
    return rows.map(rowToReviewer);
  } catch (err) {
    console.error('[docReviewers] Failed to list reviewers by user:', err);
    return [];
  }
}
