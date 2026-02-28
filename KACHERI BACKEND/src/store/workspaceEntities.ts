// KACHERI BACKEND/src/store/workspaceEntities.ts
// Cross-Document Intelligence: Store for workspace-scoped canonical entities
//
// Tables: workspace_entities
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Limits ---------- */

/** Maximum entities per workspace (configurable via environment) */
export const ENTITY_LIMIT = Number(process.env.KACHERI_ENTITY_LIMIT) || 10_000;

/** Thrown when workspace entity limit is reached */
export class EntityLimitExceededError extends Error {
  constructor(workspaceId: string, currentCount: number) {
    super(
      `Entity limit reached: workspace ${workspaceId} has ${currentCount} entities (max ${ENTITY_LIMIT})`
    );
    this.name = "EntityLimitExceededError";
  }
}

/* ---------- Types ---------- */

export type EntityType =
  | "person"
  | "organization"
  | "date"
  | "amount"
  | "location"
  | "product"
  | "term"
  | "concept"
  | "web_page"
  | "research_source"
  | "design_asset"
  | "event"
  | "citation";

// Domain type (camelCase, for API)
export interface WorkspaceEntity {
  id: string;
  workspaceId: string;
  entityType: EntityType;
  name: string;
  normalizedName: string;
  aliases: string[];
  metadata: Record<string, unknown> | null;
  mentionCount: number;
  docCount: number;
  firstSeenAt: string; // ISO string
  lastSeenAt: string;  // ISO string
  createdAt: string;   // ISO string
  updatedAt: string;   // ISO string
}

// Row type (snake_case, matches DB)
interface WorkspaceEntityRow {
  id: string;
  workspace_id: string;
  entity_type: string;
  name: string;
  normalized_name: string;
  aliases_json: string;
  metadata_json: string | null;
  mention_count: number;
  doc_count: number;
  first_seen_at: number;
  last_seen_at: number;
  created_at: number;
  updated_at: number;
}

export interface CreateEntityInput {
  workspaceId: string;
  entityType: EntityType;
  name: string;
  normalizedName: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateEntityInput {
  name?: string;
  normalizedName?: string;
  aliases?: string[];
  metadata?: Record<string, unknown> | null;
  lastSeenAt?: number;
}

/* ---------- Row to Domain Converters ---------- */

function rowToEntity(row: WorkspaceEntityRow): WorkspaceEntity {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type as EntityType,
    name: row.name,
    normalizedName: row.normalized_name,
    aliases: parseJson(row.aliases_json, []),
    metadata: parseJson(row.metadata_json, null),
    mentionCount: row.mention_count,
    docCount: row.doc_count,
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
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

const VALID_ENTITY_TYPES: EntityType[] = [
  "person", "organization", "date", "amount",
  "location", "product", "term", "concept",
  "web_page", "research_source", "design_asset", "event", "citation",
];

export function validateEntityType(value: string): value is EntityType {
  return VALID_ENTITY_TYPES.includes(value as EntityType);
}

/* ---------- CRUD Operations ---------- */

/** Create a new workspace entity */
export async function createEntity(input: CreateEntityInput): Promise<WorkspaceEntity> {
  // Enforce workspace entity limit
  const currentCount = await countEntities(input.workspaceId);
  if (currentCount >= ENTITY_LIMIT) {
    throw new EntityLimitExceededError(input.workspaceId, currentCount);
  }

  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO workspace_entities (
        id, workspace_id, entity_type, name, normalized_name,
        aliases_json, metadata_json, mention_count, doc_count,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.workspaceId,
      input.entityType,
      input.name,
      input.normalizedName,
      JSON.stringify(input.aliases ?? []),
      input.metadata ? JSON.stringify(input.metadata) : null,
      0, // mention_count
      0, // doc_count
      now, // first_seen_at
      now, // last_seen_at
      now,
      now
    ]);

    return (await getEntityById(id))!;
  } catch (err) {
    console.error("[workspace_entities] Failed to create entity:", err);
    throw err;
  }
}

/** Get entity by ID */
export async function getEntityById(id: string): Promise<WorkspaceEntity | null> {
  try {
    const row = await db.queryOne<WorkspaceEntityRow>(
      `SELECT * FROM workspace_entities WHERE id = ?`,
      [id]
    );

    return row ? rowToEntity(row) : null;
  } catch (err) {
    console.error("[workspace_entities] Failed to get entity by id:", err);
    return null;
  }
}

/** Get entity by normalized name + type within workspace (for dedup matching) */
export async function getEntityByNormalizedName(
  workspaceId: string,
  normalizedName: string,
  entityType: EntityType
): Promise<WorkspaceEntity | null> {
  try {
    const row = await db.queryOne<WorkspaceEntityRow>(`
      SELECT * FROM workspace_entities
      WHERE workspace_id = ? AND normalized_name = ? AND entity_type = ?
    `, [workspaceId, normalizedName, entityType]);

    return row ? rowToEntity(row) : null;
  } catch (err) {
    console.error("[workspace_entities] Failed to get entity by normalized name:", err);
    return null;
  }
}

