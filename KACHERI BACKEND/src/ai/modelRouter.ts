/* src/ai/modelRouter.ts
   Provider-agnostic "compose text" with provider/model/seed overrides,
   robust Anthropic text extraction, and prompt normalization for all callers.
*/
import { config } from '../config';
import type { ProviderId, ModelInvocationOptions } from './types';

export type ProviderName = ProviderId;

export interface ComposeOptions extends ModelInvocationOptions {
  systemPrompt?: string;
  language?: string;
  maxTokens?: number;
}

export interface ComposeResult {
  text: string;
  provider: ProviderName;
  model: string;
  raw?: unknown;
}

/* ------------------------------ helpers ------------------------------ */

function normalizeSeedNumber(seed?: string | number): number | undefined {
  if (seed == null) return undefined;
  const n = typeof seed === 'number' ? seed : Number(String(seed).trim());
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

/** Convert any input into a string for providers that want plain text. */
function normalizeToText(anyPrompt: unknown): string {
  if (typeof anyPrompt === 'string') return anyPrompt;
  if (Array.isArray(anyPrompt)) {
    // Array of Chat content parts or strings → join text
    return anyPrompt
      .map((p: any) =>
        typeof p === 'string'
          ? p
          : typeof p?.text === 'string'
          ? p.text
          : JSON.stringify(p)
      )
      .join('\n');
  }
  // Object → stringify (keeps the debugging payload visible in proofs)
  try { return JSON.stringify(anyPrompt); } catch { return String(anyPrompt); }
}

/** OpenAI accepts either a string OR an array of {type:'text',text:...} parts. */
function normalizeForOpenAIContent(anyPrompt: unknown): string | Array<{ type: 'text'; text: string }> {
  if (typeof anyPrompt === 'string') return anyPrompt;
  if (Array.isArray(anyPrompt)) {
    // If caller already passed content parts, keep them.
    const parts = anyPrompt.map((p: any) =>
      typeof p === 'string' ? { type: 'text' as const, text: p }
      : p && typeof p === 'object' && typeof p.text === 'string'
      ? { type: 'text' as const, text: p.text }
      : { type: 'text' as const, text: JSON.stringify(p) }
    );
    return parts;
  }
  // Single object is NOT allowed by OpenAI unless wrapped as an array → wrap
  if (anyPrompt && typeof anyPrompt === 'object') {
    if (typeof (anyPrompt as any).text === 'string') {
      return [{ type: 'text', text: (anyPrompt as any).text }];
    }
    return [{ type: 'text', text: JSON.stringify(anyPrompt) }];
  }
  return String(anyPrompt);
}

/** Anthropic wants plain text blocks; ignore non-text parts. */
function anthropicBlocksToText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const out: string[] = [];
  for (const part of content as any[]) {
    if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
      const t = part.text.trim();
      if (t) out.push(t);
    }
  }
  return out.join('\n\n').trim();
}

/* ------------------------------ main entry ------------------------------ */

/**
 * Canonical text generation entry used by compose/rewrites.
 * Accepts string | array-of-parts | arbitrary object; normalizes per provider.
 */
export async function composeText(
  prompt: unknown,
  opts: ComposeOptions = {}
): Promise<ComposeResult> {
  const provider: ProviderName = (opts.provider ?? (config.ai.provider as ProviderName)) || 'dev';

  if (provider === 'dev') {
    const model = opts.model || 'dev-stub-1';
    const text = `Draft:\n${normalizeToText(prompt)}\n\n[dev stub; deterministic]`;
    return { text, provider, model };
  }

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: config.ai.openaiKey });

    const model = opts.model || config.ai.model?.openai || 'gpt-4o-mini';
    const userContent = normalizeForOpenAIContent(prompt);

    const resp = await client.chat.completions.create({
      model,
      messages: [
        ...(opts.systemPrompt ? [{ role: 'system' as const, content: opts.systemPrompt }] : []),
        { role: 'user' as const, content: userContent },
      ],
      max_tokens: opts.maxTokens ?? 600,
      seed: normalizeSeedNumber(opts.seed),
    });

    const text = (resp.choices?.[0]?.message?.content ?? '').toString().trim();
    return { text, provider, model, raw: resp };
  }

  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.ai.anthropicKey });
    const model = opts.model || config.ai.model?.anthropic || 'claude-sonnet-4-5-20250929';

    const resp = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 600,
      system: opts.systemPrompt || undefined,
      messages: [
        { role: 'user', content: [{ type: 'text', text: normalizeToText(prompt) }] },
      ],
    });

    let text = anthropicBlocksToText((resp as any).content);
    const outputText = (resp as any)?.output_text;
    if (!text && typeof outputText === 'string' && outputText.trim()) text = outputText.trim();
    return { text, provider, model, raw: resp };
  }

  if (provider === 'ollama') {
    const spec = 'ollama';
    const mod: any = await import(spec).catch(() => null);
    if (!mod) throw new Error('ollama package not installed');
    const { Ollama } = mod;
    const client = new Ollama({ host: config.ai.ollamaUrl });

    const model = opts.model || config.ai.model?.ollama || 'llama3';
    const resp = await client.chat({
      model,
      messages: [{ role: 'user', content: normalizeToText(prompt) }],
      options: { temperature: 0.2 },
    });
    const text = (resp?.message?.content ?? '').toString().trim();
    return { text, provider, model, raw: resp };
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

/* ---------------------------- back-compat shims ---------------------------- */

export async function textComplete(
  prompt: unknown,
  opts: ComposeOptions = {}
): Promise<ComposeResult> {
  return composeText(prompt, opts);
}

export async function run(
  input: string | ({ prompt: unknown } & ComposeOptions),
  maybeOpts?: ComposeOptions
): Promise<ComposeResult> {
  if (typeof input === 'string') return composeText(input, maybeOpts ?? {});
  const { prompt, ...opts } = input;
  return composeText(prompt, opts);
}

export async function route(kind: string, payload: any): Promise<ComposeResult> {
  const prompt = typeof payload === 'string' ? payload : payload?.prompt ?? payload;
  const opts: ComposeOptions =
    typeof payload === 'object' && payload
      ? {
          provider: payload.provider,
          model: payload.model,
          systemPrompt: payload.systemPrompt,
          language: payload.language,
          maxTokens: payload.maxTokens,
          seed: payload.seed,
        }
      : {};
  return composeText(prompt, opts);
}
