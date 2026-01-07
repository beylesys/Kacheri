# Kacheri Session Report - December 26, 2025

## Session Overview

This session focused on implementing **Slice 4: Workspace-Scoped Documents** and **Slice 4b: Workspace-Scoped File Tree**. This completes the workspace isolation infrastructure per roadmap item 1.3.

---

## Work Completed

### 1. Docs Store Migration: JSON to SQLite

#### Problem
Documents were stored in a JSON file (`data/docs.json`), which doesn't support workspace scoping or proper indexing.

#### Solution
Completely rewrote `KACHERI BACKEND/src/store/docs.ts` to use SQLite:

**New docs table schema:**
```sql
CREATE TABLE docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  workspace_id TEXT,           -- NULL = unscoped (legacy)
  created_at INTEGER NOT NULL, -- Unix timestamp ms
  updated_at INTEGER NOT NULL  -- Unix timestamp ms
);
CREATE INDEX idx_docs_workspace ON docs(workspace_id);
CREATE INDEX idx_docs_updated ON docs(updated_at DESC);
```

**Key changes:**
- All CRUD operations now use SQLite
- `listDocs(workspaceId?)` - filters by workspace when provided
- `createDoc(title, workspaceId?)` - assigns workspace on creation
- Automatic migration from `docs.json` on server startup
- Legacy async wrappers (`readDocs()`) preserved for compatibility

---

### 2. fs_nodes Workspace Scoping

#### Schema Update
Added `workspace_id` column to `fs_nodes` table in `db.ts`:

```sql
CREATE TABLE fs_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  doc_id TEXT,
  workspace_id TEXT,           -- NEW: workspace scoping
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX idx_fs_nodes_workspace ON fs_nodes(workspace_id);
```

#### Store Updates
Updated `src/store/fsNodes.ts`:
- `ensureRootFolderId(workspaceId?)` - each workspace gets its own root folder
- `listChildren(parentId?, workspaceId?)` - scoped listing
- `createFolder({..., workspaceId?})` - scoped folder creation
- `attachDocNode(docId, name, parentId?, workspaceId?)` - scoped doc attachment
- `moveNode(nodeId, parentId, workspaceId?)` - respects workspace for root resolution

---

### 3. Route Updates for Workspace Scoping

#### server.ts - Doc Routes
Updated all `/docs` routes to use workspace context from `X-Workspace-Id` header:

```typescript
// GET /docs - now returns workspace-scoped docs
app.get('/docs', async (req) => {
  const workspaceId = devWorkspace(req);
  return listDocs(workspaceId);
});

// POST /docs - creates doc in current workspace
app.post('/docs', async (req, reply) => {
  const workspaceId = devWorkspace(req);
  const doc = createDoc(body.title || 'Untitled', workspaceId);
  // ...
});
```

#### routes/files.ts - File Manager Routes
Updated all `/files/*` routes to extract and pass workspace ID:

```typescript
function getWorkspaceId(req: FastifyRequest): string | undefined {
  const w = (req.headers['x-workspace-id'] as string | undefined)?.toString().trim();
  return w && w.length ? w : undefined;
}

// GET /files/tree - workspace-scoped
const nodes = listChildren(parentId, workspaceId);

// POST /files/folder - workspace-scoped
const node = createFolder({ parentId, name, workspaceId });

// POST /files/doc - workspace-scoped
const node = attachDocNode(docId, rawName, parentId, workspaceId);
```

---

### 4. Migration Script

Created `scripts/migrations/add_workspace_scoping.ts`:
- Creates `docs` table if missing
- Adds `workspace_id` column to existing tables
- Creates indexes for workspace queries
- Migrates docs from `docs.json` to SQLite (idempotent)

**Run with:**
```bash
cd "KACHERI BACKEND"
npx tsx scripts/migrations/add_workspace_scoping.ts
```

---

## Files Modified

### Backend

| File | Change |
|------|--------|
| `src/db.ts` | Added `docs` table schema with `workspace_id`; Added `workspace_id` to `fs_nodes` |
| `src/store/docs.ts` | Complete rewrite: JSON → SQLite with workspace scoping |
| `src/store/fsNodes.ts` | Added `workspace_id` parameter to all functions |
| `src/server.ts` | Updated doc routes to use new sync functions with workspace |
| `src/routes/files.ts` | Added workspace extraction and passing to store functions |
| `scripts/migrations/add_workspace_scoping.ts` | New migration script |

---

## API Behavior Changes

### Before (Slice 3)
- `GET /docs` - returns ALL docs regardless of workspace
- `POST /docs` - creates doc with no workspace association
- `GET /files/tree` - returns ALL fs_nodes regardless of workspace

### After (Slice 4)
- `GET /docs` with `X-Workspace-Id: ws_123` - returns only docs in that workspace
- `POST /docs` with `X-Workspace-Id: ws_123` - creates doc scoped to that workspace
- `GET /files/tree` with `X-Workspace-Id: ws_123` - returns only fs_nodes in that workspace
- Each workspace gets its own independent root folder

### Backward Compatibility
- Requests without `X-Workspace-Id` header still work (returns unscoped/all data)
- Existing docs and fs_nodes with `workspace_id = NULL` remain accessible
- Frontend already sends `X-Workspace-Id` header (implemented in api.ts during Slice 3)

---

## Data Model

### Document Isolation
```
Workspace A (ws_abc)          Workspace B (ws_xyz)
├── Doc 1 (workspace_id: ws_abc)  ├── Doc 3 (workspace_id: ws_xyz)
├── Doc 2 (workspace_id: ws_abc)  └── Doc 4 (workspace_id: ws_xyz)
│
└── Legacy docs (workspace_id: NULL) - visible to all or filtered out
```

### File Tree Isolation
```
Workspace A Root (fs_nodes.workspace_id: ws_abc)
├── Folder A
│   └── Doc 1
└── Folder B

Workspace B Root (fs_nodes.workspace_id: ws_xyz)
├── Projects
│   └── Doc 3
└── Archive
```

---

## Testing Notes

1. **Fresh install:** Schema is created correctly with workspace columns
2. **Existing database:** Run migration script to add columns
3. **Existing docs.json:** Migrated automatically on server startup

---

## Risks / Known Issues

1. **Pre-existing data:** Legacy docs/fs_nodes without `workspace_id` remain accessible but unscoped
2. **Pre-existing errors:** `detectFields.ts` has type errors unrelated to this slice (pre-existing)

---

## Next Steps (Slice 5+)

Per roadmap 1.3 remaining items:
1. **Doc-level permissions** - owner/editor/commenter/viewer per document
2. **Share dialog** - per-user access with view/comment/edit levels
3. **Workspace-level roles** - enforce read/write based on membership role
4. **Audit log v1** - membership changes, sharing updates, destructive actions
5. **Trash/recovery** - soft-delete for docs and folders

---

## Summary

Slice 4 is complete. Documents and file trees are now fully isolated by workspace. The frontend already sends `X-Workspace-Id` on all requests, so workspace isolation is now active.