/** Get all entities for a workspace with optional filters and pagination */
export async function getEntitiesByWorkspace(
  workspaceId: string,
  opts?: {
    entityType?: EntityType;
    search?: string;
    sort?: "doc_count" | "name" | "created_at" | "mention_count";
    order?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }
): Promise<WorkspaceEntity[]> {
  try {
    let query = `SELECT * FROM workspace_entities WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.entityType) {
      query += ` AND entity_type = ?`;
      params.push(opts.entityType);
    }

    if (opts?.search) {
      query += ` AND (name LIKE ? OR aliases_json LIKE ?)`;
      const searchTerm = `%${opts.search}%`;
      params.push(searchTerm, searchTerm);
    }

    const sortCol = opts?.sort ?? "doc_count";
    const sortOrder = opts?.order ?? "desc";
    const sortMap: Record<string, string> = {
      doc_count: "doc_count",
      name: "name",
      created_at: "created_at",
      mention_count: "mention_count",
    };
    query += ` ORDER BY ${sortMap[sortCol] ?? "doc_count"} ${sortOrder === "asc" ? "ASC" : "DESC"}`;

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<WorkspaceEntityRow>(query, params);
    return rows.map(rowToEntity);
  } catch (err) {
    console.error("[workspace_entities] Failed to get entities:", err);
    return [];
  }
}

/** Search entities by name and aliases */
export async function searchEntities(
  workspaceId: string,
  query: string
): Promise<WorkspaceEntity[]> {
  try {
    const searchTerm = `%${query}%`;
    const rows = await db.queryAll<WorkspaceEntityRow>(`
      SELECT * FROM workspace_entities
      WHERE workspace_id = ?
        AND (name LIKE ? OR aliases_json LIKE ?)
      ORDER BY doc_count DESC, mention_count DESC
    `, [workspaceId, searchTerm, searchTerm]);

    return rows.map(rowToEntity);
  } catch (err) {
    console.error("[workspace_entities] Failed to search entities:", err);
    return [];
  }
}

/** Update an existing entity */
export async function updateEntity(
  id: string,
  updates: UpdateEntityInput
): Promise<WorkspaceEntity | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.name !== undefined) {
    sets.push("name = ?");
    params.push(updates.name);
  }

  if (updates.normalizedName !== undefined) {
    sets.push("normalized_name = ?");
    params.push(updates.normalizedName);
  }

  if (updates.aliases !== undefined) {
    sets.push("aliases_json = ?");
    params.push(JSON.stringify(updates.aliases));
  }

  if (updates.metadata !== undefined) {
    sets.push("metadata_json = ?");
    params.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
  }

  if (updates.lastSeenAt !== undefined) {
    sets.push("last_seen_at = ?");
    params.push(updates.lastSeenAt);
  }

  params.push(id);

  try {
    const result = await db.run(`
      UPDATE workspace_entities
      SET ${sets.join(", ")}
      WHERE id = ?
    `, params);

    if (result.changes === 0) {
      return null;
    }

    return await getEntityById(id);
  } catch (err) {
    console.error("[workspace_entities] Failed to update entity:", err);
    return null;
  }
}

/** Delete an entity (CASCADE handles mentions and relationships) */
export async function deleteEntity(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM workspace_entities WHERE id = ?`,
      [id]
    );

    return result.changes > 0;
  } catch (err) {
    console.error("[workspace_entities] Failed to delete entity:", err);
    return false;
  }
}

/** Increment mention and doc counts atomically */
export async function incrementCounts(
  id: string,
  mentionDelta: number,
  docDelta: number
): Promise<boolean> {
  try {
    const result = await db.run(`
      UPDATE workspace_entities
      SET mention_count = mention_count + ?,
          doc_count = doc_count + ?,
          last_seen_at = ?,
          updated_at = ?
      WHERE id = ?
    `, [mentionDelta, docDelta, Date.now(), Date.now(), id]);

    return result.changes > 0;
  } catch (err) {
    console.error("[workspace_entities] Failed to increment counts:", err);
    return false;
  }
}

/** Recalculate mention_count and doc_count from entity_mentions table */
export async function recalculateCounts(id: string): Promise<boolean> {
  try {
    const stats = await db.queryOne<{ mention_count: number; doc_count: number }>(`
      SELECT
        COUNT(*) as mention_count,
        COUNT(DISTINCT doc_id) as doc_count
      FROM entity_mentions
      WHERE entity_id = ?
    `, [id]);

    if (!stats) return false;

    const result = await db.run(`
      UPDATE workspace_entities
      SET mention_count = ?,
          doc_count = ?,
          updated_at = ?
      WHERE id = ?
    `, [stats.mention_count, stats.doc_count, Date.now(), id]);

    return result.changes > 0;
  } catch (err) {
    console.error("[workspace_entities] Failed to recalculate counts:", err);
    return false;
  }
}

