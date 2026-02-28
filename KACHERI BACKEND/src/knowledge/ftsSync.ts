// KACHERI BACKEND/src/knowledge/ftsSync.ts
// Cross-Document Intelligence: FTS5 search index sync and query helpers
//
// Syncs document content and entity data into FTS5 virtual tables.
// Provides MATCH query helpers with snippet extraction and rank ordering.
//
// Tables: docs_fts, entities_fts (from migration 008)
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 2

import { db } from "../db";
import { htmlToPlainText } from "../compliance/engine";

/* ---------- Types ---------- */

/** Result from a document FTS search */
export interface DocFtsResult {
  docId: string;
  workspaceId: string;
  title: string;
  snippet: string;
  rank: number; // BM25 score: lower (more negative) = more relevant
}

/** Result from an entity FTS search */
export interface EntityFtsResult {
  entityId: string;
  workspaceId: string;
  name: string;
  aliases: string;
  rank: number; // BM25 score: lower (more negative) = more relevant
}

/** Options for FTS search queries */
export interface FtsSearchOptions {
  limit?: number; // Max results, default 20
  offset?: number; // Pagination offset, default 0
  snippetLength?: number; // Max tokens in snippet, default 64
}

/** Input for batch doc sync */
export interface DocFtsInput {
  docId: string;
  title: string;
  html: string;
}

/* ---------- Internal Row Types ---------- */

interface DocFtsRow {
  doc_id: string;
  workspace_id: string;
  title: string;
  snippet: string;
  rank: number;
}

interface EntityFtsRow {
  entity_id: string;
  workspace_id: string;
  name: string;
  aliases: string;
  rank: number;
}

/** Batch size for FTS5 workspace-level sync operations */
const FTS_BATCH_SIZE = 100;

/* ---------- FTS5 Query Sanitization ---------- */

/**
 * Escape special FTS5 characters for safe MATCH queries.
 *
 * Strategy: Wrap each whitespace-separated token in double quotes.
 * This treats every token as a literal phrase (no special meaning).
 * FTS5 operators (AND, OR, NOT, NEAR) and special chars (*, ^, :, +, -)
 * are neutralized inside quoted strings.
 * Empty/whitespace-only input returns empty string.
 */
export function sanitizeFtsQuery(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Split on whitespace, filter out empty tokens,
  // escape any internal double quotes by doubling them (FTS5 convention),
  // wrap each in quotes
  const tokens = trimmed
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)

  return tokens.join(" ");
}

/* ---------- Document FTS Sync ---------- */

/**
 * Sync a document to the docs_fts index.
 * Converts HTML to plain text and inserts/updates in FTS5.
 * FTS5 does not support UPDATE, so this does DELETE + INSERT.
 */
export async function syncDocToFts(
  docId: string,
  workspaceId: string,
  title: string,
  html: string
): Promise<void> {
  try {
    const contentText = htmlToPlainText(html);

    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM docs_fts WHERE doc_id = ?`, [docId]);
      await tx.run(`
        INSERT INTO docs_fts (doc_id, workspace_id, title, content_text)
        VALUES (?, ?, ?, ?)
      `, [docId, workspaceId, title, contentText]);
    });
  } catch (err) {
    console.error("[fts_sync] Failed to sync doc to FTS:", err);
    throw err;
  }
}

/**
 * Remove a document from the docs_fts index.
 */
export async function removeDocFromFts(docId: string): Promise<void> {
  try {
    await db.run(`DELETE FROM docs_fts WHERE doc_id = ?`, [docId]);
  } catch (err) {
    console.error("[fts_sync] Failed to remove doc from FTS:", err);
    throw err;
  }
}

/**
 * Batch sync all docs for a workspace into docs_fts.
 * Clears existing workspace entries first, then inserts in batches of FTS_BATCH_SIZE.
 * Batching prevents holding a write lock on SQLite for the entire rebuild.
 * Caller provides docs with HTML content (from Yjs, not from SQLite).
 */
export async function syncWorkspaceDocsToFts(
  workspaceId: string,
  docs: DocFtsInput[]
): Promise<number> {
  try {
    // Clear all existing FTS entries first (single fast operation)
    await db.run(`DELETE FROM docs_fts WHERE workspace_id = ?`, [workspaceId]);

    // Insert in batches to avoid long-running transactions
    for (let i = 0; i < docs.length; i += FTS_BATCH_SIZE) {
      const batch = docs.slice(i, i + FTS_BATCH_SIZE);
      await db.transaction(async (tx) => {
        for (const doc of batch) {
          const contentText = htmlToPlainText(doc.html);
          await tx.run(`
            INSERT INTO docs_fts (doc_id, workspace_id, title, content_text)
            VALUES (?, ?, ?, ?)
          `, [doc.docId, workspaceId, doc.title, contentText]);
        }
      });
    }

    return docs.length;
  } catch (err) {
    console.error("[fts_sync] Failed to batch sync workspace docs to FTS:", err);
    throw err;
  }
}

/* ---------- Entity FTS Sync ---------- */

/**
 * Sync an entity to the entities_fts index.
 * FTS5 DELETE + INSERT for update semantics.
 * Aliases are joined as space-separated string for FTS indexing.
 */
export async function syncEntityToFts(
  entityId: string,
  workspaceId: string,
  name: string,
  aliases: string[]
): Promise<void> {
  try {
    const aliasText = aliases.join(" ");

    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM entities_fts WHERE entity_id = ?`, [entityId]);
      await tx.run(`
        INSERT INTO entities_fts (entity_id, workspace_id, name, aliases)
        VALUES (?, ?, ?, ?)
      `, [entityId, workspaceId, name, aliasText]);
    });
  } catch (err) {
    console.error("[fts_sync] Failed to sync entity to FTS:", err);
    throw err;
  }
}

