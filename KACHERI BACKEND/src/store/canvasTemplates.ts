// KACHERI BACKEND/src/store/canvasTemplates.ts
// Design Studio: Store for canvas frame templates (reusable frame snippets)
//
// Tables: canvas_templates (created in migration 014_add_design_studio.sql)
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Phase 5, Slice D9

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

// Domain type (camelCase, for API)
export interface CanvasTemplate {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  code: string;
  thumbnailUrl: string | null;
  tags: string[];
  compositionMode: string | null;
  isPublic: boolean;
  createdBy: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface CanvasTemplateRow {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  code: string;
  thumbnail_url: string | null;
  tags: string | null;
  composition_mode: string | null;
  is_public: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface CreateTemplateInput {
  workspaceId: string;
  title: string;
  code: string;
  createdBy: string;
  description?: string;
  thumbnailUrl?: string;
  tags?: string[];
  compositionMode?: string;
}

export interface UpdateTemplateInput {
  title?: string;
  description?: string | null;
  tags?: string[];
  compositionMode?: string | null;
  thumbnailUrl?: string | null;
}

/* ---------- Helpers ---------- */

function parseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const VALID_COMPOSITION_MODES = ["deck", "page", "notebook", "widget"] as const;

function isValidCompositionMode(v: string): boolean {
  return (VALID_COMPOSITION_MODES as readonly string[]).includes(v);
}

/* ---------- Converters ---------- */

function rowToTemplate(row: CanvasTemplateRow): CanvasTemplate {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    code: row.code,
    thumbnailUrl: row.thumbnail_url,
    tags: parseJsonArray(row.tags),
    compositionMode: row.composition_mode,
    isPublic: row.is_public === 1,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/* ---------- CRUD ---------- */

async function createTemplate(input: CreateTemplateInput): Promise<CanvasTemplate> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO canvas_templates (
        id, workspace_id, title, description, code, thumbnail_url,
        tags, composition_mode, is_public, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.workspaceId,
      input.title,
      input.description ?? null,
      input.code,
      input.thumbnailUrl ?? null,
      input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
      input.compositionMode ?? null,
      0, // is_public — workspace-scoped by default
      input.createdBy,
      now,
      now,
    ]);

    return (await getTemplateById(id))!;
  } catch (err) {
    console.error("[canvas_templates] Failed to create template:", err);
    throw err;
  }
}

async function getTemplateById(id: string): Promise<CanvasTemplate | null> {
  try {
    const row = await db.queryOne<CanvasTemplateRow>(
      `SELECT * FROM canvas_templates WHERE id = ?`,
      [id]
    );

    return row ? rowToTemplate(row) : null;
  } catch (err) {
    console.error("[canvas_templates] Failed to get template by id:", err);
    return null;
  }
}

async function listTemplates(
  workspaceId: string,
  opts?: {
    limit?: number;
    offset?: number;
    tag?: string;
    compositionMode?: string;
  },
): Promise<{ templates: CanvasTemplate[]; total: number }> {
  try {
    const conditions: string[] = ["workspace_id = ?"];
    const params: unknown[] = [workspaceId];

    if (opts?.tag) {
      // Tags stored as JSON array — match with LIKE on the serialized string
      conditions.push(`tags LIKE ?`);
      params.push(`%"${opts.tag.replace(/"/g, "")}"%`);
    }

    if (opts?.compositionMode) {
      conditions.push(`composition_mode = ?`);
      params.push(opts.compositionMode);
    }

    const whereClause = conditions.join(" AND ");

    // Count
    const countRow = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM canvas_templates WHERE ${whereClause}`,
      params
    );
    const total = countRow?.count ?? 0;

    // Data
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const rows = await db.queryAll<CanvasTemplateRow>(
      `SELECT * FROM canvas_templates WHERE ${whereClause}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { templates: rows.map(rowToTemplate), total };
  } catch (err) {
    console.error("[canvas_templates] Failed to list templates:", err);
    return { templates: [], total: 0 };
  }
}

async function updateTemplate(
  id: string,
  updates: UpdateTemplateInput,
): Promise<CanvasTemplate | null> {
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

  if (updates.tags !== undefined) {
    sets.push("tags = ?");
    params.push(
      updates.tags && updates.tags.length > 0
        ? JSON.stringify(updates.tags)
        : null,
    );
  }

  if (updates.compositionMode !== undefined) {
    sets.push("composition_mode = ?");
    params.push(updates.compositionMode);
  }

  if (updates.thumbnailUrl !== undefined) {
    sets.push("thumbnail_url = ?");
    params.push(updates.thumbnailUrl);
  }

  params.push(id);

  try {
    const result = await db.run(
      `UPDATE canvas_templates SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    if (result.changes === 0) {
      return null;
    }

    return await getTemplateById(id);
  } catch (err) {
    console.error("[canvas_templates] Failed to update template:", err);
    return null;
  }
}

async function deleteTemplate(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM canvas_templates WHERE id = ?`,
      [id]
    );

    return (result.changes ?? 0) > 0;
  } catch (err) {
    console.error("[canvas_templates] Failed to delete template:", err);
    return false;
  }
}

async function listTags(workspaceId: string): Promise<string[]> {
  try {
    const rows = await db.queryAll<{ tags: string }>(
      `SELECT DISTINCT tags FROM canvas_templates
       WHERE workspace_id = ? AND tags IS NOT NULL AND tags != ''`,
      [workspaceId]
    );

    // Parse all JSON arrays, flatten, and deduplicate
    const tagSet = new Set<string>();
    for (const row of rows) {
      const parsed = parseJsonArray(row.tags);
      for (const tag of parsed) {
        if (tag) tagSet.add(tag);
      }
    }

    return [...tagSet].sort();
  } catch (err) {
    console.error("[canvas_templates] Failed to list tags:", err);
    return [];
  }
}

/* ---------- Exports ---------- */

export const CanvasTemplateStore = {
  create: createTemplate,
  getById: getTemplateById,
  list: listTemplates,
  update: updateTemplate,
  delete: deleteTemplate,
  listTags,
  isValidCompositionMode,
};
