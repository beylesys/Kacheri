// KACHERI BACKEND/src/sandbox.ts
import fs from "fs";
import path from "path";
import { sha256, writeProofPacket, ensureDir } from "./provenance";
import { repoPath } from "./db";
import { runAiAction, AiActionName } from "./aiActions";

export type SandboxResult = {
  output: string;
  proofIdPath: string; // on disk path to proof JSON
  outputHash: string;
  elapsedMs: number;
  notes: string[];
};

export async function runSandboxedAiAction(params: {
  docId: string;
  action: AiActionName;
  input: { text: string };
  provenanceId: number;
}): Promise<SandboxResult> {
  const started = Date.now();
  // Run the deterministic action
  const { output, notes } = runAiAction(params.action, params.input);
  const elapsedMs = Date.now() - started;

  // Build a proof packet
  const packet = {
    kind: "ai:action",
    docId: params.docId,
    action: params.action,
    startedAt: started,
    elapsedMs,
    inputs: {
      textHash: sha256(params.input.text || ""),
      size: (params.input.text || "").length,
    },
    outputs: {
      textHash: sha256(output),
      size: output.length,
      preview: output.slice(0, 240),
    },
    runtime: {
      engine: "deterministic-heuristic",
      version: "v0",
      notes,
      limits: { cpuMs: 2000, memoryMB: 64 },
    },
    provenanceRef: params.provenanceId,
  };

  // Persist proof packet to storage + DB
  const proof = await writeProofPacket({
    docId: params.docId,
    relatedProvenanceId: params.provenanceId,
    type: "ai:action",
    filePath: null,
    payload: packet,
  });

  return {
    output,
    proofIdPath: proof.path,
    outputHash: packet.outputs.textHash,
    elapsedMs,
    notes,
  };
}
