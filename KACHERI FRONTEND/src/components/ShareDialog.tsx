// KACHERI FRONTEND/src/components/ShareDialog.tsx
// Share Dialog for document-level permission management

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { docPermissionsApi, type DocPermission, type DocRole, type WorkspaceAccessLevel } from '../api/docPermissions';
import { workspacesApi, type WorkspaceMember } from '../api/workspaces';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './shareDialog.css';

const DOC_ROLES: DocRole[] = ['owner', 'editor', 'commenter', 'viewer'];

const ROLE_LABELS: Record<DocRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

// Labels for workspace access dropdown
const WORKSPACE_ACCESS_LABELS: Record<string, string> = {
  default: 'Use workspace role',
  none: 'No access',
  viewer: 'Can view',
  commenter: 'Can comment',
  editor: 'Can edit',
};

export interface ShareDialogProps {
  open: boolean;
  docId: string;
  docTitle: string;
  currentUserId: string;
  workspaceId?: string | null;  // Show workspace access toggle if doc is in a workspace
  onClose: () => void;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  docId,
  docTitle,
  currentUserId,
  workspaceId,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  const [permissions, setPermissions] = useState<DocPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<DocRole>('viewer');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Workspace access state
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccessLevel>(null);
  const [workspaceAccessPending, setWorkspaceAccessPending] = useState(false);

  // Workspace members state (for autocomplete)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);

  // Fetch permissions when dialog opens
  useEffect(() => {
    if (open) {
      loadPermissions();
    }
  }, [open, docId]);

  // Fetch workspace members when dialog opens (if doc is in a workspace)
  useEffect(() => {
    if (open && workspaceId) {
      loadWorkspaceMembers(workspaceId);
    } else {
      setWorkspaceMembers([]);
    }
  }, [open, workspaceId]);

  async function loadWorkspaceMembers(wsId: string) {
    try {
      const members = await workspacesApi.listMembers(wsId);
      setWorkspaceMembers(members);
    } catch {
      // Non-fatal: autocomplete just won't work
      setWorkspaceMembers([]);
    }
  }

  // Compute available members for autocomplete (exclude users who already have permissions)
  const availableMembers = useMemo(() => {
    return workspaceMembers.filter(
      (m) => !permissions.some((p) => p.userId === m.userId)
    );
  }, [workspaceMembers, permissions]);

