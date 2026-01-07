// KACHERI BACKEND/src/jobs/types.ts
// P4.3: Job queue type definitions
//
// Defines job types, statuses, and interfaces for the background job system.

/* ---------- Job Types ---------- */
export type JobType =
  | "export:pdf"
  | "export:docx"
  | "verify:export"
  | "verify:compose"
  | "import:file"
  | "cleanup:orphan";

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

/* ---------- Job Interface ---------- */
export interface Job<T = unknown> {
  id: string;
  type: JobType;
  docId: string | null;
  userId: string;
  payload: T;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  scheduledAt: number | null;
  error: string | null;
  result: unknown;
  workerId: string | null;
}

/* ---------- Job Row (Database) ---------- */
export interface JobRow {
  id: string;
  type: string;
  doc_id: string | null;
  user_id: string;
  payload: string | null;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  scheduled_at: number | null;
  error: string | null;
  result: string | null;
  worker_id: string | null;
}

/* ---------- Job Options ---------- */
export interface JobOptions {
  /** Job priority (higher = more urgent, default: 0) */
  priority?: number;
  /** Delay execution by N milliseconds */
  delay?: number;
  /** Maximum retry attempts (default: 3) */
  maxAttempts?: number;
  /** Schedule job for specific timestamp */
  scheduledAt?: number;
}

/* ---------- Job Handler ---------- */
export type JobHandler<T = unknown, R = unknown> = (
  job: Job<T>
) => Promise<R>;

/* ---------- Job Queue Events ---------- */
export interface JobQueueEvents {
  jobCreated: (job: Job) => void;
  jobStarted: (job: Job) => void;
  jobCompleted: (job: Job, result: unknown) => void;
  jobFailed: (job: Job, error: Error) => void;
  jobRetrying: (job: Job, attempt: number) => void;
}

/* ---------- Payload Types ---------- */
export interface ExportPdfPayload {
  docId: string;
  title: string;
  html: string;
  options?: {
    format?: "A4" | "Letter";
    margin?: { top?: string; right?: string; bottom?: string; left?: string };
  };
}

export interface ExportDocxPayload {
  docId: string;
  title: string;
  html: string;
}

export interface VerifyExportPayload {
  artifactId: number;
  docId: string;
  hash: string;
  path: string;
}

export interface VerifyComposePayload {
  artifactId: number;
  docId: string;
  promptHash: string;
}

export interface ImportFilePayload {
  docId: string;
  filePath: string;
  fileType: string;
}

export interface CleanupOrphanPayload {
  olderThanDays?: number;
}

/* ---------- Result Types ---------- */
export interface ExportResult {
  path: string;
  hash: string;
  size: number;
}

export interface VerifyResult {
  status: "pass" | "fail" | "miss";
  message?: string;
}

export interface ImportResult {
  docId: string;
  imported: boolean;
}

export interface CleanupResult {
  deleted: number;
  errors: string[];
}
