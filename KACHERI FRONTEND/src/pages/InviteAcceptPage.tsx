// src/pages/InviteAcceptPage.tsx
// Page for accepting workspace invites.

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invitesApi, type InviteInfo } from '../api/invites';
import './InviteAcceptPage.css';

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Check if user is logged in
  const isLoggedIn = Boolean(
    localStorage.getItem('accessToken') || localStorage.getItem('devUser')
  );

  // Fetch invite info
  useEffect(() => {
    if (!token) {
      setError('Invalid invite link');
      setLoading(false);
      return;
    }

    invitesApi.getByToken(token)
      .then((info) => {
        setInviteInfo(info);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load invite');
        setLoading(false);
      });
  }, [token]);

  // Handle accept
  const handleAccept = useCallback(async () => {
    if (!token) return;

    setAccepting(true);
    setError(null);

    try {
      const result = await invitesApi.accept(token);
      if (result.success && result.workspaceId) {
        // Navigate to workspace
        navigate(`/workspaces/${result.workspaceId}`);
      } else {
        setError(result.error ?? 'Failed to accept invite');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  }, [token, navigate]);

  // Loading state
  if (loading) {
    return (
      <div className="invite-accept-page">
        <div className="invite-accept-card">
          <div className="invite-accept-loading">
            <div className="invite-spinner" />
            <p>Loading invite...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !inviteInfo) {
    return (
      <div className="invite-accept-page">
        <div className="invite-accept-card">
          <div className="invite-accept-error">
            <div className="invite-error-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2>Invalid or Expired Invite</h2>
            <p>{error}</p>
            <button className="invite-home-btn" onClick={() => navigate('/')}>
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Invalid/expired invite
  if (inviteInfo && !inviteInfo.isValid) {
    return (
      <div className="invite-accept-page">
        <div className="invite-accept-card">
          <div className="invite-accept-error">
            <div className="invite-error-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <h2>
              {inviteInfo.status === 'expired' ? 'Invite Expired' :
               inviteInfo.status === 'accepted' ? 'Invite Already Used' :
               inviteInfo.status === 'revoked' ? 'Invite Revoked' : 'Invalid Invite'}
            </h2>
            <p>
              {inviteInfo.status === 'expired'
                ? 'This invite link has expired. Please ask the workspace admin to send a new invite.'
                : inviteInfo.status === 'accepted'
                ? 'This invite has already been used.'
                : inviteInfo.status === 'revoked'
                ? 'This invite has been revoked by the workspace admin.'
                : 'This invite is no longer valid.'}
            </p>
            <button className="invite-home-btn" onClick={() => navigate('/')}>
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Valid invite - show accept UI
  return (
    <div className="invite-accept-page">
      <div className="invite-accept-card">
        <div className="invite-accept-content">
          <div className="invite-workspace-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>

          <h1 className="invite-accept-title">
            You're invited to join
          </h1>

          <div className="invite-workspace-name">
            {inviteInfo?.workspaceName}
          </div>

          <div className="invite-details">
            <div className="invite-detail-row">
              <span className="invite-detail-label">Invited by</span>
              <span className="invite-detail-value">{inviteInfo?.invitedBy}</span>
            </div>
            <div className="invite-detail-row">
              <span className="invite-detail-label">Your role</span>
              <span className={`invite-role-tag invite-role-${inviteInfo?.role}`}>
                {inviteInfo?.role}
              </span>
            </div>
            <div className="invite-detail-row">
              <span className="invite-detail-label">Invite sent to</span>
              <span className="invite-detail-value">{inviteInfo?.invitedEmail}</span>
            </div>
          </div>

          {error && (
            <div className="invite-accept-error-msg">{error}</div>
          )}

          {!isLoggedIn ? (
            <div className="invite-login-prompt">
              <p>Please log in or create an account to accept this invite.</p>
              <button
                className="invite-login-btn"
                onClick={() => navigate(`/login?redirect=/invite/${token}`)}
              >
                Log In
              </button>
              <button
                className="invite-register-btn"
                onClick={() => navigate(`/register?redirect=/invite/${token}`)}
              >
                Create Account
              </button>
            </div>
          ) : (
            <button
              className="invite-accept-btn"
              onClick={handleAccept}
              disabled={accepting}
            >
              {accepting ? 'Joining...' : 'Accept Invite'}
            </button>
          )}

          <button
            className="invite-decline-btn"
            onClick={() => navigate('/')}
            disabled={accepting}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
