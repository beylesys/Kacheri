// src/components/workspace/WorkspaceSettingsModal.tsx
// Modal for workspace settings: General (name/description), Members, Invites, Danger Zone

import React, { useState, useEffect, useCallback } from 'react';
import { workspaceApi } from '../../workspace/api';
import type { Workspace, WorkspaceMember, WorkspaceRole } from '../../workspace/types';
import { MemberRow } from './MemberRow';
import { InviteSection } from './InviteSection';
import './workspaceSettings.css';

type Tab = 'general' | 'members' | 'invites' | 'danger';

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
        <nav className="ws-settings-tabs">
          <button
            className={`ws-settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`ws-settings-tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Members
          </button>
          {isAdmin && (
            <button
              className={`ws-settings-tab ${activeTab === 'invites' ? 'active' : ''}`}
              onClick={() => setActiveTab('invites')}
            >
              Invites
            </button>
          )}
          {isOwner && (
            <button
              className={`ws-settings-tab ws-settings-tab-danger ${activeTab === 'danger' ? 'active' : ''}`}
              onClick={() => setActiveTab('danger')}
            >
              Danger Zone
            </button>
          )}
        </nav>

        {/* Tab content */}
        <div className="ws-settings-content">
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
