// KACHERI FRONTEND/src/api/templates.ts
// API client for document templates.

export type TemplateCategory = 'basic' | 'product' | 'business' | 'meetings' | 'project' | 'reporting';

export type TemplateListItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
};

export type Template = TemplateListItem & {
  content: object; // Tiptap JSON content
};

export type DocMeta = {
  id: string;
  title: string;
  workspaceId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

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

function workspaceHeader(): Record<string, string> {
  try {
    const w =
      (typeof localStorage !== 'undefined' && localStorage.getItem('workspaceId')) ||
      '';
    return w ? { 'X-Workspace-Id': w } : {};
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
  const ws = workspaceHeader();
  for (const [k, v] of Object.entries(ws)) headers.set(k, v);

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

export const templatesApi = {
  /**
   * List all available templates (without content).
   * No auth required.
   */
  async list(): Promise<{ templates: TemplateListItem[] }> {
    return request<{ templates: TemplateListItem[] }>('/templates');
  },

  /**
   * Get a single template by ID (with content).
   * No auth required.
   */
  async get(templateId: string): Promise<{ template: Template }> {
    return request<{ template: Template }>(`/templates/${templateId}`);
  },

  /**
   * Create a new document from a template.
   * Requires editor+ access for workspace-scoped docs.
   */
  async createFromTemplate(
    templateId: string,
    title?: string
  ): Promise<{ doc: DocMeta; templateContent: object }> {
    return request<{ doc: DocMeta; templateContent: object }>('/docs/from-template', {
      method: 'POST',
      body: JSON.stringify({ templateId, title }),
    });
  },
};
