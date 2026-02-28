// KACHERI BACKEND/src/db/fts.ts
// S16: Full-text search helpers — generates database-specific FTS SQL.
//
// SQLite uses FTS5 virtual tables (docs_fts, entities_fts) with MATCH queries.
// PostgreSQL uses tsvector columns (docs_fts_pg, entities_fts_pg) with @@ operator.
//
// Store modules that perform FTS queries call these helpers, passing db.dbType,
// so the correct SQL is generated for the active database engine.

/* ---------- Types ---------- */

export interface FtsQueryResult {
  sql: string;
  params: unknown[];
}

/* ---------- Document FTS ---------- */

/**
 * Build a full-text search query for the docs FTS index.
 * Returns SQL and params ready for db.queryAll().
 */
export function buildDocFtsQuery(opts: {
  workspaceId: string;
  term: string;
  limit: number;
  offset: number;
  snippetLength?: number;
  dbType: 'sqlite' | 'postgresql';
}): FtsQueryResult {
  if (opts.dbType === 'sqlite') {
    // Sanitize: wrap individual tokens in double quotes to escape FTS5 special chars
    const sanitized = opts.term
      .split(/\s+/)
      .filter(Boolean)
      .map(t => `"${t.replace(/"/g, '')}"`)
      .join(' ');
    const snipLen = opts.snippetLength ?? 20;
    return {
      sql: `
        SELECT doc_id, workspace_id, title,
          snippet(docs_fts, 3, '<mark>', '</mark>', '...', ?) AS snippet,
          rank
        FROM docs_fts
        WHERE docs_fts MATCH ? AND workspace_id = ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `,
      params: [snipLen, sanitized, opts.workspaceId, opts.limit, opts.offset],
    };
  } else {
    // PostgreSQL: plainto_tsquery parses the term safely (handles special chars)
    return {
      sql: `
        SELECT doc_id, workspace_id, title,
          ts_headline(
            'english', content_text,
            plainto_tsquery('english', ?),
            'MaxWords=35, MinWords=15, ShortWord=3, HighlightAll=FALSE,
             MaxFragments=1, StartSel=<mark>, StopSel=</mark>'
          ) AS snippet,
          ts_rank(search_vector, plainto_tsquery('english', ?)) AS rank
        FROM docs_fts_pg
        WHERE search_vector @@ plainto_tsquery('english', ?)
          AND workspace_id = ?
        ORDER BY rank DESC
        LIMIT ? OFFSET ?
      `,
      params: [
        opts.term, opts.term, opts.term,
        opts.workspaceId, opts.limit, opts.offset,
      ],
    };
  }
}

/* ---------- Entity FTS ---------- */

/**
 * Build a full-text search query for the entities FTS index.
 * Returns SQL and params ready for db.queryAll().
 */
export function buildEntityFtsQuery(opts: {
  workspaceId: string;
  term: string;
  limit: number;
  offset: number;
  dbType: 'sqlite' | 'postgresql';
}): FtsQueryResult {
  if (opts.dbType === 'sqlite') {
    const sanitized = opts.term
      .split(/\s+/)
      .filter(Boolean)
      .map(t => `"${t.replace(/"/g, '')}"`)
      .join(' ');
    return {
      sql: `
        SELECT entity_id, workspace_id, name, aliases, rank
        FROM entities_fts
        WHERE entities_fts MATCH ? AND workspace_id = ?
        ORDER BY rank
        LIMIT ? OFFSET ?
      `,
      params: [sanitized, opts.workspaceId, opts.limit, opts.offset],
    };
  } else {
    return {
      sql: `
        SELECT entity_id, workspace_id, name, aliases,
          ts_rank(search_vector, plainto_tsquery('english', ?)) AS rank
        FROM entities_fts_pg
        WHERE search_vector @@ plainto_tsquery('english', ?)
          AND workspace_id = ?
        ORDER BY rank DESC
        LIMIT ? OFFSET ?
      `,
      params: [opts.term, opts.term, opts.workspaceId, opts.limit, opts.offset],
    };
  }
}

/* ---------- FTS Sync Helpers ---------- */

/**
 * Build SQL to upsert a document into the FTS index.
 * For SQLite: DELETE + INSERT into docs_fts virtual table.
 * For PostgreSQL: UPDATE the tsvector column in docs_fts_pg.
 */
export function buildDocFtsSyncSql(dbType: 'sqlite' | 'postgresql'): {
  deleteSql: string;
  insertSql: string;
} {
  if (dbType === 'sqlite') {
    return {
      deleteSql: 'DELETE FROM docs_fts WHERE doc_id = ?',
      insertSql: `
        INSERT INTO docs_fts (doc_id, workspace_id, title, content_text)
        VALUES (?, ?, ?, ?)
      `,
    };
  } else {
    return {
      // PostgreSQL: upsert with conflict handling
      deleteSql: 'DELETE FROM docs_fts_pg WHERE doc_id = ?',
      insertSql: `
        INSERT INTO docs_fts_pg (doc_id, workspace_id, title, content_text, search_vector)
        VALUES (?, ?, ?, ?,
          to_tsvector('english', coalesce(?, '') || ' ' || coalesce(?, '')))
        ON CONFLICT (doc_id) DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          title = EXCLUDED.title,
          content_text = EXCLUDED.content_text,
          search_vector = EXCLUDED.search_vector
      `,
    };
  }
}

/**
 * Build SQL to upsert an entity into the entities FTS index.
 */
export function buildEntityFtsSyncSql(dbType: 'sqlite' | 'postgresql'): {
  deleteSql: string;
  insertSql: string;
} {
  if (dbType === 'sqlite') {
    return {
      deleteSql: 'DELETE FROM entities_fts WHERE entity_id = ?',
      insertSql: `
        INSERT INTO entities_fts (entity_id, workspace_id, name, aliases)
        VALUES (?, ?, ?, ?)
      `,
    };
  } else {
    return {
      deleteSql: 'DELETE FROM entities_fts_pg WHERE entity_id = ?',
      insertSql: `
        INSERT INTO entities_fts_pg (entity_id, workspace_id, name, aliases, search_vector)
        VALUES (?, ?, ?, ?,
          to_tsvector('english', coalesce(?, '') || ' ' || coalesce(?, '')))
        ON CONFLICT (entity_id) DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          name = EXCLUDED.name,
          aliases = EXCLUDED.aliases,
          search_vector = EXCLUDED.search_vector
      `,
    };
  }
}
