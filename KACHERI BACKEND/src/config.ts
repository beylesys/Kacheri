/* src/config.ts
   Centralized config & storage roots */
import path from 'node:path';
import 'dotenv/config';


const env = (name: string, fallback?: string) =>
  (process.env[name] ?? fallback ?? '').toString();

export type AIProvider = 'dev' | 'openai' | 'anthropic' | 'ollama';
export type DatabaseDriver = 'sqlite' | 'postgresql';
export type TopologyMode = 'local' | 'cloud';
export type StorageBackend = 'local' | 's3';

const storageRoot = path.resolve(process.cwd(), env('STORAGE_ROOT', 'storage'));

// Determine database driver from DATABASE_URL scheme (S16)
const databaseUrl = env('DATABASE_URL', 'sqlite://local');
const databaseDriver: DatabaseDriver = databaseUrl.startsWith('postgres')
  ? 'postgresql'
  : 'sqlite';

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),

  // ── Database (S16) ───────────────────────────────────────────────
  database: {
    url: databaseUrl,
    driver: databaseDriver,
  },

  // ── Deployment topology (S16) ────────────────────────────────────
  topology: {
    mode: (databaseDriver === 'postgresql' ? 'cloud' : 'local') as TopologyMode,
  },

  // ── Storage ──────────────────────────────────────────────────────
  storage: {
    root: storageRoot,
    proofs: path.join(storageRoot, 'proofs'),
    exports: path.join(storageRoot, 'exports'),
    backend: env('STORAGE_BACKEND', 'local') as StorageBackend,
  },

  // ── CORS origins (S16 config; S17 wires into server.ts) ──────────
  cors: {
    origins: env('CORS_ORIGINS', 'http://localhost:5173')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },

  // ── AI ───────────────────────────────────────────────────────────
  ai: {
    provider: (env('AI_PROVIDER', 'dev') as AIProvider),
    openaiKey: env('OPENAI_API_KEY'),
    anthropicKey: env('ANTHROPIC_API_KEY'),
    ollamaUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: {
      openai: env('AI_MODEL_OPENAI', 'gpt-4o'),
      anthropic: env('AI_MODEL_ANTHROPIC', 'claude-sonnet-4-5-20250929'),
      ollama: env('AI_MODEL_OLLAMA', 'llama3'),
    },
  },
} as const;
