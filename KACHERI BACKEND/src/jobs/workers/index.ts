// KACHERI BACKEND/src/jobs/workers/index.ts
// P4.3: Job worker registration
//
// Registers all job workers with the job queue.

import { getJobQueue } from "../queue";
import { registerVerifyWorkers } from "./verify";

/* ---------- Register All Workers ---------- */
export function registerAllWorkers(): void {
  const queue = getJobQueue();

  // Verify workers
  registerVerifyWorkers((type, handler) => {
    queue.registerHandler(type as any, handler);
  });

  console.log("Job workers registered: verify:export, verify:compose");
}

/* ---------- Export individual workers ---------- */
export { verifyExportJob, verifyComposeJob } from "./verify";
