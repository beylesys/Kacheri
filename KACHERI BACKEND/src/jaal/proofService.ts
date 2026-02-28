// KACHERI BACKEND/src/jaal/proofService.ts
// JAAL Proof Service: Creates and manages JAAL-specific proof packets.
// Integrates with the platform provenance and audit systems — Slice S5

import { createHash, randomUUID } from "crypto";
import { JaalProofStore } from "../store/jaalProofs";
import type { JaalProof } from "../store/jaalProofs";
import { JaalSessionStore } from "../store/jaalSessions";
import { recordProvenance } from "../provenance";
import { logAuditEvent } from "../store/audit";

/* ---------- Types ---------- */

export interface CreateJaalProofInput {
  sessionId?: string;
  workspaceId: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
}

/* ---------- Proof Creation ---------- */

/**
 * Create a JAAL proof packet.
 *
 * 1. Compute SHA-256 hash of payload
 * 2. Store in jaal_proofs table
 * 3. Record provenance
 * 4. Increment session action count (if session linked)
 * 5. Log audit event
 */
export async function createJaalProof(input: CreateJaalProofInput): Promise<JaalProof> {
  const { sessionId, workspaceId, userId, kind, payload } = input;

  // Generate proof ID and compute hash
  const id = randomUUID();
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  // Store proof
  const proof = await JaalProofStore.create({
    id,
    sessionId: sessionId ?? null,
    workspaceId,
    userId,
    kind,
    hash,
    payload,
  });

  // Record provenance (using '_jaal' as docId for non-doc proofs)
  try {
    recordProvenance({
      docId: "_jaal",
      action: `jaal:${kind}`,
      actor: "system",
      actorId: userId,
      workspaceId,
      details: { kind, proofId: id, hash },
    });
  } catch (err) {
    console.error("[jaalProofService] Provenance recording failed:", err);
    // Non-fatal: proof is already stored
  }

  // Increment session action count if linked to a session
  if (sessionId) {
    try {
      await JaalSessionStore.incrementActionCount(sessionId);
    } catch (err) {
      console.error("[jaalProofService] Session action count increment failed:", err);
      // Non-fatal
    }
  }

  // Log audit event
  try {
    logAuditEvent({
      workspaceId,
      actorId: userId,
      action: "jaal:proof_create",
      targetType: "jaal_proof",
      targetId: id,
      details: { kind, hash, sessionId: sessionId ?? null },
    });
  } catch (err) {
    console.error("[jaalProofService] Audit logging failed:", err);
    // Non-fatal
  }

  return proof;
}

/* ---------- Read Operations ---------- */

/** Get a single proof by ID */
export async function getProof(id: string): Promise<JaalProof | null> {
  return JaalProofStore.getById(id);
}

/** List proofs for a workspace with optional filters */
export async function listProofs(
  workspaceId: string,
  opts?: { sessionId?: string; kind?: string; limit?: number },
): Promise<JaalProof[]> {
  return JaalProofStore.listByWorkspace(workspaceId, opts);
}
