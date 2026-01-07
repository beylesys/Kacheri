// src/components/presence/PresenceBadge.tsx
import React from 'react';

export interface Member {
  userId: string;
  displayName?: string;
  status: 'online' | 'idle' | 'offline';
}

function initials(name?: string) {
  if (!name) return '?';
  return name.split(/\s+/).map(s => s[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
}

export const PresenceBadge: React.FC<{ members: Member[] }> = ({ members }) => {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {members.map((m) => (
        <div key={m.userId} title={`${m.displayName ?? m.userId} — ${m.status}`}
             style={{
               width: 28, height: 28, borderRadius: 14,
               display: 'flex', alignItems: 'center', justifyContent: 'center',
               border: '1px solid #ccc', position: 'relative'
             }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{initials(m.displayName ?? m.userId)}</span>
          <span style={{
            position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 5,
            border: '1px solid white',
            background: m.status === 'online' ? '#2ecc71' : m.status === 'idle' ? '#f1c40f' : '#bdc3c7'
          }}/>
        </div>
      ))}
    </div>
  );
};
