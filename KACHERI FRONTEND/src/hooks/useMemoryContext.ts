// KACHERI FRONTEND/src/hooks/useMemoryContext.ts
// Memory Graph pull hook for JAAL — Slice S13 (Phase D)
//
// Encapsulates all Memory Graph pull logic:
//   - URL-based auto-context: extract domain → search entities
//   - Manual keyword search: user-typed query → FTS5 search
//   - Entity detail expansion: fetch mentions with productSource for badges + navigation
//   - Feature flag gating: isFeatureEnabled('memoryGraph')
//
// Uses jaalApi memory* methods (which delegate to knowledge API endpoints).
// No backend changes — all endpoints already exist.
//
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Slice S13

import { useState, useEffect, useCallback, useRef } from 'react';
import { jaalApi } from '../api/jaal';
import { isFeatureEnabled } from '../modules/registry';
import type {
  Entity,
  EntityDetail,
  EntityMention,
  EntityRelationship,
  KeywordSearchEntity,
} from '../types/knowledge';

/* ---------- Types ---------- */

export interface ContextEntity {
  id: string;
  name: string;
  entityType: string;
  lastSeenAt: string;
  mentionCount: number;
}

export interface ExpandedEntityDetail {
  entityId: string;
  entity: EntityDetail | null;
  mentions: EntityMention[];
  relationships: EntityRelationship[];
}

export interface MemoryContextState {
  /** Entities from URL-based auto-context or manual search */
  entities: ContextEntity[];
  /** Whether currently loading entity list */
  loading: boolean;
  /** Error message, or null */
  error: string | null;
  /** Whether Memory Graph feature is enabled */
  memoryGraphEnabled: boolean;
  /** Active search query (null = URL-based auto context) */
  searchQuery: string | null;
  /** Expanded entity detail (fetched on click) */
  expandedEntity: ExpandedEntityDetail | null;
  /** Whether entity detail is loading */
  detailLoading: boolean;
}

export interface MemoryContextActions {
  /** Execute manual keyword search */
  search: (query: string) => void;
  /** Clear search and return to URL-based context */
  clearSearch: () => void;
  /** Expand an entity to show its detail (mentions by product source) */
  expandEntity: (entityId: string) => void;
  /** Collapse expanded entity detail */
  collapseEntity: () => void;
  /** Retry after error */
  retry: () => void;
}

export type UseMemoryContextResult = MemoryContextState & MemoryContextActions;

/* ---------- Helpers ---------- */

const DEBOUNCE_MS = 300;
const ENTITY_LIMIT = 20;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Normalize Entity (from listEntities) into ContextEntity */
function entityToContext(e: Entity): ContextEntity {
  return {
    id: e.id,
    name: e.name,
    entityType: e.entityType,
    lastSeenAt: e.lastSeenAt,
    mentionCount: e.mentionCount,
  };
}

/** Normalize KeywordSearchEntity (from keywordSearch) into ContextEntity */
function keywordEntityToContext(e: KeywordSearchEntity): ContextEntity {
  return {
    id: e.id,
    name: e.name,
    entityType: e.entityType ?? 'concept',
    lastSeenAt: '', // keyword search doesn't return timestamps
    mentionCount: e.docCount ?? 0,
  };
}

/* ---------- Hook ---------- */

