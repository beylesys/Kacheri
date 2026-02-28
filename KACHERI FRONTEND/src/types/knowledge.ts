// KACHERI FRONTEND/src/types/knowledge.ts
// Cross-Document Intelligence: TypeScript types for knowledge graph entities,
// relationships, mentions, search, and indexing.
//
// These types mirror the backend schemas defined in:
//   - KACHERI BACKEND/src/store/workspaceEntities.ts
//   - KACHERI BACKEND/src/store/entityMentions.ts
//   - KACHERI BACKEND/src/store/entityRelationships.ts
//   - KACHERI BACKEND/src/store/knowledgeQueries.ts
//   - KACHERI BACKEND/src/knowledge/semanticSearch.ts
//   - KACHERI BACKEND/src/knowledge/relatedDocs.ts
//   - KACHERI BACKEND/src/routes/knowledge.ts
//
// See: Docs/Roadmap/cross-document-intelligence-work-scope.md — Slice 12

/* ============= Base Types ============= */

export type EntityType =
  | 'person'
  | 'organization'
  | 'date'
  | 'amount'
  | 'location'
  | 'product'
  | 'term'
  | 'concept'
  | 'web_page'
  | 'research_source'
  | 'design_asset'
  | 'event'
  | 'citation';

export type ProductSource = 'docs' | 'design-studio' | 'research' | 'notes' | 'sheets';

export type RelationshipType =
  | 'co_occurrence'
  | 'contractual'
  | 'financial'
  | 'organizational'
  | 'temporal'
  | 'custom';

export type MentionSource = 'extraction' | 'manual' | 'ai_index';

export type QueryType = 'semantic_search' | 'entity_search' | 'related_docs';

export type IndexMode = 'full' | 'incremental';

/* ============= Domain Types ============= */

