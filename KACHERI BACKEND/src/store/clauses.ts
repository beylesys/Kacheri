// KACHERI BACKEND/src/store/clauses.ts
// Clause Library: Store for workspace-scoped reusable content blocks
//
// Tables: clauses
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice B1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type ClauseCategory = "general" | "legal" | "financial" | "boilerplate" | "custom";

// Domain type (camelCase, for API)
export interface Clause {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  contentHtml: string;
  contentText: string;
  category: ClauseCategory;
  tags: string[];
  language: string;
  version: number;
  usageCount: number;
  isArchived: boolean;
  createdBy: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface ClauseRow {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  content_html: string;
  content_text: string;
  category: string;
  tags_json: string;
  language: string;
  version: number;
  usage_count: number;
  is_archived: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface CreateClauseInput {
  workspaceId: string;
  title: string;
  description?: string;
  contentHtml: string;
  contentText: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
  createdBy: string;
}

export interface UpdateClauseInput {
  title?: string;
  description?: string | null;
  contentHtml?: string;
  contentText?: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
}

/* ---------- Row to Domain Converters ---------- */

function rowToClause(row: ClauseRow): Clause {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    contentHtml: row.content_html,
    contentText: row.content_text,
    category: row.category as ClauseCategory,
    tags: parseJson(row.tags_json, []),
    language: row.language,
    version: row.version,
    usageCount: row.usage_count,
    isArchived: row.is_archived === 1,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Safely parse JSON with fallback */
function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ---------- Validation ---------- */

const VALID_CATEGORIES: ClauseCategory[] = [
  "general", "legal", "financial", "boilerplate", "custom",
];

export function validateCategory(value: string): value is ClauseCategory {
  return VALID_CATEGORIES.includes(value as ClauseCategory);
}

/* ---------- CRUD Operations ---------- */

/** Create a new clause */
export async function createClause(input: CreateClauseInput): Promise<Clause> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO clauses (
        id, workspace_id, title, description, content_html, content_text,
        category, tags_json, language, version, usage_count, is_archived,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.workspaceId,
      input.title,
      input.description ?? null,
      input.contentHtml,
      input.contentText,
      input.category ?? "general",
      JSON.stringify(input.tags ?? []),
      input.language ?? "en",
      1, // version
      0, // usage_count
      0, // is_archived
      input.createdBy,
      now,
      now,
    ]);

    return (await getClauseById(id))!;
  } catch (err) {
    console.error("[clauses] Failed to create clause:", err);
    throw err;
  }
}

/** Get clause by ID */
export async function getClauseById(id: string): Promise<Clause | null> {
  try {
    const row = await db.queryOne<ClauseRow>(
      `SELECT * FROM clauses WHERE id = ?`,
      [id]
    );

    return row ? rowToClause(row) : null;
  } catch (err) {
    console.error("[clauses] Failed to get clause by id:", err);
    return null;
  }
}

