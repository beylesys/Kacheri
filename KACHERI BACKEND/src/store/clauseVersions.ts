// KACHERI BACKEND/src/store/clauseVersions.ts
// Clause Library: Store for clause version history
//
// Tables: clause_versions
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice B1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

// Domain type (camelCase, for API)
export interface ClauseVersion {
  id: string;
  clauseId: string;
  version: number;
  contentHtml: string;
  contentText: string;
  changeNote: string | null;
  createdBy: string;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface ClauseVersionRow {
  id: string;
  clause_id: string;
  version: number;
  content_html: string;
  content_text: string;
  change_note: string | null;
  created_by: string;
  created_at: number;
}

export interface CreateVersionInput {
  clauseId: string;
  version: number;
  contentHtml: string;
  contentText: string;
  changeNote?: string;
  createdBy: string;
}

/* ---------- Row to Domain Converters ---------- */

function rowToVersion(row: ClauseVersionRow): ClauseVersion {
  return {
    id: row.id,
    clauseId: row.clause_id,
    version: row.version,
    contentHtml: row.content_html,
    contentText: row.content_text,
    changeNote: row.change_note,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ---------- CRUD Operations ---------- */

/** Create a new clause version record */
export async function createVersion(input: CreateVersionInput): Promise<ClauseVersion> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO clause_versions (
        id, clause_id, version, content_html, content_text,
        change_note, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.clauseId,
      input.version,
      input.contentHtml,
      input.contentText,
      input.changeNote ?? null,
      input.createdBy,
      now,
    ]);

    return (await getVersionById(id))!;
  } catch (err) {
    console.error("[clauseVersions] Failed to create version:", err);
    throw err;
  }
}

/** Get version by ID */
export async function getVersionById(id: string): Promise<ClauseVersion | null> {
  try {
    const row = await db.queryOne<ClauseVersionRow>(
      `SELECT * FROM clause_versions WHERE id = ?`,
      [id]
    );

    return row ? rowToVersion(row) : null;
  } catch (err) {
    console.error("[clauseVersions] Failed to get version by id:", err);
    return null;
  }
}

/** Get all versions for a clause, ordered by version descending */
export async function getVersionsByClause(clauseId: string): Promise<ClauseVersion[]> {
  try {
    const rows = await db.queryAll<ClauseVersionRow>(`
      SELECT * FROM clause_versions
      WHERE clause_id = ?
      ORDER BY version DESC
    `, [clauseId]);

    return rows.map(rowToVersion);
  } catch (err) {
    console.error("[clauseVersions] Failed to get versions by clause:", err);
    return [];
  }
}

/** Get a specific version by clause ID and version number */
export async function getByVersion(
  clauseId: string,
  version: number
): Promise<ClauseVersion | null> {
  try {
    const row = await db.queryOne<ClauseVersionRow>(`
      SELECT * FROM clause_versions
      WHERE clause_id = ? AND version = ?
    `, [clauseId, version]);

    return row ? rowToVersion(row) : null;
  } catch (err) {
    console.error("[clauseVersions] Failed to get version:", err);
    return null;
  }
}

/** Get the latest version for a clause */
export async function getLatestVersion(clauseId: string): Promise<ClauseVersion | null> {
  try {
    const row = await db.queryOne<ClauseVersionRow>(`
      SELECT * FROM clause_versions
      WHERE clause_id = ?
      ORDER BY version DESC
      LIMIT 1
    `, [clauseId]);

    return row ? rowToVersion(row) : null;
  } catch (err) {
    console.error("[clauseVersions] Failed to get latest version:", err);
    return null;
  }
}

/* ---------- Export aggregated store object ---------- */

export const ClauseVersionsStore = {
  create: createVersion,
  getById: getVersionById,
  getByClause: getVersionsByClause,
  getByVersion,
  getLatest: getLatestVersion,
};
