// src/components/workspace/WorkspaceSettingsModal.tsx
// Modal for workspace settings: General, Members, Invites, Notifications, AI, Danger Zone

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { workspaceApi } from '../../workspace/api';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../../workspace/types';
import { MemberRow } from './MemberRow';
import { InviteSection } from './InviteSection';
import {
  notificationPreferencesApi,
  type NotificationPreference,
  type NotificationChannel,
  type PreferenceNotificationType,
  type UpsertPreferenceInput,
} from '../../api/notificationPreferences';
import { canvasApi } from '../../api/canvas';
import {
  workspaceAiSettingsApi,
  type WorkspaceAiSettings,
  type ProviderCatalogItem,
} from '../../api/workspaceAiSettings';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './workspaceSettings.css';

type Tab = 'general' | 'members' | 'invites' | 'notifications' | 'embeds' | 'ai' | 'danger';

export interface WorkspaceSettingsModalProps {
  open: boolean;
  workspace: Workspace;
  currentUserId: string;
  onClose: () => void;
  onWorkspaceUpdated: (updated: Workspace) => void;
  onWorkspaceDeleted: () => void;
}

export function WorkspaceSettingsModal({
  open,
  workspace,
  currentUserId,
  onClose,
  onWorkspaceUpdated,
  onWorkspaceDeleted,
}: WorkspaceSettingsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [activeTab, setActiveTab] = useState<Tab>('general');

  // General tab state
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? '');
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalSuccess, setGeneralSuccess] = useState(false);

  // Members tab state
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Danger zone state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Notifications tab state
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreference[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifSuccess, setNotifSuccess] = useState(false);
  // Draft state for edits before saving
  const [notifDraft, setNotifDraft] = useState<UpsertPreferenceInput[]>([]);

  // Embed whitelist tab state (E7)
  const [embedDefaults, setEmbedDefaults] = useState<string[]>([]);
  const [embedCustom, setEmbedCustom] = useState<string[]>([]);
  const [embedNewDomain, setEmbedNewDomain] = useState('');
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedSaving, setEmbedSaving] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [embedSuccess, setEmbedSuccess] = useState(false);

  // AI settings tab state
  const [aiSettings, setAiSettings] = useState<WorkspaceAiSettings | null>(null);
  const [aiProvider, setAiProvider] = useState<string>('');
  const [aiModel, setAiModel] = useState<string>('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState(false);

  // Derive permissions
  const userRole = workspace.role;
  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin' || isOwner;

  // Reset state when modal opens/closes or workspace changes
  useEffect(() => {
    if (open) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
      setGeneralError(null);
      setGeneralSuccess(false);
      setDeleteConfirm('');
      setDeleteError(null);
      setActiveTab('general');
    }
  }, [open, workspace]);

  // Load members when members tab is active
  useEffect(() => {
    if (open && activeTab === 'members') {
      loadMembers();
    }
  }, [open, activeTab, workspace.id]);

  // Load notification preferences when notifications tab is active
  useEffect(() => {
    if (open && activeTab === 'notifications') {
      loadNotifPrefs();
    }
  }, [open, activeTab, workspace.id]);

  // Load embed whitelist when embeds tab is active (E7)
  useEffect(() => {
    if (open && activeTab === 'embeds') {
      loadEmbedWhitelist();
    }
  }, [open, activeTab, workspace.id]);

  // Load AI settings when AI tab is active
  useEffect(() => {
    if (open && activeTab === 'ai') {
      loadAiSettings();
    }
  }, [open, activeTab, workspace.id]);

  async function loadMembers() {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const list = await workspaceApi.listMembers(workspace.id);
      setMembers(list);
    } catch (err: any) {
      setMembersError(err.message || 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  }

  // Notification preference constants
  const CHANNELS: NotificationChannel[] = ['in_app', 'webhook', 'slack', 'email'];
  const NOTIF_TYPES: PreferenceNotificationType[] = [
    'mention', 'comment_reply', 'doc_shared', 'suggestion_pending', 'reminder',
  ];
  const CHANNEL_LABELS: Record<NotificationChannel, string> = {
    in_app: 'In-App',
    webhook: 'Webhook',
    slack: 'Slack',
    email: 'Email',
  };
  const TYPE_LABELS: Record<PreferenceNotificationType, string> = {
    mention: 'Mentions',
    comment_reply: 'Comment Replies',
    doc_shared: 'Document Shared',
    suggestion_pending: 'Suggestions',
    reminder: 'Reminders',
    all: 'All Types',
  };

  async function loadNotifPrefs() {
    setNotifLoading(true);
    setNotifError(null);
    try {
      const res = await notificationPreferencesApi.list(workspace.id);
      setNotifPrefs(res.preferences);
      // Initialize draft from existing preferences
      setNotifDraft(res.preferences.map(p => ({
        channel: p.channel,
        notificationType: p.notificationType,
        enabled: p.enabled,
        config: p.config,
      })));
    } catch (err: any) {
      setNotifError(err.message || 'Failed to load notification preferences');
    } finally {
      setNotifLoading(false);
    }
  }

  function getDraftPref(channel: NotificationChannel, notifType: PreferenceNotificationType) {
    return notifDraft.find(d => d.channel === channel && d.notificationType === notifType);
  }

  function isChannelEnabled(channel: NotificationChannel): boolean {
    const allPref = getDraftPref(channel, 'all');
    if (allPref) return allPref.enabled;
    // If no 'all' pref, check if any specific type is enabled
    return notifDraft.some(d => d.channel === channel && d.enabled);
  }

  function isTypeEnabled(channel: NotificationChannel, notifType: PreferenceNotificationType): boolean {
    const pref = getDraftPref(channel, notifType);
    if (pref) return pref.enabled;
    // Fallback: check 'all' pref for this channel
    const allPref = getDraftPref(channel, 'all');
    return allPref?.enabled ?? false;
  }

  function getChannelConfig(channel: NotificationChannel): Record<string, unknown> | null {
    // Get config from any pref for this channel (they share the same config)
    const pref = notifDraft.find(d => d.channel === channel && d.config);
    return pref?.config ?? null;
  }

  function toggleChannelAll(channel: NotificationChannel, enabled: boolean) {
    setNotifDraft(prev => {
      const filtered = prev.filter(d => d.channel !== channel);
      const config = getChannelConfig(channel);
      return [
        ...filtered,
        { channel, notificationType: 'all' as PreferenceNotificationType, enabled, config },
      ];
    });
  }

  function toggleType(channel: NotificationChannel, notifType: PreferenceNotificationType, enabled: boolean) {
    setNotifDraft(prev => {
      const existing = prev.findIndex(d => d.channel === channel && d.notificationType === notifType);
      const config = getChannelConfig(channel);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], enabled };
        return updated;
      }
      return [...prev, { channel, notificationType: notifType, enabled, config }];
    });
  }

  function updateChannelConfig(channel: NotificationChannel, configKey: string, value: string) {
    setNotifDraft(prev => {
      return prev.map(d => {
        if (d.channel === channel) {
          const existing = d.config ?? {};
          return { ...d, config: { ...existing, [configKey]: value } };
        }
        return d;
      });
    });
  }

  async function handleSaveNotifPrefs() {
    if (notifDraft.length === 0) return;

    setNotifSaving(true);
    setNotifError(null);
    setNotifSuccess(false);

    try {
      const res = await notificationPreferencesApi.update(workspace.id, notifDraft);
      setNotifPrefs(res.preferences);
      setNotifDraft(res.preferences.map(p => ({
        channel: p.channel,
        notificationType: p.notificationType,
        enabled: p.enabled,
        config: p.config,
      })));
      setNotifSuccess(true);
      setTimeout(() => setNotifSuccess(false), 2000);
    } catch (err: any) {
      setNotifError(err.message || 'Failed to save notification preferences');
    } finally {
      setNotifSaving(false);
    }
  }

  // ── Embed whitelist handlers (E7) ──

  async function loadEmbedWhitelist() {
    setEmbedLoading(true);
    setEmbedError(null);
    try {
      const res = await canvasApi.getEmbedWhitelist(workspace.id);
      setEmbedDefaults(res.defaults);
      setEmbedCustom(res.custom);
    } catch (err: any) {
      setEmbedError(err.message || 'Failed to load embed whitelist');
    } finally {
      setEmbedLoading(false);
    }
  }

  async function handleSaveEmbedWhitelist() {
    setEmbedSaving(true);
    setEmbedError(null);
    setEmbedSuccess(false);
    try {
      const res = await canvasApi.updateEmbedWhitelist(workspace.id, embedCustom);
      setEmbedDefaults(res.defaults);
      setEmbedCustom(res.custom);
      setEmbedSuccess(true);
      setTimeout(() => setEmbedSuccess(false), 2000);
    } catch (err: any) {
      setEmbedError(err.message || 'Failed to save embed whitelist');
    } finally {
      setEmbedSaving(false);
    }
  }

  function handleAddEmbedDomain() {
    const domain = embedNewDomain.trim().toLowerCase();
    if (!domain) return;
    // Basic hostname validation — no protocol, no path, no port
    if (domain.includes('/') || domain.includes(':') || !domain.includes('.')) {
      setEmbedError('Enter a valid domain (e.g. example.com), not a full URL');
      return;
    }
    if (embedDefaults.includes(domain) || embedCustom.includes(domain)) {
      setEmbedError(`"${domain}" is already in the whitelist`);
      return;
    }
    setEmbedError(null);
    setEmbedCustom(prev => [...prev, domain]);
    setEmbedNewDomain('');
  }

  function handleRemoveEmbedDomain(domain: string) {
    setEmbedCustom(prev => prev.filter(d => d !== domain));
    setEmbedError(null);
  }

  // ── AI settings handlers ──

  async function loadAiSettings() {
    setAiLoading(true);
    setAiError(null);
    try {
      const settings = await workspaceAiSettingsApi.get(workspace.id);
      setAiSettings(settings);
      setAiProvider(settings.provider ?? '');
      setAiModel(settings.model ?? '');
      setAiApiKey('');
    } catch (err: any) {
      setAiError(err.message || 'Failed to load AI settings');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveAiSettings() {
    setAiSaving(true);
    setAiError(null);
    setAiSuccess(false);
    try {
      const input: Record<string, string | null> = {};
      input.provider = aiProvider || null;
      input.model = aiModel || null;
      if (aiApiKey) input.apiKey = aiApiKey;
      const updated = await workspaceAiSettingsApi.update(workspace.id, input);
      setAiSettings(updated);
      setAiProvider(updated.provider ?? '');
      setAiModel(updated.model ?? '');
      setAiApiKey('');
      setAiSuccess(true);
      setTimeout(() => setAiSuccess(false), 2000);
    } catch (err: any) {
      setAiError(err.message || 'Failed to save AI settings');
    } finally {
      setAiSaving(false);
    }
  }

  async function handleResetAiSettings() {
    setAiSaving(true);
    setAiError(null);
    setAiSuccess(false);
    try {
      await workspaceAiSettingsApi.remove(workspace.id);
      setAiProvider('');
      setAiModel('');
      setAiApiKey('');
      setAiSettings(prev => prev ? { ...prev, provider: null, model: null, hasApiKey: false } : prev);
      setAiSuccess(true);
      setTimeout(() => setAiSuccess(false), 2000);
    } catch (err: any) {
      setAiError(err.message || 'Failed to reset AI settings');
    } finally {
      setAiSaving(false);
    }
  }

  // Derive model list from selected provider
  const aiProviderCatalog: ProviderCatalogItem | undefined =
    aiSettings?.availableProviders.find(p => p.provider === (aiProvider || aiSettings?.serverDefaults.provider));
  const aiModelOptions: string[] = aiProviderCatalog?.models ?? [];

  async function handleSaveGeneral() {
    if (!isAdmin) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setGeneralError('Workspace name cannot be empty');
      return;
    }

    setGeneralLoading(true);
    setGeneralError(null);
    setGeneralSuccess(false);

    try {
      const updated = await workspaceApi.update(workspace.id, {
        name: trimmedName,
        description: description.trim() || undefined,
      });
      onWorkspaceUpdated(updated);
      setGeneralSuccess(true);
      setTimeout(() => setGeneralSuccess(false), 2000);
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to update workspace');
    } finally {
      setGeneralLoading(false);
    }
  }

  async function handleUpdateMemberRole(userId: string, newRole: WorkspaceRole) {
    if (!isAdmin) return;
    // Only owner can assign admin role
    if (newRole === 'admin' && !isOwner) {
      setMembersError('Only the owner can assign admin role');
      return;
    }

    setPendingAction(`role-${userId}`);
    setMembersError(null);

    try {
      await workspaceApi.updateMemberRole(workspace.id, userId, newRole);
      await loadMembers();
    } catch (err: any) {
      setMembersError(err.message || 'Failed to update member role');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!isAdmin) return;

    setPendingAction(`remove-${userId}`);
    setMembersError(null);

    try {
      await workspaceApi.removeMember(workspace.id, userId);
      await loadMembers();
    } catch (err: any) {
      setMembersError(err.message || 'Failed to remove member');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeleteWorkspace() {
    if (!isOwner) return;
    if (deleteConfirm !== workspace.name) {
      setDeleteError('Please type the workspace name to confirm');
      return;
    }

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      await workspaceApi.delete(workspace.id);
      onWorkspaceDeleted();
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete workspace');
    } finally {
      setDeleteLoading(false);
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  // Truncate workspace name for display
  const displayName = workspace.name.length > 25
    ? workspace.name.substring(0, 25) + '...'
    : workspace.name;

  return (
    <div
      ref={dialogRef}
      className="ws-settings-backdrop"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ws-settings-title"
    >
      <div
        className="ws-settings-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="ws-settings-header">
          <h2 id="ws-settings-title" className="ws-settings-title">
            Settings: {displayName}
          </h2>
          <button
            className="ws-settings-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Tab navigation */}
        <nav className="ws-settings-tabs" role="tablist" aria-label="Settings" onKeyDown={(e) => {
          const tabs: Tab[] = ['general', 'members', ...(isAdmin ? ['invites' as Tab] : []), 'notifications', ...(isAdmin ? ['embeds' as Tab, 'ai' as Tab] : []), ...(isOwner ? ['danger' as Tab] : [])];
          const idx = tabs.indexOf(activeTab);
          if (e.key === 'ArrowRight') { e.preventDefault(); setActiveTab(tabs[(idx + 1) % tabs.length]); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]); }
        }}>
          <button
            role="tab"
            aria-selected={activeTab === 'general'}
            aria-controls="ws-settings-panel-general"
            id="ws-settings-tab-general"
            tabIndex={activeTab === 'general' ? 0 : -1}
            className={`ws-settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'members'}
            aria-controls="ws-settings-panel-members"
            id="ws-settings-tab-members"
            tabIndex={activeTab === 'members' ? 0 : -1}
            className={`ws-settings-tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Members
          </button>
          {isAdmin && (
            <button
              role="tab"
              aria-selected={activeTab === 'invites'}
              aria-controls="ws-settings-panel-invites"
              id="ws-settings-tab-invites"
              tabIndex={activeTab === 'invites' ? 0 : -1}
              className={`ws-settings-tab ${activeTab === 'invites' ? 'active' : ''}`}
              onClick={() => setActiveTab('invites')}
            >
              Invites
            </button>
          )}
          <button
            role="tab"
            aria-selected={activeTab === 'notifications'}
            aria-controls="ws-settings-panel-notifications"
            id="ws-settings-tab-notifications"
            tabIndex={activeTab === 'notifications' ? 0 : -1}
            className={`ws-settings-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications
          </button>
          {isAdmin && (
            <button
              role="tab"
              aria-selected={activeTab === 'embeds'}
              aria-controls="ws-settings-panel-embeds"
              id="ws-settings-tab-embeds"
              tabIndex={activeTab === 'embeds' ? 0 : -1}
              className={`ws-settings-tab ${activeTab === 'embeds' ? 'active' : ''}`}
              onClick={() => setActiveTab('embeds')}
            >
              Embeds
            </button>
          )}
          {isAdmin && (
            <button
              role="tab"
              aria-selected={activeTab === 'ai'}
              aria-controls="ws-settings-panel-ai"
              id="ws-settings-tab-ai"
              tabIndex={activeTab === 'ai' ? 0 : -1}
              className={`ws-settings-tab ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              AI
            </button>
          )}
          {isOwner && (
            <button
              role="tab"
              aria-selected={activeTab === 'danger'}
              aria-controls="ws-settings-panel-danger"
              id="ws-settings-tab-danger"
              tabIndex={activeTab === 'danger' ? 0 : -1}
              className={`ws-settings-tab ws-settings-tab-danger ${activeTab === 'danger' ? 'active' : ''}`}
              onClick={() => setActiveTab('danger')}
            >
              Danger Zone
            </button>
          )}
        </nav>

        {/* Tab content */}
        <div className="ws-settings-content" role="tabpanel" id={`ws-settings-panel-${activeTab}`} aria-labelledby={`ws-settings-tab-${activeTab}`}>
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="ws-settings-general">
              <div className="ws-settings-field">
                <label className="ws-settings-label" htmlFor="ws-name">
                  Workspace Name
                </label>
                <input
                  id="ws-name"
                  type="text"
                  className="ws-settings-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin || generalLoading}
                  placeholder="Workspace name"
                />
              </div>

              <div className="ws-settings-field">
                <label className="ws-settings-label" htmlFor="ws-description">
                  Description
                </label>
                <textarea
                  id="ws-description"
                  className="ws-settings-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!isAdmin || generalLoading}
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>

              {generalError && (
                <div className="ws-settings-error">{generalError}</div>
              )}

              {generalSuccess && (
                <div className="ws-settings-success">Changes saved</div>
              )}

              {isAdmin && (
                <div className="ws-settings-actions">
                  <button
                    className="ws-settings-save-btn"
                    onClick={handleSaveGeneral}
                    disabled={generalLoading}
                  >
                    {generalLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}

              {!isAdmin && (
                <div className="ws-settings-readonly-notice">
                  You need admin or owner role to edit workspace settings.
                </div>
              )}
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="ws-settings-members">
              {membersError && (
                <div className="ws-settings-error">{membersError}</div>
              )}

              {membersLoading ? (
                <div className="ws-settings-loading">Loading members...</div>
              ) : members.length === 0 ? (
                <div className="ws-settings-empty">No members found</div>
              ) : (
                <ul className="ws-settings-member-list">
                  {members.map((member) => {
                    const isCurrentUser = member.userId === currentUserId;
                    const isMemberOwner = member.role === 'owner';
                    const canModify = isAdmin && !isMemberOwner && !isCurrentUser;
                    const canAssignAdmin = isOwner && !isMemberOwner && !isCurrentUser;
                    const isPending =
                      pendingAction === `role-${member.userId}` ||
                      pendingAction === `remove-${member.userId}`;

                    return (
                      <MemberRow
                        key={member.userId}
                        member={member}
                        isCurrentUser={isCurrentUser}
                        canModify={canModify}
                        canAssignAdmin={canAssignAdmin}
                        isPending={isPending}
                        onRoleChange={(role) => handleUpdateMemberRole(member.userId, role)}
                        onRemove={() => handleRemoveMember(member.userId)}
                      />
                    );
                  })}
                </ul>
              )}

              {!isAdmin && (
                <div className="ws-settings-readonly-notice">
                  You need admin or owner role to manage members.
                </div>
              )}
            </div>
          )}

          {/* Invites Tab */}
          {activeTab === 'invites' && isAdmin && (
            <InviteSection workspaceId={workspace.id} />
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="ws-settings-notifications">
              {notifError && (
                <div className="ws-settings-error">{notifError}</div>
              )}

              {notifSuccess && (
                <div className="ws-settings-success">Preferences saved</div>
              )}

              {notifLoading ? (
                <div className="ws-settings-loading">Loading preferences...</div>
              ) : (
                <>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
                    Configure how you receive notifications in this workspace.
                  </p>

                  {CHANNELS.map(channel => {
                    const channelOn = isChannelEnabled(channel);
                    const config = getChannelConfig(channel);

                    return (
                      <div key={channel} className="ws-settings-notif-channel">
                        <div className="ws-settings-notif-channel-header">
                          <label className="ws-settings-notif-toggle">
                            <input
                              type="checkbox"
                              checked={channelOn}
                              onChange={(e) => toggleChannelAll(channel, e.target.checked)}
                            />
                            <strong>{CHANNEL_LABELS[channel]}</strong>
                          </label>
                          {channel === 'in_app' && (
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>Always active</span>
                          )}
                        </div>

                        {/* Config fields for external channels */}
                        {channel === 'webhook' && channelOn && (
                          <div className="ws-settings-field" style={{ marginTop: 8 }}>
                            <label className="ws-settings-label" htmlFor="ws-notif-webhook-url">
                              Webhook URL (HTTPS)
                            </label>
                            <input
                              id="ws-notif-webhook-url"
                              type="url"
                              className="ws-settings-input"
                              placeholder="https://example.com/webhook"
                              value={(config?.url as string) ?? ''}
                              onChange={(e) => updateChannelConfig('webhook', 'url', e.target.value)}
                            />
                          </div>
                        )}

                        {channel === 'slack' && channelOn && (
                          <div className="ws-settings-field" style={{ marginTop: 8 }}>
                            <label className="ws-settings-label" htmlFor="ws-notif-slack-url">
                              Slack Incoming Webhook URL
                            </label>
                            <input
                              id="ws-notif-slack-url"
                              type="url"
                              className="ws-settings-input"
                              placeholder="https://hooks.slack.com/services/T00/B00/xxx"
                              value={(config?.webhookUrl as string) ?? ''}
                              onChange={(e) => updateChannelConfig('slack', 'webhookUrl', e.target.value)}
                            />
                          </div>
                        )}

                        {channel === 'email' && channelOn && (
                          <div className="ws-settings-field" style={{ marginTop: 8 }}>
                            <label className="ws-settings-label" htmlFor="ws-notif-email-addr">
                              Email Address
                            </label>
                            <input
                              id="ws-notif-email-addr"
                              type="email"
                              className="ws-settings-input"
                              placeholder="you@example.com"
                              value={(config?.email as string) ?? ''}
                              onChange={(e) => updateChannelConfig('email', 'email', e.target.value)}
                            />
                            <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>
                              Requires SMTP server configuration by your administrator.
                            </span>
                          </div>
                        )}

                        {/* Per-type toggles (for external channels only) */}
                        {channel !== 'in_app' && channelOn && (
                          <div className="ws-settings-notif-types">
                            {NOTIF_TYPES.map(notifType => (
                              <label key={notifType} className="ws-settings-notif-type-toggle">
                                <input
                                  type="checkbox"
                                  checked={isTypeEnabled(channel, notifType)}
                                  onChange={(e) => toggleType(channel, notifType, e.target.checked)}
                                />
                                <span>{TYPE_LABELS[notifType]}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="ws-settings-actions" style={{ marginTop: 16 }}>
                    <button
                      className="ws-settings-save-btn"
                      onClick={handleSaveNotifPrefs}
                      disabled={notifSaving || notifDraft.length === 0}
                    >
                      {notifSaving ? 'Saving...' : 'Save Preferences'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Embeds Tab (E7) */}
          {activeTab === 'embeds' && isAdmin && (
            <div className="ws-settings-embeds">
              {embedError && (
                <div className="ws-settings-error">{embedError}</div>
              )}

              {embedSuccess && (
                <div className="ws-settings-success">Embed whitelist saved</div>
              )}

              {embedLoading ? (
                <div className="ws-settings-loading">Loading embed whitelist...</div>
              ) : (
                <>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
                    Control which external domains can be embedded in Design Studio frames
                    via <code>&lt;kcl-embed&gt;</code> components.
                  </p>

                  {/* Default domains (read-only) */}
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>
                      Default Domains
                    </h4>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af' }}>
                      These are always allowed and cannot be removed.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {embedDefaults.map(d => (
                        <span
                          key={d}
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            fontSize: 12,
                            background: '#f3f4f6',
                            borderRadius: 4,
                            color: '#374151',
                          }}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Custom domains (editable) */}
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>
                      Custom Domains
                    </h4>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: '#9ca3af' }}>
                      Add additional domains your workspace needs to embed.
                    </p>

                    {embedCustom.length > 0 && (
                      <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
                        {embedCustom.map(d => (
                          <li
                            key={d}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 8px',
                              fontSize: 13,
                              borderBottom: '1px solid #f3f4f6',
                            }}
                          >
                            <span>{d}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEmbedDomain(d)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#ef4444',
                                fontSize: 13,
                                padding: '2px 6px',
                              }}
                              aria-label={`Remove ${d}`}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        className="ws-settings-input"
                        placeholder="example.com"
                        value={embedNewDomain}
                        onChange={(e) => { setEmbedNewDomain(e.target.value); setEmbedError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmbedDomain(); } }}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="ws-settings-save-btn"
                        onClick={handleAddEmbedDomain}
                        disabled={!embedNewDomain.trim()}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="ws-settings-actions">
                    <button
                      className="ws-settings-save-btn"
                      onClick={handleSaveEmbedWhitelist}
                      disabled={embedSaving}
                    >
                      {embedSaving ? 'Saving...' : 'Save Whitelist'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI Settings Tab */}
          {activeTab === 'ai' && isAdmin && (
            <div className="ws-settings-ai">
              {aiError && (
                <div className="ws-settings-error">{aiError}</div>
              )}

              {aiSuccess && (
                <div className="ws-settings-success">AI settings saved</div>
              )}

              {aiLoading ? (
                <div className="ws-settings-loading">Loading AI settings...</div>
              ) : (
                <>
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
                    Configure the AI provider and model used for Design Studio generation.
                    Leave blank to use server defaults
                    {aiSettings?.serverDefaults.provider && (
                      <> ({aiSettings.serverDefaults.provider}/{aiSettings.serverDefaults.model})</>
                    )}.
                  </p>

                  {/* Provider dropdown */}
                  <div className="ws-settings-field">
                    <label className="ws-settings-label" htmlFor="ws-ai-provider">
                      AI Provider
                    </label>
                    <select
                      id="ws-ai-provider"
                      className="ws-settings-input ws-ai-select"
                      value={aiProvider}
                      onChange={(e) => {
                        setAiProvider(e.target.value);
                        setAiModel('');
                      }}
                      disabled={aiSaving}
                    >
                      <option value="">
                        Server Default{aiSettings?.serverDefaults.provider ? ` (${aiSettings.serverDefaults.provider})` : ''}
                      </option>
                      {aiSettings?.availableProviders.map(p => (
                        <option key={p.provider} value={p.provider}>
                          {p.provider.charAt(0).toUpperCase() + p.provider.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Model dropdown */}
                  <div className="ws-settings-field">
                    <label className="ws-settings-label" htmlFor="ws-ai-model">
                      Model
                    </label>
                    <select
                      id="ws-ai-model"
                      className="ws-settings-input ws-ai-select"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      disabled={aiSaving}
                    >
                      <option value="">
                        Provider Default{aiProviderCatalog?.defaultModel ? ` (${aiProviderCatalog.defaultModel})` : ''}
                      </option>
                      {aiModelOptions.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* API Key (BYOK) */}
                  <div className="ws-settings-field">
                    <label className="ws-settings-label" htmlFor="ws-ai-apikey">
                      API Key (BYOK)
                      {aiSettings?.hasApiKey && (
                        <span className="ws-ai-key-badge">Saved</span>
                      )}
                    </label>
                    <input
                      id="ws-ai-apikey"
                      type="password"
                      className="ws-settings-input"
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      disabled={aiSaving}
                      placeholder={aiSettings?.hasApiKey ? 'Enter new key to replace...' : 'sk-...'}
                      autoComplete="off"
                    />
                    <span style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, display: 'block' }}>
                      Optional. Provide your own API key to use instead of the server key.
                      Keys are encrypted at rest.
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="ws-settings-actions" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="ws-ai-reset-btn"
                      onClick={handleResetAiSettings}
                      disabled={aiSaving}
                    >
                      Reset to Defaults
                    </button>
                    <button
                      className="ws-settings-save-btn"
                      onClick={handleSaveAiSettings}
                      disabled={aiSaving}
                    >
                      {aiSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Danger Zone Tab */}
          {activeTab === 'danger' && isOwner && (
            <div className="ws-settings-danger">
              <div className="ws-settings-danger-box">
                <h3 className="ws-settings-danger-title">Delete Workspace</h3>
                <p className="ws-settings-danger-description">
                  Once you delete a workspace, there is no going back. This will permanently
                  delete the workspace and remove all members. Documents will remain but
                  will no longer be associated with this workspace.
                </p>

                <div className="ws-settings-field">
                  <label className="ws-settings-label" htmlFor="ws-delete-confirm">
                    Type <strong>{workspace.name}</strong> to confirm
                  </label>
                  <input
                    id="ws-delete-confirm"
                    type="text"
                    className="ws-settings-input ws-settings-input-danger"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    disabled={deleteLoading}
                    placeholder="Workspace name"
                  />
                </div>

                {deleteError && (
                  <div className="ws-settings-error">{deleteError}</div>
                )}

                <button
                  className="ws-settings-delete-btn"
                  onClick={handleDeleteWorkspace}
                  disabled={deleteLoading || deleteConfirm !== workspace.name}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete This Workspace'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="ws-settings-footer">
          <button className="ws-settings-done-btn" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

export default WorkspaceSettingsModal;
