// KACHERI FRONTEND/src/api.ts
// Single, unified client for the Fastify backend.
// Covers Docs CRUD, Exports (PDF/DOCX), Evidence/Provenance, AI actions, Compose, and Rewrites.

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_URL ??
  "/api";

/** Get auth header from localStorage if present. */
function authHeader(): Record<string, string> {
  try {
    const token =
      typeof localStorage !== "undefined" && localStorage.getItem("accessToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Inject dev identity header from localStorage if present. */
function devUserHeader(): Record<string, string> {
  try {
    const u =
      (typeof localStorage !== "undefined" && localStorage.getItem("devUser")) ||
      "";
    return u ? { "X-Dev-User": u } : {};
  } catch {
    return {};
  }
}

/** Workspace/user headers so the backend can scope events & proofs. */
function workspaceHeaders(): Record<string, string> {
  try {
    const wid =
      (typeof localStorage !== "undefined" && localStorage.getItem("workspaceId")) ||
      "default";
    const uid =
      (typeof localStorage !== "undefined" && localStorage.getItem("userId")) ||
      "user:local";
    return { "x-workspace-id": wid, "x-user-id": uid };
  } catch {
    return {};
  }
}

function isFormData(x: unknown): x is FormData {
  return typeof FormData !== "undefined" && x instanceof FormData;
}
function isBinary(x: unknown): boolean {
  return (
    x instanceof Blob ||
    x instanceof ArrayBuffer ||
    (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(x as any))
  );
}

/** low-level fetch that only sets Content-Type for JSON (never for FormData/Binary) */
async function requestRaw(path: string, init?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(init?.headers || {});
  const hasBody = init?.body !== undefined && init?.body !== null;

  // 🔒 Hardening: do NOT set JSON content-type for FormData or binary bodies.
  if (hasBody && !headers.has("Content-Type")) {
    const b: any = init!.body;
    if (!isFormData(b) && !isBinary(b)) {
      headers.set("Content-Type", "application/json");
    }
  }

  // Always include auth, dev, and workspace headers.
  const auth = authHeader();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  const dev = devUserHeader();
  for (const [k, v] of Object.entries(dev)) headers.set(k, v);
  const ws = workspaceHeaders();
  for (const [k, v] of Object.entries(ws)) headers.set(k, v);

  return fetch(url, { ...init, headers });
}

/** Multipart-safe upload helper — DO NOT set Content-Type (browser sets boundary) */
async function requestUpload<T = any>(path: string, form: FormData): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers();
  const auth = authHeader();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  const dev = devUserHeader();
  for (const [k, v] of Object.entries(dev)) headers.set(k, v);
  const ws = workspaceHeaders();
  for (const [k, v] of Object.entries(ws)) headers.set(k, v);

  const res = await fetch(url, { method: "POST", body: form, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await requestRaw(path, init);
  const text = await res.text(); // handle empty bodies safely
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}

/* ---------- Types ---------- */

// Layout settings for page setup
export type PageSize = 'a4' | 'letter' | 'legal';
export type Orientation = 'portrait' | 'landscape';

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface HeaderSettings {
  enabled: boolean;
  content: string;
  height: number;
}

export interface FooterSettings {
  enabled: boolean;
  content: string;
  height: number;
  showPageNumbers: boolean;
}

export interface LayoutSettings {
  pageSize: PageSize;
  orientation: Orientation;
  margins: Margins;
  header?: HeaderSettings;
  footer?: FooterSettings;
}

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  pageSize: 'a4',
  orientation: 'portrait',
  margins: {
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
  },
};

export type DocMeta = {
  id: string;
  title: string;
  updatedAt?: string | number | null;
  layoutSettings?: LayoutSettings;
  workspaceId?: string | null;
};

export type TrashedDocMeta = DocMeta & {
  deletedAt: string;
};

export type ExportRow = {
  ts: string;
  kind?: string;
  pdfHash: string | null;
  size: number;
  verified: boolean;
  fileName: string;
  proof: any;
};

export type ExportSummary = {
  total: number;
  pass: number; fail: number; miss: number;
  totalByKind: { docx: number; pdf: number };
  byKind: {
    docx: { pass: number; fail: number; miss: number; total: number };
    pdf:  { pass: number; fail: number; miss: number; total: number };
  };
};

export type ComposeSummary = {
  total: number;
  pass: number;
  drift: number;
  miss: number;
  rerun: boolean;
};

export type ReverifyResponse = {
  ok: boolean;
  exportsSummary: { total: number; pass: number; fail: number; miss: number };
  composeSummary: ComposeSummary;
  ts: number;
};

// Proof Health types (Phase 5 - P1.1)
export type ProofHealthStatus = 'healthy' | 'stale' | 'unverified' | 'failed';

export type ProofHealthResult = {
  docId: string;
  status: ProofHealthStatus;
  score: number;
  exports: { total: number; pass: number; fail: number; miss: number };
  compose: { total: number; pass: number; drift: number; miss: number };
  lastVerified: string | null;
  lastActivity: string | null;
};

// Verification Report types (Phase 5 - P0.3)
export type VerificationReportStatus = 'pass' | 'fail' | 'partial';

export type VerificationReportMeta = {
  id: string;
  createdAt: string;
  status: VerificationReportStatus;
  exportsPass: number;
  exportsFail: number;
  exportsMiss: number;
  composePass: number;
  composeDrift: number;
  composeMiss: number;
  triggeredBy: string;
};

export type VerificationReportFull = VerificationReportMeta & {
  reportJson: unknown;
};

export type VerificationReportCounts = {
  total: number;
  pass: number;
  fail: number;
  partial: number;
};

export type ConvertResponse = {
  docId: string;
  targetFormat: string;   // "pdf" | "docx" | "pptx" (pptx not implemented yet on backend)
  file: string;           // filename in storage/exports/doc-<id>/
  url: string;            // GET URL for download (e.g. /docs/:id/exports/pdf/:file)
};

/* ---------- Normalizers ---------- */
function normalizeDoc(row: any): DocMeta {
  return {
    id: row.id,
    title: row.title ?? row.name ?? "Untitled",
    updatedAt: row.updatedAt ?? null,
    workspaceId: row.workspaceId ?? row.workspace_id ?? null,
  };
}

/* ---------- Docs / Exports ---------- */
export const DocsAPI = {
  list: async (): Promise<DocMeta[]> => {
    const rows = await json<any[]>("/docs");
    return rows.map(normalizeDoc);
  },

  create: async (title?: string): Promise<DocMeta> => {
    const row = await json<any>("/docs", {
      method: "POST",
      body: JSON.stringify({ title: title ?? "Untitled" }),
    });
    return normalizeDoc(row);
  },

  get: (id: string) => json<any>(`/docs/${id}`).then(normalizeDoc),

  rename: async (id: string, title: string): Promise<DocMeta> => {
    const row = await json<any>(`/docs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    return normalizeDoc(row);
  },

  delete: async (id: string): Promise<void> => {
    await json(`/docs/${id}`, { method: "DELETE" });
  },

  // Trash operations
  listTrash: async (): Promise<TrashedDocMeta[]> => {
    const rows = await json<any[]>("/docs/trash");
    return rows.map((row) => ({
      ...normalizeDoc(row),
      deletedAt: row.deletedAt,
    }));
  },

  restore: async (id: string): Promise<DocMeta> => {
    const row = await json<any>(`/docs/${id}/restore`, { method: "POST" });
    return normalizeDoc(row);
  },

  permanentDelete: async (id: string): Promise<void> => {
    await json(`/docs/${id}/permanent`, { method: "DELETE" });
  },

  exportPdf: async (id: string, html: string) => {
    const res = await requestRaw(`/docs/${id}/export/pdf`, {
      method: "POST",
      body: JSON.stringify({ html }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Export failed (${res.status}) ${txt}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doc-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  },

  exportDocx: async (id: string, html: string, filenameHint?: string) => {
    const res = await requestRaw(`/docs/${id}/export/docx`, {
      method: "POST",
      body: JSON.stringify({ html, filenameHint }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Export DOCX failed (${res.status}) ${t}`);
    }
    return (await res.json()) as {
      docId: string;
      ok: true;
      file: { filename: string; bytes: number; path: string; hash?: string };
      proof: { id: string; path: string; timestamp: string };
    };
  },

  /**
   * Format conversion: convert the current document content into another format.
   * Backend currently supports "pdf" and "docx"; "pptx" is reserved for future Slides support.
   * This returns metadata (including a download URL); the UI can then fetch the file.
   */
  convert: async (
    id: string,
    args: { targetFormat: "pdf" | "docx" | "pptx"; html: string; filenameHint?: string }
  ): Promise<ConvertResponse> => {
    return json<ConvertResponse>(`/docs/${id}/convert`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  },

  /** Import a file (DOCX, PDF, HTML, MD). Creates a new doc and returns its id + converted HTML. */
  importFile: async (file: File): Promise<{
    docId: string;
    title: string;
    kind: string;
    source: { path: string; sha256: string; bytes: number };
    converted: { path: string; sha256: string };
    html: string;
    proof?: { path: string; sha256: string } | null;
  }> => {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const form = new FormData();
    form.append("file", file);
    return requestUpload(`/docs/import?kind=${encodeURIComponent(ext)}`, form);
  },

  /** Get import metadata for a document (to determine if PDF import modal should be shown). */
  getImportMeta: async (id: string): Promise<{
    docId: string;
    kind: string;
    sourceUrl: string | null;
    meta: any;
    ts: number;
  } | null> => {
    try {
      return await json<{
        docId: string;
        kind: string;
        sourceUrl: string | null;
        meta: any;
        ts: number;
      }>(`/docs/${id}/import/meta`);
    } catch {
      return null;
    }
  },

  /** Get document layout settings (returns defaults if not set). */
  getLayout: async (id: string): Promise<LayoutSettings> => {
    return json<LayoutSettings>(`/docs/${id}/layout`);
  },

  /** Update document layout settings. */
  updateLayout: async (id: string, layout: LayoutSettings): Promise<DocMeta> => {
    const row = await json<any>(`/docs/${id}/layout`, {
      method: "PATCH",
      body: JSON.stringify(layout),
    });
    return normalizeDoc(row);
  },
};

/* ---------- Images ---------- */
export type ImageUploadResponse = {
  url: string;
  filename: string;
  hash: string;
  bytes: number;
  mimeType: string;
};

export type ImageInfo = {
  filename: string;
  url: string;
};

export const ImagesAPI = {
  /**
   * Upload an image for a document.
   * Returns the URL to reference the image in the editor.
   */
  upload: async (docId: string, file: File): Promise<ImageUploadResponse> => {
    const form = new FormData();
    form.append("image", file);
    return requestUpload<ImageUploadResponse>(`/docs/${docId}/images`, form);
  },

  /**
   * Get the full URL for an image (for use in <img src>).
   */
  getUrl: (docId: string, filename: string): string => {
    return `${API_BASE}/docs/${docId}/images/${filename}`;
  },

  /**
   * List all images for a document.
   */
  list: async (docId: string): Promise<ImageInfo[]> => {
    const res = await json<{ images: ImageInfo[] }>(`/docs/${docId}/images`);
    return res.images;
  },

  /**
   * Delete an image from a document.
   */
  delete: async (docId: string, filename: string): Promise<void> => {
    await json(`/docs/${docId}/images/${filename}`, { method: "DELETE" });
  },
};

/* ---------- Evidence & Provenance ---------- */
export const EvidenceAPI = {
  listExports: (id: string) => json<ExportRow[]>(`/docs/${id}/exports`),

  listProvenance: (
    id: string,
    opts?: { action?: string; limit?: number; before?: number; from?: number; to?: number }
  ) => {
    const p = new URLSearchParams();
    if (opts?.action) p.set("action", opts.action);
    if (opts?.limit) p.set("limit", String(opts.limit));
    if (opts?.before) p.set("before", String(opts.before));
    if (opts?.from) p.set("from", String(opts.from));
    if (opts?.to) p.set("to", String(opts.to));
    const q = p.toString();
    return json<any[]>(`/docs/${id}/provenance${q ? `?${q}` : ""}`);
  },

  /** Append a provenance marker (e.g., on Accept of imported content). */
  appendProvenance: (id: string, body: { action: string; actor?: string; preview?: string; details?: any }) =>
    json<{ ok: boolean; id: number; ts: number }>(`/docs/${id}/provenance`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/* ---------- AI (doc-scoped) ---------- */
export type ProviderName = "openai" | "anthropic" | "dev" | "ollama";

export type ComposeRequest = {
  prompt: string;
  language?: string;
  systemPrompt?: string;
  maxTokens?: number;
  provider?: ProviderName;
  model?: string;
  seed?: string | number; // widened
};

export type ComposeResponse = {
  docId: string;
  proposalText: string;
  provider: string;
  model: string;
  proof: { id: string; path: string; timestamp: number | string };
};

export type RewriteSelectionRequest = {
  fullText: string;
  selection: { start: number; end: number };
  instructions: string;
  /** parity with Compose: allow overrides */
  provider?: ProviderName;
  model?: string;
  seed?: string | number;
};

export type RewriteSelectionResponse = {
  docId: string;
  jobId: string;
  selection: { start: number; end: number };
  rewritten: string;
  beforeHash: string;
  afterHash: string;
  newFullText: string;
  proofId: number | string;
  provider: string | null;
  model: string | null;
  seed: string | number | null;
};

export type ConstrainedRewriteRequest = {
  fullText: string;
  selection?: { start: number; end: number } | null; // omit or null → full-doc strict mode
  instructions: string;
  provider?: ProviderName;
  model?: string;
  seed?: string | number;
};

export type ConstrainedRewriteResponse = {
  newFullText: string;
  meta?: { proofId?: number | string; model?: string; provider?: string | null; seed?: string | number | null };
};

/** helper to attach optional AI headers (also send in body for completeness) */
function aiOptionHeaders(opts?: { provider?: ProviderName; model?: string; seed?: string | number }) {
  const h: Record<string, string> = {};
  if (!opts) return h;
  if (opts.provider) h["x-ai-provider"] = String(opts.provider);
  if (opts.model) h["x-ai-model"] = String(opts.model);
  if (opts.seed !== undefined) h["x-ai-seed"] = String(opts.seed);
  return h;
}

export type DetectedField = {
  type: "date" | "name" | "amount" | "custom";
  value: string;
  start: number;
  end: number;
  confidence: number;
};

export const AiAPI = {
  runAiAction: (
    id: string,
    action: "summarize" | "extract_tasks" | "rewrite_for_clarity",
    selectionText: string
  ) =>
    json<{
      ok: boolean;
      action: string;
      proposalText: string;
      proofPath: string;
      outputsHash: string;
      elapsedMs: number;
      notes: string[];
      provenanceId: number;
    }>(`/docs/${id}/ai/${action}`, {
      method: "POST",
      body: JSON.stringify({ selectionText }),
    }),

  /** Detect editable fields (dates, names, amounts) in text using AI */
  detectFields: (
    id: string,
    body: {
      text: string;
      fieldTypes?: string[];
      provider?: ProviderName;
      model?: string;
    }
  ) =>
    json<{
      docId: string;
      fields: DetectedField[];
      provider: string;
      model: string;
      proof: { id: string; path: string; timestamp: number | string };
    }>(`/docs/${id}/ai/detectFields`, {
      method: "POST",
      headers: aiOptionHeaders(body),
      body: JSON.stringify(body),
    }),

  compose: (id: string, body: ComposeRequest) =>
    json<ComposeResponse>(`/docs/${id}/ai/compose`, {
      method: "POST",
      body: JSON.stringify(body),
      // We don't need AI headers here; backend reads body directly.
    }),

  // Selective Rewrite — POST /docs/:id/ai/rewriteSelection
  rewriteSelection: (id: string, body: RewriteSelectionRequest) =>
    json<RewriteSelectionResponse>(`/docs/${id}/ai/rewriteSelection`, {
      method: "POST",
      headers: aiOptionHeaders(body),
      body: JSON.stringify(body),
    }),

  // Constrained Rewrite (strict) — POST /docs/:id/ai/constrainedRewrite
  constrainedRewrite: (id: string, body: ConstrainedRewriteRequest) =>
    json<ConstrainedRewriteResponse>(`/docs/${id}/ai/constrainedRewrite`, {
      method: "POST",
      headers: aiOptionHeaders(body),
      body: JSON.stringify(body),
    }),

  // Translation — POST /docs/:id/ai/translate
  translate: (
    id: string,
    body: {
      text: string;
      targetLanguage: string;
      sourceLanguage?: string;
      provider?: ProviderName;
      model?: string;
    }
  ) =>
    json<{
      docId: string;
      translatedText: string;
      sourceLanguage: string;
      targetLanguage: string;
      provider: string;
      model: string;
      proof: { id: string; path: string; timestamp: string };
      proofHash: string;
    }>(`/docs/${id}/ai/translate`, {
      method: "POST",
      headers: aiOptionHeaders(body),
      body: JSON.stringify(body),
    }),
};

/* ---------- Global AI Watch (suite-scoped) ---------- */
export const AIWatchAPI = {
  // DEBUG VERSION: log whatever the backend actually returns for summary.
  summary: async () => {
    const summary = await json<{
      total: number;
      // Backend now returns a map<string, number>. We still accept an array
      // of {action,count} for backward compatibility, and normalize in the UI.
      byAction: Record<string, number> | { action: string; count: number }[];
      avgElapsedMs: number;
      last24h: number;
      verificationRate: number;
    }>(`/ai/watch/summary`);

    try {
      // Console logging only; no behavior change.
      console.log("[AIWatchAPI.summary] /ai/watch/summary →", summary);
    } catch {
      // ignore logging errors (very unlikely in browser)
    }

    return summary;
  },

  // DEBUG: also log events so we can see if rewrites ever make it this far.
  events: async (params: { limit?: number; before?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.before) qs.set("before", String(params.before));
    const q = qs.toString();

    const result = await json<{
      events: Array<{
        id: number | string;
        ts: number;
        docId: string;
        path?: string | null;
        action: string;
        elapsedMs: number;
        preview: string;
        inputSize: number;
      }>;
    }>(`/ai/watch/events${q ? `?${q}` : ""}`);

    try {
      console.log("[AIWatchAPI.events] /ai/watch/events", { params, result });
    } catch {
      // swallow logging issues
    }

    return result;
  },

  exportsSummary: (params?: { docId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.docId) qs.set("docId", params.docId);
    const q = qs.toString();
    return json<ExportSummary>(`/ai/watch/exports-summary${q ? `?${q}` : ""}`);
  },

  composeSummary: (params?: { limit?: number; rerun?: boolean; docId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.docId) qs.set("docId", params.docId);
    if (params?.rerun) qs.set("rerun", "true");
    const q = qs.toString();
    return json<ComposeSummary>(`/ai/watch/compose-summary${q ? `?${q}` : ""}`);
  },

  reverify: (body: { docId?: string; limit?: number } = {}) =>
    json<ReverifyResponse>(`/ai/watch/reverify`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Verification Reports (Phase 5 - P0.3)
  reports: async (params?: {
    limit?: number;
    before?: string;
    status?: VerificationReportStatus;
  }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.before) qs.set("before", params.before);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return json<{
      reports: VerificationReportMeta[];
      hasMore: boolean;
    }>(`/ai/watch/reports${q ? `?${q}` : ""}`);
  },

  latestReport: () =>
    json<VerificationReportMeta>(`/ai/watch/reports/latest`).catch(() => null),

  reportById: (id: string, full = false) => {
    const q = full ? "?full=true" : "";
    return json<VerificationReportFull>(`/ai/watch/reports/${id}${q}`);
  },

  reportCounts: () =>
    json<VerificationReportCounts>(`/ai/watch/reports/counts`),

  deleteReport: (id: string) =>
    json<void>(`/ai/watch/reports/${id}`, { method: "DELETE" }),
};

/* ---------- Proof Health (Phase 5 - P1.1) ---------- */
export const ProofHealthAPI = {
  /** Get proof health status for a single document */
  get: (docId: string) =>
    json<ProofHealthResult>(`/docs/${docId}/proof-health`),

  /** Get proof health status for multiple documents in a single request */
  batch: (docIds: string[]) =>
    json<{ results: ProofHealthResult[] }>(`/docs/proof-health/batch`, {
      method: "POST",
      body: JSON.stringify({ docIds }),
    }),

  /** Verify a single export (re-check hash) */
  verifyExport: (docId: string, proofId: string | number) =>
    json<{ verified: boolean; hash?: string; error?: string }>(
      `/docs/${docId}/exports/${proofId}/verify`,
      { method: "POST" }
    ),
};

/* ---------- Compose Determinism (Phase 5 - P1.4) ---------- */
export type ComposeDeterminismResult = {
  docId: string;
  total: number;
  checked: number;
  pass: number;
  drift: number;
  lastChecked: string | null;
  rate: number;
};

export const ComposeDeterminismAPI = {
  /** Get compose determinism status for a document */
  get: (docId: string) =>
    json<ComposeDeterminismResult>(`/docs/${docId}/compose-determinism`),
};

/* ---------- AI Ranges (Phase 5 - P1.2) ---------- */
export type AIRange = {
  id: number;
  kind: string;
  start: number;
  end: number;
  ts: number;
  provider: string;
  model: string;
};

export type AIRangesResult = {
  docId: string;
  ranges: AIRange[];
};

export const AIRangesAPI = {
  /** Get AI-touched ranges for heatmap visualization */
  get: (docId: string) =>
    json<AIRangesResult>(`/docs/${docId}/ai-ranges`),
};

/* ---------- AI Provider Analytics (Phase 5 - P2.3) ---------- */
export type ProviderStats = {
  provider: string;
  model: string;
  totalCalls: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  lastUsed: string;
};

export type ProviderAnalyticsResult = {
  providers: ProviderStats[];
  summary: {
    totalCalls: number;
    avgLatencyMs: number;
    uniqueProviders: number;
    uniqueModels: number;
  };
};

export const ProviderAnalyticsAPI = {
  /** Get AI provider usage and latency analytics */
  get: () => json<ProviderAnalyticsResult>(`/ai/watch/providers`),
};

/* ---------- AI Usage Hotspots (Phase 5 - P2.2) ---------- */
export type HotspotData = {
  docId: string;
  docTitle: string;
  workspaceId: string | null;
  workspaceName: string | null;
  aiActionCount: number;
  verificationFailures: number;
  driftEvents: number;
  riskLevel: "high" | "medium" | "low";
  lastActivity: string;
};

export type HotspotsResult = {
  period: string;
  hotspots: HotspotData[];
  thresholds: {
    high: { actions: number; failures: number; drift: number };
    medium: { actions: number; failures: number; drift: number };
  };
};

export const HotspotsAPI = {
  /** Get AI usage hotspots (high-activity documents) */
  get: (params?: { period?: "24h" | "7d" | "30d"; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.period) qs.set("period", params.period);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return json<HotspotsResult>(`/ai/watch/hotspots${q ? `?${q}` : ""}`);
  },
};

/* ---------- Workspace AI Safety (Phase 5 - P2.1) ---------- */
export type WorkspaceAISafetyResult = {
  workspaceId: string;
  workspaceName: string;
  summary: {
    totalDocs: number;
    docsWithAI: number;
    totalAIActions: number;
    verificationRate: number;
    determinismRate: number;
  };
  health: {
    healthy: number;
    stale: number;
    unverified: number;
    failed: number;
  };
  recentActivity: Array<{
    docId: string;
    docTitle: string;
    action: string;
    ts: string;
    status: "pass" | "fail" | "pending";
  }>;
  topProviders: Array<{
    provider: string;
    model: string;
    callCount: number;
  }>;
};

export const WorkspaceAISafetyAPI = {
  /** Get AI safety metrics for a workspace */
  get: (workspaceId: string) =>
    json<WorkspaceAISafetyResult>(`/workspaces/${workspaceId}/ai-safety`),
};

/* ---------- File Manager (folders + docs) ---------- */

export type FileNode = {
  id: string;              // "node-<numeric id>" or similar
  parentId: string | null; // null = root
  kind: "folder" | "doc";
  name: string;
  docId: string | null;    // for kind === "doc"
  hasChildren: boolean;
};

export type TrashedFileNode = FileNode & {
  deletedAt: string;
};

export const FilesAPI = {
  /**
   * List children of a folder.
   * Omit parentId or pass null to list the root.
   */
  list: async (
    parentId?: string | null
  ): Promise<{ parentId: string | null; nodes: FileNode[] }> => {
    const qs = new URLSearchParams();
    if (parentId) qs.set("parentId", parentId);
    const q = qs.toString();
    return json<{ parentId: string | null; nodes: FileNode[] }>(
      `/files/tree${q ? `?${q}` : ""}`
    );
  },

  /** Create a new folder under the given parent (or root if omitted). */
  createFolder: async (opts: {
    parentId?: string | null;
    name: string;
  }): Promise<FileNode> => {
    const body: { parentId?: string | null; name: string } = {
      name: opts.name,
    };
    if (opts.parentId !== undefined) {
      body.parentId = opts.parentId;
    }
    return json<FileNode>("/files/folder", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * Attach an existing document into the file tree.
   * If a node for this docId already exists, the backend moves it under the
   * new parent and updates the label.
   */
  attachDoc: async (opts: {
    docId: string;
    name: string;
    parentId?: string | null;
  }): Promise<FileNode> => {
    const body: { docId: string; name: string; parentId?: string | null } = {
      docId: opts.docId,
      name: opts.name,
    };
    if (opts.parentId !== undefined) {
      body.parentId = opts.parentId;
    }
    return json<FileNode>("/files/doc", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** Rename a node (folder or doc) by id. */
  rename: async (id: string, name: string): Promise<FileNode> => {
    return json<FileNode>(`/files/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  /**
   * Move a node under a new parent.
   * Use null as parentId to move under the implicit root.
   */
  move: async (id: string, parentId: string | null): Promise<FileNode> => {
    return json<FileNode>(`/files/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ parentId }),
    });
  },

  /**
   * Delete a node.
   * Throws a readable error if the folder is non-empty.
   */
  delete: async (id: string): Promise<void> => {
    const res = await requestRaw(`/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const text = await res.text();
    if (!res.ok) {
      // Try to turn folder_not_empty into a nicer message.
      try {
        const data = text ? JSON.parse(text) : null;
        if (data && data.error === "folder_not_empty") {
          const count = typeof data.childCount === "number" ? data.childCount : 0;
          const msg =
            count > 0
              ? `Cannot delete folder: it still contains ${count} item${count === 1 ? "" : "s"}.`
              : "Cannot delete folder: it is not empty.";
          throw new Error(msg);
        }
      } catch {
        // fall through to generic error
      }
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
  },

  // Trash operations
  listTrash: async (): Promise<TrashedFileNode[]> => {
    return json<TrashedFileNode[]>("/files/trash");
  },

  restore: async (id: string): Promise<FileNode> => {
    return json<FileNode>(`/files/${encodeURIComponent(id)}/restore`, {
      method: "POST",
    });
  },

  permanentDelete: async (id: string): Promise<void> => {
    await json(`/files/${encodeURIComponent(id)}/permanent`, {
      method: "DELETE",
    });
  },
};
