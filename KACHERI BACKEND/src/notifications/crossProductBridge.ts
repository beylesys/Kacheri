// KACHERI BACKEND/src/notifications/crossProductBridge.ts
// Cross-Product Notification Bridge — Slice S14
//
// When an entity is ingested into the Memory Graph from one product,
// notifies users who interacted with that entity in OTHER products.
//
// See: Docs/Roadmap/beyle-platform-shell-work-scope.md — Phase D, Slice S14

import { db } from '../db';
import { createAndDeliverNotification, type NotificationType } from '../store/notifications';
import { listPreferences } from '../store/notificationPreferences';
import { broadcastToUser } from '../realtime/globalHub';

/* ========== Types ========== */

export type CrossProductNotificationType =
  | 'cross_product:entity_update'
  | 'cross_product:entity_conflict'
  | 'cross_product:new_connection';

/** A user affected by a cross-product entity event */
interface AffectedUser {
  userId: string;
  productSource: string;
  entityName: string;
}

export interface CrossProductNotifyResult {
  notificationsSent: number;
  rateLimited: number;
  preferencesBlocked: number;
}

/* ========== Rate Limiter ========== */

/**
 * In-memory sliding-window rate limiter.
 * Max 10 notifications per entity per hour.
 * Matches the in-memory Map pattern used in globalHub.ts.
 */
const entityNotificationTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 3_600_000; // 1 hour
const RATE_LIMIT_MAX = 10;

function isRateLimited(entityId: string): boolean {
  const now = Date.now();
  const timestamps = entityNotificationTimestamps.get(entityId);
  if (!timestamps) return false;

  // Prune expired entries
  const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  entityNotificationTimestamps.set(entityId, valid);

  return valid.length >= RATE_LIMIT_MAX;
}

function recordNotificationTimestamp(entityId: string): void {
  const now = Date.now();
  const timestamps = entityNotificationTimestamps.get(entityId) ?? [];
  timestamps.push(now);
  entityNotificationTimestamps.set(entityId, timestamps);
}

