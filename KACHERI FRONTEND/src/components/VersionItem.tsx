// KACHERI FRONTEND/src/components/VersionItem.tsx
// Renders a version item with actions for compare, rename, restore, delete.

import { useState, useCallback, useRef, useEffect } from 'react';
import type { DocVersionMeta } from '../api/versions';
import { versionsApi } from '../api/versions';

type Props = {
  version: DocVersionMeta;
  allVersions: DocVersionMeta[];
  isLatest: boolean;
  currentUserId: string;
  onRefresh: () => void;
  onCompare: (versionId: number, compareWith: number) => void;
  onRestore: (version: DocVersionMeta) => void;
};

export function VersionItem({
  version,
  allVersions,
  isLatest,
  currentUserId: _currentUserId,
  onRefresh,
  onCompare,
  onRestore,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(version.name ?? '');
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus input when renaming starts
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCompareDropdown(false);
      }
    }
    if (showCompareDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCompareDropdown]);

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatAuthor = (authorId: string) => {
    return authorId.replace(/^user_/, '');
  };

  const handleStartRename = () => {
    setRenameValue(version.name ?? '');
    setRenaming(true);
  };

  const handleSaveRename = useCallback(async () => {
    const newName = renameValue.trim();
    // Allow empty name (makes it unnamed)
    if (newName === (version.name ?? '')) {
      setRenaming(false);
      return;
    }

    try {
      await versionsApi.rename(version.docId, version.id, newName);
      setRenaming(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to rename version:', err);
    }
  }, [renameValue, version.docId, version.id, version.name, onRefresh]);

  const handleCancelRename = () => {
    setRenaming(false);
    setRenameValue(version.name ?? '');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete version v${version.versionNumber}?`)) return;

    setDeleting(true);
    try {
      await versionsApi.delete(version.docId, version.id);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete version:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleCompareSelect = (compareWithId: number) => {
    setShowCompareDropdown(false);
    onCompare(version.id, compareWithId);
  };

  // Get other versions for comparison dropdown
  const otherVersions = allVersions.filter((v) => v.id !== version.id);

  return (
    <div className={`version-item ${isLatest ? 'latest' : ''}`}>
      {/* Header */}
      <div className="version-header">
        <span className="version-badge">v{version.versionNumber}</span>
        {isLatest && <span className="version-latest-badge">Latest</span>}
        <span className="version-time">{formatTime(version.createdAt)}</span>
      </div>

      {/* Name */}
      <div className="version-name">
        {renaming ? (
          <input
            ref={renameInputRef}
            type="text"
            className="version-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleSaveRename}
            placeholder="Version name"
          />
        ) : (
          <span
            className={`version-name-text ${!version.name ? 'unnamed' : ''}`}
          >
            {version.name || 'Unnamed version'}
          </span>
        )}
      </div>

      {/* Meta info */}
      <div className="version-meta">
        <span className="version-author">by {formatAuthor(version.createdBy)}</span>
        {version.metadata?.wordCount !== undefined && (
          <span className="version-word-count">
            {version.metadata.wordCount} words
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="version-actions">
        {/* Compare dropdown */}
        <div className="version-compare-wrapper" ref={dropdownRef}>
          <button
            className="version-action-btn"
            onClick={() => setShowCompareDropdown(!showCompareDropdown)}
            disabled={otherVersions.length === 0}
          >
            Compare
          </button>
          {showCompareDropdown && otherVersions.length > 0 && (
            <div className="version-compare-dropdown">
              <div className="version-compare-dropdown-header">Compare with:</div>
              {otherVersions.map((v) => (
                <button
                  key={v.id}
                  className="version-compare-option"
                  onClick={() => handleCompareSelect(v.id)}
                >
                  v{v.versionNumber}
                  {v.name && ` - ${v.name}`}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="version-action-btn" onClick={handleStartRename}>
          Rename
        </button>

        <button
          className="version-action-btn"
          onClick={() => onRestore(version)}
        >
          Restore
        </button>

        {!isLatest && (
          <button
            className="version-action-btn danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}