/** Merge multiple source entities into a target entity (transactional) */
export async function mergeEntities(
  sourceIds: string[],
  targetId: string,
  mergedName: string,
  mergedAliases: string[]
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      // 1. Reassign all mentions from source entities to target
      for (const sourceId of sourceIds) {
        // Update mentions that don't conflict with the unique index
        await tx.run(`
          UPDATE OR IGNORE entity_mentions
          SET entity_id = ?
          WHERE entity_id = ?
        `, [targetId, sourceId]);

        // Delete any remaining conflicting mentions (already exist for target)
        await tx.run(`
          DELETE FROM entity_mentions
          WHERE entity_id = ?
        `, [sourceId]);
      }

      // 2. Update target entity name and aliases
      const now = Date.now();
      await tx.run(`
        UPDATE workspace_entities
        SET name = ?,
            normalized_name = ?,
            aliases_json = ?,
            updated_at = ?
        WHERE id = ?
      `, [
        mergedName,
        mergedName.toLowerCase().trim(),
        JSON.stringify(mergedAliases),
        now,
        targetId
      ]);

      // 3. Recalculate counts for target
      const stats = await tx.queryOne<{ mention_count: number; doc_count: number }>(`
        SELECT
          COUNT(*) as mention_count,
          COUNT(DISTINCT doc_id) as doc_count
        FROM entity_mentions
        WHERE entity_id = ?
      `, [targetId]);

      await tx.run(`
        UPDATE workspace_entities
        SET mention_count = ?,
            doc_count = ?,
            updated_at = ?
        WHERE id = ?
      `, [stats?.mention_count ?? 0, stats?.doc_count ?? 0, now, targetId]);

      // 4. Delete source entities (CASCADE deletes remaining mentions/relationships)
      for (const sourceId of sourceIds) {
        await tx.run(`DELETE FROM workspace_entities WHERE id = ?`, [sourceId]);
      }
    });

    return true;
  } catch (err) {
    console.error("[workspace_entities] Failed to merge entities:", err);
    return false;
  }
}

/** Count entities for a workspace with optional type filter */
export async function countEntities(
  workspaceId: string,
  opts?: { entityType?: EntityType }
): Promise<number> {
  try {
    let query = `SELECT COUNT(*) as count FROM workspace_entities WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.entityType) {
      query += ` AND entity_type = ?`;
      params.push(opts.entityType);
    }

    const row = await db.queryOne<{ count: number }>(query, params);
    return row?.count ?? 0;
  } catch (err) {
    console.error("[workspace_entities] Failed to count entities:", err);
    return 0;
  }
}

/** Delete all entities for a workspace */
export async function deleteEntitiesByWorkspace(workspaceId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM workspace_entities WHERE workspace_id = ?`,
      [workspaceId]
    );

    return result.changes;
  } catch (err) {
    console.error("[workspace_entities] Failed to delete entities by workspace:", err);
    return 0;
  }
}

/**
 * Recalculate mention_count and doc_count for ALL entities in a workspace.
 * Used after batch operations (doc deletion, re-indexing, stale cleanup).
 * Returns number of entities updated.
 */
export async function recalculateAllCounts(workspaceId: string): Promise<number> {
  try {
    const result = await db.run(`
      UPDATE workspace_entities
      SET mention_count = COALESCE(
            (SELECT COUNT(*) FROM entity_mentions WHERE entity_id = workspace_entities.id), 0
          ),
          doc_count = COALESCE(
            (SELECT COUNT(DISTINCT doc_id) FROM entity_mentions WHERE entity_id = workspace_entities.id), 0
          ),
          updated_at = ?
      WHERE workspace_id = ?
    `, [Date.now(), workspaceId]);

    return result.changes;
  } catch (err) {
    console.error("[workspace_entities] Failed to recalculate all counts:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const WorkspaceEntitiesStore = {
  create: createEntity,
  getById: getEntityById,
  getByNormalizedName: getEntityByNormalizedName,
  getByWorkspace: getEntitiesByWorkspace,
  search: searchEntities,
  update: updateEntity,
  delete: deleteEntity,
  incrementCounts,
  recalculateCounts,
  recalculateAllCounts,
  merge: mergeEntities,
  count: countEntities,
  deleteByWorkspace: deleteEntitiesByWorkspace,
  // Limits
  ENTITY_LIMIT,
  EntityLimitExceededError,
  // Validators
  validateEntityType,
};
