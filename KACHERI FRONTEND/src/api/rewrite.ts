// src/api/rewrite.ts
// Thin client for rewrite APIs.
//
// Repo truth (existing):
//   POST /docs/:id/ai/rewriteSelection
//     body: { fullText, selection{start,end}, instructions }
//     returns: { rewrittenSpan, newFullText, ... } and emits proof via WS.
//
// New (Strict Mode):
//   POST /docs/:id/ai/constrainedRewrite
//     body: { fullText, selection?: {start,end}|null, instructions, model? }
//     returns: { newFullText, meta?: { proofId, model? } } and emits proof via WS.

export type Selection = { start: number; end: number };

export async function rewriteSelection(params: {
  docId: string;
  fullText: string;
  selection: Selection;
  instructions: string;
  workspaceId: string;
  userId: string;
}) {
  const { docId, fullText, selection, instructions, workspaceId, userId } = params;

  const res = await fetch(`/docs/${encodeURIComponent(docId)}/ai/rewriteSelection`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workspace-id': workspaceId,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      fullText,
      selection,
      instructions,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`rewriteSelection failed (${res.status}): ${text || res.statusText}`);
  }

  // { rewrittenSpan: string, newFullText: string, meta?: any }
  return (await res.json()) as {
    rewrittenSpan: string;
    newFullText: string;
    meta?: unknown;
  };
}

export async function rewriteConstrained(params: {
  docId: string;
  fullText: string;
  selection?: Selection | null; // omit or null → full-doc strict mode
  instructions: string;
  workspaceId: string;
  userId: string;
  model?: string;
}) {
  const { docId, fullText, selection, instructions, workspaceId, userId, model } = params;

  const body: any = { fullText, instructions };
  if (selection && selection.start < selection.end) body.selection = selection;
  if (model) body.model = model;

  const res = await fetch(`/docs/${encodeURIComponent(docId)}/ai/constrainedRewrite`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workspace-id': workspaceId,
      'x-user-id': userId,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`rewriteConstrained failed (${res.status}): ${text || res.statusText}`);
  }

  // { newFullText: string, meta?: { proofId?: number|string, model?: string } }
  return (await res.json()) as {
    newFullText: string;
    meta?: { proofId?: number | string; model?: string };
  };
}
