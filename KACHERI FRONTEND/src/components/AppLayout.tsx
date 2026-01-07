// src/components/AppLayout.tsx
// Layout wrapper that provides shared UI elements across protected pages.

import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace';
import { ChatWidget } from './chat/ChatWidget';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * AppLayout wraps protected page content and renders shared UI like the ChatWidget.
 * Only renders ChatWidget when user is authenticated and has a workspace selected.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated, user } = useAuth();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();

  // Determine if we should show the chat widget
  const showChat = isAuthenticated && workspaceId && !workspaceLoading;

  return (
    <>
      {children}
      {showChat && (
        <ChatWidget
          workspaceId={workspaceId}
          currentUserId={user?.id ?? 'anonymous'}
        />
      )}
    </>
  );
}
