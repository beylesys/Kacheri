// src/routes/ai/translate.ts
// AI-powered text translation with full proof recording
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
import { recordProvenance } from '../../provenance';

// Workspace broadcast
import { wsBroadcast } from '../../realtime/globalHub';

// Rate limiting
import { AI_RATE_LIMITS } from '../../middleware/rateLimit';

// Language name mapping for system prompts
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  ms: 'Malay',
  he: 'Hebrew',
  auto: 'auto-detected',
};

interface TranslateBody {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  provider?: ProviderName;
  model?: string;
  seed?: string;
}

export const aiTranslateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: TranslateBody }>(
    '/docs/:id/ai/translate',
    {
      config: {
        rateLimit: AI_RATE_LIMITS.compose, // Reuse compose rate limit
      },
    },
    async (req, reply) => {
      const { id: docId } = req.params;
      const {
        text,
        targetLanguage,
        sourceLanguage,
        provider,
        model,
        seed,
      } = req.body ?? {};

      // Validate required fields
      if (!text || typeof text !== 'string') {
        return reply.code(400).send({ error: 'Missing text to translate' });
      }
      if (!targetLanguage || typeof targetLanguage !== 'string') {
        return reply.code(400).send({ error: 'Missing targetLanguage' });
      }

      // Workspace + user (for WS notifications)
      const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
      const userId = ((req.headers['x-user-id'] as string | undefined)?.toString().trim()) || ((req.headers['x-dev-user'] as string | undefined)?.toString().trim()) || 'user:local';
      const jobId = `trl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Notify: translation started
      if (workspaceId) {
        wsBroadcast(workspaceId, { type: 'ai_job', jobId, docId, kind: 'translate', phase: 'started', meta: { userId } });
      }

      // Defaults if caller omitted provider/model
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

      // Build system prompt for translation
      const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
      const sourceLangName = sourceLanguage
        ? (LANGUAGE_NAMES[sourceLanguage] || sourceLanguage)
        : null;

      const systemPrompt = sourceLangName && sourceLanguage !== 'auto'
        ? `You are a professional translator. Translate the following text from ${sourceLangName} to ${targetLangName}. Output only the translation, nothing else. Preserve the original formatting and structure.`
        : `You are a professional translator. Translate the following text to ${targetLangName}. Detect the source language automatically. Output only the translation, nothing else. Preserve the original formatting and structure.`;

      // Call AI via modelRouter
      const comp = await composeText(text, {
        provider: effectiveProvider,
        model: effectiveModel,
        systemPrompt,
        maxTokens: Math.max(1000, Math.ceil(text.length * 1.5)), // Allow room for expansion
        seed,
      });

      // Determine effective source language (use provided or 'auto')
      const effectiveSourceLang = sourceLanguage || 'auto';

      // Create proof packet with all inputs for hash coverage
      const packet = newProofPacket(
        'ai:translate',
        { type: 'ai', provider: comp.provider, model: comp.model },
        {
          text,
          sourceLanguage: effectiveSourceLang,
          targetLanguage,
          provider: effectiveProvider,
          model: effectiveModel,
          docId,
          textLength: text.length,
        },
        { translatedText: comp.text },
        docId
      );

      // Add metadata
      packet.meta = { ...(packet.meta || {}), seed, sourceLanguage: effectiveSourceLang, targetLanguage };

      const proofPath = await writeProofPacket(packet);
      const outputHashHex = packet.hashes?.output ?? '';
      const proofHash = `sha256:${outputHashHex}`;

      const proofRow = await recordProof({
        doc_id: docId,
        kind: 'ai:translate',
        hash: proofHash,
        path: '',
        meta: {
          proofFile: proofPath,
          provider: comp.provider,
          model: comp.model,
          seed,
          sourceLanguage: effectiveSourceLang,
          targetLanguage,
          textLength: text.length,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });

      // Write provenance line for timeline
      try {
        await recordProvenance({
          docId,
          action: 'ai:translate',
          actor: 'ai',
          details: {
            provider: comp.provider,
            model: comp.model,
            seed: seed ?? null,
            sourceLanguage: effectiveSourceLang,
            targetLanguage,
            textLength: text.length,
            translatedLength: comp.text.length,
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
      await recordProvenanceIfProvided(provenanceRecorder, packet);

      // Notify: translation finished + proof added
      if (workspaceId) {
        wsBroadcast(workspaceId, { type: 'ai_job', jobId, docId, kind: 'translate', phase: 'finished', meta: { userId } });
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
        translatedText: comp.text,
        sourceLanguage: effectiveSourceLang,
        targetLanguage,
        provider: comp.provider,
        model: comp.model,
        proof: { id: packet.id, path: proofPath, timestamp: packet.timestamp },
        proofHash,
      });
    }
  );
};

export default aiTranslateRoutes;
