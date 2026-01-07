// src/components/workspace/InviteSection.tsx
// Invite management section for workspace settings.

import React, { useState, useEffect, useCallback } from 'react';
import { invitesApi, type Invite, type WorkspaceRole } from '../../api/invites';
import './workspaceSettings.css';

type Props = {
  workspaceId: string;
};

function formatTimeRemaining(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining < 0) return 'Expired';

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return 'Expires soon';
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function InviteSection({ workspaceId }: Props) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New invite form
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('editor');
  const [sending, setSending] = useState(false);

  // Copy link state
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Fetch invites
  const fetchInvites = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invitesApi.list(workspaceId, 'pending');
      setInvites(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  // Create invite
  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const invite = await invitesApi.create(workspaceId, trimmedEmail, role);
      setInvites(prev => [invite, ...prev]);
      setEmail('');
      setSuccess('Invite sent! Copy the link to share with the invitee.');

      // Clear success after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setSending(false);
    }
  };

  // Revoke invite
  const handleRevoke = async (inviteId: number) => {
    if (!confirm('Are you sure you want to revoke this invite?')) return;

    try {
      await invitesApi.revoke(workspaceId, inviteId);
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      setSuccess('Invite revoked');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite');
    }
  };

  // Copy invite link
  const handleCopyLink = async (invite: Invite) => {
    const link = invitesApi.getInviteLink(invite.inviteToken);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="invite-section">
      <div className="invite-form-container">
        <h4 className="invite-form-title">Invite new member</h4>
        <form className="invite-form" onSubmit={handleCreateInvite}>
          <div className="invite-form-row">
            <input
              type="email"
              className="settings-input invite-email-input"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
            />
            <select
              className="settings-select invite-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceRole)}
              disabled={sending}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="settings-button settings-button-primary invite-send-btn"
              disabled={sending || !email.trim()}
            >
              {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
        <p className="invite-form-hint">
          Invites expire after 7 days. The invitee will need to have an account to accept.
        </p>
      </div>

      {error && <div className="settings-error">{error}</div>}
      {success && <div className="settings-success">{success}</div>}

      <div className="invite-list-container">
        <h4 className="invite-list-title">Pending Invites</h4>

        {loading ? (
          <div className="invite-loading">Loading invites...</div>
        ) : invites.length === 0 ? (
          <div className="invite-empty">No pending invites</div>
        ) : (
          <div className="invite-list">
            {invites.map((invite) => (
              <div key={invite.id} className="invite-item">
                <div className="invite-item-info">
                  <div className="invite-item-email">{invite.invitedEmail}</div>
                  <div className="invite-item-meta">
                    <span className={`invite-role-badge invite-role-${invite.role}`}>
                      {invite.role}
                    </span>
                    <span className="invite-item-expiry">
                      {formatTimeRemaining(invite.expiresAt)}
                    </span>
                    <span className="invite-item-date">
                      Sent {formatDate(invite.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="invite-item-actions">
                  <button
                    className="settings-button settings-button-secondary invite-copy-btn"
                    onClick={() => handleCopyLink(invite)}
                    title="Copy invite link"
                  >
                    {copiedId === invite.id ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    className="settings-button settings-button-danger invite-revoke-btn"
                    onClick={() => handleRevoke(invite.id)}
                    title="Revoke invite"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
