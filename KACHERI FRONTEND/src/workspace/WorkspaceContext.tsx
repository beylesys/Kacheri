/**
 * Workspace Context
 *
 * Provides workspace state management across the app.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { workspaceApi } from './api';
import type { Workspace } from './types';

interface WorkspaceContextValue {
  // Current workspace
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;

  // All user workspaces
  workspaces: Workspace[];
  refreshWorkspaces: () => Promise<void>;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Workspace ID for API headers
  workspaceId: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// Must match the key used by api.ts workspaceHeaders()
const STORAGE_KEY = 'workspaceId';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async (): Promise<void> => {
    try {
      const list = await workspaceApi.list();
      setWorkspaces(list);
    } catch (err) {
      console.error('[workspace] Failed to refresh workspaces:', err);
    }
  }, []);

  const setCurrentWorkspace = useCallback((workspace: Workspace | null) => {
    setCurrentWorkspaceState(workspace);
    if (workspace) {
      localStorage.setItem(STORAGE_KEY, workspace.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Initialize workspace on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch all workspaces
        const list = await workspaceApi.list();
        if (!mounted) return;
        setWorkspaces(list);

        // Try to restore previous workspace
        const savedId = localStorage.getItem(STORAGE_KEY);
        let workspace: Workspace | null = null;

        if (savedId) {
          workspace = list.find((w) => w.id === savedId) || null;
        }

        // If no saved or not found, get/create default
        if (!workspace) {
          workspace = await workspaceApi.getDefault();
          if (!mounted) return;

          // Refresh list to include the new workspace if created
          if (!list.find((w) => w.id === workspace!.id)) {
            const updatedList = await workspaceApi.list();
            if (!mounted) return;
            setWorkspaces(updatedList);
          }
        }

        setCurrentWorkspaceState(workspace);
        localStorage.setItem(STORAGE_KEY, workspace.id);
      } catch (err) {
        console.error('[workspace] Init failed:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load workspace');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const value: WorkspaceContextValue = {
    currentWorkspace,
    setCurrentWorkspace,
    workspaces,
    refreshWorkspaces,
    isLoading,
    error,
    workspaceId: currentWorkspace?.id ?? null,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
