import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { config } from '../config';
import { ensureDir, writeFileAtomic, sha256Hex } from './fs';
import type { ProofPacket, ProofKind, ProofActor } from '../types/proofs';

export function stableDocxDir(docId: string): string {
  return path.join(config.storage.exports, `doc-${docId}`);
}

function isoStamp(): string {
  return new Date().toISOString();
}

/** e.g. 2025-10-22T12:53:36.123Z → 20251022T125336Z */
function safeStampForFilename(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * Sanitize a string for use inside a filename (Windows-safe).
 * - Replaces illegal chars \ / : * ? " < > | and control chars with _
 * - Trims trailing dots/spaces (illegal on Windows)
 * - Avoids reserved device names (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
 * - Collapses repeated underscores and trims to a sensible length
 */
function safeFilePart(s: string, maxLen = 120): string {
  let out = String(s ?? '').trim();

  // Replace illegal characters (and control chars)
  out = out.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_');

  // Collapse multiple underscores
  out = out.replace(/_+/g, '_');

  // Disallow trailing dot/space on Windows
  out = out.replace(/[. ]+$/, '');

  if (!out) out = 'x';

  // Avoid reserved device names (exact match)
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) {
    out = `_${out}`;
  }

  // Truncate to keep filenames reasonable
  if (out.length > maxLen) out = out.slice(0, maxLen);

  return out;
}

export function newProofPacket(
  kind: ProofKind,
  actor: ProofActor,
  input: unknown,
  output: unknown,
  docId?: string
): ProofPacket {
  const timestamp = isoStamp();
  const id = crypto.randomUUID();
  const inputHash =
    typeof input === 'string' ? sha256Hex(input) : sha256Hex(Buffer.from(JSON.stringify(input ?? {})));
  const outputHash =
    typeof output === 'string' ? sha256Hex(output) : sha256Hex(Buffer.from(JSON.stringify(output ?? {})));
  return {
    id,
    kind,
    timestamp,
    docId,
    actor,
    input,
    output,
    hashes: { input: inputHash, output: outputHash },
  };
}

export async function writeProofPacket(packet: ProofPacket): Promise<string> {
  // Keep the directory keyed by the raw docId so the rest of the system can find it.
  const dir = path.join(config.storage.proofs, packet.docId ?? '_unsorted');
  await ensureDir(dir);

  const stamp = safeStampForFilename(packet.timestamp);
  const kindPart = safeFilePart(String(packet.kind));  // ← replaces ':' in 'export:docx' with '_'
  const idPart = safeFilePart(packet.id);

  const file = path.join(dir, `${stamp}_${kindPart}_${idPart}.json`);
  await writeFileAtomic(file, Buffer.from(JSON.stringify(packet, null, 2), 'utf8'));
  return file;
}

/** Provenance recorder may be undefined, sync, or async. */
export type ProvenanceRecorder = (p: ProofPacket) => Promise<void> | void;

export async function recordProvenanceIfProvided(
  provenanceRecorder: ProvenanceRecorder | undefined,
  packet: ProofPacket
): Promise<void> {
  if (!provenanceRecorder) return;
  try {
    await Promise.resolve(provenanceRecorder(packet));
  } catch {
    // non-fatal by design
  }
}
