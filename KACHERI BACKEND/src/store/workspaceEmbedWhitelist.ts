// KACHERI BACKEND/src/store/workspaceEmbedWhitelist.ts
// Slice E7: Per-workspace external embed domain whitelist.
//
// Stores custom domains that extend the default embed whitelist.
// See: Docs/Roadmap/beyle-platform-unified-roadmap.md — Slice E7

import { db } from "../db";

/* ---------- Default Whitelist ---------- */

/**
 * Default embed whitelist — matches EMBED_WHITELIST in
 * KACHERI FRONTEND/src/kcl/types.ts.
 * These domains are always allowed regardless of workspace customization.
 */
export const DEFAULT_EMBED_DOMAINS: readonly string[] = [
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "codepen.io",
  "loom.com",
  "www.loom.com",
];

/* ---------- Types ---------- */

interface WhitelistRow {
  workspace_id: string;
  domains_json: string;
  updated_at: number;
}

export interface EmbedWhitelistResult {
  defaults: string[];
  custom: string[];
  effective: string[];
}

/* ---------- Helpers ---------- */

function parseDomains(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d: unknown) => typeof d === "string" && d.trim().length > 0);
  } catch {
    return [];
  }
}

/* ---------- Store Operations ---------- */

/**
 * Get custom domains for a workspace. Returns empty array if no row exists.
 */
export async function getCustomDomains(workspaceId: string): Promise<string[]> {
  try {
    const row = await db.queryOne<WhitelistRow>(
      `SELECT domains_json FROM workspace_embed_whitelist WHERE workspace_id = ?`,
      [workspaceId]
    );

    return row ? parseDomains(row.domains_json) : [];
  } catch (err) {
    console.error("[embedWhitelist] Failed to get custom domains:", err);
    return [];
  }
}

/**
 * Set custom domains for a workspace. Upserts (INSERT OR REPLACE).
 */
export async function setCustomDomains(workspaceId: string, domains: string[]): Promise<string[]> {
  const now = Date.now();
  const cleaned = domains
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);

  // Deduplicate
  const unique = [...new Set(cleaned)];
  const json = JSON.stringify(unique);

  try {
    await db.run(`
      INSERT OR REPLACE INTO workspace_embed_whitelist (workspace_id, domains_json, updated_at)
      VALUES (?, ?, ?)
    `, [workspaceId, json, now]);

    return unique;
  } catch (err) {
    console.error("[embedWhitelist] Failed to set custom domains:", err);
    throw err;
  }
}

/**
 * Get the effective whitelist (defaults + custom, deduplicated).
 */
export async function getEffectiveWhitelist(workspaceId: string): Promise<EmbedWhitelistResult> {
  const custom = await getCustomDomains(workspaceId);
  const defaults = [...DEFAULT_EMBED_DOMAINS];

  // Merge and deduplicate
  const effectiveSet = new Set([...defaults, ...custom]);
  const effective = [...effectiveSet];

  return { defaults, custom, effective };
}

/* ---------- Validation ---------- */

/**
 * Validate a domain string. Must be a valid hostname (no protocol, no path, no port).
 */
export function isValidDomain(domain: string): boolean {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return false;

  // Reject if it contains protocol, path, port, or whitespace
  if (/[:/\s]/.test(trimmed)) return false;

  // Basic hostname pattern: labels separated by dots, each label 1-63 chars
  const hostnamePattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  return hostnamePattern.test(trimmed);
}

/* ---------- Aggregated Store ---------- */

export const WorkspaceEmbedWhitelistStore = {
  getCustomDomains,
  setCustomDomains,
  getEffectiveWhitelist,
  isValidDomain,
  DEFAULT_EMBED_DOMAINS,
};
