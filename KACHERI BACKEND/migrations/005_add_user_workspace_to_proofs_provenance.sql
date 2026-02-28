-- Migration 005: Add user IDs and workspace_id to proofs and provenance
-- Purpose: Pilot-Ready Gap 1 (user tracking) + Gap 2 (workspace scoping)
-- Created: 2026-02-06

-- Gap 1: User IDs — who created each proof/provenance entry
ALTER TABLE proofs ADD COLUMN created_by TEXT;
ALTER TABLE provenance ADD COLUMN actor_id TEXT;

-- Gap 2: Workspace scoping — enable workspace-level queries
ALTER TABLE proofs ADD COLUMN workspace_id TEXT;
ALTER TABLE provenance ADD COLUMN workspace_id TEXT;

-- Indexes for workspace-scoped and user-scoped queries
CREATE INDEX IF NOT EXISTS idx_proofs_workspace ON proofs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proofs_created_by ON proofs(created_by);
CREATE INDEX IF NOT EXISTS idx_prov_workspace ON provenance(workspace_id);
CREATE INDEX IF NOT EXISTS idx_prov_actor_id ON provenance(actor_id);

-- Backfill workspace_id from docs table for existing rows
UPDATE proofs SET workspace_id = (
  SELECT d.workspace_id FROM docs d WHERE d.id = proofs.doc_id
) WHERE workspace_id IS NULL AND doc_id IS NOT NULL;

UPDATE provenance SET workspace_id = (
  SELECT d.workspace_id FROM docs d WHERE d.id = provenance.doc_id
) WHERE workspace_id IS NULL AND doc_id IS NOT NULL;
