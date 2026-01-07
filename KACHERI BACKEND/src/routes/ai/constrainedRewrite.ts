// backend/src/routes/ai/constrainedRewrite.ts
import type { FastifyPluginAsync } from "fastify";
import { proposeConstrainedRewrite } from "../../ai/rewriters/constrained";
import { recordProof } from "../../provenanceStore";
import { recordProvenance } from "../../provenance";
import { wsBroadcast } from "../../realtime/globalHub";
import { AI_RATE_LIMITS } from "../../middleware/rateLimit";

type Body = {
  fullText: string;
  selection?: { start: number; end: number } | null;
  instructions: string;
  provider?: string;
  model?: string;
  seed?: string | number;
};

const normalizeId = (raw: string) => (raw?.startsWith("doc-") ? raw.slice(4) : raw);
const readHdr = (req: any, name: string) =>
  (req.headers?.[name] as string | undefined)?.toString().trim() || undefined;

function computeSelectionInvariantErrors(
  before: string,
  after: string,
  sel: { start: number; end: number }
) {
  const errors: string[] = [];
  const start = Math.max(0, Math.min(sel.start, before.length));
  const end = Math.max(start, Math.min(sel.end, before.length));
  const oldSelLen = end - start;

  // Prefix must be identical
  const beforePrefix = before.slice(0, start);
  const afterPrefix = after.slice(0, start);
  if (beforePrefix !== afterPrefix) {
    errors.push(`Text before selection changed (0..${start}).`);
  }

  // Suffix must be identical; account for replacement length delta
  const newSelLen = after.length - (before.length - oldSelLen);
  const afterSuffixStart = start + newSelLen;
  const beforeSuffix = before.slice(end);
  const afterSuffix = after.slice(afterSuffixStart);
  if (beforeSuffix !== afterSuffix) {
    errors.push(`Text after selection changed (${end}..end).`);
  }

  return errors;
}

const constrainedRewriteRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string }; Body: Body }>(
    "/docs/:id/ai/constrainedRewrite",
    {
      config: {
        rateLimit: AI_RATE_LIMITS.constrainedRewrite,
      },
    },
    async (req, reply) => {
      const rawId = (req.params?.id ?? "") as string;
      const docId = normalizeId(rawId);

      const {
        fullText,
        selection = null,
        instructions,

        provider: bodyProvider,
        model: bodyModel,
        seed: bodySeed,
      } = (req.body || {}) as Body;

      if (!fullText || typeof fullText !== "string") {
        return reply.code(400).send({ error: "fullText is required" });
      }
      if (!instructions || typeof instructions !== "string" || !instructions.trim()) {
        return reply.code(400).send({ error: "instructions are required" });
      }

      const workspaceId = readHdr(req, "x-workspace-id") || undefined;
      const userId = readHdr(req, "x-user-id") || readHdr(req, "x-dev-user") || "user:local";

      const hdrProvider = readHdr(req, "x-ai-provider");
      const hdrModel = readHdr(req, "x-ai-model");
      const hdrSeed = readHdr(req, "x-ai-seed");

      const provider = bodyProvider ?? hdrProvider ?? undefined;
      const model = bodyModel ?? hdrModel ?? undefined;
      const seed = (bodySeed ?? hdrSeed) as string | number | undefined;

      // Announce job start
      const jobId = `crw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (workspaceId) {
        wsBroadcast(workspaceId, {
          type: "ai_job",
          jobId,
          docId,
          kind: "rewrite", // union-safe
          phase: "started",
          meta: { userId, selection },
        });
      }

      const startedAt = Date.now();

      let res: any;
      try {
        res = await proposeConstrainedRewrite({
          fullText,
          selection: selection ?? undefined,
          instructions: instructions.trim(),
          model,
          provider,
          seed,
        });
      } catch (err: any) {
        const msg = err?.message || String(err);

        if (workspaceId) {
          wsBroadcast(workspaceId, {
            type: "ai_job",
            jobId,
            docId,
            kind: "rewrite",
            phase: "finished",
            meta: { userId, error: msg },
          });
        }

        req.log.error({ err }, "constrainedRewrite failed");
        return reply.code(500).send({ error: "constrainedRewrite failed", details: msg });
      }

      const elapsedMs = Date.now() - startedAt;

      const newFullText: string = res.newFullText ?? fullText;
      const rewritten: string | undefined = typeof res.rewritten === "string" ? res.rewritten : undefined;

      const beforeHash: string = res.beforeHash;
      const afterHash: string = res.afterHash;

      const usedModel: string | undefined = res.usedModel;
      const usedProvider: string | undefined = res.usedProvider;

      // Strictness: if a selection was provided, enforce invariants
      if (selection) {
        const selErrors = computeSelectionInvariantErrors(fullText, newFullText, selection);
        if (selErrors.length > 0) {
          if (workspaceId) {
            wsBroadcast(workspaceId, {
              type: "ai_job",
              jobId,
              docId,
              kind: "rewrite",
              phase: "finished",
              meta: { userId, errors: selErrors },
            });
          }
          return reply.code(422).send({
            error: "constrainedRewrite validation failed",
            errors: selErrors,
          });
        }
      }

      const fullTextLength = fullText.length;
      const selectionLength =
        selection
          ? Math.max(
              0,
              Math.min(selection.end, fullText.length) - Math.max(0, selection.start)
            )
          : null;

      // Short preview for telemetry (avoid stuffing DB with full docs)
      const previewSrc =
        (selection ? rewritten : newFullText) ?? "";
      const preview = String(previewSrc)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);

      // Persist a proof row consistent with existing registry
      const proofRow = await recordProof({
        doc_id: docId,
        kind: "ai:rewriteConstrained",
        hash: `sha256:${afterHash}`,
        path: "",
        meta: {
          // Canonical AI metadata for Global AI Watch
          action: "ai:rewriteConstrained",
          kind: "ai:rewriteConstrained",
          elapsedMs,
          preview,
          notes: Array.isArray(res.notes) ? res.notes.slice(0, 6) : undefined,
          input: {
            mode: selection ? "selection" : "fullDocument",
            fullTextLength,
            selectionLength,
            selection,
            instructions: instructions.trim(),
          },

          // Back-compat fields
          selection,
          instructions: instructions.trim(),
          beforeHash: `sha256:${beforeHash}`,
          afterHash: `sha256:${afterHash}`,
          provider: usedProvider ?? provider ?? "router-default",
          model: usedModel ?? model ?? "router-default",
          seed: seed ?? null,
          userId,
          actorId: userId,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });

      // Provenance index — readable action label
      try {
        await recordProvenance({
          docId,
          action: "ai:rewriteConstrained",
          actor: "ai",
          details: {
            selection,
            instructions: instructions.trim(),
            provider: usedProvider ?? provider ?? "router-default",
            model: usedModel ?? model ?? "router-default",
            seed: seed ?? null,
            proofHash: `sha256:${afterHash}`,
            proofId: proofRow?.id ?? null,
            workspaceId: workspaceId ?? null,
            elapsedMs,
            fullTextLength,
            selectionLength,
          },
        });
      } catch {
        // non-fatal
      }

      // Announce job finish (success)
      if (workspaceId) {
        wsBroadcast(workspaceId, {
          type: "ai_job",
          jobId,
          docId,
          kind: "rewrite",
          phase: "finished",
          meta: { userId },
        });
        // recordProof() already emits proof_added when meta.workspaceId is present.
      }

      // Response: keep backward compatibility (newFullText + meta),
      // but also include richer fields for UI parity with rewriteSelection.
      const outProvider = usedProvider ?? provider ?? null;
      const outModel = usedModel ?? model ?? null;
      const outSeed = seed ?? null;

      return reply.send({
        docId,
        jobId,
        selection: selection ?? null,
        rewritten: rewritten ?? null,
        beforeHash,
        afterHash,
        newFullText,
        proofId: proofRow?.id ?? null,
        provider: outProvider,
        model: outModel,
        seed: outSeed,
        meta: {
          proofId: proofRow?.id ?? null,
          provider: outProvider,
          model: outModel,
          seed: outSeed,
        },
      });
    }
  );
};

export default constrainedRewriteRoutes;
