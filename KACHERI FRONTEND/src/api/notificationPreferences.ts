// KACHERI FRONTEND/src/api/notificationPreferences.ts
// API client for notification channel preferences per workspace.
// Slice 11 — Phase 2 Sprint 4

// ============================================
// Types
// ============================================

export type NotificationChannel = 'in_app' | 'webhook' | 'slack' | 'email';
export type PreferenceNotificationType =
  | 'mention'
  | 'comment_reply'
  | 'doc_shared'
  | 'suggestion_pending'
  | 'reminder'
  | 'all';

export interface NotificationPreference {
  id: number;
  userId: string;
  workspaceId: string;
  channel: NotificationChannel;
  notificationType: PreferenceNotificationType;
  enabled: boolean;
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPreferenceInput {
  channel: NotificationChannel;
  notificationType: PreferenceNotificationType;
  enabled: boolean;
  config?: Record<string, unknown> | null;
}

export interface ListPreferencesResponse {
  preferences: NotificationPreference[];
}

export interface UpdatePreferencesResponse {
  preferences: NotificationPreference[];
  updated: number;
}

export interface CrossProductPreferencesInput {
  crossProductEntityConflict?: boolean;
  crossProductEntityUpdate?: boolean;
  crossProductNewConnection?: boolean;
}

// ============================================
// HTTP helpers (same pattern as comments.ts)
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
      (typeof localStorage !== 'undefined' && localStorage.getItem('devUser')) ||
      '';
    return u ? { 'X-Dev-User': u } : {};
  } catch {
    return {};
  }
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
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
    let errorMessage = `API ${res.status}: ${text || res.statusText}`;
    try {
      const json = JSON.parse(text);
      if (json.error) errorMessage = json.error;
    } catch {}
    throw new Error(errorMessage);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============================================
// API Methods
// ============================================

export const notificationPreferencesApi = {
  /**
   * List the current user's notification preferences for a workspace.
   */
  async list(workspaceId: string): Promise<ListPreferencesResponse> {
    return request<ListPreferencesResponse>(
      `/workspaces/${workspaceId}/notification-preferences`
    );
  },

  /**
   * Create or update notification preferences for the current user.
   */
  async update(
    workspaceId: string,
    preferences: UpsertPreferenceInput[]
  ): Promise<UpdatePreferencesResponse> {
    return request<UpdatePreferencesResponse>(
      `/workspaces/${workspaceId}/notification-preferences`,
      {
        method: 'PUT',
        body: JSON.stringify({ preferences }),
      }
    );
  },

  /**
   * Toggle cross-product notification types on/off (S14 PATCH convenience endpoint).
   * Sets in_app channel preferences for cross_product:entity_update,
   * cross_product:entity_conflict, and cross_product:new_connection.
   */
  async updateCrossProduct(
    workspaceId: string,
    prefs: CrossProductPreferencesInput
  ): Promise<UpdatePreferencesResponse> {
    return request<UpdatePreferencesResponse>(
      `/workspaces/${workspaceId}/notification-preferences`,
      {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      }
    );
  },
};
