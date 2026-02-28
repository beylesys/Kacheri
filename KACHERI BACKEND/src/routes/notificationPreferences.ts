// KACHERI BACKEND/src/routes/notificationPreferences.ts
// REST endpoints for user notification channel preferences per workspace.
// Slice 11 — Phase 2 Sprint 4, extended by S14 (Cross-Product Notification Bridge)
//
// Endpoints:
// - GET   /workspaces/:wid/notification-preferences  — List user's preferences
// - PUT   /workspaces/:wid/notification-preferences  — Upsert preferences (channel-based)
// - PATCH /workspaces/:wid/notification-preferences  — Toggle cross-product preferences (S14)

import type { FastifyPluginAsync } from 'fastify';
import {
  listPreferences,
  upsertPreferences,
  isValidChannel,
  isValidPreferenceNotificationType,
  type UpsertPreferenceInput,
} from '../store/notificationPreferences';
import { logAuditEvent } from '../store/audit';
import { hasWorkspaceReadAccess, requireWorkspaceMatch } from '../workspace/middleware';

// ============================================
// Types
// ============================================

interface WorkspaceParams {
  wid: string;
}

interface UpdateBody {
  preferences: Array<{
    channel: string;
    notificationType: string;
    enabled: boolean;
    config?: Record<string, unknown> | null;
  }>;
}

// S14 — Cross-product notification preference toggles
interface PatchCrossProductBody {
  crossProductEntityConflict?: boolean;
  crossProductEntityUpdate?: boolean;
  crossProductNewConnection?: boolean;
}

// ============================================
// Helpers
// ============================================

function getUserId(req: { headers: Record<string, unknown>; user?: { id: string } }): string {
  // Prefer authenticated identity from JWT (set by auth middleware)
  if (req.user?.id) return req.user.id;
  // Dev mode fallback
  const devUser = (req.headers['x-dev-user'] as string | undefined)?.toString().trim();
  if (devUser) return devUser;
  return 'user:local';
}

function validateWebhookUrl(url: unknown): string | null {
  if (typeof url !== 'string') return 'Webhook URL must be a string';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return 'Webhook URL must use HTTPS';
  } catch {
    return 'Invalid webhook URL';
  }
  return null;
}

function validateSlackWebhookUrl(url: unknown): string | null {
  if (typeof url !== 'string') return 'Slack webhook URL must be a string';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return 'Slack webhook URL must use HTTPS';
    if (!parsed.hostname.includes('hooks.slack.com')) {
      return 'Slack webhook URL must be from hooks.slack.com';
    }
  } catch {
    return 'Invalid Slack webhook URL';
  }
  return null;
}

function validateEmailAddress(email: unknown): string | null {
  if (typeof email !== 'string') return 'Email address must be a string';
  const trimmed = email.trim();
  if (!trimmed) return 'Email address cannot be empty';
  // Basic email format: user@domain.tld
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return 'Invalid email address format';
  if (trimmed.length > 254) return 'Email address too long (max 254 characters)';
  return null;
}

// ============================================
// Routes
// ============================================

