// backend/src/ai/types.ts
export type ProviderId = 'openai' | 'anthropic' | 'ollama' | 'dev' | (string & {});

export interface ModelInvocationOptions {
  /** Which provider to route to (e.g., 'openai', 'anthropic'). */
  provider?: ProviderId;
  /** Concrete model id (e.g., 'gpt-4o-mini', 'claude-3-haiku'). */
  model?: string;
  /** Determinism hint; widen to string | number for parity across providers. */
  seed?: string | number;
}