  async function loadPermissions() {
    setLoading(true);
    setError(null);
    try {
      const data = await docPermissionsApi.list(docId);
      setPermissions(data.permissions);
      // Load workspace access if available (only returned to owners)
      if (data.workspaceAccess !== undefined) {
        setWorkspaceAccess(data.workspaceAccess);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddUser() {
    const userId = newUserId.trim();
    if (!userId) return;

    setPendingAction('add');
    setError(null);
    try {
      await docPermissionsApi.grant(docId, userId, newRole);
      setNewUserId('');
      setNewRole('viewer');
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to add user');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUpdateRole(userId: string, role: DocRole) {
    setPendingAction(`update-${userId}`);
    setError(null);
    try {
      await docPermissionsApi.update(docId, userId, role);
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveUser(userId: string) {
    setPendingAction(`remove-${userId}`);
    setError(null);
    try {
      await docPermissionsApi.revoke(docId, userId);
      await loadPermissions();
    } catch (err: any) {
      setError(err.message || 'Failed to remove user');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleWorkspaceAccessChange(newAccess: WorkspaceAccessLevel) {
    setWorkspaceAccessPending(true);
    setError(null);
    try {
      await docPermissionsApi.updateWorkspaceAccess(docId, newAccess);
      setWorkspaceAccess(newAccess);
    } catch (err: any) {
      setError(err.message || 'Failed to update workspace access');
    } finally {
      setWorkspaceAccessPending(false);
    }
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  const handleBackdropClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  // Find current user's role
  const currentUserPerm = permissions.find((p) => p.userId === currentUserId);
  const isOwner = currentUserPerm?.role === 'owner';

  // Truncate title for display
  const displayTitle =
    docTitle.length > 30 ? docTitle.substring(0, 30) + '...' : docTitle;

  return (
    <div
      ref={dialogRef}
      className="share-dialog-backdrop"
      onMouseDown={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div
        className="share-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="share-dialog-header">
          <h2 id="share-dialog-title" className="share-dialog-title">
            Share "{displayTitle}"
          </h2>
          <button
            className="share-dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Add user row */}
        <div className="share-dialog-add-row">
          <input
            className="share-dialog-input"
            type="text"
            list={workspaceId ? 'share-dialog-members-list' : undefined}
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            placeholder={workspaceId ? 'Search workspace members...' : 'Enter user ID...'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newUserId.trim()) {
                e.preventDefault();
                handleAddUser();
              }
            }}
          />
          {workspaceId && availableMembers.length > 0 && (
            <datalist id="share-dialog-members-list">
              {availableMembers.map((m) => (
                <option key={m.userId} value={m.userId} />
              ))}
            </datalist>
          )}
          <select
            className="share-dialog-select"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as DocRole)}
          >
            {DOC_ROLES.filter((r) => r !== 'owner' || isOwner).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <button
            className="share-dialog-add-btn"
            onClick={handleAddUser}
            disabled={!newUserId.trim() || pendingAction === 'add'}
          >
            {pendingAction === 'add' ? 'Adding...' : 'Add'}
          </button>
        </div>

        {/* Workspace-wide access toggle - only show if doc is in a workspace and user is owner */}
        {isOwner && workspaceId && (
          <div className="share-dialog-workspace-access">
            <label className="share-dialog-workspace-access-label">
              <span className="share-dialog-workspace-access-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              Anyone in workspace can:
            </label>
            <select
              className="share-dialog-workspace-access-select"
              value={workspaceAccess ?? 'default'}
              onChange={(e) => {
                const val = e.target.value;
                handleWorkspaceAccessChange(
                  val === 'default' ? null : (val as WorkspaceAccessLevel)
                );
              }}
              disabled={workspaceAccessPending}
            >
              <option value="default">{WORKSPACE_ACCESS_LABELS.default}</option>
              <option value="none">{WORKSPACE_ACCESS_LABELS.none}</option>
              <option value="viewer">{WORKSPACE_ACCESS_LABELS.viewer}</option>
              <option value="commenter">{WORKSPACE_ACCESS_LABELS.commenter}</option>
              <option value="editor">{WORKSPACE_ACCESS_LABELS.editor}</option>
            </select>
            {workspaceAccessPending && (
              <span className="share-dialog-workspace-access-spinner">Saving...</span>
            )}
          </div>
        )}

        {/* Error message */}
        {error && <div className="share-dialog-error">{error}</div>}

        {/* Permission list */}
        <div className="share-dialog-list-container">
          <h3 className="share-dialog-list-header">People with access</h3>
          {loading ? (
            <div className="share-dialog-loading">Loading...</div>
          ) : permissions.length === 0 ? (
            <div className="share-dialog-empty">No permissions found</div>
          ) : (
            <ul className="share-dialog-list">
              {permissions.map((perm) => {
                const isCurrentUser = perm.userId === currentUserId;
                const isPermOwner = perm.role === 'owner';
                const canModify = isOwner && !isPermOwner;
                const canRemove = isOwner && !isPermOwner;
                const canLeave = isCurrentUser && !isPermOwner;
                const isPending =
                  pendingAction === `update-${perm.userId}` ||
                  pendingAction === `remove-${perm.userId}`;

                return (
                  <li key={perm.userId} className="share-dialog-list-item">
                    <div className="share-dialog-user">
                      <span className="share-dialog-user-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M20 21a8 8 0 1 0-16 0" />
                        </svg>
                      </span>
                      <span className="share-dialog-user-id">
                        {perm.userId}
                        {isCurrentUser && (
                          <span className="share-dialog-you-badge">(you)</span>
                        )}
                      </span>
                    </div>
                    <div className="share-dialog-actions">
                      {canModify ? (
                        <select
                          className="share-dialog-role-select"
                          value={perm.role}
                          onChange={(e) =>
                            handleUpdateRole(perm.userId, e.target.value as DocRole)
                          }
                          disabled={isPending}
                        >
                          {DOC_ROLES.filter((r) => r !== 'owner').map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`share-dialog-role-badge role-${perm.role}`}>
                          {ROLE_LABELS[perm.role]}
                        </span>
                      )}
                      {canRemove && (
                        <button
                          className="share-dialog-remove-btn"
                          onClick={() => handleRemoveUser(perm.userId)}
                          disabled={isPending}
                          title="Remove access"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                      {canLeave && (
                        <button
                          className="share-dialog-remove-btn"
                          onClick={() => handleRemoveUser(perm.userId)}
                          disabled={isPending}
                          title="Leave document"
                        >
                          Leave
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="share-dialog-footer">
          <button className="share-dialog-done-btn" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ShareDialog;