/**
 * Remove an entity from the entities_fts index.
 */
export async function removeEntityFromFts(entityId: string): Promise<void> {
  try {
    await db.run(`DELETE FROM entities_fts WHERE entity_id = ?`, [entityId]);
  } catch (err) {
    console.error("[fts_sync] Failed to remove entity from FTS:", err);
    throw err;
  }
}

/**
 * Batch sync all entities for a workspace into entities_fts.
 * Reads directly from workspace_entities table (entity data is in SQLite).
 * Clears existing workspace entries first, then inserts in batches of FTS_BATCH_SIZE.
 */
export async function syncWorkspaceEntitiesToFts(workspaceId: string): Promise<number> {
  try {
    // Read entities from workspace_entities table
    const entities = await db.queryAll<{
      id: string;
      workspace_id: string;
      name: string;
      aliases_json: string;
    }>(`
      SELECT id, workspace_id, name, aliases_json
      FROM workspace_entities
      WHERE workspace_id = ?
    `, [workspaceId]);

    // Clear all existing FTS entries first (single fast operation)
    await db.run(`DELETE FROM entities_fts WHERE workspace_id = ?`, [workspaceId]);

    // Insert in batches to avoid long-running transactions
    for (let i = 0; i < entities.length; i += FTS_BATCH_SIZE) {
      const batch = entities.slice(i, i + FTS_BATCH_SIZE);
      await db.transaction(async (tx) => {
        for (const entity of batch) {
          let aliases: string[] = [];
          try {
            aliases = JSON.parse(entity.aliases_json);
          } catch {
            aliases = [];
          }
          const aliasText = aliases.join(" ");
          await tx.run(`
            INSERT INTO entities_fts (entity_id, workspace_id, name, aliases)
            VALUES (?, ?, ?, ?)
          `, [entity.id, entity.workspace_id, entity.name, aliasText]);
        }
      });
    }

    return entities.length;
  } catch (err) {
    console.error("[fts_sync] Failed to batch sync workspace entities to FTS:", err);
    throw err;
  }
}

/* ---------- FTS5 Query Helpers ---------- */

/**
 * Search documents via FTS5 with ranked results and snippets.
 *
 * Uses the FTS5 snippet() function for context extraction and
 * the built-in rank column for BM25 relevance scoring.
 * Returns empty array if query is empty or on error.
 */
export async function searchDocsFts(
  workspaceId: string,
  query: string,
  opts?: FtsSearchOptions
): Promise<DocFtsResult[]> {
  const sanitized = sanitizeFtsQuery(query);
  if (!sanitized) return [];

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const snippetLength = opts?.snippetLength ?? 64;

  try {
    // snippet(table, column_index, open_marker, close_marker, ellipsis, max_tokens)
    // Column indexes: 0=doc_id, 1=workspace_id, 2=title, 3=content_text
    const rows = await db.queryAll<DocFtsRow>(`
      SELECT
        doc_id,
        workspace_id,
        title,
        snippet(docs_fts, 3, '<mark>', '</mark>', '...', ?) AS snippet,
        rank
      FROM docs_fts
      WHERE docs_fts MATCH ? AND workspace_id = ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `, [snippetLength, sanitized, workspaceId, limit, offset]);

    return rows.map((row) => ({
      docId: row.doc_id,
      workspaceId: row.workspace_id,
      title: row.title,
      snippet: row.snippet,
      rank: row.rank,
    }));
  } catch (err) {
    console.error("[fts_sync] Failed to search docs FTS:", err);
    return [];
  }
}

/**
 * Search entities via FTS5 with ranked results.
 * Searches across both name and aliases columns.
 * Returns empty array if query is empty or on error.
 */
export async function searchEntitiesFts(
  workspaceId: string,
  query: string,
  opts?: FtsSearchOptions
): Promise<EntityFtsResult[]> {
  const sanitized = sanitizeFtsQuery(query);
  if (!sanitized) return [];

  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  try {
    const rows = await db.queryAll<EntityFtsRow>(`
      SELECT
        entity_id,
        workspace_id,
        name,
        aliases,
        rank
      FROM entities_fts
      WHERE entities_fts MATCH ? AND workspace_id = ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `, [sanitized, workspaceId, limit, offset]);

    return rows.map((row) => ({
      entityId: row.entity_id,
      workspaceId: row.workspace_id,
      name: row.name,
      aliases: row.aliases,
      rank: row.rank,
    }));
  } catch (err) {
    console.error("[fts_sync] Failed to search entities FTS:", err);
    return [];
  }
}

/* ---------- Export aggregated store object ---------- */

export const FtsSync = {
  // Document sync
  syncDoc: syncDocToFts,
  removeDoc: removeDocFromFts,
  syncWorkspaceDocs: syncWorkspaceDocsToFts,

  // Entity sync
  syncEntity: syncEntityToFts,
  removeEntity: removeEntityFromFts,
  syncWorkspaceEntities: syncWorkspaceEntitiesToFts,

  // Query helpers
  searchDocs: searchDocsFts,
  searchEntities: searchEntitiesFts,

  // Utilities
  sanitizeQuery: sanitizeFtsQuery,
};
