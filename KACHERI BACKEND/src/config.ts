/* src/config.ts
   Centralized config & storage roots */
import path from 'node:path';
import 'dotenv/config';


const env = (name: string, fallback?: string) =>
  (process.env[name] ?? fallback ?? '').toString();

export type AIProvider = 'dev' | 'openai' | 'anthropic' | 'ollama';

const storageRoot = path.resolve(process.cwd(), env('STORAGE_ROOT', 'storage'));

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  storage: {
    root: storageRoot,
    proofs: path.join(storageRoot, 'proofs'),
    exports: path.join(storageRoot, 'exports'),
  },
  ai: {
    provider: (env('AI_PROVIDER', 'dev') as AIProvider),
    openaiKey: env('OPENAI_API_KEY'),
    anthropicKey: env('ANTHROPIC_API_KEY'),
    ollamaUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: {
      openai: env('AI_MODEL_OPENAI', 'gpt-4o-mini'),
      anthropic: env('AI_MODEL_ANTHROPIC', 'claude-3-haiku-20240307'),
      ollama: env('AI_MODEL_OLLAMA', 'llama3'),
    },
  },
} as const;