// Periodic cleanup to prevent memory growth for inactive entities.
// Runs every 10 minutes, removes entries with no timestamps in the window.
const CLEANUP_INTERVAL_MS = 10 * 60_000;
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [entityId, timestamps] of entityNotificationTimestamps) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      entityNotificationTimestamps.delete(entityId);
    } else {
      entityNotificationTimestamps.set(entityId, valid);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupInterval.unref(); // Don't prevent process exit

/* ========== Default Preferences ========== */

/**
 * Defaults when user has no explicit preference for a cross-product type.
 * entity_update and entity_conflict are ON by default (most useful).
 * new_connection is OFF by default (can be noisy for large graphs).
 */
const CROSS_PRODUCT_DEFAULTS: Record<CrossProductNotificationType, boolean> = {
  'cross_product:entity_update': true,
  'cross_product:entity_conflict': true,
  'cross_product:new_connection': false,
};

/**
 * Check whether a specific cross-product notification type is enabled
 * for a user. Checks explicit in_app preference first, falls back to defaults.
 */
async function isCrossProductNotificationEnabled(
  userId: string,
  workspaceId: string,
  type: CrossProductNotificationType,
): Promise<boolean> {
  const prefs = await listPreferences(userId, workspaceId);
  const explicitPref = prefs.find(
    p => p.notificationType === type && p.channel === 'in_app',
  );

  if (explicitPref) return explicitPref.enabled;
  return CROSS_PRODUCT_DEFAULTS[type] ?? true;
}

/* ========== Product Source Labels ========== */

const PRODUCT_SOURCE_LABELS: Record<string, string> = {
  'docs': 'Docs',
  'design-studio': 'Design Studio',
  'research': 'Research',
  'notes': 'Notes',
  'sheets': 'Sheets',
};

/* ========== User Discovery ========== */

/**
 * Find users who have interacted with an entity in products OTHER than
 * the ingesting product source.
 *
 * Uses a UNION query across three join paths:
 * - docs: entity_mentions.doc_id → docs.created_by
 * - design-studio: entity_mentions.source_ref → canvases.created_by
 * - research: entity_mentions.source_ref → jaal_sessions.user_id
 *
 * Returns deduplicated list of affected users with their product sources.
 */
async function findAffectedUsers(
  workspaceId: string,
  entityId: string,
  excludeProductSource: string,
): Promise<AffectedUser[]> {
  try {
    const rows = await db.queryAll<{ user_id: string; product_source: string; entity_name: string }>(
      `SELECT user_id, product_source, entity_name FROM (
        -- Docs mentions: entity_mentions → docs → docs.created_by
        SELECT DISTINCT d.created_by AS user_id, em.product_source, we.name AS entity_name
        FROM entity_mentions em
        JOIN docs d ON d.id = em.doc_id AND d.deleted_at IS NULL
        JOIN workspace_entities we ON we.id = em.entity_id
        WHERE em.entity_id = ? AND em.workspace_id = ?
          AND em.product_source = 'docs'
          AND em.product_source != ?
          AND d.created_by IS NOT NULL

        UNION

        -- Design Studio mentions: entity_mentions → canvases → canvases.created_by
        SELECT DISTINCT c.created_by AS user_id, em.product_source, we.name AS entity_name
        FROM entity_mentions em
        JOIN canvases c ON c.id = em.source_ref AND c.deleted_at IS NULL
        JOIN workspace_entities we ON we.id = em.entity_id
        WHERE em.entity_id = ? AND em.workspace_id = ?
          AND em.product_source = 'design-studio'
          AND em.product_source != ?
          AND c.created_by IS NOT NULL

        UNION

        -- Research mentions: entity_mentions → jaal_sessions → jaal_sessions.user_id
        SELECT DISTINCT js.user_id, em.product_source, we.name AS entity_name
        FROM entity_mentions em
        JOIN jaal_sessions js ON js.id = em.source_ref
        JOIN workspace_entities we ON we.id = em.entity_id
        WHERE em.entity_id = ? AND em.workspace_id = ?
          AND em.product_source = 'research'
          AND em.product_source != ?
          AND js.user_id IS NOT NULL
      )
      GROUP BY user_id, product_source
      LIMIT 100`,
      [
        // docs params
        entityId, workspaceId, excludeProductSource,
        // design-studio params
        entityId, workspaceId, excludeProductSource,
        // research params
        entityId, workspaceId, excludeProductSource,
      ]
    );

    return rows.map(r => ({
      userId: r.user_id,
      productSource: r.product_source,
      entityName: r.entity_name,
    }));
  } catch (err) {
    console.error('[crossProductBridge] Failed to find affected users:', err);
    return [];
  }
}

/* ========== Notification Classification ========== */

/**
 * Classify the cross-product notification type:
 * - entity_update: entity mentioned by exactly 2 product sources (ingesting + 1 other)
 * - entity_conflict: entity mentioned by 3+ product sources (ingesting + 2+ others)
 */
function classifyNotificationType(
  affectedUsers: AffectedUser[],
): CrossProductNotificationType {
  const distinctProducts = new Set(affectedUsers.map(u => u.productSource));
  return distinctProducts.size >= 2
    ? 'cross_product:entity_conflict'
    : 'cross_product:entity_update';
}

/* ========== Main Entry Points ========== */

/**
 * Called after an entity is REUSED during Memory Graph ingest.
 * Checks for cross-product mentions and notifies affected users.
 *
 * Non-blocking: all errors are caught and logged. Never fails the ingest.
 */
export async function notifyOnEntityIngest(
  workspaceId: string,
  entityId: string,
  entityName: string,
  ingestProductSource: string,
  ingestActorId?: string,
): Promise<CrossProductNotifyResult> {
  const result: CrossProductNotifyResult = {
    notificationsSent: 0,
    rateLimited: 0,
    preferencesBlocked: 0,
  };

  // Early exit if already at rate limit before expensive SQL query
  if (isRateLimited(entityId)) {
    result.rateLimited++;
    return result;
  }

  // Find users from other products
  const affectedUsers = await findAffectedUsers(workspaceId, entityId, ingestProductSource);
  if (affectedUsers.length === 0) return result;

  // Classify notification type
  const notificationType = classifyNotificationType(affectedUsers);
  const sourceLabel = PRODUCT_SOURCE_LABELS[ingestProductSource] || ingestProductSource;

  // Deduplicate by userId and send notifications
  const notifiedUsers = new Set<string>();

  for (const user of affectedUsers) {
    if (notifiedUsers.has(user.userId)) continue;
    notifiedUsers.add(user.userId);

    // Self-notification avoidance: don't notify the user who triggered the ingest
    if (ingestActorId && user.userId === ingestActorId) continue;

    // Per-notification rate limit: re-check before each send to enforce cap accurately
    if (isRateLimited(entityId)) {
      result.rateLimited++;
      continue;
    }

    // Check user preference
    if (!await isCrossProductNotificationEnabled(user.userId, workspaceId, notificationType)) {
      result.preferencesBlocked++;
      continue;
    }

    const userProductLabel = PRODUCT_SOURCE_LABELS[user.productSource] || user.productSource;
    const title = `"${entityName}" was referenced in ${sourceLabel}`;
    const body = `Entity also appears in your ${userProductLabel}`;

    // Create notification + enqueue external delivery
    const notification = await createAndDeliverNotification({
      userId: user.userId,
      workspaceId,
      type: notificationType as NotificationType,
      title,
      body,
      linkType: 'entity',
      linkId: entityId,
      actorId: null,
    });

    if (notification) {
      result.notificationsSent++;
      recordNotificationTimestamp(entityId);

      // WebSocket push for real-time notification bell update
      broadcastToUser(user.userId, {
        type: 'notification',
        notificationId: notification.id,
        userId: user.userId,
        notificationType,
        title,
        ts: Date.now(),
      });
    }
  }

  return result;
}

/**
 * Called after a new entity relationship is created during ingest.
 * Checks if the connected entities have mentions from different product sources
 * and notifies affected users about the new cross-product connection.
 */
export async function notifyOnCrossProductRelationship(
  workspaceId: string,
  fromEntityId: string,
  fromEntityName: string,
  toEntityId: string,
  toEntityName: string,
  ingestProductSource: string,
  ingestActorId?: string,
): Promise<CrossProductNotifyResult> {
  const result: CrossProductNotifyResult = {
    notificationsSent: 0,
    rateLimited: 0,
    preferencesBlocked: 0,
  };

  // Early exit if both entities are already at rate limit before expensive SQL queries
  if (isRateLimited(fromEntityId) && isRateLimited(toEntityId)) {
    result.rateLimited++;
    return result;
  }

  // Find users from other products for both entities
  const fromUsers = await findAffectedUsers(workspaceId, fromEntityId, ingestProductSource);
  const toUsers = await findAffectedUsers(workspaceId, toEntityId, ingestProductSource);

  // If neither entity has cross-product mentions, no notification needed
  if (fromUsers.length === 0 && toUsers.length === 0) return result;

  const sourceLabel = PRODUCT_SOURCE_LABELS[ingestProductSource] || ingestProductSource;
  const title = `New connection: "${fromEntityName}" \u2194 "${toEntityName}"`;
  const body = `Connected via ${sourceLabel}`;

  // Merge and deduplicate users from both entities
  const allUsers = [...fromUsers, ...toUsers];
  const notifiedUsers = new Set<string>();

  for (const user of allUsers) {
    if (notifiedUsers.has(user.userId)) continue;
    notifiedUsers.add(user.userId);

    // Self-notification avoidance
    if (ingestActorId && user.userId === ingestActorId) continue;

    // Per-notification rate limit: check both entities before each send
    if (isRateLimited(fromEntityId) && isRateLimited(toEntityId)) {
      result.rateLimited++;
      continue;
    }

    // Check user preference (new_connection defaults to OFF)
    if (!await isCrossProductNotificationEnabled(user.userId, workspaceId, 'cross_product:new_connection')) {
      result.preferencesBlocked++;
      continue;
    }

    const notification = await createAndDeliverNotification({
      userId: user.userId,
      workspaceId,
      type: 'cross_product:new_connection' as NotificationType,
      title,
      body,
      linkType: 'entity',
      linkId: fromEntityId,
      actorId: null,
    });

    if (notification) {
      result.notificationsSent++;
      // Record timestamps on both entities to rate-limit from either side
      recordNotificationTimestamp(fromEntityId);
      recordNotificationTimestamp(toEntityId);

      broadcastToUser(user.userId, {
        type: 'notification',
        notificationId: notification.id,
        userId: user.userId,
        notificationType: 'cross_product:new_connection' as NotificationType,
        title,
        ts: Date.now(),
      });
    }
  }

  return result;
}

/* ========== PATCH Endpoint Helpers ========== */

/** Map from PATCH body keys to notification types */
export const CROSS_PRODUCT_PREF_KEY_MAP: Record<string, CrossProductNotificationType> = {
  crossProductEntityConflict: 'cross_product:entity_conflict',
  crossProductEntityUpdate: 'cross_product:entity_update',
  crossProductNewConnection: 'cross_product:new_connection',
};
