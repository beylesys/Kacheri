// KACHERI BACKEND/src/store/clauseUsageLog.ts
// Clause Library: Store for clause insertion usage tracking
//
// Tables: clause_usage_log
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md - Slice B4

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type InsertionMethod = "manual" | "ai_suggest" | "template";

// Domain type (camelCase, for API)
export interface ClauseUsageLog {
  id: string;
  clauseId: string;
  clauseVersion: number;
  docId: string;
  insertedBy: string;
  insertionMethod: InsertionMethod;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface ClauseUsageLogRow {
  id: string;
  clause_id: string;
  clause_version: number;
  doc_id: string;
  inserted_by: string;
  insertion_method: string;
  created_at: number;
}

export interface CreateUsageLogInput {
  clauseId: string;
  clauseVersion: number;
  docId: string;
  insertedBy: string;
  insertionMethod?: InsertionMethod;
}

/* ---------- Row to Domain Converters ---------- */

function rowToUsageLog(row: ClauseUsageLogRow): ClauseUsageLog {
  return {
    id: row.id,
    clauseId: row.clause_id,
    clauseVersion: row.clause_version,
    docId: row.doc_id,
    insertedBy: row.inserted_by,
    insertionMethod: row.insertion_method as InsertionMethod,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ---------- Validation ---------- */

const VALID_METHODS: InsertionMethod[] = ["manual", "ai_suggest", "template"];

export function validateInsertionMethod(value: string): value is InsertionMethod {
  return VALID_METHODS.includes(value as InsertionMethod);
}

/* ---------- CRUD Operations ---------- */

/** Log a clause insertion */
export async function logUsage(input: CreateUsageLogInput): Promise<ClauseUsageLog> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO clause_usage_log (
        id, clause_id, clause_version, doc_id,
        inserted_by, insertion_method, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.clauseId,
      input.clauseVersion,
      input.docId,
      input.insertedBy,
      input.insertionMethod ?? "manual",
      now,
    ]);

    return (await getById(id))!;
  } catch (err) {
    console.error("[clauseUsageLog] Failed to log usage:", err);
    throw err;
  }
}

/** Get usage log entry by ID */
export async function getById(id: string): Promise<ClauseUsageLog | null> {
  try {
    const row = await db.queryOne<ClauseUsageLogRow>(
      `SELECT * FROM clause_usage_log WHERE id = ?`,
      [id]
    );

    return row ? rowToUsageLog(row) : null;
  } catch (err) {
    console.error("[clauseUsageLog] Failed to get usage by id:", err);
    return null;
  }
}

/** Get all usage logs for a clause */
export async function getByClause(clauseId: string): Promise<ClauseUsageLog[]> {
  try {
    const rows = await db.queryAll<ClauseUsageLogRow>(`
      SELECT * FROM clause_usage_log
      WHERE clause_id = ?
      ORDER BY created_at DESC
    `, [clauseId]);

    return rows.map(rowToUsageLog);
  } catch (err) {
    console.error("[clauseUsageLog] Failed to get usage by clause:", err);
    return [];
  }
}

/** Get all usage logs for a document */
export async function getByDoc(docId: string): Promise<ClauseUsageLog[]> {
  try {
    const rows = await db.queryAll<ClauseUsageLogRow>(`
      SELECT * FROM clause_usage_log
      WHERE doc_id = ?
      ORDER BY created_at DESC
    `, [docId]);

    return rows.map(rowToUsageLog);
  } catch (err) {
    console.error("[clauseUsageLog] Failed to get usage by doc:", err);
    return [];
  }
}

/** Get all usage logs by a user */
export async function getByUser(userId: string): Promise<ClauseUsageLog[]> {
  try {
    const rows = await db.queryAll<ClauseUsageLogRow>(`
      SELECT * FROM clause_usage_log
      WHERE inserted_by = ?
      ORDER BY created_at DESC
    `, [userId]);

    return rows.map(rowToUsageLog);
  } catch (err) {
    console.error("[clauseUsageLog] Failed to get usage by user:", err);
    return [];
  }
}

/* ---------- Export aggregated store object ---------- */

export const ClauseUsageLogStore = {
  logUsage,
  getById,
  getByClause,
  getByDoc,
  getByUser,
  // Validators
  validateInsertionMethod,
};
