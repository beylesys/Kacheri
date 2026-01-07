// KACHERI FRONTEND/src/api/providers.ts
// Purpose: Fetch dynamic provider/model catalog from GET /ai/providers.
// Frontend checkpoints show a static ProviderModelPicker; this helper lets us switch to dynamic.

export type ProviderKey = 'dev' | 'openai' | 'anthropic' | 'ollama';

export interface ProviderCatalogItem {
  provider: ProviderKey;
  models: string[];
  defaultModel?: string | null;
}

export interface ProvidersResponse {
  providers: ProviderCatalogItem[];
  defaults: { provider: ProviderKey | null; model: string | null };
}

function apiBase(): string {
  // Dev uses Vite proxy with VITE_API_URL=/api
  const base = (import.meta as any).env?.VITE_API_URL || '/api';
  return base.replace(/\/+$/, ''); // strip trailing slash
}

export async function fetchProviders(): Promise<ProvidersResponse> {
  const res = await fetch(`${apiBase()}/ai/providers`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`GET /ai/providers failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
