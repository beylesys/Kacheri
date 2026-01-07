// src/routes/ai/compose.ts
import type { FastifyPluginAsync } from 'fastify';
import { composeText, type ProviderName } from '../../ai/modelRouter';
import {
  newProofPacket,
  writeProofPacket,
  recordProvenanceIfProvided,
  type ProvenanceRecorder,
} from '../../utils/proofs';
import { recordProof } from '../../provenanceStore';
import { config } from '../../config';
import { recordProvenance } from '../../provenance'; // ✅ add provenance row for AI runs

// NEW: workspace broadcast (hub installed by workspaceWs.ts)
import { wsBroadcast } from '../../realtime/globalHub';

// Rate limiting
import { AI_RATE_LIMITS } from '../../middleware/rateLimit';

interface ComposeBody {
  prompt: string;
  language?: string;
  systemPrompt?: string;
  maxTokens?: number;
  /** Best-effort determinism where supported (OpenAI). */
  seed?: string;

  /** NEW: allow the caller to select provider/model. */
  provider?: ProviderName;
  model?: string;
}

export const aiComposeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: ComposeBody }>(
    '/docs/:id/ai/compose',
    {
      config: {
        rateLimit: AI_RATE_LIMITS.compose,
      },
    },
    async (req, reply) => {
      const { id: docId } = req.params;
      const {
        prompt,
        language,
        systemPrompt,
        maxTokens,
        seed,
        provider,
        model,
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string') {
        return reply.code(400).send({ error: 'Missing prompt' });
      }

      // Workspace + user (for WS notifications)
      const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
      const userId = ((req.headers['x-user-id'] as string | undefined)?.toString().trim()) || ((req.headers['x-dev-user'] as string | undefined)?.toString().trim()) || 'user:local';
      const jobId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Notify: compose started
      if (workspaceId) {
        wsBroadcast(workspaceId, { type: 'ai_job', jobId, docId, kind: 'compose', phase: 'started', meta: { userId } });
      }

      // Defaults if caller omitted provider/model.
      const effectiveProvider: ProviderName =
        (provider as ProviderName) || (config.ai.provider as ProviderName) || 'dev';
      const effectiveModel =
        model ||
        (effectiveProvider === 'openai'
          ? config.ai.model?.openai || 'gpt-4o-mini'
          : effectiveProvider === 'anthropic'
          ? config.ai.model?.anthropic || 'claude-sonnet-4-5-20250929'
          : effectiveProvider === 'ollama'
          ? config.ai.model?.ollama || 'llama3'
          : 'dev-stub-1');

      // Compose through the router (now seed/provider/model aware).
      const comp = await composeText(prompt, {
        provider: effectiveProvider,
        model: effectiveModel,
        language,
        systemPrompt,
        maxTokens,
        seed,
      });

      // Proof Packet: include all inputs (prompt + params) for hash coverage.
      const packet = newProofPacket(
        'ai:compose',
        { type: 'ai', provider: comp.provider, model: comp.model },
        { prompt, language, systemPrompt, maxTokens, seed, provider: effectiveProvider, model: effectiveModel, docId },
        { proposalText: comp.text },
        docId
      );

      // Make seed visible in meta (handy for replay UX).
      packet.meta = { ...(packet.meta || {}), seed };

      const proofPath = await writeProofPacket(packet);
      const outputHashHex = packet.hashes?.output ?? ''; // hex (no 'sha256:' prefix)
      const proofHash = `sha256:${outputHashHex}`;

      const proofRow = await recordProof({
        doc_id: docId,
        kind: 'ai:compose',
        hash: proofHash,
        path: '', // no file artifact for text; proof JSON is the evidence file
        meta: {
          proofFile: proofPath,
          provider: comp.provider,
          model: comp.model,
          seed,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });

      // Write a compact provenance line that points at the Proof Packet (fast timeline query)
      try {
        await recordProvenance({
          docId,
          action: 'ai:compose',
          actor: 'ai',
          details: {
            provider: comp.provider,
            model: comp.model,
            seed: seed ?? null,
            prompt,
            proofHash,
            proofId: proofRow?.id ?? null,
            workspaceId: workspaceId ?? null,
          },
        });
      } catch {
        // non-fatal
      }

      const provenanceRecorder = (fastify as any).provenance?.record as
        | ProvenanceRecorder
        | undefined;
      // Keep writing the bridge "ai:action" packet for AI Watch
      await recordProvenanceIfProvided(provenanceRecorder, packet);

      // Notify: compose finished + proof added
      if (workspaceId) {
        wsBroadcast(workspaceId, { type: 'ai_job', jobId, docId, kind: 'compose', phase: 'finished', meta: { userId } });
        wsBroadcast(workspaceId, {
          type: 'proof_added',
          docId,
          proofId: proofRow?.id,
          sha256: proofHash,
          ts: Date.now(),
        });
      }

      return reply.code(200).send({
        docId,
        proposalText: comp.text,
        provider: comp.provider,
        model: comp.model,
        proof: { id: packet.id, path: proofPath, timestamp: packet.timestamp },
        proofHash, // ✅ helps the client log ai:apply later
      });
    }
  );
};

export default aiComposeRoutes;
