// KACHERI BACKEND/src/routes/ai/providers.ts
// Route: GET /ai/providers
// Purpose: Return allowed providers/models and defaults (repo-grounded addition).
// Works with current Fastify setup and existing AI compose plumbing recorded in checkpoints.

import type { FastifyPluginAsync } from 'fastify';

type ProviderKey = 'dev' | 'openai' | 'anthropic' | 'ollama';

interface ProviderCatalogItem {
  provider: ProviderKey;
  models: string[];
  defaultModel?: string | null;
}

interface ProvidersResponse {
  providers: ProviderCatalogItem[];
  defaults: { provider: ProviderKey | null; model: string | null };
}

/** Comma-separated env reader → string[] (trimmed, no empty) */
function readCsvEnv(name: string): string[] {
  const v = process.env[name] || '';
  return v
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Infer which providers are available from env presence */
function inferProvidersFromEnv(): ProviderKey[] {
  const candidates: ProviderKey[] = [];
  // Always include dev (repo uses a dev sandbox path in earlier phases).
  candidates.push('dev' as const);

  if (process.env.OPENAI_API_KEY) candidates.push('openai');
  if (process.env.ANTHROPIC_API_KEY) candidates.push('anthropic');
  // Ollama can be local; consider it available if base URL env is set.
  if (process.env.OLLAMA_BASE_URL) candidates.push('ollama');

  // De-dup in case of overlap
  return Array.from(new Set(candidates));
}

const providersRoute: FastifyPluginAsync = async (app) => {
  app.get('/ai/providers', async (_req, _res): Promise<ProvidersResponse> => {
    // Allow explicit list: AI_PROVIDERS=openai,anthropic,dev
    const explicit = readCsvEnv('AI_PROVIDERS') as ProviderKey[];
    const providerKeys: ProviderKey[] = (explicit.length ? explicit : inferProvidersFromEnv());

    // Per-provider models from env (optional):
    //   AI_OPENAI_MODELS=gpt-4o,gpt-4.1
    //   AI_ANTHROPIC_MODELS=claude-3-opus,claude-3-5-sonnet
    //   AI_OLLAMA_MODELS=llama3:8b,phi3:latest
    //   AI_DEV_MODELS=stub
    const mapName = (p: ProviderKey) => `AI_${p.toUpperCase()}_MODELS`;
    const items: ProviderCatalogItem[] = providerKeys.map((p) => {
      const models = readCsvEnv(mapName(p));
      const defaultModelEnv = process.env[`${mapName(p)}_DEFAULT`];
      return {
        provider: p,
        models,
        defaultModel: defaultModelEnv ?? null,
      };
    });

    const defaults = {
      // Optional: AI_DEFAULT_PROVIDER, AI_DEFAULT_MODEL
      provider: ((process.env.AI_DEFAULT_PROVIDER || null) as ProviderKey | null),
      model: process.env.AI_DEFAULT_MODEL || null,
    };

    return { providers: items, defaults };
  });
};

export default providersRoute;