/** Get all clauses for a workspace with optional filters and pagination */
export async function getClausesByWorkspace(
  workspaceId: string,
  opts?: {
    category?: ClauseCategory;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<Clause[]> {
  try {
    let query = `SELECT * FROM clauses WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (!opts?.includeArchived) {
      query += ` AND is_archived = 0`;
    }

    if (opts?.category) {
      query += ` AND category = ?`;
      params.push(opts.category);
    }

    if (opts?.search) {
      query += ` AND (title LIKE ? OR content_text LIKE ?)`;
      const searchTerm = `%${opts.search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ` ORDER BY created_at DESC`;

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<ClauseRow>(query, params);
    return rows.map(rowToClause);
  } catch (err) {
    console.error("[clauses] Failed to get clauses:", err);
    return [];
  }
}

/** Get clauses by category within a workspace */
export async function getClausesByCategory(
  workspaceId: string,
  category: ClauseCategory
): Promise<Clause[]> {
  try {
    const rows = await db.queryAll<ClauseRow>(`
      SELECT * FROM clauses
      WHERE workspace_id = ? AND category = ? AND is_archived = 0
      ORDER BY created_at DESC
    `, [workspaceId, category]);

    return rows.map(rowToClause);
  } catch (err) {
    console.error("[clauses] Failed to get clauses by category:", err);
    return [];
  }
}

/** Search clauses by title and content text */
export async function searchClauses(
  workspaceId: string,
  query: string
): Promise<Clause[]> {
  try {
    const searchTerm = `%${query}%`;
    const rows = await db.queryAll<ClauseRow>(`
      SELECT * FROM clauses
      WHERE workspace_id = ? AND is_archived = 0
        AND (title LIKE ? OR content_text LIKE ?)
      ORDER BY usage_count DESC, created_at DESC
    `, [workspaceId, searchTerm, searchTerm]);

    return rows.map(rowToClause);
  } catch (err) {
    console.error("[clauses] Failed to search clauses:", err);
    return [];
  }
}

/** Update an existing clause */
export async function updateClause(
  id: string,
  updates: UpdateClauseInput
): Promise<Clause | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.title !== undefined) {
    sets.push("title = ?");
    params.push(updates.title);
  }

  if (updates.description !== undefined) {
    sets.push("description = ?");
    params.push(updates.description);
  }

  if (updates.contentHtml !== undefined) {
    sets.push("content_html = ?");
    params.push(updates.contentHtml);
  }

  if (updates.contentText !== undefined) {
    sets.push("content_text = ?");
    params.push(updates.contentText);
  }

  if (updates.category !== undefined) {
    sets.push("category = ?");
    params.push(updates.category);
  }

  if (updates.tags !== undefined) {
    sets.push("tags_json = ?");
    params.push(JSON.stringify(updates.tags));
  }

  if (updates.language !== undefined) {
    sets.push("language = ?");
    params.push(updates.language);
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE clauses
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return getClauseById(id);
  } catch (err) {
    console.error("[clauses] Failed to update clause:", err);
    return null;
  }
}

/** Archive a clause (soft delete) */
export async function archiveClause(id: string): Promise<Clause | null> {
  try {
    const now = Date.now();
    const result = await db.run(`
      UPDATE clauses
      SET is_archived = 1, updated_at = ?
      WHERE id = ?
    `, [now, id]);

    if (result.changes === 0) {
      return null;
    }

    return getClauseById(id);
  } catch (err) {
    console.error("[clauses] Failed to archive clause:", err);
    return null;
  }
}

/** Increment usage count for a clause */
export async function incrementUsage(id: string): Promise<boolean> {
  try {
    const result = await db.run(`
      UPDATE clauses
      SET usage_count = usage_count + 1
      WHERE id = ?
    `, [id]);

    return result.changes > 0;
  } catch (err) {
    console.error("[clauses] Failed to increment usage:", err);
    return false;
  }
}

/** Delete all clauses for a workspace */
export async function deleteClausesByWorkspace(workspaceId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM clauses WHERE workspace_id = ?`,
      [workspaceId]
    );

    return result.changes;
  } catch (err) {
    console.error("[clauses] Failed to delete clauses by workspace:", err);
    return 0;
  }
}

/** Count clauses for a workspace */
export async function countClauses(
  workspaceId: string,
  opts?: { includeArchived?: boolean }
): Promise<number> {
  try {
    let query = `SELECT COUNT(*) as count FROM clauses WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (!opts?.includeArchived) {
      query += ` AND is_archived = 0`;
    }

    const row = await db.queryOne<{ count: number }>(query, params);
    return row?.count ?? 0;
  } catch (err) {
    console.error("[clauses] Failed to count clauses:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const ClausesStore = {
  create: createClause,
  getById: getClauseById,
  getByWorkspace: getClausesByWorkspace,
  getByCategory: getClausesByCategory,
  search: searchClauses,
  update: updateClause,
  archive: archiveClause,
  incrementUsage,
  deleteByWorkspace: deleteClausesByWorkspace,
  count: countClauses,
  // Validators
  validateCategory,
};
