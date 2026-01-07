// src/components/activity/WorkspaceNoteInput.tsx
import React, { useState } from 'react';

export const WorkspaceNoteInput: React.FC<{
  onSend: (text: string) => void;
  disabled?: boolean;
}> = ({ onSend, disabled }) => {
  const [text, setText] = useState('');

  function send() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        placeholder="Post a short note to this workspace…"
        style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6 }}
        disabled={disabled}
      />
      <button onClick={send} disabled={disabled || !text.trim()} style={{ padding: '6px 10px' }}>
        Send
      </button>
    </div>
  );
};
export default WorkspaceNoteInput;
