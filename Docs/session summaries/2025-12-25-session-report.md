# Kacheri Session Report - December 25, 2025

## Session Overview

This session focused on implementing **Slice 3: Workspace Boundaries** and fixing critical data persistence issues discovered during development.

---

## Work Completed

### 1. Workspace Boundaries (Slice 3)

#### Backend Implementation
- Created workspace module at `KACHERI BACKEND/src/workspace/`:
  - `types.ts` - Workspace and member type definitions
  - `store.ts` - SQLite operations for workspaces and members
  - `routes.ts` - REST API endpoints for workspace CRUD
  - `middleware.ts` - Request context injection
  - `index.ts` - Module exports

- Added database tables in `db.ts`:
  - `workspaces` - Workspace metadata (id, name, description, created_by, timestamps)
  - `workspace_members` - Role-based membership (owner, admin, editor, viewer)
  - Removed foreign key constraint to `users` table (dev mode uses synthetic user IDs)

- Registered workspace routes in `server.ts`

#### Frontend Implementation
- Created workspace module at `KACHERI FRONTEND/src/workspace/`:
  - `types.ts` - TypeScript interfaces
  - `api.ts` - API client functions
  - `WorkspaceContext.tsx` - React context for workspace state
  - `WorkspaceSwitcher.tsx` - UI component for workspace selection
  - `workspace.css` - Styling
  - `index.ts` - Module exports

- Integrated `WorkspaceProvider` in `main.tsx`
- Added `WorkspaceSwitcher` to `FileManagerPage.tsx` header

---

### 2. Critical Bug Fix: Document Content Persistence

#### Problem Discovered
Documents in the file list were visible, but editor content was empty. After investigation, the root cause was identified:

**The Yjs WebSocket server stored documents only in memory.** When processes were killed or restarted, all document content was lost permanently.

#### Solution Implemented
Completely rewrote `KACHERI BACKEND/src/realtime/yjsStandalone.ts` to use **LevelDB persistence**:

```typescript
// Key changes:
const { LeveldbPersistence } = require('y-leveldb');
const PERSISTENCE_DIR = path.join(repoRoot(), 'data', 'yjs-leveldb');
const persistence = new LeveldbPersistence(PERSISTENCE_DIR);

async function getDoc(docName: string): Promise<Y.Doc> {
  let doc = docs.get(docName);
  if (doc) return doc;

  // Load from persistence
  doc = await persistence.getYDoc(docName);
  docs.set(docName, doc);

  // Listen for updates and persist them
  doc.on('update', (update: Uint8Array) => {
    persistence.storeUpdate(docName, update);
  });

  return doc;
}
```

- Installed `y-leveldb` and `yjs` packages
- Documents now persist to `data/yjs-leveldb/` directory
- Documents survive server restarts

---

### 3. Schema Fix: Missing Database Columns

#### Problem
After wiping data for a fresh start, the app showed:
```
API 500: no such column: kind
```

#### Root Cause
The `proofs` table schema in `db.ts` was missing columns that the code expected:
- `kind` - normalized proof type
- `hash` - content hash
- `meta` - JSON metadata

These columns were added by a migration script, but the base schema didn't include them.

#### Solution
1. Updated `db.ts` to include all columns in the base schema:
```sql
CREATE TABLE IF NOT EXISTS proofs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  related_provenance_id INTEGER,
  type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  path TEXT,
  payload TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT,           -- Added
  hash TEXT,           -- Added
  meta TEXT,           -- Added
  FOREIGN KEY (related_provenance_id) REFERENCES provenance(id)
);
```

2. Created `scripts/migrations/fix_proofs_schema.ts` to add missing columns to existing databases

---

### 4. Schema Fix: Missing fs_nodes Table

#### Problem
File creation failed with:
```
SQLITE_ERROR: no such table: fs_nodes
```

#### Solution
Added `fs_nodes` table to `db.ts` base schema:
```sql
CREATE TABLE IF NOT EXISTS fs_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  doc_id TEXT,
  created_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
```

---

### 5. Error Handling Improvement

Added proper error handling for document creation in `FileManagerPage.tsx`:
```typescript
} else if (kind === "create-doc") {
  try {
    const doc = await DocsAPI.create(title);
    await FilesAPI.attachDoc({...});
    // ...
  } catch (err: any) {
    const msg = err?.message || "Failed to create document";
    console.error("[create-doc]", err);
    setPromptError(msg);
  }
}
```

---

## Files Modified

### Backend
| File | Change |
|------|--------|
| `src/db.ts` | Added `kind`, `hash`, `meta` columns to proofs; Added `fs_nodes` table; Added workspace tables |
| `src/realtime/yjsStandalone.ts` | Complete rewrite with LevelDB persistence |
| `src/server.ts` | Registered workspace routes |
| `src/workspace/*` | New module (5 files) |
| `scripts/migrations/fix_proofs_schema.ts` | New migration script |
| `package.json` | Added `y-leveldb`, `yjs` dependencies |

### Frontend
| File | Change |
|------|--------|
| `src/main.tsx` | Added WorkspaceProvider |
| `src/FileManagerPage.tsx` | Added WorkspaceSwitcher, improved error handling |
| `src/workspace/*` | New module (6 files) |

---

## Data Impact

### Lost Data
- 16 documents had content that was never persisted to disk (memory-only storage)
- Content was lost when processes were killed

### Data Wiped (User Request)
For a fresh start, the following were cleared:
- `data/db/kacheri.db` - SQLite database
- `data/docs.json` - Legacy doc store
- `data/yjs-leveldb/` - Yjs persistence (was empty anyway)
- `data/exports/` - Exported files
- `data/uploads/` - Uploaded files
- `data/proofs/` - Proof packets

---

## Lessons Learned

1. **Always persist collaborative data** - In-memory storage for Yjs is only suitable for demos, not production.

2. **Include all columns in base schema** - Migration scripts are for transitional periods; the base schema should be complete.

3. **Add error handling for all user actions** - Silent failures (like document creation) confuse users.

4. **Test with fresh database** - Wiping data revealed schema mismatches that wouldn't appear with incremental development.

---

## Current State

The application is now fully functional:
- Documents persist across server restarts (LevelDB)
- All database tables are created correctly on fresh install
- Workspace infrastructure is in place (Slice 3 complete)
- File manager works correctly for creating documents and folders

---

## Next Steps (Slice 4+)

1. Scope documents to workspaces
2. Add workspace-based access control
3. Implement workspace invitations and member management UI
