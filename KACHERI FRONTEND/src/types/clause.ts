// KACHERI FRONTEND/src/types/clause.ts
// Clause Library: TypeScript types for clauses, versions, usage tracking, and AI suggestions.
//
// These types mirror the backend schemas defined in:
//   - KACHERI BACKEND/src/store/clauses.ts
//   - KACHERI BACKEND/src/store/clauseVersions.ts
//   - KACHERI BACKEND/src/store/clauseUsageLog.ts
//   - KACHERI BACKEND/src/ai/clauseMatcher.ts
//   - KACHERI BACKEND/src/routes/clauses.ts
//   - KACHERI BACKEND/src/routes/clauseInsert.ts
//
// See: Docs/Roadmap/compliance-checker-clause-library-work-scope.md — Slice B8

/* ============= Base Types ============= */

export type ClauseCategory =
  | 'general'
  | 'legal'
  | 'financial'
  | 'boilerplate'
  | 'custom';

export type InsertionMethod = 'manual' | 'ai_suggest' | 'template';

/* ============= Domain Types ============= */

/** A workspace-scoped reusable content block */
export type Clause = {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  contentHtml: string;
  contentText: string;
  category: ClauseCategory;
  tags: string[];
  language: string;
  version: number;
  usageCount: number;
  isArchived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** A version snapshot for clause content changes */
export type ClauseVersion = {
  id: string;
  clauseId: string;
  version: number;
  contentHtml: string;
  contentText: string;
  changeNote: string | null;
  createdBy: string;
  createdAt: string;
};

/** A clause similarity match from AI detection engine */
export type ClauseMatch = {
  clause: Clause;
  similarity: number;     // 0-100 AI-rated similarity score
  keywordScore: number;   // 0-1 keyword overlap score (pre-filter)
  matchReason: string;    // brief explanation from AI
};

/* ============= API Request Types ============= */

export type ListClausesOptions = {
  search?: string;
  category?: ClauseCategory;
  tag?: string;
  limit?: number;
  offset?: number;
};

export type CreateClauseParams = {
  title: string;
  description?: string;
  contentHtml: string;
  contentText: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
};

export type UpdateClauseParams = {
  title?: string;
  description?: string | null;
  contentHtml?: string;
  contentText?: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
  changeNote?: string;
};

export type InsertClauseParams = {
  clauseId: string;
  insertionMethod?: InsertionMethod;
};

export type SuggestClausesParams = {
  text: string;
};

export type FromSelectionParams = {
  contentHtml: string;
  contentText: string;
  title?: string;
  description?: string;
  category?: ClauseCategory;
  tags?: string[];
  language?: string;
};

/* ============= API Response Types ============= */

/** Response from GET /workspaces/:wid/clauses */
export type ListClausesResponse = {
  workspaceId: string;
  clauses: Clause[];
  total: number;
  limit: number;
  offset: number;
};

/** Response from GET /workspaces/:wid/clauses/:cid */
export type GetClauseResponse = {
  clause: Clause;
};

/** Response from POST /workspaces/:wid/clauses */
export type CreateClauseResponse = {
  clause: Clause;
  message: string;
};

/** Response from PATCH /workspaces/:wid/clauses/:cid */
export type UpdateClauseResponse = {
  clause: Clause;
  versionCreated: boolean;
  newVersion: number | null;
  message: string;
};

/** Response from DELETE /workspaces/:wid/clauses/:cid (archive) */
export type ArchiveClauseResponse = {
  clause: Clause;
  message: string;
};

/** Response from GET /workspaces/:wid/clauses/:cid/versions */
export type ListVersionsResponse = {
  clauseId: string;
  versions: ClauseVersion[];
  total: number;
};

/** Response from GET /workspaces/:wid/clauses/:cid/versions/:vid */
export type GetVersionResponse = {
  version: ClauseVersion;
};

/** Response from POST /docs/:id/clauses/insert */
export type InsertClauseResponse = {
  clauseId: string;
  clauseTitle: string;
  version: number;
  contentHtml: string;
  contentText: string;
  docId: string;
  proofId: number | null;
  proofHash: string;
  usageCount: number;
  insertionMethod: InsertionMethod;
  message: string;
};

/** Response from POST /docs/:id/clauses/suggest */
export type SuggestClausesResponse = {
  suggestions: ClauseMatch[];
  totalCandidates: number;
  aiCompared: number;
  provider: string | null;
  model: string | null;
};

/** Response from POST /workspaces/:wid/clauses/from-selection */
export type FromSelectionResponse = {
  clause: Clause;
  aiGenerated: {
    title: boolean;
    description: boolean;
    category: boolean;
  };
  message: string;
};
