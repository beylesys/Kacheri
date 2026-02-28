// KACHERI BACKEND/src/store/entityMentions.ts
// Cross-Document Intelligence: Store for entity mentions in documents
//
// Tables: entity_mentions
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type MentionSource = "extraction" | "manual" | "ai_index";

export type ProductSource = "docs" | "design-studio" | "research" | "notes" | "sheets";

const VALID_PRODUCT_SOURCES: readonly ProductSource[] = [
  "docs", "design-studio", "research", "notes", "sheets",
];

export function validateProductSource(value: string): value is ProductSource {
  return (VALID_PRODUCT_SOURCES as readonly string[]).includes(value);
}

// Domain type (camelCase, for API)
export interface EntityMention {
  id: string;
  workspaceId: string;
  entityId: string;
  docId: string | null;
  context: string | null;
  fieldPath: string | null;
  confidence: number;
  source: MentionSource;
  productSource: ProductSource;
  sourceRef: string | null;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface EntityMentionRow {
  id: string;
  workspace_id: string;
  entity_id: string;
  doc_id: string | null;
  context: string | null;
  field_path: string | null;
  confidence: number;
  source: string;
  product_source: string;
  source_ref: string | null;
  created_at: number;
}

export interface CreateMentionInput {
  workspaceId: string;
  entityId: string;
  docId?: string;
  context?: string;
  fieldPath?: string;
  confidence?: number;
  source?: MentionSource;
  productSource?: ProductSource;
  sourceRef?: string;
}

// Extended type with doc title (for JOIN queries)
export interface EntityMentionWithDoc extends EntityMention {
  docTitle: string | null;
}

interface MentionWithDocRow extends EntityMentionRow {
  doc_title: string | null;
}

/* ---------- Row to Domain Converters ---------- */

function rowToMention(row: EntityMentionRow): EntityMention {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entityId: row.entity_id,
    docId: row.doc_id,
    context: row.context,
    fieldPath: row.field_path,
    confidence: row.confidence,
    source: row.source as MentionSource,
    productSource: (row.product_source as ProductSource) ?? "docs",
    sourceRef: row.source_ref ?? null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToMentionWithDoc(row: MentionWithDocRow): EntityMentionWithDoc {
  return {
    ...rowToMention(row),
    docTitle: row.doc_title,
  };
}

/* ---------- CRUD Operations ---------- */

/** Create a new entity mention (INSERT OR IGNORE for unique constraint) */
export async function createMention(input: CreateMentionInput): Promise<EntityMention | null> {
  const id = nanoid(12);
  const now = Date.now();
  const productSource = input.productSource ?? "docs";

  // Application-layer validation: docs product requires docId
  if (productSource === "docs" && !input.docId) {
    throw new Error("docId is required when productSource is 'docs'");
  }

  try {
    const result = await db.run(
      `INSERT OR IGNORE INTO entity_mentions (
        id, workspace_id, entity_id, doc_id,
        context, field_path, confidence, source,
        product_source, source_ref, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workspaceId,
        input.entityId,
        input.docId ?? null,
        input.context ?? null,
        input.fieldPath ?? null,
        input.confidence ?? 0.5,
        input.source ?? "extraction",
        productSource,
        input.sourceRef ?? null,
        now,
      ]
    );

    // If INSERT OR IGNORE skipped (duplicate), return null
    if (result.changes === 0) {
      return null;
    }

    return getMentionById(id);
  } catch (err) {
    console.error("[entity_mentions] Failed to create mention:", err);
    throw err;
  }
}

/** Get mention by ID */
export async function getMentionById(id: string): Promise<EntityMention | null> {
  try {
    const row = await db.queryOne<EntityMentionRow>(
      `SELECT * FROM entity_mentions WHERE id = ?`,
      [id]
    );
    return row ? rowToMention(row) : null;
  } catch (err) {
    console.error("[entity_mentions] Failed to get mention by id:", err);
    return null;
  }
}

/** Get mentions by entity with optional doc title JOIN and pagination */
export async function getMentionsByEntity(
  entityId: string,
  opts?: { limit?: number; offset?: number }
): Promise<EntityMentionWithDoc[]> {
  try {
    let query = `
      SELECT em.*, d.title as doc_title
      FROM entity_mentions em
      LEFT JOIN docs d ON d.id = em.doc_id
      WHERE em.entity_id = ?
      ORDER BY em.created_at DESC
    `;
    const params: unknown[] = [entityId];

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<MentionWithDocRow>(query, params);
    return rows.map(rowToMentionWithDoc);
  } catch (err) {
    console.error("[entity_mentions] Failed to get mentions by entity:", err);
    return [];
  }
}

/** Get all entity mentions for a document */
export async function getMentionsByDoc(docId: string): Promise<EntityMention[]> {
  try {
    const rows = await db.queryAll<EntityMentionRow>(
      `SELECT * FROM entity_mentions
       WHERE doc_id = ?
       ORDER BY created_at ASC`,
      [docId]
    );
    return rows.map(rowToMention);
  } catch (err) {
    console.error("[entity_mentions] Failed to get mentions by doc:", err);
    return [];
  }
}

/** Get mentions by workspace with pagination */
export async function getMentionsByWorkspace(
  workspaceId: string,
  opts?: { limit?: number; offset?: number }
): Promise<EntityMention[]> {
  try {
    let query = `
      SELECT * FROM entity_mentions
      WHERE workspace_id = ?
      ORDER BY created_at DESC
    `;
    const params: unknown[] = [workspaceId];

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<EntityMentionRow>(query, params);
    return rows.map(rowToMention);
  } catch (err) {
    console.error("[entity_mentions] Failed to get mentions by workspace:", err);
    return [];
  }
}

/** Get mentions by product source for cross-product filtering */
export async function getMentionsByProductSource(
  workspaceId: string,
  productSource: ProductSource,
  opts?: { limit?: number; offset?: number }
): Promise<EntityMention[]> {
  try {
    let query = `
      SELECT * FROM entity_mentions
      WHERE workspace_id = ? AND product_source = ?
      ORDER BY created_at DESC
    `;
    const params: unknown[] = [workspaceId, productSource];

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<EntityMentionRow>(query, params);
    return rows.map(rowToMention);
  } catch (err) {
    console.error("[entity_mentions] Failed to get mentions by product source:", err);
    return [];
  }
}

/** Delete a mention by ID */
export async function deleteMention(id: string): Promise<boolean> {
  try {
    const result = await db.run(
      `DELETE FROM entity_mentions WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  } catch (err) {
    console.error("[entity_mentions] Failed to delete mention:", err);
    return false;
  }
}

/** Delete all mentions for a document (cleanup on doc deletion) */
export async function deleteMentionsByDoc(docId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM entity_mentions WHERE doc_id = ?`,
      [docId]
    );
    return result.changes;
  } catch (err) {
    console.error("[entity_mentions] Failed to delete mentions by doc:", err);
    return 0;
  }
}

/** Delete all mentions for an entity (cleanup on entity deletion) */
export async function deleteMentionsByEntity(entityId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM entity_mentions WHERE entity_id = ?`,
      [entityId]
    );
    return result.changes;
  } catch (err) {
    console.error("[entity_mentions] Failed to delete mentions by entity:", err);
    return 0;
  }
}

/** Count total mentions for an entity */
export async function countMentionsByEntity(entityId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM entity_mentions WHERE entity_id = ?`,
      [entityId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[entity_mentions] Failed to count mentions:", err);
    return 0;
  }
}

/** Count distinct documents for an entity */
export async function countDistinctDocsByEntity(entityId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT doc_id) as count FROM entity_mentions WHERE entity_id = ?`,
      [entityId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[entity_mentions] Failed to count distinct docs:", err);
    return 0;
  }
}

/**
 * Clean up stale entities: delete workspace_entities with 0 mentions.
 * Should be called after document deletion or batch re-indexing to remove orphans.
 * Returns the number of deleted entities.
 */
export async function cleanupStaleEntities(workspaceId: string): Promise<number> {
  try {
    const result = await db.run(
      `DELETE FROM workspace_entities
       WHERE workspace_id = ?
         AND id NOT IN (
           SELECT DISTINCT entity_id FROM entity_mentions WHERE workspace_id = ?
         )`,
      [workspaceId, workspaceId]
    );
    return result.changes;
  } catch (err) {
    console.error("[entity_mentions] Failed to cleanup stale entities:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const EntityMentionsStore = {
  create: createMention,
  getById: getMentionById,
  getByEntity: getMentionsByEntity,
  getByDoc: getMentionsByDoc,
  getByWorkspace: getMentionsByWorkspace,
  getByProductSource: getMentionsByProductSource,
  delete: deleteMention,
  deleteByDoc: deleteMentionsByDoc,
  deleteByEntity: deleteMentionsByEntity,
  countByEntity: countMentionsByEntity,
  countDistinctDocsByEntity,
  cleanupStaleEntities,
};
