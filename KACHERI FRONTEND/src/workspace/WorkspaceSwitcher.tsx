/**
 * Workspace Switcher Component
 *
 * Dropdown to switch between workspaces.
 */

import { useState } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { workspaceApi } from './api';
import type { Workspace } from './types';
import './workspace.css';

export function WorkspaceSwitcher() {
  const {
    currentWorkspace,
    workspaces,
    setCurrentWorkspace,
    refreshWorkspaces,
    isLoading,
  } = useWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <div className="workspace-switcher">
        <div className="workspace-switcher-loading">Loading...</div>
      </div>
    );
  }

  const handleSelect = (workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    setIsOpen(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    try {
      setCreating(true);
      const workspace = await workspaceApi.create({ name });
      await refreshWorkspaces();
      setCurrentWorkspace(workspace);
      setNewName('');
      setShowCreate(false);
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      alert('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return '👑';
      case 'admin':
        return '⚙️';
      case 'editor':
        return '✏️';
      case 'viewer':
        return '👁️';
      default:
        return '';
    }
  };

  return (
    <div className="workspace-switcher">
      <button
        className="workspace-switcher-button"
        onClick={() => setIsOpen(!isOpen)}
        title={currentWorkspace?.name || 'Select workspace'}
      >
        <span className="workspace-icon">📁</span>
        <span className="workspace-name">
          {currentWorkspace?.name || 'No workspace'}
        </span>
        <span className="workspace-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="workspace-dropdown">
          <div className="workspace-dropdown-header">Workspaces</div>

          <div className="workspace-list">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                className={`workspace-item ${
                  ws.id === currentWorkspace?.id ? 'active' : ''
                }`}
                onClick={() => handleSelect(ws)}
              >
                <span className="workspace-item-name">{ws.name}</span>
                <span className="workspace-item-role" title={ws.role}>
                  {roleIcon(ws.role)}
                </span>
              </button>
            ))}
          </div>

          {showCreate ? (
            <form className="workspace-create-form" onSubmit={handleCreate}>
              <input
                type="text"
                placeholder="Workspace name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                disabled={creating}
              />
              <div className="workspace-create-actions">
                <button type="submit" disabled={creating || !newName.trim()}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setNewName('');
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="workspace-create-button"
              onClick={() => setShowCreate(true)}
            >
              + New Workspace
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className="workspace-backdrop" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}
