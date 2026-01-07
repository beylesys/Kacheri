// src/ai/providers/index.ts
// Shared types + a small registry helpers.
// You will import these from src/ai/modelRouter.ts in the refactor step.

export type ComposeProviderName = 'dev' | 'openai' | 'anthropic';

export type ComposeParams = {
  prompt: string;                 // required user prompt
  system?: string;                // optional system prompt
  temperature?: number;           // 0..2 (provider-specific limits apply)
  top_p?: number;                 // optional
  maxTokens?: number;             // aka max_tokens
  model: string;                  // provider model id
  seed?: number | string;         // OpenAI supports best-effort; others may ignore
  lang?: string;                  // optional hint (not used here)
};

export type ComposeResult = {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  meta?: Record<string, unknown>; // provider/model/system_fingerprint/etc
  raw?: unknown;                  // raw provider response (for proofs)
};

export interface ComposeProvider {
  compose(params: ComposeParams): Promise<ComposeResult>;
}

// Utility: normalize seed to number where possible (OpenAI expects integer)
export function normalizeSeed(seed?: number | string): number | undefined {
  if (seed === undefined || seed === null || seed === '') return undefined;
  if (typeof seed === 'number') return Math.floor(seed);
  const n = Number(seed);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}
