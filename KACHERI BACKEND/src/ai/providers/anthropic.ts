// src/ai/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { ComposeParams, ComposeResult, ComposeProvider } from './index';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Set it in your environment to use the Anthropic provider.'
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Local, future-proof shape for blocks we care about.
 * We avoid importing SDK block types directly because they evolve across versions.
 */
type AnyContentBlock = { type: string; text?: string; thinking?: string };

function extractTextFromBlocks(blocks: unknown): string {
  const arr = Array.isArray(blocks) ? (blocks as AnyContentBlock[]) : [];

  // Collect visible text blocks only.
  const textParts = arr
    .filter(
      (b) => b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string'
    )
    .map((b) => b.text!.trim())
    .filter(Boolean);

  if (textParts.length > 0) return textParts.join('\n\n');

  // Optional: if you ever want to include "thinking" (not recommended), uncomment:
  // const thinkParts = arr
  //   .filter((b) => b && typeof b === 'object' && b.type === 'thinking' && typeof b.thinking === 'string')
  //   .map((b) => b.thinking!.trim())
  //   .filter(Boolean);
  // if (thinkParts.length > 0) return thinkParts.join('\n\n');

  return '';
}

export const AnthropicProvider: ComposeProvider = {
  async compose(params: ComposeParams): Promise<ComposeResult> {
    const client = getClient();
    const {
      prompt,
      system,
      temperature,
      top_p,
      maxTokens,
      model,
      // seed is intentionally ignored (not part of Messages API)
    } = params;

    const resp = await client.messages.create({
      model,
      max_tokens: typeof maxTokens === 'number' ? maxTokens : 1024,
      messages: [{ role: 'user', content: prompt }],
      system: system && system.trim() ? system : undefined,
      temperature: typeof temperature === 'number' ? temperature : undefined,
      top_p: typeof top_p === 'number' ? top_p : undefined,
    });

    // Prefer concatenated text blocks; fall back to output_text if present.
    let text = extractTextFromBlocks((resp as any).content);
    const outputText = (resp as any)?.output_text;
    if (!text && typeof outputText === 'string' && outputText.trim()) {
      text = outputText.trim();
    }

    return {
      text: text || '',
      usage: {
        inputTokens: resp.usage?.input_tokens,
        outputTokens: resp.usage?.output_tokens,
      },
      meta: {
        provider: 'anthropic',
        model: resp.model,
        message_id: resp.id,
        stop_reason: (resp as any).stop_reason,
        content_blocks: Array.isArray((resp as any).content)
          ? (resp as any).content.length
          : 0,
      },
      raw: resp, // we store raw for proofs/replay
    };
  },
};

export default AnthropicProvider;
