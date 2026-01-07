// KACHERI BACKEND/src/jobs/workers/verify.ts
// P4.3: Verification job worker
//
// Handles verify:export and verify:compose jobs.

import fs from "fs/promises";
import crypto from "crypto";
import { Job, VerifyExportPayload, VerifyComposePayload, VerifyResult } from "../types";
import { ArtifactsStore } from "../../store/artifacts";
import { getStorage } from "../../storage";

/* ---------- Export Verification ---------- */
export async function verifyExportJob(
  job: Job<VerifyExportPayload>
): Promise<VerifyResult> {
  const { artifactId, hash, path } = job.payload;

  const artifact = ArtifactsStore.getById(artifactId);
  if (!artifact) {
    return { status: "miss", message: "Artifact not found" };
  }

  try {
    // Read file from storage
    const storage = getStorage();
    let fileBuffer: Buffer;

    try {
      fileBuffer = await storage.read(path);
    } catch {
      // Try local filesystem as fallback
      try {
        fileBuffer = await fs.readFile(path);
      } catch {
        ArtifactsStore.updateVerification(artifactId, "miss");
        return { status: "miss", message: "File not found in storage" };
      }
    }

    // Calculate hash
    const computedHash = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    // Compare hashes
    if (computedHash === hash) {
      ArtifactsStore.updateVerification(artifactId, "pass");
      return { status: "pass" };
    } else {
      ArtifactsStore.updateVerification(artifactId, "fail");
      return {
        status: "fail",
        message: `Hash mismatch: expected ${hash}, got ${computedHash}`,
      };
    }
  } catch (err) {
    const error = err as Error;
    ArtifactsStore.updateVerification(artifactId, "fail");
    return { status: "fail", message: error.message };
  }
}

/* ---------- Compose Verification ---------- */
export async function verifyComposeJob(
  job: Job<VerifyComposePayload>
): Promise<VerifyResult> {
  const { artifactId } = job.payload;

  const artifact = ArtifactsStore.getById(artifactId);
  if (!artifact) {
    return { status: "miss", message: "Artifact not found" };
  }

  try {
    // Parse the payload to get compose details
    const payload = JSON.parse(artifact.payload);

    // Check if payload has required fields
    if (!payload.prompt || !payload.outputHash) {
      ArtifactsStore.updateVerification(artifactId, "fail");
      return { status: "fail", message: "Invalid compose proof payload" };
    }

    // For compose verification, we check the integrity of the stored payload
    // Full determinism check (re-running AI) is expensive and optional
    const payloadHash = crypto
      .createHash("sha256")
      .update(artifact.payload)
      .digest("hex");

    // Verify payload integrity
    if (artifact.hash && payloadHash !== artifact.hash) {
      ArtifactsStore.updateVerification(artifactId, "fail");
      return { status: "fail", message: "Payload integrity check failed" };
    }

    ArtifactsStore.updateVerification(artifactId, "pass");
    return { status: "pass" };
  } catch (err) {
    const error = err as Error;
    ArtifactsStore.updateVerification(artifactId, "fail");
    return { status: "fail", message: error.message };
  }
}

/* ---------- Worker Registration ---------- */
export function registerVerifyWorkers(
  registerHandler: (type: string, handler: (job: Job) => Promise<unknown>) => void
): void {
  registerHandler("verify:export", verifyExportJob as any);
  registerHandler("verify:compose", verifyComposeJob as any);
}
