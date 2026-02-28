// KACHERI BACKEND/src/routes/ai.ts
import { FastifyInstance } from "fastify";
import { recordProvenance } from "../provenance";
import { runSandboxedAiAction } from "../sandbox";
import { AI_RATE_LIMITS } from "../middleware/rateLimit";
import { checkDocAccess, getUserId } from "../workspace/middleware";
import { db } from "../db";

type AiAction = "summarize" | "extract_tasks" | "rewrite_for_clarity";

export default async function aiRoutes(app: FastifyInstance) {
  app.post<{
    Params: { id: string; action: string };
    Body: { selectionText?: string };
  }>(
    "/docs/:id/ai/:action",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.generic,
      },
    },
    async (req, reply) => {
    const rawId = (req.params.id || "").toString();
    const docId = rawId.replace(/^doc-/, "");
    const action = (req.params.action || "").toString() as AiAction;
    const selection = (req.body?.selectionText ?? "").toString();

    // Doc-level permission check (editor+ required for AI operations)
    if (!checkDocAccess(db, req, reply, docId, "editor")) return;

    // Derive actor from header; fall back to plain "ai"
    const devUser = (req.headers["x-dev-user"] || "").toString().trim();
    const actor = devUser ? `ai:${devUser}` : "ai";
    const userId = getUserId(req) || "user:local";
    const workspaceId = (req.headers["x-workspace-id"] as string | undefined)?.toString().trim();

    // Record a provenance row first so the sandbox can link to it
    const prov = await recordProvenance({
      docId,
      action: `ai:${action}`,
      actor,
      actorId: userId,
      workspaceId: workspaceId ?? null,
      details: {
        selectionBytes: Buffer.byteLength(selection, "utf8"),
      },
    });

    // Execute deterministic dev sandbox to produce output + proof packet
    const result = await runSandboxedAiAction({
      docId,
      action,
      input: { text: selection },
      provenanceId: prov.id,
    });

    // Hint to the client about how to apply the proposal
    const proposalKind =
      action === "rewrite_for_clarity" ? "replace-selection" : "insert-below-selection";

    return reply.send({
      ok: true,
      action,
      proposalText: result.output,
      proposalKind,                  // <-- new (UI can pick replace vs insert)
      proofPath: result.proofIdPath,
      outputsHash: result.outputHash,
      elapsedMs: result.elapsedMs,
      notes: result.notes,
      provenanceId: prov.id,
      actor,                         // <-- surface who initiated (dev header)
    });
  });
}
