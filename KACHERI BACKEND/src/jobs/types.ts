// KACHERI BACKEND/src/jobs/types.ts
// P4.3: Job queue type definitions
//
// Defines job types, statuses, and interfaces for the background job system.

/* ---------- Job Types ---------- */
export type JobType =
  | "verify:export"
  | "verify:compose"
  | "reminder:extraction"
  | "knowledge:index"
  | "notification:deliver"
  | "canvas:export";

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

export interface ReminderExtractionPayload {
  extractionId: string;
  actionId: string;
  docId: string;
  fieldPath: string | null;
  message: string;
  userId: string;
  workspaceId?: string;
}

export interface KnowledgeIndexPayload {
  workspaceId: string;
  mode: "full" | "incremental";
  forceReindex: boolean;
  userId: string;
}

/* ---------- Result Types ---------- */
export interface VerifyResult {
  status: "pass" | "fail" | "miss";
  message?: string;
}

export interface ReminderResult {
  actionId: string;
  status: "completed" | "skipped" | "error";
  message?: string;
}

export interface KnowledgeIndexResult {
  workspaceId: string;
  mode: "full" | "incremental";
  docsProcessed: number;
  entitiesCreated: number;
  entitiesReused: number;
  mentionsCreated: number;
  normalizationSuggestions: number;
  autoMerged: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
  ftsEntitiesSynced: number;
  errors: string[];
  durationMs: number;
}

export interface NotificationDeliverPayload {
  notificationId: number;
  userId: string;
  workspaceId: string;
  notificationType: string;
  title: string;
  body: string | null;
  linkType: string | null;
  linkId: string | null;
  actorId: string | null;
}

export interface NotificationDeliverResult {
  notificationId: number;
  channels: Array<{
    channel: string;
    status: "delivered" | "skipped" | "failed";
    error?: string;
  }>;
}

/* ---------- Canvas Export ---------- */
export interface CanvasExportPayload {
  exportId: string;
  canvasId: string;
  format: string;
  workspaceId: string;
}

export interface CanvasExportResult {
  exportId: string;
  format: string;
  filePath: string;
  fileSize: number;
  proofId: string;
}