export const notificationPreferenceRoutes: FastifyPluginAsync = async (fastify) => {

  // ----------------------------------------
  // GET /workspaces/:wid/notification-preferences
  // ----------------------------------------
  fastify.get<{ Params: WorkspaceParams }>(
    '/workspaces/:wid/notification-preferences',
    async (request, reply) => {
      const userId = getUserId(request);
      const { wid: workspaceId } = request.params;
      if (!requireWorkspaceMatch(request, reply, workspaceId)) return;

      if (!hasWorkspaceReadAccess(request)) {
        return reply.code(403).send({ error: 'Not a workspace member' });
      }

      const preferences = await listPreferences(userId, workspaceId);
      return reply.send({ preferences });
    }
  );

  // ----------------------------------------
  // PUT /workspaces/:wid/notification-preferences
  // ----------------------------------------
  fastify.put<{ Params: WorkspaceParams; Body: UpdateBody }>(
    '/workspaces/:wid/notification-preferences',
    async (request, reply) => {
      const userId = getUserId(request);
      const { wid: workspaceId } = request.params;
      if (!requireWorkspaceMatch(request, reply, workspaceId)) return;

      if (!hasWorkspaceReadAccess(request)) {
        return reply.code(403).send({ error: 'Not a workspace member' });
      }

      const body = request.body;
      if (!body || !Array.isArray(body.preferences) || body.preferences.length === 0) {
        return reply.code(400).send({ error: 'preferences array is required' });
      }

      if (body.preferences.length > 50) {
        return reply.code(400).send({ error: 'Too many preferences (max 50)' });
      }

      // Validate each preference
      const validInputs: UpsertPreferenceInput[] = [];
      for (const pref of body.preferences) {
        if (!pref.channel || !isValidChannel(pref.channel)) {
          return reply.code(400).send({
            error: `Invalid channel: ${pref.channel}. Must be one of: in_app, webhook, slack, email`,
          });
        }

        if (!pref.notificationType || !isValidPreferenceNotificationType(pref.notificationType)) {
          return reply.code(400).send({
            error: `Invalid notification type: ${pref.notificationType}. Must be one of: mention, comment_reply, doc_shared, suggestion_pending, reminder, all`,
          });
        }

        if (typeof pref.enabled !== 'boolean') {
          return reply.code(400).send({ error: 'enabled must be a boolean' });
        }

        // Validate channel-specific config
        if (pref.channel === 'webhook' && pref.enabled) {
          if (!pref.config || !pref.config.url) {
            return reply.code(400).send({ error: 'Webhook channel requires config.url' });
          }
          const urlError = validateWebhookUrl(pref.config.url);
          if (urlError) {
            return reply.code(400).send({ error: urlError });
          }
        }

        if (pref.channel === 'slack' && pref.enabled) {
          if (!pref.config || !pref.config.webhookUrl) {
            return reply.code(400).send({ error: 'Slack channel requires config.webhookUrl' });
          }
          const slackError = validateSlackWebhookUrl(pref.config.webhookUrl);
          if (slackError) {
            return reply.code(400).send({ error: slackError });
          }
        }

        if (pref.channel === 'email' && pref.enabled) {
          if (!pref.config || !pref.config.email) {
            return reply.code(400).send({ error: 'Email channel requires config.email' });
          }
          const emailError = validateEmailAddress(pref.config.email);
          if (emailError) {
            return reply.code(400).send({ error: emailError });
          }
        }

        validInputs.push({
          channel: pref.channel as UpsertPreferenceInput['channel'],
          notificationType: pref.notificationType as UpsertPreferenceInput['notificationType'],
          enabled: pref.enabled,
          config: pref.config ?? null,
        });
      }

      const { preferences, updated } = await upsertPreferences(userId, workspaceId, validInputs);

      logAuditEvent({
        workspaceId,
        actorId: userId,
        action: 'notification:preference:update',
        targetType: 'notification_preference',
        targetId: userId,
        details: { updated, channels: validInputs.map(i => i.channel) },
      });

      return reply.send({ preferences, updated });
    }
  );

  // ----------------------------------------
  // PATCH /workspaces/:wid/notification-preferences
  // S14 — Convenience endpoint for cross-product notification toggles.
  // Translates flat booleans to in_app channel preferences.
  // ----------------------------------------
  fastify.patch<{ Params: WorkspaceParams; Body: PatchCrossProductBody }>(
    '/workspaces/:wid/notification-preferences',
    async (request, reply) => {
      const userId = getUserId(request);
      const { wid: workspaceId } = request.params;
      if (!requireWorkspaceMatch(request, reply, workspaceId)) return;

      if (!hasWorkspaceReadAccess(request)) {
        return reply.code(403).send({ error: 'Not a workspace member' });
      }

      const body = request.body;
      if (!body || typeof body !== 'object') {
        return reply.code(400).send({ error: 'Request body must be a JSON object' });
      }

      // Translate flat booleans to channel-based UpsertPreferenceInput[]
      const inputs: UpsertPreferenceInput[] = [];

      const mapping: Array<[keyof PatchCrossProductBody, string]> = [
        ['crossProductEntityConflict', 'cross_product:entity_conflict'],
        ['crossProductEntityUpdate', 'cross_product:entity_update'],
        ['crossProductNewConnection', 'cross_product:new_connection'],
      ];

      for (const [key, notificationType] of mapping) {
        if (body[key] !== undefined) {
          if (typeof body[key] !== 'boolean') {
            return reply.code(400).send({ error: `${key} must be a boolean` });
          }
          inputs.push({
            channel: 'in_app',
            notificationType: notificationType as UpsertPreferenceInput['notificationType'],
            enabled: body[key] as boolean,
          });
        }
      }

      if (inputs.length === 0) {
        return reply.code(400).send({
          error: 'At least one preference field required: crossProductEntityConflict, crossProductEntityUpdate, crossProductNewConnection',
        });
      }

      const { preferences, updated } = await upsertPreferences(userId, workspaceId, inputs);

      logAuditEvent({
        workspaceId,
        actorId: userId,
        action: 'notification:preference:update',
        targetType: 'notification_preference',
        targetId: userId,
        details: { updated, source: 'cross_product_patch' },
      });

      return reply.send({ preferences, updated });
    }
  );
};

export default notificationPreferenceRoutes;
