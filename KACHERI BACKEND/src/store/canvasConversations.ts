// KACHERI BACKEND/src/store/canvasConversations.ts
// Design Studio: Store for per-canvas AI conversation history
//
// Tables: canvas_conversations
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md - Slice A2
//
// Conversation is append-only — no update or delete operations.
// AI conversation history is immutable for proof/audit integrity.

import { db } from "../db";
import { nanoid } from "nanoid";

/* ---------- Types ---------- */

export type ConversationRole = "user" | "assistant" | "system";
export type ActionType = "generate" | "edit" | "style" | "content" | "compose";

const VALID_ROLES: readonly ConversationRole[] = ["user", "assistant", "system"];
const VALID_ACTION_TYPES: readonly ActionType[] = ["generate", "edit", "style", "content", "compose"];

// Domain type (camelCase, for API)
export interface ConversationMessage {
  id: string;
  canvasId: string;
  frameId: string | null;
  role: ConversationRole;
  content: string;
  actionType: ActionType | null;
  docRefs: Array<{ docId: string; section?: string; textUsed?: string }> | null;
  proofId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO string
}

// Row type (snake_case, matches DB)
interface ConversationRow {
  id: string;
  canvas_id: string;
  frame_id: string | null;
  role: string;
  content: string;
  action_type: string | null;
  doc_refs_json: string | null;
  proof_id: string | null;
  metadata_json: string | null;
  created_at: number;
}

export interface CreateMessageInput {
  canvasId: string;
  frameId?: string;
  role: ConversationRole;
  content: string;
  actionType?: ActionType;
  docRefs?: Array<{ docId: string; section?: string; textUsed?: string }>;
  proofId?: string;
  metadata?: Record<string, unknown>;
}

/* ---------- Helpers ---------- */

/** Safely parse JSON with fallback */
function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/* ---------- Row to Domain Converters ---------- */

function rowToMessage(row: ConversationRow): ConversationMessage {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    frameId: row.frame_id,
    role: row.role as ConversationRole,
    content: row.content,
    actionType: row.action_type as ActionType | null,
    docRefs: parseJson(row.doc_refs_json, null),
    proofId: row.proof_id,
    metadata: parseJson<Record<string, unknown> | null>(row.metadata_json, null),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/* ---------- Operations ---------- */

/** Append a message to a canvas conversation (immutable — no update/delete) */
export async function appendMessage(input: CreateMessageInput): Promise<ConversationMessage> {
  const id = nanoid(12);
  const now = Date.now();

  try {
    await db.run(`
      INSERT INTO canvas_conversations (
        id, canvas_id, frame_id, role, content,
        action_type, doc_refs_json, proof_id,
        metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      input.canvasId,
      input.frameId ?? null,
      input.role,
      input.content,
      input.actionType ?? null,
      input.docRefs ? JSON.stringify(input.docRefs) : null,
      input.proofId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
    ]);

    return (await getMessageById(id))!;
  } catch (err) {
    console.error("[canvas_conversations] Failed to append message:", err);
    throw err;
  }
}

/** Get a single message by ID */
export async function getMessageById(id: string): Promise<ConversationMessage | null> {
  try {
    const row = await db.queryOne<ConversationRow>(
      `SELECT * FROM canvas_conversations WHERE id = ?`,
      [id]
    );

    return row ? rowToMessage(row) : null;
  } catch (err) {
    console.error("[canvas_conversations] Failed to get message by id:", err);
    return null;
  }
}

/** Get all messages for a canvas (paginated, chronological order) */
export async function getMessagesByCanvas(
  canvasId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ messages: ConversationMessage[]; total: number }> {
  try {
    // Count query
    const countRow = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvas_conversations WHERE canvas_id = ?
    `, [canvasId]);
    const total = countRow?.count ?? 0;

    // Data query
    let query = `
      SELECT * FROM canvas_conversations
      WHERE canvas_id = ?
      ORDER BY created_at ASC
    `;
    const params: unknown[] = [canvasId];

    if (opts?.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);

      if (opts?.offset) {
        query += ` OFFSET ?`;
        params.push(opts.offset);
      }
    }

    const rows = await db.queryAll<ConversationRow>(query, params);
    return { messages: rows.map(rowToMessage), total };
  } catch (err) {
    console.error("[canvas_conversations] Failed to get messages by canvas:", err);
    return { messages: [], total: 0 };
  }
}

/** Get messages for a specific frame within a canvas */
export async function getMessagesByFrame(
  canvasId: string,
  frameId: string
): Promise<ConversationMessage[]> {
  try {
    const rows = await db.queryAll<ConversationRow>(`
      SELECT * FROM canvas_conversations
      WHERE canvas_id = ? AND frame_id = ?
      ORDER BY created_at ASC
    `, [canvasId, frameId]);

    return rows.map(rowToMessage);
  } catch (err) {
    console.error("[canvas_conversations] Failed to get messages by frame:", err);
    return [];
  }
}

/** Count messages for a canvas */
export async function countMessagesByCanvas(canvasId: string): Promise<number> {
  try {
    const row = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM canvas_conversations WHERE canvas_id = ?
    `, [canvasId]);

    return row?.count ?? 0;
  } catch (err) {
    console.error("[canvas_conversations] Failed to count messages:", err);
    return 0;
  }
}

/* ---------- Export aggregated store object ---------- */

export const CanvasConversationStore = {
  append: appendMessage,
  getById: getMessageById,
  getByCanvas: getMessagesByCanvas,
  getByFrame: getMessagesByFrame,
  countByCanvas: countMessagesByCanvas,
};
