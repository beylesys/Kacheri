// KACHERI FRONTEND/src/api/workspaceAiSettings.ts
// API client for per-workspace AI provider, model, and BYOK key configuration.

// ============================================
// Types
// ============================================

export interface ProviderCatalogItem {
  provider: string;
  models: string[];
  defaultModel: string | null;
}

export interface WorkspaceAiSettings {
  provider: string | null;
  model: string | null;
  hasApiKey: boolean;
  availableProviders: ProviderCatalogItem[];
  serverDefaults: { provider: string | null; model: string | null };
}

export interface UpdateAiSettingsInput {
  provider?: string | null;
  model?: string | null;
  apiKey?: string | null;
}

// ============================================
// HTTP helpers
// ============================================

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_URL ??
  '/api';

function authHeader(): Record<string, string> {
  try {
    const token =
      typeof localStorage !== 'undefined' && localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function devUserHeader(): Record<string, string> {
  try {
    const u =
      (typeof localStorage !== 'undefined' && localStorage.getItem('devUser')) || '';
    return u ? { 'X-Dev-User': u } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const auth = authHeader();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  const dev = devUserHeader();
  for (const [k, v] of Object.entries(dev)) headers.set(k, v);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    const text = await res.text();
    let msg = `API ${res.status}: ${text || res.statusText}`;
    try {
      const json = JSON.parse(text);
      if (json.error) msg = json.error;
      else if (json.message) msg = json.message;
    } catch {}
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============================================
// Public API
// ============================================

export const workspaceAiSettingsApi = {
  /** Get workspace AI settings + available providers catalog */
  async get(workspaceId: string): Promise<WorkspaceAiSettings> {
    return request<WorkspaceAiSettings>(
      `/workspaces/${workspaceId}/ai-settings`
    );
  },

  /** Update workspace AI settings (provider, model, API key) */
  async update(
    workspaceId: string,
    input: UpdateAiSettingsInput
  ): Promise<WorkspaceAiSettings> {
    return request<WorkspaceAiSettings>(
      `/workspaces/${workspaceId}/ai-settings`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
  },

  /** Remove workspace AI settings (revert to server defaults) */
  async remove(workspaceId: string): Promise<void> {
    return request<void>(`/workspaces/${workspaceId}/ai-settings`, {
      method: 'DELETE',
    });
  },
};
