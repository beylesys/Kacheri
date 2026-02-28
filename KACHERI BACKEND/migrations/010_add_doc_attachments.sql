-- Migration: add_doc_attachments
-- Version: 010
-- Created: 2026-02-19
-- Purpose: Document Attachments — per-doc file attachments with inline viewer,
--          proofs, RBAC, and workspace-level limits (Roadmap 2.8)

-- =============================================================================
-- DOC_ATTACHMENTS TABLE
-- Per-document file attachments (PDFs, images, office docs).
-- Stored on local filesystem; tagged with storage_provider='local' for future
-- S3/GCS migration during Enterprise Hardening phase.
-- =============================================================================
CREATE TABLE IF NOT EXISTS doc_attachments (
  id TEXT PRIMARY KEY,                        -- nanoid(12)
  doc_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  filename TEXT NOT NULL,                     -- original filename (sanitized)
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',  -- 'local' for now; tagged for future S3/GCS
  storage_key TEXT NOT NULL,                  -- relative path: storage/attachments/doc-{id}/{nanoid}.{ext}
  sha256 TEXT NOT NULL,                       -- hex digest of file content
  uploaded_by TEXT NOT NULL,                  -- user_id
  uploaded_at INTEGER NOT NULL,
  deleted_at INTEGER,                         -- soft delete
  metadata_json TEXT,                         -- optional: page count (PDF), dimensions (image), etc.
  FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_doc_attachments_doc
  ON doc_attachments(doc_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_doc_attachments_workspace
  ON doc_attachments(workspace_id);

-- =============================================================================
-- DOWN (Rollback)
-- =============================================================================
-- DROP INDEX IF EXISTS idx_doc_attachments_workspace;
-- DROP INDEX IF EXISTS idx_doc_attachments_doc;
-- DROP TABLE IF EXISTS doc_attachments;
