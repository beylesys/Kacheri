-- Migration: add_artifacts_columns
-- Version: 002
-- Created: 2025-12-30
-- Purpose: P4.1 - Enhance proofs table with storage abstraction and verification columns

-- Add storage provider column (local, s3, gcs)
-- Using a helper approach since SQLite doesn't support ADD COLUMN IF NOT EXISTS
-- The migration runner handles this gracefully

ALTER TABLE proofs ADD COLUMN storage_provider TEXT DEFAULT 'local';

-- Add normalized storage key (path within storage provider)
ALTER TABLE proofs ADD COLUMN storage_key TEXT;

-- Add verification timestamp
ALTER TABLE proofs ADD COLUMN verified_at INTEGER;

-- Add verification status
ALTER TABLE proofs ADD COLUMN verification_status TEXT DEFAULT 'pending';

-- Create indexes for efficient storage and verification queries
CREATE INDEX IF NOT EXISTS idx_proofs_storage ON proofs(storage_provider, storage_key);
CREATE INDEX IF NOT EXISTS idx_proofs_status ON proofs(verification_status);
CREATE INDEX IF NOT EXISTS idx_proofs_verified ON proofs(verified_at);

-- DOWN
-- Note: SQLite doesn't support DROP COLUMN in older versions
-- For rollback, we would need to recreate the table without these columns
-- Leaving as no-op for safety - columns can remain unused

DROP INDEX IF EXISTS idx_proofs_storage;
DROP INDEX IF EXISTS idx_proofs_status;
DROP INDEX IF EXISTS idx_proofs_verified;
