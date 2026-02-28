// KACHERI BACKEND/src/store/entityRelationships.ts
// Cross-Document Intelligence: Store for entity-to-entity relationships
//
// Tables: entity_relationships
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Limits ---------- */

/** Maximum relationships per workspace (configurable via environment) */
export const RELATIONSHIP_LIMIT =
  Number(process.env.KACHERI_RELATIONSHIP_LIMIT) || 5_000;

/** Thrown when workspace relationship limit is reached */
export class RelationshipLimitExceededError extends Error {
  constructor(workspaceId: string, currentCount: number) {
    super(
      `Relationship limit reached: workspace ${workspaceId} has ${currentCount} relationships (max ${RELATIONSHIP_LIMIT})`
    );
    this.name = "RelationshipLimitExceededError";
  }
}

/* ---------- Types ---------- */

export type RelationshipType =
  | "co_occurrence"
  | "contractual"
  | "financial"
  | "organizational"
  | "temporal"
  | "custom";

export interface RelationshipEvidence {
  docId: string;
  context: string;
}

// Domain type (camelCase, for API)
export interface EntityRelationship {
  id: string;
  workspaceId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: RelationshipType;
  label: string | null;
  strength: number;
  evidence: RelationshipEvidence[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface EntityRelationshipRow {
  id: string;
  workspace_id: string;
  from_entity_id: string;
  to_entity_id: string;
  relationship_type: string;
  label: string | null;
  strength: number;
  evidence_json: string;
  created_at: number;
  updated_at: number;
}

export interface CreateRelationshipInput {
  workspaceId: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: RelationshipType;
  label?: string;
  strength?: number;
  evidence?: RelationshipEvidence[];
}

export interface UpdateRelationshipInput {
  label?: string;
  strength?: number;
  evidence?: RelationshipEvidence[];
}

/* ---------- Row to Domain Converters ---------- */

function rowToRelationship(row: EntityRelationshipRow): EntityRelationship {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fromEntityId: row.from_entity_id,
    toEntityId: row.to_entity_id,
    relationshipType: row.relationship_type as RelationshipType,
    label: row.label,
    strength: row.strength,
    evidence: parseJson(row.evidence_json, []),
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

const VALID_RELATIONSHIP_TYPES: RelationshipType[] = [
  "co_occurrence", "contractual", "financial",
  "organizational", "temporal", "custom",
];

export function validateRelationshipType(value: string): value is RelationshipType {
  return VALID_RELATIONSHIP_TYPES.includes(value as RelationshipType);
}

/* ---------- CRUD Operations ---------- */

/** Create a new relationship (INSERT OR IGNORE for unique constraint on pair+type) */
export async function createRelationship(input: CreateRelationshipInput): Promise<EntityRelationship | null> {
  // Enforce workspace relationship limit
  const currentCount = await countRelationships(input.workspaceId);
  if (currentCount >= RELATIONSHIP_LIMIT) {
    throw new RelationshipLimitExceededError(input.workspaceId, currentCount);
  }

  const id = nanoid(12);
  const now = Date.now();

  try {
    const result = await db.run(
      `INSERT OR IGNORE INTO entity_relationships (
        id, workspace_id, from_entity_id, to_entity_id,
        relationship_type, label, strength, evidence_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workspaceId,
        input.fromEntityId,
        input.toEntityId,
        input.relationshipType,
        input.label ?? null,
        input.strength ?? 0.5,
        JSON.stringify(input.evidence ?? []),
        now,
        now,
      ]
    );

    // If INSERT OR IGNORE skipped (duplicate pair+type), return null
    if (result.changes === 0) {
      return null;
    }

    return getRelationshipById(id);
  } catch (err) {
    console.error("[entity_relationships] Failed to create relationship:", err);
    throw err;
  }
}

/** Get relationship by ID */
export async function getRelationshipById(id: string): Promise<EntityRelationship | null> {
  try {
    const row = await db.queryOne<EntityRelationshipRow>(
      `SELECT * FROM entity_relationships WHERE id = ?`,
      [id]
    );
    return row ? rowToRelationship(row) : null;
  } catch (err) {
    console.error("[entity_relationships] Failed to get relationship by id:", err);
    return null;
  }
}

/** Get all relationships involving an entity (as either from or to) */
export async function getRelationshipsByEntity(entityId: string): Promise<EntityRelationship[]> {
  try {
    const rows = await db.queryAll<EntityRelationshipRow>(
      `SELECT * FROM entity_relationships
       WHERE from_entity_id = ? OR to_entity_id = ?
       ORDER BY strength DESC, created_at DESC`,
      [entityId, entityId]
    );
    return rows.map(rowToRelationship);
  } catch (err) {
    console.error("[entity_relationships] Failed to get relationships by entity:", err);
    return [];
  }
}

/** Get a specific relationship between two entities of a given type */
export async function getRelationshipByPair(
  fromEntityId: string,
  toEntityId: string,
  relationshipType: RelationshipType
): Promise<EntityRelationship | null> {
  try {
    const row = await db.queryOne<EntityRelationshipRow>(
      `SELECT * FROM entity_relationships
       WHERE from_entity_id = ? AND to_entity_id = ? AND relationship_type = ?`,
      [fromEntityId, toEntityId, relationshipType]
    );
    return row ? rowToRelationship(row) : null;
  } catch (err) {
    console.error("[entity_relationships] Failed to get relationship by pair:", err);
    return null;
  }
}

/** Get relationships for a workspace with optional filters and pagination */
export async function getRelationshipsByWorkspace(
  workspaceId: string,
  opts?: {
    entityId?: string;
    relationshipType?: RelationshipType;
    minStrength?: number;
    limit?: number;
    offset?: number;
  }
): Promise<EntityRelationship[]> {
  try {
    let query = `SELECT * FROM entity_relationships WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.entityId) {
      query += ` AND (from_entity_id = ? OR to_entity_id = ?)`;
      params.push(opts.entityId, opts.entityId);
    }

    if (opts?.relationshipType) {
      query += ` AND relationship_type = ?`;
      params.push(opts.relationshipType);
    }

    if (opts?.minStrength !== undefined) {
      query += ` AND strength >= ?`;
      params.push(opts.minStrength);
    }

    query += ` ORDER BY strength DESC, created_at DESC`;

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<EntityRelationshipRow>(query, params);
    return rows.map(rowToRelationship);
  } catch (err) {
    console.error("[entity_relationships] Failed to get relationships:", err);
    return [];
  }
}

/** Update an existing relationship */
export async function updateRelationship(
  id: string,
  updates: UpdateRelationshipInput
): Promise<EntityRelationship | null> {
  const now = Date.now();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (updates.label !== undefined) {
    sets.push("label = ?");
    params.push(updates.label);
  }

  if (updates.strength !== undefined) {
    sets.push("strength = ?");
    params.push(updates.strength);
  }

  if (updates.evidence !== undefined) {
    sets.push("evidence_json = ?");
    params.push(JSON.stringify(updates.evidence));
  }

  params.push(id);

  try {
    const result = await db.run(
      `UPDATE entity_relationships SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    if (result.changes === 0) {
      return null;
    }

    return getRelationshipById(id);
  } catch (err) {
    console.error("[entity_relationships] Failed to update relationship:", err);
    return null;
  }
}

/** Delete a relationship by ID */
export async function deleteRelationship(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM entity_relationships WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[entity_relationships] Failed to delete relationship:", err);
    return false;
  }
}

/** Delete all relationships involving an entity (cleanup) */
export async function deleteRelationshipsByEntity(entityId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM entity_relationships WHERE from_entity_id = ? OR to_entity_id = ?`,
      [entityId, entityId]
    );
    return result.changes;
  } catch (err) {
    console.error("[entity_relationships] Failed to delete relationships by entity:", err);
    return 0;
  }
}

/** Count relationships for a workspace */
export async function countRelationships(workspaceId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_relationships WHERE workspace_id = ?`,
      [workspaceId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[entity_relationships] Failed to count relationships:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const EntityRelationshipsStore = {
  create: createRelationship,
  getById: getRelationshipById,
  getByEntity: getRelationshipsByEntity,
  getByPair: getRelationshipByPair,
  getByWorkspace: getRelationshipsByWorkspace,
  update: updateRelationship,
  delete: deleteRelationship,
  deleteByEntity: deleteRelationshipsByEntity,
  count: countRelationships,
  // Limits
  RELATIONSHIP_LIMIT,
  RelationshipLimitExceededError,
  // Validators
  validateRelationshipType,
};
