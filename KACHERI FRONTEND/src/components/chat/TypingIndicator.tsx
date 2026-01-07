// src/components/chat/TypingIndicator.tsx
// Shows who is currently typing in the chat.

import React from 'react';
import type { TypingUser } from '../../hooks/useWorkspaceSocket';
import './chatWidget.css';

type Props = {
  typingUsers: TypingUser[];
};

function getDisplayName(user: TypingUser): string {
  if (user.displayName) return user.displayName;
  // Extract name from userId (e.g., "user_alice" -> "alice")
  return user.userId.replace(/^user_/, '');
}

export function TypingIndicator({ typingUsers }: Props) {
  if (typingUsers.length === 0) {
    return null;
  }

  const names = typingUsers.map(getDisplayName);
  let text: string;

  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else if (names.length === 3) {
    text = `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  } else {
    text = `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing`;
  }

  return (
    <div className="typing-indicator">
      <span className="typing-indicator-text">{text}</span>
      <span className="typing-indicator-dots">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  );
}
