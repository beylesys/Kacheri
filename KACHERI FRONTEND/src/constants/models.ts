// src/constants/models.ts
// Handy suggestions for the dropdowns. Users can always type a custom model id.
// Model names evolve; these are safe defaults for now.

export const OPENAI_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
];

export const ANTHROPIC_MODELS = [
  // Anthropic requires exact versioned names; examples below are illustrative.
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20250915',
];

export const DEFAULT_PROVIDER: 'openai' | 'anthropic' | 'dev' = 'openai';
export const DEFAULT_OPENAI_MODEL = OPENAI_MODELS[0];
export const DEFAULT_ANTHROPIC_MODEL = ANTHROPIC_MODELS[0];
