// src/components/activity/WorkspaceActivityFeed.tsx
import React, { useMemo } from 'react';
import type { WsEvent } from '../../hooks/useWorkspaceSocket';

function format(e: WsEvent): string {
  if (e.type === 'ai_job') return `[${e.kind}] ${e.phase}${e.docId ? ` — doc ${e.docId}` : ''}`;
  if (e.type === 'proof_added') return `proof added — ${e.docId} (${e.sha256.slice(0, 8)}…)`;
  if (e.type === 'presence') return `${e.displayName ?? e.userId} is ${e.status}`;
  if (e.type === 'system') return `system: ${e.level} — ${e.message}`;
  return 'event';
}

export const WorkspaceActivityFeed: React.FC<{ events: WsEvent[] }> = ({ events }) => {
  const items = useMemo(() => events.slice(0, 30), [events]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((e, idx) => (
        <div key={idx} style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #eee', borderRadius: 6 }}>
          {format(e)}
        </div>
      ))}
    </div>
  );
};
