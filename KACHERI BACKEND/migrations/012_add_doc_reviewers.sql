-- 012_add_doc_reviewers.sql
-- Review Assignment System (Phase 2 Sprint 4, Slice 12)
-- Stores reviewer assignments per document with status tracking.

CREATE TABLE IF NOT EXISTS doc_reviewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,             -- the reviewer
  assigned_by TEXT NOT NULL,         -- who assigned them
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'in_review', 'completed'
  assigned_at INTEGER NOT NULL,
  completed_at INTEGER,
  notes TEXT,                        -- optional reviewer notes on completion
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE,
  UNIQUE(doc_id, user_id)           -- one assignment per user per doc
);

CREATE INDEX idx_doc_reviewers_doc ON doc_reviewers(doc_id);
CREATE INDEX idx_doc_reviewers_user ON doc_reviewers(user_id, workspace_id);

-- Rollback (uncomment to undo):
-- DROP INDEX IF EXISTS idx_doc_reviewers_user;
-- DROP INDEX IF EXISTS idx_doc_reviewers_doc;
-- DROP TABLE IF EXISTS doc_reviewers;
