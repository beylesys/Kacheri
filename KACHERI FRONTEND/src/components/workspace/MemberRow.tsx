// src/components/workspace/MemberRow.tsx
// Individual member row for the workspace settings member list

import React from 'react';
import type { WorkspaceMember, WorkspaceRole } from '../../workspace/types';
import './workspaceSettings.css';

const WORKSPACE_ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor', 'viewer'];

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export interface MemberRowProps {
  member: WorkspaceMember;
  isCurrentUser: boolean;
  canModify: boolean;
  canAssignAdmin: boolean;
  isPending: boolean;
  onRoleChange: (role: WorkspaceRole) => void;
  onRemove: () => void;
}

export function MemberRow({
  member,
  isCurrentUser,
  canModify,
  canAssignAdmin,
  isPending,
  onRoleChange,
  onRemove,
}: MemberRowProps) {
  const isMemberOwner = member.role === 'owner';

  // Build available roles based on permissions
  const availableRoles = WORKSPACE_ROLES.filter((role) => {
    if (role === 'owner') return false; // Can't assign owner
    if (role === 'admin' && !canAssignAdmin) return false;
    return true;
  });

  return (
    <li className="ws-member-row">
      <div className="ws-member-info">
        <span className="ws-member-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M20 21a8 8 0 1 0-16 0" />
          </svg>
        </span>
        <span className="ws-member-id">
          {member.userId}
          {isCurrentUser && (
            <span className="ws-member-you-badge">(you)</span>
          )}
        </span>
      </div>

      <div className="ws-member-actions">
        {canModify && !isMemberOwner ? (
          <select
            className="ws-member-role-select"
            value={member.role}
            onChange={(e) => onRoleChange(e.target.value as WorkspaceRole)}
            disabled={isPending}
          >
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        ) : (
          <span className={`ws-member-role-badge role-${member.role}`}>
            {ROLE_LABELS[member.role]}
          </span>
        )}

        {canModify && !isMemberOwner && (
          <button
            className="ws-member-remove-btn"
            onClick={onRemove}
            disabled={isPending}
            title="Remove member"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

export default MemberRow;