export function useMemoryContext(
  url: string | null,
  workspaceId: string | null,
): UseMemoryContextResult {
  const memoryGraphEnabled = isFeatureEnabled('memoryGraph');

  const [entities, setEntities] = useState<ContextEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [expandedEntity, setExpandedEntity] = useState<ExpandedEntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Refs for debounce and abort
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  // Stable ref for the latest search query to avoid stale closures
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  /* ---- Abort helpers ---- */

  const cancelPendingList = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const cancelPendingDetail = useCallback(() => {
    if (detailAbortRef.current) {
      detailAbortRef.current.abort();
      detailAbortRef.current = null;
    }
  }, []);

  /* ---- Fetch entity list (URL-based auto-context) ---- */

  const fetchByUrl = useCallback(
    async (targetUrl: string) => {
      if (!workspaceId || !memoryGraphEnabled) return;

      cancelPendingList();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setExpandedEntity(null);

      try {
        const domain = extractDomain(targetUrl);
        const result = await jaalApi.memorySearchEntities(workspaceId, {
          search: domain,
          limit: ENTITY_LIMIT,
        });

        // Check abort before applying state
        if (controller.signal.aborted) return;

        setEntities(result.entities.map(entityToContext));
      } catch (err) {
        if (controller.signal.aborted) return;
        // 404 = Memory Graph disabled on backend → silent empty
        if (err instanceof Error && err.message.includes('404')) {
          setEntities([]);
        } else {
          setError('Failed to load context.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [workspaceId, memoryGraphEnabled, cancelPendingList],
  );

  /* ---- Fetch entity list (manual keyword search) ---- */

  const fetchBySearch = useCallback(
    async (query: string) => {
      if (!workspaceId || !memoryGraphEnabled) return;

      cancelPendingList();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setExpandedEntity(null);

      try {
        const result = await jaalApi.memoryKeywordSearch(
          workspaceId,
          query,
          ENTITY_LIMIT,
        );

        if (controller.signal.aborted) return;

        setEntities(result.entities.map(keywordEntityToContext));
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.message.includes('404')) {
          setEntities([]);
        } else {
          setError('Search failed.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [workspaceId, memoryGraphEnabled, cancelPendingList],
  );

  /* ---- URL change effect (debounced) ---- */

  useEffect(() => {
    if (!memoryGraphEnabled || !url || !workspaceId) {
      setEntities([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Only auto-fetch when manual search is not active
    if (searchQueryRef.current !== null) return;

    cancelPendingList();

    debounceRef.current = setTimeout(() => {
      fetchByUrl(url);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [url, workspaceId, memoryGraphEnabled, fetchByUrl, cancelPendingList]);

  /* ---- Cleanup on unmount ---- */

  useEffect(() => {
    return () => {
      cancelPendingList();
      cancelPendingDetail();
    };
  }, [cancelPendingList, cancelPendingDetail]);

  /* ---- Public actions ---- */

  const search = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || !memoryGraphEnabled) return;

      setSearchQuery(trimmed);
      fetchBySearch(trimmed);
    },
    [memoryGraphEnabled, fetchBySearch],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery(null);
    setExpandedEntity(null);
    // Re-trigger URL-based context
    if (url && workspaceId && memoryGraphEnabled) {
      fetchByUrl(url);
    } else {
      setEntities([]);
    }
  }, [url, workspaceId, memoryGraphEnabled, fetchByUrl]);

  const expandEntity = useCallback(
    async (entityId: string) => {
      if (!workspaceId || !memoryGraphEnabled) return;

      cancelPendingDetail();
      const controller = new AbortController();
      detailAbortRef.current = controller;

      setDetailLoading(true);
      // Set a placeholder so the UI knows which entity is expanding
      setExpandedEntity({ entityId, entity: null, mentions: [], relationships: [] });

      try {
        const result = await jaalApi.memoryGetEntity(workspaceId, entityId);

        if (controller.signal.aborted) return;

        setExpandedEntity({
          entityId,
          entity: result.entity,
          mentions: result.mentions,
          relationships: result.relationships,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        // On error, collapse expansion
        setExpandedEntity(null);
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    },
    [workspaceId, memoryGraphEnabled, cancelPendingDetail],
  );

  const collapseEntity = useCallback(() => {
    cancelPendingDetail();
    setExpandedEntity(null);
    setDetailLoading(false);
  }, [cancelPendingDetail]);

  const retry = useCallback(() => {
    setError(null);
    if (searchQuery) {
      fetchBySearch(searchQuery);
    } else if (url) {
      fetchByUrl(url);
    }
  }, [searchQuery, url, fetchByUrl, fetchBySearch]);

  return {
    entities,
    loading,
    error,
    memoryGraphEnabled,
    searchQuery,
    expandedEntity,
    detailLoading,
    search,
    clearSearch,
    expandEntity,
    collapseEntity,
    retry,
  };
}
