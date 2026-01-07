-- Migration: add_jobs_table
-- Version: 003
-- Created: 2025-12-30
-- Purpose: P4.3 - Create jobs table for background job queue

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                      -- job type: export:pdf, export:docx, verify:export, etc.
  doc_id TEXT,                             -- optional: associated document
  user_id TEXT NOT NULL,                   -- user who triggered the job
  payload TEXT,                            -- JSON payload for the job
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
  priority INTEGER NOT NULL DEFAULT 0,     -- higher = more urgent
  attempts INTEGER NOT NULL DEFAULT 0,     -- number of attempts made
  max_attempts INTEGER NOT NULL DEFAULT 3, -- maximum retry attempts
  created_at INTEGER NOT NULL,             -- Unix timestamp ms
  started_at INTEGER,                      -- when processing began
  completed_at INTEGER,                    -- when job finished
  error TEXT,                              -- error message if failed
  result TEXT,                             -- JSON result if completed
  worker_id TEXT,                          -- which worker is processing
  scheduled_at INTEGER                     -- for delayed jobs
);

-- Indexes for job queue operations
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_jobs_doc ON jobs(doc_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_priority_created ON jobs(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON jobs(scheduled_at);

-- Composite index for fetching next job to process
CREATE INDEX IF NOT EXISTS idx_jobs_pending_queue ON jobs(status, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- DOWN
DROP TABLE IF EXISTS jobs;
