// KACHERI BACKEND/src/store/notificationPreferences.ts
// Notification channel preferences per user per workspace.
// Slice 11 — Phase 2 Sprint 4

import { db } from '../db';
import type { NotificationType } from './notifications';

// ============================================
// Types
// ============================================

export type NotificationChannel = 'in_app' | 'webhook' | 'slack' | 'email';
export type PreferenceNotificationType = NotificationType | 'all';

export interface NotificationPreference {
  id: number;
  userId: string;
  workspaceId: string;
  channel: NotificationChannel;
  notificationType: PreferenceNotificationType;
  enabled: boolean;
  config: Record<string, unknown> | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

interface PreferenceRow {
  id: number;
  user_id: string;
  workspace_id: string;
  channel: string;
  notification_type: string;
  enabled: number;
  config_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface UpsertPreferenceInput {
  channel: NotificationChannel;
  notificationType: PreferenceNotificationType;
  enabled: boolean;
  config?: Record<string, unknown> | null;
}

export interface ActiveChannel {
  channel: NotificationChannel;
  config: Record<string, unknown> | null;
}

// ============================================
// Constants
// ============================================

const VALID_CHANNELS: NotificationChannel[] = ['in_app', 'webhook', 'slack', 'email'];
const VALID_NOTIFICATION_TYPES: PreferenceNotificationType[] = [
  'mention', 'comment_reply', 'doc_shared', 'suggestion_pending', 'reminder',
  'review_assigned',
  'canvas_shared', 'ai_generation_complete', 'export_complete', 'frame_lock_requested',
  // S14 — Cross-Product Notification Bridge
  'cross_product:entity_update', 'cross_product:entity_conflict', 'cross_product:new_connection',
  'all',
];

export function isValidChannel(c: string): c is NotificationChannel {
  return VALID_CHANNELS.includes(c as NotificationChannel);
}

export function isValidPreferenceNotificationType(t: string): t is PreferenceNotificationType {
  return VALID_NOTIFICATION_TYPES.includes(t as PreferenceNotificationType);
}

// ============================================
// Row Conversion
// ============================================

function rowToPreference(row: PreferenceRow): NotificationPreference {
  let config: Record<string, unknown> | null = null;
  if (row.config_json) {
    try {
      config = JSON.parse(row.config_json);
    } catch {
      config = null;
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    channel: row.channel as NotificationChannel,
    notificationType: row.notification_type as PreferenceNotificationType,
    enabled: row.enabled === 1,
    config,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ============================================
// CRUD Operations
// ============================================

/**
 * List all notification preferences for a user in a workspace.
 */
export async function listPreferences(
  userId: string,
  workspaceId: string
): Promise<NotificationPreference[]> {
  try {
    const rows = await db.queryAll<PreferenceRow>(`
      SELECT id, user_id, workspace_id, channel, notification_type,
             enabled, config_json, created_at, updated_at
      FROM notification_preferences
      WHERE user_id = ? AND workspace_id = ?
      ORDER BY channel, notification_type
    `, [userId, workspaceId]);

    return rows.map(rowToPreference);
  } catch (err) {
    console.error('[notificationPreferences] Failed to list preferences:', err);
    return [];
  }
}

/**
 * Upsert notification preferences for a user in a workspace.
 * Uses INSERT OR REPLACE on the UNIQUE(user_id, workspace_id, channel, notification_type) constraint.
 * Returns the full updated preference list and count of rows affected.
 */
export async function upsertPreferences(
  userId: string,
  workspaceId: string,
  inputs: UpsertPreferenceInput[]
): Promise<{ preferences: NotificationPreference[]; updated: number }> {
  const now = Date.now();
  let updated = 0;

  try {
    await db.transaction(async (tx) => {
      for (const input of inputs) {
        const configJson = input.config ? JSON.stringify(input.config) : null;
        const result = await tx.run(`
          INSERT INTO notification_preferences (
            user_id, workspace_id, channel, notification_type,
            enabled, config_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, workspace_id, channel, notification_type)
          DO UPDATE SET
            enabled = excluded.enabled,
            config_json = excluded.config_json,
            updated_at = excluded.updated_at
        `, [
          userId,
          workspaceId,
          input.channel,
          input.notificationType,
          input.enabled ? 1 : 0,
          configJson,
          now,
          now
        ]);
        updated += result.changes ?? 0;
      }
    });

    const preferences = await listPreferences(userId, workspaceId);
    return { preferences, updated };
  } catch (err) {
    console.error('[notificationPreferences] Failed to upsert preferences:', err);
    return { preferences: [], updated: 0 };
  }
}

/**
 * Get active (enabled) channels for a specific notification type.
 * Checks both the specific type and the 'all' fallback.
 * Returns channels with their config for delivery.
 */
export async function getActiveChannels(
  userId: string,
  workspaceId: string,
  notificationType: string
): Promise<ActiveChannel[]> {
  try {
    const rows = await db.queryAll<{ channel: string; config_json: string | null }>(`
      SELECT channel, config_json
      FROM notification_preferences
      WHERE user_id = ? AND workspace_id = ?
        AND (notification_type = ? OR notification_type = 'all')
        AND enabled = 1
      ORDER BY
        CASE WHEN notification_type = ? THEN 0 ELSE 1 END,
        channel
    `, [userId, workspaceId, notificationType, notificationType]);

    // Deduplicate by channel — specific type takes priority over 'all'
    const seen = new Set<string>();
    const result: ActiveChannel[] = [];

    for (const row of rows) {
      if (!seen.has(row.channel)) {
        seen.add(row.channel);
        let config: Record<string, unknown> | null = null;
        if (row.config_json) {
          try {
            config = JSON.parse(row.config_json);
          } catch {
            config = null;
          }
        }
        result.push({
          channel: row.channel as NotificationChannel,
          config,
        });
      }
    }

    return result;
  } catch (err) {
    console.error('[notificationPreferences] Failed to get active channels:', err);
    return [];
  }
}

/**
 * Delete all notification preferences for a workspace.
 * Used when a workspace is deleted.
 */
export async function deleteWorkspacePreferences(workspaceId: string): Promise<number> {
  try {
    const info = await db.run(`
      DELETE FROM notification_preferences
      WHERE workspace_id = ?
    `, [workspaceId]);

    return info.changes ?? 0;
  } catch (err) {
    console.error('[notificationPreferences] Failed to delete workspace preferences:', err);
    return 0;
  }
}
