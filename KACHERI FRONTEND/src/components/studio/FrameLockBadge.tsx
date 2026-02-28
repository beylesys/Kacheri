// src/components/studio/FrameLockBadge.tsx
// E8 — Frame lock indicator component with two variants:
// 1. Thumbnail badge: small lock icon on frame rail thumbnails
// 2. Viewport overlay: full overlay when another user holds the lock
import React from 'react';

function initials(name?: string) {
  if (!name) return '?';
  return name.split(/\s+/).map(s => s[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
}

// ── Thumbnail Badge ──

export interface FrameLockThumbnailProps {
  displayName?: string;
}

export const FrameLockThumbnail: React.FC<FrameLockThumbnailProps> = ({ displayName }) => (
  <div className="frame-lock-badge" title={`Locked by ${displayName ?? 'another user'}`}>
    <span className="frame-lock-badge-icon">&#128274;</span>
    <span className="frame-lock-badge-user">{initials(displayName)}</span>
  </div>
);

// ── Viewport Overlay ──

export interface FrameLockOverlayProps {
  displayName?: string;
  onRequestAccess?: () => void;
}

export const FrameLockOverlay: React.FC<FrameLockOverlayProps> = ({ displayName, onRequestAccess }) => (
  <div className="frame-lock-overlay">
    <div className="frame-lock-overlay-content">
      <span className="frame-lock-overlay-icon">&#128274;</span>
      <span className="frame-lock-overlay-text">
        Locked by {displayName ?? 'another user'}
      </span>
      {onRequestAccess && (
        <button className="frame-lock-overlay-btn" onClick={onRequestAccess}>
          Request access
        </button>
      )}
    </div>
  </div>
);
