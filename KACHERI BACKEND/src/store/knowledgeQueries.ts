// KACHERI BACKEND/src/store/knowledgeQueries.ts
// Cross-Document Intelligence: Store for semantic search query logs
//
// Tables: knowledge_queries
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md - Slice 1

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type QueryType = "semantic_search" | "entity_search" | "related_docs";

// Domain type (camelCase, for API)
export interface KnowledgeQuery {
  id: string;
  workspaceId: string;
  queryText: string;
  queryType: QueryType;
  results: unknown[] | null;
  resultCount: number;
  proofId: string | null;
  queriedBy: string;
  durationMs: number | null;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface KnowledgeQueryRow {
  id: string;
  workspace_id: string;
  query_text: string;
  query_type: string;
  results_json: string | null;
  result_count: number;
  proof_id: string | null;
  queried_by: string;
  duration_ms: number | null;
  created_at: number;
}

export interface CreateQueryInput {
  workspaceId: string;
  queryText: string;
  queryType: QueryType;
  results?: unknown[];
  resultCount?: number;
  proofId?: string;
  queriedBy: string;
  durationMs?: number;
}

/* ---------- Row to Domain Converters ---------- */

function rowToQuery(row: KnowledgeQueryRow): KnowledgeQuery {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    queryText: row.query_text,
    queryType: row.query_type as QueryType,
    results: parseJson(row.results_json, null),
    resultCount: row.result_count,
    proofId: row.proof_id,
    queriedBy: row.queried_by,
    durationMs: row.duration_ms,
    createdAt: new Date(row.created_at).toISOString(),
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

/* ---------- CRUD Operations ---------- */

/** Create a new knowledge query record */
export async function createQuery(input: CreateQueryInput): Promise<KnowledgeQuery> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(
      `INSERT INTO knowledge_queries (
        id, workspace_id, query_text, query_type,
        results_json, result_count, proof_id,
        queried_by, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workspaceId,
        input.queryText,
        input.queryType,
        input.results ? JSON.stringify(input.results) : null,
        input.resultCount ?? 0,
        input.proofId ?? null,
        input.queriedBy,
        input.durationMs ?? null,
        now,
      ]
    );

    return (await getQueryById(id))!;
  } catch (err) {
    console.error("[knowledge_queries] Failed to create query:", err);
    throw err;
  }
}

/** Get query by ID */
export async function getQueryById(id: string): Promise<KnowledgeQuery | null> {
  try {
    const row = await db.queryOne<KnowledgeQueryRow>(
      `SELECT * FROM knowledge_queries WHERE id = ?`,
      [id]
    );
    return row ? rowToQuery(row) : null;
  } catch (err) {
    console.error("[knowledge_queries] Failed to get query by id:", err);
    return null;
  }
}

/** Get queries for a workspace with optional filters and pagination */
export async function getQueriesByWorkspace(
  workspaceId: string,
  opts?: {
    queryType?: QueryType;
    limit?: number;
    offset?: number;
  }
): Promise<KnowledgeQuery[]> {
  try {
    let query = `SELECT * FROM knowledge_queries WHERE workspace_id = ?`;
    const params: unknown[] = [workspaceId];

    if (opts?.queryType) {
      query += ` AND query_type = ?`;
      params.push(opts.queryType);
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

    const rows = await db.queryAll<KnowledgeQueryRow>(query, params);
    return rows.map(rowToQuery);
  } catch (err) {
    console.error("[knowledge_queries] Failed to get queries:", err);
    return [];
  }
}

/** Get recent queries for a workspace (shortcut) */
export async function getRecentQueries(
  workspaceId: string,
  limit: number = 10
): Promise<KnowledgeQuery[]> {
  return getQueriesByWorkspace(workspaceId, { limit });
}

/** Count queries for a workspace */
export async function countQueries(workspaceId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM knowledge_queries WHERE workspace_id = ?`,
      [workspaceId]
    );
    return row?.count ?? 0;
  } catch (err) {
    console.error("[knowledge_queries] Failed to count queries:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const KnowledgeQueriesStore = {
  create: createQuery,
  getById: getQueryById,
  getByWorkspace: getQueriesByWorkspace,
  getRecent: getRecentQueries,
  count: countQueries,
};
