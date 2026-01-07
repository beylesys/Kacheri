// backend/src/routes/ai/rewriteSelection.ts
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { applySelectionPatch } from '../../text/selectionUtils';         // extensionless for ts-node-dev
import { proposeSelectionRewrite } from '../../ai/rewriters/selection';   // extensionless
import { wsBroadcast } from '../../realtime/globalHub';                   // extensionless
import { recordProof } from '../../provenanceStore';
import { recordProvenance } from '../../provenance';
import { AI_RATE_LIMITS } from '../../middleware/rateLimit';

const normalizeId = (raw: string) => (raw?.startsWith('doc-') ? raw.slice(4) : raw);
const readHdr = (req: any, name: string) =>
  (req.headers?.[name] as string | undefined)?.toString().trim() || undefined;

const plugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post<{
    Params: { id: string };
    Body: {
      fullText: string;
      selection: { start: number; end: number };
      instructions: string;

      // AI options (parity with Compose)
      provider?: string;
      model?: string;
      seed?: string | number;

      // Optional fallbacks if headers aren’t used
      workspaceId?: string;
      userId?: string;
    };
  }>(
    '/docs/:id/ai/rewriteSelection',
    {
      config: {
        rateLimit: AI_RATE_LIMITS.rewrite,
      },
    },
    async (req, reply) => {
    const rawId = (req.params?.id ?? '').toString();
    const docId = normalizeId(rawId);

    const {
      fullText,
      selection,
      instructions,

      provider: bodyProvider,
      model: bodyModel,
      seed: bodySeed,

      workspaceId: bodyWs,
      userId: bodyUser
    } = (req.body ?? {}) as any;

    // Prefer headers (FE sends these from Compose/Palette), fallback to body
    const workspaceId = readHdr(req, 'x-workspace-id') || bodyWs || undefined;
    const userId = readHdr(req, 'x-user-id') || readHdr(req, 'x-dev-user') || bodyUser || 'user:local';

    // AI option headers (optional)
    const hdrProvider = readHdr(req, 'x-ai-provider');
    const hdrModel    = readHdr(req, 'x-ai-model');
    const hdrSeed     = readHdr(req, 'x-ai-seed');

    const provider = bodyProvider ?? hdrProvider ?? undefined;
    const model    = bodyModel    ?? hdrModel    ?? undefined;
    const seed     = (bodySeed ?? hdrSeed) as string | number | undefined;

    // Basic input validation
    if (typeof fullText !== 'string' || !fullText.length) {
      return reply.code(400).send({ error: 'fullText required' });
    }
    const start = Number(selection?.start ?? NaN);
    const end = Number(selection?.end ?? NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > fullText.length) {
      return reply.code(400).send({ error: 'valid selection {start,end} required' });
    }
    const cleanInstructions = String(instructions ?? '').trim();
    if (!cleanInstructions) {
      return reply.code(400).send({ error: 'instructions required' });
    }

    // Announce job start
    const jobId = `rw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (workspaceId) {
      wsBroadcast(workspaceId, {
        type: 'ai_job',
        jobId,
        docId,
        kind: 'rewrite',
        phase: 'started',
        meta: { userId, selection: { start, end } }
      });
    }

    // Ask the selection rewriter; forward provider/model/seed (passthrough)
    const startedAt = Date.now();
    const res: any = await proposeSelectionRewrite({
      fullText,
      start,
      end,
      instructions: cleanInstructions,
      model,     // legacy param (router still honors this)
      provider,  // forwarded (router-normalized path)
      seed       // forwarded
    } as any);
    const elapsedMs = Date.now() - startedAt;

    const rewritten: string   = res.rewritten;
    const beforeHash: string  = res.beforeHash;
    const afterHash: string   = res.afterHash;
    const usedModel: string | undefined    = res.usedModel;
    const usedProvider: string | undefined = res.usedProvider;

    // Build the new full text
    const { newText } = applySelectionPatch(fullText, { start, end }, rewritten);

    const selectionLength = end - start;
    const fullTextLength = fullText.length;

    // Persist a proof row (text-only artifact)
    const proofRow = await recordProof({
      doc_id: docId,
      kind: 'ai:rewriteSelection',
      hash: `sha256:${afterHash}`,
      path: '',
      meta: {
        // Canonical AI metadata for Global AI Watch
        action: 'ai:rewriteSelection',
        kind: 'ai:rewriteSelection',
        elapsedMs,
        input: {
          mode: 'selection',
          fullTextLength,
          selectionLength,
          selection: { start, end },
          instructions: cleanInstructions,
        },

        // Existing fields (kept for backwards compatibility + proofs panel)
        selection: { start, end },
        instructions: cleanInstructions,
        beforeHash: `sha256:${beforeHash}`,
        afterHash:  `sha256:${afterHash}`,
        provider: usedProvider ?? provider ?? 'router-default',
        model:    usedModel    ?? model    ?? 'router-default',
        seed:     seed ?? null,
        userId,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    // Provenance index → compact link to the proof
    try {
      await recordProvenance({
        docId,
        action: 'ai:rewriteSelection',
        actor: 'ai',
        details: {
          selection: { start, end },
          instructions: cleanInstructions,
          provider: usedProvider ?? provider ?? 'router-default',
          model:    usedModel    ?? model    ?? 'router-default',
          seed:     seed ?? null,
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

    // Notify job finish
    if (workspaceId) {
      wsBroadcast(workspaceId, {
        type: 'ai_job',
        jobId,
        docId,
        kind: 'rewrite',
        phase: 'finished',
        meta: { userId }
      });
      // recordProof() already emits proof_added when meta.workspaceId is present.
    }

    return reply.send({
      docId,
      jobId,
      selection: { start, end },
      rewritten,
      beforeHash,
      afterHash,
      newFullText: newText,
      proofId: proofRow.id,
      provider: usedProvider ?? provider ?? null,
      model:    usedModel    ?? model    ?? null,
      seed:     seed ?? null
    });
  });
};

export default plugin;

export async function registerRewriteSelectionRoutes(app: FastifyInstance) {
  await app.register(plugin);
}