/** Entity summary as returned in list endpoints */
export type Entity = {
  id: string;
  entityType: EntityType;
  name: string;
  aliases: string[];
  mentionCount: number;
  docCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

/** Full entity detail with normalized name and metadata */
export type EntityDetail = {
  id: string;
  entityType: EntityType;
  name: string;
  normalizedName: string;
  aliases: string[];
  metadata: Record<string, unknown> | null;
  mentionCount: number;
  docCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

/** A mention of an entity in a specific document or cross-product source */
export type EntityMention = {
  docId: string | null;
  docTitle: string | null;
  context: string | null;
  fieldPath: string | null;
  confidence: number;
  productSource?: ProductSource;
  sourceRef?: string | null;
};

/** A relationship from entity detail (shows the "other" entity) */
export type EntityRelationship = {
  id: string;
  relatedEntity: {
    id: string;
    name: string;
    entityType: EntityType;
  };
  relationshipType: RelationshipType;
  label: string | null;
  strength: number;
  evidenceCount: number;
};

/** A relationship in workspace list (shows both entities) */
export type RelationshipListItem = {
  id: string;
  fromEntity: {
    id: string;
    name: string;
    entityType: EntityType;
  };
  toEntity: {
    id: string;
    name: string;
    entityType: EntityType;
  };
  relationshipType: RelationshipType;
  label: string | null;
  strength: number;
  evidenceCount: number;
};

/** An entity mention in a specific document (per-doc endpoint) */
export type DocEntity = {
  entityId: string;
  entityType: EntityType;
  name: string;
  context: string | null;
  confidence: number;
  fieldPath: string | null;
};

/** A shared entity between related documents */
export type SharedEntity = {
  name: string;
  entityType: EntityType;
};

/** A document related via shared entities */
export type RelatedDoc = {
  docId: string;
  title: string;
  relevance: number;
  sharedEntities: SharedEntity[];
  sharedEntityCount: number;
};

/** A snippet within a semantic search result */
export type SearchResultSnippet = {
  text: string;
  fieldPath: string | null;
};

/** A single result from semantic search */
export type SearchResult = {
  docId: string;
  docTitle: string;
  relevance: number;
  snippets: SearchResultSnippet[];
  matchedEntities: string[];
};

/** A query summary for recent queries list */
export type KnowledgeQuerySummary = {
  id: string;
  query: string;
  resultCount: number;
  createdAt: string;
};

/** A top entity in summary endpoint */
export type TopEntity = {
  id: string;
  name: string;
  entityType: EntityType;
  docCount: number;
};

/** An entity result from keyword (FTS5) search */
export type KeywordSearchEntity = {
  id: string;
  name: string;
  entityType: string | null;
  docCount: number | null;
};

/** A document result from keyword (FTS5) search */
export type KeywordSearchDocument = {
  docId: string;
  title: string;
  snippet: string;
};

/* ============= API Request Types ============= */

export type ListEntitiesOptions = {
  type?: EntityType;
  search?: string;
  sort?: 'doc_count' | 'name' | 'created_at' | 'mention_count';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  productSource?: ProductSource;
};

export type UpdateEntityParams = {
  name?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
};

export type MergeEntitiesParams = {
  sourceEntityIds: string[];
  targetEntityId: string;
  mergedName: string;
};

export type ListRelationshipsOptions = {
  entityId?: string;
  type?: RelationshipType;
  minStrength?: number;
  limit?: number;
  offset?: number;
};

export type SemanticSearchParams = {
  query: string;
  queryType?: QueryType;
  limit?: number;
};

export type TriggerIndexParams = {
  mode?: IndexMode;
  forceReindex?: boolean;
};

/* ============= API Response Types ============= */

/** Response from GET /workspaces/:wid/knowledge/entities */
export type ListEntitiesResponse = {
  entities: Entity[];
  total: number;
  limit: number;
  offset: number;
};

/** Response from GET /workspaces/:wid/knowledge/entities/:eid */
export type GetEntityDetailResponse = {
  entity: EntityDetail;
  mentions: EntityMention[];
  relationships: EntityRelationship[];
};

/** Response from PATCH /workspaces/:wid/knowledge/entities/:eid */
export type UpdateEntityResponse = EntityDetail;

/** Response from POST /workspaces/:wid/knowledge/entities/merge */
export type MergeEntitiesResponse = {
  mergedEntity: EntityDetail;
  mergedMentionCount: number;
  deletedEntityIds: string[];
};

/** Response from GET /workspaces/:wid/knowledge/relationships */
export type ListRelationshipsResponse = {
  relationships: RelationshipListItem[];
  total: number;
};

/** Response from GET /docs/:id/entities */
export type DocEntitiesResponse = {
  entities: DocEntity[];
  total: number;
};

/** Response from GET /docs/:id/related */
export type RelatedDocsResponse = {
  relatedDocs: RelatedDoc[];
  entityCount: number;
  totalRelated: number;
};

/** Response from POST /workspaces/:wid/knowledge/search */
export type SemanticSearchResponse = {
  queryId: string;
  query: string;
  answer: string;
  results: SearchResult[];
  resultCount: number;
  proofId: string | null;
  durationMs: number;
};

/** Response from GET /workspaces/:wid/knowledge/search?q=... */
export type KeywordSearchResponse = {
  entities: KeywordSearchEntity[];
  documents: KeywordSearchDocument[];
};

/** Response from POST /workspaces/:wid/knowledge/index */
export type TriggerIndexResponse = {
  jobId: string;
  status: string;
  estimatedDocs: number;
};

/** Response from GET /workspaces/:wid/knowledge/status */
export type IndexStatusResponse = {
  entityCount: number;
  mentionCount: number;
  relationshipCount: number;
  indexedDocCount: number;
  totalDocCount: number;
  lastIndexedAt: string | null;
  indexingInProgress: boolean;
};

/** Response from GET /workspaces/:wid/knowledge/summary */
export type KnowledgeSummaryResponse = {
  stats: {
    entityCount: number;
    relationshipCount: number;
    indexedDocs: number;
    totalDocs: number;
    queryCount: number;
  };
  topEntities: TopEntity[];
  entityTypeBreakdown: Record<string, number>;
  recentQueries: KnowledgeQuerySummary[];
};
