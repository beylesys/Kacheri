// src/components/studio/PresenceIndicator.tsx
// E8 — Compact avatar row showing users viewing the canvas
import React from 'react';
import type { CanvasViewer } from '../../hooks/useCanvasCollaboration';

function initials(name?: string) {
  if (!name) return '?';
  return name.split(/\s+/).map(s => s[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
}

const STATUS_COLORS: Record<string, string> = {
  editing: '#2ecc71',
  viewing: '#3498db',
  left: '#bdc3c7',
};

const MAX_VISIBLE = 5;

export interface PresenceIndicatorProps {
  viewers: CanvasViewer[];
}

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({ viewers }) => {
  if (viewers.length === 0) return null;

  const visible = viewers.slice(0, MAX_VISIBLE);
  const overflow = viewers.length - MAX_VISIBLE;

  return (
    <div className="presence-indicator" title={`${viewers.length} collaborator${viewers.length === 1 ? '' : 's'}`}>
      {visible.map((v) => (
        <div
          key={v.userId}
          className="presence-avatar"
          title={`${v.displayName ?? v.userId} — ${v.action}${v.frameId ? ` (Frame)` : ''}`}
        >
          <span className="presence-avatar-text">{initials(v.displayName ?? v.userId)}</span>
          <span
            className="presence-avatar-dot"
            style={{ background: STATUS_COLORS[v.action] || STATUS_COLORS.viewing }}
          />
        </div>
      ))}
      {overflow > 0 && (
        <div className="presence-overflow" title={`${overflow} more`}>
          +{overflow}
        </div>
      )}
    </div>
  );
};
