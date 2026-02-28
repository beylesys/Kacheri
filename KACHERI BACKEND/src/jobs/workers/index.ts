// KACHERI BACKEND/src/jobs/workers/index.ts
// P4.3: Job worker registration
//
// Registers all job workers with the job queue.

import { getJobQueue } from "../queue";
import { registerVerifyWorkers } from "./verify";
import { registerReminderWorkers } from "./reminderWorker";
import { registerKnowledgeWorkers } from "./knowledgeIndexWorker";
import { registerNotificationDeliverWorkers } from "./notificationDeliverWorker";
import { registerCanvasExportWorkers } from "./canvasExportWorker";

/* ---------- Register All Workers ---------- */
export function registerAllWorkers(): void {
  const queue = getJobQueue();

  // Verify workers
  registerVerifyWorkers((type, handler) => {
    queue.registerHandler(type as any, handler);
  });

  // Reminder workers (extraction actions)
  registerReminderWorkers((type, handler) => {
    queue.registerHandler(type as any, handler);
  });

  // Knowledge index workers (cross-document intelligence)
  registerKnowledgeWorkers((type, handler) => {
    queue.registerHandler(type as any, handler);
  });

  // Notification delivery workers (webhook, Slack)
  registerNotificationDeliverWorkers((type, handler) => {
    queue.registerHandler(type as any, handler);
  });

  // Canvas export workers (D2: HTML/PNG/SVG, D3: PDF, D4: PPTX, D8: MP4)
  registerCanvasExportWorkers((type, handler) => {
    queue.registerHandler(type as any, handler);
  });

  console.log("Job workers registered: verify:export, verify:compose, reminder:extraction, knowledge:index, notification:deliver, canvas:export");
}

/* ---------- Export individual workers ---------- */
export { verifyExportJob, verifyComposeJob } from "./verify";
export { reminderExtractionJob } from "./reminderWorker";
export { knowledgeIndexJob } from "./knowledgeIndexWorker";
export { notificationDeliverJob } from "./notificationDeliverWorker";
export { canvasExportJob } from "./canvasExportWorker";
