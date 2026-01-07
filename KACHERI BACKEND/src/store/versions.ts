// KACHERI BACKEND/src/store/versions.ts
// Document version history store with CRUD operations and text diff.

import { db } from '../db';
import { createHash } from 'crypto';

// ============================================
// Types
// ============================================

// API-friendly version metadata (no full snapshot)
export interface DocVersionMeta {
  id: number;
  docId: string;
  versionNumber: number;
  name: string | null;
  snapshotHash: string;
  createdBy: string;
  createdAt: string;  // ISO
  proofId: number | null;
  metadata: { wordCount?: number; charCount?: number; notes?: string } | null;
}

// Full version with snapshot content
export interface DocVersionFull extends DocVersionMeta {
  snapshotHtml: string;
  snapshotText: string;
}

// Internal row type from SQLite
interface DocVersionRow {
  id: number;
  doc_id: string;
  version_number: number;
  name: string | null;
  snapshot_html: string;
  snapshot_text: string;
  snapshot_hash: string;
  created_by: string;
  created_at: number;
  proof_id: number | null;
  metadata: string | null;
}

// Create version params
export interface CreateVersionParams {
  docId: string;
  name?: string | null;
  snapshotHtml: string;
  snapshotText: string;
  createdBy: string;
  proofId?: number | null;
  metadata?: { wordCount?: number; charCount?: number; notes?: string };
}

// Diff types
export interface VersionDiff {
  fromVersion: number;
  toVersion: number;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  type: 'add' | 'remove' | 'context';
  lineStart: number;
  content: string[];
}

// ============================================
// Row Conversion
// ============================================

function rowToVersionMeta(row: DocVersionRow): DocVersionMeta {
  let metadata: DocVersionMeta['metadata'] = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = null;
    }
  }

  return {
    id: row.id,
    docId: row.doc_id,
    versionNumber: row.version_number,
    name: row.name,
    snapshotHash: row.snapshot_hash,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    proofId: row.proof_id,
    metadata,
  };
}

function rowToVersionFull(row: DocVersionRow): DocVersionFull {
  const meta = rowToVersionMeta(row);
  return {
    ...meta,
    snapshotHtml: row.snapshot_html,
    snapshotText: row.snapshot_text,
  };
}

// ============================================
// Hash Computation
// ============================================

function computeSnapshotHash(snapshotHtml: string, snapshotText: string): string {
  const combined = snapshotHtml + '\n---\n' + snapshotText;
  return createHash('sha256').update(combined, 'utf8').digest('hex');
}

// ============================================
// CRUD Operations
// ============================================

/**
 * Get the latest version number for a document.
 * Returns 0 if no versions exist.
 */
export function getLatestVersionNumber(docId: string): number {
  try {
    const row = db.prepare(`
      SELECT MAX(version_number) as max_num
      FROM doc_versions
      WHERE doc_id = ?
    `).get(docId) as { max_num: number | null } | undefined;

    return row?.max_num ?? 0;
  } catch (err) {
    console.error('[versions] Failed to get latest version number:', err);
    return 0;
  }
}

/**
 * Create a new version snapshot.
 * Version number auto-increments per document.
 */
export function createVersion(params: CreateVersionParams): DocVersionMeta | null {
  const {
    docId,
    name = null,
    snapshotHtml,
    snapshotText,
    createdBy,
    proofId = null,
    metadata,
  } = params;

  const now = Date.now();
  const versionNumber = getLatestVersionNumber(docId) + 1;
  const snapshotHash = computeSnapshotHash(snapshotHtml, snapshotText);
  const metadataJson = metadata ? JSON.stringify(metadata) : null;

  try {
    const result = db.prepare(`
      INSERT INTO doc_versions (
        doc_id, version_number, name, snapshot_html, snapshot_text,
        snapshot_hash, created_by, created_at, proof_id, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId, versionNumber, name, snapshotHtml, snapshotText,
      snapshotHash, createdBy, now, proofId, metadataJson
    );

    const versionId = result.lastInsertRowid as number;
    return getVersionMeta(versionId);
  } catch (err) {
    console.error('[versions] Failed to create version:', err);
    return null;
  }
}

/**
 * Get version metadata by ID.
 */
export function getVersionMeta(versionId: number): DocVersionMeta | null {
  try {
    const row = db.prepare(`
      SELECT id, doc_id, version_number, name, snapshot_html, snapshot_text,
             snapshot_hash, created_by, created_at, proof_id, metadata
      FROM doc_versions
      WHERE id = ?
    `).get(versionId) as DocVersionRow | undefined;

    return row ? rowToVersionMeta(row) : null;
  } catch (err) {
    console.error('[versions] Failed to get version meta:', err);
    return null;
  }
}

/**
 * Get full version with snapshot content.
 */
export function getVersion(versionId: number): DocVersionFull | null {
  try {
    const row = db.prepare(`
      SELECT id, doc_id, version_number, name, snapshot_html, snapshot_text,
             snapshot_hash, created_by, created_at, proof_id, metadata
      FROM doc_versions
      WHERE id = ?
    `).get(versionId) as DocVersionRow | undefined;

    return row ? rowToVersionFull(row) : null;
  } catch (err) {
    console.error('[versions] Failed to get version:', err);
    return null;
  }
}

/**
 * Get full version by document ID and version number.
 */
export function getVersionByNumber(docId: string, versionNumber: number): DocVersionFull | null {
  try {
    const row = db.prepare(`
      SELECT id, doc_id, version_number, name, snapshot_html, snapshot_text,
             snapshot_hash, created_by, created_at, proof_id, metadata
      FROM doc_versions
      WHERE doc_id = ? AND version_number = ?
    `).get(docId, versionNumber) as DocVersionRow | undefined;

    return row ? rowToVersionFull(row) : null;
  } catch (err) {
    console.error('[versions] Failed to get version by number:', err);
    return null;
  }
}

/**
 * List all versions for a document (metadata only, no snapshots).
 */
export function listVersions(
  docId: string,
  options?: { limit?: number; offset?: number }
): DocVersionMeta[] {
  const { limit = 100, offset = 0 } = options ?? {};

  try {
    const rows = db.prepare(`
      SELECT id, doc_id, version_number, name, snapshot_html, snapshot_text,
             snapshot_hash, created_by, created_at, proof_id, metadata
      FROM doc_versions
      WHERE doc_id = ?
      ORDER BY version_number DESC
      LIMIT ? OFFSET ?
    `).all(docId, limit, offset) as DocVersionRow[];

    return rows.map(rowToVersionMeta);
  } catch (err) {
    console.error('[versions] Failed to list versions:', err);
    return [];
  }
}

/**
 * Get total version count for a document.
 */
export function getVersionCount(docId: string): number {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM doc_versions
      WHERE doc_id = ?
    `).get(docId) as { count: number };

    return row.count;
  } catch (err) {
    console.error('[versions] Failed to get version count:', err);
    return 0;
  }
}

