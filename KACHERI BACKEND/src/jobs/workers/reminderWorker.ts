// KACHERI BACKEND/src/jobs/workers/reminderWorker.ts
// Document Intelligence: Reminder job worker
//
// Handles reminder:extraction jobs - processes due reminders from extraction actions.
// See: Docs/Roadmap/document-intelligence-work-scope.md (Slice 6)
//
// Note: Notification creation is handled in Slice 17.
// This worker marks the action as completed and logs the reminder.

import { Job, ReminderExtractionPayload, ReminderResult } from "../types";
import {
  ExtractionActionsStore,
  type ExtractionAction,
} from "../../store/extractionActions";
import { getDoc } from "../../store/docs";
import { createNotification } from "../../store/notifications";
import { broadcastToUser } from "../../realtime/globalHub";

/* ---------- Reminder Worker ---------- */

/**
 * Process a reminder:extraction job.
 *
 * This worker:
 * 1. Validates the action still exists and is scheduled
 * 2. Marks the action as completed
 * 3. Logs the reminder (notification creation in Slice 17)
 */
export async function reminderExtractionJob(
  job: Job<ReminderExtractionPayload>
): Promise<ReminderResult> {
  const { actionId, docId, fieldPath, message, userId, workspaceId } = job.payload;

  // Get the action
  const action = await ExtractionActionsStore.getById(actionId);
  if (!action) {
    return {
      actionId,
      status: "skipped",
      message: "Action not found (may have been deleted)",
    };
  }

  // Check if action is still scheduled (not already completed or cancelled)
  if (action.status === "completed" || action.status === "cancelled") {
    return {
      actionId,
      status: "skipped",
      message: `Action already ${action.status}`,
    };
  }

  // Verify document still exists
  const doc = await getDoc(docId);
  if (!doc) {
    // Document was deleted, cancel the action
    await ExtractionActionsStore.updateStatus(actionId, "cancelled", Date.now());
    return {
      actionId,
      status: "skipped",
      message: "Document no longer exists",
    };
  }

  // Mark action as completed
  const now = Date.now();
  const updated = await ExtractionActionsStore.updateStatus(actionId, "completed", now);

  if (!updated) {
    return {
      actionId,
      status: "error",
      message: "Failed to update action status",
    };
  }

  // Log the reminder
  console.log(
    `[reminderWorker] Reminder triggered for doc=${docId}, ` +
    `field=${fieldPath || "N/A"}, user=${userId}: ${message}`
  );

  // Create in-app notification (Slice 17)
  if (workspaceId) {
    const notification = await createNotification({
      userId,
      workspaceId,
      type: "reminder",
      title: "Extraction Reminder",
      body: message,
      linkType: "doc",
      linkId: docId,
    });

    if (notification) {
      // Push real-time update via WebSocket
      broadcastToUser(userId, {
        type: "notification",
        notificationId: notification.id,
        userId,
        notificationType: "reminder",
        title: "Extraction Reminder",
        ts: Date.now(),
      });
    } else {
      console.warn(
        `[reminderWorker] Failed to create notification for action=${actionId}`
      );
    }
  } else {
    console.warn(
      `[reminderWorker] No workspaceId for action=${actionId}, skipping notification`
    );
  }

  return {
    actionId,
    status: "completed",
    message: "Reminder processed successfully",
  };
}

/* ---------- Worker Registration ---------- */

/**
 * Register reminder workers with the job queue.
 */
export function registerReminderWorkers(
  registerHandler: (type: string, handler: (job: Job) => Promise<unknown>) => void
): void {
  registerHandler("reminder:extraction", reminderExtractionJob as (job: Job) => Promise<unknown>);
}
