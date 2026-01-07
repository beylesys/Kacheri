// src/components/chat/ChatInput.tsx
// Chat input component with send button and @mention autocomplete.

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import './chatWidget.css';
import '../mentionInput.css';

export type ChatMember = {
  userId: string;
  displayName?: string;
};

type Props = {
  onSend: (content: string, mentions: string[], replyToId?: number) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  workspaceMembers?: ChatMember[];
  onTypingChange?: (isTyping: boolean) => void;
};

const TYPING_DEBOUNCE_MS = 500; // Stop typing indicator after 500ms idle

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  workspaceMembers = [],
  onTypingChange,
}: Props) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  // Mention autocomplete state
  const [showPopup, setShowPopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerPosition, setTriggerPosition] = useState(0);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery) return workspaceMembers.slice(0, 6);
    const q = searchQuery.toLowerCase();
    return workspaceMembers
      .filter(
        (m) =>
          m.userId.toLowerCase().includes(q) ||
          m.displayName?.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [workspaceMembers, searchQuery]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredMembers.length]);

  // Close popup on click outside
  useEffect(() => {
    if (!showPopup) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopup]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current != null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      // Send stop typing on unmount if was typing
      if (isTypingRef.current && onTypingChange) {
        onTypingChange(false);
      }
    };
  }, [onTypingChange]);

  // Send start/stop typing notifications with debounce
  const notifyTyping = useCallback(
    (typing: boolean) => {
      if (!onTypingChange) return;

      // Clear existing timeout
      if (typingTimeoutRef.current != null) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      if (typing) {
        // Send start typing only if not already typing
        if (!isTypingRef.current) {
          isTypingRef.current = true;
          onTypingChange(true);
        }

        // Set timeout to stop typing after debounce period
        typingTimeoutRef.current = window.setTimeout(() => {
          isTypingRef.current = false;
          onTypingChange(false);
          typingTimeoutRef.current = null;
        }, TYPING_DEBOUNCE_MS);
      } else {
        // Immediately stop typing
        if (isTypingRef.current) {
          isTypingRef.current = false;
          onTypingChange(false);
        }
      }
    },
    [onTypingChange]
  );

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || sending || disabled) return;

    // Stop typing indicator when sending
    notifyTyping(false);

    setSending(true);
    try {
      await onSend(content, mentions);
      setText('');
      setMentions([]);
      // Refocus input after sending
      inputRef.current?.focus();
    } catch (err) {
      console.error('[ChatInput] Failed to send:', err);
    } finally {
      setSending(false);
    }
  }, [text, mentions, sending, disabled, onSend, notifyTyping]);

  // Insert selected mention
  const insertMention = useCallback(
    (member: ChatMember) => {
      const textarea = inputRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBeforeTrigger = text.substring(0, triggerPosition);
      const textAfterCursor = text.substring(cursorPos);

      // Insert @userId with space after
      const mentionText = `@${member.userId} `;
      const newValue = textBeforeTrigger + mentionText + textAfterCursor;

      setText(newValue);

      // Add to mentions array if not already present
      if (!mentions.includes(member.userId)) {
        setMentions([...mentions, member.userId]);
      }

      setShowPopup(false);
      setSearchQuery('');

      // Focus and set cursor position after mention
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = textBeforeTrigger.length + mentionText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [text, triggerPosition, mentions]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle mention popup navigation
      if (showPopup && filteredMembers.length > 0) {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev < filteredMembers.length - 1 ? prev + 1 : 0
            );
            return;

          case 'ArrowUp':
            e.preventDefault();
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : filteredMembers.length - 1
            );
            return;

          case 'Tab':
            if (filteredMembers[selectedIndex]) {
              e.preventDefault();
              insertMention(filteredMembers[selectedIndex]);
            }
            return;

          case 'Escape':
            e.preventDefault();
            setShowPopup(false);
            return;
        }
      }

      // Send on Enter (without Shift) when popup is not showing or no match
      if (e.key === 'Enter' && !e.shiftKey) {
        if (showPopup && filteredMembers[selectedIndex]) {
          e.preventDefault();
          insertMention(filteredMembers[selectedIndex]);
        } else {
          e.preventDefault();
          handleSend();
        }
      }
    },
    [handleSend, showPopup, filteredMembers, selectedIndex, insertMention]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setText(newValue);

      // Notify typing when user is actively typing (has content)
      if (newValue.trim().length > 0) {
        notifyTyping(true);
      }

      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newValue.substring(0, cursorPos);

      // Find @ that starts a mention (preceded by space, newline, or start of string)
      const atMatch = textBeforeCursor.match(/(?:^|[\s])@(\w*)$/);

      if (atMatch && workspaceMembers.length > 0) {
        setShowPopup(true);
        setSearchQuery(atMatch[1]);
        setTriggerPosition(cursorPos - atMatch[1].length - 1); // Position of @
      } else {
        setShowPopup(false);
        setSearchQuery('');
      }

      // Sync mentions array with content (remove mentions no longer in text)
      const mentionsInText = mentions.filter((m) =>
        newValue.includes(`@${m}`)
      );
      if (mentionsInText.length !== mentions.length) {
        setMentions(mentionsInText);
      }
    },
    [workspaceMembers, mentions, notifyTyping]
  );

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          ref={inputRef}
          className="chat-input-textarea"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
        />

        {showPopup && filteredMembers.length > 0 && (
          <div ref={popupRef} className="chat-mention-popup">
            {filteredMembers.map((member, index) => (
              <button
                key={member.userId}
                type="button"
                className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => insertMention(member)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="mention-item-icon">@</span>
                <span className="mention-item-id">{member.userId}</span>
                {member.displayName && member.displayName !== member.userId && (
                  <span className="mention-item-name">{member.displayName}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className="chat-input-send"
        onClick={handleSend}
        disabled={disabled || sending || !text.trim()}
        title="Send message"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}
