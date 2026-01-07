// src/ai/providers/openai.ts
import OpenAI from 'openai';
import type { ComposeParams, ComposeResult, ComposeProvider } from './index';
import { normalizeSeed } from './index';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Set it in your environment to use the OpenAI provider.');
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Compose via OpenAI Chat Completions (supports `seed` for best-effort reproducibility).
 * Docs: Node SDK + seed guidance (cookbook). 
 */
export const OpenAIProvider: ComposeProvider = {
  async compose(params: ComposeParams): Promise<ComposeResult> {
    const client = getClient();
    const {
      prompt,
      system,
      temperature,
      top_p,
      maxTokens,
      model,
      seed,
    } = params;

    // Build chat messages
    const messages: Array<{ role: 'system'|'user'; content: string }> = [];
    if (system && system.trim()) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    // OpenAI chat.completions endpoint
    const resp = await client.chat.completions.create({
      model,
      messages,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      top_p: typeof top_p === 'number' ? top_p : undefined,
      max_tokens: typeof maxTokens === 'number' ? maxTokens : undefined,
      seed: normalizeSeed(seed), // best-effort determinism
    });

    const choice = resp.choices?.[0];
    const text = (choice?.message?.content ?? '').toString();

    const result: ComposeResult = {
      text,
      usage: {
        inputTokens: (resp.usage as any)?.prompt_tokens,
        outputTokens: (resp.usage as any)?.completion_tokens,
      },
      meta: {
        provider: 'openai',
        model: resp.model,
        system_fingerprint: (resp as any).system_fingerprint, // present on some models
      },
      raw: resp,
    };
    return result;
  },
};

export default OpenAIProvider;
