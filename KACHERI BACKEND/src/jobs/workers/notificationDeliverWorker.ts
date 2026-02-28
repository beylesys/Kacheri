// KACHERI BACKEND/src/jobs/workers/notificationDeliverWorker.ts
// Notification delivery worker — dispatches notifications to external channels.
// Slice 11 + Slice 13 — Phase 2 Sprint 4
//
// Channels supported:
//   - webhook: POST JSON payload to user-configured HTTPS URL
//   - slack: POST Slack Block Kit message to incoming webhook URL
//   - email: SMTP delivery via nodemailer (Slice 13)
//   - in_app: skipped (already delivered synchronously)

import type { Job } from "../types";
import type { NotificationDeliverPayload, NotificationDeliverResult } from "../types";
import { getActiveChannels } from "../../store/notificationPreferences";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/* ---------- Constants ---------- */

const DELIVERY_TIMEOUT_MS = 5000;
const EMAIL_TIMEOUT_MS = 10_000; // SMTP is slower than HTTP

/* ---------- Webhook Delivery ---------- */

async function deliverWebhook(
  payload: NotificationDeliverPayload,
  config: Record<string, unknown>
): Promise<void> {
  const url = config.url as string;
  if (!url) throw new Error("Webhook config missing url");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: payload.notificationType,
        notification: {
          id: payload.notificationId,
          title: payload.title,
          body: payload.body,
          linkType: payload.linkType,
          linkId: payload.linkId,
        },
        workspace: payload.workspaceId,
        actor: payload.actorId,
        timestamp: Date.now(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Slack Delivery ---------- */

async function deliverSlack(
  payload: NotificationDeliverPayload,
  config: Record<string, unknown>
): Promise<void> {
  const webhookUrl = config.webhookUrl as string;
  if (!webhookUrl) throw new Error("Slack config missing webhookUrl");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  // Build Slack Block Kit message
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: payload.title,
        emoji: true,
      },
    },
  ];

  if (payload.body) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: payload.body,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Type: *${payload.notificationType}* | Workspace: ${payload.workspaceId}`,
      },
    ],
  });

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Slack webhook returned ${response.status}: ${text}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ---------- Email SMTP Config ---------- */

const SMTP_HOST = process.env.KACHERI_SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.KACHERI_SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.KACHERI_SMTP_SECURE === "true";
const SMTP_USER = process.env.KACHERI_SMTP_USER || "";
const SMTP_PASS = process.env.KACHERI_SMTP_PASS || "";
const SMTP_FROM = process.env.KACHERI_SMTP_FROM || "noreply@kacheri.local";

// Lazy singleton — created on first email delivery
let smtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  if (!SMTP_HOST) {
    throw new Error("Email delivery not configured — set KACHERI_SMTP_HOST environment variable");
  }

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: EMAIL_TIMEOUT_MS,
      greetingTimeout: EMAIL_TIMEOUT_MS,
      socketTimeout: EMAIL_TIMEOUT_MS,
    });
  }

  return smtpTransport;
}

/* ---------- Email Templates ---------- */

const SUBJECT_MAP: Record<string, string> = {
  mention: "You were mentioned in a document",
  comment_reply: "New reply on your comment",
  doc_shared: "A document was shared with you",
  suggestion_pending: "New suggestion on your document",
  reminder: "Reminder: Action needed",
  review_assigned: "You've been assigned as a reviewer",
  // S14 — Cross-Product Notification Bridge
  'cross_product:entity_update': "An entity you work with was updated in another product",
  'cross_product:entity_conflict': "Cross-product entity conflict detected",
  'cross_product:new_connection': "New cross-product entity connection discovered",
};

function getEmailSubject(payload: NotificationDeliverPayload): string {
  return `[Kacheri] ${SUBJECT_MAP[payload.notificationType] || payload.title}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getEmailHtml(payload: NotificationDeliverPayload): string {
  const title = escapeHtml(payload.title);
  const body = payload.body ? escapeHtml(payload.body) : "";
  const typeLabel = SUBJECT_MAP[payload.notificationType] || payload.notificationType;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#1e293b;padding:16px 24px;">
            <span style="color:#ffffff;font-size:16px;font-weight:600;letter-spacing:0.5px;">Kacheri</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 8px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(typeLabel)}</p>
            <h2 style="margin:0 0 16px;font-size:18px;color:#111827;font-weight:600;">${title}</h2>
            ${body ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">${body}</p>` : ""}
            ${payload.linkId ? `<a href="#" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View in Kacheri</a>` : ""}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Workspace: ${escapeHtml(payload.workspaceId)} &middot;
              To change your email notification preferences, visit your workspace settings.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* ---------- Email Delivery ---------- */

async function deliverEmail(
  payload: NotificationDeliverPayload,
  config: Record<string, unknown>
): Promise<void> {
  const toEmail = config.email as string;
  if (!toEmail) throw new Error("Email config missing email address");

  const transport = getSmtpTransport();

  await transport.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: getEmailSubject(payload),
    html: getEmailHtml(payload),
  });
}

/* ---------- Main Worker ---------- */

export async function notificationDeliverJob(
  job: Job<NotificationDeliverPayload>
): Promise<NotificationDeliverResult> {
  const payload = job.payload;
  const { notificationId, userId, workspaceId, notificationType } = payload;

  // Get enabled channels for this user + workspace + notification type
  const activeChannels = await getActiveChannels(userId, workspaceId, notificationType);

  if (activeChannels.length === 0) {
    return {
      notificationId,
      channels: [{ channel: "none", status: "skipped", error: "No active channels configured" }],
    };
  }

  const results: NotificationDeliverResult["channels"] = [];

  for (const { channel, config } of activeChannels) {
    // Skip in_app — already delivered synchronously
    if (channel === "in_app") {
      results.push({ channel, status: "skipped" });
      continue;
    }

    if (!config) {
      results.push({ channel, status: "skipped", error: "No config for channel" });
      continue;
    }

    try {
      if (channel === "webhook") {
        await deliverWebhook(payload, config);
        results.push({ channel, status: "delivered" });
      } else if (channel === "slack") {
        await deliverSlack(payload, config);
        results.push({ channel, status: "delivered" });
      } else if (channel === "email") {
        await deliverEmail(payload, config);
        results.push({ channel, status: "delivered" });
      } else {
        results.push({ channel, status: "skipped", error: `Unknown channel: ${channel}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[notificationDeliver] Failed to deliver via ${channel}:`, message);
      results.push({ channel, status: "failed", error: message });
    }
  }

  console.log(
    `[notificationDeliver] Notification ${notificationId} delivered: ` +
    results.map(r => `${r.channel}=${r.status}`).join(", ")
  );

  return { notificationId, channels: results };
}

/* ---------- Worker Registration ---------- */

export function registerNotificationDeliverWorkers(
  registerHandler: (type: string, handler: (job: Job) => Promise<unknown>) => void
): void {
  registerHandler(
    "notification:deliver",
    notificationDeliverJob as (job: Job) => Promise<unknown>
  );
}
