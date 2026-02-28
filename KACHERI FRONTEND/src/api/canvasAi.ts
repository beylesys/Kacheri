// KACHERI FRONTEND/src/api/canvasAi.ts
// API client for Design Studio AI endpoints.
//
// Covers:
//   - AI Generation: generate new frames, edit frame, restyle frames
//   - AI Image: generate image from text prompt
//   - Conversation: get paginated conversation history
//   - Assets: construct asset URLs for <img> tags
//
// See: Docs/API_CONTRACT.md — Design Studio AI Endpoints (Slice B3), AI Image Generation (Slice B5)

import type {
  GenerateFrameParams,
  EditFrameParams,
  StyleFrameParams,
  GenerateImageParams,
  GetConversationParams,
  GenerateFrameResponse,
  GenerateImageResponse,
  ConversationResponse,
} from '../types/canvas';

/* ---------- Infra ---------- */

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

const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes — AI generation can be slow

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init?.headers);

    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const auth = authHeader();
    for (const [k, v] of Object.entries(auth)) headers.set(k, v);
    const dev = devUserHeader();
    for (const [k, v] of Object.entries(dev)) headers.set(k, v);

    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = `API ${res.status}: ${text || res.statusText}`;
      try {
        const json = JSON.parse(text);
        if (json.message) errorMessage = json.message;
        else if (json.error) errorMessage = json.error;
      } catch {}
      throw new Error(errorMessage);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out. The AI generation may still be processing.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Canvas AI API ---------- */

export const canvasAiApi = {
  /**
   * Generate new frame(s) from a text prompt using KCL components.
   * Optionally cross-references Kacheri Docs and Memory Graph for context.
   * Requires canvas editor+ role. Rate limited: 20 req/hr.
   */
  async generate(
    canvasId: string,
    params: GenerateFrameParams
  ): Promise<GenerateFrameResponse> {
    return request<GenerateFrameResponse>(
      `/canvases/${canvasId}/ai/generate`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Modify an existing frame's code based on a text instruction.
   * Preserves structure, applies targeted changes.
   * Requires canvas editor+ role. Rate limited: 20 req/hr.
   */
  async edit(
    canvasId: string,
    params: EditFrameParams
  ): Promise<GenerateFrameResponse> {
    return request<GenerateFrameResponse>(
      `/canvases/${canvasId}/ai/edit`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Change visual appearance of frame(s) without altering content or data.
   * Requires canvas editor+ role. Rate limited: 20 req/hr.
   */
  async style(
    canvasId: string,
    params: StyleFrameParams
  ): Promise<GenerateFrameResponse> {
    return request<GenerateFrameResponse>(
      `/canvases/${canvasId}/ai/style`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Generate an image from a text prompt using AI (DALL-E 3).
   * Stores the result as a canvas asset. Deducts workspace image credits.
   * Requires canvas editor+ role. Rate limited: 10 req/hr.
   */
  async generateImage(
    canvasId: string,
    workspaceId: string,
    params: GenerateImageParams
  ): Promise<GenerateImageResponse> {
    return request<GenerateImageResponse>(
      `/canvases/${canvasId}/ai/image`,
      {
        method: 'POST',
        headers: { 'x-workspace-id': workspaceId },
        body: JSON.stringify(params),
      }
    );
  },

  /**
   * Get paginated conversation history for a canvas.
   * Requires canvas viewer+ role.
   */
  async getConversation(
    canvasId: string,
    params?: GetConversationParams
  ): Promise<ConversationResponse> {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return request<ConversationResponse>(
      `/canvases/${canvasId}/conversation${q ? `?${q}` : ''}`
    );
  },

  /**
   * Construct the URL for a canvas asset (for use in <img> tags).
   * The browser fetches the asset directly with auth headers via cookie/token.
   */
  getAssetUrl(canvasId: string, assetId: string): string {
    return `${API_BASE}/canvases/${canvasId}/assets/${assetId}`;
  },
};
