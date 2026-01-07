// src/routes/ai/detectFields.ts
// AI-powered field detection for PDF imports - detects dates, names, amounts, etc.
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
import { wsBroadcast } from '../../realtime/globalHub';
import { AI_RATE_LIMITS } from '../../middleware/rateLimit';

interface DetectedField {
  type: 'date' | 'name' | 'amount' | 'custom';
  value: string;
  start: number;
  end: number;
  confidence: number;
}

interface DetectFieldsBody {
  text: string;
  fieldTypes?: string[];
  provider?: ProviderName;
  model?: string;
}

const SYSTEM_PROMPT = `You are a document field detection assistant. Your task is to identify and extract important fields from text that a user might want to edit.

Analyze the provided text and identify fields in these categories:
- date: Any date, deadline, or time reference (e.g., "January 15, 2025", "12/01/2024", "next Monday")
- name: Person names, organization names, titles (e.g., "John Smith", "Acme Corp", "Dr. Jane Doe")
- amount: Monetary values, quantities, percentages (e.g., "$5,000", "25%", "100 units")
- custom: Other important values that might need editing (reference numbers, IDs, addresses)

IMPORTANT: For each field, you MUST provide the exact character positions (start and end) where the value appears in the original text. The start position is 0-indexed.

Respond with a JSON object in this exact format:
{
  "fields": [
    {
      "type": "date",
      "value": "January 15, 2025",
      "start": 45,
      "end": 61,
      "confidence": 0.95
    }
  ]
}

Only include fields with confidence > 0.5. Be precise with character positions.`;

export const aiDetectFieldsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string }; Body: DetectFieldsBody }>(
    '/docs/:id/ai/detectFields',
    {
      config: {
        rateLimit: AI_RATE_LIMITS.detectFields,
      },
    },
    async (req, reply) => {
      const { id: docId } = req.params;
      const { text, fieldTypes, provider, model } = req.body ?? {};

      if (!text || typeof text !== 'string') {
        return reply.code(400).send({ error: 'Missing text' });
      }

      // Workspace + user (for WS notifications)
      const workspaceId = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
      const userId = ((req.headers['x-user-id'] as string | undefined)?.toString().trim()) ||
        ((req.headers['x-dev-user'] as string | undefined)?.toString().trim()) || 'user:local';
      const jobId = `fld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Notify: detection started
      if (workspaceId) {
        wsBroadcast(workspaceId, {
          type: 'ai_job',
          jobId,
          docId,
          kind: 'detectFields',
          phase: 'started',
          meta: { userId },
        });
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

      // Build the prompt
      const userPrompt = fieldTypes?.length
        ? `Detect fields of these types: ${fieldTypes.join(', ')}\n\nText to analyze:\n${text}`
        : `Detect all important fields (dates, names, amounts, custom values).\n\nText to analyze:\n${text}`;

      try {
        // Call AI through the router
        const comp = await composeText(userPrompt, {
          provider: effectiveProvider,
          model: effectiveModel,
          systemPrompt: SYSTEM_PROMPT,
          maxTokens: 2000,
        });

        // Parse the AI response
        let fields: DetectedField[] = [];
        try {
          // Extract JSON from the response (may be wrapped in markdown code blocks)
          let jsonStr = comp.text;
          const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1];
          }
          // Also try to find raw JSON object
          const objMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (objMatch) {
            jsonStr = objMatch[0];
          }
          const parsed = JSON.parse(jsonStr.trim());
          if (Array.isArray(parsed.fields)) {
            fields = parsed.fields.filter(
              (f: any) =>
                f &&
                typeof f.type === 'string' &&
                typeof f.value === 'string' &&
                typeof f.start === 'number' &&
                typeof f.end === 'number'
            );
          }
        } catch (parseErr) {
          console.error('[detectFields] Failed to parse AI response:', parseErr);
          // Return empty fields on parse failure
        }

        // Proof Packet
        const packet = newProofPacket(
          'ai:detectFields',
          { type: 'ai', provider: comp.provider, model: comp.model },
          { text: text.slice(0, 500), fieldTypes, provider: effectiveProvider, model: effectiveModel, docId },
          { fields, rawResponse: comp.text },
          docId
        );

        const proofPath = await writeProofPacket(packet);
        const outputHashHex = packet.hashes?.output ?? '';
        const proofHash = `sha256:${outputHashHex}`;

        const proofRow = await recordProof({
          doc_id: docId,
          kind: 'ai:detectFields',
          hash: proofHash,
          path: '',
          meta: {
            proofFile: proofPath,
            provider: comp.provider,
            model: comp.model,
            fieldCount: fields.length,
            ...(workspaceId ? { workspaceId } : {}),
          },
        });

        // Provenance
        try {
          await recordProvenance({
            docId,
            action: 'ai:detectFields',
            actor: 'ai',
            details: {
              provider: comp.provider,
              model: comp.model,
              fieldCount: fields.length,
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

        // Notify: detection finished
        if (workspaceId) {
          wsBroadcast(workspaceId, {
            type: 'ai_job',
            jobId,
            docId,
            kind: 'detectFields',
            phase: 'finished',
            meta: { userId, fieldCount: fields.length },
          });
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
          fields,
          provider: comp.provider,
          model: comp.model,
          proof: { id: packet.id, path: proofPath, timestamp: packet.timestamp },
        });
      } catch (err: any) {
        console.error('[detectFields] AI error:', err);

        // Notify: detection failed
        if (workspaceId) {
          wsBroadcast(workspaceId, {
            type: 'ai_job',
            jobId,
            docId,
            kind: 'detectFields',
            phase: 'error',
            meta: { userId, error: err?.message || 'Unknown error' },
          });
        }

        return reply.code(500).send({
          error: 'Field detection failed',
          message: err?.message || 'Unknown error',
        });
      }
    }
  );
};

export default aiDetectFieldsRoutes;