/**
 * Rename a version.
 */
export function renameVersion(versionId: number, name: string | null): DocVersionMeta | null {
  try {
    const info = db.prepare(`
      UPDATE doc_versions
      SET name = ?
      WHERE id = ?
    `).run(name, versionId);

    if (info.changes === 0) {
      return null;
    }

    return getVersionMeta(versionId);
  } catch (err) {
    console.error('[versions] Failed to rename version:', err);
    return null;
  }
}

/**
 * Delete a version.
 */
export function deleteVersion(versionId: number): boolean {
  try {
    const info = db.prepare(`
      DELETE FROM doc_versions
      WHERE id = ?
    `).run(versionId);

    return (info.changes ?? 0) > 0;
  } catch (err) {
    console.error('[versions] Failed to delete version:', err);
    return false;
  }
}

/**
 * Delete all versions for a document.
 * Used when permanently deleting a document.
 */
export function deleteAllDocVersions(docId: string): number {
  try {
    const info = db.prepare(`
      DELETE FROM doc_versions
      WHERE doc_id = ?
    `).run(docId);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[versions] Failed to delete all doc versions:', err);
    return 0;
  }
}

// ============================================
// Text Diff
// ============================================

/**
 * Compute a simple line-based diff between two versions.
 */
export function diffVersions(
  docId: string,
  fromVersionNum: number,
  toVersionNum: number
): VersionDiff | null {
  const fromVersion = getVersionByNumber(docId, fromVersionNum);
  const toVersion = getVersionByNumber(docId, toVersionNum);

  if (!fromVersion || !toVersion) {
    return null;
  }

  const fromLines = fromVersion.snapshotText.split('\n');
  const toLines = toVersion.snapshotText.split('\n');

  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;

  // Simple LCS-based diff algorithm
  const lcs = computeLCS(fromLines, toLines);

  let fromIdx = 0;
  let toIdx = 0;
  let lcsIdx = 0;
  let currentHunk: DiffHunk | null = null;

  while (fromIdx < fromLines.length || toIdx < toLines.length) {
    const lcsLine = lcsIdx < lcs.length ? lcs[lcsIdx] : null;

    // Check if current lines match the LCS
    const fromMatches = fromIdx < fromLines.length && fromLines[fromIdx] === lcsLine;
    const toMatches = toIdx < toLines.length && toLines[toIdx] === lcsLine;

    if (fromMatches && toMatches) {
      // Both match - context line
      if (currentHunk && currentHunk.type !== 'context') {
        hunks.push(currentHunk);
        currentHunk = null;
      }

      // Add context line (limit context to 3 lines before/after changes)
      if (hunks.length > 0 || currentHunk) {
        if (!currentHunk) {
          currentHunk = { type: 'context', lineStart: toIdx + 1, content: [] };
        }
        if (currentHunk.content.length < 3) {
          currentHunk.content.push(toLines[toIdx]);
        }
      }

      fromIdx++;
      toIdx++;
      lcsIdx++;
    } else if (fromIdx < fromLines.length && !fromMatches) {
      // Line removed
      if (currentHunk && currentHunk.type !== 'remove') {
        hunks.push(currentHunk);
        currentHunk = null;
      }
      if (!currentHunk) {
        currentHunk = { type: 'remove', lineStart: fromIdx + 1, content: [] };
      }
      currentHunk.content.push(fromLines[fromIdx]);
      deletions++;
      fromIdx++;
    } else if (toIdx < toLines.length && !toMatches) {
      // Line added
      if (currentHunk && currentHunk.type !== 'add') {
        hunks.push(currentHunk);
        currentHunk = null;
      }
      if (!currentHunk) {
        currentHunk = { type: 'add', lineStart: toIdx + 1, content: [] };
      }
      currentHunk.content.push(toLines[toIdx]);
      additions++;
      toIdx++;
    } else {
      // Edge case: move to next
      break;
    }
  }

  if (currentHunk && currentHunk.content.length > 0) {
    hunks.push(currentHunk);
  }

  // Filter out empty context hunks at start
  const filteredHunks = hunks.filter(h => h.content.length > 0);

  return {
    fromVersion: fromVersionNum,
    toVersion: toVersionNum,
    additions,
    deletions,
    hunks: filteredHunks,
  };
}

/**
 * Compute Longest Common Subsequence (LCS) of two line arrays.
 * Used for computing line-based diff.
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // Build DP table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}
