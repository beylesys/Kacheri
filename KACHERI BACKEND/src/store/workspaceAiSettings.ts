// KACHERI BACKEND/src/store/workspaceAiSettings.ts
// Per-workspace AI provider, model, and BYOK API key storage.
// API keys are encrypted at rest using AES-256-GCM.
//
// Tables: workspace_ai_settings
// See: Plan — AI Model Configuration + BYOK

import { db } from "../db";
import crypto from "node:crypto";

/* ---------- Encryption helpers ---------- */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getEncryptionKey(): Buffer {
  const secret =
    process.env.AI_ENCRYPTION_SECRET || "dev-kacheri-ai-encryption-key-change-in-production";
  // Derive a 32-byte key from the secret using SHA-256
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack as: base64(iv + tag + ciphertext)
  const packed = Buffer.concat([iv, tag, encrypted]);
  return packed.toString("base64");
}

function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encoded, "base64");
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/* ---------- Types ---------- */

interface AiSettingsRow {
  workspace_id: string;
  provider: string | null;
  model: string | null;
  api_key_enc: string | null;
  updated_at: number;
}

/** Public shape — never exposes the raw key */
export interface WorkspaceAiSettings {
  workspaceId: string;
  provider: string | null;
  model: string | null;
  hasApiKey: boolean;
  updatedAt: number;
}

/** Internal shape — includes decrypted key for AI pipeline use */
export interface WorkspaceAiSettingsWithKey extends WorkspaceAiSettings {
  apiKey: string | null;
}

export interface UpsertAiSettingsInput {
  provider?: string | null;
  model?: string | null;
  apiKey?: string | null;
}

/* ---------- Row → Domain ---------- */

function rowToPublic(row: AiSettingsRow): WorkspaceAiSettings {
  return {
    workspaceId: row.workspace_id,
    provider: row.provider,
    model: row.model,
    hasApiKey: !!row.api_key_enc,
    updatedAt: row.updated_at,
  };
}

function rowToWithKey(row: AiSettingsRow): WorkspaceAiSettingsWithKey {
  let apiKey: string | null = null;
  if (row.api_key_enc) {
    try {
      apiKey = decrypt(row.api_key_enc);
    } catch {
      // Decryption failed — treat as no key (secret may have changed)
      apiKey = null;
    }
  }
  return {
    ...rowToPublic(row),
    apiKey,
  };
}

/* ---------- Store ---------- */

export const WorkspaceAiSettingsStore = {
  /** Get workspace AI settings (public — no key exposed) */
  async get(workspaceId: string): Promise<WorkspaceAiSettings | null> {
    const row = await db.queryOne<AiSettingsRow>(
      "SELECT * FROM workspace_ai_settings WHERE workspace_id = ?",
      [workspaceId]
    );
    return row ? rowToPublic(row) : null;
  },

  /** Get workspace AI settings with decrypted API key (internal use only) */
  async getWithKey(workspaceId: string): Promise<WorkspaceAiSettingsWithKey | null> {
    const row = await db.queryOne<AiSettingsRow>(
      "SELECT * FROM workspace_ai_settings WHERE workspace_id = ?",
      [workspaceId]
    );
    return row ? rowToWithKey(row) : null;
  },

  /** Create or update workspace AI settings */
  async upsert(workspaceId: string, input: UpsertAiSettingsInput): Promise<WorkspaceAiSettings> {
    const now = Date.now();
    const existing = await db.queryOne<AiSettingsRow>(
      "SELECT * FROM workspace_ai_settings WHERE workspace_id = ?",
      [workspaceId]
    );

    // Determine values — undefined means "keep existing", null means "clear"
    const provider =
      input.provider === undefined
        ? (existing?.provider ?? null)
        : input.provider;
    const model =
      input.model === undefined
        ? (existing?.model ?? null)
        : input.model;

    let apiKeyEnc: string | null;
    if (input.apiKey === undefined) {
      // Keep existing key
      apiKeyEnc = existing?.api_key_enc ?? null;
    } else if (input.apiKey === null || input.apiKey === "") {
      // Clear key
      apiKeyEnc = null;
    } else {
      // Encrypt new key
      apiKeyEnc = encrypt(input.apiKey);
    }

    if (existing) {
      await db.run(
        `UPDATE workspace_ai_settings
         SET provider = ?, model = ?, api_key_enc = ?, updated_at = ?
         WHERE workspace_id = ?`,
        [provider, model, apiKeyEnc, now, workspaceId]
      );
    } else {
      await db.run(
        `INSERT INTO workspace_ai_settings (workspace_id, provider, model, api_key_enc, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [workspaceId, provider, model, apiKeyEnc, now]
      );
    }

    return (await this.get(workspaceId))!;
  },

  /** Remove workspace AI settings (revert to server defaults) */
  async remove(workspaceId: string): Promise<void> {
    await db.run(
      "DELETE FROM workspace_ai_settings WHERE workspace_id = ?",
      [workspaceId]
    );
  },
};
