// KACHERI FRONTEND/src/components/MentionInput.tsx
// Textarea with @mention autocomplete for comments

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import './mentionInput.css';

export type MentionMember = {
  userId: string;
  displayName?: string;
};

type MentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  mentions: string[];
  onMentionsChange: (mentions: string[]) => void;
  workspaceMembers: MentionMember[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
};

export default function MentionInput({
  value,
  onChange,
  mentions,
  onMentionsChange,
  workspaceMembers,
  placeholder = 'Write a comment...',
  rows = 2,
  autoFocus = false,
  className = '',
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const [showPopup, setShowPopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerPosition, setTriggerPosition] = useState(0);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery) return workspaceMembers.slice(0, 8);
    const q = searchQuery.toLowerCase();
    return workspaceMembers
      .filter(
        (m) =>
          m.userId.toLowerCase().includes(q) ||
          m.displayName?.toLowerCase().includes(q)
      )
      .slice(0, 8);
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
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopup]);

  // Detect @ trigger on input change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.substring(0, cursorPos);

    // Find @ that starts a mention (preceded by space, newline, or start of string)
    const atMatch = textBeforeCursor.match(/(?:^|[\s])@(\w*)$/);

    if (atMatch) {
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
      onMentionsChange(mentionsInText);
    }
  };

  // Insert selected mention
  const insertMention = useCallback(
    (member: MentionMember) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBeforeTrigger = value.substring(0, triggerPosition);
      const textAfterCursor = value.substring(cursorPos);

      // Insert @userId with space after
      const mentionText = `@${member.userId} `;
      const newValue = textBeforeTrigger + mentionText + textAfterCursor;

      onChange(newValue);

      // Add to mentions array if not already present
      if (!mentions.includes(member.userId)) {
        onMentionsChange([...mentions, member.userId]);
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
    [value, triggerPosition, mentions, onChange, onMentionsChange]
  );

  // Handle keyboard navigation in popup
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showPopup || filteredMembers.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredMembers.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredMembers.length - 1
        );
        break;

      case 'Enter':
        if (showPopup && filteredMembers[selectedIndex]) {
          e.preventDefault();
          insertMention(filteredMembers[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setShowPopup(false);
        break;

      case 'Tab':
        if (showPopup && filteredMembers[selectedIndex]) {
          e.preventDefault();
          insertMention(filteredMembers[selectedIndex]);
        }
        break;
    }
  };

  return (
    <div className="mention-input-wrapper">
      <textarea
        ref={textareaRef}
        className={`mention-textarea ${className}`}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
      />

      {showPopup && (
        <div ref={popupRef} className="mention-popup">
          {filteredMembers.length > 0 ? (
            filteredMembers.map((member, index) => (
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
            ))
          ) : (
            <div className="mention-empty">No members found</div>
          )}
        </div>
      )}
    </div>
  );
}
