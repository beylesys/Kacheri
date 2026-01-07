// src/hooks/useSelectionRewrite.ts
export interface Selection {
  start: number;
  end: number; // exclusive
}

export interface RewriteArgs {
  workspaceId: string;
  docId: string;
  fullText: string;
  selection: Selection;
  instructions: string;
  model?: string;
  userId?: string;
}

export interface RewriteResponse {
  docId: string;
  jobId: string;
  selection: Selection;
  rewritten: string;
  beforeHash: string;
  afterHash: string;
  newFullText: string;
  proofId?: string;
  model: string | null;
}

// Resolve API base consistently with the rest of the app.
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_URL ??
  "/api";

export async function rewriteSelection(args: RewriteArgs): Promise<RewriteResponse> {
  const res = await fetch(
    `${API_BASE}/docs/${encodeURIComponent(args.docId)}/ai/rewriteSelection`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Workspace-scoped headers so the server can broadcast ai_job/proof_added
        "x-workspace-id":
          args.workspaceId || localStorage.getItem("workspaceId") || "default",
        "x-user-id":
          args.userId || localStorage.getItem("userId") || "user:local",
      },
      body: JSON.stringify({
        // Body matches the backend route contract in the repo
        model: args.model,
        fullText: args.fullText,
        selection: args.selection,
        instructions: args.instructions,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`rewriteSelection failed: ${res.status} ${text || res.statusText}`);
  }

  return (await res.json()) as RewriteResponse;
}
